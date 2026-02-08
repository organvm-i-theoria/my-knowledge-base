import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyTopLevelMappingToRelativePath,
  choosePrimaryFile,
  normalizeSlugSegment,
  replaceWithHardlink,
  selectArtifactDirectoryMoves,
} from '../scripts/organize-intake.js';

describe('organize-intake script helpers', () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    tmpDir = null;
  });

  it('normalizes slug segments', () => {
    expect(normalizeSlugSegment('Takeout 3')).toBe('takeout-3');
    expect(normalizeSlugSegment('  canonical/sources  ')).toBe('canonical-sources');
    expect(normalizeSlugSegment('___')).toBe('x');
  });

  it('maps configured top-level folders into lifecycle destinations', () => {
    expect(applyTopLevelMappingToRelativePath('Takeout 3')).toBe(
      'archive-batches/google-takeout/batch-0003',
    );
    expect(applyTopLevelMappingToRelativePath('Takeout 3/Drive/My Mac')).toBe(
      'archive-batches/google-takeout/batch-0003/Drive/My Mac',
    );
    expect(applyTopLevelMappingToRelativePath('thread_synthesizer/input/file.md')).toBe(
      'canonical/reference-tools/thread-synthesizer/input/file.md',
    );
    expect(applyTopLevelMappingToRelativePath('unknown/path')).toBe('unknown/path');
  });

  it('selects topmost artifact directories and skips nested duplicates', () => {
    const operations = selectArtifactDirectoryMoves([
      { abs: '/tmp/a/node_modules', rel: 'canonical/reference-tools/tool-a/node_modules' },
      { abs: '/tmp/a/node_modules/nested', rel: 'canonical/reference-tools/tool-a/node_modules/nested' },
      { abs: '/tmp/a/git', rel: 'canonical/reference-tools/tool-a/.git' },
      { abs: '/tmp/b/node_modules', rel: 'artifacts/system/canonical/reference-tools/tool-a/node_modules' },
    ]);

    const sources = operations.map(operation => operation.sourcePath).sort();
    expect(sources).toEqual([
      'canonical/reference-tools/tool-a/.git',
      'canonical/reference-tools/tool-a/node_modules',
    ]);
  });

  it('chooses duplicate primary by richness, then tier and recency', () => {
    const files = [
      {
        abs: '/tmp/a',
        rel: 'archive-batches/google-takeout/batch-0003/file.txt',
        size: 100,
        mtimeMs: 10,
      },
      {
        abs: '/tmp/b',
        rel: 'canonical/sources/curated-sources/file.txt',
        size: 100,
        mtimeMs: 1,
      },
    ];

    const richerArchive = new Map<string, number>([
      ['archive-batches/google-takeout/batch-0003', 10],
      ['canonical/sources/curated-sources', 4],
    ]);
    const richerCanonical = new Map<string, number>([
      ['archive-batches/google-takeout/batch-0003', 4],
      ['canonical/sources/curated-sources', 4],
    ]);

    expect(choosePrimaryFile(files, richerArchive).rel).toBe(
      'archive-batches/google-takeout/batch-0003/file.txt',
    );
    expect(choosePrimaryFile(files, richerCanonical).rel).toBe(
      'canonical/sources/curated-sources/file.txt',
    );
  });

  it('replaces duplicate file with a hardlink to primary', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'organize-intake-test-'));
    const primaryPath = path.join(tmpDir, 'primary.txt');
    const duplicatePath = path.join(tmpDir, 'duplicate.txt');

    fs.writeFileSync(primaryPath, 'same-content', 'utf8');
    fs.writeFileSync(duplicatePath, 'same-content', 'utf8');

    const result = await replaceWithHardlink(primaryPath, duplicatePath);
    expect(result.status).toBe('applied');

    const primaryStat = fs.statSync(primaryPath);
    const duplicateStat = fs.statSync(duplicatePath);
    expect(primaryStat.ino).toBe(duplicateStat.ino);
    expect(primaryStat.dev).toBe(duplicateStat.dev);
  });
});
