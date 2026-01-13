import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { WebSocketManager, RealtimeEventType } from '../src/websocket-manager.js';
import { createWebSocketRoutes } from '../src/websocket-api.js';

describe('WebSocket API integration', () => {
  it('exposes status, clients, and events', async () => {
    const wsManager = new WebSocketManager(1000, 10);
    wsManager.registerClient('client-1', 'user-1', ['*']);
    wsManager.broadcastEvent({
      type: RealtimeEventType.UNIT_CREATED,
      timestamp: new Date(),
      data: { id: 'unit-1' },
    });

    const app = express();
    app.use('/api/ws', createWebSocketRoutes(wsManager));

    const status = await request(app).get('/api/ws/status');
    expect(status.status).toBe(200);
    expect(status.body.success).toBe(true);
    expect(status.body.data.stats.totalConnections).toBe(1);

    const clients = await request(app).get('/api/ws/clients');
    expect(clients.status).toBe(200);
    expect(clients.body.total).toBe(1);
    expect(clients.body.data[0].id).toBe('client-1');

    const events = await request(app).get('/api/ws/events?limit=10');
    expect(events.status).toBe(200);
    expect(events.body.total).toBeGreaterThan(0);
  });
});
