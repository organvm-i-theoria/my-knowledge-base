#!/usr/bin/env node
/**
 * Summarize conversations using Claude
 */

import { ConversationSummarizer } from './conversation-summarizer.js';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';
import { Conversation } from './types.js';

config();

async function main() {
  console.log('📋 Conversation Summarization\n');

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Error: ANTHROPIC_API_KEY not found');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const target = args[0];
  const saveToFile = args.includes('--save');

  if (!target) {
    console.log('Usage: npm run summarize <conversation-id | all>');
    console.log('\nExamples:');
    console.log('  npm run summarize all           # Summarize all');
    console.log('  npm run summarize abc123        # Summarize one');
    console.log('  npm run summarize all --save    # Save summaries');
    process.exit(1);
  }

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
    console.log(`Loaded: ${conv.title}\n`);
  }

  // Summarize
  const summarizer = new ConversationSummarizer();
  const summaries = await summarizer.summarizeBatch(conversations);

  // Display summaries
  console.log('\n📄 Summaries:\n');

  for (const [convId, summary] of summaries) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📌 ${summary.title}\n`);
    console.log(`${summary.summary}\n`);
    console.log(`Key Points:`);
    summary.keyPoints.forEach((point, i) => {
      console.log(`  ${i + 1}. ${point}`);
    });
    console.log(`\nTopics: ${summary.topics.join(', ')}`);
    console.log(`Technologies: ${summary.technologiesMentioned.join(', ')}`);
    console.log(`Outcome: ${summary.outcome}\n`);
  }

  // Save summaries if requested
  if (saveToFile) {
    const summariesArray = Array.from(summaries.values());
    const outputPath = './atomized/summaries.json';

    writeFileSync(
      outputPath,
      JSON.stringify(summariesArray, null, 2)
    );

    console.log(`\n💾 Summaries saved to: ${outputPath}`);

    // Create collection summary
    if (summariesArray.length > 1) {
      console.log('\n📊 Creating collection summary...');
      const collectionSummary = await summarizer.summarizeCollection(summariesArray);

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📚 Collection Overview\n');
      console.log(collectionSummary);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
  }
}

main();
