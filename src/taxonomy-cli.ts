#!/usr/bin/env node
/**
 * Taxonomy Audit & Repair CLI
 */

import { config } from 'dotenv';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { KnowledgeDatabase } from './database.js';
import { ALLOWED_CATEGORIES, normalizeCategory, normalizeTag } from './taxonomy.js';

config({ override: false });

interface CliOptions {
  mode: 'audit' | 'repair';
  save: boolean;
  yes: boolean;
  dbPath?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const mode = argv.includes('repair') ? 'repair' : 'audit';
  const save = argv.includes('--save');
  const yes = argv.includes('--yes');
  const dbFlagIndex = argv.indexOf('--db');
  const dbPath = dbFlagIndex >= 0 ? argv[dbFlagIndex + 1] : undefined;
  return { mode, save, yes, dbPath };
}

function resolveDbPath(overridePath?: string): string {
  if (overridePath?.trim()) {
    return resolve(overridePath.trim());
  }

  const configured = process.env.DB_PATH?.trim();
  if (configured) {
    return resolve(configured);
  }

  const currentFile = fileURLToPath(import.meta.url);
  return resolve(dirname(currentFile), '..', 'db', 'knowledge.db');
}

function syncAtomicUnitTagsFromUnitTags(dbHandle: ReturnType<KnowledgeDatabase['getRawHandle']>): {
  totalUnits: number;
  unitsWithTagLinks: number;
} {
  const units = dbHandle.prepare('SELECT id FROM atomic_units').all() as { id: string }[];
  const clearDenormalized = dbHandle.prepare(`UPDATE atomic_units SET tags = '[]'`);
  const writeDenormalized = dbHandle.prepare(`UPDATE atomic_units SET tags = ? WHERE id = ?`);
  const groupedTags = dbHandle.prepare(`
    SELECT grouped.unit_id, grouped.tags_json
    FROM (
      SELECT unit_id, json_group_array(tag_name) AS tags_json
      FROM (
        SELECT ut.unit_id AS unit_id, t.name AS tag_name
        FROM unit_tags ut
        JOIN tags t ON t.id = ut.tag_id
        ORDER BY ut.unit_id, t.name
      ) ordered_tags
      GROUP BY unit_id
    ) grouped
  `).all() as { unit_id: string; tags_json: string }[];

  clearDenormalized.run();
  for (const row of groupedTags) {
    writeDenormalized.run(row.tags_json, row.unit_id);
  }

  // Keep FTS tags in sync with denormalized JSON values.
  dbHandle.prepare(`INSERT INTO units_fts(units_fts) VALUES('rebuild')`).run();

  return { totalUnits: units.length, unitsWithTagLinks: groupedTags.length };
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`🔍 Taxonomy CLI: ${options.mode.toUpperCase()} mode\n`);

  const dbPath = resolveDbPath(options.dbPath);
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new KnowledgeDatabase(dbPath);
  const dbHandle = db.getRawHandle();

  if (options.mode === 'audit') {
    // Audit Categories
    const categoryStats = db.getCategoryFacets();
    const unknownCategories = categoryStats.filter(c => !ALLOWED_CATEGORIES.includes(c.value as any));
    
    console.log('📊 Category Audit:');
    if (unknownCategories.length === 0) {
      console.log('✅ All categories are valid.');
    } else {
      console.log(`⚠️  Found ${unknownCategories.length} invalid categories:`);
      unknownCategories.forEach(c => {
        const normalized = normalizeCategory(c.value);
        console.log(`   "${c.value}" (${c.count} units) → should be "${normalized}"`);
      });
    }
    console.log('');

    // Audit Tags (This is harder because there isn't a getTagsFacet that returns ALL tags efficiently without limit)
    // Let's use SQL directly for audit.
    const tagStmt = dbHandle.prepare(`
      SELECT name, COUNT(*) as count 
      FROM tags 
      GROUP BY name 
    `);
    const allTags = tagStmt.all() as { name: string; count: number }[];
    
    const malformedTags = allTags.filter(t => t.name !== normalizeTag(t.name));
    
    console.log('🏷️  Tag Audit:');
    if (malformedTags.length === 0) {
      console.log('✅ All tags are normalized.');
    } else {
      console.log(`⚠️  Found ${malformedTags.length} malformed tags:`);
      // Show top 20
      malformedTags.sort((a, b) => b.count - a.count).slice(0, 20).forEach(t => {
        console.log(`   "${t.name}" (${t.count} uses) → should be "${normalizeTag(t.name)}"`);
      });
      if (malformedTags.length > 20) console.log(`   ...and ${malformedTags.length - 20} more.`);
    }

    if (unknownCategories.length > 0 || malformedTags.length > 0) {
      console.log('\n💡 Run "tsx src/taxonomy-cli.ts repair --save" to fix these issues.');
    }

  } else if (options.mode === 'repair') {
    // Repair Mode
    // 1. Repair Categories
    const categoryStats = db.getCategoryFacets();
    const unknownCategories = categoryStats.filter(c => !ALLOWED_CATEGORIES.includes(c.value as any));
    
    let updatesCount = 0;
    
    if (unknownCategories.length > 0) {
      console.log(`🔧 Repairing ${unknownCategories.length} invalid categories...`);
      for (const cat of unknownCategories) {
        const normalized = normalizeCategory(cat.value);
        console.log(`   Mapping "${cat.value}" -> "${normalized}"`);
        
        if (options.save) {
           dbHandle.prepare('UPDATE atomic_units SET category = ? WHERE category = ?').run(normalized, cat.value);
        }
        updatesCount += cat.count;
      }
    }

    // 2. Repair Tags
    // We need to:
    // a) Find malformed tags
    // b) For each malformed tag, check if the normalized version exists in `tags` table.
    //    If yes, re-link units to the normalized tag ID and delete the old tag link.
    //    If no, update the tag name in `tags` table.
    // This is complex to do efficiently. 
    
    // Simpler approach for now: iterate units? No, too slow.
    // SQL approach:
    
    const tagStmt = dbHandle.prepare('SELECT id, name FROM tags');
    const allTags = tagStmt.all() as { id: number; name: string }[];
    const malformedTags = allTags.filter(t => t.name !== normalizeTag(t.name));
    
    if (malformedTags.length > 0) {
      console.log(`\n🔧 Repairing ${malformedTags.length} malformed tags...`);
      
      let tagUpdates = 0;
      
      // We can't easily merge tags in SQL without logic.
      // So let's loop.
      
      for (const tag of malformedTags) {
        const normalized = normalizeTag(tag.name);
        
        // Does the normalized tag exist?
        const existing = dbHandle.prepare('SELECT id FROM tags WHERE name = ?').get(normalized) as { id: number } | undefined;
        
        if (options.save) {
          if (existing) {
            // Merge: update unit_tags to point to existing.id where tag_id = tag.id
            // Handle unique constraint violations (if unit already has the target tag) via OR IGNORE
            dbHandle.prepare('UPDATE OR IGNORE unit_tags SET tag_id = ? WHERE tag_id = ?').run(existing.id, tag.id);
            // Delete any remaining (duplicates that were ignored)
            dbHandle.prepare('DELETE FROM unit_tags WHERE tag_id = ?').run(tag.id);
            // Delete the old tag
            dbHandle.prepare('DELETE FROM tags WHERE id = ?').run(tag.id);
          } else {
            // Just rename
            // Check constraint again just in case (though we checked existing)
             try {
               dbHandle.prepare('UPDATE tags SET name = ? WHERE id = ?').run(normalized, tag.id);
             } catch (e) {
               // Fallback if race condition or unique constraint hit
               console.error(`Error renaming tag ${tag.name}:`, e);
             }
          }
        }
        tagUpdates++;
        if (tagUpdates % 100 === 0) process.stdout.write('.');
      }
      console.log(`\n   Processed ${tagUpdates} tags.`);
    }

    if (updatesCount === 0 && malformedTags.length === 0) {
      console.log('✅ Nothing to repair.');
    } else if (options.save) {
      console.log('\n✅ Repairs saved to database.');
      const shouldSync = options.yes
        ? true
        : await confirm('Do you want to sync denormalized tags in atomic_units and rebuild FTS now?');

      if (shouldSync) {
        console.log('🔄 Syncing atomic_units.tags from unit_tags and rebuilding FTS...');
        const syncSummary = syncAtomicUnitTagsFromUnitTags(dbHandle);
        console.log(
          `   Synced ${syncSummary.totalUnits} units (${syncSummary.unitsWithTagLinks} with linked tags).`
        );
      } else {
        console.log('⚠️  Skipped denormalized tag sync. FTS tag search may be stale until sync is run.');
      }
    } else {
      console.log('\n💡 Use --save to apply changes.');
    }
  }

  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
