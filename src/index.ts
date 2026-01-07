/**
 * Main CLI entry point for knowledge base system
 */

import { KnowledgeAtomizer } from './atomizer.js';
import { KnowledgeDatabase } from './database.js';
import { MarkdownWriter } from './markdown-writer.js';
import { JSONWriter } from './json-writer.js';

async function main() {
  console.log('🚀 Knowledge Base System - Phase 1\n');

  // Initialize components
  const db = new KnowledgeDatabase('./db/knowledge.db');
  const atomizer = new KnowledgeAtomizer();
  const markdownWriter = new MarkdownWriter('./atomized/markdown');
  const jsonWriter = new JSONWriter('./atomized/json');

  console.log('📊 Current database stats:');
  const stats = db.getStats();
  console.log(`  - Conversations: ${stats.totalConversations.count}`);
  console.log(`  - Atomic units: ${stats.totalUnits.count}`);
  console.log(`  - Tags: ${stats.totalTags.count}`);
  if (stats.unitsByType.length > 0) {
    console.log('  - Units by type:');
    stats.unitsByType.forEach(({ type, count }) => {
      console.log(`    - ${type}: ${count}`);
    });
  }

  console.log('\n📋 Available commands:');
  console.log('  1. Export conversations from claude.app');
  console.log('  2. Process existing exports');
  console.log('  3. Search knowledge base');
  console.log('  4. View stats');
  console.log('  5. Exit');

  // For Phase 1, we'll run a demo export
  console.log('\n🎯 Phase 1 Demo: Manual export mode');
  console.log('   Place exported JSON files in ./raw/claude-app/');
  console.log('   Then run this script to process them.\n');

  db.close();
}

main().catch(console.error);
