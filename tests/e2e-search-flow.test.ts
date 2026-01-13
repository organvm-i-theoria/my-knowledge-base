import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { createApiRouter } from '../src/api.js';
import { KnowledgeDatabase } from '../src/database.js';
import { AtomicUnit } from '../src/types.js';

describe('E2E search -> retrieve -> display', () => {
  const tempRoot = join(process.cwd(), '.test-tmp', 'e2e-search');
  const dbDir = join(tempRoot, 'db');
  const dbPath = join(dbDir, 'knowledge.db');

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('searches and retrieves units through the API', async () => {
    mkdirSync(dbDir, { recursive: true });

    const unit: AtomicUnit = {
      id: 'unit-e2e-1',
      type: 'message',
      timestamp: new Date(),
      title: 'Graph Patterns',
      content: 'Graph queries and edges improve retrieval.',
      context: 'Search module note.',
      tags: ['graph', 'search'],
      category: 'notes',
      relatedUnits: [],
      keywords: ['graph', 'edges'],
    };

    const db = new KnowledgeDatabase(dbPath);
    db.insertAtomicUnit(unit);

    const app = express();
    app.use('/api', createApiRouter(db));

    const searchResponse = await request(app)
      .get('/api/search')
      .query({ q: 'graph' });

    expect(searchResponse.status).toBe(200);
    expect(searchResponse.body.data.length).toBeGreaterThan(0);

    const foundId = searchResponse.body.data[0].id as string;
    const unitResponse = await request(app).get(`/api/units/${foundId}`);

    expect(unitResponse.status).toBe(200);
    expect(unitResponse.body.data.id).toBe(foundId);

    const display = `${unitResponse.body.data.title}: ${unitResponse.body.data.content}`;
    expect(display).toContain('Graph');

    db.close();
  });
});
