import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { join } from 'path';
import { createApiRouter } from '../src/api.js';
import { KnowledgeDatabase } from '../src/database.js';
import { AtomicUnit } from '../src/types.js';
import { createTestTempDir, cleanupTestTempDir } from '../src/test-utils/temp-paths.js';

describe('Search Endpoint Parity Smoke', () => {
  let tempDir: string;
  let dbPath: string;
  let db: KnowledgeDatabase;
  let app: express.Application;

  beforeEach(() => {
    tempDir = createTestTempDir('search-parity');
    dbPath = join(tempDir, 'test.db');
    db = new KnowledgeDatabase(dbPath);

    app = express();
    app.use(express.json());
    app.use('/api', createApiRouter(db));

    const timestamp = new Date();
    const units: AtomicUnit[] = [
      {
        id: 'parity-1',
        type: 'insight',
        title: 'OAuth 2.0 Implementation Guide',
        content: 'Detailed guide on OAuth and token exchange.',
        context: 'Auth',
        category: 'programming',
        tags: ['oauth', 'authentication'],
        keywords: ['oauth', 'auth'],
        relatedUnits: [],
        timestamp,
      },
      {
        id: 'parity-2',
        type: 'code',
        title: 'React Hooks Example',
        content: 'useState and useEffect examples',
        context: 'Frontend',
        category: 'programming',
        tags: ['react', 'hooks'],
        keywords: ['react', 'hooks'],
        relatedUnits: [],
        timestamp,
      },
      {
        id: 'parity-3',
        type: 'question',
        title: 'TypeScript Generics Question',
        content: 'How do TypeScript generics work?',
        context: 'Type system',
        category: 'programming',
        tags: ['typescript', 'generics'],
        keywords: ['typescript'],
        relatedUnits: [],
        timestamp,
      },
      {
        id: 'parity-4',
        type: 'reference',
        title: 'Design Patterns Overview',
        content: 'Common design patterns explained',
        context: 'Architecture',
        category: 'design',
        tags: ['patterns', 'design'],
        keywords: ['design', 'patterns'],
        relatedUnits: [],
        timestamp,
      },
      {
        id: 'parity-5',
        type: 'decision',
        title: 'Database Choice Decision',
        content: 'Why we chose PostgreSQL for this service',
        context: 'Data layer',
        category: 'programming',
        tags: ['database', 'postgres'],
        keywords: ['database', 'postgres'],
        relatedUnits: [],
        timestamp,
      },
    ];

    units.forEach((unit) => db.insertAtomicUnit(unit));
  });

  afterEach(() => {
    db.close();
    cleanupTestTempDir(tempDir);
  });

  async function runSearch(endpoint: '/api/search' | '/api/search/fts', query: string, page = 1, pageSize = 5) {
    return request(app)
      .get(`${endpoint}?q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`)
      .expect(200);
  }

  it('returns identical retrieval and ranking for a representative query corpus', async () => {
    const queries = ['react', 'TypeScript', 'design', '', 'nonexistent-term-12345'];

    for (const query of queries) {
      const searchResponse = await runSearch('/api/search', query, 1, 5);
      const ftsResponse = await runSearch('/api/search/fts', query, 1, 5);

      const searchIds = searchResponse.body.data.map((u: { id: string }) => u.id);
      const ftsIds = ftsResponse.body.data.map((u: { id: string }) => u.id);

      expect(ftsIds).toEqual(searchIds);
      expect(ftsResponse.body.pagination).toEqual(searchResponse.body.pagination);
      expect(ftsResponse.body.query.normalized).toBe(searchResponse.body.query.normalized);
    }
  });

  it('returns identical retrieval and ranking across pages for the same query', async () => {
    const page1Search = await runSearch('/api/search', '', 1, 2);
    const page1Fts = await runSearch('/api/search/fts', '', 1, 2);
    const page2Search = await runSearch('/api/search', '', 2, 2);
    const page2Fts = await runSearch('/api/search/fts', '', 2, 2);

    expect(page1Fts.body.data.map((u: { id: string }) => u.id)).toEqual(
      page1Search.body.data.map((u: { id: string }) => u.id)
    );
    expect(page2Fts.body.data.map((u: { id: string }) => u.id)).toEqual(
      page2Search.body.data.map((u: { id: string }) => u.id)
    );
  });

  it('enforces equivalent query and bounds validation semantics', async () => {
    const missingQuerySearch = await request(app).get('/api/search').expect(400);
    const missingQueryFts = await request(app).get('/api/search/fts').expect(400);
    expect(Boolean(missingQuerySearch.body.error)).toBe(true);
    expect(Boolean(missingQueryFts.body.error)).toBe(true);

    const invalidBoundsSearch = await request(app).get('/api/search?q=test&pageSize=101').expect(400);
    const invalidBoundsFts = await request(app).get('/api/search/fts?q=test&pageSize=101').expect(400);
    expect(Boolean(invalidBoundsSearch.body.error)).toBe(true);
    expect(Boolean(invalidBoundsFts.body.error)).toBe(true);
  });
});
