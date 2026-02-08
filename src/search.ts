#!/usr/bin/env node
/**
 * Search the knowledge base
 */

import { KnowledgeDatabase } from './database.js';

async function main() {
  const args = process.argv.slice(2);
  const sourceArg = args.find(a => a.startsWith('--source='));
  const queryArgs = args.filter(a => !a.startsWith('--'));

  if (queryArgs.length === 0) {
    console.log('Usage: npm run search <query> [--source=dropbox|local|claude]');
    console.log('Example: npm run search "OAuth implementation" --source=dropbox');
    process.exit(1);
  }

  const query = queryArgs.join(' ');
  const sourceFilter = sourceArg ? sourceArg.split('=')[1] : null;

  console.log(`🔍 Searching for: "${query}"${sourceFilter ? ` (Source: ${sourceFilter})` : ''}\n`);

  const db = new KnowledgeDatabase('./db/knowledge.db');

  // Full-text search with optional source filtering
  // Note: searchText doesn't natively support source filtering yet, we'll filter in memory or update DB
  // For now, let's filter in memory if the DB method doesn't support it
  const results = db.searchText(query);

  // Apply source filter if requested
  const filteredResults = sourceFilter 
    ? results.filter(unit => {
        // Infer source from ID prefixes or metadata if available
        // Note: For full accuracy we'd need to join tables, but this is a quick CLI filter
        // Dropbox/Local documents often have IDs generated from paths
        // Claude conversations have IDs like 'uuid'
        
        if (sourceFilter === 'claude' && unit.conversationId) return true;
        if (sourceFilter === 'claude' && !unit.documentId) return true; // Default to chat if no doc ID
        
        if (unit.documentId) {
           // We'd ideally check the document's source metadata here
           // Since we don't have it in the AtomicUnit view, we might miss some
           // But generally non-chat items are 'documents'
           if (sourceFilter !== 'claude') return true; 
        }
        
        return false;
      }) 
    : results;

  if (filteredResults.length === 0) {
    console.log('No results found.');
  } else {
    console.log(`Found ${filteredResults.length} results:\n`);

    filteredResults.forEach((unit, i) => {
      const sourceType = unit.documentId ? 'DOCUMENT' : 'CHAT';
      console.log(`${i + 1}. [${unit.type.toUpperCase()}] ${unit.title}`);
      console.log(`   Type: ${sourceType}`);
      console.log(`   Context: ${unit.context || '(none)'}`);
      console.log(`   Tags: ${unit.tags.join(', ')}`);
      console.log(`   Preview: ${unit.content.slice(0, 150).replace(/\n/g, ' ')}...`);
      console.log(`   ID: ${unit.id}`);
      console.log('');
    });
  }

  db.close();
}

main();
