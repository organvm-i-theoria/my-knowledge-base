import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRateLimitMiddleware } from '../src/rate-limit-middleware.js';

function setupApp(rateLimiter: any) {
  const app = express();
  app.use(createRateLimitMiddleware(rateLimiter));
  app.get('/ping', (req, res) => res.json({ ok: true }));
  return app;
}

describe('Rate limit middleware integration', () => {
  it('blocks requests when over the limit', async () => {
    const rateLimiter = {
      canMakeRequest: vi.fn().mockReturnValue({ allowed: false, reason: 'limit reached' }),
      recordRequest: vi.fn(),
      getRateLimitStatus: vi.fn().mockReturnValue({
        limit: 1,
        remaining: 0,
        reset: 100,
        retryAfter: 5,
      }),
    };

    const app = setupApp(rateLimiter);
    const response = await request(app).get('/ping');

    expect(response.status).toBe(429);
    expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(rateLimiter.recordRequest).not.toHaveBeenCalled();
  });

  it('allows requests within the limit', async () => {
    const rateLimiter = {
      canMakeRequest: vi.fn().mockReturnValue({ allowed: true }),
      recordRequest: vi.fn(),
      getRateLimitStatus: vi.fn().mockReturnValue({
        limit: 10,
        remaining: 9,
        reset: 100,
      }),
    };

    const app = setupApp(rateLimiter);
    const response = await request(app).get('/ping');

    expect(response.status).toBe(200);
    expect(rateLimiter.recordRequest).toHaveBeenCalled();
  });
});
