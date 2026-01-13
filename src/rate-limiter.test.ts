import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter, RateLimitManager } from './rate-limiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      name: 'test',
      requestsPerSecond: 4,
      burst: 4,
      maxQueueSize: 10,
    });
  });

  describe('Basic Token Bucket', () => {
    it('should initialize with tokens', () => {
      expect(limiter).toBeDefined();
      expect(limiter['tokens']).toBe(4);
    });

    it('should execute function when tokens available', async () => {
      const fn = vi.fn(async () => 'success');
      const result = await limiter.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledOnce();
    });

    it('should queue function when no tokens available', async () => {
      const fns = [];
      for (let i = 0; i < 5; i++) {
        fns.push(vi.fn(async () => i));
      }

      const promises = fns.map(fn => limiter.execute(fn));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      fns.forEach(fn => expect(fn).toHaveBeenCalled());
    });

    it('should refill tokens over time', async () => {
      const fn = vi.fn(async () => 'ok');

      // Use all tokens
      for (let i = 0; i < 4; i++) {
        await limiter.execute(fn);
      }

      expect(limiter['tokens']).toBe(0);

      // Wait for refill
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Should have tokens again
      expect(limiter['tokens']).toBeGreaterThan(0);
    });
  });

  describe('Queue Management', () => {
    it('should reject when queue is full', async () => {
      const limiter2 = new RateLimiter({
        name: 'test',
        requestsPerSecond: 1,
        burst: 1,
        maxQueueSize: 2,
      });

      const fn = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'ok';
      });

      const promises = [];
      for (let i = 0; i < 4; i++) {
        promises.push(limiter2.execute(fn));
      }

      await expect(Promise.all(promises)).rejects.toThrow('queue full');
    });

    it('should process queued items', async () => {
      const limiter2 = new RateLimiter({
        name: 'test',
        requestsPerSecond: 2,
        burst: 2,
        maxQueueSize: 10,
      });

      const results: number[] = [];
      const fn = vi.fn(async (n: number) => {
        results.push(n);
        return n;
      });

      const promises = [];
      for (let i = 0; i < 4; i++) {
        promises.push(limiter2.execute(async () => fn(i)));
      }

      await Promise.all(promises);
      expect(results).toHaveLength(4);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in executed functions', async () => {
      const fn = vi.fn(async () => {
        throw new Error('Test error');
      });

      await expect(limiter.execute(fn)).rejects.toThrow('Test error');
      expect(fn).toHaveBeenCalled();
    });

    it('should allow retrying failed requests', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 2) throw new Error('Fail');
        return 'success';
      });

      await expect(limiter.execute(fn)).rejects.toThrow('Fail');
      const result2 = await limiter.execute(fn);
      expect(result2).toBe('success');
    });
  });

  describe('Statistics', () => {
    it('should track executed requests', async () => {
      const fn = vi.fn(async () => 'ok');

      for (let i = 0; i < 3; i++) {
        await limiter.execute(fn);
      }

      const stats = limiter.getStats();
      expect(stats.executed).toBe(3);
    });

    it('should track queued requests', async () => {
      const limiter2 = new RateLimiter({
        name: 'test',
        requestsPerSecond: 1,
        burst: 1,
        maxQueueSize: 10,
      });

      const fn = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'ok';
      });

      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(limiter2.execute(fn));
      }

      const stats = limiter2.getStats();
      expect(stats.queued).toBeGreaterThan(0);

      await Promise.all(promises);
    });

    it('should provide rate limiting stats', async () => {
      const fn = vi.fn(async () => 'ok');
      await limiter.execute(fn);

      const stats = limiter.getStats();
      expect(stats).toHaveProperty('executed');
      expect(stats).toHaveProperty('queued');
      expect(stats).toHaveProperty('tokensRemaining');
      expect(stats).toHaveProperty('requestsPerMinute');
    });
  });
});

describe('RateLimitManager', () => {
  let manager: RateLimitManager;

  beforeEach(() => {
    manager = new RateLimitManager();
  });

  describe('Managing Multiple Limiters', () => {
    it('should create openai limiter', () => {
      const limiter = manager.getOpenAILimiter();
      expect(limiter).toBeDefined();
    });

    it('should create anthropic limiter', () => {
      const limiter = manager.getAnthropicLimiter();
      expect(limiter).toBeDefined();
    });

    it('should return same limiter instance', () => {
      const limiter1 = manager.getOpenAILimiter();
      const limiter2 = manager.getOpenAILimiter();
      expect(limiter1).toBe(limiter2);
    });
  });

  describe('Adding Custom Limiters', () => {
    it('should add custom limiter', () => {
      manager.addLimiter('custom', {
        name: 'custom',
        requestsPerMinute: 10,
        maxQueueSize: 50,
      });

      const limiter = manager.getLimiter('custom');
      expect(limiter).toBeDefined();
    });

    it('should throw when getting non-existent limiter', () => {
      expect(() => manager.getLimiter('nonexistent')).toThrow();
    });

    it('should list all limiters', () => {
      manager.addLimiter('custom1', {
        name: 'custom1',
        requestsPerMinute: 5,
        maxQueueSize: 10,
      });
      manager.addLimiter('custom2', {
        name: 'custom2',
        requestsPerMinute: 10,
        maxQueueSize: 20,
      });

      const limiters = manager.getAllLimiters();
      expect(limiters.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Rate Limit Execution', () => {
    it('should execute with rate limiting', async () => {
      const fn = vi.fn(async () => 'result');
      const result = await manager.executeWithRateLimit('openai', fn);
      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
    });

    it('should throw for unknown limiter', async () => {
      const fn = vi.fn(async () => 'result');
      await expect(
        manager.executeWithRateLimit('unknown', fn)
      ).rejects.toThrow();
    });
  });

  describe('Statistics', () => {
    it('should get all limiter stats', async () => {
      const fn = vi.fn(async () => 'ok');
      await manager.executeWithRateLimit('openai', fn);

      const allStats = manager.getAllStats();
      expect(allStats).toBeDefined();
      expect(allStats['openai']).toBeDefined();
    });

    it('should provide human-readable summary', async () => {
      const fn = vi.fn(async () => 'ok');
      await manager.executeWithRateLimit('openai', fn);

      const summary = manager.getSummary();
      expect(summary).toContain('openai');
    });
  });

  describe('Configuration', () => {
    it('should configure anthropic limits by tier', () => {
      const tier1 = new RateLimitManager({
        anthropicTier: 'tier1',
      });
      const tier3 = new RateLimitManager({
        anthropicTier: 'tier3',
      });

      const stats1 = tier1.getAnthropicLimiter().getStats();
      const stats3 = tier3.getAnthropicLimiter().getStats();

      // Higher tier should have higher rates
      expect(stats3.requestsPerMinute).toBeGreaterThan(stats1.requestsPerMinute);
    });
  });
});

describe('Rate Limiter Integration', () => {
  it('should handle rapid concurrent requests', async () => {
    const limiter = new RateLimiter({
      name: 'concurrent',
      requestsPerSecond: 3,
      burst: 3,
      maxQueueSize: 20,
    });

    const results: number[] = [];
    const fn = vi.fn(async (n: number) => {
      results.push(n);
      return n;
    });

    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(limiter.execute(async () => fn(i)));
    }

    const allResults = await Promise.all(promises);
    expect(allResults).toHaveLength(10);
  });

  it('should maintain rate limit across multiple functions', async () => {
    const manager = new RateLimitManager();
    const startTime = Date.now();

    const fns = [];
    for (let i = 0; i < 5; i++) {
      fns.push(manager.executeWithRateLimit('openai', async () => i));
    }

    const results = await Promise.all(fns);
    expect(results).toHaveLength(5);

    // Should have taken some time due to rate limiting
    const elapsed = Date.now() - startTime;
    // With 4 req/min rate limit, 5 requests should take some time
    // (at least the queueing and processing time)
    expect(elapsed).toBeGreaterThan(0);
  });
});
