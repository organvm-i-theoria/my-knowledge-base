#!/usr/bin/env node
/**
 * Search the knowledge base
 */

import { KnowledgeDatabase } from './database.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npm run search <query>');
    console.log('Example: npm run search "OAuth implementation"');
    process.exit(1);
  }

  const query = args.join(' ');

  console.log(`🔍 Searching for: "${query}"\n`);

  const db = new KnowledgeDatabase('./db/knowledge.db');

  // Full-text search
  const results = db.searchText(query);

  if (results.length === 0) {
    console.log('No results found.');
  } else {
    console.log(`Found ${results.length} results:\n`);

    results.forEach((unit, i) => {
      console.log(`${i + 1}. [${unit.type}] ${unit.title}`);
      console.log(`   Tags: ${unit.tags.join(', ')}`);
      console.log(`   Category: ${unit.category}`);
      console.log(`   Preview: ${unit.content.slice(0, 100)}...`);
      console.log('');
    });
  }

  db.close();
}

main();
