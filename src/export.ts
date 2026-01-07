#!/usr/bin/env node
/**
 * Export script - exports conversations from claude.app
 */

import { SourceManager } from './sources/manager.js';
import { KnowledgeAtomizer } from './atomizer.js';
import { KnowledgeDatabase } from './database.js';
import { MarkdownWriter } from './markdown-writer.js';
import { JSONWriter } from './json-writer.js';
import { EmbeddingsService } from './embeddings-service.js';
import { VectorDatabase } from './vector-database.js';
import { Conversation, KnowledgeDocument } from './types.js';
import { config } from 'dotenv';

config();

async function main() {
  console.log('🚀 Universal Knowledge Exporter\n');

  const args = process.argv.slice(2);
  const headless = !args.includes('--no-headless');
  const withEmbeddings = args.includes('--with-embeddings');

  console.log('Starting ingestion process...');
  console.log(`Headless mode: ${headless ? 'YES' : 'NO (you can see the browser)'}`);
  console.log(`Generate embeddings: ${withEmbeddings ? 'YES' : 'NO'}\n`);

  // Step 1: Ingest from all sources
  const manager = new SourceManager();

  try {
    const items = await manager.ingestAll({ headless });

    if (items.length === 0) {
      console.log('\n⚠️  No knowledge items ingested');
      return;
    }

    console.log(`\n✅ Ingested ${items.length} total items`);

    // Separate conversations and documents (for different processing if needed)
    const conversations = items.filter(i => 'messages' in i) as Conversation[];
    const documents = items.filter(i => !('messages' in i)) as KnowledgeDocument[];

    // Step 2: Atomize items
    console.log('\n🔬 Atomizing ingested items...');
    const atomizer = new KnowledgeAtomizer();
    const allUnits = [];

    for (const conv of conversations) {
      const units = atomizer.atomize(conv);
      allUnits.push(...units);
      console.log(`  - [Chat] ${conv.title}: ${units.length} units`);
    }

    for (const doc of documents) {
      const units = atomizer.atomize(doc);
      allUnits.push(...units);
      console.log(`  - [Doc] ${doc.title}: ${units.length} units`);
    }

    console.log(`\n✅ Created ${allUnits.length} atomic units`);

    // Step 3: Save to database
    console.log('\n💾 Saving to database...');
    const db = new KnowledgeDatabase('./db/knowledge.db');

    for (const conv of conversations) {
      db.insertConversation(conv);
    }

    for (const doc of documents) {
      db.insertDocument(doc);
    }
    
    for (const unit of allUnits) {
      db.insertAtomicUnit(unit);
    }

    console.log('✅ Database updated');

    // Step 4: Write markdown files
    console.log('\n📝 Writing markdown files...');
    const markdownWriter = new MarkdownWriter('./atomized/markdown');
    markdownWriter.writeUnits(allUnits);

    // Step 5: Write JSON files
    console.log('\n📄 Writing JSON files...');
    const jsonWriter = new JSONWriter('./atomized/json');
    jsonWriter.writeUnits(allUnits);
    jsonWriter.writeIndex(allUnits);
    jsonWriter.appendToJSONL(allUnits);

    // Step 6: Show stats
    console.log('\n📊 Final Statistics:');
    const stats = db.getStats();
    console.log(`  - Total conversations: ${stats.totalConversations.count}`);
    console.log(`  - Total documents: ${stats.totalDocuments.count}`);
    console.log(`  - Total atomic units: ${stats.totalUnits.count}`);
    console.log(`  - Total tags: ${stats.totalTags.count}`);
    console.log('  - Units by type:');
    stats.unitsByType.forEach(({ type, count }) => {
      console.log(`    - ${type}: ${count}`);
    });

    // Step 7: Generate embeddings (optional)
    if (withEmbeddings) {
      if (!process.env.OPENAI_API_KEY) {
        console.log('\n⚠️  Skipping embeddings: OPENAI_API_KEY not found');
        console.log('   Set OPENAI_API_KEY in .env to enable embeddings');
      } else {
        console.log('\n🔮 Generating embeddings...');

        const embeddingsService = new EmbeddingsService();
        const vectorDb = new VectorDatabase('./atomized/embeddings/chroma');
        await vectorDb.init();

        // Prepare texts
        const texts = allUnits.map(u =>
          embeddingsService.prepareText(`${u.title}\n\n${u.content}`)
        );

        // Generate embeddings
        const embeddings = await embeddingsService.generateEmbeddings(texts);

        // Update units with embeddings
        for (let i = 0; i < allUnits.length; i++) {
          allUnits[i].embedding = embeddings[i];
          db.insertAtomicUnit(allUnits[i]); // Update with embedding
        }

        // Add to vector database
        await vectorDb.addUnits(allUnits, embeddings);

        console.log(`✅ Generated and stored ${embeddings.length} embeddings`);
      }
    }

    db.close();

    console.log('\n🎉 Export and atomization complete!');
    console.log('\n📁 Output locations:');
    console.log('  - Raw exports: ./raw/claude-app/');
    console.log('  - Markdown: ./atomized/markdown/');
    console.log('  - JSON: ./atomized/json/');
    console.log('  - Database: ./db/knowledge.db');

    if (withEmbeddings && process.env.OPENAI_API_KEY) {
      console.log('  - Vector DB: ./atomized/embeddings/chroma');
      console.log('\n🔍 You can now use semantic search:');
      console.log('   npm run search:semantic "your query"');
      console.log('   npm run search:hybrid "your query"');
    } else if (!withEmbeddings) {
      console.log('\n💡 Tip: Add --with-embeddings to enable semantic search:');
      console.log('   npm run export:dev -- --with-embeddings');
    }

  } catch (error) {
    console.error('\n❌ Export failed:', error);
    process.exit(1);
  }
}

main();
