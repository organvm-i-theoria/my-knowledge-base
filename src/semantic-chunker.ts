/**
 * Semantic Chunking System
 * Breaks down text into semantically meaningful units
 */

import { Logger } from './logger.js';

const logger = new Logger({ context: 'semantic-chunker' });

export interface SemanticChunk {
  content: string;
  type: 'heading' | 'paragraph' | 'code' | 'list' | 'section';
  level?: number;
  startLine: number;
  endLine: number;
  confidence: number;
  keywords: string[];
  relatedChunks?: string[];
}

export interface ChunkingConfig {
  minChunkSize: number;
  maxChunkSize: number;
  splitOnHeadings: boolean;
  mergeSmallChunks: boolean;
}

export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  minChunkSize: 100,
  maxChunkSize: 1000,
  splitOnHeadings: true,
  mergeSmallChunks: true,
};

export class SemanticChunker {
  private config: ChunkingConfig;

  constructor(config: Partial<ChunkingConfig> = {}) {
    this.config = { ...DEFAULT_CHUNKING_CONFIG, ...config };
  }

  chunk(text: string, language?: string): SemanticChunk[] {
    logger.debug(`Chunking text: ${text.length} characters`);

    const normalized = text.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');

    const contentType = this.detectContentType(text, language);
    let chunks: SemanticChunk[] = [];

    if (contentType === 'markdown') {
      chunks = this.chunkMarkdown(lines);
    } else if (contentType === 'code') {
      chunks = this.chunkCode(lines);
    } else {
      chunks = this.chunkPlainText(lines);
    }

    chunks = chunks.filter(c => c.content.length >= this.config.minChunkSize);

    if (this.config.mergeSmallChunks) {
      chunks = this.mergeSmallChunks(chunks);
    }

    chunks = chunks.map(c => ({
      ...c,
      confidence: this.calculateConfidence(c),
      keywords: this.extractKeywords(c.content),
    }));

    chunks = this.detectRelatedChunks(chunks);

    logger.info(`Chunked text into ${chunks.length} semantic units`);
    return chunks;
  }

  private detectContentType(text: string, language?: string): 'markdown' | 'code' | 'plain' {
    const codeIndicators = ['function', 'class', 'const', 'let', 'var'];
    const codeCount = codeIndicators.filter(ind => text.includes(ind)).length;

    if (language || codeCount >= 2) return 'code';
    if (text.includes('#') || text.includes('```')) return 'markdown';
    return 'plain';
  }

  private chunkMarkdown(lines: string[]): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    let current = '';
    let start = 0;
    let level = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const heading = this.parseHeading(line);

      if (heading && current.length > 0) {
        chunks.push({
          content: current.trim(),
          type: 'section',
          startLine: start,
          endLine: i - 1,
          level,
          confidence: 0,
          keywords: [],
        });
        current = '';
        start = i;
      }

      if (heading) level = heading.level;
      current += line + '\n';

      if (current.length >= this.config.maxChunkSize) {
        chunks.push({
          content: current.trim(),
          type: 'section',
          startLine: start,
          endLine: i,
          level,
          confidence: 0,
          keywords: [],
        });
        current = '';
        start = i + 1;
      }
    }

    if (current.trim().length > 0) {
      chunks.push({
        content: current.trim(),
        type: 'section',
        startLine: start,
        endLine: lines.length - 1,
        level,
        confidence: 0,
        keywords: [],
      });
    }

    return chunks;
  }

  private chunkCode(lines: string[]): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    let current = '';
    let start = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const blockMatch = line.trim().match(/^(function|class|const|let)\s+(\w+)/);

      if (blockMatch && current.length > 0) {
        chunks.push({
          content: current.trim(),
          type: 'code',
          startLine: start,
          endLine: i - 1,
          confidence: 0,
          keywords: [],
        });
        current = '';
        start = i;
      }

      current += line + '\n';

      if (current.length >= this.config.maxChunkSize) {
        chunks.push({
          content: current.trim(),
          type: 'code',
          startLine: start,
          endLine: i,
          confidence: 0,
          keywords: [],
        });
        current = '';
        start = i + 1;
      }
    }

    if (current.trim().length > 0) {
      chunks.push({
        content: current.trim(),
        type: 'code',
        startLine: start,
        endLine: lines.length - 1,
        confidence: 0,
        keywords: [],
      });
    }

    return chunks;
  }

  private chunkPlainText(lines: string[]): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    let current = '';
    let start = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim() === '' && current.length > 0) {
        chunks.push({
          content: current.trim(),
          type: 'paragraph',
          startLine: start,
          endLine: i - 1,
          confidence: 0,
          keywords: [],
        });
        current = '';
        start = i + 1;
        continue;
      }

      if (line.trim() !== '') current += line + '\n';

      if (current.length >= this.config.maxChunkSize) {
        chunks.push({
          content: current.trim(),
          type: 'paragraph',
          startLine: start,
          endLine: i,
          confidence: 0,
          keywords: [],
        });
        current = '';
        start = i + 1;
      }
    }

    if (current.trim().length > 0) {
      chunks.push({
        content: current.trim(),
        type: 'paragraph',
        startLine: start,
        endLine: lines.length - 1,
        confidence: 0,
        keywords: [],
      });
    }

    return chunks;
  }

  private mergeSmallChunks(chunks: SemanticChunk[]): SemanticChunk[] {
    const merged: SemanticChunk[] = [];
    let i = 0;

    while (i < chunks.length) {
      let current = chunks[i];

      while (
        i + 1 < chunks.length &&
        current.content.length < this.config.minChunkSize &&
        current.type !== 'code'
      ) {
        const next = chunks[++i];
        current = {
          ...current,
          content: current.content + '\n\n' + next.content,
          endLine: next.endLine,
          type: 'section',
        };
      }

      merged.push(current);
      i++;
    }

    return merged;
  }

  private parseHeading(line: string): { level: number } | null {
    const match = line.match(/^(#+)\s+(.+)$/);
    return match ? { level: match[1].length } : null;
  }

  private calculateConfidence(chunk: SemanticChunk): number {
    let score = 0.5;
    if (chunk.type === 'code') score += 0.3;
    if (chunk.type === 'section' && chunk.level) score += 0.2;
    const size = chunk.content.length;
    if (size >= this.config.minChunkSize * 2) score += 0.1;
    return Math.min(1, score);
  }

  private extractKeywords(content: string): string[] {
    const stopwords = new Set([
      'the', 'a', 'and', 'or', 'but', 'in', 'on', 'is', 'are', 'be',
    ]);
    const words = content
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3 && !stopwords.has(w));

    const freq = new Map<string, number>();
    words.forEach(w => freq.set(w, (freq.get(w) || 0) + 1));

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  private detectRelatedChunks(chunks: SemanticChunk[]): SemanticChunk[] {
    return chunks.map((chunk, idx) => {
      const kw = new Set(chunk.keywords);
      const related = chunks
        .map((c, i) => ({ i, overlap: c.keywords.filter(k => kw.has(k)).length }))
        .filter(x => x.i !== idx && x.overlap >= 2)
        .map(x => `chunk-${x.i}`);

      return { ...chunk, relatedChunks: related.length ? related : undefined };
    });
  }
}

export function semanticChunk(text: string, config?: Partial<ChunkingConfig>): SemanticChunk[] {
  return new SemanticChunker(config).chunk(text);
}
