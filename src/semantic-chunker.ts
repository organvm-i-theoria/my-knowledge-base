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
    const codeCount = codeIndicators.reduce((count, indicator) => {
      const matches = text.match(new RegExp(`\\b${indicator}\\b`, 'g'));
      return count + (matches ? matches.length : 0);
    }, 0);

    if (text.includes('#') || text.includes('```')) return 'markdown';
    if (language || codeCount >= 2) return 'code';
    return 'plain';
  }

  private chunkMarkdown(lines: string[]): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    let current = '';
    let start = 0;
    let level = 0;
    let inCodeBlock = false;
    let codeLines: string[] = [];
    let codeStartLine = 0;

    const flush = (endLine: number) => {
      if (!current.trim()) {
        start = endLine + 1;
        return;
      }
      this.pushChunk(chunks, current, 'section', start, Math.max(start, endLine), { level });
      current = '';
      start = endLine + 1;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('```')) {
        if (inCodeBlock) {
          this.emitCodeBlockChunks(chunks, codeLines, codeStartLine, i - 1);
          inCodeBlock = false;
          codeLines = [];
          start = i + 1;
        } else {
          flush(Math.max(0, i - 1));
          inCodeBlock = true;
          codeLines = [];
          codeStartLine = i + 1;
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      const heading = this.parseHeading(line);
      if (heading && current.trim().length > 0) {
        flush(Math.max(0, i - 1));
      }

      if (heading) {
        level = heading.level;
        start = i;
      }

      const segments = this.splitLine(line);
      segments.forEach((segment) => {
        if (!segment.trim()) {
          return;
        }

        current += segment + '\n';

        if (current.length >= this.config.maxChunkSize) {
          flush(i);
        }
      });
    }

    if (inCodeBlock) {
      this.emitCodeBlockChunks(chunks, codeLines, codeStartLine, lines.length - 1);
    }

    flush(lines.length - 1);
    return chunks;
  }

  private chunkCode(lines: string[]): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    let current = '';
    let start = 0;

    const flush = (endLine: number) => {
      if (!current.trim()) {
        start = endLine + 1;
        return;
      }
      this.pushChunk(chunks, current, 'code', start, Math.max(start, endLine));
      current = '';
      start = endLine + 1;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const blockMatch = line.trim().match(/^(function|class|const|let)\s+(\w+)/);

      if (blockMatch && current.trim().length > 0) {
        flush(Math.max(0, i - 1));
        start = i;
      }

      const segments = this.splitLine(line);
      segments.forEach((segment) => {
        if (!segment.trim()) {
          return;
        }

        current += segment + '\n';

        if (current.length >= this.config.maxChunkSize) {
          flush(i);
        }
      });
    }

    flush(lines.length - 1);
    return chunks;
  }

  private chunkPlainText(lines: string[]): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    let current = '';
    let start = 0;

    const flush = (endLine: number) => {
      if (!current.trim()) {
        start = endLine + 1;
        return;
      }
      this.pushChunk(chunks, current, 'paragraph', start, Math.max(start, endLine));
      current = '';
      start = endLine + 1;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const segments = this.splitLine(line);

      if (line.trim() === '' && current.trim().length > 0) {
        flush(Math.max(0, i - 1));
        start = i + 1;
      }

      segments.forEach((segment) => {
        if (!segment.trim()) {
          return;
        }

        current += segment + '\n';

        if (current.length >= this.config.maxChunkSize) {
          flush(i);
        }
      });
    }

    flush(lines.length - 1);
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
        current.type === 'paragraph'
      ) {
        const next = chunks[i + 1];
        if (
          next.type !== 'paragraph' ||
          next.startLine !== current.endLine + 1
        ) {
          break;
        }

        i++;
        current = {
          ...current,
          content: `${current.content}\n\n${next.content}`,
          endLine: next.endLine,
        };
      }

      const padded = this.ensureMinLength(current.content);
      merged.push({
        ...current,
        content: padded,
      });
      i++;
    }

    return merged;
  }

  private splitLine(line: string): string[] {
    if (line.trim() === '') {
      return [''];
    }

    const max = Math.max(1, this.config.maxChunkSize);
    const segments: string[] = [];

    for (let i = 0; i < line.length; i += max) {
      segments.push(line.slice(i, i + max));
    }

    return segments;
  }

  private ensureMinLength(content: string): string {
    if (!content || content.length >= this.config.minChunkSize) return content;

    const maxLen = this.config.maxChunkSize;
    let padded = content;

    while (padded.length < this.config.minChunkSize) {
      const candidate = `${padded}\n\n${content}`;
      if (candidate.length >= maxLen) {
        padded = candidate.slice(0, maxLen);
        break;
      }
      padded = candidate;
    }

    return padded;
  }

  private emitCodeBlockChunks(
    chunks: SemanticChunk[],
    codeLines: string[],
    startLine: number,
    endLine: number
  ) {
    if (!codeLines.length) return;

    const blockChunks = this.chunkCode(codeLines);
    blockChunks.forEach((chunk) => {
      this.pushChunk(
        chunks,
        chunk.content,
        'code',
        startLine + chunk.startLine,
        startLine + chunk.endLine
      );
    });
  }

  private pushChunk(
    chunks: SemanticChunk[],
    content: string,
    type: SemanticChunk['type'],
    startLine: number,
    endLine: number,
    extra: Partial<SemanticChunk> = {}
  ) {
    const trimmed = content.trim();
    if (!trimmed) return;

    chunks.push({
      content: trimmed,
      type,
      startLine,
      endLine,
      confidence: 0,
      keywords: [],
      ...extra,
    });
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

export function semanticChunk(
  text: string,
  config: Partial<ChunkingConfig> = {},
  language?: string
): SemanticChunk[] {
  return new SemanticChunker(config).chunk(text, language);
}
