/**
 * Atomize conversations into knowledge units
 */

import { randomUUID } from 'crypto';
import { AtomicUnit, Conversation, Message, AtomicUnitType, KnowledgeItem, KnowledgeDocument } from './types.js';
import { DocumentAtomizer } from './document-atomizer.js';
import {
  ChunkingStrategy,
  defaultChunkingStrategies,
  detectImages,
  DocumentChunk,
} from './chunking-strategies.js';
import { normalizeCategory, normalizeKeywords, normalizeTags } from './taxonomy.js';
import { RedactionService, RedactionConfig } from './redaction-service.js';

function readEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface AtomizerConfig {
  strategies?: ChunkingStrategy[];
  redaction?: RedactionConfig & { enabled?: boolean };
}

export class KnowledgeAtomizer {
  private strategies: ChunkingStrategy[];
  private largeDocThreshold = readEnvInt('CHUNK_LARGE_DOC_THRESHOLD', 12);
  private redactionService: RedactionService | null = null;
  private redactionEnabled: boolean = false;

  constructor(config?: AtomizerConfig | ChunkingStrategy[]) {
    // Handle legacy ChunkingStrategy[] parameter
    if (Array.isArray(config)) {
      this.strategies = config;
    } else {
      this.strategies = config?.strategies ?? defaultChunkingStrategies();

      // Initialize redaction service if enabled
      if (config?.redaction?.enabled !== false) {
        this.redactionEnabled = config?.redaction?.enabled ?? true;
        this.redactionService = new RedactionService(config?.redaction);
      }
    }
  }

  /**
   * Enable or disable redaction at runtime
   */
  setRedactionEnabled(enabled: boolean): void {
    this.redactionEnabled = enabled;
    if (enabled && !this.redactionService) {
      this.redactionService = new RedactionService();
    }
  }

  /**
   * Universal atomization entry point
   */
  atomize(item: KnowledgeItem): AtomicUnit[] {
    if ('messages' in item) {
      return this.atomizeConversation(item);
    } else {
      return this.atomizeDocument(item);
    }
  }

  /**
   * Atomize a conversation
   */
  atomizeConversation(conversation: Conversation): AtomicUnit[] {
    const messageUnits = this.atomizeByMessage(conversation);
    const codeUnits = this.atomizeCodeBlocks(conversation);
    return [...messageUnits, ...codeUnits];
  }

  /**
   * Atomize a document using intelligent section detection
   * Detects lists, tables, blockquotes, code blocks, and hierarchical headers.
   * Now supports chunking strategies for large documents (e.g., PDFs).
   */
  atomizeDocument(doc: KnowledgeDocument): AtomicUnit[] {
    const strategy = this.selectStrategy(doc);
    const chunks = strategy.chunk(doc);
    const documentAtomizer = new DocumentAtomizer();

    const allUnits: AtomicUnit[] = [];

    chunks.forEach((chunk) => {
      const chunkDoc = this.buildChunkDocument(doc, chunk, chunks.length);
      const units = documentAtomizer.atomizeDocument(chunkDoc);
      const enriched = units.map((unit) => this.enrichUnit(unit, chunk, chunkDoc));
      allUnits.push(...enriched);
    });

    return allUnits;
  }

  /**
   * Message-level atomization (Phase 1 strategy)
   */
  atomizeByMessage(conversation: Conversation): AtomicUnit[] {
    const units: AtomicUnit[] = [];

    for (let i = 0; i < conversation.messages.length; i++) {
      const message = conversation.messages[i];

      if (message.content.length < 20) continue;

      let context = i > 0
        ? conversation.messages[i - 1].content.slice(0, 200)
        : '';

      // Apply redaction if enabled
      let content = message.content;
      if (this.redactionEnabled && this.redactionService) {
        const contentResult = this.redactionService.redact(content);
        content = contentResult.redactedText;

        if (context) {
          const contextResult = this.redactionService.redact(context);
          context = contextResult.redactedText;
        }
      }

      const type = this.inferType(message);
      const title = this.generateTitle(content);
      const keywords = this.extractKeywords(content);
      const tags = this.autoTag(content, type);

      const unit: AtomicUnit = {
        id: randomUUID(),
        type,
        timestamp: message.timestamp || new Date(),
        title,
        content,
        context,
        tags,
        category: this.categorize(content),
        conversationId: conversation.id,
        relatedUnits: [],
        keywords
      };

      units.push(unit);
    }

    return units;
  }

  /**
   * Code extraction atomization
   */
  atomizeCodeBlocks(conversation: Conversation): AtomicUnit[] {
    const units: AtomicUnit[] = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]+?)```/g;

    for (const message of conversation.messages) {
      const matches = [...message.content.matchAll(codeBlockRegex)];

      for (const match of matches) {
        const language = match[1] || 'text';
        let code = match[2];
        let context = message.content.slice(0, 200);

        // Apply redaction if enabled
        if (this.redactionEnabled && this.redactionService) {
          const codeResult = this.redactionService.redact(code);
          code = codeResult.redactedText;

          const contextResult = this.redactionService.redact(context);
          context = contextResult.redactedText;
        }

        const unit: AtomicUnit = {
          id: randomUUID(),
          type: 'code',
          timestamp: message.timestamp || new Date(),
          title: `Code: ${language}`,
          content: code,
          context,
          tags: [language, 'code'],
          category: 'programming',
          conversationId: conversation.id,
          relatedUnits: [],
          keywords: [language, 'code', 'snippet']
        };

        units.push(unit);
      }
    }

    return units;
  }

  private inferType(message: Message): AtomicUnitType {
    const content = message.content.toLowerCase();

    if (message.role === 'user' && (
      content.includes('?') ||
      content.startsWith('how') ||
      content.startsWith('what') ||
      content.startsWith('why') ||
      content.startsWith('when')
    )) {
      return 'question';
    }

    if (content.includes('```') ||
        content.includes('function') ||
        content.includes('class ') ||
        content.includes('const ')) {
      return 'code';
    }

    if (content.includes('decide') ||
        content.includes('choose') ||
        content.includes('recommend') ||
        content.includes('should we')) {
      return 'decision';
    }

    if (content.includes('see ') ||
        content.includes('refer to') ||
        content.includes('docs') ||
        content.includes('documentation')) {
      return 'reference';
    }

    return 'insight';
  }

  private generateTitle(content: string): string {
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    const firstLine = lines[0] || 'Untitled';

    if (firstLine.length > 80) {
      return firstLine.slice(0, 77) + '...';
    }

    return firstLine;
  }

  private extractKeywords(content: string): string[] {
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4);

    const uniqueWords = [...new Set(words)];
    const wordCounts = new Map<string, number>();
    words.forEach(w => wordCounts.set(w, (wordCounts.get(w) || 0) + 1));

    return uniqueWords
      .sort((a, b) => (wordCounts.get(b) || 0) - (wordCounts.get(a) || 0))
      .slice(0, 10);
  }

  private autoTag(content: string, type: AtomicUnitType): string[] {
    const tags: string[] = [type];
    const lower = content.toLowerCase();

    const languages = ['typescript', 'javascript', 'python', 'rust', 'go', 'java', 'sql'];
    languages.forEach(lang => {
      if (lower.includes(lang)) tags.push(lang);
    });

    const technologies = ['react', 'node', 'express', 'oauth', 'api', 'database', 'auth'];
    technologies.forEach(tech => {
      if (lower.includes(tech)) tags.push(tech);
    });

    if (lower.includes('security') || lower.includes('auth')) tags.push('security');
    if (lower.includes('performance') || lower.includes('optimize')) tags.push('performance');
    if (lower.includes('bug') || lower.includes('fix')) tags.push('bugfix');
    if (lower.includes('feature') || lower.includes('implement')) tags.push('feature');

    return normalizeTags(tags);
  }

  private categorize(content: string): string {
    const lower = content.toLowerCase();

    if (lower.includes('code') || lower.includes('function') || lower.includes('class')) {
      return normalizeCategory('programming');
    }

    if (lower.includes('write') || lower.includes('article') || lower.includes('essay')) {
      return normalizeCategory('writing');
    }

    if (lower.includes('research') || lower.includes('study') || lower.includes('analyze')) {
      return normalizeCategory('research');
    }

    if (lower.includes('design') || lower.includes('ui') || lower.includes('ux')) {
      return normalizeCategory('design');
    }

    return normalizeCategory('general');
  }

  private selectStrategy(doc: KnowledgeDocument): ChunkingStrategy {
    const strategy = this.strategies.find((s) => s.supports(doc));
    if (!strategy) {
      // This should not happen because the fallback strategy supports all docs.
      return this.strategies[this.strategies.length - 1];
    }
    return strategy;
  }

  private buildChunkDocument(doc: KnowledgeDocument, chunk: DocumentChunk, chunkCount: number): KnowledgeDocument {
    const images = detectImages(chunk.content);
    const titleSuffix = chunk.titleSuffix || (chunkCount > 1 ? ` — chunk ${chunk.metadata.chunkIndex + 1}` : '');

    return {
      ...doc,
      title: `${doc.title}${titleSuffix}`,
      content: chunk.content,
      metadata: {
        ...doc.metadata,
        chunk: chunk.metadata,
        images: {
          count: images.length,
          items: images.slice(0, 20),
        },
      },
    };
  }

  private enrichUnit(unit: AtomicUnit, chunk: DocumentChunk, doc: KnowledgeDocument): AtomicUnit {
    const chunkMeta = doc.metadata?.chunk as any;
    const imageMeta = doc.metadata?.images as { count?: number; items?: Array<{ alt?: string; src: string }> } | undefined;
    const imageCount = imageMeta?.count || 0;

    const chunkLabel = chunkMeta?.chunkCount > 1 ? `chunk ${chunkMeta.chunkIndex + 1}/${chunkMeta.chunkCount}` : '';
    const pageLabel =
      typeof chunkMeta?.pageStart === 'number' && typeof chunkMeta?.pageEnd === 'number'
        ? `pp. ${chunkMeta.pageStart}-${chunkMeta.pageEnd}`
        : '';
    const contextSuffix = [chunkLabel, pageLabel].filter(Boolean).join(' • ');

    const imageTags = imageCount > 0 ? ['has-image', 'image'] : [];
    const strategyTags = chunkMeta?.strategy ? ['chunked', `chunk-strategy-${chunkMeta.strategy}`] : [];
    const largeDocTags = chunkMeta?.chunkCount > this.largeDocThreshold ? ['large-document'] : [];

    const imageAltKeywords =
      imageMeta?.items
        ?.flatMap((img) => (img.alt ? img.alt.split(/\s+/) : []))
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length > 2) || [];

    const tags = normalizeTags([
      ...(unit.tags || []),
      ...(imageTags),
      ...(strategyTags),
      ...(largeDocTags),
    ]);

    const keywords = normalizeKeywords([
      ...(unit.keywords || []),
      ...imageAltKeywords,
    ]);

    const normalizedCategory = normalizeCategory(unit.category);

    return {
      ...unit,
      context: contextSuffix ? `${unit.context} (${contextSuffix})` : unit.context,
      tags,
      keywords,
      category: normalizedCategory,
    };
  }
}
