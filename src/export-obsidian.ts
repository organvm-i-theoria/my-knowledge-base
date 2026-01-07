#!/usr/bin/env node
/**
 * Export knowledge base to Obsidian vault format
 */

import { KnowledgeDatabase } from './database.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';

interface ObsidianExportOptions {
  vaultPath: string;
  includeGraphMetadata?: boolean;
  createDailyNotes?: boolean;
}

async function exportToObsidian(options: ObsidianExportOptions) {
  console.log('📦 Exporting to Obsidian Vault\n');

  const { vaultPath, includeGraphMetadata = true } = options;

  // Create vault directory structure
  const dirs = {
    root: vaultPath,
    insights: join(vaultPath, 'Insights'),
    code: join(vaultPath, 'Code'),
    questions: join(vaultPath, 'Questions'),
    references: join(vaultPath, 'References'),
    decisions: join(vaultPath, 'Decisions'),
    tags: join(vaultPath, 'Tags'),
  };

  Object.values(dirs).forEach(dir => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });

  console.log('✅ Vault structure created\n');

  // Load units from database
  const db = new KnowledgeDatabase('./db/knowledge.db');
  const units = db.searchText('*', 100000);

  console.log(`📊 Found ${units.length} units to export\n`);

  // Export units by type
  const stats = {
    insight: 0,
    code: 0,
    question: 0,
    reference: 0,
    decision: 0,
    other: 0,
  };

  for (const unit of units) {
    const folder = dirs[unit.type as keyof typeof dirs] || dirs.root;
    const filename = sanitizeFilename(unit.title) + '.md';
    const filepath = join(folder, filename);

    // Build frontmatter
    const frontmatter = {
      id: unit.id,
      type: unit.type,
      category: unit.category,
      tags: unit.tags,
      created: unit.timestamp.toISOString(),
      conversationId: unit.conversationId,
    };

    // Build content with Obsidian-style links
    let content = `# ${unit.title}\n\n`;

    if (unit.context) {
      content += `## Context\n\n${unit.context}\n\n`;
    }

    content += `## Content\n\n${unit.content}\n\n`;

    // Add related units as Obsidian links
    if (unit.relatedUnits.length > 0) {
      content += `## Related\n\n`;
      for (const relatedId of unit.relatedUnits) {
        const related = units.find(u => u.id === relatedId);
        if (related) {
          content += `- [[${sanitizeFilename(related.title)}]]\n`;
        }
      }
      content += '\n';
    }

    // Add tags as Obsidian tags
    if (unit.tags.length > 0) {
      content += `## Tags\n\n`;
      content += unit.tags.map(tag => `#${tag.replace(/[^\w-]/g, '_')}`).join(' ');
      content += '\n\n';
    }

    // Add keywords
    if (unit.keywords.length > 0) {
      content += `## Keywords\n\n${unit.keywords.join(', ')}\n\n`;
    }

    // Create markdown with frontmatter
    const markdown = matter.stringify(content, frontmatter);

    writeFileSync(filepath, markdown);

    stats[unit.type as keyof typeof stats] = (stats[unit.type as keyof typeof stats] || 0) + 1;
  }

  // Create tag index
  if (includeGraphMetadata) {
    createTagIndex(units, dirs.tags);
    createGraphMetadata(units, vaultPath);
  }

  db.close();

  console.log('\n✅ Export complete!\n');
  console.log('📊 Export Statistics:');
  Object.entries(stats).forEach(([type, count]) => {
    if (count > 0) {
      console.log(`  - ${type}: ${count}`);
    }
  });

  console.log(`\n📁 Vault location: ${vaultPath}`);
  console.log('\n💡 Open this folder in Obsidian to explore your knowledge graph!');
}

function createTagIndex(units: any[], tagsDir: string) {
  const tagMap = new Map<string, any[]>();

  // Group units by tag
  units.forEach(unit => {
    unit.tags.forEach((tag: string) => {
      if (!tagMap.has(tag)) {
        tagMap.set(tag, []);
      }
      tagMap.get(tag)!.push(unit);
    });
  });

  // Create a file for each tag
  for (const [tag, taggedUnits] of tagMap) {
    const filename = join(tagsDir, `${sanitizeFilename(tag)}.md`);

    let content = `# Tag: ${tag}\n\n`;
    content += `**${taggedUnits.length} units**\n\n`;

    content += `## Units\n\n`;
    taggedUnits.forEach(unit => {
      content += `- [[${sanitizeFilename(unit.title)}]]\n`;
    });

    writeFileSync(filename, content);
  }

  console.log(`  ✅ Created ${tagMap.size} tag index files`);
}

function createGraphMetadata(units: any[], vaultPath: string) {
  // Create graph.json for Obsidian graph view customization
  const graphConfig = {
    'collapse-filter': true,
    search: '',
    localBacklinks: true,
    localForelinks: true,
    localInterlinks: false,
    showTags: true,
    showAttachments: false,
    hideUnresolved: false,
    showOrphans: true,
    'collapse-color-groups': false,
    colorGroups: [
      { query: 'tag:#insight', color: { a: 1, rgb: 0x2563eb } },
      { query: 'tag:#code', color: { a: 1, rgb: 0x10b981 } },
      { query: 'tag:#question', color: { a: 1, rgb: 0xf59e0b } },
      { query: 'tag:#reference', color: { a: 1, rgb: 0x8b5cf6 } },
      { query: 'tag:#decision', color: { a: 1, rgb: 0xef4444 } },
    ],
  };

  const configPath = join(vaultPath, '.obsidian');
  if (!existsSync(configPath)) {
    mkdirSync(configPath, { recursive: true });
  }

  writeFileSync(
    join(configPath, 'graph.json'),
    JSON.stringify(graphConfig, null, 2)
  );

  console.log('  ✅ Created Obsidian graph configuration');
}

function sanitizeFilename(title: string): string {
  return title
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 100);
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npm run export-obsidian <vault-path>');
    console.log('\nExample: npm run export-obsidian ~/Documents/KnowledgeVault');
    console.log('\nOptions:');
    console.log('  --no-graph    Skip graph metadata');
    process.exit(1);
  }

  const vaultPath = args[0];
  const includeGraphMetadata = !args.includes('--no-graph');

  await exportToObsidian({
    vaultPath,
    includeGraphMetadata,
  });
}

main();
