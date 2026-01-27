import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { searchFiles } from './pkb-search-cli.js';

describe('pkb-search-cli', () => {
  const tempDir = join(process.cwd(), '.test-tmp', 'pkb-search');

  beforeEach(() => {
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(join(tempDir, 'alpha.md'), 'Hello World\nSecond line\nAlpha beta\n');
    writeFileSync(join(tempDir, 'beta.md'), 'Gamma delta\nHELLO again\n');
    writeFileSync(join(tempDir, 'note.txt'), 'Hello from txt\n');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should find case-insensitive substring matches', () => {
    const results = searchFiles({
      terms: ['hello'],
      andMode: false,
      orMode: false,
      jsonMode: false,
      root: tempDir,
      ext: '.md',
      context: 1,
      limit: 10,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].snippet).toContain('Hello');
  });

  it('should support AND mode', () => {
    const results = searchFiles({
      terms: ['alpha', 'beta'],
      andMode: true,
      orMode: false,
      jsonMode: false,
      root: tempDir,
      ext: '.md',
      context: 0,
      limit: 10,
    });

    expect(results.some((hit) => hit.file.endsWith('alpha.md'))).toBe(true);
  });

  it('should support regex search', () => {
    const results = searchFiles({
      terms: [],
      regex: 'hello\\s+again',
      andMode: false,
      orMode: false,
      jsonMode: false,
      root: tempDir,
      ext: '.md',
      context: 0,
      limit: 10,
    });

    expect(results).toHaveLength(1);
    expect(results[0].file.endsWith('beta.md')).toBe(true);
  });
});
