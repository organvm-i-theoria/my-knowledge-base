import { KnowledgeDocument } from './types.js';
import { SemanticChunker } from './semantic-chunker.js';

export interface ChunkMetadata {
  strategy: string;
  chunkIndex: number;
  chunkCount: number;
  heading?: string;
  pageStart?: number;
  pageEnd?: number;
  tokenStart?: number;
  tokenEnd?: number;
  imageCount?: number;
}

export interface DocumentChunk {
  content: string;
  titleSuffix?: string;
  metadata: ChunkMetadata;
}

export interface ChunkingStrategy {
  id: string;
  supports(doc: KnowledgeDocument): boolean;
  chunk(doc: KnowledgeDocument): DocumentChunk[];
}

export interface DetectedImage {
  src: string;
  alt?: string;
  type: 'markdown' | 'html';
}

const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;
const HTML_IMAGE_REGEX = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
const HTML_ALT_REGEX = /alt=["']([^"']*)["']/i;

export function detectImages(content: string): DetectedImage[] {
  const images: DetectedImage[] = [];

  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_IMAGE_REGEX.exec(content)) !== null) {
    images.push({
      type: 'markdown',
      alt: match[1] || undefined,
      src: match[2],
    });
  }

  while ((match = HTML_IMAGE_REGEX.exec(content)) !== null) {
    const fullTag = match[0];
    const altMatch = fullTag.match(HTML_ALT_REGEX);
    images.push({
      type: 'html',
      alt: altMatch?.[1],
      src: match[1],
    });
  }

  return images;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\t/g, '  ');
}

function readEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripNoisyHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ');
}

function preprocessHtmlHeadings(html: string): string {
  return html.replace(/<h([1-4])[^>]*>(.*?)<\/h\1>/gis, (_match, level: string, inner: string) => {
    const headingText = stripHtmlTags(inner);
    if (!headingText) {
      return '\n';
    }
    const headingLevel = Math.min(4, Math.max(1, parseInt(level, 10)));
    const hashes = '#'.repeat(headingLevel) + ' ';
    return `\n${hashes}${headingText}\n`;
  });
}

function preprocessHtmlLists(html: string): string {
  let processed = html.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');

  processed = processed.replace(/<li[^>]*>(.*?)<\/li>/gis, (_match, inner: string) => {
    const itemText = stripHtmlTags(inner);
    if (!itemText) return '\n';
    return `\n- ${itemText}\n`;
  });

  return processed;
}

function preprocessHtml(html: string): string {
  const withoutNoise = stripNoisyHtml(html);
  const withHeadings = preprocessHtmlHeadings(withoutNoise);
  const withLists = preprocessHtmlLists(withHeadings);
  return withLists;
}

function tokenCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function mergeChunkGroup(group: DocumentChunk, others: DocumentChunk[], mergedIndex: number, mergedCount: number): DocumentChunk {
  const all = [group, ...others];
  const content = all.map((c) => c.content).join('\n\n').trim();
  const firstHeading = all.find((c) => c.metadata.heading)?.metadata.heading;
  const tokenStart = Math.min(...all.map((c) => c.metadata.tokenStart ?? Number.POSITIVE_INFINITY));
  const tokenEnd = Math.max(...all.map((c) => c.metadata.tokenEnd ?? Number.NEGATIVE_INFINITY));
  const pageStart = Math.min(...all.map((c) => c.metadata.pageStart ?? Number.POSITIVE_INFINITY));
  const pageEnd = Math.max(...all.map((c) => c.metadata.pageEnd ?? Number.NEGATIVE_INFINITY));

  return {
    content,
    titleSuffix: buildTitleSuffixFromHeading(firstHeading) || all.find((c) => c.titleSuffix)?.titleSuffix,
    metadata: {
      strategy: all[0].metadata.strategy,
      chunkIndex: mergedIndex,
      chunkCount: mergedCount,
      heading: firstHeading,
      tokenStart: Number.isFinite(tokenStart) ? tokenStart : undefined,
      tokenEnd: Number.isFinite(tokenEnd) ? tokenEnd : undefined,
      pageStart: Number.isFinite(pageStart) ? pageStart : undefined,
      pageEnd: Number.isFinite(pageEnd) ? pageEnd : undefined,
    },
  };
}

function applyChunkGuardrails(
  chunks: DocumentChunk[],
  options: { maxChunks: number; minChunkTokens: number }
): DocumentChunk[] {
  if (chunks.length === 0) {
    return chunks;
  }

  const filtered = chunks.filter((chunk) => tokenCount(chunk.content) >= options.minChunkTokens);
  const safeFiltered = filtered.length > 0 ? filtered : chunks;

  if (safeFiltered.length <= options.maxChunks) {
    return safeFiltered.map((chunk, index) => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        chunkIndex: index,
        chunkCount: safeFiltered.length,
      },
    }));
  }

  const groupSize = Math.ceil(safeFiltered.length / options.maxChunks);
  const merged: DocumentChunk[] = [];

  for (let i = 0; i < safeFiltered.length; i += groupSize) {
    const group = safeFiltered.slice(i, i + groupSize);
    const first = group[0];
    const rest = group.slice(1);
    merged.push(mergeChunkGroup(first, rest, merged.length, Math.ceil(safeFiltered.length / groupSize)));
  }

  return merged.map((chunk, index) => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      chunkIndex: index,
      chunkCount: merged.length,
    },
  }));
}

function splitIntoTokenWindows(
  text: string,
  windowSize: number,
  overlap: number
): Array<{ content: string; tokenStart: number; tokenEnd: number }> {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }

  const step = Math.max(1, windowSize - overlap);
  const windows: Array<{ content: string; tokenStart: number; tokenEnd: number }> = [];

  for (let start = 0; start < tokens.length; start += step) {
    const endExclusive = Math.min(tokens.length, start + windowSize);
    const slice = tokens.slice(start, endExclusive);
    windows.push({
      content: slice.join(' ').trim(),
      tokenStart: start,
      tokenEnd: endExclusive - 1,
    });

    if (endExclusive >= tokens.length) {
      break;
    }
  }

  return windows;
}

function estimatePageRange(
  tokenStart: number,
  tokenEnd: number,
  totalTokens: number,
  numPages?: number
): { pageStart?: number; pageEnd?: number } {
  if (!numPages || totalTokens <= 0) {
    return {};
  }

  const startRatio = tokenStart / totalTokens;
  const endRatio = tokenEnd / totalTokens;

  const pageStart = Math.max(1, Math.min(numPages, Math.floor(startRatio * numPages) + 1));
  const pageEnd = Math.max(pageStart, Math.min(numPages, Math.floor(endRatio * numPages) + 1));

  return { pageStart, pageEnd };
}

function buildTitleSuffixFromHeading(heading?: string): string | undefined {
  if (!heading) return undefined;
  const clean = heading.replace(/^#+\s*/, '').trim();
  if (!clean) return undefined;
  return ` — ${clean.substring(0, 80)}`;
}

/**
 * Markdown/Text strategy: split by headings and semantic sections.
 */
export class MarkdownSemanticChunkingStrategy implements ChunkingStrategy {
  id = 'markdown-semantic';
  private maxChunks = readEnvInt('CHUNK_MAX_PER_DOC', 40);
  private minChunkTokens = readEnvInt('CHUNK_MIN_TOKENS', 160);
  private chunker = new SemanticChunker({
    minChunkSize: 200,
    maxChunkSize: 1200,
    splitOnHeadings: true,
    mergeSmallChunks: true,
  });

  supports(doc: KnowledgeDocument): boolean {
    return doc.format === 'markdown' || doc.format === 'txt' || doc.format === 'html';
  }

  chunk(doc: KnowledgeDocument): DocumentChunk[] {
    const preprocessed = doc.format === 'html' ? preprocessHtml(doc.content) : doc.content;
    const normalized = normalizeWhitespace(preprocessed);
    const semanticChunks = this.chunker.chunk(normalized);

    if (semanticChunks.length <= 1) {
      return [
        {
          content: normalized,
          metadata: {
            strategy: this.id,
            chunkIndex: 0,
            chunkCount: 1,
          },
        },
      ];
    }

    const headingForChunk = (content: string): string | undefined => {
      const firstLine = content.split('\n').find((line) => line.trim().length > 0);
      if (!firstLine) return undefined;
      if (firstLine.trim().startsWith('#')) return firstLine.trim();
      return undefined;
    };

    const chunks: DocumentChunk[] = semanticChunks.map((chunk, index) => {
      const heading = headingForChunk(chunk.content);
      return {
        content: chunk.content,
        titleSuffix: buildTitleSuffixFromHeading(heading),
        metadata: {
          strategy: this.id,
          chunkIndex: index,
          chunkCount: semanticChunks.length,
          heading,
        },
      };
    });

    return applyChunkGuardrails(chunks, {
      maxChunks: this.maxChunks,
      minChunkTokens: this.minChunkTokens,
    });
  }
}

export interface PdfSlidingWindowConfig {
  windowTokens: number;
  overlapTokens: number;
  minTokensToChunk: number;
}

export const DEFAULT_PDF_SLIDING_WINDOW_CONFIG: PdfSlidingWindowConfig = {
  windowTokens: readEnvInt('CHUNK_PDF_WINDOW_TOKENS', 500),
  overlapTokens: readEnvInt('CHUNK_PDF_OVERLAP_TOKENS', 50),
  minTokensToChunk: readEnvInt('CHUNK_PDF_MIN_TOKENS', 800),
};

/**
 * PDF strategy: sliding token windows with overlap.
 * Uses approximate tokenization (word-based) and estimates page ranges
 * when numpages metadata is available.
 */
export class PdfSlidingWindowChunkingStrategy implements ChunkingStrategy {
  id = 'pdf-sliding-window';
  private config: PdfSlidingWindowConfig;
  private maxChunks = readEnvInt('CHUNK_MAX_PER_DOC', 40);
  private minChunkTokens = readEnvInt('CHUNK_MIN_TOKENS', 160);

  constructor(config: Partial<PdfSlidingWindowConfig> = {}) {
    this.config = { ...DEFAULT_PDF_SLIDING_WINDOW_CONFIG, ...config };
  }

  supports(doc: KnowledgeDocument): boolean {
    return doc.format === 'pdf';
  }

  chunk(doc: KnowledgeDocument): DocumentChunk[] {
    const normalized = normalizeWhitespace(doc.content);
    const tokens = normalized.split(/\s+/).filter(Boolean);

    if (tokens.length < this.config.minTokensToChunk) {
      return [
        {
          content: normalized,
          metadata: {
            strategy: this.id,
            chunkIndex: 0,
            chunkCount: 1,
          },
        },
      ];
    }

    const windows = splitIntoTokenWindows(
      normalized,
      this.config.windowTokens,
      this.config.overlapTokens
    );

    const numPages =
      typeof doc.metadata?.numpages === 'number' ? (doc.metadata.numpages as number) : undefined;
    const totalTokens = tokens.length;

    const chunks: DocumentChunk[] = windows.map((window, index) => {
      const pageRange = estimatePageRange(
        window.tokenStart,
        window.tokenEnd,
        totalTokens,
        numPages
      );

      const pageSuffix =
        pageRange.pageStart && pageRange.pageEnd
          ? ` — pp. ${pageRange.pageStart}-${pageRange.pageEnd}`
          : undefined;

      return {
        content: window.content,
        titleSuffix: pageSuffix,
        metadata: {
          strategy: this.id,
          chunkIndex: index,
          chunkCount: windows.length,
          tokenStart: window.tokenStart,
          tokenEnd: window.tokenEnd,
          pageStart: pageRange.pageStart,
          pageEnd: pageRange.pageEnd,
        },
      };
    });

    return applyChunkGuardrails(chunks, {
      maxChunks: this.maxChunks,
      minChunkTokens: this.minChunkTokens,
    });
  }
}

/**
 * Fallback strategy: single chunk for any document.
 */
export class SingleChunkStrategy implements ChunkingStrategy {
  id = 'single-chunk';

  supports(_doc: KnowledgeDocument): boolean {
    return true;
  }

  chunk(doc: KnowledgeDocument): DocumentChunk[] {
    const normalized = normalizeWhitespace(doc.content);
    return [
      {
        content: normalized,
        metadata: {
          strategy: this.id,
          chunkIndex: 0,
          chunkCount: 1,
        },
      },
    ];
  }
}

export function defaultChunkingStrategies(): ChunkingStrategy[] {
  return [
    new PdfSlidingWindowChunkingStrategy(),
    new MarkdownSemanticChunkingStrategy(),
    new SingleChunkStrategy(),
  ];
}
