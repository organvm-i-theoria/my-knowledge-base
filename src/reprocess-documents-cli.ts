#!/usr/bin/env node
/**
 * Reprocess documents to apply updated chunking defaults.
 * This is especially useful for Apple Notes HTML after tuning guardrails.
 */

import { config } from 'dotenv';
import { KnowledgeDatabase } from './database.js';
import { KnowledgeAtomizer } from './atomizer.js';
import { KnowledgeDocument } from './types.js';

config();

interface CliOptions {
  sourceIds?: string[];
  formats?: Array<'markdown' | 'txt' | 'pdf' | 'html'>;
  limit: number;
  offset: number;
  save: boolean;
  yes: boolean;
}

function parseListArg(value?: string): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function parseArgs(argv: string[]): CliOptions {
  const getValue = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    if (idx < 0) return undefined;
    return argv[idx + 1];
  };

  const sourceIds = parseListArg(getValue('--source'));
  const formats = parseListArg(getValue('--format')) as CliOptions['formats'];
  const limitRaw = parseInt(getValue('--limit') || '250', 10);
  const offsetRaw = parseInt(getValue('--offset') || '0', 10);

  return {
    sourceIds,
    formats,
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 250,
    offset: Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0,
    save: argv.includes('--save'),
    yes: argv.includes('--yes'),
  };
}

function describeDoc(doc: KnowledgeDocument, beforeCount: number): string {
  const sourceId = typeof doc.metadata?.sourceId === 'string' ? doc.metadata.sourceId : '(unknown)';
  const title = doc.title.length > 80 ? `${doc.title.slice(0, 77)}…` : doc.title;
  return `${doc.format.padEnd(8)} ${sourceId.padEnd(16)} units=${String(beforeCount).padStart(4)}  ${title}`;
}

async function main() {
  console.log('♻️  Document Reprocessing (Chunking Defaults)\n');

  const options = parseArgs(process.argv.slice(2));
  const db = new KnowledgeDatabase('./db/knowledge.db');
  const atomizer = new KnowledgeAtomizer();

  try {
    const docs = db.getDocumentsForReprocess({
      sourceIds: options.sourceIds,
      formats: options.formats,
      limit: options.limit,
      offset: options.offset,
    });

    if (docs.length === 0) {
      console.log('⚠️  No matching documents found.');
      return;
    }

    const beforeCounts = new Map<string, number>();
    let totalBefore = 0;
    for (const doc of docs) {
      const count = db.getUnitCountForDocument(doc.id);
      beforeCounts.set(doc.id, count);
      totalBefore += count;
    }

    console.log('Selection summary:');
    console.log(`  documents:   ${docs.length}`);
    console.log(`  sourceIds:   ${options.sourceIds?.join(', ') || '(any)'}`);
    console.log(`  formats:     ${options.formats?.join(', ') || '(any)'}`);
    console.log(`  limit/offset ${options.limit}/${options.offset}`);
    console.log(`  unitsBefore: ${totalBefore}\n`);

    console.log('Sample documents:');
    docs.slice(0, 10).forEach((doc) => {
      const before = beforeCounts.get(doc.id) || 0;
      console.log(`  ${describeDoc(doc, before)}`);
    });

    if (!options.save) {
      console.log('\n💡 Dry run only. Re-run with --save --yes to apply changes.');
      return;
    }

    if (!options.yes) {
      console.log('\n❌ Refusing to run destructive changes without --yes.');
      console.log('Re-run with: --save --yes');
      return;
    }

    console.log('\n🚧 Reprocessing documents...\n');

    let docsProcessed = 0;
    let totalAfter = 0;
    let unitsDeletedTotal = 0;
    let unitsInsertedTotal = 0;

    for (const doc of docs) {
      const before = beforeCounts.get(doc.id) || 0;

      // Remove old units and related links first.
      const deleted = db.deleteUnitsForDocumentIds([doc.id]);
      unitsDeletedTotal += deleted.unitsDeleted;

      // Re-atomize with current defaults.
      const units = atomizer.atomizeDocument(doc);
      unitsInsertedTotal += units.length;
      totalAfter += units.length;

      // Refresh document metadata and insert new units.
      db.insertDocument(doc);
      for (const unit of units) {
        db.insertAtomicUnit(unit);
      }

      docsProcessed++;
      const delta = units.length - before;
      const deltaLabel = delta === 0 ? '±0' : delta > 0 ? `+${delta}` : `${delta}`;
      console.log(
        `  ✅ ${docsProcessed}/${docs.length}  before=${before} after=${units.length} delta=${deltaLabel}  ${doc.title.slice(0, 60)}`
      );
    }

    console.log('\n📈 Reprocessing summary:');
    console.log(`  documentsProcessed: ${docsProcessed}`);
    console.log(`  unitsDeleted:       ${unitsDeletedTotal}`);
    console.log(`  unitsInserted:      ${unitsInsertedTotal}`);
    console.log(`  unitsBefore:        ${totalBefore}`);
    console.log(`  unitsAfter:         ${totalAfter}`);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('❌ Reprocessing failed:', err);
  process.exit(1);
});

