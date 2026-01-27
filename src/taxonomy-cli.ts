#!/usr/bin/env node
/**
 * Taxonomy Audit & Repair CLI
 */

import { config } from 'dotenv';
import { createInterface } from 'readline';
import { KnowledgeDatabase } from './database.js';
import { ALLOWED_CATEGORIES, normalizeCategory, normalizeTag } from './taxonomy.js';
import { AtomicUnit } from './types.js';

config();

interface CliOptions {
  mode: 'audit' | 'repair';
  save: boolean;
  yes: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const mode = argv.includes('repair') ? 'repair' : 'audit';
  const save = argv.includes('--save');
  const yes = argv.includes('--yes');
  return { mode, save, yes };
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

  const dbPath = process.env.DB_PATH || './db/knowledge.db';
  const db = new KnowledgeDatabase(dbPath);

  // We need to fetch all units. For now, we'll fetch them all. 
  // If memory is an issue, we should paginate, but let's assume it fits for now or use the backfill iterator if exposed.
  // Actually, let's use a custom iterator to be safe.
  
  const stmt = (db as any).db.prepare('SELECT * FROM atomic_units');
  const allRows = stmt.all(); 
  // Wait, loading all into memory might be bad if we have huge DB. 
  // But we need to check stats. Let's do aggregations first for audit.

  if (options.mode === 'audit') {
    // Audit Categories
    const categoryStats = db.getCategoryFacets();
    console.log('DEBUG CLI Stats:', JSON.stringify(categoryStats));
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
    const tagStmt = (db as any).db.prepare(`
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
           (db as any).db.prepare('UPDATE atomic_units SET category = ? WHERE category = ?').run(normalized, cat.value);
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
    
    const tagStmt = (db as any).db.prepare('SELECT id, name FROM tags');
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
        const existing = (db as any).db.prepare('SELECT id FROM tags WHERE name = ?').get(normalized) as { id: number } | undefined;
        
        if (options.save) {
          if (existing) {
            // Merge: update unit_tags to point to existing.id where tag_id = tag.id
            // Handle unique constraint violations (if unit already has the target tag) via OR IGNORE
            (db as any).db.prepare('UPDATE OR IGNORE unit_tags SET tag_id = ? WHERE tag_id = ?').run(existing.id, tag.id);
            // Delete any remaining (duplicates that were ignored)
            (db as any).db.prepare('DELETE FROM unit_tags WHERE tag_id = ?').run(tag.id);
            // Delete the old tag
            (db as any).db.prepare('DELETE FROM tags WHERE id = ?').run(tag.id);
          } else {
            // Just rename
            // Check constraint again just in case (though we checked existing)
             try {
               (db as any).db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(normalized, tag.id);
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
    } else {
       if (options.save) {
         console.log('\n✅ Repairs saved to database.');
         // We might need to vacuum or re-index FTS if we changed many tags, but standard update is fine.
         // Actually, FTS depends on `atomic_units.tags` column which is a JSON string.
         // Wait, the DB schema has `tags` column in `atomic_units` which is denormalized JSON!
         // AND `unit_tags` table.
         // My repair above only fixed `tags` table and `unit_tags`.
         // I MUST also update `atomic_units.tags`.
         
         console.log('⚠️  Note: atomic_units.tags JSON column was NOT updated. You may need to re-save units to sync denormalized columns.'); 
         // TODO: Implement syncing atomic_units.tags from unit_tags.
         // This is expensive. For now, maybe just warn.
         // Or, strictly for B1, we should probably handle it.
         
         // Let's iterate units that had changes? Hard to track.
         // Let's iterate ALL units and re-normalize their tags JSON?
         
         if (!options.yes) {
             const sync = await confirm('Do you want to sync denormalized tags in atomic_units? (Recommended, takes time)');
             if (sync) {
                 console.log('🔄 Syncing atomic_units.tags...');
                 const units = (db as any).db.prepare('SELECT id, tags FROM atomic_units').all() as {id: string, tags: string}[];
                 let synced = 0;
                 const updateStmt = (db as any).db.prepare('UPDATE atomic_units SET tags = ? WHERE id = ?');
                 
                 for (const u of units) {
                     try {
                         const tags = JSON.parse(u.tags);
                         const newTags = tags.map((t: string) => normalizeTag(t));
                         const newJson = JSON.stringify(newTags);
                         if (newJson !== u.tags) {
                             updateStmt.run(newJson, u.id);
                             synced++;
                         }
                     } catch (e) {
                         // ignore
                     }
                 }
                 console.log(`   Synced ${synced} units.`);
             }
         }
       } else {
         console.log('\n💡 Use --save to apply changes.');
       }
    }
  }

  db.close();
}

main().catch(console.error);
