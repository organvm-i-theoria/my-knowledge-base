import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketManager, WebSocketClient, RealtimeEventType } from './websocket-manager.js';

describe('WebSocket Manager', () => {
  let manager: WebSocketManager;

  beforeEach(() => {
    manager = new WebSocketManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('Client Management', () => {
    it('should register a client', () => {
      const client = manager.registerClient('client1', 'user1');
      
      expect(client.id).toBe('client1');
      expect(client.userId).toBe('user1');
      expect(manager.getClients()).toHaveLength(1);
    });

    it('should unregister a client', () => {
      manager.registerClient('client1');
      expect(manager.getClients()).toHaveLength(1);
      
      const removed = manager.unregisterClient('client1');
      
      expect(removed).toBe(true);
      expect(manager.getClients()).toHaveLength(0);
    });

    it('should retrieve client by ID', () => {
      manager.registerClient('client1', 'user1');
      const client = manager.getClient('client1');
      
      expect(client).toBeDefined();
      expect(client?.userId).toBe('user1');
    });

    it('should handle non-existent client removal', () => {
      const removed = manager.unregisterClient('nonexistent');
      expect(removed).toBe(false);
    });

    it('should register clients with subscriptions', () => {
      const client = manager.registerClient('client1', 'user1', ['units', 'tags']);
      
      expect(client.subscriptions.has('units')).toBe(true);
      expect(client.subscriptions.has('tags')).toBe(true);
    });
  });

  describe('Subscriptions', () => {
    beforeEach(() => {
      manager.registerClient('client1', 'user1');
      manager.registerClient('client2', 'user2');
      manager.registerClient('client3', 'user1');
    });

    it('should subscribe to channel', () => {
      const client = manager.getClient('client1');
      client?.subscribe('units');
      
      expect(client?.subscriptions.has('units')).toBe(true);
    });

    it('should unsubscribe from channel', () => {
      const client = manager.getClient('client1');
      client?.subscribe('units');
      client?.unsubscribe('units');
      
      expect(client?.subscriptions.has('units')).toBe(false);
    });

    it('should get subscribers for channel', () => {
      manager.getClient('client1')?.subscribe('units');
      manager.getClient('client2')?.subscribe('units');
      
      const subscribers = manager.getSubscribers('units');
      expect(subscribers).toHaveLength(2);
    });

    it('should handle wildcard subscriptions', () => {
      manager.getClient('client1')?.subscribe('*');
      
      const subscribers = manager.getSubscribers('any-channel');
      expect(subscribers.length).toBeGreaterThan(0);
    });
  });

  describe('Event Broadcasting', () => {
    it('should broadcast to all clients', () => {
      manager.registerClient('client1');
      manager.registerClient('client2');
      
      let eventCount = 0;
      manager.onEvent(RealtimeEventType.PING, () => {
        eventCount++;
      });
      
      manager.broadcastEvent({
        type: RealtimeEventType.PING,
        timestamp: new Date(),
        data: {},
      });
      
      expect(eventCount).toBeGreaterThan(0);
    });

    it('should broadcast to channel subscribers', () => {
      manager.registerClient('client1', 'user1', ['units']);
      manager.registerClient('client2', 'user2', ['tags']);
      
      let unitEventTriggered = false;
      manager.onEvent(RealtimeEventType.UNIT_CREATED, () => {
        unitEventTriggered = true;
      });
      
      manager.broadcastToChannel('units', {
        type: RealtimeEventType.UNIT_CREATED,
        timestamp: new Date(),
        data: { unitId: 'u1' },
      });
      
      expect(unitEventTriggered).toBe(true);
    });

    it('should send event to specific client', () => {
      manager.registerClient('client1');
      
      const sent = manager.sendToClient('client1', {
        type: RealtimeEventType.PING,
        timestamp: new Date(),
        data: {},
      });
      
      expect(sent).toBe(true);
    });

    it('should fail sending to non-existent client', () => {
      const sent = manager.sendToClient('nonexistent', {
        type: RealtimeEventType.PING,
        timestamp: new Date(),
        data: {},
      });
      
      expect(sent).toBe(false);
    });
  });

  describe('Event Handlers', () => {
    it('should register and call event handler', (done) => {
      let called = false;
      
      manager.onEvent(RealtimeEventType.PING, () => {
        called = true;
      });
      
      manager.broadcastEvent({
        type: RealtimeEventType.PING,
        timestamp: new Date(),
        data: {},
      });
      
      setTimeout(() => {
        expect(called).toBe(true);
        done();
      }, 10);
    });

    it('should unregister event handler', (done) => {
      let callCount = 0;
      
      const unsubscribe = manager.onEvent(RealtimeEventType.PING, () => {
        callCount++;
      });
      
      manager.broadcastEvent({
        type: RealtimeEventType.PING,
        timestamp: new Date(),
        data: {},
      });
      
      unsubscribe();
      
      manager.broadcastEvent({
        type: RealtimeEventType.PING,
        timestamp: new Date(),
        data: {},
      });
      
      setTimeout(() => {
        expect(callCount).toBe(1);
        done();
      }, 10);
    });

    it('should handle multiple handlers', (done) => {
      let count1 = 0;
      let count2 = 0;
      
      manager.onEvent(RealtimeEventType.PING, () => {
        count1++;
      });
      
      manager.onEvent(RealtimeEventType.PING, () => {
        count2++;
      });
      
      manager.broadcastEvent({
        type: RealtimeEventType.PING,
        timestamp: new Date(),
        data: {},
      });
      
      setTimeout(() => {
        expect(count1).toBeGreaterThan(0);
        expect(count2).toBeGreaterThan(0);
        done();
      }, 10);
    });
  });

  describe('Event Notifications', () => {
    it('should notify unit created', (done) => {
      let unitCreated = false;
      manager.getClient('client1') || manager.registerClient('client1');
      manager.getClient('client1')?.subscribe('units');
      
      manager.onEvent(RealtimeEventType.UNIT_CREATED, () => {
        unitCreated = true;
      });
      
      manager.notifyUnitCreated('u1', { title: 'Unit 1' });
      
      setTimeout(() => {
        expect(unitCreated).toBe(true);
        done();
      }, 10);
    });

    it('should notify unit updated', (done) => {
      let unitUpdated = false;
      manager.getClient('client1') || manager.registerClient('client1');
      manager.getClient('client1')?.subscribe('units');
      
      manager.onEvent(RealtimeEventType.UNIT_UPDATED, () => {
        unitUpdated = true;
      });
      
      manager.notifyUnitUpdated('u1', { title: 'Updated Unit' });
      
      setTimeout(() => {
        expect(unitUpdated).toBe(true);
        done();
      }, 10);
    });

    it('should notify unit deleted', (done) => {
      let unitDeleted = false;
      
      manager.onEvent(RealtimeEventType.UNIT_DELETED, () => {
        unitDeleted = true;
      });
      
      manager.notifyUnitDeleted('u1');
      
      setTimeout(() => {
        expect(unitDeleted).toBe(true);
        done();
      }, 10);
    });

    it('should notify tag added', (done) => {
      let tagAdded = false;
      
      manager.onEvent(RealtimeEventType.TAG_ADDED, () => {
        tagAdded = true;
      });
      
      manager.notifyTagAdded('u1', 'typescript');
      
      setTimeout(() => {
        expect(tagAdded).toBe(true);
        done();
      }, 10);
    });

    it('should notify graph updated', (done) => {
      let graphUpdated = false;
      
      manager.onEvent(RealtimeEventType.GRAPH_UPDATED, () => {
        graphUpdated = true;
      });
      
      manager.notifyGraphUpdated({ nodes: 100, edges: 150 });
      
      setTimeout(() => {
        expect(graphUpdated).toBe(true);
        done();
      }, 10);
    });
  });

  describe('Event Queue', () => {
    it('should store recent events', () => {
      manager.broadcastEvent({
        type: RealtimeEventType.PING,
        timestamp: new Date(),
        data: {},
      });
      
      const recent = manager.getRecentEvents(10);
      expect(recent.length).toBeGreaterThan(0);
    });

    it('should respect max queue size', () => {
      const smallManager = new WebSocketManager(30000, 5);
      
      for (let i = 0; i < 10; i++) {
        smallManager.broadcastEvent({
          type: RealtimeEventType.PING,
          timestamp: new Date(),
          data: { index: i },
        });
      }
      
      const recent = smallManager.getRecentEvents(100);
      expect(recent.length).toBeLessThanOrEqual(5);
      
      smallManager.destroy();
    });
  });

  describe('Client Activity', () => {
    it('should update last activity on event send', () => {
      manager.registerClient('client1');
      const client = manager.getClient('client1');
      const before = client!.lastActivity;
      
      setTimeout(() => {
        manager.sendToClient('client1', {
          type: RealtimeEventType.PING,
          timestamp: new Date(),
          data: {},
        });
        
        const after = client!.lastActivity;
        expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
      }, 10);
    });

    it('should calculate uptime', () => {
      const client = manager.registerClient('client1');
      
      setTimeout(() => {
        const uptime = client.getUptime();
        expect(uptime).toBeGreaterThanOrEqual(0);
      }, 10);
    });
  });

  describe('Statistics', () => {
    it('should report statistics', () => {
      manager.registerClient('client1');
      manager.registerClient('client2');
      
      const stats = manager.getStatistics();
      
      expect(stats.clientCount).toBe(2);
      expect(stats.eventQueueSize).toBeGreaterThan(0);
      expect(stats.uptime).toBeGreaterThan(0);
    });
  });
});
