import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { LocalFileSource } from '../src/sources/local.js';
import { KnowledgeAtomizer } from '../src/atomizer.js';
import { JSONWriter } from '../src/json-writer.js';

describe('Export pipeline integration', () => {
  const tempRoot = join(process.cwd(), '.test-tmp', 'export-pipeline');
  const configDir = join(tempRoot, 'config');
  const sourceDir = join(tempRoot, 'source');
  const outputDir = join(tempRoot, 'output');

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('ingests local files, atomizes, and writes JSON outputs', async () => {
    mkdirSync(configDir, { recursive: true });
    mkdirSync(sourceDir, { recursive: true });

    writeFileSync(join(sourceDir, 'note.md'), '# Title\n\nParagraph content.');

    const config = `sources:\n  - id: local-test\n    name: Local Test\n    path: ${sourceDir}\n    enabled: true\n    patterns:\n      - "**/*.md"\nsettings: {}`;
    writeFileSync(join(configDir, 'sources.yaml'), config);

    const source = new LocalFileSource(tempRoot);
    const items = await source.exportAll();
    expect(items.length).toBe(1);

    const atomizer = new KnowledgeAtomizer();
    const units = atomizer.atomize(items[0] as any);
    expect(units.length).toBeGreaterThan(0);

    const writer = new JSONWriter(outputDir);
    writer.writeUnits(units);
    writer.writeIndex(units);
    writer.appendToJSONL(units);

    expect(existsSync(join(outputDir, 'units'))).toBe(true);
    expect(existsSync(join(outputDir, 'index.json'))).toBe(true);
    expect(existsSync(join(outputDir, 'index.jsonl'))).toBe(true);
  });
});
