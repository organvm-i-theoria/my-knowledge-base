#!/usr/bin/env node
/**
 * CLI to clip a URL and add it to the knowledge base.
 */

import { config } from 'dotenv';
import { WebClipperSource } from './sources/web-clipper.js';
import { KnowledgeDatabase } from './database.js';
import { KnowledgeAtomizer } from './atomizer.js';
import { MarkdownWriter } from './markdown-writer.js';

config();

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.log('Usage: npx tsx src/clip-url-cli.ts <url>');
    process.exit(1);
  }

  const clipper = new WebClipperSource();
  const db = new KnowledgeDatabase('./db/knowledge.db');
  const atomizer = new KnowledgeAtomizer();
  const mdWriter = new MarkdownWriter('./atomized/markdown');

  try {
    const item = await clipper.clipUrl(url);
    if (!item) {
      console.error('Failed to clip URL.');
      process.exit(1);
    }

    // Save Document
    db.insertDocument(item as any);
    
    // Atomize
    console.log('   Atomizing content...');
    const units = atomizer.atomize(item);
    console.log(`   Generated ${units.length} units.`);

    // Save Units
    units.forEach(u => db.insertAtomicUnit(u));
    mdWriter.writeUnits(units);

    console.log('✅ URL clipped and indexed successfully.');

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    db.close();
  }
}

main();
