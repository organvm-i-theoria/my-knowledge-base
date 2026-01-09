/**
 * Hierarchical Tag Visualization System
 * Organizes tags into tree structures for better exploration
 */

import { KnowledgeDatabase } from './database.js';
import { ClaudeService } from './claude-service.js';
import { logger } from './logger.js';

export interface TagNode {
  name: string;
  count: number;
  children: TagNode[];
  parent?: string;
  level: number;
  path: string;
}

export interface HierarchyLevel {
  level: number;
  tags: Array<{ name: string; count: number; childCount: number }>;
}

/**
 * Build and visualize hierarchical tag structures
 */
export class TagHierarchy {
  private root: TagNode = {
    name: 'root',
    count: 0,
    children: [],
    level: 0,
    path: '/',
  };

  constructor(
    private db: KnowledgeDatabase,
    private claudeService?: ClaudeService
  ) {
    this.buildTree();
  }

  /**
   * Build hierarchical tree from tags with '/' separators
   * Example: 'programming/typescript/generics' creates nested structure
   */
  private buildTree(): void {
    const allTags = this.getAllTagsWithCounts();

    // Create nodes for each tag
    const nodes = new Map<string, TagNode>();
    nodes.set('/', this.root);

    for (const tag of allTags) {
      const parts = tag.name.split('/');

      // Process each level of the hierarchy
      let currentPath = '';
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const parentPath = currentPath || '/';
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        // Create node if it doesn't exist
        if (!nodes.has(currentPath)) {
          const node: TagNode = {
            name: part,
            count: i === parts.length - 1 ? tag.count : 0, // Only leaf has count
            children: [],
            parent: parentPath === '/' ? undefined : parentPath,
            level: i,
            path: currentPath,
          };
          nodes.set(currentPath, node);

          // Link to parent
          const parent = nodes.get(parentPath);
          if (parent) {
            parent.children.push(node);
          }
        }
      }
    }

    // Sort children by count descending
    this.sortChildren(this.root);
  }

  /**
   * Sort children by count (recursively)
   */
  private sortChildren(node: TagNode): void {
    node.children.sort((a, b) => b.count - a.count);
    for (const child of node.children) {
      this.sortChildren(child);
    }
  }

  /**
   * Get all tags with usage counts
   */
  private getAllTagsWithCounts(): Array<{ name: string; count: number }> {
    const stmt = this.db['db'].prepare(`
      SELECT t.name, COUNT(ut.unit_id) as count
      FROM tags t
      LEFT JOIN unit_tags ut ON t.id = ut.tag_id
      GROUP BY t.id
      ORDER BY t.name
    `);

    return stmt.all() as Array<{ name: string; count: number }>;
  }

  /**
   * Visualize hierarchy as ASCII tree
   */
  visualizeAscii(maxDepth: number = -1): string {
    const lines: string[] = [];
    this.buildAsciiTree(this.root, '', false, lines, maxDepth, 0);
    return lines.join('\n');
  }

  /**
   * Build ASCII tree recursively
   */
  private buildAsciiTree(
    node: TagNode,
    prefix: string,
    isLast: boolean,
    lines: string[],
    maxDepth: number,
    currentDepth: number
  ): void {
    // Skip root node
    if (node.name !== 'root') {
      const connector = isLast ? '└── ' : '├── ';
      const countStr = node.count > 0 ? ` (${node.count})` : '';
      lines.push(`${prefix}${connector}${node.name}${countStr}`);

      prefix += isLast ? '    ' : '│   ';
    }

    // Stop if max depth reached
    if (maxDepth >= 0 && currentDepth >= maxDepth) {
      return;
    }

    // Process children
    for (let i = 0; i < node.children.length; i++) {
      const isLastChild = i === node.children.length - 1;
      this.buildAsciiTree(
        node.children[i],
        prefix,
        isLastChild,
        lines,
        maxDepth,
        currentDepth + 1
      );
    }
  }

  /**
   * Visualize hierarchy as JSON
   */
  visualizeJson(maxDepth: number = -1): string {
    const json = this.nodeToJson(this.root, maxDepth, 0);
    return JSON.stringify(json, null, 2);
  }

  /**
   * Convert node to JSON object (recursive)
   */
  private nodeToJson(node: TagNode, maxDepth: number, currentDepth: number): any {
    const obj: any = {
      name: node.name,
      count: node.count,
      level: node.level,
    };

    if (node.children.length > 0 && (maxDepth < 0 || currentDepth < maxDepth)) {
      obj.children = node.children.map(child =>
        this.nodeToJson(child, maxDepth, currentDepth + 1)
      );
    }

    return obj;
  }

  /**
   * Visualize hierarchy as Mermaid diagram
   */
  visualizeMermaid(maxDepth: number = 3): string {
    const lines: string[] = ['graph TD'];
    const visited = new Set<string>();

    this.buildMermaidDiagram(this.root, lines, visited, maxDepth, 0);

    return lines.join('\n');
  }

  /**
   * Build Mermaid diagram recursively
   */
  private buildMermaidDiagram(
    node: TagNode,
    lines: string[],
    visited: Set<string>,
    maxDepth: number,
    currentDepth: number
  ): void {
    if (visited.has(node.path) || (maxDepth >= 0 && currentDepth >= maxDepth)) {
      return;
    }

    visited.add(node.path);

    // Create node label
    const label = node.name === 'root' ? 'Tags' : `${node.name}<br/>(${node.count})`;
    const nodeId = node.path === '/' ? 'root' : node.path.replace(/\//g, '_');

    if (node.name !== 'root') {
      lines.push(`${nodeId}["${label}"]`);
    }

    // Add edges to children
    for (const child of node.children) {
      const childId = child.path.replace(/\//g, '_');
      const childLabel = `${child.name}<br/>(${child.count})`;
      lines.push(`${childId}["${childLabel}"]`);

      if (node.name === 'root') {
        lines.push(`root --> ${childId}`);
      } else {
        lines.push(`${nodeId} --> ${childId}`);
      }

      if (maxDepth < 0 || currentDepth < maxDepth - 1) {
        this.buildMermaidDiagram(child, lines, visited, maxDepth, currentDepth + 1);
      }
    }
  }

  /**
   * Get hierarchy levels (for table view)
   */
  getLevels(): HierarchyLevel[] {
    const levels = new Map<number, HierarchyLevel>();

    this.collectLevels(this.root, levels);

    const result: HierarchyLevel[] = [];
    for (let i = 0; i <= 5; i++) {
      if (levels.has(i)) {
        result.push(levels.get(i)!);
      }
    }

    return result;
  }

  /**
   * Collect tags by level
   */
  private collectLevels(node: TagNode, levels: Map<number, HierarchyLevel>): void {
    if (node.name === 'root') {
      // Root doesn't count as a level
      for (const child of node.children) {
        this.collectLevels(child, levels);
      }
      return;
    }

    if (!levels.has(node.level)) {
      levels.set(node.level, {
        level: node.level,
        tags: [],
      });
    }

    const level = levels.get(node.level)!;
    level.tags.push({
      name: node.name,
      count: node.count,
      childCount: node.children.length,
    });

    for (const child of node.children) {
      this.collectLevels(child, levels);
    }
  }

  /**
   * Suggest parent-child relationships using Claude
   * Useful for tags that don't have '/' hierarchy
   */
  async suggestHierarchy(): Promise<Map<string, string>> {
    if (!this.claudeService) {
      logger.warn('ClaudeService not available - skipping hierarchy suggestions');
      return new Map();
    }

    const allTags = this.getAllTagsWithCounts().map(t => t.name);
    const suggestions = new Map<string, string>();

    // Group tags into batches of 20 for Claude analysis
    const batchSize = 20;
    for (let i = 0; i < allTags.length; i += batchSize) {
      const batch = allTags.slice(i, i + batchSize);

      const prompt = `Analyze these ${batch.length} tags and suggest hierarchical relationships.
For each tag, suggest a parent category from the list if appropriate.

Tags: ${batch.join(', ')}

For each tag that has a clear parent category, respond with JSON array:
[
  {"tag": "specific-tag", "parent": "general-category"},
  ...
]

Only suggest relationships for tags that clearly fit under a category. Return empty array if no clear relationships exist.`;

      try {
        const response = await this.claudeService.chat(prompt, {
          maxTokens: 500,
        });

        // Extract JSON from response
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const relationships = JSON.parse(jsonMatch[0]);
          for (const rel of relationships) {
            suggestions.set(rel.tag, rel.parent);
          }
        }
      } catch (e) {
        logger.warn(`Failed to suggest hierarchy for batch: ${(e as Error).message}`);
      }
    }

    return suggestions;
  }

  /**
   * Find tags without hierarchy (no '/' separator)
   */
  getUncategorizedTags(): Array<{ name: string; count: number }> {
    const allTags = this.getAllTagsWithCounts();
    return allTags.filter(t => !t.name.includes('/'));
  }

  /**
   * Get tree statistics
   */
  getStatistics(): {
    totalNodes: number;
    maxDepth: number;
    avgChildrenPerNode: number;
    leafNodes: number;
    branchNodes: number;
  } {
    let totalNodes = 0;
    let maxDepth = 0;
    let leafNodes = 0;
    let branchNodes = 0;

    const traverse = (node: TagNode, depth: number) => {
      if (node.name !== 'root') {
        totalNodes++;
        maxDepth = Math.max(maxDepth, depth);

        if (node.children.length === 0) {
          leafNodes++;
        } else {
          branchNodes++;
        }
      }

      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    };

    traverse(this.root, 0);

    const avgChildren = branchNodes > 0 ? totalNodes / branchNodes : 0;

    return {
      totalNodes,
      maxDepth,
      avgChildrenPerNode: Math.round(avgChildren * 100) / 100,
      leafNodes,
      branchNodes,
    };
  }

  /**
   * Search for tags in hierarchy
   */
  search(query: string): TagNode[] {
    const results: TagNode[] = [];
    const lowerQuery = query.toLowerCase();

    const traverse = (node: TagNode) => {
      if (node.name !== 'root' && node.name.toLowerCase().includes(lowerQuery)) {
        results.push(node);
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(this.root);
    return results;
  }
}
