#!/usr/bin/env node
/**
 * Taxonomy Audit & Repair CLI.
 * Identifies and fixes unknown categories and malformed tags.
 */

import { config } from 'dotenv';
import { KnowledgeDatabase } from './database.js';
import { ALLOWED_CATEGORIES, normalizeCategory, normalizeTag } from './taxonomy.js';
import { getConfig } from './config.js';

config();

function parseArgs(argv: string[]) {
  const repair = argv.includes('--repair') || argv.includes('repair');
  const dryRun = argv.includes('--dry-run');
  return { repair, dryRun };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('🏷️  Taxonomy Audit & Repair Tool\n');

  const config = getConfig().getAll();
  const dbPath = process.env.DB_PATH || config.database?.path || './db/knowledge.db';
  const db = new KnowledgeDatabase(dbPath);

  // Access private db instance for raw queries
  const rawDb = (db as any).db;

  try {
    // 1. Audit Categories
    console.log('--- Categories ---');
    const categories = rawDb.prepare(`
      SELECT category, COUNT(*) as count 
      FROM atomic_units 
      GROUP BY category 
      ORDER BY count DESC
    `).all() as Array<{ category: string; count: number }>;

    const unknownCategories: Array<{ original: string; normalized: string; count: number }> = [];

    for (const row of categories) {
      const isAllowed = (ALLOWED_CATEGORIES as readonly string[]).includes(row.category);
      if (!isAllowed) {
        const normalized = normalizeCategory(row.category);
        unknownCategories.push({
          original: row.category,
          normalized,
          count: row.count,
        });
        console.log(`  ❌ Unknown: "${row.category}" (${row.count}) -> Suggest: "${normalized}"`);
      } else {
        console.log(`  ✅ ${row.category} (${row.count})`);
      }
    }

    if (unknownCategories.length === 0) {
      console.log('  ✨ All categories are valid.');
    }

    // 2. Audit Tags
    console.log('\n--- Tags ---');
    const tags = rawDb.prepare(`
      SELECT name, COUNT(*) as count 
      FROM tags
    `).all() as Array<{ name: string; count: number }>;

    const malformedTags: Array<{ original: string; normalized: string; count: number }> = [];

    for (const row of tags) {
      const normalized = normalizeTag(row.name);
      if (normalized !== row.name) {
        malformedTags.push({
          original: row.name,
          normalized,
          count: row.count,
        });
        // Limit output for tags
        if (malformedTags.length <= 10) {
            console.log(`  ❌ Malformed: "${row.name}" -> Suggest: "${normalized}"`);
        }
      }
    }

    if (malformedTags.length > 10) {
        console.log(`  ... and ${malformedTags.length - 10} more malformed tags.`);
    }

    if (malformedTags.length === 0) {
      console.log('  ✨ All tags are valid.');
    }

    // 3. Repair
    if (args.repair) {
      console.log('\n--- Repairing ---');
      if (args.dryRun) {
        console.log('  (Dry Run - no changes will be saved)');
      }

      // Repair Categories
      const updateCategory = rawDb.prepare('UPDATE atomic_units SET category = ? WHERE category = ?');
      let catFixes = 0;
      for (const item of unknownCategories) {
        console.log(`  Fixing category "${item.original}" -> "${item.normalized}"...`);
        if (!args.dryRun) {
          updateCategory.run(item.normalized, item.original);
        }
        catFixes += item.count;
      }

      // Repair Tags
      // Tag repair is harder because we might merge duplicate tags (e.g. "React" -> "react" where "react" already exists).
      // For now, we will just fix the tag name in the `tags` table if it doesn't conflict.
      // If it conflicts, we must merge. This is complex.
      // We'll skip complex merge for now and just print warning.
      
      console.log(`  (Tag repair not fully implemented in this safe version. Use --dry-run to check.)`);
    }

  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('❌ Taxonomy tool failed:', err);
  process.exit(1);
});