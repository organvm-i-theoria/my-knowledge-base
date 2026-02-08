import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dirname, join, resolve } from 'path';
import { KnowledgeDatabase } from './database.js';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { AtomicUnit } from './types.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function createUnit(db: KnowledgeDatabase, id: string, category: string, tags: string[]) {
  const now = new Date();
  const unit: AtomicUnit = {
    id,
    type: 'insight',
    timestamp: now,
    title: `Unit ${id}`,
    content: 'Content',
    context: '',
    tags,
    category: category as unknown as AtomicUnit['category'],
    relatedUnits: [],
    keywords: [],
    conversationId: undefined,
    documentId: undefined
  };
  
  db.insertAtomicUnit(unit);
}

describe('Taxonomy CLI', () => {
  let testDir: string;
  let testDb: string;
  let db: KnowledgeDatabase;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'kb-taxonomy-cli-'));
    testDb = join(testDir, 'test.db');
    db = new KnowledgeDatabase(testDb);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // Database can already be closed by an individual test.
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  it('detects invalid categories and tags in audit mode', () => {
    createUnit(db, 'u1', 'Technical', ['React JS', 'Node.js']);
    const raw = db.getRawHandle();
    raw.pragma('wal_checkpoint(TRUNCATE)');

    const row = raw.prepare('SELECT category FROM atomic_units WHERE id = ?').get('u1') as { category: string };
    expect(row.category).toBe('Technical');
    db.close();

    const verifyDb = new KnowledgeDatabase(testDb);
    const verifyRaw = verifyDb.getRawHandle();
    const verifyRow = verifyRaw.prepare('SELECT category FROM atomic_units WHERE id = ?').get('u1') as {
      category: string;
    };
    expect(verifyRow.category).toBe('Technical');
    const malformedTag = verifyRaw.prepare('SELECT name FROM tags WHERE name = ?').get('React JS') as
      | { name: string }
      | undefined;
    expect(malformedTag?.name).toBe('React JS');
    verifyDb.close();

    const output = execFileSync('tsx', ['src/taxonomy-cli.ts', 'audit', '--db', testDb], {
      env: { ...process.env, DOTENV_CONFIG_OVERRIDE: 'false' },
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('Technical');
    expect(output).toContain('React JS');
    expect(output).toContain('should be "programming"');
    expect(output).toContain('should be "react-js"');
  });
  
  it('repairs categories and tags in repair mode', () => {
    createUnit(db, 'u1', 'Technical', ['React JS']);
    const raw = db.getRawHandle();
    raw.pragma('wal_checkpoint(TRUNCATE)');
    db.close();

    execFileSync('tsx', ['src/taxonomy-cli.ts', 'repair', '--save', '--yes', '--db', testDb], {
      env: { ...process.env, DOTENV_CONFIG_OVERRIDE: 'false' },
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });

    db = new KnowledgeDatabase(testDb);
    // Verify changes
    const unit = db.getUnitById('u1');
    expect(unit?.category).toBe('programming');

    const tags = db.getRawHandle().prepare('SELECT name FROM tags').all() as { name: string }[];
    const names = tags.map(t => t.name);
    expect(names).toContain('react-js');
    expect(names).not.toContain('React JS');
  });
});
