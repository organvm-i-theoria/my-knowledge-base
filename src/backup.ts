/**
 * Database backup and restore functionality
 */

import { copyFileSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import { logger } from './logger.js';
import { decryptBuffer, encryptBuffer, normalizeKey } from './encryption.js';

export interface BackupMetadata {
  timestamp: Date;
  databaseSize: number;
  backupSize: number;
  version: string;
  description?: string;
  unitCount: number;
  conversationCount: number;
  encrypted?: boolean;
  encryption?: {
    cipher: string;
  };
}

export interface BackupInfo {
  name: string;
  path: string;
  metadata: BackupMetadata;
  isValid: boolean;
}

/**
 * Database backup manager
 */
export class BackupManager {
  private db: Database.Database;
  private backupDir: string;
  private databasePath: string;
  private encryptionKey: Buffer | null;

  constructor(
    db: Database.Database,
    databasePath: string,
    backupDir: string = './backups',
    encryptionKey?: string
  ) {
    this.db = db;
    this.databasePath = databasePath;
    this.backupDir = backupDir;
    this.encryptionKey = null;

    const rawKey = encryptionKey || process.env.BACKUP_ENCRYPTION_KEY;
    if (rawKey) {
      try {
        this.encryptionKey = normalizeKey(rawKey);
      } catch (error) {
        logger.warn(
          `Invalid backup encryption key: ${error instanceof Error ? error.message : String(error)}`,
          undefined,
          'BackupManager'
        );
      }
    }

    // Create backup directory if it doesn't exist
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
      logger.info(`Backup directory created: ${backupDir}`, undefined, 'BackupManager');
    }
  }

  /**
   * Get database statistics
   */
  private getDbStats(): {
    unitCount: number;
    conversationCount: number;
    size: number;
  } {
    try {
      const unitCount = (this.db.prepare('SELECT COUNT(*) as count FROM atomic_units').get() as { count: number }).count;
      const conversationCount = (this.db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number }).count;
      const size = this.getFileSize(this.databasePath);

      return { unitCount, conversationCount, size };
    } catch {
      return { unitCount: 0, conversationCount: 0, size: 0 };
    }
  }

  /**
   * Get file size in bytes
   */
  private getFileSize(filePath: string): number {
    try {
      const fs = require('fs');
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Create a backup
   */
  createBackup(description?: string): string {
    try {
      const timestamp = new Date();
      const backupName = `backup-${timestamp.getTime()}.db`;
      const backupPath = join(this.backupDir, backupName);

      logger.info(`Creating backup: ${backupName}`, undefined, 'BackupManager');

      // Copy database file
      copyFileSync(this.databasePath, backupPath);

      // Get stats and create metadata
      const stats = this.getDbStats();
      const backupSize = this.getFileSize(backupPath);

      const metadata: BackupMetadata = {
        timestamp,
        databaseSize: stats.size,
        backupSize,
        version: '1.0',
        description,
        unitCount: stats.unitCount,
        conversationCount: stats.conversationCount
      };

      // Save metadata
      const metadataPath = backupPath + '.json';
      writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      logger.success(`✅ Backup created: ${backupName}`);
      logger.info(
        `Backup details`,
        {
          size: `${(backupSize / 1024 / 1024).toFixed(2)} MB`,
          units: stats.unitCount,
          conversations: stats.conversationCount
        },
        'BackupManager'
      );

      return backupPath;
    } catch (error) {
      const message = `Failed to create backup: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(message, error instanceof Error ? error : undefined, 'BackupManager');
      throw new Error(message);
    }
  }

  /**
   * Create an encrypted backup (AES-256-GCM)
   */
  createEncryptedBackup(description?: string, retainPlaintext: boolean = false): string {
    if (!this.encryptionKey) {
      throw new Error('Backup encryption key not configured');
    }

    const backupPath = this.createBackup(description);
    const encryptedPath = backupPath + '.enc';

    const plain = readFileSync(backupPath);
    const encrypted = encryptBuffer(plain, this.encryptionKey);
    writeFileSync(encryptedPath, encrypted);

    const metadataPath = backupPath + '.json';
    const encryptedMetadataPath = encryptedPath + '.json';
    if (existsSync(metadataPath)) {
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
      metadata.encrypted = true;
      metadata.encryption = { cipher: 'aes-256-gcm' };
      writeFileSync(encryptedMetadataPath, JSON.stringify(metadata, null, 2));
    }

    if (!retainPlaintext) {
      unlinkSync(backupPath);
      if (existsSync(metadataPath)) {
        unlinkSync(metadataPath);
      }
    }

    logger.success(`✅ Encrypted backup created: ${basename(encryptedPath)}`);
    return encryptedPath;
  }

  /**
   * List all backups
   */
  listBackups(): BackupInfo[] {
    try {
      const backups: BackupInfo[] = [];

      const fs = require('fs');
      const files = fs.readdirSync(this.backupDir);

      for (const file of files) {
        if (file.endsWith('.json')) continue;
        if (!file.endsWith('.db') && !file.endsWith('.enc')) continue;

        const path = join(this.backupDir, file);
        const metadataPath = path + '.json';

        let metadata: BackupMetadata | null = null;
        let isValid = false;

        if (existsSync(metadataPath)) {
          try {
            metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
            metadata.timestamp = new Date(metadata.timestamp);
            isValid = true;
          } catch {
            isValid = false;
          }
        }

        if (metadata) {
          backups.push({
            name: file,
            path,
            metadata,
            isValid
          });
        }
      }

      // Sort by timestamp descending
      backups.sort((a, b) => b.metadata.timestamp.getTime() - a.metadata.timestamp.getTime());

      return backups;
    } catch (error) {
      logger.warn(
        `Failed to list backups: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'BackupManager'
      );
      return [];
    }
  }

  /**
   * Restore from backup
   */
  restoreBackup(backupPath: string, deleteOriginal: boolean = false): boolean {
    try {
      if (!existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      logger.info(`Restoring backup: ${basename(backupPath)}`, undefined, 'BackupManager');

      // Close database connection
      this.db.close();

      // Create backup of current database
      const currentBackup = join(this.backupDir, `pre-restore-${Date.now()}.db`);
      copyFileSync(this.databasePath, currentBackup);
      logger.info(`Current database backed up to: ${currentBackup}`, undefined, 'BackupManager');

      // Restore backup
      copyFileSync(backupPath, this.databasePath);

      // Optionally delete backup after restore
      if (deleteOriginal && backupPath !== this.databasePath) {
        unlinkSync(backupPath);
        const metadataPath = backupPath + '.json';
        if (existsSync(metadataPath)) {
          unlinkSync(metadataPath);
        }
      }

      logger.success(`✅ Backup restored successfully`);
      return true;
    } catch (error) {
      const message = `Failed to restore backup: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(message, error instanceof Error ? error : undefined, 'BackupManager');
      return false;
    }
  }

  /**
   * Restore from an encrypted backup
   */
  restoreEncryptedBackup(backupPath: string, deleteOriginal: boolean = false): boolean {
    try {
      if (!this.encryptionKey) {
        throw new Error('Backup encryption key not configured');
      }
      if (!existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      logger.info(`Restoring encrypted backup: ${basename(backupPath)}`, undefined, 'BackupManager');

      // Close database connection
      this.db.close();

      // Create backup of current database
      const currentBackup = join(this.backupDir, `pre-restore-${Date.now()}.db`);
      copyFileSync(this.databasePath, currentBackup);
      logger.info(`Current database backed up to: ${currentBackup}`, undefined, 'BackupManager');

      const encrypted = readFileSync(backupPath);
      const plain = decryptBuffer(encrypted, this.encryptionKey);
      writeFileSync(this.databasePath, plain);

      if (deleteOriginal && backupPath !== this.databasePath) {
        unlinkSync(backupPath);
        const metadataPath = backupPath + '.json';
        if (existsSync(metadataPath)) {
          unlinkSync(metadataPath);
        }
      }

      logger.success(`✅ Encrypted backup restored successfully`);
      return true;
    } catch (error) {
      const message = `Failed to restore encrypted backup: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(message, error instanceof Error ? error : undefined, 'BackupManager');
      return false;
    }
  }

  /**
   * Delete a backup
   */
  deleteBackup(backupPath: string): boolean {
    try {
      if (!existsSync(backupPath)) {
        throw new Error(`Backup not found: ${backupPath}`);
      }

      unlinkSync(backupPath);

      const metadataPath = backupPath + '.json';
      if (existsSync(metadataPath)) {
        unlinkSync(metadataPath);
      }

      logger.info(`Backup deleted: ${basename(backupPath)}`, undefined, 'BackupManager');
      return true;
    } catch (error) {
      logger.warn(
        `Failed to delete backup: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'BackupManager'
      );
      return false;
    }
  }

  /**
   * Cleanup old backups (keep only N most recent)
   */
  cleanupOldBackups(keepCount: number = 5): number {
    try {
      const backups = this.listBackups();

      if (backups.length <= keepCount) {
        logger.info(
          `Backup cleanup: keeping all ${backups.length} backups`,
          undefined,
          'BackupManager'
        );
        return 0;
      }

      const toDelete = backups.slice(keepCount);
      let deletedCount = 0;

      for (const backup of toDelete) {
        if (this.deleteBackup(backup.path)) {
          deletedCount++;
        }
      }

      logger.info(
        `Backup cleanup: deleted ${deletedCount} old backups, keeping ${keepCount}`,
        undefined,
        'BackupManager'
      );

      return deletedCount;
    } catch (error) {
      logger.warn(
        `Failed to cleanup backups: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'BackupManager'
      );
      return 0;
    }
  }

  /**
   * Validate backup integrity
   */
  validateBackup(backupPath: string): boolean {
    try {
      if (!existsSync(backupPath)) {
        return false;
      }

      // Try to open the backup as a database
      const tempDb = new Database(backupPath, { readonly: true });
      const result = tempDb.prepare('SELECT COUNT(*) FROM sqlite_master').get();
      tempDb.close();

      return !!result;
    } catch {
      return false;
    }
  }

  /**
   * Export backup statistics
   */
  getBackupStats() {
    const backups = this.listBackups();
    const totalSize = backups.reduce((sum, b) => sum + b.metadata.backupSize, 0);
    const validCount = backups.filter(b => b.isValid).length;

    return {
      totalBackups: backups.length,
      validBackups: validCount,
      totalSize: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
      oldestBackup: backups[backups.length - 1]?.metadata.timestamp,
      newestBackup: backups[0]?.metadata.timestamp,
      backups
    };
  }

  /**
   * Print backup status
   */
  printStats(): void {
    const stats = this.getBackupStats();

    console.log('\n💾 Backup Statistics:');
    console.log(`  Total backups: ${stats.totalBackups}`);
    console.log(`  Valid backups: ${stats.validBackups}`);
    console.log(`  Total size: ${stats.totalSize}`);

    if (stats.newestBackup) {
      console.log(`  Newest: ${stats.newestBackup.toLocaleString()}`);
    }
    if (stats.oldestBackup) {
      console.log(`  Oldest: ${stats.oldestBackup.toLocaleString()}`);
    }

    if (stats.backups.length > 0) {
      console.log(`\n  Recent backups:`);
      for (const backup of stats.backups.slice(0, 5)) {
        const size = (backup.metadata.backupSize / 1024 / 1024).toFixed(2);
        const valid = backup.isValid ? '✓' : '✗';
        console.log(
          `    [${valid}] ${backup.name} - ${size} MB (${backup.metadata.unitCount} units)`
        );
      }
    }
  }
}
