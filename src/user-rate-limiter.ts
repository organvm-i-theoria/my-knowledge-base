/**
 * Per-User/Per-Token Rate Limiting
 * Tracks and enforces rate limits for authenticated users and API tokens
 */

import { Logger } from './logger.js';

const logger = new Logger({ context: 'user-rate-limiter' });

/**
 * Rate limit tier configuration
 */
export enum RateLimitTier {
  FREE = 'free',
  BASIC = 'basic',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

/**
 * Rate limit configuration per tier
 */
export interface RateLimitConfig {
  tier: RateLimitTier;
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  concurrentRequests: number;
  tokenRefreshRate: number;
}

/**
 * Predefined rate limit configurations
 */
export const RATE_LIMIT_CONFIGS: Record<RateLimitTier, RateLimitConfig> = {
  [RateLimitTier.FREE]: {
    tier: RateLimitTier.FREE,
    requestsPerMinute: 10,
    requestsPerHour: 100,
    requestsPerDay: 1000,
    concurrentRequests: 2,
    tokenRefreshRate: 60000,
  },
  [RateLimitTier.BASIC]: {
    tier: RateLimitTier.BASIC,
    requestsPerMinute: 30,
    requestsPerHour: 500,
    requestsPerDay: 5000,
    concurrentRequests: 2,
    tokenRefreshRate: 60000,
  },
  [RateLimitTier.PRO]: {
    tier: RateLimitTier.PRO,
    requestsPerMinute: 100,
    requestsPerHour: 3000,
    requestsPerDay: 50000,
    concurrentRequests: 5,
    tokenRefreshRate: 60000,
  },
  [RateLimitTier.ENTERPRISE]: {
    tier: RateLimitTier.ENTERPRISE,
    requestsPerMinute: 1000,
    requestsPerHour: 50000,
    requestsPerDay: 500000,
    concurrentRequests: 50,
    tokenRefreshRate: 60000,
  },
};

/**
 * User quota tracking
 */
export interface UserQuota {
  userId: string;
  tier: RateLimitTier;
  requestsInMinute: number;
  requestsInHour: number;
  requestsInDay: number;
  activeConnections: number;
  minuteResetAt: Date;
  hourResetAt: Date;
  dayResetAt: Date;
  lastRequest: Date;
  blocked: boolean;
  blockReason?: string;
}

/**
 * Rate limit status for response headers
 */
export interface RateLimitStatus {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

/**
 * Per-User Rate Limiter
 */
export class UserRateLimiter {
  private quotas: Map<string, UserQuota> = new Map();
  private tiers: Map<string, RateLimitTier> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.startCleanup();
  }
  
  /**
   * Register user with tier
   */
  registerUser(userId: string, tier: RateLimitTier = RateLimitTier.FREE): void {
    this.tiers.set(userId, tier);
    
    if (!this.quotas.has(userId)) {
      this.quotas.set(userId, this.createQuota(userId, tier));
    }
    
    logger.info('Registered user ' + userId + ' with tier ' + tier);
  }
  
  /**
   * Create new quota for user
   */
  private createQuota(userId: string, tier: RateLimitTier): UserQuota {
    return {
      userId,
      tier,
      requestsInMinute: 0,
      requestsInHour: 0,
      requestsInDay: 0,
      activeConnections: 0,
      minuteResetAt: new Date(Date.now() + 60000),
      hourResetAt: new Date(Date.now() + 3600000),
      dayResetAt: new Date(Date.now() + 86400000),
      lastRequest: new Date(),
      blocked: false,
    };
  }
  
  /**
   * Check if user can make request
   */
  canMakeRequest(userId: string): { allowed: boolean; reason?: string } {
    const quota = this.getOrCreateQuota(userId);
    
    if (quota.blocked) {
      return { allowed: false, reason: quota.blockReason || 'User blocked' };
    }
    
    const config = RATE_LIMIT_CONFIGS[quota.tier];
    const now = new Date();
    
    this.resetQuotasIfNeeded(quota, now);
    
    if (quota.requestsInMinute >= config.requestsPerMinute) {
      return { allowed: false, reason: 'Rate limit exceeded (minute)' };
    }
    
    if (quota.requestsInHour >= config.requestsPerHour) {
      return { allowed: false, reason: 'Rate limit exceeded (hour)' };
    }
    
    if (quota.requestsInDay >= config.requestsPerDay) {
      return { allowed: false, reason: 'Rate limit exceeded (day)' };
    }
    
    if (quota.activeConnections >= config.concurrentRequests) {
      return { allowed: false, reason: 'Too many concurrent requests' };
    }
    
    return { allowed: true };
  }
  
  /**
   * Record request for user
   */
  recordRequest(userId: string): void {
    const quota = this.getOrCreateQuota(userId);
    
    if (!quota.blocked) {
      quota.requestsInMinute++;
      quota.requestsInHour++;
      quota.requestsInDay++;
      quota.lastRequest = new Date();
      
      logger.debug('Recorded request for ' + userId + ' (minute: ' + quota.requestsInMinute + ')');
    }
  }
  
  /**
   * Start active connection
   */
  startConnection(userId: string): boolean {
    const quota = this.getOrCreateQuota(userId);
    const config = RATE_LIMIT_CONFIGS[quota.tier];
    
    if (quota.activeConnections >= config.concurrentRequests) {
      return false;
    }
    
    quota.activeConnections++;
    return true;
  }
  
  /**
   * End active connection
   */
  endConnection(userId: string): void {
    const quota = this.quotas.get(userId);
    if (quota && quota.activeConnections > 0) {
      quota.activeConnections--;
    }
  }
  
  /**
   * Get rate limit status for headers
   */
  getRateLimitStatus(userId: string, window: 'minute' | 'hour' | 'day' = 'minute'): RateLimitStatus {
    const quota = this.getOrCreateQuota(userId);
    const config = RATE_LIMIT_CONFIGS[quota.tier];
    
    let limit: number;
    let current: number;
    let resetAt: Date;
    
    switch (window) {
      case 'hour':
        limit = config.requestsPerHour;
        current = quota.requestsInHour;
        resetAt = quota.hourResetAt;
        break;
      case 'day':
        limit = config.requestsPerDay;
        current = quota.requestsInDay;
        resetAt = quota.dayResetAt;
        break;
      default:
        limit = config.requestsPerMinute;
        current = quota.requestsInMinute;
        resetAt = quota.minuteResetAt;
    }
    
    const remaining = Math.max(0, limit - current);
    const retryAfter = current >= limit ? Math.ceil((resetAt.getTime() - Date.now()) / 1000) : undefined;
    
    return {
      limit,
      remaining,
      reset: Math.floor(resetAt.getTime() / 1000),
      retryAfter,
    };
  }
  
  /**
   * Block user
   */
  blockUser(userId: string, reason: string): void {
    const quota = this.getOrCreateQuota(userId);
    quota.blocked = true;
    quota.blockReason = reason;
    
    logger.warn('Blocked user ' + userId + ': ' + reason);
  }
  
  /**
   * Unblock user
   */
  unblockUser(userId: string): void {
    const quota = this.quotas.get(userId);
    if (quota) {
      quota.blocked = false;
      quota.blockReason = undefined;
    }
  }
  
  /**
   * Update user tier
   */
  updateUserTier(userId: string, tier: RateLimitTier): void {
    this.tiers.set(userId, tier);
    const quota = this.getOrCreateQuota(userId);
    quota.tier = tier;
    
    logger.info('Updated tier for ' + userId + ' to ' + tier);
  }
  
  /**
   * Reset quotas if windows have passed
   */
  private resetQuotasIfNeeded(quota: UserQuota, now: Date): void {
    if (now >= quota.minuteResetAt) {
      quota.requestsInMinute = 0;
      quota.minuteResetAt = new Date(now.getTime() + 60000);
    }
    
    if (now >= quota.hourResetAt) {
      quota.requestsInHour = 0;
      quota.hourResetAt = new Date(now.getTime() + 3600000);
    }
    
    if (now >= quota.dayResetAt) {
      quota.requestsInDay = 0;
      quota.dayResetAt = new Date(now.getTime() + 86400000);
    }
  }
  
  /**
   * Get or create quota
   */
  private getOrCreateQuota(userId: string): UserQuota {
    if (!this.quotas.has(userId)) {
      const tier = this.tiers.get(userId) || RateLimitTier.FREE;
      this.quotas.set(userId, this.createQuota(userId, tier));
    }
    
    return this.quotas.get(userId)!;
  }
  
  /**
   * Get user quota
   */
  getQuota(userId: string): UserQuota | undefined {
    return this.quotas.get(userId);
  }
  
  /**
   * Get all quotas (admin only)
   */
  getAllQuotas(): UserQuota[] {
    return Array.from(this.quotas.values());
  }
  
  /**
   * Start cleanup of stale quotas
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 24 * 60 * 60 * 1000;
      
      const toDelete: string[] = [];
      this.quotas.forEach((quota, userId) => {
        if (now - quota.lastRequest.getTime() > staleThreshold) {
          toDelete.push(userId);
        }
      });
      
      toDelete.forEach(userId => {
        this.quotas.delete(userId);
        logger.debug('Cleaned stale quota for ' + userId);
      });
    }, 60 * 60 * 1000);
  }
  
  /**
   * Cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.quotas.clear();
    this.tiers.clear();
    logger.info('User rate limiter destroyed');
  }
}
