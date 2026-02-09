#!/usr/bin/env node
/**
 * Semantic search using vector embeddings
 */

import { EmbeddingsService } from './embeddings-service.js';
import { VectorDatabase } from './vector-database.js';
import { config } from 'dotenv';

config();

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npm run search:semantic <query>');
    console.log('Example: npm run search:semantic "How do I implement OAuth?"');
    console.log('\nOptions:');
    console.log('  --limit <n>     Number of results (default: 10)');
    console.log('  --category <c>  Filter by category');
    console.log('  --type <t>      Filter by type');
    process.exit(1);
  }

  // Parse arguments
  let query = '';
  let limit = 10;
  let page = 1;
  let category: string | undefined;
  let type: string | undefined;
  let dateFrom: string | undefined;
  let dateTo: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') {
      limit = parseInt(args[++i], 10);
    } else if (args[i] === '--page') {
      page = parseInt(args[++i], 10);
    } else if (args[i] === '--offset') {
      const offset = parseInt(args[++i], 10);
      page = Math.ceil(offset / limit) + 1;
    } else if (args[i] === '--category') {
      category = args[++i];
    } else if (args[i] === '--type') {
      type = args[++i];
    } else if (args[i] === '--date-from') {
      dateFrom = args[++i];
    } else if (args[i] === '--date-to') {
      dateTo = args[++i];
    } else if (!args[i].startsWith('--')) {
      query += (query ? ' ' : '') + args[i];
    }
  }

  const embeddingsService = new EmbeddingsService();
  const embeddingProfile = embeddingsService.getProfile();
  if (embeddingProfile.provider === 'openai' && !process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not found for OpenAI embedding profile');
    console.error('Set OPENAI_API_KEY or switch embedding provider/model in config.');
    process.exit(1);
  }

  console.log(`🔍 Semantic Search: "${query}"\n`);

  // Initialize services
  const vectorDb = new VectorDatabase('./atomized/embeddings/chroma', {
    embeddingProfile,
  });

  await vectorDb.init();

  // Check if vector database has data
  const stats = await vectorDb.getStats();
  if (stats.totalVectors === 0) {
    console.log('⚠️  No vectors in database. Generate embeddings first:');
    console.log('   npm run generate-embeddings -- --yes\n');
    return;
  }

  console.log(`📊 Vector database: ${stats.totalVectors} vectors\n`);

  // Generate query embedding
  console.log('🔮 Generating query embedding...');
  const queryEmbedding = await embeddingsService.generateEmbedding(query);
  console.log('✅ Query embedding ready\n');

  // Search
  console.log('🔎 Searching...\n');
  const results = await vectorDb.searchByEmbedding(queryEmbedding, limit, {
    category,
    type: type as any,
  });

  if (results.length === 0) {
    console.log('No results found.');
    return;
  }

  console.log(`Found ${results.length} results:\n`);

  results.forEach((result, i) => {
    const { unit, score } = result;
    const similarityPercent = (score * 100).toFixed(1);

    console.log(`${i + 1}. [${unit.type}] ${unit.title}`);
    console.log(`   Similarity: ${similarityPercent}%`);
    console.log(`   Tags: ${unit.tags.join(', ')}`);
    console.log(`   Category: ${unit.category}`);
    console.log(`   Preview: ${unit.content.slice(0, 150).replace(/\n/g, ' ')}...`);
    console.log('');
  });

  console.log('\n💡 Tip: Use filters to narrow results:');
  console.log('   --category programming');
  console.log('   --type code');
}

main().catch(console.error);
