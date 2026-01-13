/**
 * API rate limiting with token bucket algorithm
 */

import { logger } from './logger.js';

export interface RateLimitConfig {
  name: string;
  requestsPerSecond?: number;
  requestsPerMinute?: number;
  burst?: number;
  maxQueueSize?: number;
}

export interface RateLimitStats {
  name: string;
  executed: number;
  queued: number;
  tokensRemaining: number;
  requestsPerMinute: number;
}

export class RateLimiter {
  private name: string;
  private requestsPerMinute: number;
  private tokensPerSecond: number;
  private maxTokens: number;
  private tokens: number;
  private lastRefillTime: number;
  private queue: Array<{
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private maxQueueSize: number;
  private executed = 0;
  private isProcessing = false;
  private refillInterval: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig) {
    this.name = config.name;
    this.maxQueueSize = config.maxQueueSize ?? 1000;

    if (config.requestsPerSecond) {
      this.tokensPerSecond = config.requestsPerSecond;
      this.requestsPerMinute = Math.ceil(config.requestsPerSecond * 60);
    } else {
      this.requestsPerMinute = config.requestsPerMinute ?? 60;
      this.tokensPerSecond = this.requestsPerMinute / 60;
    }

    this.maxTokens = config.burst ?? this.requestsPerMinute;
    this.tokens = this.maxTokens;
    this.lastRefillTime = Date.now();

    this.startRefillTimer();

    logger.debug(
      'Rate limiter initialized',
      {
        name: this.name,
        tokensPerSecond: this.tokensPerSecond,
        maxTokens: this.maxTokens
      },
      'RateLimiter'
    );
  }

  private startRefillTimer(): void {
    this.refillInterval = setInterval(() => this.refillTokens(), 250);
    this.refillInterval.unref?.();
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillTime) / 1000;
    const tokensToAdd = elapsedSeconds * this.tokensPerSecond;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.tokens + tokensToAdd, this.maxTokens);
      this.lastRefillTime = now;
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= this.maxQueueSize) {
        reject(new Error('queue full'));
        return;
      }

      this.queue.push({ fn, resolve, reject });
      void this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      this.refillTokens();

      if (this.tokens < 1) {
        const waitTime = ((1 - this.tokens) / this.tokensPerSecond) * 1000;
        await new Promise(resolve => setTimeout(resolve, Math.max(0, waitTime)));
        continue;
      }

      const item = this.queue.shift();
      if (!item) break;

      try {
        this.tokens -= 1;
        const result = await item.fn();
        this.executed++;
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }
    }

    this.isProcessing = false;
  }

  getStats(): RateLimitStats {
    this.refillTokens();
    return {
      name: this.name,
      executed: this.executed,
      queued: this.queue.length,
      tokensRemaining: Math.floor(this.tokens),
      requestsPerMinute: this.requestsPerMinute
    };
  }

  reset(): void {
    this.executed = 0;
    logger.debug(`Rate limiter reset: ${this.name}`, undefined, 'RateLimiter');
  }
}

export interface RateLimitManagerOptions {
  anthropicTier?: 'tier1' | 'tier2' | 'tier3';
}

export class RateLimitManager {
  private limiters: Map<string, RateLimiter> = new Map();
  private anthropicTier: 'tier1' | 'tier2' | 'tier3';

  constructor(options: RateLimitManagerOptions = {}) {
    this.anthropicTier = options.anthropicTier ?? 'tier2';
  }

  addLimiter(name: string, config: RateLimitConfig): RateLimiter {
    const limiter = new RateLimiter({ ...config, name });
    this.limiters.set(name, limiter);
    return limiter;
  }

  getLimiter(name: string): RateLimiter {
    const limiter = this.limiters.get(name);
    if (!limiter) {
      throw new Error(`Limiter not found: ${name}`);
    }
    return limiter;
  }

  getAllLimiters(): RateLimiter[] {
    return Array.from(this.limiters.values());
  }

  getOpenAILimiter(): RateLimiter {
    if (!this.limiters.has('openai')) {
      this.addLimiter('openai', {
        name: 'openai',
        requestsPerSecond: 4,
        burst: 4,
        maxQueueSize: 100
      });
    }
    return this.getLimiter('openai');
  }

  getAnthropicLimiter(): RateLimiter {
    if (!this.limiters.has('anthropic')) {
      const tierConfig: Record<'tier1' | 'tier2' | 'tier3', number> = {
        tier1: 1,
        tier2: 5,
        tier3: 10
      };
      this.addLimiter('anthropic', {
        name: 'anthropic',
        requestsPerSecond: tierConfig[this.anthropicTier],
        burst: tierConfig[this.anthropicTier],
        maxQueueSize: 100
      });
    }
    return this.getLimiter('anthropic');
  }

  executeWithRateLimit<T>(name: string, fn: () => Promise<T>): Promise<T> {
    let limiter = this.limiters.get(name);
    if (!limiter) {
      if (name === 'openai') {
        limiter = this.getOpenAILimiter();
      } else if (name === 'anthropic') {
        limiter = this.getAnthropicLimiter();
      } else {
        return Promise.reject(new Error(`Limiter not found: ${name}`));
      }
    }
    return limiter.execute(fn);
  }

  getAllStats(): Record<string, RateLimitStats> {
    const stats: Record<string, RateLimitStats> = {};
    for (const [name, limiter] of this.limiters.entries()) {
      stats[name] = limiter.getStats();
    }
    return stats;
  }

  getSummary(): string {
    const parts = [];
    for (const [name, limiter] of this.limiters.entries()) {
      const stats = limiter.getStats();
      parts.push(`${name}: ${stats.executed} executed, ${stats.queued} queued`);
    }
    return parts.join('\n');
  }
}

/**
 * Global rate limit manager
 */
let globalManager: RateLimitManager | null = null;

export function getRateLimitManager(): RateLimitManager {
  if (!globalManager) {
    globalManager = new RateLimitManager();
  }
  return globalManager;
}
