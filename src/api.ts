/**
 * REST API endpoints for knowledge base
 * Provides comprehensive CRUD operations on atomic units + Phase 2 search
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { KnowledgeDatabase } from './database.js';
import { logger, AppError } from './logger.js';
import { AtomicUnit } from './types.js';
import { AuthService, createAuthMiddleware } from './auth.js';
import { FilterBuilder, SearchFilter } from './filter-builder.js';
import { SearchCache } from './search-cache.js';
import { SearchAnalyticsTracker } from './analytics/search-analytics.js';
import { QuerySuggestionEngine } from './analytics/query-suggestions.js';
import { FilterPresetManager } from './filter-presets.js';
import { HybridSearch, HybridSearchResult } from './hybrid-search.js';
import { createIntelligenceRouter } from './api-intelligence.js';
import { AuditLogger } from './audit-log.js';

/**
 * API Error response format
 */
interface ApiErrorResponse {
  error: string;
  code: string;
  statusCode: number;
  details?: Record<string, any>;
}

/**
 * API Success response format
 */
interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

/**
 * Paginated response format
 */
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
 * Search response format (Phase 2)
 */
interface SearchResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    offset: number;
  };
  query: {
    original: string;
    normalized: string;
  };
  filters?: {
    applied: SearchFilter[];
    available: Array<{ field: string; buckets: Array<{ value: string; count: number }> }>;
  };
  facets?: Array<{ field: string; buckets: Array<{ value: string; count: number }> }>;
  searchTime: number;
  stats?: {
    cacheHit: boolean;
  };
  timestamp: string;
}

/**
 * Create REST API router
 */
export function createApiRouter(db: KnowledgeDatabase): Router {
  const router = Router();

  const authEnabled = process.env.ENABLE_AUTH === 'true';
  const authService = authEnabled ? new AuthService(process.env.JWT_SECRET) : null;
  if (authService) {
    router.use(createAuthMiddleware(authService));
  }

  const auditLogger = new AuditLogger({
    enabled: process.env.AUDIT_LOG_ENABLED === 'true',
    path: process.env.AUDIT_LOG_PATH || './logs/audit.log',
  });

  router.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    res.on('finish', () => {
      if (!auditLogger.isEnabled()) return;
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;

      const authContext = (req as any).authContext;
      auditLogger.logEvent({
        timestamp: new Date().toISOString(),
        action: `${req.method} ${req.originalUrl}`,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        userId: authContext?.user?.id,
        roles: authContext?.user?.roles,
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string,
        durationMs: Date.now() - startTime,
      });
    });
    next();
  });

  const formatForRequest = (req: Request, unit: AtomicUnit) =>
    formatUnit(unit, {
      includeSensitive: !authEnabled || (req as any).authContext?.isAuthenticated === true,
    });

  // Initialize Phase 2 services
  const searchCache = new SearchCache();
  const analyticsTracker = new SearchAnalyticsTracker('./db/knowledge.db');
  const suggestionEngine = new QuerySuggestionEngine('./db/knowledge.db');
  const presetManager = new FilterPresetManager('./db/filter-presets.json');
  let hybridSearch: HybridSearch | null = null;
  
  try {
    hybridSearch = new HybridSearch('./db/knowledge.db', './atomized/embeddings/chroma');
  } catch (e) {
    // Semantic search not available (embeddings/ChromaDB not initialized)
  }

  // Error handling middleware
  const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

  const parseIntParam = (
    value: string | undefined,
    name: string,
    defaultValue: number,
    min: number,
    max: number
  ): number => {
    if (value === undefined) return defaultValue;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      throw new AppError(`Invalid ${name}`, 'INVALID_PARAMETER', 400);
    }
    if (parsed < min || parsed > max) {
      throw new AppError(`Invalid ${name}`, 'INVALID_PARAMETER', 400);
    }
    return parsed;
  };

  const parseWeightParam = (value: string | undefined, name: string, defaultValue: number): number => {
    if (value === undefined) return defaultValue;
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new AppError(`Invalid ${name}`, 'INVALID_PARAMETER', 400);
    }
    return parsed;
  };

  /**
   * GET /api/search
   * Enhanced full-text search with caching, analytics, and facets
   */
  router.get(
    '/search',
    asyncHandler(async (req: Request, res: Response) => {
      const queryParam = req.query.q;
      if (queryParam === undefined) {
        throw new AppError('Search query is required', 'MISSING_QUERY', 400);
      }
      const query = String(queryParam);
      const page = parseIntParam(req.query.page as string | undefined, 'page', 1, 1, 10000);
      const pageSize = parseIntParam(req.query.pageSize as string | undefined, 'pageSize', 20, 1, 100);
      const includeFacets = req.query.facets === 'true';

      const startTime = Date.now();

      // Check cache
      const cacheKey = searchCache.generateKey({ query, limit: pageSize });
      let cacheHit = false;
      let cached = searchCache.get(cacheKey);

      if (cached && !includeFacets) {
        cacheHit = true;
        res.json({
          success: true,
          data: cached.results,
          pagination: {
            page,
            pageSize,
            total: cached.total || 0,
            totalPages: cached.total ? Math.ceil((cached.total || 0) / pageSize) : 0,
            offset: (page - 1) * pageSize,
          },
          query: { original: query, normalized: query.toLowerCase() },
          stats: { cacheHit: true },
          searchTime: Math.max(1, Date.now() - startTime),
          timestamp: new Date().toISOString(),
        } as SearchResponse<any>);

        analyticsTracker.trackQuery({
          query,
          searchType: 'fts',
          latencyMs: Math.max(1, Date.now() - startTime),
          resultCount: cached.results?.length || 0,
        });

        return;
      }

      // Full-text search
      const offset = (page - 1) * pageSize;
      let results: AtomicUnit[] = [];
      let total = 0;

      if (query.length === 0) {
        total = (db['db'].prepare('SELECT COUNT(*) as count FROM atomic_units').get() as { count: number }).count;
        results = db['db'].prepare(`
          SELECT * FROM atomic_units
          ORDER BY created DESC
          LIMIT ? OFFSET ?
        `).all(pageSize, offset) as AtomicUnit[];
      } else {
        try {
          const searchResult = db.searchTextPaginated(query, offset, pageSize);
          results = searchResult.results;
          total = searchResult.total;
        } catch (error) {
          const searchTerm = `%${query}%`;
          total = (db['db'].prepare(`
            SELECT COUNT(*) as count FROM atomic_units
            WHERE title LIKE ? OR content LIKE ?
          `).get(searchTerm, searchTerm) as { count: number }).count;
          results = db['db'].prepare(`
            SELECT * FROM atomic_units
            WHERE title LIKE ? OR content LIKE ?
            ORDER BY created DESC
            LIMIT ? OFFSET ?
          `).all(searchTerm, searchTerm, pageSize, offset) as AtomicUnit[];
        }
      }

      // Get facets if requested
      let facets: any[] = [];
      if (includeFacets) {
        const categoryFacets = db.getCategoryFacets();
        const typeFacets = db.getTypeFacets();
        facets = [
          { field: 'category', buckets: categoryFacets },
          { field: 'type', buckets: typeFacets },
        ];
      }

      // Cache results
      if (!cacheHit) {
        searchCache.set(cacheKey, {
          results: results.map(unit => formatForRequest(req, unit)),
          total,
          queryTime: Date.now() - startTime,
          ttl: 5 * 60 * 1000,
        });
      }

      res.json({
        success: true,
        data: results.map(unit => formatForRequest(req, unit)),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          offset,
        },
        query: { original: query, normalized: query.toLowerCase() },
        facets: includeFacets ? facets : undefined,
        stats: { cacheHit: false },
        searchTime: Math.max(1, Date.now() - startTime),
        timestamp: new Date().toISOString(),
      } as SearchResponse<any>);

      // Track query
      analyticsTracker.trackQuery({
        query,
        searchType: 'fts',
        latencyMs: Math.max(1, Date.now() - startTime),
        resultCount: results.length,
      });

      logger.debug(`FTS search: "${query}", results=${results.length}, page=${page}`);
    })
  );

  /**
   * GET /api/search/semantic
   * Semantic search using embeddings
   */
  router.get(
    '/search/semantic',
    asyncHandler(async (req: Request, res: Response) => {
      const query = req.query.q as string;
      const page = parseIntParam(req.query.page as string | undefined, 'page', 1, 1, 10000);
      const pageSize = parseIntParam(req.query.pageSize as string | undefined, 'pageSize', 20, 1, 100);
      const type = req.query.type as string | undefined;
      const category = req.query.category as string | undefined;

      if (!query || query.length === 0) {
        throw new AppError('Search query is required', 'MISSING_QUERY', 400);
      }

      const startTime = Date.now();

      // Build filter for metadata
      let whereClause = '';
      const params: any[] = [];

      if (type) {
        whereClause += (whereClause ? ' AND ' : '') + 'type = ?';
        params.push(type);
      }

      if (category) {
        whereClause += (whereClause ? ' AND ' : '') + 'category = ?';
        params.push(category);
      }

      let results: AtomicUnit[] = [];
      if (hybridSearch) {
        try {
          const hybridResults = await hybridSearch.search(query, pageSize, { fts: 0.2, semantic: 0.8 });
          results = hybridResults.map(r => r.unit);
        } catch (error) {
          logger.warn('Semantic search failed, falling back to FTS');
        }
      }

      if (results.length === 0) {
        results = db.searchTextPaginated(query, 0, pageSize * 2).results;
      }

      if (type) {
        results = results.filter(unit => unit.type === type);
      }
      if (category) {
        results = results.filter(unit => unit.category === category);
      }

      const total = results.length;

      // Get facets
      const categoryFacets = db.getCategoryFacets(whereClause, params);
      const typeFacets = db.getTypeFacets(whereClause, params);

      res.json({
        success: true,
        data: results.slice((page - 1) * pageSize, page * pageSize),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          offset: (page - 1) * pageSize,
        },
        query: { original: query, normalized: query.toLowerCase() },
        facets: [
          { field: 'category', buckets: categoryFacets },
          { field: 'type', buckets: typeFacets },
        ],
        stats: { cacheHit: false },
        searchTime: Math.max(1, Date.now() - startTime),
        timestamp: new Date().toISOString(),
      } as SearchResponse<any>);

      analyticsTracker.trackQuery({
        query,
        searchType: 'semantic',
        latencyMs: Math.max(1, Date.now() - startTime),
        resultCount: results.length,
      });

      logger.debug(`Semantic search: "${query}", results=${results.length}, page=${page}`);
    })
  );

  /**
   * GET /api/search/hybrid
   * Hybrid search combining FTS and semantic
   */
  router.get(
    '/search/hybrid',
    asyncHandler(async (req: Request, res: Response) => {
      const query = req.query.q as string;
      const page = parseIntParam(req.query.page as string | undefined, 'page', 1, 1, 10000);
      const pageSize = parseIntParam(req.query.pageSize as string | undefined, 'pageSize', 20, 1, 100);
      const ftsWeight = parseWeightParam(req.query.ftsWeight as string | undefined, 'ftsWeight', 0.4);
      const semanticWeight = parseWeightParam(req.query.semanticWeight as string | undefined, 'semanticWeight', 0.6);
      const includeFacets = req.query.facets === 'true';

      if (!query || query.length === 0) {
        throw new AppError('Search query is required', 'MISSING_QUERY', 400);
      }

      const startTime = Date.now();

      // Check cache
      const cacheKey = searchCache.generateKey({
        query,
        weights: { fts: ftsWeight, semantic: semanticWeight },
      });
      const cached = searchCache.get(cacheKey);

      if (cached && !includeFacets) {
        res.json({
          success: true,
          data: cached.results,
          pagination: {
            page,
            pageSize,
            total: cached.total || 0,
            totalPages: Math.ceil((cached.total || 0) / pageSize),
            offset: (page - 1) * pageSize,
          },
          query: { original: query, normalized: query.toLowerCase() },
          stats: { cacheHit: true },
          searchTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        } as SearchResponse<any>);

        analyticsTracker.trackQuery({
          query,
          searchType: 'hybrid',
          latencyMs: Date.now() - startTime,
          resultCount: cached.results?.length || 0,
        });

        return;
      }

      // Hybrid search
      let results: AtomicUnit[] = [];

      if (hybridSearch) {
        try {
          const hybridResults = await hybridSearch.search(query, pageSize, { fts: ftsWeight, semantic: semanticWeight });
          results = hybridResults.map(r => r.unit);
        } catch (error) {
          logger.warn('Hybrid search failed, falling back to FTS');
        }
      }

      if (results.length === 0) {
        // Fallback to FTS only
        const searchTerm = `%${query}%`;
        results = db['db'].prepare(`
          SELECT * FROM atomic_units
          WHERE title LIKE ? OR content LIKE ?
          ORDER BY created DESC
          LIMIT ?
        `).all(searchTerm, searchTerm, pageSize) as AtomicUnit[];
      }

      const total = results.length;

      // Get facets if requested
      let facets: any[] = [];
      if (includeFacets) {
        const categoryFacets = db.getCategoryFacets();
        const typeFacets = db.getTypeFacets();
        facets = [
          { field: 'category', buckets: categoryFacets },
          { field: 'type', buckets: typeFacets },
        ];
      }

      // Cache results
      searchCache.set(cacheKey, {
        results: results.map(unit => formatForRequest(req, unit)),
        total,
        queryTime: Date.now() - startTime,
        ttl: 5 * 60 * 1000,
      });

      res.json({
        success: true,
        data: results
          .slice((page - 1) * pageSize, page * pageSize)
          .map(unit => formatForRequest(req, unit)),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          offset: (page - 1) * pageSize,
        },
        query: { original: query, normalized: query.toLowerCase() },
        facets: includeFacets ? facets : undefined,
        stats: { cacheHit: false },
        searchTime: Math.max(1, Date.now() - startTime),
        timestamp: new Date().toISOString(),
      } as SearchResponse<any>);

      analyticsTracker.trackQuery({
        query,
        searchType: 'hybrid',
        latencyMs: Math.max(1, Date.now() - startTime),
        resultCount: results.length,
      });

      logger.debug(`Hybrid search: "${query}", results=${results.length}, fts=${ftsWeight}, semantic=${semanticWeight}`);
    })
  );

  /**
   * GET /api/search/suggestions
   * Autocomplete suggestions from multiple sources
   */
  router.get(
    '/search/suggestions',
    asyncHandler(async (req: Request, res: Response) => {
      const prefixParam = req.query.q;
      if (prefixParam === undefined) {
        throw new AppError('Query prefix required', 'MISSING_PREFIX', 400);
      }

      const prefix = String(prefixParam);
      const limit = parseIntParam(req.query.limit as string | undefined, 'limit', 10, 1, 20);
      const suggestions = prefix.length < 1 ? [] : suggestionEngine.generateSuggestions(prefix, limit);

      res.json({
        success: true,
        data: suggestions,
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug(`Suggestions: "${prefix}", count=${suggestions.length}`);
    })
  );

  /**
   * GET /api/search/facets
   * Get available facets for filtering
   */
  router.get(
    '/search/facets',
    asyncHandler(async (req: Request, res: Response) => {
      const searchQuery = req.query.q as string | undefined;
      const params: any[] = [];
      let whereClause = '';
      let tagWhere = '';

      if (searchQuery && searchQuery.length > 0) {
        const searchTerm = `%${searchQuery}%`;
        whereClause = '(u.title LIKE ? OR u.content LIKE ?)';
        tagWhere = '(u.title LIKE ? OR u.content LIKE ?)';
        params.push(searchTerm, searchTerm);
      }

      const categoryFacets = db.getCategoryFacets(whereClause, params).map(f => ({
        value: (f as any).value ?? (f as any).category,
        count: f.count
      }));
      const typeFacets = db.getTypeFacets(whereClause, params).map(f => ({
        value: (f as any).value ?? (f as any).type,
        count: f.count
      }));
      const tagFacets = db.getTagFacets(tagWhere, params, 50);
      const dateFacets = db.getDateFacets(whereClause, params).map(f => ({
        value: (f as any).value ?? (f as any).period,
        count: f.count,
        startDate: f.startDate,
        endDate: f.endDate
      }));

      res.json({
        success: true,
        data: [
          { field: 'category', buckets: categoryFacets },
          { field: 'type', buckets: typeFacets },
          { field: 'tags', buckets: tagFacets },
          { field: 'date', buckets: dateFacets },
        ],
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug('Facets requested');
    })
  );

  /**
   * GET /api/search/presets
   * List available filter presets
   */
  router.get(
    '/search/presets',
    asyncHandler(async (req: Request, res: Response) => {
      const presets = presetManager.listPresets();

      res.json({
        success: true,
        data: presets,
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug(`Presets listed: count=${presets.length}`);
    })
  );

  /**
   * GET /api/units
   * List all atomic units with optional filtering and pagination
   */
  router.get(
    '/units',
    asyncHandler(async (req: Request, res: Response) => {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
      const type = req.query.type as string | undefined;
      const category = req.query.category as string | undefined;
      const searchQuery = req.query.q as string | undefined;
      const sortBy = (req.query.sortBy as string) || 'timestamp';
      const sortOrder = (req.query.sortOrder as string) || 'DESC';

      const offset = (page - 1) * pageSize;

      // Build query
      let query = 'SELECT * FROM atomic_units WHERE 1=1';
      const params: any[] = [];

      if (type) {
        query += ' AND type = ?';
        params.push(type);
      }

      if (category) {
        query += ' AND category = ?';
        params.push(category);
      }

      if (searchQuery) {
        query += ' AND (title LIKE ? OR content LIKE ?)';
        const searchTerm = `%${searchQuery}%`;
        params.push(searchTerm, searchTerm);
      }

      // Get total count
      const countResult = db['db'].prepare(`
        SELECT COUNT(*) as count FROM atomic_units WHERE 1=1
        ${type ? ' AND type = ?' : ''}
        ${category ? ' AND category = ?' : ''}
        ${searchQuery ? ' AND (title LIKE ? OR content LIKE ?)' : ''}
      `).get(...params) as { count: number };

      const total = countResult.count;

      // Get paginated results
      query += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
      params.push(pageSize, offset);

      const units = db['db'].prepare(query).all(...params) as AtomicUnit[];

      res.json({
        success: true,
        data: units.map(unit => formatForRequest(req, unit)),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
        timestamp: new Date().toISOString(),
      } as PaginatedResponse<any>);

      logger.info(`Listed units: page=${page}, pageSize=${pageSize}, total=${total}`);
    })
  );

  /**
   * GET /api/units/:id
   * Get a specific atomic unit by ID
   */
  router.get(
    '/units/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;

      const unit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(id) as AtomicUnit | undefined;

      if (!unit) {
        throw new AppError(`Unit not found: ${id}`, 'NOT_FOUND', 404);
      }

      res.json({
        success: true,
        data: formatForRequest(req, unit),
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug(`Retrieved unit: ${id}`);
    })
  );

  /**
   * POST /api/units
   * Create a new atomic unit
   */
  router.post(
    '/units',
    asyncHandler(async (req: Request, res: Response) => {
      const { type, title, content, context, category, tags, keywords, conversationId } = req.body;

      // Validation
      if (!type || !['insight', 'code', 'question', 'reference', 'decision'].includes(type)) {
        throw new AppError('Invalid unit type', 'INVALID_TYPE', 400, { type });
      }

      if (!title || typeof title !== 'string' || title.length === 0) {
        throw new AppError('Title is required', 'MISSING_TITLE', 400);
      }

      if (!content || typeof content !== 'string' || content.length === 0) {
        throw new AppError('Content is required', 'MISSING_CONTENT', 400);
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      db['db'].prepare(`
        INSERT INTO atomic_units (
          id, type, title, content, context, category, tags, keywords, conversation_id, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        type,
        title,
        content,
        context || null,
        category || 'general',
        JSON.stringify(tags || []),
        JSON.stringify(keywords || []),
        conversationId || null,
        now
      );

      const unit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(id) as AtomicUnit;

      res.status(201).json({
        success: true,
        data: formatForRequest(req, unit),
        timestamp: now,
      } as ApiSuccessResponse<any>);

      logger.info(`Created unit: ${id}`, { type, title });
    })
  );

  /**
   * PUT /api/units/:id
   * Update an atomic unit
   */
  router.put(
    '/units/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const { type, title, content, context, category, tags, keywords } = req.body;

      // Check if unit exists
      const existing = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(id) as AtomicUnit | undefined;
      if (!existing) {
        throw new AppError(`Unit not found: ${id}`, 'NOT_FOUND', 404);
      }

      // Build update query
      const updates: string[] = [];
      const values: any[] = [];

      if (type !== undefined) {
        if (!['insight', 'code', 'question', 'reference', 'decision'].includes(type)) {
          throw new AppError('Invalid unit type', 'INVALID_TYPE', 400, { type });
        }
        updates.push('type = ?');
        values.push(type);
      }

      if (title !== undefined) {
        if (typeof title !== 'string' || title.length === 0) {
          throw new AppError('Title must be a non-empty string', 'INVALID_TITLE', 400);
        }
        updates.push('title = ?');
        values.push(title);
      }

      if (content !== undefined) {
        if (typeof content !== 'string' || content.length === 0) {
          throw new AppError('Content must be a non-empty string', 'INVALID_CONTENT', 400);
        }
        updates.push('content = ?');
        values.push(content);
      }

      if (context !== undefined) {
        updates.push('context = ?');
        values.push(context);
      }

      if (category !== undefined) {
        updates.push('category = ?');
        values.push(category);
      }

      if (tags !== undefined) {
        updates.push('tags = ?');
        values.push(JSON.stringify(tags));
      }

      if (keywords !== undefined) {
        updates.push('keywords = ?');
        values.push(JSON.stringify(keywords));
      }

      if (updates.length === 0) {
        throw new AppError('No fields to update', 'NO_UPDATES', 400);
      }

      values.push(id);

      db['db'].prepare(`
        UPDATE atomic_units SET ${updates.join(', ')} WHERE id = ?
      `).run(...values);

      const unit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(id) as AtomicUnit;

      res.json({
        success: true,
        data: formatForRequest(req, unit),
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.info(`Updated unit: ${id}`, { updates: updates.length });
    })
  );

  /**
   * DELETE /api/units/:id
   * Delete an atomic unit
   */
  router.delete(
    '/units/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;

      const unit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(id) as AtomicUnit | undefined;
      if (!unit) {
        throw new AppError(`Unit not found: ${id}`, 'NOT_FOUND', 404);
      }

      // Delete related tags
      db['db'].prepare('DELETE FROM unit_tags WHERE unit_id = ?').run(id);

      // Delete unit
      db['db'].prepare('DELETE FROM atomic_units WHERE id = ?').run(id);

      res.json({
        success: true,
        data: { id, deleted: true },
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.info(`Deleted unit: ${id}`);
    })
  );

  /**
   * GET /api/units/:id/tags
   * Get tags for a unit
   */
  router.get(
    '/units/:id/tags',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;

      const unit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(id);
      if (!unit) {
        throw new AppError(`Unit not found: ${id}`, 'NOT_FOUND', 404);
      }

      const tags = db['db'].prepare(`
        SELECT t.id, t.name FROM tags t
        JOIN unit_tags ut ON t.id = ut.tag_id
        WHERE ut.unit_id = ?
      `).all(id) as Array<{ id: number; name: string }>;

      res.json({
        success: true,
        data: tags,
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug(`Retrieved tags for unit: ${id}`);
    })
  );

  /**
   * POST /api/units/:id/tags
   * Add tags to a unit
   */
  router.post(
    '/units/:id/tags',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const { tags: tagNames } = req.body;

      if (!Array.isArray(tagNames) || tagNames.length === 0) {
        throw new AppError('Tags must be a non-empty array', 'INVALID_TAGS', 400);
      }

      const unit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(id);
      if (!unit) {
        throw new AppError(`Unit not found: ${id}`, 'NOT_FOUND', 404);
      }

      const addedTags = [];

      for (const tagName of tagNames) {
        if (typeof tagName !== 'string' || tagName.length === 0) {
          continue;
        }

        // Get or create tag
        let tag = db['db'].prepare('SELECT * FROM tags WHERE name = ?').get(tagName) as { id: number } | undefined;
        if (!tag) {
          db['db'].prepare('INSERT INTO tags (name) VALUES (?)').run(tagName);
          tag = db['db'].prepare('SELECT * FROM tags WHERE name = ?').get(tagName) as { id: number };
        }

        // Add unit_tag relationship if not already exists
        const existing = db['db'].prepare('SELECT * FROM unit_tags WHERE unit_id = ? AND tag_id = ?').get(id, tag.id);
        if (!existing) {
          db['db'].prepare('INSERT INTO unit_tags (unit_id, tag_id) VALUES (?, ?)').run(id, tag.id);
          addedTags.push(tagName);
        }
      }

      res.json({
        success: true,
        data: { unitId: id, addedTags },
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.info(`Added ${addedTags.length} tags to unit: ${id}`);
    })
  );

  /**
   * GET /api/units/search
   * Full-text search across units
   */
  router.get(
    '/search',
    asyncHandler(async (req: Request, res: Response) => {
      const query = req.query.q as string;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));

      if (!query || query.length === 0) {
        throw new AppError('Search query is required', 'MISSING_QUERY', 400);
      }

      const offset = (page - 1) * pageSize;
      const searchTerm = `%${query}%`;

      const total = (db['db'].prepare(`
        SELECT COUNT(*) as count FROM atomic_units
        WHERE title LIKE ? OR content LIKE ?
      `).get(searchTerm, searchTerm) as { count: number }).count;

      const results = db['db'].prepare(`
        SELECT * FROM atomic_units
        WHERE title LIKE ? OR content LIKE ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `).all(searchTerm, searchTerm, pageSize, offset) as AtomicUnit[];

      res.json({
        success: true,
        data: results.map(unit => formatForRequest(req, unit)),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
        timestamp: new Date().toISOString(),
      } as PaginatedResponse<any>);

      logger.debug(`Full-text search: "${query}", results=${results.length}`);
    })
  );

  /**
   * GET /api/stats
   * Get database statistics
   */
  router.get(
    '/stats',
    asyncHandler(async (req: Request, res: Response) => {
      const unitCount = (db['db'].prepare('SELECT COUNT(*) as count FROM atomic_units').get() as { count: number }).count;
      const tagCount = (db['db'].prepare('SELECT COUNT(*) as count FROM tags').get() as { count: number }).count;
      const conversationCount = (db['db'].prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number }).count;

      const typeDistribution = db['db'].prepare(`
        SELECT type, COUNT(*) as count FROM atomic_units GROUP BY type
      `).all() as Array<{ type: string; count: number }>;

      const categoryDistribution = db['db'].prepare(`
        SELECT category, COUNT(*) as count FROM atomic_units GROUP BY category
      `).all() as Array<{ category: string; count: number }>;

      res.json({
        success: true,
        data: {
          units: unitCount,
          tags: tagCount,
          conversations: conversationCount,
          typeDistribution: Object.fromEntries(typeDistribution.map(t => [t.type, t.count])),
          categoryDistribution: Object.fromEntries(categoryDistribution.map(c => [c.category, c.count])),
        },
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug('Requested database statistics');
    })
  );

  /**
   * GET /api/health
   * Health check endpoint
   */
  router.get(
    '/health',
    asyncHandler(async (req: Request, res: Response) => {
      res.json({
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        },
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);
    })
  );

  /**
   * POST /api/units/batch
   * Batch create multiple units
   */
  router.post(
    '/units/batch',
    asyncHandler(async (req: Request, res: Response) => {
      const { units } = req.body;

      if (!Array.isArray(units) || units.length === 0) {
        throw new AppError('Units must be a non-empty array', 'INVALID_UNITS', 400);
      }

      const created = [];
      const errors = [];

      for (let i = 0; i < units.length; i++) {
        try {
          const { type, title, content, context, category, tags, keywords, conversationId } = units[i];

          if (!type || !['insight', 'code', 'question', 'reference', 'decision'].includes(type)) {
            errors.push({ index: i, error: 'Invalid unit type', code: 'INVALID_TYPE' });
            continue;
          }

          if (!title || typeof title !== 'string' || title.length === 0) {
            errors.push({ index: i, error: 'Title is required', code: 'MISSING_TITLE' });
            continue;
          }

          if (!content || typeof content !== 'string' || content.length === 0) {
            errors.push({ index: i, error: 'Content is required', code: 'MISSING_CONTENT' });
            continue;
          }

          const id = randomUUID();
          const now = new Date().toISOString();

          db['db'].prepare(`
            INSERT INTO atomic_units (
              id, type, title, content, context, category, tags, keywords, conversation_id, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            type,
            title,
            content,
            context || null,
            category || 'general',
            JSON.stringify(tags || []),
            JSON.stringify(keywords || []),
            conversationId || null,
            now
          );

          const unit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(id) as AtomicUnit;
          created.push(formatForRequest(req, unit));
        } catch (e) {
          errors.push({ index: i, error: (e instanceof Error ? e.message : String(e)), code: 'PROCESSING_ERROR' });
        }
      }

      res.status(201).json({
        success: errors.length === 0,
        data: {
          created: created.length,
          errors: errors.length,
          units: created,
          failedIndexes: errors,
        },
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.info(`Batch created units: success=${created.length}, errors=${errors.length}`);
    })
  );

  /**
   * GET /api/units/:id/related
   * Get units related to a specific unit
   */
  router.get(
    '/units/:id/related',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));

      const unit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(id);
      if (!unit) {
        throw new AppError(`Unit not found: ${id}`, 'NOT_FOUND', 404);
      }

      // Get related units from unit_relationships table
      const relatedUnits = db['db'].prepare(`
        SELECT u.*, ur.relationship_type FROM atomic_units u
        JOIN unit_relationships ur ON u.id = ur.to_unit
        WHERE ur.from_unit = ?
        LIMIT ?
      `).all(id, limit) as Array<AtomicUnit & { relationship_type: string }>;

      const formatted = relatedUnits.map(u => ({
        ...formatForRequest(req, u),
        relationshipType: u.relationship_type,
      }));

      res.json({
        success: true,
        data: formatted,
        pagination: {
          total: formatted.length,
          limit,
        },
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug(`Retrieved ${formatted.length} related units for: ${id}`);
    })
  );

  /**
   * DELETE /api/units/:id/tags/:tag
   * Remove a specific tag from a unit
   */
  router.delete(
    '/units/:id/tags/:tag',
    asyncHandler(async (req: Request, res: Response) => {
      const { id, tag } = req.params;

      const unit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(id);
      if (!unit) {
        throw new AppError(`Unit not found: ${id}`, 'NOT_FOUND', 404);
      }

      const tagRecord = db['db'].prepare('SELECT id FROM tags WHERE name = ?').get(tag) as { id: number } | undefined;
      if (!tagRecord) {
        throw new AppError(`Tag not found: ${tag}`, 'NOT_FOUND', 404);
      }

      db['db'].prepare('DELETE FROM unit_tags WHERE unit_id = ? AND tag_id = ?').run(id, tagRecord.id);

      res.json({
        success: true,
        data: { unitId: id, removedTag: tag },
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.info(`Removed tag "${tag}" from unit: ${id}`);
    })
  );

  /**
   * GET /api/categories
   * List all available categories
   */
  router.get(
    '/categories',
    asyncHandler(async (req: Request, res: Response) => {
      const categories = db['db'].prepare(`
        SELECT DISTINCT category, COUNT(*) as count FROM atomic_units
        WHERE category IS NOT NULL
        GROUP BY category
        ORDER BY count DESC
      `).all() as Array<{ category: string; count: number }>;

      res.json({
        success: true,
        data: categories,
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug(`Listed categories: count=${categories.length}`);
    })
  );

  /**
   * GET /api/units/by-category/:category
   * Get units by category
   */
  router.get(
    '/units/by-category/:category',
    asyncHandler(async (req: Request, res: Response) => {
      const { category } = req.params;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));

      const offset = (page - 1) * pageSize;

      const total = (db['db'].prepare(`
        SELECT COUNT(*) as count FROM atomic_units WHERE category = ?
      `).get(category) as { count: number }).count;

      const units = db['db'].prepare(`
        SELECT * FROM atomic_units
        WHERE category = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `).all(category, pageSize, offset) as AtomicUnit[];

      res.json({
        success: true,
        data: units.map(unit => formatForRequest(req, unit)),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
        timestamp: new Date().toISOString(),
      } as PaginatedResponse<any>);

      logger.info(`Retrieved units by category: ${category}, count=${units.length}`);
    })
  );

  /**
   * GET /api/search/analytics
   * Get search analytics and popular queries
   */
  router.get(
    '/search/analytics',
    asyncHandler(async (req: Request, res: Response) => {
      const period = (req.query.period as string) || '7days';
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));

      // Get popular queries from analytics tracker
      const popularQueries = analyticsTracker.getTopQueries(limit);
      const searchTypes = analyticsTracker.getSearchTypeStats();
      const avgLatency = analyticsTracker.getAverageLatency();
      const topResults = analyticsTracker.getTopResults(limit);

      res.json({
        success: true,
        data: {
          period,
          popularQueries,
          searchTypeStats: searchTypes,
          averageLatency: avgLatency,
          topResultedQueries: topResults,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug('Retrieved search analytics');
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
        details: err.context,
      } as ApiErrorResponse);
    } else {
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        statusCode: 500,
      } as ApiErrorResponse);
    }
  });

  // Mount Phase 3 Intelligence API router
  const intelligenceRouter = createIntelligenceRouter(db);
  router.use('/intelligence', intelligenceRouter);

  return router;
}

/**
 * Format atomic unit for API response
 */
function formatUnit(unit: AtomicUnit, options?: { includeSensitive?: boolean }): Record<string, any> {
  const record: Record<string, any> = {
    id: unit.id,
    type: unit.type,
    title: unit.title,
    content: unit.content,
    context: unit.context,
    category: unit.category,
    tags: typeof unit.tags === 'string' ? JSON.parse(unit.tags) : unit.tags,
    keywords: typeof unit.keywords === 'string' ? JSON.parse(unit.keywords) : unit.keywords,
    conversationId: unit.conversationId,
    timestamp: unit.timestamp,
  };

  if (options?.includeSensitive === false) {
    delete record.context;
    delete record.keywords;
    delete record.conversationId;
  }

  return record;
}

/**
 * Express middleware factory to attach API to app
 */
export function setupApi(app: express.Application, db: KnowledgeDatabase): void {
  const apiRouter = createApiRouter(db);
  app.use('/api', apiRouter);

  logger.info('REST API endpoints configured');
}
