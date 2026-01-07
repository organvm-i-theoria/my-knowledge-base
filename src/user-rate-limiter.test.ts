import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserRateLimiter, RateLimitTier, RATE_LIMIT_CONFIGS } from './user-rate-limiter.js';

describe('User Rate Limiter', () => {
  let limiter: UserRateLimiter;

  beforeEach(() => {
    limiter = new UserRateLimiter();
  });

  afterEach(() => {
    limiter.destroy();
  });

  describe('User Registration', () => {
    it('should register user with free tier', () => {
      limiter.registerUser('user1', RateLimitTier.FREE);
      
      const quota = limiter.getQuota('user1');
      expect(quota).toBeDefined();
      expect(quota?.tier).toBe(RateLimitTier.FREE);
    });

    it('should register user with different tiers', () => {
      limiter.registerUser('user1', RateLimitTier.FREE);
      limiter.registerUser('user2', RateLimitTier.PRO);
      limiter.registerUser('user3', RateLimitTier.ENTERPRISE);
      
      expect(limiter.getQuota('user1')?.tier).toBe(RateLimitTier.FREE);
      expect(limiter.getQuota('user2')?.tier).toBe(RateLimitTier.PRO);
      expect(limiter.getQuota('user3')?.tier).toBe(RateLimitTier.ENTERPRISE);
    });

    it('should default to free tier for unregistered users', () => {
      const result = limiter.canMakeRequest('unknown_user');
      
      expect(result.allowed).toBe(true);
      const quota = limiter.getQuota('unknown_user');
      expect(quota?.tier).toBe(RateLimitTier.FREE);
    });
  });

  describe('Request Allowance', () => {
    beforeEach(() => {
      limiter.registerUser('free_user', RateLimitTier.FREE);
      limiter.registerUser('pro_user', RateLimitTier.PRO);
    });

    it('should allow request within limits', () => {
      const result = limiter.canMakeRequest('free_user');
      
      expect(result.allowed).toBe(true);
    });

    it('should enforce per-minute limits', () => {
      const config = RATE_LIMIT_CONFIGS[RateLimitTier.FREE];
      
      for (let i = 0; i < config.requestsPerMinute; i++) {
        limiter.recordRequest('free_user');
      }
      
      const result = limiter.canMakeRequest('free_user');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Rate limit exceeded');
    });

    it('should allow pro tier higher limits', () => {
      const freeConfig = RATE_LIMIT_CONFIGS[RateLimitTier.FREE];
      const proConfig = RATE_LIMIT_CONFIGS[RateLimitTier.PRO];
      
      expect(proConfig.requestsPerMinute).toBeGreaterThan(freeConfig.requestsPerMinute);
    });

    it('should track requests across different windows', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordRequest('free_user');
      }
      
      const quota = limiter.getQuota('free_user');
      
      expect(quota?.requestsInMinute).toBe(5);
      expect(quota?.requestsInHour).toBe(5);
      expect(quota?.requestsInDay).toBe(5);
    });
  });

  describe('Rate Limit Status', () => {
    beforeEach(() => {
      limiter.registerUser('user1', RateLimitTier.FREE);
    });

    it('should provide minute window status', () => {
      limiter.recordRequest('user1');
      const status = limiter.getRateLimitStatus('user1', 'minute');
      
      const config = RATE_LIMIT_CONFIGS[RateLimitTier.FREE];
      expect(status.limit).toBe(config.requestsPerMinute);
      expect(status.remaining).toBe(config.requestsPerMinute - 1);
      expect(status.reset).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should provide hour window status', () => {
      const status = limiter.getRateLimitStatus('user1', 'hour');
      
      const config = RATE_LIMIT_CONFIGS[RateLimitTier.FREE];
      expect(status.limit).toBe(config.requestsPerHour);
      expect(status.remaining).toBe(config.requestsPerHour);
    });

    it('should provide day window status', () => {
      const status = limiter.getRateLimitStatus('user1', 'day');
      
      const config = RATE_LIMIT_CONFIGS[RateLimitTier.FREE];
      expect(status.limit).toBe(config.requestsPerDay);
      expect(status.remaining).toBe(config.requestsPerDay);
    });

    it('should calculate retry-after when limit exceeded', () => {
      const config = RATE_LIMIT_CONFIGS[RateLimitTier.FREE];
      
      for (let i = 0; i < config.requestsPerMinute; i++) {
        limiter.recordRequest('user1');
      }
      
      const status = limiter.getRateLimitStatus('user1', 'minute');
      
      expect(status.remaining).toBe(0);
      expect(status.retryAfter).toBeDefined();
      expect(status.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('Concurrent Connections', () => {
    beforeEach(() => {
      limiter.registerUser('user1', RateLimitTier.FREE);
      limiter.registerUser('user2', RateLimitTier.PRO);
    });

    it('should track concurrent connections', () => {
      const start1 = limiter.startConnection('user1');
      expect(start1).toBe(true);
      
      const quota = limiter.getQuota('user1');
      expect(quota?.activeConnections).toBe(1);
    });

    it('should enforce concurrent connection limits', () => {
      const config = RATE_LIMIT_CONFIGS[RateLimitTier.FREE];
      
      for (let i = 0; i < config.concurrentRequests; i++) {
        const result = limiter.startConnection('user1');
        expect(result).toBe(true);
      }
      
      const result = limiter.startConnection('user1');
      expect(result).toBe(false);
    });

    it('should decrease connections on end', () => {
      limiter.startConnection('user1');
      limiter.startConnection('user1');
      
      let quota = limiter.getQuota('user1');
      expect(quota?.activeConnections).toBe(2);
      
      limiter.endConnection('user1');
      quota = limiter.getQuota('user1');
      expect(quota?.activeConnections).toBe(1);
    });

    it('should allow pro tier more concurrent connections', () => {
      const freeConfig = RATE_LIMIT_CONFIGS[RateLimitTier.FREE];
      const proConfig = RATE_LIMIT_CONFIGS[RateLimitTier.PRO];
      
      expect(proConfig.concurrentRequests).toBeGreaterThan(freeConfig.concurrentRequests);
    });
  });

  describe('User Blocking', () => {
    beforeEach(() => {
      limiter.registerUser('user1');
    });

    it('should block user with reason', () => {
      limiter.blockUser('user1', 'Suspicious activity');
      
      const result = limiter.canMakeRequest('user1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Suspicious activity');
    });

    it('should unblock user', () => {
      limiter.blockUser('user1', 'Test');
      limiter.unblockUser('user1');
      
      const result = limiter.canMakeRequest('user1');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Tier Updates', () => {
    beforeEach(() => {
      limiter.registerUser('user1', RateLimitTier.FREE);
    });

    it('should upgrade user tier', () => {
      limiter.updateUserTier('user1', RateLimitTier.PRO);
      
      const quota = limiter.getQuota('user1');
      expect(quota?.tier).toBe(RateLimitTier.PRO);
    });

    it('should apply new limits after upgrade', () => {
      limiter.updateUserTier('user1', RateLimitTier.PRO);
      
      const proConfig = RATE_LIMIT_CONFIGS[RateLimitTier.PRO];
      const result = limiter.getRateLimitStatus('user1', 'minute');
      
      expect(result.limit).toBe(proConfig.requestsPerMinute);
    });
  });

  describe('Multiple Users', () => {
    it('should track separate quotas for different users', () => {
      limiter.registerUser('user1');
      limiter.registerUser('user2');
      
      limiter.recordRequest('user1');
      limiter.recordRequest('user1');
      limiter.recordRequest('user2');
      
      const quota1 = limiter.getQuota('user1');
      const quota2 = limiter.getQuota('user2');
      
      expect(quota1?.requestsInMinute).toBe(2);
      expect(quota2?.requestsInMinute).toBe(1);
    });

    it('should return all quotas', () => {
      limiter.registerUser('user1');
      limiter.registerUser('user2');
      limiter.registerUser('user3');
      
      const quotas = limiter.getAllQuotas();
      expect(quotas.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Rate Limit Tiers', () => {
    it('should have all required tiers', () => {
      expect(RATE_LIMIT_CONFIGS[RateLimitTier.FREE]).toBeDefined();
      expect(RATE_LIMIT_CONFIGS[RateLimitTier.BASIC]).toBeDefined();
      expect(RATE_LIMIT_CONFIGS[RateLimitTier.PRO]).toBeDefined();
      expect(RATE_LIMIT_CONFIGS[RateLimitTier.ENTERPRISE]).toBeDefined();
    });

    it('should have increasing limits per tier', () => {
      const free = RATE_LIMIT_CONFIGS[RateLimitTier.FREE];
      const basic = RATE_LIMIT_CONFIGS[RateLimitTier.BASIC];
      const pro = RATE_LIMIT_CONFIGS[RateLimitTier.PRO];
      const enterprise = RATE_LIMIT_CONFIGS[RateLimitTier.ENTERPRISE];
      
      expect(basic.requestsPerMinute).toBeGreaterThan(free.requestsPerMinute);
      expect(pro.requestsPerMinute).toBeGreaterThan(basic.requestsPerMinute);
      expect(enterprise.requestsPerMinute).toBeGreaterThan(pro.requestsPerMinute);
    });
  });
});
