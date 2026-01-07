import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EmbeddingCache, TTLEmbeddingCache } from './embedding-cache';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('EmbeddingCache', () => {
  let cacheDir: string;
  let cachePath: string;
  let cache: EmbeddingCache;

  beforeEach(() => {
    cacheDir = join(process.cwd(), '.test-tmp', 'embeddings');
    cachePath = join(cacheDir, 'test-cache.jsonl');
    mkdirSync(cacheDir, { recursive: true });
    cache = new EmbeddingCache(cachePath);
  });

  afterEach(() => {
    try {
      unlinkSync(cachePath);
    } catch (e) {
      // File might not exist
    }
  });

  describe('Cache Operations', () => {
    it('should store and retrieve embeddings', () => {
      const text = 'Hello world';
      const embedding = [0.1, 0.2, 0.3, 0.4];

      cache.set(text, embedding);
      const retrieved = cache.get(text);

      expect(retrieved).toEqual(embedding);
    });

    it('should return null for missing entries', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should handle multiple entries', () => {
      const entries = [
        { text: 'Text 1', embedding: [0.1, 0.2] },
        { text: 'Text 2', embedding: [0.3, 0.4] },
        { text: 'Text 3', embedding: [0.5, 0.6] },
      ];

      entries.forEach(({ text, embedding }) => {
        cache.set(text, embedding);
      });

      entries.forEach(({ text, embedding }) => {
        expect(cache.get(text)).toEqual(embedding);
      });
    });

    it('should update existing entries', () => {
      const text = 'Hello';
      cache.set(text, [0.1, 0.2]);
      cache.set(text, [0.3, 0.4]);

      const result = cache.get(text);
      expect(result).toEqual([0.3, 0.4]);
    });
  });

  describe('Batch Operations', () => {
    it('should handle batch get', () => {
      cache.set('Text 1', [0.1, 0.2]);
      cache.set('Text 2', [0.3, 0.4]);

      const results = cache.batchGet(['Text 1', 'Text 2', 'Text 3']);

      expect(results).toHaveLength(3);
      expect(results[0].embedding).toEqual([0.1, 0.2]);
      expect(results[1].embedding).toEqual([0.3, 0.4]);
      expect(results[2].embedding).toBeNull();
      expect(results[0].cached).toBe(true);
      expect(results[2].cached).toBe(false);
    });

    it('should handle batch set', () => {
      const entries = [
        { text: 'A', embedding: [0.1] },
        { text: 'B', embedding: [0.2] },
        { text: 'C', embedding: [0.3] },
      ];

      cache.batchSet(entries);

      entries.forEach(({ text, embedding }) => {
        expect(cache.get(text)).toEqual(embedding);
      });
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache hits', () => {
      cache.set('Text', [0.1, 0.2]);

      cache.get('Text');
      cache.get('Text');

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
    });

    it('should track cache misses', () => {
      cache.get('Text1');
      cache.get('Text2');

      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
    });

    it('should calculate hit rate', () => {
      cache.set('Text', [0.1, 0.2]);

      cache.get('Text');
      cache.get('Text');
      cache.get('Missing');

      const stats = cache.getStats();
      expect(stats.hitRate).toBeCloseTo(0.6667, 2);
    });

    it('should track total entries', () => {
      cache.set('Text1', [0.1]);
      cache.set('Text2', [0.2]);
      cache.set('Text3', [0.3]);

      const stats = cache.getStats();
      expect(stats.entries).toBe(3);
    });

    it('should provide detailed stats', () => {
      cache.set('Text', [0.1, 0.2, 0.3]);
      cache.get('Text');
      cache.get('Missing');

      const stats = cache.getStats();

      expect(stats).toHaveProperty('entries');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('memoryUsageBytes');
    });
  });

  describe('Persistence', () => {
    it('should save cache to file', () => {
      cache.set('Text1', [0.1, 0.2]);
      cache.set('Text2', [0.3, 0.4]);

      cache.save();

      // Create new cache from same file
      const cache2 = new EmbeddingCache(cachePath);
      expect(cache2.get('Text1')).toEqual([0.1, 0.2]);
      expect(cache2.get('Text2')).toEqual([0.3, 0.4]);
    });

    it('should load cache from file', () => {
      // Pre-populate cache file
      const entry1 = { hash: 'abc123', text: 'Text', embedding: [0.1, 0.2] };
      const entry2 = { hash: 'def456', text: 'Text2', embedding: [0.3, 0.4] };
      writeFileSync(cachePath, JSON.stringify(entry1) + '\n' + JSON.stringify(entry2) + '\n');

      const cache2 = new EmbeddingCache(cachePath);
      expect(cache2.get('Text')).toEqual([0.1, 0.2]);
      expect(cache2.get('Text2')).toEqual([0.3, 0.4]);
    });

    it('should handle missing cache file on load', () => {
      const nonexistentPath = join(cacheDir, 'nonexistent.jsonl');
      const cache2 = new EmbeddingCache(nonexistentPath);
      expect(cache2.get('any')).toBeNull();
    });

    it('should handle corrupted cache file', () => {
      writeFileSync(cachePath, 'invalid json\n{"bad": json}\n');
      const cache2 = new EmbeddingCache(cachePath);
      // Should not throw, just skip bad entries
      expect(cache2.getStats().entries).toBe(0);
    });
  });

  describe('Clear and Reset', () => {
    it('should clear cache', () => {
      cache.set('Text', [0.1, 0.2]);
      expect(cache.get('Text')).toEqual([0.1, 0.2]);

      cache.clear();
      expect(cache.get('Text')).toBeNull();
    });

    it('should reset statistics', () => {
      cache.set('Text', [0.1, 0.2]);
      cache.get('Text');
      cache.get('Text');
      cache.get('Missing');

      cache.resetStats();
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('Text Hashing', () => {
    it('should create deterministic hashes', () => {
      const text = 'Hello world';
      const hash1 = cache['hashText'](text);
      const hash2 = cache['hashText'](text);

      expect(hash1).toBe(hash2);
    });

    it('should create different hashes for different texts', () => {
      const hash1 = cache['hashText']('Text 1');
      const hash2 = cache['hashText']('Text 2');

      expect(hash1).not.toBe(hash2);
    });

    it('should create short hashes', () => {
      const hash = cache['hashText']('Any text here');
      expect(hash.length).toBeLessThanOrEqual(20);
    });
  });
});

describe('TTLEmbeddingCache', () => {
  let cacheDir: string;
  let cachePath: string;
  let cache: TTLEmbeddingCache;

  beforeEach(() => {
    cacheDir = join(process.cwd(), '.test-tmp', 'embeddings');
    cachePath = join(cacheDir, 'test-ttl-cache.jsonl');
    mkdirSync(cacheDir, { recursive: true });
    cache = new TTLEmbeddingCache(cachePath, 100); // 100ms TTL for testing
  });

  afterEach(() => {
    try {
      unlinkSync(cachePath);
    } catch (e) {
      // File might not exist
    }
  });

  describe('TTL Functionality', () => {
    it('should return cached value before TTL expires', async () => {
      cache.set('Text', [0.1, 0.2]);
      await new Promise(resolve => setTimeout(resolve, 50));

      const result = cache.get('Text');
      expect(result).toEqual([0.1, 0.2]);
    });

    it('should expire value after TTL', async () => {
      cache.set('Text', [0.1, 0.2]);
      await new Promise(resolve => setTimeout(resolve, 150));

      const result = cache.get('Text');
      expect(result).toBeNull();
    });

    it('should refresh TTL on access', async () => {
      cache.set('Text', [0.1, 0.2]);
      await new Promise(resolve => setTimeout(resolve, 50));

      cache.get('Text'); // This should refresh the TTL

      await new Promise(resolve => setTimeout(resolve, 80));

      const result = cache.get('Text');
      expect(result).toEqual([0.1, 0.2]);
    });

    it('should handle multiple entries with different expirations', async () => {
      cache.set('Text1', [0.1]);
      await new Promise(resolve => setTimeout(resolve, 30));
      cache.set('Text2', [0.2]);

      await new Promise(resolve => setTimeout(resolve, 90));

      expect(cache.get('Text1')).toBeNull();
      expect(cache.get('Text2')).toEqual([0.2]);
    });
  });

  describe('Batch Operations with TTL', () => {
    it('should batch get with TTL', async () => {
      cache.set('Text1', [0.1]);
      cache.set('Text2', [0.2]);

      await new Promise(resolve => setTimeout(resolve, 50));

      const results = cache.batchGet(['Text1', 'Text2', 'Text3']);
      expect(results[0].embedding).toEqual([0.1]);
      expect(results[1].embedding).toEqual([0.2]);
    });

    it('should expire batch entries after TTL', async () => {
      cache.batchSet([
        { text: 'A', embedding: [0.1] },
        { text: 'B', embedding: [0.2] },
      ]);

      await new Promise(resolve => setTimeout(resolve, 150));

      const results = cache.batchGet(['A', 'B']);
      expect(results[0].embedding).toBeNull();
      expect(results[1].embedding).toBeNull();
    });
  });

  describe('TTL Persistence', () => {
    it('should not restore expired entries from file', async () => {
      cache.set('Text', [0.1, 0.2]);
      cache.save();

      await new Promise(resolve => setTimeout(resolve, 150));

      const cache2 = new TTLEmbeddingCache(cachePath, 100);
      expect(cache2.get('Text')).toBeNull();
    });

    it('should restore non-expired entries from file', async () => {
      cache.set('Text', [0.1, 0.2]);
      cache.save();

      await new Promise(resolve => setTimeout(resolve, 50));

      const cache2 = new TTLEmbeddingCache(cachePath, 200);
      expect(cache2.get('Text')).toEqual([0.1, 0.2]);
    });
  });

  describe('Cleanup', () => {
    it('should remove expired entries', async () => {
      cache.set('Text1', [0.1]);
      cache.set('Text2', [0.2]);

      await new Promise(resolve => setTimeout(resolve, 150));

      cache.cleanup();

      const stats = cache.getStats();
      expect(stats.entries).toBe(0);
    });

    it('should keep non-expired entries during cleanup', async () => {
      cache.set('Text1', [0.1]);
      await new Promise(resolve => setTimeout(resolve, 50));
      cache.set('Text2', [0.2]);

      await new Promise(resolve => setTimeout(resolve, 80));

      cache.cleanup();

      expect(cache.get('Text2')).toEqual([0.2]);
    });
  });

  describe('TTL Configuration', () => {
    it('should support different TTL values', async () => {
      const shortTTL = new TTLEmbeddingCache(
        join(cacheDir, 'short.jsonl'),
        50
      );
      const longTTL = new TTLEmbeddingCache(
        join(cacheDir, 'long.jsonl'),
        500
      );

      shortTTL.set('Text', [0.1]);
      longTTL.set('Text', [0.2]);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(shortTTL.get('Text')).toBeNull();
      expect(longTTL.get('Text')).toEqual([0.2]);
    });
  });
});

describe('Cache Integration', () => {
  it('should work as drop-in replacement', () => {
    const cacheDir = join(process.cwd(), '.test-tmp', 'embeddings');
    mkdirSync(cacheDir, { recursive: true });
    const cachePath = join(cacheDir, 'integration.jsonl');

    const cache = new EmbeddingCache(cachePath);

    cache.set('Text1', [0.1, 0.2]);
    cache.set('Text2', [0.3, 0.4]);

    const results = cache.batchGet(['Text1', 'Text2', 'Text3']);
    expect(results.filter(r => r.cached)).toHaveLength(2);
    expect(results.filter(r => !r.cached)).toHaveLength(1);

    unlinkSync(cachePath);
  });

  it('should handle high-volume scenarios', () => {
    const cacheDir = join(process.cwd(), '.test-tmp', 'embeddings');
    mkdirSync(cacheDir, { recursive: true });
    const cachePath = join(cacheDir, 'highvolume.jsonl');

    const cache = new EmbeddingCache(cachePath);

    // Add 100 entries
    for (let i = 0; i < 100; i++) {
      cache.set(`Text ${i}`, Array(10).fill(i / 100));
    }

    // Query all of them
    for (let i = 0; i < 100; i++) {
      const result = cache.get(`Text ${i}`);
      expect(result).toBeDefined();
    }

    const stats = cache.getStats();
    expect(stats.hits).toBe(100);
    expect(stats.entries).toBe(100);

    unlinkSync(cachePath);
  });
});
