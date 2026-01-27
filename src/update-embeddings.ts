/**
 * Incremental Embedding Updater - Generate embeddings only for new/changed units
 * Avoids regenerating all embeddings on each export, saving time and API costs
 */

import { Logger } from './logger.js';
import Database from 'better-sqlite3';
import { EmbeddingsService } from './embeddings-service.js';

const logger = new Logger({ context: 'update-embeddings' });

/**
 * IncrementalEmbeddingUpdater - Update embeddings incrementally
 */
export class IncrementalEmbeddingUpdater {
  private db: Database.Database;
  private embeddingsService: EmbeddingsService;

  constructor(dbPath: string = './db/knowledge.db', embeddingsService?: EmbeddingsService) {
    this.db = new Database(dbPath);
    this.embeddingsService = embeddingsService || new EmbeddingsService();
  }

  /**
   * Update pending embeddings (new units without embeddings)
   */
  async updatePendingEmbeddings(batchSize: number = 100): Promise<{ generated: number; failed: number }> {
    try {
      const pending = this.getPendingUnits(1000);

      if (pending.length === 0) {
        logger.info('No pending embeddings to generate');
        return { generated: 0, failed: 0 };
      }

      logger.info('Generating embeddings for ' + pending.length + ' units');

      let generated = 0;
      let failed = 0;

      // Process in batches
      for (let i = 0; i < pending.length; i += batchSize) {
        const batch = pending.slice(i, i + batchSize);
        const texts = batch.map(u => u.title + '\n\n' + u.content);

        try {
          const embeddings = await this.embeddingsService.generateEmbeddings(texts);

          for (let i = 0; i < batch.length; i++) {
            const unit = batch[i];
            const embedding = embeddings[i];
            if (embedding) {
              this.saveEmbedding(unit.id, embedding);
              generated++;
            } else {
              failed++;
            }
          }
        } catch (error) {
          logger.error('Batch embedding generation failed: ' + error);
          failed += batch.length;
        }

        // Log progress
        const progress = Math.min(i + batchSize, pending.length);
        logger.info('Progress: ' + progress + ' / ' + pending.length);
      }

      logger.info('Embedding generation complete: ' + generated + ' generated, ' + failed + ' failed');
      return { generated, failed };
    } catch (error) {
      logger.error('Failed to update pending embeddings: ' + error);
      return { generated: 0, failed: 0 };
    }
  }

  /**
   * Get pending units (status = 'pending')
   */
  private getPendingUnits(limit: number = 1000): Array<{ id: string; title: string; content: string }> {
    try {
      const stmt = this.db.prepare(`
        SELECT id, title, content FROM atomic_units
        WHERE embedding_status = 'pending' OR embedding_status IS NULL
        ORDER BY created DESC
        LIMIT ?
      `);

      return stmt.all(limit) as Array<{ id: string; title: string; content: string }>;
    } catch {
      return [];
    }
  }

  /**
   * Save embedding and update status
   */
  private saveEmbedding(unitId: string, embedding: number[]): void {
    try {
      const buf = Buffer.from(new Float32Array(embedding).buffer);

      const stmt = this.db.prepare(`
        UPDATE atomic_units
        SET
          embedding = ?,
          embedding_status = 'generated',
          embedding_generated_at = ?
        WHERE id = ?
      `);

      stmt.run(buf, new Date().toISOString(), unitId);
    } catch (error) {
      logger.error('Failed to save embedding: ' + error);
    }
  }

  /**
   * Get status of embeddings
   */
  getStatus(): {
    pending: number;
    generated: number;
    failed: number;
    total: number;
  } {
    try {
      const statusStmt = this.db.prepare(`
        SELECT embedding_status, COUNT(*) as count
        FROM atomic_units
        GROUP BY embedding_status
      `);

      const results = statusStmt.all() as Array<{ embedding_status: string; count: number }>;

      const status: Record<string, number> = {};
      let total = 0;

      for (const result of results) {
        status[result.embedding_status || 'null'] = result.count;
        total += result.count;
      }

      return {
        pending: status['pending'] || status['null'] || 0,
        generated: status['generated'] || 0,
        failed: status['failed'] || 0,
        total
      };
    } catch (error) {
      logger.error('Failed to get embedding status: ' + error);
      return { pending: 0, generated: 0, failed: 0, total: 0 };
    }
  }

  /**
   * Reset all embeddings (for re-generation)
   */
  resetAllEmbeddings(): number {
    try {
      const stmt = this.db.prepare(`
        UPDATE atomic_units
        SET
          embedding = NULL,
          embedding_status = 'pending',
          embedding_generated_at = NULL
      `);

      const result = stmt.run();
      const count = result.changes || 0;

      logger.info('Reset ' + count + ' embeddings to pending status');
      return count;
    } catch (error) {
      logger.error('Failed to reset embeddings: ' + error);
      return 0;
    }
  }
}

export async function updateEmbeddingsIncrementally(dbPath?: string, batchSize?: number): Promise<void> {
  const updater = new IncrementalEmbeddingUpdater(dbPath);
  const result = await updater.updatePendingEmbeddings(batchSize);
  logger.info('Embedding update complete: ' + result.generated + ' generated');
}
