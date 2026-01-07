/**
 * WebSocket API Routes
 * Integrates WebSocket functionality with Express
 */

import { Router } from 'express';
import { Logger } from './logger.js';
import { WebSocketManager, RealtimeEventType } from './websocket-manager.js';

const logger = new Logger({ context: 'websocket-api' });

/**
 * Create HTTP routes for WebSocket status and management
 */
export function createWebSocketRoutes(wsManager: WebSocketManager): Router {
  const router = Router();

  // GET /api/ws/status - Get WebSocket manager status
  router.get('/status', (req, res) => {
    try {
      const stats = wsManager.getStatistics();
      
      res.json({
        success: true,
        data: {
          stats,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Error getting status: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to get status',
      });
    }
  });

  // GET /api/ws/clients - Get connected clients (admin only)
  router.get('/clients', (req, res) => {
    try {
      const clients = wsManager.getClients().map(c => ({
        id: c.id,
        userId: c.userId,
        subscriptions: Array.from(c.subscriptions),
        connectedAt: c.connectedAt,
        lastActivity: c.lastActivity,
        uptime: c.getUptime(),
      }));
      
      res.json({
        success: true,
        data: clients,
        total: clients.length,
      });
    } catch (error) {
      logger.error('Error fetching clients: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch clients',
      });
    }
  });

  // GET /api/ws/events - Get recent events
  router.get('/events', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const events = wsManager.getRecentEvents(limit);
      
      res.json({
        success: true,
        data: events,
        total: events.length,
      });
    } catch (error) {
      logger.error('Error fetching events: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch events',
      });
    }
  });

  return router;
}

/**
 * WebSocket connection handler for ws library
 */
export function createWebSocketHandler(wsManager: WebSocketManager) {
  return (ws: any) => {
    const clientId = 'client_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    let userId: string | undefined;
    let client = wsManager.registerClient(clientId);
    
    logger.info('New WebSocket connection: ' + clientId);

    // Handle incoming messages
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);
        handleMessage(data);
      } catch (error) {
        logger.error('Failed to parse WebSocket message: ' + error);
        ws.send(JSON.stringify({
          error: 'Invalid message format',
        }));
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      wsManager.unregisterClient(clientId);
      logger.info('WebSocket connection closed: ' + clientId);
    });

    // Handle connection errors
    ws.on('error', (error: any) => {
      logger.error('WebSocket error: ' + error);
    });

    // Send connection confirmation
    ws.send(JSON.stringify({
      type: 'connection',
      clientId,
      timestamp: new Date(),
    }));

    // Message handler
    function handleMessage(data: any) {
      const { action, channel, userId: newUserId } = data;

      switch (action) {
        case 'subscribe':
          if (channel) {
            client.subscribe(channel);
            ws.send(JSON.stringify({
              type: 'subscription',
              channel,
              status: 'subscribed',
            }));
            logger.debug('Client ' + clientId + ' subscribed to ' + channel);
          }
          break;

        case 'unsubscribe':
          if (channel) {
            client.unsubscribe(channel);
            ws.send(JSON.stringify({
              type: 'subscription',
              channel,
              status: 'unsubscribed',
            }));
            logger.debug('Client ' + clientId + ' unsubscribed from ' + channel);
          }
          break;

        case 'authenticate':
          if (newUserId) {
            userId = newUserId;
            ws.send(JSON.stringify({
              type: 'authenticated',
              userId,
              timestamp: new Date(),
            }));
            logger.debug('Client ' + clientId + ' authenticated as ' + userId);
          }
          break;

        case 'ping':
          ws.send(JSON.stringify({
            type: 'pong',
            clientId,
            timestamp: new Date(),
          }));
          break;

        case 'get_stats':
          const stats = wsManager.getStatistics();
          ws.send(JSON.stringify({
            type: 'stats',
            data: stats,
            timestamp: new Date(),
          }));
          break;

        default:
          logger.warn('Unknown action: ' + action);
      }
    }
  };
}

/**
 * Create event broadcaster functions
 * These are used by other modules to broadcast events
 */
export function createEventBroadcaster(wsManager: WebSocketManager) {
  return {
    // Unit events
    broadcastUnitCreated: (unitId: string, unit: any, userId?: string) => {
      wsManager.notifyUnitCreated(unitId, unit, userId);
    },
    
    broadcastUnitUpdated: (unitId: string, unit: any, userId?: string) => {
      wsManager.notifyUnitUpdated(unitId, unit, userId);
    },
    
    broadcastUnitDeleted: (unitId: string, userId?: string) => {
      wsManager.notifyUnitDeleted(unitId, userId);
    },
    
    // Tag events
    broadcastTagAdded: (unitId: string, tag: string, userId?: string) => {
      wsManager.notifyTagAdded(unitId, tag, userId);
    },
    
    broadcastTagRemoved: (unitId: string, tag: string, userId?: string) => {
      wsManager.notifyTagRemoved(unitId, tag, userId);
    },
    
    // Graph events
    broadcastGraphUpdated: (stats: any, userId?: string) => {
      wsManager.notifyGraphUpdated(stats, userId);
    },
    
    // Custom event
    broadcastCustom: (type: string, data: any, channel: string = '*') => {
      wsManager.broadcastToChannel(channel, {
        type: type as any,
        timestamp: new Date(),
        data,
      });
    },
  };
}
