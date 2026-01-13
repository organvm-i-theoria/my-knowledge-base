/**
 * Document-specific atomization with intelligent section detection
 * Handles lists, tables, blockquotes, code blocks, and hierarchical headers
 */

import { randomUUID } from 'crypto';
import { AtomicUnit, KnowledgeDocument } from './types.js';

export type SectionType = 'list' | 'table' | 'blockquote' | 'heading' | 'code' | 'paragraph';

export interface DetectedSection {
  type: SectionType;
  content: string;
  title?: string;
  level?: number;
  startLine: number;
  endLine: number;
}

// Helper for debugging (optional)
const debugLog = (message: string) => {
  // Intentionally disabled to avoid logger dependency
  // Re-enable by uncommenting if needed
};


export class DocumentAtomizer {
  /**
   * Main orchestration method: atomize document with intelligent section detection
   */
  atomizeDocument(doc: KnowledgeDocument): AtomicUnit[] {
    const units: AtomicUnit[] = [];
    const sections = this.detectAllSections(doc.content);
    
    if (sections.length === 0) {
      // Fallback to paragraph-based if no sections detected
      return this.atomizeByParagraph(doc);
    }

    // Build hierarchy from detected sections
    const hierarchicalUnits = this.buildHierarchy(
      sections.map((section, index) => this.sectionToUnit(section, doc, index))
    );

    return hierarchicalUnits;
  }

  /**
   * Multi-pass section detection strategy
   * Priority order: code blocks → tables → lists → headers → blockquotes → paragraphs
   */
  private detectAllSections(content: string): DetectedSection[] {
    const lines = content.split('\n');
    const sections: DetectedSection[] = [];
    const processedLines = new Set<number>();

    // Pass 1: Code blocks (highest priority - most specific)
    const codeBlocks = this.detectCodeBlocks(content, lines, processedLines);
    sections.push(...codeBlocks);

    // Pass 2: Tables (markdown table syntax)
    const tables = this.detectTables(lines, processedLines);
    sections.push(...tables);

    // Pass 3: Lists (ordered and unordered)
    const lists = this.detectLists(lines, processedLines);
    sections.push(...lists);

    // Pass 4: Headers with hierarchy (H1-H6)
    const headers = this.detectHeaders(lines, processedLines);
    sections.push(...headers);

    // Pass 5: Blockquotes
    const blockquotes = this.detectBlockquotes(lines, processedLines);
    sections.push(...blockquotes);

    // Pass 6: Paragraphs (fallback for remaining content)
    const paragraphs = this.detectParagraphs(lines, processedLines);
    sections.push(...paragraphs);

    // Sort by line number to maintain document order
    return sections.sort((a, b) => a.startLine - b.startLine);
  }

  /**
   * Detect code blocks (fenced with ``` or ~~~ )
   */
  private detectCodeBlocks(
    content: string,
    lines: string[],
    processedLines: Set<number>
  ): DetectedSection[] {
    const sections: DetectedSection[] = [];
    const fenceRegex = /^(```|~~~)(\w+)?\n([\s\S]*?)\1/gm;
    let match;

    while ((match = fenceRegex.exec(content)) !== null) {
      const startPos = match.index;
      const startLine = content.substring(0, startPos).split('\n').length - 1;
      const codeContent = match[3];
      const endLine = startLine + codeContent.split('\n').length + 1;
      const language = match[2] || 'text';

      // Mark lines as processed
      for (let i = startLine; i <= endLine; i++) {
        processedLines.add(i);
      }

      sections.push({
        type: 'code',
        content: codeContent.trim(),
        title: `Code (${language})`,
        startLine,
        endLine,
      });
    }

    return sections;
  }

  /**
   * Detect markdown tables (pipe-delimited format)
   * Pattern: |col1|col2| with |---|---| separator
   */
  private detectTables(lines: string[], processedLines: Set<number>): DetectedSection[] {
    const sections: DetectedSection[] = [];
    let i = 0;

    while (i < lines.length) {
      if (processedLines.has(i)) {
        i++;
        continue;
      }

      const line = lines[i];

      // Check if line looks like a table row
      if (/^\|.*\|/.test(line)) {
        const tableLines: string[] = [line];
        let j = i + 1;

        // Collect table rows
        while (j < lines.length && /^\|.*\|/.test(lines[j])) {
          tableLines.push(lines[j]);
          j++;
        }

        if (tableLines.length >= 2) {
          // Mark lines as processed
          for (let k = i; k < j; k++) {
            processedLines.add(k);
          }

          sections.push({
            type: 'table',
            content: tableLines.join('\n'),
            title: this.extractTableTitle(tableLines),
            startLine: i,
            endLine: j - 1,
          });

          i = j;
          continue;
        }
      }

      i++;
    }

    return sections;
  }

  /**
   * Detect lists (ordered and unordered, including nested)
   * Patterns: "- item", "* item", "+ item" (unordered), "1. item" (ordered)
   */
  private detectLists(lines: string[], processedLines: Set<number>): DetectedSection[] {
    const sections: DetectedSection[] = [];
    const listItemRegex = /^(\s*)([-*+]|\d+\.)\s+(.+)$/;

    let i = 0;
    while (i < lines.length) {
      if (processedLines.has(i)) {
        i++;
        continue;
      }

      const line = lines[i];
      const match = listItemRegex.exec(line);

      if (match) {
        const listLines: string[] = [line];
        const startIndent = match[1].length;
        let j = i + 1;

        // Collect list items (including nested items and continuations)
        while (j < lines.length) {
          if (processedLines.has(j)) break;

          const nextLine = lines[j];
          const nextMatch = listItemRegex.exec(nextLine);
          const nextIndent = nextMatch ? nextMatch[1].length : -1;

          // Continue if it's a list item or indented continuation
          if (nextMatch && nextIndent >= startIndent) {
            listLines.push(nextLine);
            j++;
          } else if (nextLine.trim() === '') {
            // Allow blank lines within lists
            listLines.push(nextLine);
            j++;
          } else if (!nextMatch && nextLine.startsWith('  ')) {
            // Continuation line (indented)
            listLines.push(nextLine);
            j++;
          } else {
            break;
          }
        }

        // Mark lines as processed
        for (let k = i; k < j; k++) {
          processedLines.add(k);
        }

        sections.push({
          type: 'list',
          content: listLines.join('\n').trim(),
          title: this.inferListTitle(listLines),
          startLine: i,
          endLine: j - 1,
        });

        i = j;
        continue;
      }

      i++;
    }

    return sections;
  }

  /**
   * Detect headers (H1-H6) with hierarchy level tracking
   */
  private detectHeaders(lines: string[], processedLines: Set<number>): DetectedSection[] {
    const sections: DetectedSection[] = [];
    const headerRegex = /^(#{1,6})\s+(.+?)(?:\s+#*)?$/;

    for (let i = 0; i < lines.length; i++) {
      if (processedLines.has(i)) continue;

      const line = lines[i];
      const match = headerRegex.exec(line);

      if (match) {
        processedLines.add(i);
        const level = match[1].length - 1; // 0-5 for H1-H6
        const title = match[2].trim();

        sections.push({
          type: 'heading',
          content: title,
          title,
          level,
          startLine: i,
          endLine: i,
        });
      }
    }

    return sections;
  }

  /**
   * Detect blockquotes (lines starting with >)
   * Supports multi-line blockquotes with continuation
   */
  private detectBlockquotes(lines: string[], processedLines: Set<number>): DetectedSection[] {
    const sections: DetectedSection[] = [];

    let i = 0;
    while (i < lines.length) {
      if (processedLines.has(i)) {
        i++;
        continue;
      }

      const line = lines[i];

      if (line.match(/^\s*>\s+/)) {
        const blockquoteLines: string[] = [];
        let j = i;

        // Collect blockquote lines
        while (j < lines.length) {
          if (processedLines.has(j)) break;

          const currentLine = lines[j];
          if (currentLine.match(/^\s*>\s+/) || currentLine.trim() === '') {
            blockquoteLines.push(currentLine.replace(/^\s*>\s*/, ''));
            j++;
          } else {
            break;
          }
        }

        // Mark lines as processed
        for (let k = i; k < j; k++) {
          processedLines.add(k);
        }

        sections.push({
          type: 'blockquote',
          content: blockquoteLines.join('\n').trim(),
          title: 'Quote',
          startLine: i,
          endLine: j - 1,
        });

        i = j;
        continue;
      }

      i++;
    }

    return sections;
  }

  /**
   * Detect paragraphs (remaining unprocessed content)
   */
  private detectParagraphs(lines: string[], processedLines: Set<number>): DetectedSection[] {
    const sections: DetectedSection[] = [];
    let currentParagraph: string[] = [];
    let startLine = -1;

    for (let i = 0; i < lines.length; i++) {
      if (processedLines.has(i)) {
        // Flush current paragraph
        if (currentParagraph.length > 0) {
          const content = currentParagraph.join('\n').trim();
          if (content.length > 50) {
            sections.push({
              type: 'paragraph',
              content,
              title: this.generateTitle(content),
              startLine,
              endLine: i - 1,
            });
          }
          currentParagraph = [];
          startLine = -1;
        }
        continue;
      }

      const line = lines[i];

      if (line.trim().length === 0) {
        // Blank line ends paragraph
        if (currentParagraph.length > 0) {
          const content = currentParagraph.join('\n').trim();
          if (content.length > 50) {
            sections.push({
              type: 'paragraph',
              content,
              title: this.generateTitle(content),
              startLine,
              endLine: i - 1,
            });
          }
          currentParagraph = [];
          startLine = -1;
        }
      } else {
        if (startLine === -1) {
          startLine = i;
        }
        currentParagraph.push(line);
      }
    }

    // Flush remaining paragraph
    if (currentParagraph.length > 0) {
      const content = currentParagraph.join('\n').trim();
      if (content.length > 50) {
        sections.push({
          type: 'paragraph',
          content,
          title: this.generateTitle(content),
          startLine,
          endLine: lines.length - 1,
        });
      }
    }

    return sections;
  }

  /**
   * Build hierarchy from sections (parent-child relationships via header levels)
   */
  private buildHierarchy(units: AtomicUnit[]): AtomicUnit[] {
    const headerStack: Array<{ id: string; level: number }> = [];

    return units.map((unit) => {
      const hierarchyLevel = (unit as any).hierarchyLevel;
      const unitLevel = (unit as any).level;

      if (unitLevel !== undefined) {
        // This is a header - update the stack
        while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= unitLevel) {
          headerStack.pop();
        }

        const parentId = headerStack.length > 0 ? headerStack[headerStack.length - 1].id : undefined;
        headerStack.push({ id: unit.id, level: unitLevel });

        return {
          ...unit,
          parentSectionId: parentId,
          hierarchyLevel: unitLevel,
          sectionType: 'heading',
        } as any;
      }

      // Non-header: inherit from parent
      const parent = headerStack[headerStack.length - 1];
      return {
        ...unit,
        parentSectionId: parent?.id,
        hierarchyLevel: parent ? parent.level + 1 : 0,
        sectionType: (unit as any).sectionType,
      } as any;
    });
  }

  /**
   * Convert detected section to AtomicUnit
   */
  private sectionToUnit(section: DetectedSection, doc: KnowledgeDocument, index: number): AtomicUnit {
    const title = section.title || this.generateTitle(section.content);

    return {
      id: randomUUID(),
      type: this.inferTypeFromSection(section),
      timestamp: doc.created,
      title: title.substring(0, 80),
      content: section.content,
      context: `From document: ${doc.title}`,
      tags: [section.type, doc.format, ...this.detectTags(section)],
      category: this.categorize(section.content),
      documentId: doc.id,
      relatedUnits: [],
      keywords: this.extractKeywords(section.content),
      sectionType: section.type,
      level: section.level,
    } as any;
  }

  /**
   * Fallback: atomize by paragraph if no sections detected
   */
  private atomizeByParagraph(doc: KnowledgeDocument): AtomicUnit[] {
    const paragraphs = doc.content.split(/\n\n+/).filter((p) => p.trim().length > 50);

    return paragraphs.map((content) => ({
      id: randomUUID(),
      type: 'insight',
      timestamp: doc.created,
      title: this.generateTitle(content).substring(0, 80),
      content,
      context: `From document: ${doc.title}`,
      tags: ['document', doc.format, 'paragraph'],
      category: this.categorize(content),
      documentId: doc.id,
      relatedUnits: [],
      keywords: this.extractKeywords(content),
      sectionType: 'paragraph' as SectionType,
    }));
  }

  /**
   * Infer unit type from section characteristics
   */
  private inferTypeFromSection(
    section: DetectedSection
  ): 'code' | 'insight' | 'question' | 'reference' | 'decision' {
    switch (section.type) {
      case 'code':
        return 'code';
      case 'heading':
        return 'insight';
      case 'list':
        if (section.content.includes('?')) return 'question';
        return 'reference';
      case 'blockquote':
        return 'reference';
      default:
        return 'insight';
    }
  }

  /**
   * Generate title from content (first line or summary)
   */
  private generateTitle(content: string): string {
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.length > 0 && !firstLine.startsWith('-') && !firstLine.startsWith('*')) {
      return firstLine.substring(0, 100);
    }
    return `Section ${Math.floor(Math.random() * 10000)}`;
  }

  /**
   * Extract keywords via frequency analysis
   */
  private extractKeywords(content: string): string[] {
    const words = content.toLowerCase().match(/\b\w+\b/g) || [];
    const freq = new Map<string, number>();

    for (const word of words) {
      if (word.length > 3) {
        freq.set(word, (freq.get(word) || 0) + 1);
      }
    }

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Categorize content (programming, writing, research, design, general)
   */
  private categorize(content: string): string {
    const lower = content.toLowerCase();

    if (/\b(code|function|class|variable|algorithm|database|api|query|syntax|import|export)\b/.test(lower)) {
      return 'programming';
    }
    if (/\b(decision|strategy|approach|methodology|process|framework|principle)\b/.test(lower)) {
      return 'design';
    }
    if (/\b(research|study|paper|analysis|finding\w*|conclusion|evidence|experiment\w*)\b/.test(lower)) {
      return 'research';
    }
    if (/\b(write|prose|narrative|story|article|post|essay|blog)\b/.test(lower)) {
      return 'writing';
    }

    return 'general';
  }

  /**
   * Detect tags from section content
   */
  private detectTags(section: DetectedSection): string[] {
    const tags: string[] = [];

    if (section.type === 'code') {
      tags.push('code');
      if (section.title?.includes('JavaScript')) tags.push('javascript');
      if (section.title?.includes('Python')) tags.push('python');
      if (section.title?.includes('TypeScript')) tags.push('typescript');
    }

    if (section.type === 'list') {
      tags.push('list');
    }

    if (section.content.includes('TODO') || section.content.includes('FIXME')) {
      tags.push('todo');
    }

    return tags;
  }

  /**
   * Extract table title from first row
   */
  private extractTableTitle(tableLines: string[]): string {
    if (tableLines.length === 0) return 'Table';
    const firstRow = tableLines[0];
    const cells = firstRow.split('|').filter((c) => c.trim());
    return `Table (${cells.length} columns)`;
  }

  /**
   * Infer list title from content
   */
  private inferListTitle(listLines: string[]): string {
    if (listLines.length === 0) return 'List';
    const isOrdered = listLines[0].match(/^\s*\d+\./);
    const itemCount = listLines.filter((l) => l.match(/^\s*([-*+]|\d+\.)/)).length;
    return `${isOrdered ? 'Ordered' : 'Unordered'} List (${itemCount} items)`;
  }
}
