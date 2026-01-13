import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { AuthService, UserRole, createAuthMiddleware, requirePermission } from '../src/auth.js';

describe('E2E auth -> authorization flow', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('enforces permissions and accepts valid JWTs', async () => {
    const app = express();
    const authService = new AuthService('test-secret'); // allow-secret

    app.use(createAuthMiddleware(authService));
    app.get('/secure', requirePermission('units:read'), (req, res) => {
      res.json({ ok: true });
    });

    const unauthResponse = await request(app).get('/secure');
    expect(unauthResponse.status).toBe(403);

    const user = authService.createUser('viewer@example.com', [UserRole.VIEWER]);
    const token = authService.createToken(user.id).accessToken; // allow-secret

    const authResponse = await request(app)
      .get('/secure')
      .set('Authorization', `Bearer ${token}`);

    expect(authResponse.status).toBe(200);
    expect(authResponse.body.ok).toBe(true);
  });
});
