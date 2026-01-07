#!/usr/bin/env node
/**
 * Find relationships between atomic units
 */

import { KnowledgeDatabase } from './database.js';
import { RelationshipDetector } from './relationship-detector.js';
import { config } from 'dotenv';

config();

async function main() {
  console.log('🕸️  Relationship Detection\n');

  // Check for API keys
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Error: ANTHROPIC_API_KEY not found');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not found (needed for embeddings)');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const limit = args.includes('--limit')
    ? parseInt(args[args.indexOf('--limit') + 1], 10)
    : 5;
  const save = args.includes('--save');

  const db = new KnowledgeDatabase('./db/knowledge.db');
  const detector = new RelationshipDetector();

  await detector.init();

  // Get units
  console.log(`📊 Fetching up to ${limit} units...\n`);
  const units = db.searchText('*', limit);

  if (units.length === 0) {
    console.log('⚠️  No units found');
    db.close();
    return;
  }

  // Find relationships
  const relationshipGraph = await detector.buildRelationshipGraph(units);

  // Save to database if requested
  if (save) {
    console.log('\n💾 Saving relationships to database...');

    for (const [unitId, relationships] of relationshipGraph) {
      const unit = units.find(u => u.id === unitId);
      if (!unit) continue;

      // Update related units
      unit.relatedUnits = relationships.map(r => r.toUnit);
      db.insertAtomicUnit(unit);

      // Save relationships
      for (const rel of relationships) {
        // Using SQLite prepared statements (safe)
        const stmt = (db as any).db.prepare(`
          INSERT OR REPLACE INTO unit_relationships
          (from_unit, to_unit, relationship_type)
          VALUES (?, ?, ?)
        `);
        stmt.run(rel.fromUnit, rel.toUnit, rel.relationshipType);
      }
    }

    console.log('✅ Relationships saved');
  }

  // Show relationship summary
  console.log('\n🔍 Relationship Summary:\n');

  for (const [unitId, relationships] of relationshipGraph) {
    if (relationships.length === 0) continue;

    const unit = units.find(u => u.id === unitId);
    if (!unit) continue;

    console.log(`📌 ${unit.title}`);
    relationships.forEach(rel => {
      const relatedUnit = units.find(u => u.id === rel.toUnit);
      if (!relatedUnit) return;

      console.log(`   → [${rel.relationshipType}] ${relatedUnit.title}`);
      console.log(`      Strength: ${(rel.strength * 100).toFixed(0)}%`);
      console.log(`      ${rel.explanation}\n`);
    });
  }

  db.close();
}

main();
