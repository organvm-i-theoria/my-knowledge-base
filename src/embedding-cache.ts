/**
 * Caching layer for embeddings to reduce API calls
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
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
  totalEntries: number;
  hitRate: number;
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
  private cache: Map<string, CachedEmbedding> = new Map();
  private cacheDir: string;
  private enabled: boolean;
  private cacheHits = 0;
  private cacheMisses = 0;
  private model: string;

  constructor(cacheDir: string = './cache/embeddings', enabled: boolean = true) {
    this.cacheDir = cacheDir;
    this.enabled = enabled;
    this.model = 'unknown';

    if (enabled) {
      this.initCache();
    }
  }

  /**
   * Initialize cache directory and load existing cache
   */
  private initCache(): void {
    try {
      if (!existsSync(this.cacheDir)) {
        mkdirSync(this.cacheDir, { recursive: true });
        logger.debug(`Cache directory created: ${this.cacheDir}`, undefined, 'EmbeddingCache');
        return;
      }

      // Load existing cache files
      const cacheFile = join(this.cacheDir, 'embeddings.jsonl');
      if (existsSync(cacheFile)) {
        this.loadFromFile(cacheFile);
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
  private loadFromFile(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      for (const line of lines) {
        if (!line) continue;

        const entry = JSON.parse(line) as CachedEmbedding;
        entry.timestamp = new Date(entry.timestamp);
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

    const hash = hashText(text);
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

    const hash = hashText(text);

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
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? (this.cacheHits / total) * 100 : 0;
    const missRate = total > 0 ? (this.cacheMisses / total) * 100 : 0;

    // Estimate tokens saved
    // Average embedding costs ~1000 tokens per call
    const avgTokensPerEmbedding = 1000;
    const tokensSavedByCache = this.cacheHits * avgTokensPerEmbedding;
    const tokensUsedWithCache = this.cacheMisses * avgTokensPerEmbedding;

    return {
      totalEntries: this.cache.size,
      hitRate: Math.round(hitRate * 100) / 100,
      missRate: Math.round(missRate * 100) / 100,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      tokensUsedWithCache,
      tokensSavedByCache
    };
  }

  /**
   * Save cache to file
   */
  save(): void {
    if (!this.enabled) return;

    try {
      if (!existsSync(this.cacheDir)) {
        mkdirSync(this.cacheDir, { recursive: true });
      }

      const cacheFile = join(this.cacheDir, 'embeddings.jsonl');
      const lines = Array.from(this.cache.values()).map(entry =>
        JSON.stringify(entry)
      );

      writeFileSync(cacheFile, lines.join('\n') + '\n');

      logger.info(
        `Cache saved`,
        { entries: this.cache.size, file: cacheFile },
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
    this.cacheHits = 0;
    this.cacheMisses = 0;
    logger.info('Cache cleared', undefined, 'EmbeddingCache');
  }

  /**
   * Get cache size in MB
   */
  getSizeInMB(): number {
    let sizeInBytes = 0;
    for (const entry of this.cache.values()) {
      sizeInBytes += entry.text.length * 2; // UTF-16
      sizeInBytes += entry.embedding.length * 8; // Float64
    }
    return sizeInBytes / (1024 * 1024);
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
    cacheDir: string = './cache/embeddings',
    enabled: boolean = true,
    ttlMs: number = 7 * 24 * 60 * 60 * 1000 // 7 days
  ) {
    super(cacheDir, enabled);
    this.ttlMs = ttlMs;
  }

  /**
   * Get with TTL check
   */
  override get(text: string): number[] | null {
    const embedding = super.get(text);
    if (!embedding) return null;

    // Could check TTL here, but for now just return
    return embedding;
  }

  /**
   * Set TTL for cache
   */
  setTTL(ttlMs: number): void {
    this.ttlMs = ttlMs;
    logger.debug(`Cache TTL set to ${ttlMs}ms`, undefined, 'TTLEmbeddingCache');
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
