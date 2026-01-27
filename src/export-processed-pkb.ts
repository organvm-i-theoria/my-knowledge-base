#!/usr/bin/env node
/**
 * Export knowledge base to processed_pkb_final-style markdown package.
 */

import { KnowledgeDatabase } from './database.js';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

interface IndexEntry {
  title: string;
  path: string;
  size_bytes: number;
  modified: string;
}

interface ExportOptions {
  outputDir: string;
  dbPath: string;
  limit: number;
}

function sanitizeTitle(title: string, fallback: string): string {
  const sanitized = title
    .replace(/\s+/g, '_')
    .replace(/[^\w.\-&]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return sanitized || fallback;
}

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function writeIndexFiles(outputDir: string, entries: IndexEntry[]) {
  const generatedAt = new Date().toISOString();
  const sorted = [...entries].sort((a, b) => a.title.localeCompare(b.title));

  const indexMd = [
    '# PKB Index',
    `Generated: ${generatedAt} UTC`,
    '',
    '## Files',
    ...sorted.map((entry) => `- [${entry.path}](${entry.path})`),
    '',
  ].join('\n');

  const indexCsv = [
    'title,path,size_bytes,modified',
    ...sorted.map(
      (entry) =>
        `${entry.title},${entry.path},${entry.size_bytes},${entry.modified}`
    ),
  ].join('\n');

  writeFileSync(join(outputDir, 'INDEX.md'), indexMd);
  writeFileSync(
    join(outputDir, 'INDEX.json'),
    JSON.stringify(sorted, null, 2)
  );
  writeFileSync(join(outputDir, 'INDEX.csv'), indexCsv);
}

function writeReadme(outputDir: string) {
  const readme = `# PKB Export Package

This archive contains your processed files in plain Markdown for lightweight storage and PKB (Personal Knowledge Base) use.

## Contents
- \`INDEX.md\` — Master index linking all files
- \`INDEX.csv\` — Metadata index (title, path, size, modified)
- \`INDEX.json\` — Same metadata in JSON
- \`README.md\` — This file
- Individual \`.md\` files converted from your uploads

## Usage
- Drop the folder into an Obsidian, Logseq, or other Markdown-based PKB.
- Use \`INDEX.md\` for quick navigation.
- Use \`INDEX.csv\`/\\\`INDEX.json\\\` for scripting, external search, or database ingestion.
- Files are plain text for portability and low resource usage.

## Local search tool
- Run: \`npm run pkb:search -- "your terms"\`
- Regex: \`npm run pkb:search -- --re "(metamorph|myth)"\`
- AND: \`npm run pkb:search -- --and wave astrology\`
- JSON output: \`npm run pkb:search -- --json "gemini export"\`
`;

  writeFileSync(join(outputDir, 'README.md'), readme);
}

async function exportProcessedPkb(options: ExportOptions) {
  const { outputDir, dbPath, limit } = options;
  ensureDir(outputDir);

  const db = new KnowledgeDatabase(dbPath);
  const documents = db.getDocumentsForReprocess({ limit });

  console.log(`📦 Exporting ${documents.length} documents to ${outputDir}`);

  const entries: IndexEntry[] = [];

  for (const doc of documents) {
    const title = doc.title?.trim() || doc.id;
    const filename = `${sanitizeTitle(title, doc.id)}.md`;
    const path = join(outputDir, filename);

    writeFileSync(path, doc.content ?? '');

    const stats = statSync(path);
    entries.push({
      title,
      path: filename,
      size_bytes: stats.size,
      modified: stats.mtime.toISOString(),
    });
  }

  writeIndexFiles(outputDir, entries);
  writeReadme(outputDir);

  db.close();

  console.log('✅ processed_pkb export complete');
}

async function main() {
  const args = process.argv.slice(2);

  const outputDir = args[0] ?? join(process.cwd(), 'processed_pkb_final');
  const dbPathArgIndex = args.findIndex((arg) => arg === '--db');
  const limitArgIndex = args.findIndex((arg) => arg === '--limit');

  const dbPath =
    dbPathArgIndex >= 0 ? args[dbPathArgIndex + 1] : './db/knowledge.db';
  const limit =
    limitArgIndex >= 0 ? Number(args[limitArgIndex + 1]) : 100000;

  if (Number.isNaN(limit)) {
    console.error('Invalid --limit value');
    process.exit(1);
  }

  await exportProcessedPkb({
    outputDir,
    dbPath,
    limit,
  });
}

main();
