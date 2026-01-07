/**
 * Rate Limiting Middleware for Express
 * Integrates per-user rate limiting with authentication
 */

import { Logger } from './logger.js';
import { UserRateLimiter, RateLimitTier } from './user-rate-limiter.js';

const logger = new Logger({ context: 'rate-limit-middleware' });

/**
 * Create rate limiting middleware
 */
export function createRateLimitMiddleware(rateLimiter: UserRateLimiter) {
  return (req: any, res: any, next: any) => {
    try {
      const userId = req.authContext?.user?.id || req.query.api_key || 'anonymous';
      
      const result = rateLimiter.canMakeRequest(userId);
      
      if (!result.allowed) {
        const status = rateLimiter.getRateLimitStatus(userId, 'minute');
        
        res.setHeader('RateLimit-Limit', status.limit);
        res.setHeader('RateLimit-Remaining', status.remaining);
        res.setHeader('RateLimit-Reset', status.reset);
        
        if (status.retryAfter) {
          res.setHeader('Retry-After', status.retryAfter);
        }
        
        logger.warn('Rate limit exceeded for user: ' + userId + ' - ' + result.reason);
        
        return res.status(429).json({
          error: 'Too Many Requests',
          message: result.reason,
          retryAfter: status.retryAfter,
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }
      
      rateLimiter.recordRequest(userId);
      
      const status = rateLimiter.getRateLimitStatus(userId, 'minute');
      res.setHeader('RateLimit-Limit', status.limit);
      res.setHeader('RateLimit-Remaining', status.remaining);
      res.setHeader('RateLimit-Reset', status.reset);
      
      req.userId = userId;
      req.rateLimitStatus = status;
      
      next();
    } catch (error) {
      logger.error('Rate limiting error: ' + error);
      next();
    }
  };
}

/**
 * Create connection limit middleware
 */
export function createConnectionLimitMiddleware(rateLimiter: UserRateLimiter) {
  return (req: any, res: any, next: any) => {
    const userId = req.authContext?.user?.id || req.query.api_key || 'anonymous';
    
    const allowed = rateLimiter.startConnection(userId);
    
    if (!allowed) {
      logger.warn('Connection limit exceeded for user: ' + userId);
      
      return res.status(429).json({
        error: 'Too Many Concurrent Requests',
        code: 'CONNECTION_LIMIT_EXCEEDED',
      });
    }
    
    res.on('finish', () => {
      rateLimiter.endConnection(userId);
    });
    
    res.on('close', () => {
      rateLimiter.endConnection(userId);
    });
    
    next();
  };
}

/**
 * Create per-endpoint rate limiting middleware
 */
export function createEndpointRateLimitMiddleware(
  rateLimiter: UserRateLimiter,
  requestsPerMinute: number
) {
  const endpointLimits = new Map<string, { count: number; resetAt: Date }>();
  
  return (req: any, res: any, next: any) => {
    const userId = req.authContext?.user?.id || 'anonymous';
    const endpoint = req.path;
    const key = userId + ':' + endpoint;
    
    const now = new Date();
    let limit = endpointLimits.get(key);
    
    if (!limit || now >= limit.resetAt) {
      limit = { count: 0, resetAt: new Date(now.getTime() + 60000) };
      endpointLimits.set(key, limit);
    }
    
    if (limit.count >= requestsPerMinute) {
      logger.warn('Endpoint rate limit exceeded for ' + key);
      
      return res.status(429).json({
        error: 'Endpoint Rate Limit Exceeded',
        endpoint,
        code: 'ENDPOINT_RATE_LIMIT_EXCEEDED',
      });
    }
    
    limit.count++;
    next();
  };
}

/**
 * Rate Limit Monitoring Service
 */
export class RateLimitMonitor {
  private rateLimiter: UserRateLimiter;
  private alertThreshold: number = 0.8;
  private alerts: Map<string, { count: number; since: Date }> = new Map();
  
  constructor(rateLimiter: UserRateLimiter, alertThreshold: number = 0.8) {
    this.rateLimiter = rateLimiter;
    this.alertThreshold = alertThreshold;
  }
  
  /**
   * Check for users approaching limits
   */
  getApproachingLimitAlerts(): Array<{
    userId: string;
    tier: RateLimitTier;
    usagePercentage: number;
    window: string;
  }> {
    const alerts: any[] = [];
    
    this.rateLimiter.getAllQuotas().forEach(quota => {
      const configs = {
        minute: { used: quota.requestsInMinute, total: 0 },
        hour: { used: quota.requestsInHour, total: 0 },
        day: { used: quota.requestsInDay, total: 0 },
      };
      
      const tierConfig = (require('./user-rate-limiter.js') as any).RATE_LIMIT_CONFIGS[quota.tier];
      configs.minute.total = tierConfig.requestsPerMinute;
      configs.hour.total = tierConfig.requestsPerHour;
      configs.day.total = tierConfig.requestsPerDay;
      
      Object.entries(configs).forEach(([window, { used, total }]) => {
        const percentage = total > 0 ? used / total : 0;
        
        if (percentage >= this.alertThreshold) {
          alerts.push({
            userId: quota.userId,
            tier: quota.tier,
            usagePercentage: percentage,
            window,
          });
        }
      });
    });
    
    return alerts;
  }
  
  /**
   * Get rate limit usage report
   */
  getUsageReport(): Record<string, any> {
    const quotas = this.rateLimiter.getAllQuotas();
    const byTier: Record<string, { count: number; avgUsage: number }> = {};
    
    quotas.forEach(quota => {
      if (!byTier[quota.tier]) {
        byTier[quota.tier] = { count: 0, avgUsage: 0 };
      }
      
      byTier[quota.tier].count++;
      
      const tierConfig = (require('./user-rate-limiter.js') as any).RATE_LIMIT_CONFIGS[quota.tier];
      const usage = quota.requestsInMinute / tierConfig.requestsPerMinute;
      byTier[quota.tier].avgUsage += usage;
    });
    
    Object.keys(byTier).forEach(tier => {
      byTier[tier].avgUsage /= byTier[tier].count;
    });
    
    return {
      totalUsers: quotas.length,
      byTier,
      blockedUsers: quotas.filter(q => q.blocked).length,
      timestamp: new Date(),
    };
  }
}
