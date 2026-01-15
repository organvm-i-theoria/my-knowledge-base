/**
 * Advanced batch processor with progress tracking, concurrency control, and resumability
 * Features: Progress bars, parallel workers, checkpointing, rate limiting
 */

import * as fs from 'fs';
import * as path from 'path';
import pLimit from 'p-limit';
import pRetry from 'p-retry';

export interface BatchConfig {
  concurrency: number;           // Parallel workers (default 3)
  delayMs: number;               // Delay between batches (default 200)
  retries: number;               // Retry failed items (default 2)
  checkpointInterval: number;    // Save progress every N items (default 50)
  progressBar: boolean;          // Show progress bar (default true)
  checkpointDir: string;         // Directory for checkpoint files (default .batch-checkpoints)
  skipCheckpoints?: boolean;     // Skip checkpoint persistence (useful for tests)
}

export interface BatchProgress {
  processed: number;
  total: number;
  failed: number;
  succeeded: number;
  startTime: number;
  lastCheckpoint: number;
}

export interface ProcessingResult<T> {
  item: T;
  result: any;
  success: boolean;
  error?: Error;
  retries: number;
}

/**
 * Advanced batch processor for handling large collections of items
 */
export class BatchProcessor {
  private config: BatchConfig;
  private checkpointFile: string;
  private progress: BatchProgress;

  constructor(checkpointDir: string = '.batch-checkpoints', config?: Partial<BatchConfig>) {
    const skipCheckpoints = config?.skipCheckpoints ?? process.env.NODE_ENV === 'test';

    this.config = {
      concurrency: 3,
      delayMs: 200,
      retries: 2,
      checkpointInterval: 50,
      progressBar: true,
      checkpointDir,
      skipCheckpoints,
      ...config,
    };

    // Ensure checkpoint directory exists
    if (!fs.existsSync(this.config.checkpointDir)) {
      fs.mkdirSync(this.config.checkpointDir, { recursive: true });
    }

    this.checkpointFile = path.join(this.config.checkpointDir, '.batch-progress.json');
    this.progress = {
      processed: 0,
      total: 0,
      failed: 0,
      succeeded: 0,
      startTime: 0,
      lastCheckpoint: 0,
    };
  }

  /**
   * Process items with progress tracking and error handling
   */
  async process<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>
  ): Promise<Map<number, ProcessingResult<T>>> {
    this.progress.total = items.length;
    this.progress.startTime = Date.now();
    this.progress.processed = 0;
    this.progress.failed = 0;
    this.progress.succeeded = 0;

    const results = new Map<number, ProcessingResult<T>>();
    const limit = pLimit(this.config.concurrency);

    // Create array of promises
    const promises = items.map((item, index) =>
      limit(async () => {
        try {
          const result = await pRetry(
            () => processor(item),
            {
              retries: this.config.retries,
              minTimeout: 100,
              maxTimeout: 1000,
            }
          );

          results.set(index, {
            item,
            result,
            success: true,
            retries: 0,
          });

          this.progress.succeeded++;
        } catch (error) {
          results.set(index, {
            item,
            result: null,
            success: false,
            error: error as Error,
            retries: this.config.retries,
          });

          this.progress.failed++;
        }

        this.progress.processed++;

        // Save checkpoint at intervals
        if (this.progress.processed % this.config.checkpointInterval === 0) {
          this.saveCheckpoint(results);
        }

        // Print progress
        this.printProgress();

        // Rate limiting delay
        await this.delay(this.config.delayMs);
      })
    );

    // Wait for all items to process
    await Promise.all(promises);

    // Final checkpoint
    this.saveCheckpoint(results);
    this.printFinalStats();

    // Clean up checkpoint file
    this.clearCheckpoint();

    return results;
  }

  /**
   * Process with initial state (for resuming)
   */
  async processWithState<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    initialResults?: Map<number, ProcessingResult<T>>
  ): Promise<Map<number, ProcessingResult<T>>> {
    const results = initialResults || new Map();
    const remaining = items
      .map((item, index) => ({ item, index }))
      .filter(({ index }) => !results.has(index));

    if (remaining.length === 0) {
      console.log('✅ All items already processed');
      return results;
    }

    console.log(`⏸️  Resuming: ${remaining.length}/${items.length} items remaining\n`);

    this.progress.total = items.length;
    this.progress.processed = results.size;
    this.progress.succeeded = Array.from(results.values()).filter((r) => r.success).length;
    this.progress.failed = Array.from(results.values()).filter((r) => !r.success).length;
    this.progress.startTime = Date.now();

    const limit = pLimit(this.config.concurrency);

    const promises = remaining.map(({ item, index }) =>
      limit(async () => {
        try {
          const result = await pRetry(
            () => processor(item),
            {
              retries: this.config.retries,
              minTimeout: 100,
              maxTimeout: 1000,
            }
          );

          results.set(index, {
            item,
            result,
            success: true,
            retries: 0,
          });

          this.progress.succeeded++;
        } catch (error) {
          results.set(index, {
            item,
            result: null,
            success: false,
            error: error as Error,
            retries: this.config.retries,
          });

          this.progress.failed++;
        }

        this.progress.processed++;

        if (this.progress.processed % this.config.checkpointInterval === 0) {
          this.saveCheckpoint(results);
        }

        this.printProgress();

        await this.delay(this.config.delayMs);
      })
    );

    await Promise.all(promises);

    this.saveCheckpoint(results);
    this.printFinalStats();
    this.clearCheckpoint();

    return results;
  }

  /**
   * Check if checkpoint exists
   */
  hasCheckpoint(): boolean {
    if (this.config.skipCheckpoints) return false;
    return fs.existsSync(this.checkpointFile);
  }

  /**
   * Load checkpoint from file
   */
  loadCheckpoint<T>(): {
    progress: BatchProgress;
    results: Map<number, ProcessingResult<T>>;
  } {
    if (this.config.skipCheckpoints) {
      return {
        progress: this.progress,
        results: new Map(),
      };
    }

    if (!this.hasCheckpoint()) {
      throw new Error('No checkpoint file found');
    }

    const data = JSON.parse(fs.readFileSync(this.checkpointFile, 'utf-8'));

    // Reconstruct Map from JSON
    const results = new Map(Object.entries(data.results).map(([key, value]) => [
      parseInt(key),
      value as ProcessingResult<T>,
    ]));

    return {
      progress: data.progress,
      results,
    };
  }

  /**
   * Save checkpoint to file
   */
  private saveCheckpoint<T>(results: Map<number, ProcessingResult<T>>): void {
    if (this.config.skipCheckpoints) return;

    try {
      const checkpoint = {
        progress: this.progress,
        results: Object.fromEntries(results),
      };

      fs.writeFileSync(this.checkpointFile, JSON.stringify(checkpoint, null, 2));
      this.progress.lastCheckpoint = Date.now();
    } catch (error) {
      console.error('Failed to save checkpoint:', error);
    }
  }

  /**
   * Clear checkpoint file
   */
  private clearCheckpoint(): void {
    if (this.config.skipCheckpoints) return;

    try {
      if (fs.existsSync(this.checkpointFile)) {
        fs.unlinkSync(this.checkpointFile);
      }
    } catch (error) {
      console.error('Failed to clear checkpoint:', error);
    }
  }

  /**
   * Print progress during processing
   */
  private printProgress(): void {
    if (!this.config.progressBar) return;

    const elapsed = Date.now() - this.progress.startTime;
    const rate = this.progress.processed / (elapsed / 1000);
    const remaining = this.progress.total - this.progress.processed;
    const eta = remaining > 0 ? Math.round(remaining / rate) : 0;

    const percentage = ((this.progress.processed / this.progress.total) * 100).toFixed(0);
    const bar = this.createProgressBar(this.progress.processed, this.progress.total);

    process.stdout.write(
      `\r[${bar}] ${percentage}% (${this.progress.processed}/${this.progress.total}) ` +
        `✓${this.progress.succeeded} ✗${this.progress.failed} ${rate.toFixed(1)}/s ETA ${eta}s`
    );
  }

  /**
   * Print final statistics
   */
  private printFinalStats(): void {
    const elapsed = Date.now() - this.progress.startTime;
    const rate = this.progress.processed / (elapsed / 1000);

    console.log('\n\n📊 Batch Processing Complete:');
    console.log(`  Total items: ${this.progress.total}`);
    console.log(`  Succeeded: ${this.progress.succeeded}`);
    console.log(`  Failed: ${this.progress.failed}`);
    console.log(`  Success rate: ${((this.progress.succeeded / this.progress.total) * 100).toFixed(1)}%`);
    console.log(`  Duration: ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`  Throughput: ${rate.toFixed(1)} items/sec`);
  }

  /**
   * Create ASCII progress bar
   */
  private createProgressBar(current: number, total: number): string {
    const width = 30;
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    if (!ms) {
      return Promise.resolve();
    }

    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current progress
   */
  getProgress(): BatchProgress {
    return { ...this.progress };
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    succeeded: number;
    failed: number;
    successRate: number;
    duration: number;
    throughput: number;
  } {
    const elapsed = Date.now() - this.progress.startTime;
    const throughput = this.progress.processed / (elapsed / 1000);

    return {
      total: this.progress.total,
      succeeded: this.progress.succeeded,
      failed: this.progress.failed,
      successRate: (this.progress.succeeded / this.progress.total) * 100,
      duration: elapsed,
      throughput,
    };
  }
}

/**
 * Utility function for batch processing with sensible defaults
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options?: Partial<BatchConfig>
): Promise<Map<number, ProcessingResult<T>>> {
  const bp = new BatchProcessor('.batch-checkpoints', options);

  // Check for checkpoint and resume if exists
  if (bp.hasCheckpoint()) {
    const { results } = bp.loadCheckpoint<T>();
    return await bp.processWithState(items, processor, results);
  }

  return await bp.process(items, processor);
}
