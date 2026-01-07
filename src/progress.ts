/**
 * Progress tracking and reporting system for long-running operations
 */

export interface ProgressOptions {
  total: number;
  label?: string;
  showBar?: boolean;
  showPercent?: boolean;
  showElapsed?: boolean;
  showETA?: boolean;
}

export interface ProgressStats {
  current: number;
  total: number;
  percent: number;
  elapsed: number;
  eta: number;
  rate: number;
  isComplete: boolean;
}

/**
 * Simple progress tracker for CLI operations
 */
export class ProgressTracker {
  private current = 0;
  private total: number;
  private label: string;
  private startTime = Date.now();
  private showBar: boolean;
  private showPercent: boolean;
  private showElapsed: boolean;
  private showETA: boolean;
  private lastUpdate = 0;
  private updateIntervalMs = 100;

  constructor(options: ProgressOptions) {
    this.total = options.total;
    this.label = options.label || 'Progress';
    this.showBar = options.showBar !== false;
    this.showPercent = options.showPercent !== false;
    this.showElapsed = options.showElapsed !== false;
    this.showETA = options.showETA !== false;
  }

  /**
   * Increment progress by 1
   */
  increment(amount: number = 1): void {
    this.current = Math.min(this.current + amount, this.total);
    this.updateDisplay();
  }

  /**
   * Set progress to specific value
   */
  set(value: number): void {
    this.current = Math.min(Math.max(value, 0), this.total);
    this.updateDisplay();
  }

  /**
   * Mark as complete
   */
  complete(): void {
    this.current = this.total;
    this.updateDisplay();
    console.log(''); // New line after progress bar
  }

  /**
   * Get current statistics
   */
  getStats(): ProgressStats {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const rate = this.current / elapsed;
    const remaining = this.total - this.current;
    const eta = rate > 0 ? remaining / rate : 0;

    return {
      current: this.current,
      total: this.total,
      percent: (this.current / this.total) * 100,
      elapsed: Math.round(elapsed),
      eta: Math.round(eta),
      rate: Math.round(rate * 10) / 10,
      isComplete: this.current >= this.total
    };
  }

  /**
   * Format time in seconds to human-readable format
   */
  private formatTime(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }

  /**
   * Create progress bar string
   */
  private createBar(width: number = 20): string {
    const filled = Math.round((this.current / this.total) * width);
    const empty = width - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }

  /**
   * Update and display progress
   */
  private updateDisplay(): void {
    const now = Date.now();
    if (now - this.lastUpdate < this.updateIntervalMs && this.current < this.total) {
      return;
    }
    this.lastUpdate = now;

    const stats = this.getStats();
    const parts: string[] = [];

    // Label
    parts.push(`${this.label}:`);

    // Progress bar
    if (this.showBar) {
      parts.push(this.createBar());
    }

    // Current/Total
    parts.push(`${this.current}/${this.total}`);

    // Percentage
    if (this.showPercent) {
      parts.push(`${Math.round(stats.percent)}%`);
    }

    // Elapsed time
    if (this.showElapsed) {
      parts.push(`${this.formatTime(stats.elapsed)}`);
    }

    // ETA
    if (this.showETA && stats.current > 0 && stats.current < stats.total) {
      parts.push(`ETA ${this.formatTime(stats.eta)}`);
    }

    // Rate
    if (stats.current > 0 && stats.current < stats.total) {
      parts.push(`${stats.rate} items/s`);
    }

    // Clear line and write
    process.stdout.write('\r' + ' '.repeat(120)); // Clear line
    process.stdout.write('\r' + parts.join(' '));
  }
}

/**
 * Multi-stage progress tracker for complex operations
 */
export class MultiStageProgress {
  private stages: Map<string, { total: number; current: number }> = new Map();
  private currentStage = '';
  private startTime = Date.now();

  /**
   * Add a new stage
   */
  addStage(name: string, total: number): void {
    this.stages.set(name, { total, current: 0 });
  }

  /**
   * Switch to a stage and optionally increment
   */
  stage(name: string, increment: number = 0): void {
    if (!this.stages.has(name)) {
      throw new Error(`Stage "${name}" not found`);
    }
    this.currentStage = name;
    if (increment > 0) {
      this.increment(increment);
    }
    this.display();
  }

  /**
   * Increment current stage
   */
  increment(amount: number = 1): void {
    if (!this.currentStage) return;
    const stage = this.stages.get(this.currentStage);
    if (stage) {
      stage.current = Math.min(stage.current + amount, stage.total);
    }
    this.display();
  }

  /**
   * Set current stage value
   */
  set(value: number): void {
    if (!this.currentStage) return;
    const stage = this.stages.get(this.currentStage);
    if (stage) {
      stage.current = Math.min(Math.max(value, 0), stage.total);
    }
    this.display();
  }

  /**
   * Mark all stages as complete
   */
  complete(): void {
    for (const stage of this.stages.values()) {
      stage.current = stage.total;
    }
    this.display();
    console.log('');
  }

  /**
   * Get progress stats
   */
  getStats() {
    let totalItems = 0;
    let completedItems = 0;

    for (const stage of this.stages.values()) {
      totalItems += stage.total;
      completedItems += stage.current;
    }

    const elapsed = (Date.now() - this.startTime) / 1000;
    const percent = (completedItems / totalItems) * 100;

    return {
      current: completedItems,
      total: totalItems,
      percent,
      elapsed: Math.round(elapsed),
      stageCount: this.stages.size,
      currentStage: this.currentStage
    };
  }

  /**
   * Display progress for all stages
   */
  private display(): void {
    console.clear();
    console.log('📊 Multi-Stage Progress\n');

    const stats = this.getStats();

    for (const [name, stage] of this.stages.entries()) {
      const percent = Math.round((stage.current / stage.total) * 100);
      const isActive = name === this.currentStage;
      const marker = isActive ? '▶' : ' ';

      const bar = '[' + 
        '█'.repeat(Math.round((stage.current / stage.total) * 20)) +
        '░'.repeat(20 - Math.round((stage.current / stage.total) * 20)) +
        ']';

      console.log(
        `${marker} ${name.padEnd(20)} ${bar} ${stage.current}/${stage.total} (${percent}%)`
      );
    }

    console.log(
      `\n📈 Overall: ${stats.current}/${stats.total} (${Math.round(stats.percent)}%) - ${Math.round(stats.elapsed)}s elapsed\n`
    );
  }
}

/**
 * Batch processor with progress tracking
 */
export class BatchProcessor<T, R> {
  private batchSize: number;
  private items: T[];
  private processor: (batch: T[]) => Promise<R[]>;
  private progress: ProgressTracker;

  constructor(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    batchSize: number = 100,
    label: string = 'Processing'
  ) {
    this.items = items;
    this.processor = processor;
    this.batchSize = Math.max(1, batchSize);
    this.progress = new ProgressTracker({
      total: items.length,
      label,
      showBar: true,
      showPercent: true,
      showElapsed: true,
      showETA: true
    });
  }

  /**
   * Process all items in batches
   */
  async process(): Promise<R[]> {
    const results: R[] = [];
    const totalBatches = Math.ceil(this.items.length / this.batchSize);

    for (let i = 0; i < totalBatches; i++) {
      const start = i * this.batchSize;
      const end = Math.min(start + this.batchSize, this.items.length);
      const batch = this.items.slice(start, end);

      try {
        const batchResults = await this.processor(batch);
        results.push(...batchResults);
        this.progress.increment(batch.length);
      } catch (error) {
        throw new Error(
          `Batch ${i + 1}/${totalBatches} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    this.progress.complete();
    return results;
  }

  /**
   * Get batch size
   */
  getBatchSize(): number {
    return this.batchSize;
  }

  /**
   * Get total item count
   */
  getItemCount(): number {
    return this.items.length;
  }

  /**
   * Get progress stats
   */
  getStats(): ProgressStats {
    return this.progress.getStats();
  }
}

/**
 * Spinner for indeterminate progress
 */
export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;
  private intervalId?: NodeJS.Timeout;
  private message: string;

  constructor(message: string = 'Loading...') {
    this.message = message;
  }

  /**
   * Start spinner
   */
  start(): void {
    if (this.intervalId) return;

    process.stdout.write(`${this.frames[0]} ${this.message}`);

    this.intervalId = setInterval(() => {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      process.stdout.write(`\r${this.frames[this.currentFrame]} ${this.message}`);
    }, 80);
  }

  /**
   * Stop spinner
   */
  stop(finalMessage?: string): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    process.stdout.write('\r' + ' '.repeat(this.message.length + 2) + '\r');
    if (finalMessage) {
      console.log(finalMessage);
    }
  }

  /**
   * Update message
   */
  update(message: string): void {
    this.message = message;
  }
}
