import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { KnowledgeAtomizer } from '../src/atomizer.js';
import { KnowledgeDatabase } from '../src/database.js';
import { LocalFileSource } from '../src/sources/local.js';

describe('E2E export -> atomize -> store', () => {
  const tempRoot = join(process.cwd(), '.test-tmp', 'e2e-export');
  const configDir = join(tempRoot, 'config');
  const sourceDir = join(tempRoot, 'source');
  const dbDir = join(tempRoot, 'db');
  const dbPath = join(dbDir, 'knowledge.db');

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('exports files and persists searchable units', async () => {
    mkdirSync(configDir, { recursive: true });
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(dbDir, { recursive: true });

    writeFileSync(join(sourceDir, 'note.md'), '# API Tokens\n\nStore tokens securely.');

    const config = `sources:\n  - id: local-test\n    name: Local Test\n    path: ${sourceDir}\n    enabled: true\n    patterns:\n      - "**/*.md"\nsettings: {}`;
    writeFileSync(join(configDir, 'sources.yaml'), config);

    const source = new LocalFileSource(tempRoot);
    const items = await source.exportAll();

    const atomizer = new KnowledgeAtomizer();
    const units = atomizer.atomize(items[0] as any);

    const db = new KnowledgeDatabase(dbPath);
    units.forEach(unit => db.insertAtomicUnit(unit));

    const results = db.searchText('Tokens');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('API');
    db.close();

    expect(existsSync(dbPath)).toBe(true);
  });
});
