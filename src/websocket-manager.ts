/**
 * WebSocket Manager for Real-Time Updates
 * Provides real-time event broadcasting for units, graph, and search
 */

import { Logger } from './logger.js';

const logger = new Logger({ context: 'websocket' });

/**
 * Real-time event types
 */
export enum RealtimeEventType {
  UNIT_CREATED = 'unit:created',
  UNIT_UPDATED = 'unit:updated',
  UNIT_DELETED = 'unit:deleted',
  TAG_ADDED = 'tag:added',
  TAG_REMOVED = 'tag:removed',
  SEARCH_RESULT = 'search:result',
  GRAPH_UPDATED = 'graph:updated',
  CONNECTION = 'connection',
  DISCONNECTION = 'disconnection',
  PING = 'ping',
  PONG = 'pong',
}

/**
 * Event message structure
 */
export interface RealtimeEvent {
  type: RealtimeEventType;
  timestamp: Date;
  userId?: string;
  data: any;
  metadata?: Record<string, any>;
}

/**
 * WebSocket client connection
 */
export class WebSocketClient {
  id: string;
  userId?: string;
  connectedAt: Date;
  lastActivity: Date;
  subscriptions: Set<string>;
  isAlive: boolean;
  
  constructor(
    id: string,
    userId?: string,
    subscriptions: string[] = []
  ) {
    this.id = id;
    this.userId = userId;
    this.connectedAt = new Date();
    this.lastActivity = new Date();
    this.subscriptions = new Set(subscriptions);
    this.isAlive = true;
  }
  
  subscribe(channel: string): void {
    this.subscriptions.add(channel);
    logger.debug('Client ' + this.id + ' subscribed to ' + channel);
  }
  
  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);
    logger.debug('Client ' + this.id + ' unsubscribed from ' + channel);
  }
  
  updateActivity(): void {
    this.lastActivity = new Date();
  }
  
  getUptime(): number {
    return new Date().getTime() - this.connectedAt.getTime();
  }
}

/**
 * WebSocket Manager
 */
export class WebSocketManager {
  private clients: Map<string, WebSocketClient> = new Map();
  private eventQueue: RealtimeEvent[] = [];
  private eventHandlers: Map<RealtimeEventType, Array<(event: RealtimeEvent) => void>> = new Map();
  private maxQueueSize: number = 1000;
  private heartbeatInterval: number = 30000;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  
  constructor(heartbeatInterval: number = 30000, maxQueueSize: number = 1000) {
    this.heartbeatInterval = heartbeatInterval;
    this.maxQueueSize = maxQueueSize;
    this.startHeartbeat();
  }
  
  /**
   * Register a client connection
   */
  registerClient(
    clientId: string,
    userId?: string,
    subscriptions: string[] = []
  ): WebSocketClient {
    const client = new WebSocketClient(clientId, userId, subscriptions);
    this.clients.set(clientId, client);
    
    this.broadcastEvent({
      type: RealtimeEventType.CONNECTION,
      timestamp: new Date(),
      userId: userId,
      data: {
        clientId,
        totalConnections: this.clients.size,
      },
    });
    
    logger.info('Client registered: ' + clientId + ' (total: ' + this.clients.size + ')');
    return client;
  }
  
  /**
   * Unregister a client connection
   */
  unregisterClient(clientId: string): boolean {
    const removed = this.clients.delete(clientId);
    
    if (removed) {
      this.broadcastEvent({
        type: RealtimeEventType.DISCONNECTION,
        timestamp: new Date(),
        data: {
          clientId,
          totalConnections: this.clients.size,
        },
      });
      
      logger.info('Client unregistered: ' + clientId + ' (remaining: ' + this.clients.size + ')');
    }
    
    return removed;
  }
  
  /**
   * Get client by ID
   */
  getClient(clientId: string): WebSocketClient | undefined {
    return this.clients.get(clientId);
  }
  
  /**
   * Get all connected clients
   */
  getClients(): WebSocketClient[] {
    return Array.from(this.clients.values());
  }
  
  /**
   * Get clients subscribed to channel
   */
  getSubscribers(channel: string): WebSocketClient[] {
    return Array.from(this.clients.values()).filter(c =>
      c.subscriptions.has(channel) || c.subscriptions.has('*')
    );
  }
  
  /**
   * Broadcast event to specific channel
   */
  broadcastToChannel(channel: string, event: RealtimeEvent): void {
    const subscribers = this.getSubscribers(channel);
    subscribers.forEach(client => {
      client.updateActivity();
    });
    
    this.queueEvent(event);
    logger.debug('Broadcast to ' + subscribers.length + ' clients on ' + channel);
  }
  
  /**
   * Broadcast event to all clients
   */
  broadcastEvent(event: RealtimeEvent): void {
    this.clients.forEach(client => {
      client.updateActivity();
    });
    
    this.queueEvent(event);
    logger.debug('Broadcast to ' + this.clients.size + ' clients');
  }
  
  /**
   * Send event to specific client
   */
  sendToClient(clientId: string, event: RealtimeEvent): boolean {
    const client = this.clients.get(clientId);
    
    if (!client) {
      return false;
    }
    
    client.updateActivity();
    this.queueEvent(event);
    return true;
  }
  
  /**
   * Queue event for processing
   */
  private queueEvent(event: RealtimeEvent): void {
    this.eventQueue.push(event);
    
    if (this.eventQueue.length > this.maxQueueSize) {
      this.eventQueue.shift();
      logger.warn('Event queue exceeded max size, removing oldest event');
    }
    
    this.triggerHandlers(event);
  }
  
  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 100): RealtimeEvent[] {
    return this.eventQueue.slice(-limit);
  }
  
  /**
   * Register event handler
   */
  onEvent(
    eventType: RealtimeEventType,
    handler: (event: RealtimeEvent) => void
  ): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    
    const handlers = this.eventHandlers.get(eventType);
    handlers!.push(handler);
    
    return () => {
      const index = handlers!.indexOf(handler);
      if (index > -1) {
        handlers!.splice(index, 1);
      }
    };
  }
  
  /**
   * Trigger event handlers
   */
  private triggerHandlers(event: RealtimeEvent): void {
    const handlers = this.eventHandlers.get(event.type) || [];
    handlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        logger.error('Error in event handler: ' + error);
      }
    });
  }
  
  /**
   * Unit event helpers
   */
  notifyUnitCreated(unitId: string, unit: any, userId?: string): void {
    this.broadcastToChannel('units', {
      type: RealtimeEventType.UNIT_CREATED,
      timestamp: new Date(),
      userId,
      data: {
        unitId,
        unit,
      },
    });
  }
  
  notifyUnitUpdated(unitId: string, unit: any, userId?: string): void {
    this.broadcastToChannel('units', {
      type: RealtimeEventType.UNIT_UPDATED,
      timestamp: new Date(),
      userId,
      data: {
        unitId,
        unit,
      },
    });
  }
  
  notifyUnitDeleted(unitId: string, userId?: string): void {
    this.broadcastToChannel('units', {
      type: RealtimeEventType.UNIT_DELETED,
      timestamp: new Date(),
      userId,
      data: { unitId },
    });
  }
  
  /**
   * Tag event helpers
   */
  notifyTagAdded(unitId: string, tag: string, userId?: string): void {
    this.broadcastToChannel('tags', {
      type: RealtimeEventType.TAG_ADDED,
      timestamp: new Date(),
      userId,
      data: { unitId, tag },
    });
  }
  
  notifyTagRemoved(unitId: string, tag: string, userId?: string): void {
    this.broadcastToChannel('tags', {
      type: RealtimeEventType.TAG_REMOVED,
      timestamp: new Date(),
      userId,
      data: { unitId, tag },
    });
  }
  
  /**
   * Graph event helpers
   */
  notifyGraphUpdated(stats: any, userId?: string): void {
    this.broadcastToChannel('graph', {
      type: RealtimeEventType.GRAPH_UPDATED,
      timestamp: new Date(),
      userId,
      data: stats,
    });
  }
  
  /**
   * Health check - start heartbeat
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.clients.forEach((client, clientId) => {
        client.updateActivity();
      });
      
      this.broadcastEvent({
        type: RealtimeEventType.PING,
        timestamp: new Date(),
        data: {
          clientCount: this.clients.size,
          uptime: process.uptime(),
        },
      });
    }, this.heartbeatInterval);
  }
  
  /**
   * Stop heartbeat
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
  }
  
  /**
   * Get manager statistics
   */
  getStatistics(): {
    clientCount: number;
    eventQueueSize: number;
    handlers: number;
    uptime: number;
  } {
    return {
      clientCount: this.clients.size,
      eventQueueSize: this.eventQueue.length,
      handlers: Array.from(this.eventHandlers.values()).reduce((a, b) => a + b.length, 0),
      uptime: process.uptime(),
    };
  }
  
  /**
   * Cleanup
   */
  destroy(): void {
    this.stopHeartbeat();
    this.clients.clear();
    this.eventQueue = [];
    this.eventHandlers.clear();
    logger.info('WebSocket manager destroyed');
  }
}
