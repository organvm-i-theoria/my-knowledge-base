import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { logger } from '../src/logger.js';

const databasePath = process.env.KNOWLEDGE_DB_PATH || './db/knowledge.db';
const seedPath = process.env.SEED_FILE || './db/seeds/initial.sql';

const db = new Database(databasePath);

try {
  const seedSql = readFileSync(seedPath, 'utf-8');
  db.exec(seedSql);
  logger.success(`Seed data applied from ${seedPath}`, undefined, 'SeedScript');
} catch (error) {
  logger.error('Failed to seed database', error instanceof Error ? error : undefined, 'SeedScript');
  process.exitCode = 1;
} finally {
  db.close();
}
