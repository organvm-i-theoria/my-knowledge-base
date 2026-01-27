/**
 * Collections & Favorites REST API Routes
 * Provides endpoints for managing collections and favorites
 */

import { Router, Request, Response } from 'express';
import { CollectionsManager } from './collections.js';
import { Logger } from './logger.js';

const logger = new Logger({ context: 'collections-api' });

/**
 * Create collections API routes
 */
export function createCollectionsRoutes(collectionsManager?: CollectionsManager): Router {
  const router = Router();
  const manager = collectionsManager || new CollectionsManager();

  // ==================== Collection Endpoints ====================

  /**
   * POST /api/collections - Create a new collection
   */
  router.post('/', (req: Request, res: Response) => {
    try {
      const { name, description } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Collection name is required',
          code: 'MISSING_NAME',
        });
      }

      const collection = manager.createCollection(name, description);

      res.status(201).json({
        success: true,
        data: collection,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Created collection: ${collection.id} - ${collection.name}`);
    } catch (error) {
      logger.error('Error creating collection: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to create collection',
        code: 'CREATE_FAILED',
      });
    }
  });

  /**
   * GET /api/collections - List all collections
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const collections = manager.listCollections();

      res.json({
        success: true,
        data: collections,
        count: collections.length,
        timestamp: new Date().toISOString(),
      });

      logger.debug(`Listed ${collections.length} collections`);
    } catch (error) {
      logger.error('Error listing collections: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to list collections',
        code: 'LIST_FAILED',
      });
    }
  });

  /**
   * GET /api/collections/:id - Get a collection with its units
   */
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const includeUnits = req.query.includeUnits === 'true';

      const collection = includeUnits
        ? manager.getCollectionWithUnits(id)
        : manager.getCollection(id);

      if (!collection) {
        return res.status(404).json({
          success: false,
          error: 'Collection not found',
          code: 'NOT_FOUND',
        });
      }

      res.json({
        success: true,
        data: collection,
        timestamp: new Date().toISOString(),
      });

      logger.debug(`Retrieved collection: ${id}`);
    } catch (error) {
      logger.error('Error getting collection: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to get collection',
        code: 'GET_FAILED',
      });
    }
  });

  /**
   * PUT /api/collections/:id - Update a collection
   */
  router.put('/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description } = req.body;

      if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
        return res.status(400).json({
          success: false,
          error: 'Collection name cannot be empty',
          code: 'INVALID_NAME',
        });
      }

      const collection = manager.updateCollection(id, { name, description });

      if (!collection) {
        return res.status(404).json({
          success: false,
          error: 'Collection not found',
          code: 'NOT_FOUND',
        });
      }

      res.json({
        success: true,
        data: collection,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Updated collection: ${id}`);
    } catch (error) {
      logger.error('Error updating collection: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to update collection',
        code: 'UPDATE_FAILED',
      });
    }
  });

  /**
   * DELETE /api/collections/:id - Delete a collection
   */
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const deleted = manager.deleteCollection(id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Collection not found',
          code: 'NOT_FOUND',
        });
      }

      res.json({
        success: true,
        data: { id, deleted: true },
        timestamp: new Date().toISOString(),
      });

      logger.info(`Deleted collection: ${id}`);
    } catch (error) {
      logger.error('Error deleting collection: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete collection',
        code: 'DELETE_FAILED',
      });
    }
  });

  /**
   * POST /api/collections/:id/units - Add a unit to a collection
   */
  router.post('/:id/units', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { unitId } = req.body;

      if (!unitId || typeof unitId !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Unit ID is required',
          code: 'MISSING_UNIT_ID',
        });
      }

      const added = manager.addToCollection(id, unitId);

      res.status(added ? 201 : 200).json({
        success: true,
        data: {
          collectionId: id,
          unitId,
          added,
          message: added ? 'Unit added to collection' : 'Unit already in collection',
        },
        timestamp: new Date().toISOString(),
      });

      if (added) {
        logger.info(`Added unit ${unitId} to collection ${id}`);
      }
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'NOT_FOUND',
        });
      }

      logger.error('Error adding unit to collection: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to add unit to collection',
        code: 'ADD_FAILED',
      });
    }
  });

  /**
   * DELETE /api/collections/:id/units/:unitId - Remove a unit from a collection
   */
  router.delete('/:id/units/:unitId', (req: Request, res: Response) => {
    try {
      const { id, unitId } = req.params;

      const removed = manager.removeFromCollection(id, unitId);

      if (!removed) {
        return res.status(404).json({
          success: false,
          error: 'Unit not found in collection',
          code: 'NOT_FOUND',
        });
      }

      res.json({
        success: true,
        data: {
          collectionId: id,
          unitId,
          removed: true,
        },
        timestamp: new Date().toISOString(),
      });

      logger.info(`Removed unit ${unitId} from collection ${id}`);
    } catch (error) {
      logger.error('Error removing unit from collection: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to remove unit from collection',
        code: 'REMOVE_FAILED',
      });
    }
  });

  /**
   * GET /api/collections/for-unit/:unitId - Get collections containing a unit
   */
  router.get('/for-unit/:unitId', (req: Request, res: Response) => {
    try {
      const { unitId } = req.params;

      const collections = manager.getCollectionsForUnit(unitId);

      res.json({
        success: true,
        data: collections,
        count: collections.length,
        timestamp: new Date().toISOString(),
      });

      logger.debug(`Found ${collections.length} collections for unit ${unitId}`);
    } catch (error) {
      logger.error('Error getting collections for unit: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to get collections for unit',
        code: 'GET_FAILED',
      });
    }
  });

  return router;
}

/**
 * Create favorites API routes
 */
export function createFavoritesRoutes(collectionsManager?: CollectionsManager): Router {
  const router = Router();
  const manager = collectionsManager || new CollectionsManager();

  /**
   * GET /api/favorites - List all favorites
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string | undefined;
      const includeUnits = req.query.includeUnits === 'true';

      const favorites = includeUnits
        ? manager.listFavoritesWithUnits(userId)
        : manager.listFavorites(userId);

      res.json({
        success: true,
        data: favorites,
        count: favorites.length,
        timestamp: new Date().toISOString(),
      });

      logger.debug(`Listed ${favorites.length} favorites`);
    } catch (error) {
      logger.error('Error listing favorites: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to list favorites',
        code: 'LIST_FAILED',
      });
    }
  });

  /**
   * POST /api/favorites/:unitId - Add a unit to favorites
   */
  router.post('/:unitId', (req: Request, res: Response) => {
    try {
      const { unitId } = req.params;
      const userId = req.body.userId as string | undefined;

      const added = manager.addFavorite(unitId, userId);

      res.status(added ? 201 : 200).json({
        success: true,
        data: {
          unitId,
          userId: userId || null,
          added,
          message: added ? 'Added to favorites' : 'Already in favorites',
        },
        timestamp: new Date().toISOString(),
      });

      if (added) {
        logger.info(`Added unit ${unitId} to favorites`);
      }
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'NOT_FOUND',
        });
      }

      logger.error('Error adding favorite: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to add favorite',
        code: 'ADD_FAILED',
      });
    }
  });

  /**
   * DELETE /api/favorites/:unitId - Remove a unit from favorites
   */
  router.delete('/:unitId', (req: Request, res: Response) => {
    try {
      const { unitId } = req.params;
      const userId = req.query.userId as string | undefined;

      const removed = manager.removeFavorite(unitId, userId);

      if (!removed) {
        return res.status(404).json({
          success: false,
          error: 'Favorite not found',
          code: 'NOT_FOUND',
        });
      }

      res.json({
        success: true,
        data: {
          unitId,
          userId: userId || null,
          removed: true,
        },
        timestamp: new Date().toISOString(),
      });

      logger.info(`Removed unit ${unitId} from favorites`);
    } catch (error) {
      logger.error('Error removing favorite: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to remove favorite',
        code: 'REMOVE_FAILED',
      });
    }
  });

  /**
   * GET /api/favorites/:unitId/status - Check if a unit is favorited
   */
  router.get('/:unitId/status', (req: Request, res: Response) => {
    try {
      const { unitId } = req.params;
      const userId = req.query.userId as string | undefined;

      const isFavorite = manager.isFavorite(unitId, userId);
      const favoriteCount = manager.getFavoriteCount(unitId);

      res.json({
        success: true,
        data: {
          unitId,
          isFavorite,
          favoriteCount,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error checking favorite status: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to check favorite status',
        code: 'CHECK_FAILED',
      });
    }
  });

  return router;
}

/**
 * Get collections statistics
 */
export function createCollectionsStatsRoute(collectionsManager?: CollectionsManager): Router {
  const router = Router();
  const manager = collectionsManager || new CollectionsManager();

  router.get('/stats', (req: Request, res: Response) => {
    try {
      const stats = manager.getStats();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      });

      logger.debug('Retrieved collections stats');
    } catch (error) {
      logger.error('Error getting collections stats: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to get collections stats',
        code: 'STATS_FAILED',
      });
    }
  });

  return router;
}
