import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createApiRouter } from '../src/api.js';
import { KnowledgeDatabase } from '../src/database.js';
import { cleanupTestTempDir, createTestTempDir } from '../src/test-utils/temp-paths.js';

describe('Federation API Endpoints', () => {
  let tempDir: string;
  let sourceDir: string;
  let db: KnowledgeDatabase;
  let app: express.Application;

  beforeEach(() => {
    tempDir = createTestTempDir('federation-api');
    sourceDir = join(tempDir, 'source-docs');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, 'guide.md'), '# OAuth Guide\n\nImplement OAuth with PKCE.');
    writeFileSync(join(sourceDir, 'notes.txt'), 'Deployment checklist and rollback notes.');

    db = new KnowledgeDatabase(join(tempDir, 'test.db'));
    app = express();
    app.use(express.json());
    app.use('/api', createApiRouter(db));
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // already closed
    }
    cleanupTestTempDir(tempDir);
  });

  it('registers and lists federated sources', async () => {
    const createResponse = await request(app).post('/api/federation/sources').send({
      name: 'Local Docs',
      rootPath: sourceDir,
      includePatterns: ['**/*.md', '**/*.txt'],
      excludePatterns: ['**/.git/**'],
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.success).toBe(true);
    expect(createResponse.body.data.name).toBe('Local Docs');
    expect(createResponse.body.data.status).toBe('active');

    const listResponse = await request(app).get('/api/federation/sources').expect(200);
    expect(listResponse.body.success).toBe(true);
    expect(Array.isArray(listResponse.body.data)).toBe(true);
    expect(listResponse.body.data.length).toBe(1);
    expect(listResponse.body.data[0].rootPath).toBe(sourceDir);
  });

  it('scans a source and returns search results', async () => {
    const createResponse = await request(app).post('/api/federation/sources').send({
      name: 'Engineering Docs',
      rootPath: sourceDir,
      includePatterns: ['**/*.md', '**/*.txt'],
    });
    const sourceId = createResponse.body.data.id as string;

    const scanResponse = await request(app)
      .post(`/api/federation/sources/${sourceId}/scan`)
      .expect(202);
    expect(scanResponse.body.success).toBe(true);
    expect(scanResponse.body.data.status).toBe('completed');
    expect(scanResponse.body.data.indexedCount).toBeGreaterThan(0);

    const scansResponse = await request(app)
      .get(`/api/federation/sources/${sourceId}/scans`)
      .expect(200);
    expect(scansResponse.body.success).toBe(true);
    expect(scansResponse.body.data.length).toBeGreaterThan(0);
    expect(scansResponse.body.data[0].sourceId).toBe(sourceId);

    const searchResponse = await request(app)
      .get('/api/federation/search')
      .query({ q: 'OAuth', sourceId })
      .expect(200);

    expect(searchResponse.body.success).toBe(true);
    expect(Array.isArray(searchResponse.body.data)).toBe(true);
    expect(searchResponse.body.data.length).toBeGreaterThan(0);
    expect(searchResponse.body.data.some((entry: any) => entry.path.includes('guide.md'))).toBe(true);
  });

  it('blocks scans for disabled sources', async () => {
    const createResponse = await request(app).post('/api/federation/sources').send({
      name: 'Disabled Docs',
      rootPath: sourceDir,
    });
    const sourceId = createResponse.body.data.id as string;

    await request(app)
      .patch(`/api/federation/sources/${sourceId}`)
      .send({ status: 'disabled' })
      .expect(200);

    const scanResponse = await request(app)
      .post(`/api/federation/sources/${sourceId}/scan`)
      .expect(400);

    expect(scanResponse.body.code).toBe('SOURCE_DISABLED');
  });

  it('requires search query for federated search', async () => {
    const response = await request(app).get('/api/federation/search').expect(400);
    expect(response.body.code).toBe('MISSING_QUERY');
  });
});
