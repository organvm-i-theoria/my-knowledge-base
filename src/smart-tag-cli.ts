#!/usr/bin/env node
/**
 * Smart tagging CLI - enhance existing units with Claude-powered tags
 */

import { KnowledgeDatabase } from './database.js';
import { SmartTagger } from './smart-tagger.js';
import { config } from 'dotenv';

config();

async function main() {
  console.log('🏷️  Smart Auto-Tagging with Claude\n');

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Error: ANTHROPIC_API_KEY not found in environment');
    console.error('Please add your Anthropic API key to .env');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const limit = args.includes('--limit')
    ? parseInt(args[args.indexOf('--limit') + 1], 10)
    : 10;
  const save = args.includes('--save');

  const db = new KnowledgeDatabase('./db/knowledge.db');
  const tagger = new SmartTagger();

  // Get units (limit for testing)
  console.log(`📊 Fetching up to ${limit} units from database...\n`);
  const units = db.searchText('*', limit);

  if (units.length === 0) {
    console.log('⚠️  No units found in database');
    db.close();
    return;
  }

  console.log(`Found ${units.length} units\n`);

  // Generate smart tags
  const tagSuggestions = await tagger.tagBatch(units);

  // Show results
  console.log('\n📋 Tagging Results:\n');

  let improved = 0;
  for (const unit of units) {
    const suggestions = tagSuggestions.get(unit.id);
    if (!suggestions) continue;

    const newTags = suggestions.tags.filter(t => !unit.tags.includes(t));
    if (newTags.length > 0) {
      improved++;
      console.log(`✅ ${unit.title.slice(0, 50)}...`);
      console.log(`   Old tags: ${unit.tags.join(', ')}`);
      console.log(`   New tags: ${newTags.join(', ')}`);
      console.log(`   Category: ${unit.category} → ${suggestions.category}`);
      console.log(`   Confidence: ${(suggestions.confidence * 100).toFixed(0)}%\n`);

      // Update unit if saving
      if (save) {
        unit.tags = [...new Set([...unit.tags, ...newTags])];
        unit.category = suggestions.category || unit.category;
        unit.keywords = [...new Set([...unit.keywords, ...suggestions.keywords])];
        db.insertAtomicUnit(unit);
      }
    }
  }

  console.log(`\n📈 Summary:`);
  console.log(`  - Units processed: ${units.length}`);
  console.log(`  - Units improved: ${improved}`);
  console.log(`  - Improvement rate: ${((improved / units.length) * 100).toFixed(1)}%`);

  if (save) {
    console.log('\n✅ Tags saved to database');
  } else {
    console.log('\n💡 Add --save to persist tags to database');
  }

  db.close();
}

main();
