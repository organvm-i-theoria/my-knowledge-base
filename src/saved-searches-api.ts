/**
 * REST API endpoints for saved searches
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  SavedSearchesManager,
  SavedSearch,
  SavedSearchType,
  SavedSearchFilters,
  CreateSavedSearchInput,
  UpdateSavedSearchInput,
} from './saved-searches.js';
import { logger, AppError } from './logger.js';

/**
 * API response interfaces
 */
interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  timestamp: string;
}

/**
 * Format saved search for API response
 */
function formatSavedSearch(search: SavedSearch): Record<string, any> {
  return {
    id: search.id,
    name: search.name,
    query: search.query,
    searchType: search.searchType,
    filters: search.filters,
    createdAt: search.createdAt.toISOString(),
    updatedAt: search.updatedAt.toISOString(),
    lastExecutedAt: search.lastExecutedAt?.toISOString() || null,
    executionCount: search.executionCount,
  };
}

/**
 * Validate search type
 */
function isValidSearchType(type: string): type is SavedSearchType {
  return ['fts', 'semantic', 'hybrid'].includes(type);
}

/**
 * Parse and validate filters
 */
function parseFilters(filters: any): SavedSearchFilters {
  if (!filters || typeof filters !== 'object') {
    return {};
  }

  const parsed: SavedSearchFilters = {};

  if (filters.category && typeof filters.category === 'string') {
    parsed.category = filters.category;
  }

  if (filters.type && typeof filters.type === 'string') {
    parsed.type = filters.type;
  }

  if (filters.tags) {
    if (Array.isArray(filters.tags)) {
      parsed.tags = filters.tags.filter((t: any) => typeof t === 'string');
    } else if (typeof filters.tags === 'string') {
      parsed.tags = [filters.tags];
    }
  }

  if (filters.dateFrom && typeof filters.dateFrom === 'string') {
    // Validate ISO date format
    const date = new Date(filters.dateFrom);
    if (!isNaN(date.getTime())) {
      parsed.dateFrom = filters.dateFrom;
    }
  }

  if (filters.dateTo && typeof filters.dateTo === 'string') {
    const date = new Date(filters.dateTo);
    if (!isNaN(date.getTime())) {
      parsed.dateTo = filters.dateTo;
    }
  }

  return parsed;
}

/**
 * Create saved searches API router
 */
export function createSavedSearchesRouter(
  dbPath: string = './db/knowledge.db',
  vectorDbPath: string = './atomized/embeddings/chroma'
): Router {
  const router = Router();
  const manager = new SavedSearchesManager(dbPath, vectorDbPath);

  // Error handling middleware
  const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

  const parseIntParam = (
    value: string | undefined,
    defaultValue: number,
    min: number,
    max: number
  ): number => {
    if (value === undefined) return defaultValue;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      return defaultValue;
    }
    return Math.min(Math.max(parsed, min), max);
  };

  /**
   * POST /api/searches/saved
   * Save a new search
   */
  router.post(
    '/saved',
    asyncHandler(async (req: Request, res: Response) => {
      const { name, query, searchType, filters } = req.body;

      // Validation
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new AppError('Name is required', 'MISSING_NAME', 400);
      }

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new AppError('Query is required', 'MISSING_QUERY', 400);
      }

      if (!searchType || !isValidSearchType(searchType)) {
        throw new AppError(
          'Invalid search type. Must be one of: fts, semantic, hybrid',
          'INVALID_SEARCH_TYPE',
          400
        );
      }

      // Check for duplicate name
      if (manager.searchNameExists(name.trim())) {
        throw new AppError('A saved search with this name already exists', 'DUPLICATE_NAME', 409);
      }

      const input: CreateSavedSearchInput = {
        name: name.trim(),
        query: query.trim(),
        searchType,
        filters: parseFilters(filters),
      };

      const savedSearch = manager.saveSearch(input);

      res.status(201).json({
        success: true,
        data: formatSavedSearch(savedSearch),
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.info(`Created saved search: ${savedSearch.id}`, { name: savedSearch.name });
    })
  );

  /**
   * GET /api/searches/saved
   * List all saved searches
   */
  router.get(
    '/saved',
    asyncHandler(async (req: Request, res: Response) => {
      const page = parseIntParam(req.query.page as string, 1, 1, 10000);
      const pageSize = parseIntParam(req.query.pageSize as string, 20, 1, 100);
      const sortBy = req.query.sortBy as string || 'createdAt';
      const sortOrder = (req.query.sortOrder as string)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const validSortFields = ['name', 'createdAt', 'updatedAt', 'executionCount', 'lastExecutedAt'];
      const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

      const { searches, total } = manager.listSavedSearches({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        sortBy: actualSortBy as any,
        sortOrder: sortOrder as 'ASC' | 'DESC',
      });

      res.json({
        success: true,
        data: searches.map(formatSavedSearch),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
        timestamp: new Date().toISOString(),
      } as PaginatedResponse<any>);

      logger.debug(`Listed saved searches: page=${page}, total=${total}`);
    })
  );

  /**
   * GET /api/searches/saved/:id
   * Get a specific saved search
   */
  router.get(
    '/saved/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;

      const savedSearch = manager.getSavedSearch(id);
      if (!savedSearch) {
        throw new AppError(`Saved search not found: ${id}`, 'NOT_FOUND', 404);
      }

      res.json({
        success: true,
        data: formatSavedSearch(savedSearch),
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug(`Retrieved saved search: ${id}`);
    })
  );

  /**
   * PUT /api/searches/saved/:id
   * Update a saved search
   */
  router.put(
    '/saved/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const { name, query, searchType, filters } = req.body;

      const existing = manager.getSavedSearch(id);
      if (!existing) {
        throw new AppError(`Saved search not found: ${id}`, 'NOT_FOUND', 404);
      }

      const updates: UpdateSavedSearchInput = {};

      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          throw new AppError('Name must be a non-empty string', 'INVALID_NAME', 400);
        }
        // Check for duplicate name (excluding current search)
        if (manager.searchNameExists(name.trim(), id)) {
          throw new AppError('A saved search with this name already exists', 'DUPLICATE_NAME', 409);
        }
        updates.name = name.trim();
      }

      if (query !== undefined) {
        if (typeof query !== 'string' || query.trim().length === 0) {
          throw new AppError('Query must be a non-empty string', 'INVALID_QUERY', 400);
        }
        updates.query = query.trim();
      }

      if (searchType !== undefined) {
        if (!isValidSearchType(searchType)) {
          throw new AppError(
            'Invalid search type. Must be one of: fts, semantic, hybrid',
            'INVALID_SEARCH_TYPE',
            400
          );
        }
        updates.searchType = searchType;
      }

      if (filters !== undefined) {
        updates.filters = parseFilters(filters);
      }

      if (Object.keys(updates).length === 0) {
        throw new AppError('No fields to update', 'NO_UPDATES', 400);
      }

      const updatedSearch = manager.updateSavedSearch(id, updates);

      res.json({
        success: true,
        data: formatSavedSearch(updatedSearch!),
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.info(`Updated saved search: ${id}`);
    })
  );

  /**
   * DELETE /api/searches/saved/:id
   * Delete a saved search
   */
  router.delete(
    '/saved/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;

      const existing = manager.getSavedSearch(id);
      if (!existing) {
        throw new AppError(`Saved search not found: ${id}`, 'NOT_FOUND', 404);
      }

      manager.deleteSavedSearch(id);

      res.json({
        success: true,
        data: { id, deleted: true },
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.info(`Deleted saved search: ${id}`);
    })
  );

  /**
   * POST /api/searches/saved/:id/execute
   * Execute a saved search
   */
  router.post(
    '/saved/:id/execute',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const limit = parseIntParam(req.query.limit as string || req.body?.limit, 20, 1, 100);
      const offset = parseIntParam(req.query.offset as string || req.body?.offset, 0, 0, 10000);

      const result = await manager.executeSearch(id, { limit, offset });
      if (!result) {
        throw new AppError(`Saved search not found: ${id}`, 'NOT_FOUND', 404);
      }

      res.json({
        success: true,
        data: {
          savedSearch: formatSavedSearch(result.savedSearch),
          results: result.results.map(unit => ({
            id: unit.id,
            type: unit.type,
            title: unit.title,
            content: unit.content,
            context: unit.context,
            category: unit.category,
            tags: unit.tags,
            timestamp: unit.timestamp.toISOString(),
            conversationId: unit.conversationId,
            documentId: unit.documentId,
          })),
          executionTime: result.executionTime,
          pagination: {
            offset,
            limit,
            total: result.total,
          },
        },
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug(`Executed saved search: ${id}, results=${result.results.length}, time=${result.executionTime}ms`);
    })
  );

  /**
   * GET /api/searches/popular
   * Get most popular (frequently executed) searches
   */
  router.get(
    '/popular',
    asyncHandler(async (req: Request, res: Response) => {
      const limit = parseIntParam(req.query.limit as string, 10, 1, 50);

      const popularSearches = manager.getPopularSearches(limit);

      res.json({
        success: true,
        data: popularSearches.map(search => ({
          id: search.id,
          name: search.name,
          query: search.query,
          searchType: search.searchType,
          executionCount: search.executionCount,
          lastExecutedAt: search.lastExecutedAt?.toISOString() || null,
        })),
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug(`Retrieved popular searches: limit=${limit}`);
    })
  );

  /**
   * GET /api/searches/recent
   * Get recently executed searches
   */
  router.get(
    '/recent',
    asyncHandler(async (req: Request, res: Response) => {
      const limit = parseIntParam(req.query.limit as string, 10, 1, 50);

      const recentSearches = manager.getRecentlyExecutedSearches(limit);

      res.json({
        success: true,
        data: recentSearches.map(formatSavedSearch),
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug(`Retrieved recent searches: limit=${limit}`);
    })
  );

  /**
   * GET /api/searches/saved/search
   * Search saved searches by name or query
   */
  router.get(
    '/saved/search',
    asyncHandler(async (req: Request, res: Response) => {
      const q = req.query.q as string;
      const limit = parseIntParam(req.query.limit as string, 20, 1, 100);

      if (!q || q.trim().length === 0) {
        throw new AppError('Search term is required', 'MISSING_QUERY', 400);
      }

      const results = manager.searchSavedSearches(q.trim(), limit);

      res.json({
        success: true,
        data: results.map(formatSavedSearch),
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug(`Searched saved searches: q="${q}", results=${results.length}`);
    })
  );

  /**
   * Error handling middleware
   */
  router.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
        statusCode: err.statusCode,
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        statusCode: 500,
      });
    }
  });

  return router;
}
