/**
 * Write atomic units to markdown files
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { AtomicUnit } from './types.js';

export class MarkdownWriter {
  private basePath: string;

  constructor(basePath: string = './atomized/markdown') {
    this.basePath = basePath;
  }

  /**
   * Write a single atomic unit to markdown
   */
  writeUnit(unit: AtomicUnit) {
    const date = unit.timestamp;
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const dirPath = join(this.basePath, yearMonth);

    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }

    // Sanitize filename
    const filename = this.sanitizeFilename(unit.title) + '.md';
    const filepath = join(dirPath, filename);

    // Create markdown with frontmatter
    const markdown = this.toMarkdown(unit);

    writeFileSync(filepath, markdown);
    console.log(`📝 Wrote: ${filepath}`);

    return filepath;
  }

  /**
   * Write multiple units
   */
  writeUnits(units: AtomicUnit[]) {
    const files: string[] = [];

    for (const unit of units) {
      const file = this.writeUnit(unit);
      files.push(file);
    }

    // Create index file
    this.createIndex(units);

    return files;
  }

  /**
   * Convert atomic unit to markdown with frontmatter
   */
  private toMarkdown(unit: AtomicUnit): string {
    // Build frontmatter dynamically to avoid 'undefined' keys
    const frontmatter: any = {
      id: unit.id,
      type: unit.type,
      created: unit.timestamp.toISOString(),
    };

    if (unit.conversationId) frontmatter.conversation = unit.conversationId;
    if (unit.documentId) frontmatter.document = unit.documentId;
    if (unit.tags && unit.tags.length > 0) frontmatter.tags = unit.tags;
    if (unit.category) frontmatter.category = unit.category;
    if (unit.keywords && unit.keywords.length > 0) frontmatter.keywords = unit.keywords;

    const sourceLabel = unit.conversationId ? `Conversation ${unit.conversationId}` : `Document ${unit.documentId}`;

    const content = `# ${unit.title}

## Context
${unit.context || 'No context available'}

## Content
${unit.content}

${unit.relatedUnits && unit.relatedUnits.length > 0 ? `## Related\n${unit.relatedUnits.map(id => `- [[${id}]]`).join('\n')}` : ''}

---
*Source: ${sourceLabel}*
`;

    return matter.stringify(content, frontmatter);
  }

  /**
   * Create index file for the month
   */
  private createIndex(units: AtomicUnit[]) {
    const byMonth = new Map<string, AtomicUnit[]>();

    units.forEach(unit => {
      const yearMonth = `${unit.timestamp.getFullYear()}-${String(unit.timestamp.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth.has(yearMonth)) {
        byMonth.set(yearMonth, []);
      }
      byMonth.get(yearMonth)!.push(unit);
    });

    for (const [month, monthUnits] of byMonth) {
      const dirPath = join(this.basePath, month);
      const indexPath = join(dirPath, 'index.md');

      const content = `# Knowledge Index - ${month}

Total units: ${monthUnits.length}

## By Type
${this.groupByType(monthUnits)}

## By Category
${this.groupByCategory(monthUnits)}

## All Units
${monthUnits.map(u => `- [${u.title}](./${this.sanitizeFilename(u.title)}.md)`).join('\n')}
`;

      writeFileSync(indexPath, content);
      console.log(`📚 Created index: ${indexPath}`);
    }
  }

  private groupByType(units: AtomicUnit[]): string {
    const byType = new Map<string, number>();
    units.forEach(u => {
      byType.set(u.type, (byType.get(u.type) || 0) + 1);
    });

    return Array.from(byType.entries())
      .map(([type, count]) => `- ${type}: ${count}`)
      .join('\n');
  }

  private groupByCategory(units: AtomicUnit[]): string {
    const byCategory = new Map<string, number>();
    units.forEach(u => {
      byCategory.set(u.category, (byCategory.get(u.category) || 0) + 1);
    });

    return Array.from(byCategory.entries())
      .map(([cat, count]) => `- ${cat}: ${count}`)
      .join('\n');
  }

  private sanitizeFilename(title: string): string {
    return title
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 50);
  }
}