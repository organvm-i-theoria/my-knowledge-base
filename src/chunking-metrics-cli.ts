#!/usr/bin/env node
/**
 * Chunking metrics CLI.
 * Reports chunking coverage and granularity across documents.
 */

import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { KnowledgeDatabase } from './database.js';

config();

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatFloat(value: number): string {
  return value.toFixed(2);
}

function parseArgs(argv: string[]): { snapshot: boolean; top: number } {
  const snapshot = argv.includes('--snapshot');
  const topIdx = argv.indexOf('--top');
  const topRaw = topIdx >= 0 ? argv[topIdx + 1] : undefined;
  const parsedTop = topRaw ? parseInt(topRaw, 10) : 10;
  const top = Number.isFinite(parsedTop) && parsedTop > 0 ? parsedTop : 10;
  return { snapshot, top };
}

function writeSnapshot(metrics: unknown): string {
  const dir = path.join(process.cwd(), 'atomized', 'metrics');
  fs.mkdirSync(dir, { recursive: true });
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const filename = `chunking-${yyyy}-${mm}-${dd}.json`;
  const fullPath = path.join(dir, filename);
  const payload = {
    generatedAt: new Date().toISOString(),
    metrics,
  };
  fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2));
  return fullPath;
}

async function main() {
  console.log('📊 Chunking Metrics\n');
  const args = parseArgs(process.argv.slice(2));

  const db = new KnowledgeDatabase('./db/knowledge.db');

  try {
    const metrics = db.getChunkingMetrics();
    const { totals, chunkingTags, formats, sourceBreakdown, topDocuments } = metrics;

    console.log('Totals:');
    console.log(`  documents:            ${totals.documents}`);
    console.log(`  documentsWithUnits:   ${totals.documentsWithUnits}`);
    console.log(
      `  documentsChunked:     ${totals.documentsChunked} (${formatPct(totals.documentsChunkedPct)})`
    );
    console.log(`  avgUnitsPerDocument:  ${formatFloat(totals.avgUnitsPerDocument)}`);
    console.log(`  maxUnitsPerDocument:  ${totals.maxUnitsPerDocument}`);
    console.log(`  documentUnits:        ${totals.documentUnits}`);
    console.log(
      `  unitsWithStrategy:    ${totals.documentUnitsWithChunkStrategy} (${formatPct(
        totals.documentUnitsWithChunkStrategyPct
      )})`
    );
    console.log(
      `  unitsWithImages:      ${totals.documentUnitsWithImages} (${formatPct(
        totals.documentUnitsWithImagesPct
      )})`
    );

    console.log('\nBy Format:');
    if (formats.length === 0) {
      console.log('  (no documents found)');
    } else {
      for (const row of formats) {
        console.log(
          `  ${row.format.padEnd(9)} docs=${String(row.documents).padEnd(5)} withUnits=${String(
            row.documentsWithUnits
          ).padEnd(5)} chunked=${String(row.documentsChunked).padEnd(5)} (${formatPct(
            row.documentsChunkedPct
          )}) avgUnits=${formatFloat(row.avgUnitsPerDocument)}`
        );
      }
    }

    console.log('\nBy Source:');
    if (sourceBreakdown.length === 0) {
      console.log('  (no source data found)');
    } else {
      for (const row of sourceBreakdown) {
        console.log(
          `  ${row.sourceId.padEnd(16)} docs=${String(row.documents).padEnd(
            5
          )} withUnits=${String(row.documentsWithUnits).padEnd(5)} chunked=${String(
            row.documentsChunked
          ).padEnd(5)} (${formatPct(row.documentsChunkedPct)}) avgUnits=${formatFloat(
            row.avgUnitsPerDocument
          )}`
        );
      }
    }

    console.log('\nChunk Strategies:');
    if (chunkingTags.length === 0) {
      console.log('  (no chunk strategy tags found)');
    } else {
      for (const tag of chunkingTags) {
        console.log(
          `  ${tag.tag.padEnd(32)} documents=${String(tag.documents).padEnd(5)} applications=${tag.applications}`
        );
      }
    }

    console.log(`\nTop Documents (by unit count, top=${args.top}):`);
    const topSlice = topDocuments.slice(0, args.top);
    if (topSlice.length === 0) {
      console.log('  (no document units found)');
    } else {
      for (const doc of topSlice) {
        const title = doc.title.length > 60 ? `${doc.title.slice(0, 57)}…` : doc.title;
        console.log(
          `  ${String(doc.unitCount).padStart(4)}  ${doc.format.padEnd(8)} ${doc.sourceId.padEnd(
            16
          )} ${title}`
        );
      }
    }

    if (args.snapshot) {
      const snapshotPath = writeSnapshot(metrics);
      console.log(`\n💾 Snapshot written: ${snapshotPath}`);
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('❌ Chunking metrics failed:', err);
  process.exit(1);
});
