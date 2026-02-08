import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { KnowledgeDatabase } from './database.js';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { AtomicUnit } from './types.js';

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
    category: category as any, // Bypass type check for test
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
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('detects invalid categories and tags in audit mode', () => {
    createUnit(db, 'u1', 'Technical', ['React JS', 'Node.js']);

    const row = (db as any).db.prepare('SELECT category FROM atomic_units WHERE id = ?').get('u1');
    console.log('DEBUG DB Category:', row);
    
    try {
        const output = execSync(`tsx src/taxonomy-cli.ts audit`, { 
            env: { ...process.env, DB_PATH: testDb },
            cwd: REPO_ROOT,
            encoding: 'utf-8'
        });
        
        expect(output).toContain('Technical');
        expect(output).toContain('React JS');
        expect(output).toContain('should be "programming"');
        expect(output).toContain('should be "react-js"');
    } catch (e) {
        console.error((e as any).stdout);
        throw e;
    }
  });
  
  it('repairs categories and tags in repair mode', () => {
    createUnit(db, 'u1', 'Technical', ['React JS']);
    
    // Run repair with --save and --yes (to skip confirmation if I implemented it? I didn't implement prompt for main repair loop yet, only for sync)
    // Actually I implemented `if (options.save)` check but main prompt logic is missing for `repair` start. 
    // Wait, in `src/taxonomy-cli.ts`, I only added prompt for "Syncing atomic_units.tags". 
    // So `repair --save --yes` should work.
    
    execSync(`tsx src/taxonomy-cli.ts repair --save --yes`, { 
        env: { ...process.env, DB_PATH: testDb },
        cwd: REPO_ROOT,
        encoding: 'utf-8'
    });
    
    // Verify changes
    const unit = db.getUnitById('u1');
    expect(unit?.category).toBe('programming');
    
    // Tags are trickier because atomic_units.tags might not be synced unless we hit that block.
    // In my test I populated tags table via insertAtomicUnit.
    // Repair updates tags table.
    
    // Check tags table
    const tags = (db as any).db.prepare('SELECT name FROM tags').all() as {name: string}[];
    const names = tags.map(t => t.name);
    expect(names).toContain('react-js');
    expect(names).not.toContain('React JS');
  });
});
