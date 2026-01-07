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
  requestsUsed: number;
  requestsRemaining: number;
  resetTime: Date;
  queueSize: number;
  averageDelay: number;
}

/**
 * Rate limiter using token bucket algorithm
 */
export class RateLimiter {
  private name: string;
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
  private requestCount = 0;
  private delaySum = 0;
  private isProcessing = false;

  constructor(config: RateLimitConfig) {
    this.name = config.name;
    this.maxQueueSize = config.maxQueueSize || 1000;

    // Calculate tokens per second
    if (config.requestsPerSecond) {
      this.tokensPerSecond = config.requestsPerSecond;
    } else if (config.requestsPerMinute) {
      this.tokensPerSecond = config.requestsPerMinute / 60;
    } else {
      this.tokensPerSecond = 10; // default: 10 req/s
    }

    // Set max tokens (burst capacity)
    this.maxTokens = config.burst || Math.ceil(this.tokensPerSecond * 2);
    this.tokens = this.maxTokens;
    this.lastRefillTime = Date.now();

    logger.debug(
      `Rate limiter initialized`,
      {
        name: this.name,
        tokensPerSecond: this.tokensPerSecond,
        maxTokens: this.maxTokens
      },
      'RateLimiter'
    );
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillTime) / 1000;
    const tokensToAdd = elapsedSeconds * this.tokensPerSecond;

    this.tokens = Math.min(this.tokens + tokensToAdd, this.maxTokens);
    this.lastRefillTime = now;
  }

  /**
   * Execute function respecting rate limit
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= this.maxQueueSize) {
        reject(new Error(`Rate limiter queue full for ${this.name}`));
        return;
      }

      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process queued requests
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      this.refillTokens();

      if (this.tokens < 1) {
        // Wait for tokens to refill
        const waitTime = (1 - this.tokens) / this.tokensPerSecond * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      const item = this.queue.shift();
      if (!item) break;

      try {
        this.tokens -= 1;
        const startTime = Date.now();
        const result = await item.fn();
        const delay = Date.now() - startTime;

        this.requestCount++;
        this.delaySum += delay;

        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Get rate limiter statistics
   */
  getStats(): RateLimitStats {
    this.refillTokens();

    return {
      name: this.name,
      requestsUsed: this.requestCount,
      requestsRemaining: Math.floor(this.tokens),
      resetTime: new Date(this.lastRefillTime + (1000 / this.tokensPerSecond)),
      queueSize: this.queue.length,
      averageDelay: this.requestCount > 0 ? Math.round(this.delaySum / this.requestCount) : 0
    };
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this.requestCount = 0;
    this.delaySum = 0;
    logger.debug(`Rate limiter reset: ${this.name}`, undefined, 'RateLimiter');
  }
}

/**
 * Multi-provider rate limit manager
 */
export class RateLimitManager {
  private limiters: Map<string, RateLimiter> = new Map();

  /**
   * Register a rate limiter
   */
  register(config: RateLimitConfig): RateLimiter {
    const limiter = new RateLimiter(config);
    this.limiters.set(config.name, limiter);
    return limiter;
  }

  /**
   * Get a rate limiter
   */
  get(name: string): RateLimiter | undefined {
    return this.limiters.get(name);
  }

  /**
   * Create OpenAI rate limiter (4 requests per minute)
   */
  createOpenAILimiter(): RateLimiter {
    return this.register({
      name: 'openai',
      requestsPerMinute: 4,
      burst: 2
    });
  }

  /**
   * Create Anthropic rate limiter (based on tier, default: generous)
   */
  createAnthropicLimiter(tier: 'free' | 'hobby' | 'pro' = 'hobby'): RateLimiter {
    const config: RateLimitConfig = { name: 'anthropic' };

    switch (tier) {
      case 'free':
        config.requestsPerMinute = 1;
        config.burst = 1;
        break;
      case 'hobby':
        config.requestsPerMinute = 60;
        config.burst = 10;
        break;
      case 'pro':
        config.requestsPerMinute = 600;
        config.burst = 100;
        break;
    }

    return this.register(config);
  }

  /**
   * Get all statistics
   */
  getAllStats(): RateLimitStats[] {
    return Array.from(this.limiters.values()).map(limiter => limiter.getStats());
  }

  /**
   * Print stats to console
   */
  printStats(): void {
    console.log('\n📊 Rate Limit Statistics:');
    for (const stats of this.getAllStats()) {
      console.log(`  ${stats.name}:`);
      console.log(`    Requests: ${stats.requestsUsed}`);
      console.log(`    Queue: ${stats.queueSize}`);
      console.log(`    Avg Delay: ${stats.averageDelay}ms`);
    }
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
