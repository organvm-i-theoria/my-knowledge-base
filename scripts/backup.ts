import Database from 'better-sqlite3';
import { BackupManager } from '../src/backup.js';
import { logger } from '../src/logger.js';

const databasePath = process.env.KNOWLEDGE_DB_PATH || './db/knowledge.db';
const backupDir = process.env.BACKUP_DIR || './backups';
const description = process.env.BACKUP_DESCRIPTION;
const encrypt = process.env.BACKUP_ENCRYPT === 'true';
const retainPlaintext = process.env.BACKUP_RETAIN_PLAINTEXT === 'true';

const db = new Database(databasePath);
const backupManager = new BackupManager(db, databasePath, backupDir);

try {
  const output = encrypt
    ? backupManager.createEncryptedBackup(description, retainPlaintext)
    : backupManager.createBackup(description);

  logger.success(`Backup complete: ${output}`);
} catch (error) {
  logger.error('Backup failed', error instanceof Error ? error : undefined, 'BackupScript');
  process.exitCode = 1;
} finally {
  db.close();
}
