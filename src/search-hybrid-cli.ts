#!/usr/bin/env node
/**
 * Hybrid search CLI - combines FTS and semantic search
 */

import { HybridSearch } from './hybrid-search.js';
import { config } from 'dotenv';

config();

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npm run search:hybrid <query>');
    console.log('Example: npm run search:hybrid "OAuth implementation patterns"');
    console.log('\nOptions:');
    console.log('  --limit <n>         Number of results (default: 10)');
    console.log('  --fts-weight <w>    FTS weight 0-1 (default: 0.4)');
    console.log('  --semantic-weight <w> Semantic weight 0-1 (default: 0.6)');
    console.log('\n💡 Hybrid search combines:');
    console.log('  - Full-text search (keyword matching)');
    console.log('  - Semantic search (meaning similarity)');
    process.exit(1);
  }

  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not found in environment');
    console.error('Please create a .env file with your OpenAI API key.');
    process.exit(1);
  }

  // Parse arguments
  let query = '';
  let limit = 10;
  let ftsWeight = 0.4;
  let semanticWeight = 0.6;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') {
      limit = parseInt(args[++i], 10);
    } else if (args[i] === '--fts-weight') {
      ftsWeight = parseFloat(args[++i]);
    } else if (args[i] === '--semantic-weight') {
      semanticWeight = parseFloat(args[++i]);
    } else if (!args[i].startsWith('--')) {
      query += (query ? ' ' : '') + args[i];
    }
  }

  console.log(`🔍 Hybrid Search: "${query}"\n`);
  console.log(`⚖️  Weights: FTS=${ftsWeight}, Semantic=${semanticWeight}\n`);

  // Initialize hybrid search
  const hybridSearch = new HybridSearch();
  await hybridSearch.init();

  // Search
  console.log('🔎 Searching (FTS + Semantic)...\n');
  const startTime = Date.now();

  try {
    const results = await hybridSearch.search(query, limit, {
      fts: ftsWeight,
      semantic: semanticWeight,
    });

    const duration = Date.now() - startTime;

    if (results.length === 0) {
      console.log('No results found.');
      return;
    }

    console.log(`Found ${results.length} results in ${duration}ms:\n`);

    results.forEach((result, i) => {
      const { unit, ftsScore, semanticScore, combinedScore } = result;

      console.log(`${i + 1}. [${unit.type}] ${unit.title}`);
      console.log(`   Combined Score: ${(combinedScore * 100).toFixed(1)}%`);
      console.log(`   ├─ FTS: ${ftsScore > 0 ? '✓' : '✗'} ${ftsScore > 0 ? `(${(ftsScore * 100).toFixed(1)}%)` : ''}`);
      console.log(`   └─ Semantic: ${semanticScore > 0 ? '✓' : '✗'} ${semanticScore > 0 ? `(${(semanticScore * 100).toFixed(1)}%)` : ''}`);
      console.log(`   Tags: ${unit.tags.join(', ')}`);
      console.log(`   Category: ${unit.category}`);
      console.log(`   Preview: ${unit.content.slice(0, 120).replace(/\n/g, ' ')}...`);
      console.log('');
    });

    console.log('\n💡 Tips:');
    console.log('  - Increase --fts-weight for exact keyword matching');
    console.log('  - Increase --semantic-weight for conceptual similarity');
    console.log('  - Use npm run search for FTS-only (faster)');
    console.log('  - Use npm run search:semantic for semantic-only');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    hybridSearch.close();
  }
}

main();
