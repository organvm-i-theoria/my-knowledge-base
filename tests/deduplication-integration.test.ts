import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDeduplicationRoutes } from '../src/deduplication-api.js';

describe('Deduplication API integration', () => {
  it('detects and merges duplicates', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/dedup', createDeduplicationRoutes());

    const units = [
      { id: 'u1', title: 'Alpha', content: 'Content', keywords: ['a'], category: 'programming' },
      { id: 'u2', title: 'Alpha', content: 'Content', keywords: ['a'], category: 'programming' },
    ];

    const detect = await request(app)
      .post('/api/dedup/detect')
      .send({ units });

    expect(detect.status).toBe(200);
    expect(detect.body.data.total).toBeGreaterThan(0);

    const merge = await request(app)
      .post('/api/dedup/merge')
      .send({ unit1: units[0], unit2: units[1] });

    expect(merge.status).toBe(200);
    expect(merge.body.data.survivingId).toBe('u1');
  });
});
