#!/usr/bin/env node
/**
 * Bulk tagging/backfill CLI for document-backed units.
 * Designed for newly ingested local/Dropbox files.
 */

import { config } from 'dotenv';
import { createInterface } from 'readline';
import { KnowledgeDatabase } from './database.js';
import { SmartTagger } from './smart-tagger.js';

config();

interface CliOptions {
  limit: number;
  save: boolean;
  sourceIds?: string[];
  formats?: Array<'markdown' | 'txt' | 'pdf' | 'html'>;
  maxExistingTags?: number;
  offset?: number;
  minContentLength?: number;
  maxBatches?: number;
  yes?: boolean;
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

  const limit = parseInt(getValue('--limit') || '200', 10);
  const save = argv.includes('--save');
  const sourceIds = parseListArg(getValue('--source'));
  const formats = parseListArg(getValue('--format')) as CliOptions['formats'];

  const includeAll = argv.includes('--include-all');
  const maxExistingTags = includeAll ? undefined : parseInt(getValue('--max-tags') || '2', 10);
  
  const offset = parseInt(getValue('--resume-from-offset') || '0', 10);
  const minContentLength = parseInt(getValue('--min-content-length') || '0', 10);
  const maxBatches = parseInt(getValue('--max-batches') || '20', 10);
  const yes = argv.includes('--yes');

  return {
    limit: Number.isFinite(limit) && limit > 0 ? limit : 200,
    save,
    sourceIds,
    formats,
    maxExistingTags: Number.isFinite(maxExistingTags as number) ? maxExistingTags : undefined,
    offset: Number.isFinite(offset) ? offset : 0,
    minContentLength: Number.isFinite(minContentLength) ? minContentLength : 0,
    maxBatches: Number.isFinite(maxBatches) && maxBatches > 0 ? maxBatches : 20,
    yes,
  };
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function main() {
  console.log('🏷️  Bulk Tag Backfill (Documents)\n');

  const options = parseArgs(process.argv.slice(2));
  const db = new KnowledgeDatabase('./db/knowledge.db');
  const tagger = new SmartTagger();

  console.log('📊 Selecting document-backed units with filters:');
  console.log(`   limit=${options.limit}`);
  console.log(`   sources=${options.sourceIds?.join(',') || '(any)'}`);
  console.log(`   formats=${options.formats?.join(',') || '(any)'}`);
  console.log(
    `   maxExistingTags=${
      typeof options.maxExistingTags === 'number' ? options.maxExistingTags : '(no limit)'
    }`
  );
  console.log(`   offset=${options.offset}`);
  console.log(`   minContentLength=${options.minContentLength}`);
  console.log(`   maxBatches=${options.maxBatches}\n`);

  const units = db.getUnitsForBackfill({
    limit: options.limit,
    sourceIds: options.sourceIds,
    formats: options.formats,
    maxExistingTags: options.maxExistingTags,
    requireDocument: true,
    offset: options.offset,
    minContentLength: options.minContentLength,
    maxBatches: options.maxBatches,
  });

  if (units.length === 0) {
    console.log('⚠️  No matching document units found.');
    db.close();
    return;
  }

  console.log(`✅ Found ${units.length} candidate units`);
  
  if (!options.yes) {
    const confirmed = await confirm('Do you want to proceed with smart tagging?');
    if (!confirmed) {
      console.log('Cancelled.');
      db.close();
      return;
    }
  }
  console.log(''); // newline

  const suggestions = await tagger.tagBatch(units);

  let improved = 0;
  let saved = 0;

  console.log('\n📋 Backfill results:\n');

  for (const unit of units) {
    const suggestion = suggestions.get(unit.id);
    if (!suggestion) continue;

    const newTags = suggestion.tags.filter((t) => !unit.tags.includes(t));
    const categoryChanged = suggestion.category && suggestion.category !== unit.category;
    const keywordAdds = suggestion.keywords.filter((k) => !unit.keywords.includes(k));

    if (newTags.length === 0 && !categoryChanged && keywordAdds.length === 0) {
      continue;
    }

    improved++;
    console.log(`✅ ${unit.title.slice(0, 70)}${unit.title.length > 70 ? '…' : ''}`);
    if (newTags.length > 0) {
      console.log(`   + tags: ${newTags.join(', ')}`);
    }
    if (categoryChanged) {
      console.log(`   category: ${unit.category} → ${suggestion.category}`);
    }
    if (keywordAdds.length > 0) {
      console.log(`   + keywords: ${keywordAdds.slice(0, 8).join(', ')}`);
    }
    console.log(`   confidence: ${(suggestion.confidence * 100).toFixed(0)}%\n`);

    if (options.save) {
      unit.tags = Array.from(new Set([...unit.tags, ...newTags]));
      unit.category = suggestion.category || unit.category;
      unit.keywords = Array.from(new Set([...unit.keywords, ...suggestion.keywords]));
      db.insertAtomicUnit(unit);
      saved++;
    }
  }

  console.log('📈 Summary:');
  console.log(`   processed=${units.length}`);
  console.log(`   improved=${improved}`);
  console.log(`   improvementRate=${((improved / units.length) * 100).toFixed(1)}%`);

  if (options.save) {
    console.log(`   saved=${saved}`);
    console.log('\n✅ Changes saved to the database.');
  } else {
    console.log('\n💡 Use --save to persist tag backfill results.');
  }

  db.close();
}

main().catch((err) => {
  console.error('❌ Bulk tag backfill failed:', err);
  process.exit(1);
});

