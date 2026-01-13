import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createGraphRoutes, GraphManager } from '../src/graph-api.js';

describe('Graph API integration', () => {
  it('returns nodes and paths', async () => {
    const manager = new GraphManager();
    manager.buildFromUnits(
      [
        { id: 'a', title: 'Node A', type: 'insight', category: 'programming', keywords: [], timestamp: new Date() },
        { id: 'b', title: 'Node B', type: 'insight', category: 'programming', keywords: [], timestamp: new Date() },
      ],
      [{ sourceId: 'a', targetId: 'b', type: 'related', strength: 0.8 }]
    );

    const app = express();
    app.use('/api/graph', createGraphRoutes(manager));

    const nodes = await request(app).get('/api/graph/nodes');
    expect(nodes.status).toBe(200);
    expect(nodes.body.total).toBe(2);

    const path = await request(app).get('/api/graph/path/a/b');
    expect(path.status).toBe(200);
    expect(path.body.data.found).toBe(true);
    expect(path.body.data.path).toEqual(['a', 'b']);
  });
});
