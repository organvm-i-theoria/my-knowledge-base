#!/usr/bin/env node
/**
 * Extract insights from conversations using Claude
 */

import { KnowledgeDatabase } from './database.js';
import { InsightExtractor } from './insight-extractor.js';
import { MarkdownWriter } from './markdown-writer.js';
import { JSONWriter } from './json-writer.js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';
import { Conversation } from './types.js';

config();

async function main() {
  console.log('🧠 Intelligent Insight Extraction\n');

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Error: ANTHROPIC_API_KEY not found in environment');
    console.error('Please add your Anthropic API key to .env');
    process.exit(1);
  }

  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npm run extract-insights <conversation-id | all>');
    console.log('\nExamples:');
    console.log('  npm run extract-insights all         # All conversations');
    console.log('  npm run extract-insights abc123      # Specific conversation');
    console.log('\nOptions:');
    console.log('  --save    Save insights to database');
    process.exit(1);
  }

  const target = args[0];
  const save = args.includes('--save');

  // Load conversations
  const rawDir = './raw/claude-app';
  const files = readdirSync(rawDir).filter(f => f.endsWith('.json'));

  const conversations: Conversation[] = [];

  if (target === 'all') {
    for (const file of files) {
      const conv = JSON.parse(readFileSync(join(rawDir, file), 'utf-8'));
      conversations.push(conv);
    }
    console.log(`Loaded ${conversations.length} conversations\n`);
  } else {
    const file = files.find(f => f.includes(target));
    if (!file) {
      console.error(`❌ Conversation ${target} not found`);
      process.exit(1);
    }
    const conv = JSON.parse(readFileSync(join(rawDir, file), 'utf-8'));
    conversations.push(conv);
    console.log(`Loaded conversation: ${conv.title}\n`);
  }

  // Extract insights
  const extractor = new InsightExtractor();
  const allInsights = await extractor.extractBatch(conversations);

  // Collect all insights
  const insights = Array.from(allInsights.values()).flat();

  console.log(`\n✅ Extracted ${insights.length} total insights`);

  // Save if requested
  if (save) {
    console.log('\n💾 Saving insights...');

    const db = new KnowledgeDatabase('./db/knowledge.db');
    const mdWriter = new MarkdownWriter('./atomized/markdown');
    const jsonWriter = new JSONWriter('./atomized/json');

    // Save to database
    for (const insight of insights) {
      db.insertAtomicUnit(insight);
    }

    // Save to markdown and JSON
    mdWriter.writeUnits(insights);
    jsonWriter.writeUnits(insights);
    jsonWriter.appendToJSONL(insights);

    db.close();

    console.log('✅ Insights saved to database, markdown, and JSON');
    console.log('\n📁 Output locations:');
    console.log('  - Database: ./db/knowledge.db');
    console.log('  - Markdown: ./atomized/markdown/');
    console.log('  - JSON: ./atomized/json/');
  }

  // Show sample insights
  console.log('\n🔍 Sample Insights:');
  insights.slice(0, 3).forEach((insight, i) => {
    console.log(`\n${i + 1}. [${insight.type}] ${insight.title}`);
    console.log(`   ${insight.content.slice(0, 150)}...`);
    console.log(`   Tags: ${insight.tags.join(', ')}`);
  });

  console.log('\n💡 Tip: Use --save to persist insights to the knowledge base');
}

main();
