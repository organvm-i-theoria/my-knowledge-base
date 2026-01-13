/**
 * Database migration system for managing schema versions
 */

import Database from 'better-sqlite3';
import { logger } from './logger.js';
import fs from 'fs';
import path from 'path';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
}

export class MigrationManager {
  private db: Database.Database;
  private migrationsDir: string;

  constructor(db: Database.Database, migrationsDir: string = './src/migrations') {
    this.db = db;
    this.migrationsDir = migrationsDir;
    this.ensureMigrationsTable();
  }

  private ensureMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Get the current schema version
   */
  getCurrentVersion(): number {
    const result = this.db.prepare(`
      SELECT MAX(version) as version FROM schema_migrations
    `).get() as { version: number | null };

    return result.version ?? 0;
  }

  /**
   * Get list of executed migrations
   */
  getExecutedMigrations(): Migration[] {
    const rows = this.db.prepare(`
      SELECT version, name FROM schema_migrations ORDER BY version
    `).all() as Array<{ version: number; name: string }>;

    return rows.map(row => ({
      version: row.version,
      name: row.name,
      up: () => {},
      down: () => {}
    }));
  }

  /**
   * Run all pending migrations
   */
  runPendingMigrations(migrations: Migration[]): void {
    const currentVersion = this.getCurrentVersion();
    const pendingMigrations = migrations.filter(m => m.version > currentVersion);

    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations', { currentVersion });
      return;
    }

    logger.info(`Running ${pendingMigrations.length} migrations`, {
      from: currentVersion,
      to: pendingMigrations[pendingMigrations.length - 1].version
    });

    for (const migration of pendingMigrations) {
      try {
        logger.info(`Running migration`, {
          version: migration.version,
          name: migration.name
        });

        const transaction = this.db.transaction(() => {
          migration.up(this.db);
          this.db.prepare(`
            INSERT INTO schema_migrations (version, name)
            VALUES (?, ?)
          `).run(migration.version, migration.name);
        });

        transaction();

        logger.success(`✅ Migration ${migration.version}: ${migration.name}`);
      } catch (error) {
        logger.error(
          `Migration ${migration.version} failed`,
          error instanceof Error ? error : new Error(String(error))
        );
        throw error;
      }
    }

    logger.info('All migrations completed successfully');
  }

  /**
   * Rollback to a specific version
   */
  rollback(migrations: Migration[], targetVersion: number): void {
    const currentVersion = this.getCurrentVersion();

    if (targetVersion >= currentVersion) {
      logger.warn('Target version is not behind current version', {
        current: currentVersion,
        target: targetVersion
      });
      return;
    }

    const toRollback = migrations
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .sort((a, b) => b.version - a.version);

    logger.info(`Rolling back ${toRollback.length} migrations`, {
      from: currentVersion,
      to: targetVersion
    });

    for (const migration of toRollback) {
      try {
        logger.info(`Rolling back migration`, {
          version: migration.version,
          name: migration.name
        });

        const transaction = this.db.transaction(() => {
          migration.down(this.db);
          this.db.prepare(`
            DELETE FROM schema_migrations WHERE version = ?
          `).run(migration.version);
        });

        transaction();

        logger.success(`✅ Rolled back ${migration.version}: ${migration.name}`);
      } catch (error) {
        logger.error(
          `Rollback of migration ${migration.version} failed`,
          error instanceof Error ? error : new Error(String(error))
        );
        throw error;
      }
    }

    logger.info('Rollback completed');
  }

  /**
   * Get migration status
   */
  getStatus(allMigrations: Migration[]): {
    current: number;
    latest: number;
    pending: Migration[];
    executed: Migration[];
  } {
    const current = this.getCurrentVersion();
    const latest = Math.max(...allMigrations.map(m => m.version), 0);
    const executed = allMigrations.filter(m => m.version <= current);
    const pending = allMigrations.filter(m => m.version > current);

    return { current, latest, pending, executed };
  }
}

/**
 * Core migrations included in the system
 */
export const coreMigrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS atomic_units (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          created TIMESTAMP NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          context TEXT,
          conversation_id TEXT,
          document_id TEXT,
          category TEXT,
          embedding BLOB
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS units_fts USING fts5(
          title, content, context, tags,
          content=atomic_units,
          content_rowid=rowid
        );

        CREATE TABLE IF NOT EXISTS tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS unit_tags (
          unit_id TEXT,
          tag_id INTEGER,
          FOREIGN KEY (unit_id) REFERENCES atomic_units(id),
          FOREIGN KEY (tag_id) REFERENCES tags(id),
          PRIMARY KEY (unit_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS keywords (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          keyword TEXT UNIQUE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS unit_keywords (
          unit_id TEXT,
          keyword_id INTEGER,
          FOREIGN KEY (unit_id) REFERENCES atomic_units(id),
          FOREIGN KEY (keyword_id) REFERENCES keywords(id),
          PRIMARY KEY (unit_id, keyword_id)
        );

        CREATE TABLE IF NOT EXISTS unit_relationships (
          from_unit TEXT,
          to_unit TEXT,
          relationship_type TEXT,
          FOREIGN KEY (from_unit) REFERENCES atomic_units(id),
          FOREIGN KEY (to_unit) REFERENCES atomic_units(id),
          PRIMARY KEY (from_unit, to_unit, relationship_type)
        );

        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          title TEXT,
          created TIMESTAMP,
          url TEXT,
          exported_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          title TEXT,
          content TEXT,
          created TIMESTAMP,
          modified TIMESTAMP,
          url TEXT,
          format TEXT,
          metadata TEXT,
          exported_at TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_units_created ON atomic_units(created);
        CREATE INDEX IF NOT EXISTS idx_units_category ON atomic_units(category);
        CREATE INDEX IF NOT EXISTS idx_units_type ON atomic_units(type);
        CREATE INDEX IF NOT EXISTS idx_units_conversation ON atomic_units(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_units_document ON atomic_units(document_id);
      `);
    },
    down: (db) => {
      db.exec(`
        DROP INDEX IF EXISTS idx_units_document;
        DROP INDEX IF EXISTS idx_units_conversation;
        DROP INDEX IF EXISTS idx_units_type;
        DROP INDEX IF EXISTS idx_units_category;
        DROP INDEX IF EXISTS idx_units_created;
        DROP TABLE IF EXISTS documents;
        DROP TABLE IF EXISTS conversations;
        DROP TABLE IF EXISTS unit_relationships;
        DROP TABLE IF EXISTS unit_keywords;
        DROP TABLE IF EXISTS keywords;
        DROP TABLE IF EXISTS unit_tags;
        DROP TABLE IF EXISTS tags;
        DROP TABLE IF EXISTS units_fts;
        DROP TABLE IF EXISTS atomic_units;
      `);
    }
  },
  {
    version: 2,
    name: 'add_insights_and_summaries',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS insights (
          id TEXT PRIMARY KEY,
          unit_id TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          type TEXT,
          created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (unit_id) REFERENCES atomic_units(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS conversation_summaries (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          title TEXT NOT NULL,
          summary TEXT NOT NULL,
          key_points TEXT,
          topics TEXT,
          created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_insights_unit ON insights(unit_id);
        CREATE INDEX IF NOT EXISTS idx_insights_created ON insights(created);
        CREATE INDEX IF NOT EXISTS idx_summaries_conversation ON conversation_summaries(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_summaries_created ON conversation_summaries(created);
      `);
    },
    down: (db) => {
      db.exec(`
        DROP INDEX IF EXISTS idx_summaries_created;
        DROP INDEX IF EXISTS idx_summaries_conversation;
        DROP INDEX IF EXISTS idx_insights_created;
        DROP INDEX IF EXISTS idx_insights_unit;
        DROP TABLE IF EXISTS conversation_summaries;
        DROP TABLE IF EXISTS insights;
      `);
    }
  },
  {
    version: 3,
    name: 'add_unit_metadata',
    up: (db) => {
      db.exec(`
        ALTER TABLE atomic_units ADD COLUMN confidence REAL DEFAULT 0.5;
        ALTER TABLE atomic_units ADD COLUMN last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE atomic_units ADD COLUMN source_type TEXT DEFAULT 'conversation';
        
        CREATE INDEX IF NOT EXISTS idx_units_confidence ON atomic_units(confidence);
        CREATE INDEX IF NOT EXISTS idx_units_last_updated ON atomic_units(last_updated);
      `);
    },
    down: (db) => {
      // SQLite doesn't support DROP COLUMN in old versions
      // This is a limitation - we'd need to recreate the table
      logger.warn('Downgrading from migration 3 requires manual intervention');
    }
  }
,
  {
    version: 4,
    name: 'add_atomic_unit_columns',
    up: (db) => {
      const columnExists = (name: string) => {
        const info = db.prepare('PRAGMA table_info(atomic_units)').all() as Array<{ name: string }>;
        return info.some(col => col.name === name);
      };

      const addColumn = (name: string, definition: string) => {
        if (!columnExists(name)) {
          db.exec(`ALTER TABLE atomic_units ADD COLUMN ${name} ${definition}`);
        }
      };

      addColumn('section_type', 'TEXT');
      addColumn('hierarchy_level', 'INTEGER DEFAULT 0');
      addColumn('parent_section_id', 'TEXT');
      addColumn('tags', "TEXT DEFAULT '[]'");
      addColumn('keywords', "TEXT DEFAULT '[]'");
    },
    down: () => {
      logger.warn('Rolling back migration 4 requires manual intervention to drop columns');
    }
  }
];
