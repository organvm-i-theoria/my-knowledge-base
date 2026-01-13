import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { AuthService, UserRole, createAuthMiddleware, requirePermission } from '../src/auth.js';

function setupApp() {
  const app = express();
  const authService = new AuthService('test-secret'); // allow-secret

  app.use(createAuthMiddleware(authService));
  app.get('/private', requirePermission('units:read'), (req, res) => {
    res.json({ ok: true });
  });

  return { app, authService };
}

describe('Auth integration', () => {
  it('rejects unauthenticated requests', async () => {
    const { app } = setupApp();

    const response = await request(app).get('/private');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');
  });

  it('allows valid JWT credentials', async () => {
    const { app, authService } = setupApp();
    const user = authService.createUser('viewer@example.com', [UserRole.VIEWER]);
    const token = authService.createToken(user.id).accessToken; // allow-secret

    const response = await request(app)
      .get('/private')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});
