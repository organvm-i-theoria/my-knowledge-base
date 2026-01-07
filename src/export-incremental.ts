#!/usr/bin/env node
/**
 * Incremental export - only export new/updated conversations
 */

import { ClaudeSource } from './sources/claude.js';
import { KnowledgeAtomizer } from './atomizer.js';
import { KnowledgeDatabase } from './database.js';
import { MarkdownWriter } from './markdown-writer.js';
import { JSONWriter } from './json-writer.js';
import { EmbeddingsService } from './embeddings-service.js';
import { VectorDatabase } from './vector-database.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { config } from 'dotenv';

config();

interface ExportState {
  lastExportDate: string;
  exportedConversationIds: string[];
}

const STATE_FILE = './db/export-state.json';

function loadExportState(): ExportState {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  }

  return {
    lastExportDate: new Date(0).toISOString(),
    exportedConversationIds: [],
  };
}

function saveExportState(state: ExportState) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function incrementalExport() {
  console.log('🔄 Incremental Export - Only New/Updated Conversations\n');

  const args = process.argv.slice(2);
  const headless = !args.includes('--no-headless');
  const withEmbeddings = args.includes('--with-embeddings');
  const force = args.includes('--force');

  // Load export state
  const state = loadExportState();
  const lastExportDate = new Date(state.lastExportDate);

  console.log(`📅 Last export: ${lastExportDate.toLocaleString()}`);
  console.log(`📊 Previously exported: ${state.exportedConversationIds.length} conversations\n`);

  if (force) {
    console.log('⚠️  Force mode: Re-exporting all conversations\n');
    state.exportedConversationIds = [];
  }

  // Export conversations
  const exporter = new ClaudeSource();

  try {
    await exporter.init({ headless });

    const conversationList = await exporter.listItems();

    // Filter to only new conversations
    const newConversations = conversationList.filter(
      (conv: any) => !state.exportedConversationIds.includes(conv.id)
    );

    if (newConversations.length === 0) {
      console.log('✅ No new conversations to export!');
      await exporter.close();
      return;
    }

    console.log(`📥 Found ${newConversations.length} new conversations to export\n`);

    const conversations = [];
    for (const conv of newConversations) {
      try {
        const conversation = await exporter.exportItem(conv.id);
        conversations.push(conversation);

        // Add to exported list
        state.exportedConversationIds.push(conv.id);

        // Small delay between exports
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Failed to export ${conv.id}:`, error);
      }
    }

    await exporter.close();

    if (conversations.length === 0) {
      console.log('⚠️  No conversations successfully exported');
      return;
    }

    console.log(`\n✅ Exported ${conversations.length} new conversations`);

    // Atomize
    console.log('\n🔬 Atomizing conversations...');
    const atomizer = new KnowledgeAtomizer();
    const allUnits = [];

    for (const conv of conversations) {
      const units = atomizer.atomize(conv);
      allUnits.push(...units);
      console.log(`  - ${conv.title}: ${units.length} units`);
    }

    console.log(`\n✅ Created ${allUnits.length} atomic units`);

    // Save to database
    console.log('\n💾 Saving to database...');
    const db = new KnowledgeDatabase('./db/knowledge.db');

    for (const conv of conversations) {
      db.insertConversation(conv);
    }

    for (const unit of allUnits) {
      db.insertAtomicUnit(unit);
    }

    // Write markdown and JSON
    const markdownWriter = new MarkdownWriter('./atomized/markdown');
    const jsonWriter = new JSONWriter('./atomized/json');

    markdownWriter.writeUnits(allUnits);
    jsonWriter.writeUnits(allUnits);
    jsonWriter.appendToJSONL(allUnits);

    // Generate embeddings if requested
    if (withEmbeddings && process.env.OPENAI_API_KEY) {
      console.log('\n🔮 Generating embeddings...');

      const embeddingsService = new EmbeddingsService();
      const vectorDb = new VectorDatabase('./atomized/embeddings/chroma');
      await vectorDb.init();

      const texts = allUnits.map(u =>
        embeddingsService.prepareText(`${u.title}\n\n${u.content}`)
      );

      const embeddings = await embeddingsService.generateEmbeddings(texts);

      for (let i = 0; i < allUnits.length; i++) {
        allUnits[i].embedding = embeddings[i];
        db.insertAtomicUnit(allUnits[i]);
      }

      await vectorDb.addUnits(allUnits, embeddings);

      console.log(`✅ Generated ${embeddings.length} embeddings`);
    }

    // Update export state
    state.lastExportDate = new Date().toISOString();
    saveExportState(state);

    db.close();

    console.log('\n📊 Final Statistics:');
    const stats = db.getStats();
    console.log(`  - Total conversations: ${stats.totalConversations.count}`);
    console.log(`  - Total atomic units: ${stats.totalUnits.count}`);
    console.log(`  - New units: ${allUnits.length}`);

    console.log('\n🎉 Incremental export complete!');
    console.log(`\n📅 Next export will start from: ${new Date().toLocaleString()}`);

  } catch (error) {
    console.error('\n❌ Export failed:', error);
    process.exit(1);
  }
}

incrementalExport();
