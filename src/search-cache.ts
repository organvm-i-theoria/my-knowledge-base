/**
 * Search Cache - In-memory LRU cache for search results
 * Reduces redundant searches and improves response times dramatically
 */

import { Logger } from './logger.js';
import crypto from 'crypto';

const logger = new Logger({ context: 'search-cache' });

export interface CachedResult {
  key: string;
  results: any[];
  facets?: any[];
  total?: number;
  timestamp: number;
  ttl: number;
  queryTime: number;
}

/**
 * SearchCache - In-memory LRU cache with TTL support
 */
export class SearchCache {
  private cache: Map<string, CachedResult> = new Map();
  private accessOrder: string[] = [];
  private maxSize: number = 1000;
  private defaultTTL: number = 5 * 60 * 1000; // 5 minutes
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  /**
   * Generate cache key from search options
   */
  generateKey(options: {
    query?: string;
    filters?: any[];
    searchType?: string;
    limit?: number;
    weights?: { fts: number; semantic: number };
  }): string {
    const searchType = options.searchType || 'hybrid';
    const canonical = JSON.stringify({
      query: options.query || '',
      filters: this.sortFilters(options.filters || []),
      searchType,
      limit: options.limit || 20,
      weights: options.weights || { fts: 0.4, semantic: 0.6 }
    });

    const hash = crypto.createHash('sha256').update(canonical).digest('hex');
    return `search:${searchType}:${hash.substring(0, 16)}`;
  }

  /**
   * Get cached result if valid
   */
  get(key: string): CachedResult | null {
    const cached = this.cache.get(key);

    if (!cached) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Move to end (most recently used)
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);

    this.stats.hits++;
    return cached;
  }

  /**
   * Set cache value
   */
  set(key: string, result: Omit<CachedResult, 'key' | 'timestamp'>, ttl?: number): void {
    // Remove if already exists (to reset LRU order)
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
    }

    const cached: CachedResult = {
      key,
      results: result.results,
      facets: result.facets,
      total: result.total,
      queryTime: result.queryTime,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    };

    this.cache.set(key, cached);
    this.accessOrder.push(key);

    // Evict if over size
    while (this.cache.size > this.maxSize) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }
  }

  /**
   * Invalidate all cache entries
   */
  invalidateAll(): void {
    this.cache.clear();
    this.accessOrder = [];
    logger.info('Cache invalidated (all entries cleared)');
  }

  /**
   * Invalidate entries matching predicate
   */
  invalidateWhere(predicate: (key: string, result: CachedResult) => boolean): number {
    let count = 0;
    const toDelete: string[] = [];

    for (const [key, result] of this.cache.entries()) {
      if (predicate(key, result)) {
        toDelete.push(key);
        count++;
      }
    }

    for (const key of toDelete) {
      this.cache.delete(key);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
    }

    return count;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    evictions: number;
    hitRate: number;
  } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate
    };
  }

  /**
   * Clear statistics
   */
  clearStats(): void {
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Get cache size in bytes (approximation)
   */
  getSizeInBytes(): number {
    let bytes = 0;

    for (const result of this.cache.values()) {
      bytes += JSON.stringify(result).length;
    }

    return bytes;
  }

  /**
   * Set cache configuration
   */
  configure(options: { maxSize?: number; defaultTTL?: number }): void {
    if (options.maxSize) {
      this.maxSize = options.maxSize;
    }

    if (options.defaultTTL) {
      this.defaultTTL = options.defaultTTL;
    }

    logger.info('Cache configured: maxSize=' + this.maxSize + ', defaultTTL=' + this.defaultTTL + 'ms');
  }

  /**
   * Sort filters for consistent key generation
   */
  private sortFilters(filters: any[]): any[] {
    if (!Array.isArray(filters)) {
      return [];
    }

    return filters.sort((a, b) => {
      const aStr = JSON.stringify(a);
      const bStr = JSON.stringify(b);
      return aStr.localeCompare(bStr);
    });
  }
}

/**
 * Create default search cache
 */
export function createSearchCache(maxSize: number = 1000, defaultTTLMs: number = 5 * 60 * 1000): SearchCache {
  const cache = new SearchCache();
  cache.configure({ maxSize, defaultTTL: defaultTTLMs });
  return cache;
}
