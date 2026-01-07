#!/usr/bin/env node
/**
 * Generate embeddings for all atomic units in the database
 */

import { KnowledgeDatabase } from './database.js';
import { EmbeddingsService } from './embeddings-service.js';
import { VectorDatabase } from './vector-database.js';
import { config } from 'dotenv';

config();

async function main() {
  console.log('🔮 Generating Embeddings for Knowledge Base\n');

  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not found in environment');
    console.error('Please create a .env file with your OpenAI API key:');
    console.error('OPENAI_API_KEY=sk-...\n');
    process.exit(1);
  }

  // Initialize services
  const db = new KnowledgeDatabase('./db/knowledge.db');
  const embeddingsService = new EmbeddingsService();
  const vectorDb = new VectorDatabase('./atomized/embeddings/chroma');

  await vectorDb.init();

  // Get all units from database
  console.log('📊 Fetching atomic units from database...');
  const allUnits = db.searchText('*', 100000); // Get all units

  if (allUnits.length === 0) {
    console.log('⚠️  No units found in database. Export some conversations first.');
    db.close();
    return;
  }

  console.log(`Found ${allUnits.length} atomic units\n`);

  // Show model info
  const modelInfo = embeddingsService.getModelInfo();
  console.log('📐 Embedding Model:');
  console.log(`  - Model: ${modelInfo.model}`);
  console.log(`  - Dimensions: ${modelInfo.dimensions}`);
  console.log(`  - Cost: ${modelInfo.cost}`);
  console.log('');

  // Estimate cost
  const avgChars = allUnits.reduce((sum, u) => sum + u.content.length + u.title.length, 0) / allUnits.length;
  const avgTokens = avgChars / 4; // Rough estimation
  const totalTokens = avgTokens * allUnits.length;
  const estimatedCost = (totalTokens / 1_000_000) * 0.02; // $0.02 per 1M tokens

  console.log('💰 Cost Estimate:');
  console.log(`  - Total tokens: ~${Math.round(totalTokens).toLocaleString()}`);
  console.log(`  - Estimated cost: $${estimatedCost.toFixed(4)}`);
  console.log('');

  // Confirm
  const args = process.argv.slice(2);
  if (!args.includes('--yes')) {
    console.log('⚠️  This will generate embeddings for all units.');
    console.log('   Run with --yes to confirm:');
    console.log('   npm run generate-embeddings -- --yes\n');
    db.close();
    return;
  }

  // Prepare texts
  console.log('📝 Preparing texts...');
  const texts = allUnits.map(u =>
    embeddingsService.prepareText(`${u.title}\n\n${u.content}`)
  );

  // Generate embeddings
  console.log('🔮 Generating embeddings...');
  const startTime = Date.now();

  try {
    const embeddings = await embeddingsService.generateEmbeddings(texts);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Generated ${embeddings.length} embeddings in ${duration}s\n`);

    // Update database with embeddings
    console.log('💾 Saving embeddings to SQLite database...');
    for (let i = 0; i < allUnits.length; i++) {
      allUnits[i].embedding = embeddings[i];
      db.insertAtomicUnit(allUnits[i]); // Will update existing
    }
    console.log('✅ SQLite database updated\n');

    // Add to vector database
    console.log('🗄️  Adding to ChromaDB vector database...');
    await vectorDb.addUnits(allUnits, embeddings);

    const vectorStats = await vectorDb.getStats();
    console.log(`✅ Vector database: ${vectorStats.totalVectors} vectors stored\n`);

    // Show final stats
    console.log('📊 Final Statistics:');
    console.log(`  - Units processed: ${allUnits.length}`);
    console.log(`  - Embeddings generated: ${embeddings.length}`);
    console.log(`  - Vector dimensions: ${modelInfo.dimensions}`);
    console.log(`  - Processing time: ${duration}s`);
    console.log(`  - Average time per unit: ${(parseFloat(duration) / allUnits.length).toFixed(3)}s`);

    console.log('\n🎉 Embeddings generation complete!');
    console.log('\nYou can now use semantic search:');
    console.log('  npm run search:semantic "How do I implement OAuth?"');

  } catch (error) {
    console.error('\n❌ Error generating embeddings:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
