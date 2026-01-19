/**
 * Caching layer for embeddings to reduce API calls
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, createWriteStream } from 'fs';
import { dirname, join } from 'path';
import { createHash } from 'crypto';
import { once } from 'events';
import { logger } from './logger.js';

export interface CachedEmbedding {
  textHash: string;
  text: string;
  embedding: number[];
  model: string;
  timestamp: Date;
  tokensUsed: number;
}

export interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  hitRate: number;
  memoryUsageBytes: number;
  totalEntries: number;
  missRate: number;
  cacheHits: number;
  cacheMisses: number;
  tokensUsedWithCache: number;
  tokensSavedByCache: number;
}

/**
 * Generate hash of text for cache key
 */
function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').substring(0, 16);
}

/**
 * Embedding cache with file and memory storage
 */
export class EmbeddingCache {
  protected cache: Map<string, CachedEmbedding> = new Map();
  protected cacheDir: string;
  protected cacheFile: string;
  protected enabled: boolean;
  protected cacheHits = 0;
  protected cacheMisses = 0;
  protected model: string;

  constructor(
    cachePathOrDir: string = './cache/embeddings',
    enabled: boolean = true,
    deferInit: boolean = false
  ) {
    const looksLikeFile = cachePathOrDir.endsWith('.jsonl');
    this.cacheDir = looksLikeFile ? dirname(cachePathOrDir) : cachePathOrDir;
    this.cacheFile = looksLikeFile
      ? cachePathOrDir
      : join(this.cacheDir, 'embeddings.jsonl');
    this.enabled = enabled;
    this.model = 'unknown';

    if (enabled && !deferInit) {
      this.initCache();
    }
  }

  /**
   * Initialize cache directory and load existing cache
   */
  protected initCache(): void {
    try {
      if (!existsSync(this.cacheDir)) {
        mkdirSync(this.cacheDir, { recursive: true });
        logger.debug(`Cache directory created: ${this.cacheDir}`, undefined, 'EmbeddingCache');
      }

      if (existsSync(this.cacheFile)) {
        this.loadFromFile(this.cacheFile);
      } else {
        writeFileSync(this.cacheFile, '');
      }
    } catch (error) {
      logger.warn(
        `Failed to initialize cache: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'EmbeddingCache'
      );
    }
  }

  /**
   * Load cache from JSONL file
   */
  protected loadFromFile(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        if (!line || !line.trim()) continue;
        let parsed: Partial<CachedEmbedding> & { hash?: string };
        try {
          parsed = JSON.parse(line) as Partial<CachedEmbedding> & { hash?: string };
        } catch {
          continue;
        }

        if (!parsed.text || !Array.isArray(parsed.embedding)) continue;

        const textHash = this.hashText(parsed.text);
        const entry: CachedEmbedding = {
          textHash,
          text: parsed.text,
          embedding: parsed.embedding,
          model: typeof parsed.model === 'string' ? parsed.model : 'unknown',
          timestamp: parsed.timestamp ? new Date(parsed.timestamp) : new Date(),
          tokensUsed: typeof parsed.tokensUsed === 'number' ? parsed.tokensUsed : 0
        };
        this.cache.set(entry.textHash, entry);
      }

      logger.info(
        `Loaded ${this.cache.size} embeddings from cache`,
        { size: this.cache.size },
        'EmbeddingCache'
      );
    } catch (error) {
      logger.warn(
        `Failed to load cache file: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'EmbeddingCache'
      );
    }
  }

  /**
   * Get embedding from cache
   */
  get(text: string): number[] | null {
    if (!this.enabled) return null;

    const hash = this.hashText(text);
    const cached = this.cache.get(hash);

    if (cached) {
      this.cacheHits++;
      logger.debug(`Cache hit for embedding`, { textLength: text.length }, 'EmbeddingCache');
      return cached.embedding;
    }

    this.cacheMisses++;
    return null;
  }

  /**
   * Store embedding in cache
   */
  set(text: string, embedding: number[], model: string = 'unknown', tokensUsed: number = 0): void {
    if (!this.enabled) return;

    const hash = this.hashText(text);

    const entry: CachedEmbedding = {
      textHash: hash,
      text,
      embedding,
      model,
      timestamp: new Date(),
      tokensUsed
    };

    this.cache.set(hash, entry);
    this.model = model;

    logger.debug(
      `Embedding cached`,
      { textLength: text.length, model, tokensUsed },
      'EmbeddingCache'
    );
  }

  /**
   * Batch get embeddings (mix of cached and new)
   */
  batchGet(texts: string[]): Array<{ text: string; embedding: number[] | null; cached: boolean }> {
    return texts.map(text => {
      const embedding = this.get(text);
      return {
        text,
        embedding,
        cached: embedding !== null
      };
    });
  }

  /**
   * Batch set embeddings
   */
  batchSet(entries: Array<{ text: string; embedding: number[]; model?: string; tokensUsed?: number }>): void {
    for (const entry of entries) {
      this.set(entry.text, entry.embedding, entry.model, entry.tokensUsed ?? 0);
    }
  }

  /**
   * Reset hit/miss statistics
   */
  resetStats(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? this.cacheHits / total : 0;
    const missRate = total > 0 ? this.cacheMisses / total : 0;
    const memoryUsageBytes = this.getMemoryUsageBytes();

    // Estimate tokens saved
    // Average embedding costs ~1000 tokens per call
    const avgTokensPerEmbedding = 1000;
    const tokensSavedByCache = this.cacheHits * avgTokensPerEmbedding;
    const tokensUsedWithCache = this.cacheMisses * avgTokensPerEmbedding;

    return {
      entries: this.cache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate,
      memoryUsageBytes,
      totalEntries: this.cache.size,
      missRate,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      tokensUsedWithCache,
      tokensSavedByCache
    };
  }

  /**
   * Save cache to file
   */
  async save(): Promise<void> {
    if (!this.enabled) return;

    try {
      if (!existsSync(this.cacheDir)) {
        mkdirSync(this.cacheDir, { recursive: true });
      }

      const stream = createWriteStream(this.cacheFile);

      for (const entry of this.cache.values()) {
        const line = JSON.stringify(entry) + '\n';
        if (!stream.write(line)) {
          await once(stream, 'drain');
        }
      }

      stream.end();
      await once(stream, 'finish');

      logger.info(
        `Cache saved`,
        { entries: this.cache.size, file: this.cacheFile },
        'EmbeddingCache'
      );
    } catch (error) {
      logger.warn(
        `Failed to save cache: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'EmbeddingCache'
      );
    }
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.resetStats();
    logger.info('Cache cleared', undefined, 'EmbeddingCache');
  }

  /**
   * Get cache size in MB
   */
  getSizeInMB(): number {
    return this.getMemoryUsageBytes() / (1024 * 1024);
  }

  protected getMemoryUsageBytes(): number {
    let sizeInBytes = 0;
    for (const entry of this.cache.values()) {
      sizeInBytes += entry.text.length * 2; // UTF-16
      sizeInBytes += entry.embedding.length * 8; // Float64
    }
    return sizeInBytes;
  }

  protected hashText(text: string): string {
    return hashText(text);
  }

  /**
   * Prune old entries
   */
  pruneOldEntries(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let prunedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp.getTime() > maxAgeMs) {
        this.cache.delete(key);
        prunedCount++;
      }
    }

    if (prunedCount > 0) {
      logger.info(
        `Pruned ${prunedCount} old cache entries`,
        { count: prunedCount },
        'EmbeddingCache'
      );
    }

    return prunedCount;
  }
}

/**
 * Cache with TTL support
 */
export class TTLEmbeddingCache extends EmbeddingCache {
  private ttlMs: number;

  constructor(
    cachePathOrDir: string = './cache/embeddings',
    ttlMs: number = 7 * 24 * 60 * 60 * 1000, // 7 days
    enabled: boolean = true
  ) {
    super(cachePathOrDir, enabled, true);
    this.ttlMs = ttlMs;
    if (enabled) {
      this.initCache();
    }
  }

  /**
   * Get with TTL check
   */
  override get(text: string): number[] | null {
    if (!this.enabled) return null;

    const hash = this.hashText(text);
    const cached = this.cache.get(hash);

    if (!cached) {
      this.cacheMisses++;
      return null;
    }

    if (this.isExpired(cached)) {
      this.cache.delete(hash);
      this.cacheMisses++;
      return null;
    }

    cached.timestamp = new Date();
    this.cacheHits++;
    return cached.embedding;
  }

  /**
   * Set TTL for cache
   */
  setTTL(ttlMs: number): void {
    this.ttlMs = ttlMs;
    logger.debug(`Cache TTL set to ${ttlMs}ms`, undefined, 'TTLEmbeddingCache');
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp.getTime() > this.ttlMs) {
        this.cache.delete(key);
        removed++;
      }
    }
    return removed;
  }

  protected override loadFromFile(filePath: string): void {
    const now = Date.now();
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        if (!line || !line.trim()) continue;
        let parsed: Partial<CachedEmbedding> & { hash?: string };
        try {
          parsed = JSON.parse(line) as Partial<CachedEmbedding> & { hash?: string };
        } catch {
          continue;
        }

        if (!parsed.text || !Array.isArray(parsed.embedding)) continue;

        const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : new Date();
        if (now - timestamp.getTime() > this.ttlMs) continue;

        const textHash = this.hashText(parsed.text);
        const entry: CachedEmbedding = {
          textHash,
          text: parsed.text,
          embedding: parsed.embedding,
          model: typeof parsed.model === 'string' ? parsed.model : 'unknown',
          timestamp,
          tokensUsed: typeof parsed.tokensUsed === 'number' ? parsed.tokensUsed : 0
        };
        this.cache.set(entry.textHash, entry);
      }
    } catch (error) {
      logger.warn(
        `Failed to load cache file: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'TTLEmbeddingCache'
      );
    }
  }

  private isExpired(entry: CachedEmbedding): boolean {
    return Date.now() - entry.timestamp.getTime() > this.ttlMs;
  }
}

/**
 * Global cache instance
 */
let globalCache: EmbeddingCache | null = null;

export function getEmbeddingCache(cacheDir?: string): EmbeddingCache {
  if (!globalCache) {
    globalCache = new EmbeddingCache(cacheDir);
  }
  return globalCache;
}
