import Database from 'better-sqlite3';
import { MigrationManager, coreMigrations } from '../src/migrations.js';
import { logger } from '../src/logger.js';

const databasePath = process.env.KNOWLEDGE_DB_PATH || './db/knowledge.db';

const db = new Database(databasePath);
const manager = new MigrationManager(db);

try {
  manager.runPendingMigrations(coreMigrations);
  logger.success('Database migrations are up to date', undefined, 'MigrationScript');
} catch (error) {
  logger.error('Migration run failed', error instanceof Error ? error : undefined, 'MigrationScript');
  process.exitCode = 1;
} finally {
  db.close();
}
