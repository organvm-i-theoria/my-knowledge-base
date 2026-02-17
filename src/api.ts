/**
 * REST API endpoints for knowledge base
 * Provides comprehensive CRUD operations on atomic units + Phase 2 search
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { KnowledgeDatabase } from './database.js';
import { logger, AppError } from './logger.js';
import { AtomicUnit, EntityRelationship } from './types.js';
import { getConfig, normalizeSearchPolicy, SearchPolicy } from './config.js';
import { AuthService, createAuthMiddleware } from './auth.js';
import { FilterBuilder } from './filter-builder.js';
import { SearchCache } from './search-cache.js';
import { SearchAnalyticsTracker } from './analytics/search-analytics.js';
import { QuerySuggestionEngine } from './analytics/query-suggestions.js';
import { FilterPresetManager } from './filter-presets.js';
import { HybridSearch, HybridSearchResult } from './hybrid-search.js';
import { createIntelligenceRouter } from './api-intelligence.js';
import { AuditLogger } from './audit-log.js';
import { FederatedIndexer } from './federation/indexer.js';
import { FederatedScanQueue } from './federation/scan-queue.js';
import { FederatedSourceRegistry } from './federation/source-registry.js';
import { FederatedSearchService } from './federation/search.js';
import { FederatedScanJobStatus, UpdateFederatedSourceInput } from './federation/types.js';
import { UniverseStore } from './universe/store.js';
import { createUniverseRouter } from './universe/api.js';
import {
  formatUnit,
  parseIntParam,
  parseIsoDateParam,
  parseSortOrder,
  parseUnitSortField,
  parseWeightParam,
} from './api-utils.js';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  DatabaseStatsPayload,
  FederatedScanJob as FederatedScanJobDto,
  FederatedScanRun as FederatedScanRunDto,
  FederatedSearchHit as FederatedSearchHitDto,
  FederatedSource as FederatedSourceDto,
  OffsetListResponse,
  PaginatedResponse,
  SearchFallbackReason,
  SearchResponse,
  UnitBranchResponse,
} from './api-types.js';

/**
 * Create REST API router
 */
export function createApiRouter(db: KnowledgeDatabase): Router {
  const router = Router();

  const authEnabled = process.env.ENABLE_AUTH === 'true';
  const authService = authEnabled
    ? new AuthService(process.env.JWT_SECRET, { requireSecret: true })
    : null;
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
        meta: (req as any).auditMeta,
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
  const dbHandle = db.getRawHandle();
  const analyticsTracker = new SearchAnalyticsTracker(dbHandle);
  const suggestionEngine = new QuerySuggestionEngine(dbHandle);
  const presetManager = new FilterPresetManager('./db/filter-presets.json');
  const federatedSourceRegistry = new FederatedSourceRegistry(dbHandle);
  const federatedIndexer = new FederatedIndexer(dbHandle, federatedSourceRegistry);
  const federatedScanQueue = new FederatedScanQueue(federatedIndexer, federatedSourceRegistry, {
    concurrency: Math.max(1, Number.parseInt(process.env.FEDERATION_SCAN_CONCURRENCY ?? '1', 10) || 1),
  });
  const federatedSearch = new FederatedSearchService(dbHandle);
  const universeStore = new UniverseStore(dbHandle);
  const federationAllowedRoots = (process.env.FEDERATION_ALLOWED_ROOTS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => resolve(entry));
  const federationAllowedExtensions = (process.env.FEDERATION_ALLOWED_EXTENSIONS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .map((entry) => (entry.startsWith('.') ? entry : `.${entry}`));
  const appConfig = getConfig().getAll();
  const semanticPolicy: SearchPolicy = normalizeSearchPolicy(
    process.env.KB_SEARCH_SEMANTIC_POLICY ?? appConfig.search?.semanticPolicy,
    'degrade'
  );
  const hybridPolicy: SearchPolicy = normalizeSearchPolicy(
    process.env.KB_SEARCH_HYBRID_POLICY ?? appConfig.search?.hybridPolicy,
    'degrade'
  );
  let hybridSearch: HybridSearch | null = null;
  
  try {
    hybridSearch = new HybridSearch(db, './atomized/embeddings/chroma');
  } catch (e) {
    // Semantic search not available (embeddings/ChromaDB not initialized)
  }

  // Error handling middleware
  const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

  const assertFederationAccess = (
    req: Request,
    allowedRoles: Array<'viewer' | 'editor' | 'admin' | 'api_client'> = ['viewer', 'editor', 'admin']
  ): void => {
    if (!authEnabled) {
      return;
    }

    const authContext = (req as any).authContext;
    if (!authContext?.isAuthenticated) {
      throw new AppError('Authentication required', 'AUTH_REQUIRED', 401);
    }

    const roles = authContext?.user?.roles as string[] | undefined;
    if (!roles || !roles.some((role) => allowedRoles.includes(role as (typeof allowedRoles)[number]))) {
      throw new AppError('Forbidden', 'ROLE_REQUIRED', 403, { required: allowedRoles });
    }
  };

  const assertRootPathAllowed = (rootPath: string): void => {
    if (federationAllowedRoots.length === 0) {
      return;
    }
    const normalized = resolve(rootPath);
    const isAllowed = federationAllowedRoots.some(
      (allowedRoot) => normalized === allowedRoot || normalized.startsWith(`${allowedRoot}/`)
    );
    if (!isAllowed) {
      throw new AppError('rootPath is outside allowed federation roots', 'FEDERATION_ROOT_NOT_ALLOWED', 403, {
        rootPath: normalized,
      });
    }
  };

  const runFtsSearch = (
    query: string,
    page: number,
    pageSize: number
  ): { results: AtomicUnit[]; total: number; offset: number } => {
    const offset = (page - 1) * pageSize;

    if (query.length === 0) {
      const total = (dbHandle.prepare('SELECT COUNT(*) as count FROM atomic_units').get() as { count: number }).count;
      const results = dbHandle.prepare(`
        SELECT * FROM atomic_units
        ORDER BY created DESC
        LIMIT ? OFFSET ?
      `).all(pageSize, offset) as AtomicUnit[];
      return { results, total, offset };
    }

    try {
      const searchResult = db.searchTextPaginated(query, offset, pageSize);
      return {
        results: searchResult.results,
        total: searchResult.total,
        offset,
      };
    } catch {
      const searchTerm = `%${query}%`;
      const total = (dbHandle.prepare(`
        SELECT COUNT(*) as count FROM atomic_units
        WHERE title LIKE ? OR content LIKE ?
      `).get(searchTerm, searchTerm) as { count: number }).count;
      const results = dbHandle.prepare(`
        SELECT * FROM atomic_units
        WHERE title LIKE ? OR content LIKE ?
        ORDER BY created DESC
        LIMIT ? OFFSET ?
      `).all(searchTerm, searchTerm, pageSize, offset) as AtomicUnit[];

      return { results, total, offset };
    }
  };

  const classifySearchFallbackReason = (
    error: unknown,
    unavailableReason: Extract<SearchFallbackReason, 'semantic_unavailable' | 'hybrid_unavailable'>
  ): SearchFallbackReason => {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    const unavailableSignals = [
      'collection not initialized',
      'could not connect to tenant',
      'failed to parse url',
      'api key',
      'unauthorized',
      'ecconnrefused',
      'fetch failed',
      'network',
      'active vector profile mismatch',
      'embedding dimension mismatch',
      'profile mismatch',
    ];

    if (unavailableSignals.some(signal => message.includes(signal))) {
      return unavailableReason;
    }

    return 'runtime_error';
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
      const cacheKey = searchCache.generateKey({ query, searchType: 'fts', limit: pageSize, page });
      let cacheHit = false;
      let cached = searchCache.get(cacheKey);

      if (cached && !includeFacets) {
        cacheHit = true;
        res.json({
          success: true,
          data: cached.results,
          results: cached.results,
          count: cached.results?.length || 0,
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

      const { results, total, offset } = runFtsSearch(query, page, pageSize);

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
        results: results.map(unit => formatForRequest(req, unit)),
        count: results.length,
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
      const offset = (page - 1) * pageSize;
      const fetchLimit = page * pageSize;

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

      const vectorProfileId = hybridSearch?.getVectorProfileId();
      let results: AtomicUnit[] = [];
      let fallbackReason: SearchFallbackReason | undefined;
      let degradedMode = false;
      let semanticFailure = false;
      if (hybridSearch) {
        try {
          const hybridResults = await hybridSearch.search(query, fetchLimit, { fts: 0.2, semantic: 0.8 });
          results = hybridResults.map(r => r.unit);
        } catch (error) {
          semanticFailure = true;
          degradedMode = true;
          fallbackReason = classifySearchFallbackReason(error, 'semantic_unavailable');
          if (semanticPolicy === 'strict') {
            throw new AppError('Semantic search backend is not available', 'SEMANTIC_SEARCH_UNAVAILABLE', 503, {
              policy: semanticPolicy,
              fallbackReason,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          logger.warn('Semantic search failed, falling back to FTS');
        }
      } else {
        semanticFailure = true;
        degradedMode = true;
        fallbackReason = 'semantic_unavailable';
        if (semanticPolicy === 'strict') {
          throw new AppError('Semantic search backend is not available', 'SEMANTIC_SEARCH_UNAVAILABLE', 503, {
            policy: semanticPolicy,
            fallbackReason,
          });
        }
      }

      if (results.length === 0 && !semanticFailure && semanticPolicy === 'degrade') {
        degradedMode = true;
        fallbackReason = 'no_semantic_results';
        results = db.searchTextPaginated(query, 0, fetchLimit).results;
      }

      if (results.length === 0 && semanticFailure && semanticPolicy === 'degrade') {
        results = db.searchTextPaginated(query, 0, fetchLimit).results;
      }

      if (type) {
        results = results.filter(unit => unit.type === type);
      }
      if (category) {
        results = results.filter(unit => unit.category === category);
      }

      const total = results.length;
      const pagedResults = results
        .slice(offset, offset + pageSize)
        .map(unit => formatForRequest(req, unit));

      // Get facets
      const categoryFacets = db.getCategoryFacets(whereClause, params);
      const typeFacets = db.getTypeFacets(whereClause, params);

      res.json({
        success: true,
        data: pagedResults,
        results: pagedResults,
        count: pagedResults.length,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          offset: (page - 1) * pageSize,
        },
        query: {
          original: query,
          normalized: query.toLowerCase(),
          degradedMode: degradedMode ? true : undefined,
          fallbackReason,
          searchPolicyApplied: semanticPolicy,
          vectorProfileId,
        },
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
      const source = req.query.source as string | undefined;
      const format = req.query.format as string | undefined;

      if (!query || query.length === 0) {
        throw new AppError('Search query is required', 'MISSING_QUERY', 400);
      }

      const startTime = Date.now();

      // Check cache
      const cacheKey = searchCache.generateKey({
        query,
        searchType: 'hybrid',
        weights: { fts: ftsWeight, semantic: semanticWeight },
        page,
        limit: pageSize,
        // Note: We should include filters in cache key, but for now we'll skip caching if filters are present
        // or just append them to the key in a simple way if we wanted to be robust.
      });
      const vectorProfileId = hybridSearch?.getVectorProfileId();
      // Skip cache if filtering (simplification)
      const cached = (!source && !format) ? searchCache.get(cacheKey) : null;

      if (cached && !includeFacets) {
        res.json({
          success: true,
          data: cached.results,
          results: cached.results,
          count: cached.results?.length || 0,
          pagination: {
            page,
            pageSize,
            total: cached.total || 0,
            totalPages: Math.ceil((cached.total || 0) / pageSize),
            offset: (page - 1) * pageSize,
          },
          query: {
            original: query,
            normalized: query.toLowerCase(),
            searchPolicyApplied: hybridPolicy,
            vectorProfileId,
          },
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
      let fallbackReason: SearchFallbackReason | undefined;
      let degradedMode = false;
      let hybridFailure = false;
      const offset = (page - 1) * pageSize;
      const fetchLimit = page * pageSize;

      if (hybridSearch) {
        try {
          const hybridResults = await hybridSearch.search(
            query,
            fetchLimit,
            { fts: ftsWeight, semantic: semanticWeight },
            { source, format }
          );
          results = hybridResults.map(r => r.unit);
        } catch (error) {
          hybridFailure = true;
          degradedMode = true;
          fallbackReason = classifySearchFallbackReason(error, 'hybrid_unavailable');
          if (hybridPolicy === 'strict') {
            throw new AppError('Hybrid search backend is not available', 'HYBRID_SEARCH_UNAVAILABLE', 503, {
              policy: hybridPolicy,
              fallbackReason,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          logger.warn('Hybrid search failed, falling back to FTS');
        }
      } else {
        hybridFailure = true;
        degradedMode = true;
        fallbackReason = 'hybrid_unavailable';
        if (hybridPolicy === 'strict') {
          throw new AppError('Hybrid search backend is not available', 'HYBRID_SEARCH_UNAVAILABLE', 503, {
            policy: hybridPolicy,
            fallbackReason,
          });
        }
      }

      if (results.length === 0 && !hybridFailure && hybridPolicy === 'degrade') {
        degradedMode = true;
        fallbackReason = 'no_hybrid_results';
        // Fallback to FTS only
        const searchTerm = `%${query}%`;
        results = dbHandle.prepare(`
          SELECT * FROM atomic_units
          WHERE title LIKE ? OR content LIKE ?
          ORDER BY created DESC
          LIMIT ?
        `).all(searchTerm, searchTerm, fetchLimit) as AtomicUnit[];
      }

      if (results.length === 0 && hybridFailure && hybridPolicy === 'degrade') {
        // Fallback to FTS only
        const searchTerm = `%${query}%`;
        results = dbHandle.prepare(`
          SELECT * FROM atomic_units
          WHERE title LIKE ? OR content LIKE ?
          ORDER BY created DESC
          LIMIT ?
        `).all(searchTerm, searchTerm, fetchLimit) as AtomicUnit[];
      }

      const total = results.length;
      const pagedResults = results
        .slice(offset, offset + pageSize)
        .map(unit => formatForRequest(req, unit));

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
        data: pagedResults,
        results: pagedResults,
        count: pagedResults.length,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          offset: (page - 1) * pageSize,
        },
        query: {
          original: query,
          normalized: query.toLowerCase(),
          degradedMode: degradedMode ? true : undefined,
          fallbackReason,
          searchPolicyApplied: hybridPolicy,
          vectorProfileId,
        },
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
        suggestions: suggestions.map((item) => item.text),
        count: suggestions.length,
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
      const sortBy = parseUnitSortField(req.query.sortBy as string | undefined);
      const sortOrder = parseSortOrder(req.query.sortOrder as string | undefined);

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
      const formattedUnits = units.map(unit => formatForRequest(req, unit));

      res.json({
        success: true,
        data: formattedUnits,
        units: formattedUnits,
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
        ...formatForRequest(req, unit),
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
        tags: tags.map((tag) => tag.name),
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

      const currentTags = (db['db'].prepare(`
        SELECT t.name FROM tags t
        JOIN unit_tags ut ON t.id = ut.tag_id
        WHERE ut.unit_id = ?
      `).all(id) as Array<{ name: string }>).map((row) => row.name);

      res.json({
        success: true,
        data: { unitId: id, addedTags, tags: currentTags },
        tags: currentTags,
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.info(`Added ${addedTags.length} tags to unit: ${id}`);
    })
  );

  /**
   * GET /api/search/fts
   * Legacy FTS endpoint maintained for UI compatibility
   */
  router.get(
    '/search/fts',
    asyncHandler(async (req: Request, res: Response) => {
      const queryParam = req.query.q;
      if (queryParam === undefined) {
        throw new AppError('Search query is required', 'MISSING_QUERY', 400);
      }
      const query = String(queryParam);
      const page = parseIntParam(req.query.page as string | undefined, 'page', 1, 1, 10000);
      const pageSizeInput = (req.query.limit as string | undefined) ?? (req.query.pageSize as string | undefined);
      const pageSize = parseIntParam(pageSizeInput, 'pageSize', 20, 1, 100);
      const startTime = Date.now();

      const { results, total, offset } = runFtsSearch(query, page, pageSize);

      res.json({
        success: true,
        data: results.map(unit => formatForRequest(req, unit)),
        results: results.map(unit => formatForRequest(req, unit)),
        count: results.length,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          offset,
        },
        query: { original: query, normalized: query.toLowerCase() },
        searchTime: Math.max(1, Date.now() - startTime),
        timestamp: new Date().toISOString(),
      } as SearchResponse<any>);

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
      const stats = db.getStats();
      const categoryDistribution = dbHandle.prepare(`
        SELECT category, COUNT(*) as count FROM atomic_units GROUP BY category
      `).all() as Array<{ category: string; count: number }>;
      const sourceStats = dbHandle.prepare(`
        SELECT json_extract(metadata, '$.sourceName') as source, COUNT(*) as count
        FROM documents
        GROUP BY source
      `).all() as Array<{ source: string | null; count: number }>;

      const payload: DatabaseStatsPayload = {
        units: stats.totalUnits.count,
        tags: stats.totalTags.count,
        conversations: stats.totalConversations.count,
        documents: stats.totalDocuments.count,
        typeDistribution: Object.fromEntries(stats.unitsByType.map((row) => [row.type, row.count])),
        categoryDistribution: Object.fromEntries(categoryDistribution.map((row) => [row.category, row.count])),
        totalUnits: stats.totalUnits,
        totalConversations: stats.totalConversations,
        totalDocuments: stats.totalDocuments,
        totalTags: stats.totalTags,
        unitsByType: stats.unitsByType,
        sourceStats,
      };

      res.json({
        success: true,
        data: payload,
        ...payload,
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<DatabaseStatsPayload>);

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
      const vectorProfileId = hybridSearch?.getVectorProfileId();
      const strictPoliciesEnabled = semanticPolicy === 'strict' || hybridPolicy === 'strict';
      const strictReady = strictPoliciesEnabled ? Boolean(hybridSearch && vectorProfileId) : Boolean(hybridSearch);
      const payload = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        servicesReady: !!process.env.OPENAI_API_KEY,
        hasOpenAI: !!process.env.OPENAI_API_KEY,
        hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
        version: process.env.npm_package_version || '1.0.0',
        readiness: {
          searchPolicies: {
            semantic: semanticPolicy,
            hybrid: hybridPolicy,
          },
          search: {
            strictReady,
            vectorProfileId: vectorProfileId || null,
          },
        },
      };
      res.json({
        success: true,
        data: payload,
        ...payload,
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
   * GET /api/units/:id/branches
   * Traverse typed relationships in branching columns using BFS.
   */
  router.get(
    '/units/:id/branches',
    asyncHandler(async (req: Request, res: Response) => {
      type BranchDirection = 'out' | 'in' | 'both';
      type BranchEdgeDirection = 'out' | 'in';
      type RelationshipRow = {
        fromUnitId: string;
        toUnitId: string;
        relationshipType: string;
        source: string | null;
        confidence: number | null;
        explanation: string | null;
        createdAt: string | null;
        direction: BranchEdgeDirection;
      };
      type BranchUnitSummary = {
        id: string;
        title: string;
        type: string;
        category: string;
      };

      const { id } = req.params;
      const depth = parseIntParam(req.query.depth as string | undefined, 'depth', 3, 1, 4);
      const limitPerNode = parseIntParam(
        req.query.limitPerNode as string | undefined,
        'limitPerNode',
        12,
        1,
        25
      );
      const directionRaw = String(req.query.direction || 'out').toLowerCase();
      if (!['out', 'in', 'both'].includes(directionRaw)) {
        throw new AppError('Invalid direction', 'INVALID_PARAMETER', 400, {
          allowedDirection: ['out', 'in', 'both'],
        });
      }
      const direction = directionRaw as BranchDirection;
      const relationshipTypeParam = Array.isArray(req.query.relationshipType)
        ? req.query.relationshipType.join(',')
        : (req.query.relationshipType as string | undefined);
      const relationshipTypes = (relationshipTypeParam || '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      const relationshipTypeFilter = relationshipTypes.length > 0 ? new Set(relationshipTypes) : null;

      const rootRow = dbHandle
        .prepare('SELECT id, title, type, category FROM atomic_units WHERE id = ?')
        .get(id) as BranchUnitSummary | undefined;
      if (!rootRow) {
        throw new AppError(`Unit not found: ${id}`, 'NOT_FOUND', 404);
      }

      const fetchDirectionalRelationships = (
        frontier: string[],
        edgeDirection: BranchEdgeDirection
      ): RelationshipRow[] => {
        if (frontier.length === 0) {
          return [];
        }

        const frontierPlaceholders = frontier.map(() => '?').join(', ');
        const column = edgeDirection === 'out' ? 'from_unit' : 'to_unit';
        const typeClause =
          relationshipTypes.length > 0
            ? ` AND relationship_type IN (${relationshipTypes.map(() => '?').join(', ')})`
            : '';
        const query = `
          SELECT
            from_unit as fromUnitId,
            to_unit as toUnitId,
            relationship_type as relationshipType,
            source,
            confidence,
            explanation,
            created_at as createdAt
          FROM unit_relationships
          WHERE ${column} IN (${frontierPlaceholders})
          ${typeClause}
        `;

        const rows = dbHandle
          .prepare(query)
          .all(
            ...frontier,
            ...(relationshipTypes.length > 0 ? relationshipTypes : [])
          ) as Array<{
          fromUnitId: string;
          toUnitId: string;
          relationshipType: string;
          source: string | null;
          confidence: number | null;
          explanation: string | null;
          createdAt: string | null;
        }>;

        return rows.map((row) => ({
          ...row,
          direction: edgeDirection,
        }));
      };

      const sortRelationships = (a: RelationshipRow, b: RelationshipRow): number => {
        const aConfidence = a.confidence ?? -1;
        const bConfidence = b.confidence ?? -1;
        if (bConfidence !== aConfidence) {
          return bConfidence - aConfidence;
        }

        const aCreatedAt = a.createdAt ? Date.parse(a.createdAt) : 0;
        const bCreatedAt = b.createdAt ? Date.parse(b.createdAt) : 0;
        if (bCreatedAt !== aCreatedAt) {
          return bCreatedAt - aCreatedAt;
        }

        if (a.relationshipType !== b.relationshipType) {
          return a.relationshipType.localeCompare(b.relationshipType);
        }

        const aNeighborId = a.direction === 'out' ? a.toUnitId : a.fromUnitId;
        const bNeighborId = b.direction === 'out' ? b.toUnitId : b.fromUnitId;
        if (aNeighborId !== bNeighborId) {
          return aNeighborId.localeCompare(bNeighborId);
        }

        return a.direction.localeCompare(b.direction);
      };

      const loadUnitSummaries = (ids: string[]): BranchUnitSummary[] => {
        if (ids.length === 0) {
          return [];
        }

        const placeholders = ids.map(() => '?').join(', ');
        const rows = dbHandle
          .prepare(
            `SELECT id, title, type, category FROM atomic_units WHERE id IN (${placeholders})`
          )
          .all(...ids) as BranchUnitSummary[];
        const byId = new Map(rows.map((row) => [row.id, row]));

        return ids
          .map((unitId) => byId.get(unitId))
          .filter((unit): unit is BranchUnitSummary => Boolean(unit));
      };

      const columns: UnitBranchResponse['columns'] = [
        {
          depth: 0,
          units: [rootRow],
        },
      ];
      const edges: UnitBranchResponse['edges'] = [];
      const edgeKeys = new Set<string>();
      const knownUnitIds = new Set<string>([rootRow.id]);
      const visited = new Set<string>([rootRow.id]);
      let frontier: string[] = [rootRow.id];
      let truncated = false;
      let filteredBackEdges = 0;

      for (let layer = 1; layer <= depth; layer++) {
        if (frontier.length === 0) {
          break;
        }

        const groupedByParent = new Map<string, RelationshipRow[]>();
        const candidates: RelationshipRow[] = [];

        if (direction === 'out' || direction === 'both') {
          candidates.push(...fetchDirectionalRelationships(frontier, 'out'));
        }
        if (direction === 'in' || direction === 'both') {
          candidates.push(...fetchDirectionalRelationships(frontier, 'in'));
        }

        for (const relationship of candidates) {
          if (
            relationshipTypeFilter &&
            !relationshipTypeFilter.has(relationship.relationshipType)
          ) {
            continue;
          }

          const parentId =
            relationship.direction === 'out'
              ? relationship.fromUnitId
              : relationship.toUnitId;
          if (!groupedByParent.has(parentId)) {
            groupedByParent.set(parentId, []);
          }
          groupedByParent.get(parentId)!.push(relationship);
        }

        const nextFrontierCandidateIds: string[] = [];
        const nextFrontierCandidateSet = new Set<string>();
        const layerEdges: Array<UnitBranchResponse['edges'][number] & { childId: string }> = [];

        for (const parentId of frontier) {
          const parentCandidates = groupedByParent.get(parentId) || [];
          parentCandidates.sort(sortRelationships);
          if (parentCandidates.length > limitPerNode) {
            truncated = true;
          }
          const selected = parentCandidates.slice(0, limitPerNode);

          for (const relationship of selected) {
            const childId =
              relationship.direction === 'out'
                ? relationship.toUnitId
                : relationship.fromUnitId;

            layerEdges.push({
              fromUnitId: relationship.fromUnitId,
              toUnitId: relationship.toUnitId,
              relationshipType: relationship.relationshipType,
              source: relationship.source || 'auto_detected',
              confidence: relationship.confidence,
              explanation: relationship.explanation,
              createdAt: relationship.createdAt,
              direction: relationship.direction,
              depth: layer,
              childId,
            });

            if (!visited.has(childId) && !nextFrontierCandidateSet.has(childId)) {
              nextFrontierCandidateSet.add(childId);
              nextFrontierCandidateIds.push(childId);
            }
          }
        }

        const nextUnits = loadUnitSummaries(nextFrontierCandidateIds);
        const nextUnitIds = nextUnits.map((unit) => unit.id);
        const nextUnitIdSet = new Set(nextUnitIds);

        for (const edge of layerEdges) {
          if (!nextUnitIdSet.has(edge.childId)) {
            filteredBackEdges += 1;
            continue;
          }

          const edgeKey = [
            edge.fromUnitId,
            edge.toUnitId,
            edge.relationshipType,
            edge.direction,
            edge.depth,
          ].join('|');

          if (edgeKeys.has(edgeKey)) {
            continue;
          }
          edgeKeys.add(edgeKey);
          edges.push({
            fromUnitId: edge.fromUnitId,
            toUnitId: edge.toUnitId,
            relationshipType: edge.relationshipType,
            source: edge.source,
            confidence: edge.confidence,
            explanation: edge.explanation,
            createdAt: edge.createdAt,
            direction: edge.direction,
            depth: edge.depth,
          });
        }

        if (nextUnits.length === 0) {
          break;
        }

        columns.push({
          depth: layer,
          units: nextUnits,
        });

        for (const unit of nextUnits) {
          visited.add(unit.id);
          knownUnitIds.add(unit.id);
        }

        frontier = nextUnitIds;
      }

      const payload: UnitBranchResponse = {
        root: rootRow,
        columns,
        edges,
        meta: {
          depth,
          direction,
          limitPerNode,
          relationshipTypes,
          truncated,
          filteredBackEdges,
          visitedCount: visited.size,
          edgeCount: edges.length,
        },
      };

      res.json({
        success: true,
        data: payload,
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<UnitBranchResponse>);

      logger.debug(
        `Branch traversal for ${id}: depth=${depth}, columns=${columns.length}, edges=${edges.length}`
      );
    })
  );

  /**
   * GET /api/units/:id/related
   * Get units related to a specific unit with full typed relationship metadata
   */
  router.get(
    '/units/:id/related',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
      const includeMetadata = req.query.metadata !== 'false'; // Default to true

      const unit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(id);
      if (!unit) {
        throw new AppError(`Unit not found: ${id}`, 'NOT_FOUND', 404);
      }

      // Get related units with typed relationship metadata
      const relatedUnits = db['db'].prepare(`
        SELECT
          u.*,
          ur.relationship_type,
          ur.source as relationship_source,
          ur.confidence as relationship_confidence,
          ur.explanation as relationship_explanation,
          ur.created_at as relationship_created_at
        FROM atomic_units u
        JOIN unit_relationships ur ON u.id = ur.to_unit
        WHERE ur.from_unit = ?
        ORDER BY ur.confidence DESC, ur.created_at DESC
        LIMIT ?
      `).all(id, limit) as Array<AtomicUnit & {
        relationship_type: string;
        relationship_source: string | null;
        relationship_confidence: number | null;
        relationship_explanation: string | null;
        relationship_created_at: string | null;
      }>;

      const formatted = relatedUnits.map(u => {
        const unitData = formatForRequest(req, u);

        // Include typed relationship metadata if requested
        if (includeMetadata) {
          return {
            ...unitData,
            relationship: {
              type: u.relationship_type || 'related',
              source: u.relationship_source || 'auto_detected',
              confidence: u.relationship_confidence,
              explanation: u.relationship_explanation,
              createdAt: u.relationship_created_at,
            },
          };
        }

        // Legacy format for backward compatibility
        return {
          ...unitData,
          relationshipType: u.relationship_type,
        };
      });

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
   * GET /api/units/:id/relationships
   * Get all typed relationships for a specific unit (both directions)
   */
  router.get(
    '/units/:id/relationships',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const direction = (req.query.direction as string) || 'both'; // 'from', 'to', 'both'
      const type = req.query.type as string | undefined;
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

      const unit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(id);
      if (!unit) {
        throw new AppError(`Unit not found: ${id}`, 'NOT_FOUND', 404);
      }

      // Build query based on direction
      let query = `
        SELECT
          from_unit as fromEntity,
          to_unit as toEntity,
          relationship_type as relationshipType,
          source,
          confidence,
          explanation,
          created_at as createdAt
        FROM unit_relationships
        WHERE
      `;
      const params: any[] = [];

      if (direction === 'from') {
        query += 'from_unit = ?';
        params.push(id);
      } else if (direction === 'to') {
        query += 'to_unit = ?';
        params.push(id);
      } else {
        query += '(from_unit = ? OR to_unit = ?)';
        params.push(id, id);
      }

      if (type) {
        query += ' AND relationship_type = ?';
        params.push(type);
      }

      query += ' ORDER BY confidence DESC, created_at DESC LIMIT ?';
      params.push(limit);

      const relationships = db['db'].prepare(query).all(...params) as Array<{
        fromEntity: string;
        toEntity: string;
        relationshipType: string;
        source: string | null;
        confidence: number | null;
        explanation: string | null;
        createdAt: string | null;
      }>;

      const formatted: EntityRelationship[] = relationships.map(rel => ({
        fromEntity: rel.fromEntity,
        toEntity: rel.toEntity,
        relationshipType: rel.relationshipType as any,
        source: (rel.source || 'auto_detected') as any,
        confidence: rel.confidence ?? undefined,
        explanation: rel.explanation ?? undefined,
        createdAt: rel.createdAt ? new Date(rel.createdAt) : undefined,
      }));

      // Get type distribution for this unit's relationships
      const typeDistribution = db['db'].prepare(`
        SELECT relationship_type as type, COUNT(*) as count
        FROM unit_relationships
        WHERE from_unit = ? OR to_unit = ?
        GROUP BY relationship_type
      `).all(id, id) as Array<{ type: string; count: number }>;

      res.json({
        success: true,
        data: formatted,
        meta: {
          unitId: id,
          direction,
          typeFilter: type,
          typeDistribution: Object.fromEntries(typeDistribution.map(t => [t.type, t.count])),
        },
        pagination: {
          total: formatted.length,
          limit,
        },
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug(`Retrieved ${formatted.length} relationships for unit: ${id}`);
    })
  );

  /**
   * POST /api/units/:id/relationships
   * Create a typed relationship from this unit to another
   */
  router.post(
    '/units/:id/relationships',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const { toEntity, relationshipType, explanation, confidence } = req.body;

      // Validate source unit exists
      const fromUnit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(id);
      if (!fromUnit) {
        throw new AppError(`Source unit not found: ${id}`, 'NOT_FOUND', 404);
      }

      // Validate target unit exists
      const toUnit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(toEntity);
      if (!toUnit) {
        throw new AppError(`Target unit not found: ${toEntity}`, 'NOT_FOUND', 404);
      }

      // Validate relationship type
      const validTypes = ['references', 'builds_on', 'contradicts', 'implements', 'derived_from', 'prerequisite', 'related'];
      if (!relationshipType || !validTypes.includes(relationshipType)) {
        throw new AppError(
          `Invalid relationship type. Must be one of: ${validTypes.join(', ')}`,
          'INVALID_TYPE',
          400
        );
      }

      // Insert the relationship
      const now = new Date().toISOString();
      db['db'].prepare(`
        INSERT OR REPLACE INTO unit_relationships
        (from_unit, to_unit, relationship_type, source, confidence, explanation, created_at)
        VALUES (?, ?, ?, 'manual', ?, ?, ?)
      `).run(
        id,
        toEntity,
        relationshipType,
        confidence ?? 1.0,
        explanation ?? null,
        now
      );

      const relationship: EntityRelationship = {
        fromEntity: id,
        toEntity,
        relationshipType,
        source: 'manual',
        confidence: confidence ?? 1.0,
        explanation,
        createdAt: new Date(now),
      };

      res.status(201).json({
        success: true,
        data: relationship,
        timestamp: now,
      } as ApiSuccessResponse<EntityRelationship>);

      logger.info(`Created relationship: ${id} -[${relationshipType}]-> ${toEntity}`);
    })
  );

  /**
   * DELETE /api/units/:id/relationships/:toId
   * Delete a relationship between two units
   */
  router.delete(
    '/units/:id/relationships/:toId',
    asyncHandler(async (req: Request, res: Response) => {
      const { id, toId } = req.params;
      const type = req.query.type as string | undefined;

      // Check if relationship exists
      let checkQuery = 'SELECT * FROM unit_relationships WHERE from_unit = ? AND to_unit = ?';
      const checkParams: any[] = [id, toId];

      if (type) {
        checkQuery += ' AND relationship_type = ?';
        checkParams.push(type);
      }

      const existing = db['db'].prepare(checkQuery).get(...checkParams);
      if (!existing) {
        throw new AppError('Relationship not found', 'NOT_FOUND', 404);
      }

      // Delete the relationship
      let deleteQuery = 'DELETE FROM unit_relationships WHERE from_unit = ? AND to_unit = ?';
      const deleteParams: any[] = [id, toId];

      if (type) {
        deleteQuery += ' AND relationship_type = ?';
        deleteParams.push(type);
      }

      const result = db['db'].prepare(deleteQuery).run(...deleteParams);

      res.json({
        success: true,
        data: {
          fromEntity: id,
          toEntity: toId,
          type,
          deleted: result.changes,
        },
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.info(`Deleted relationship: ${id} -> ${toId}${type ? ` (${type})` : ''}`);
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
        data: {
          unitId: id,
          removedTag: tag,
          tags: (db['db'].prepare(`
          SELECT t.name FROM tags t
          JOIN unit_tags ut ON t.id = ut.tag_id
          WHERE ut.unit_id = ?
        `).all(id) as Array<{ name: string }>).map((row) => row.name),
        },
        tags: (db['db'].prepare(`
          SELECT t.name FROM tags t
          JOIN unit_tags ut ON t.id = ut.tag_id
          WHERE ut.unit_id = ?
        `).all(id) as Array<{ name: string }>).map((row) => row.name),
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
        categories,
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

      // Get analytics from tracker
      const days = period === '30days' ? 30 : period === '7days' ? 7 : 1;
      const stats = analyticsTracker.getStatistics(days);
      const popularQueries = analyticsTracker.getPopularQueries({ limit, windowDays: days });

      res.json({
        success: true,
        data: {
          period,
          popularQueries,
          searchTypeStats: stats.byType,
          averageLatency: stats.avgLatency,
          totalQueries: stats.totalQueries,
          uniqueQueries: stats.uniqueQueries,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<any>);

      logger.debug('Retrieved search analytics');
    })
  );

  /**
   * POST /api/federation/sources
   * Register a federated source (currently local filesystem)
   */
  router.post(
    '/federation/sources',
    asyncHandler(async (req: Request, res: Response) => {
      assertFederationAccess(req, ['editor', 'admin', 'api_client']);
      const { name, rootPath, kind, includePatterns, excludePatterns, metadata } = req.body ?? {};

      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new AppError('Source name is required', 'INVALID_SOURCE_NAME', 400);
      }
      if (typeof rootPath !== 'string' || rootPath.trim().length === 0) {
        throw new AppError('Source rootPath is required', 'INVALID_ROOT_PATH', 400);
      }
      const normalizedRootPath = rootPath.trim();
      assertRootPathAllowed(normalizedRootPath);
      if (kind !== undefined && kind !== 'local-filesystem') {
        throw new AppError('Invalid source kind', 'INVALID_SOURCE_KIND', 400);
      }

      const normalizePatterns = (value: unknown): string[] | undefined => {
        if (value === undefined) return undefined;
        if (!Array.isArray(value)) {
          throw new AppError('Patterns must be an array of strings', 'INVALID_PATTERNS', 400);
        }
        return value
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
      };

      if (metadata !== undefined && (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))) {
        throw new AppError('Source metadata must be an object', 'INVALID_METADATA', 400);
      }

      const metadataWithDefaults: Record<string, unknown> = {
        ...((metadata as Record<string, unknown> | undefined) ?? {}),
      };
      if (federationAllowedExtensions.length > 0 && metadataWithDefaults.allowedExtensions === undefined) {
        metadataWithDefaults.allowedExtensions = federationAllowedExtensions;
      }

      const source = federatedSourceRegistry.createSource({
        name: name.trim(),
        rootPath: normalizedRootPath,
        kind,
        includePatterns: normalizePatterns(includePatterns),
        excludePatterns: normalizePatterns(excludePatterns),
        metadata: metadataWithDefaults,
      });
      (req as any).auditMeta = {
        sourceId: source.id,
        action: 'federation_source_created',
        sourceKind: source.kind,
      };

      res.status(201).json({
        success: true,
        data: source,
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<FederatedSourceDto>);
    })
  );

  /**
   * GET /api/federation/sources
   * List federated sources
   */
  router.get(
    '/federation/sources',
    asyncHandler(async (req: Request, res: Response) => {
      assertFederationAccess(req, ['viewer', 'editor', 'admin', 'api_client']);
      const sources = federatedSourceRegistry.listSources();
      res.json({
        success: true,
        data: sources,
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<FederatedSourceDto[]>);
    })
  );

  /**
   * PATCH /api/federation/sources/:id
   * Update source settings/status
   */
  router.patch(
    '/federation/sources/:id',
    asyncHandler(async (req: Request, res: Response) => {
      assertFederationAccess(req, ['editor', 'admin', 'api_client']);
      const { id } = req.params;
      const { name, status, rootPath, includePatterns, excludePatterns, metadata } = req.body ?? {};
      const update: UpdateFederatedSourceInput = {};

      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          throw new AppError('Source name must be a non-empty string', 'INVALID_SOURCE_NAME', 400);
        }
        update.name = name.trim();
      }

      if (status !== undefined) {
        if (status !== 'active' && status !== 'disabled') {
          throw new AppError('Source status must be active or disabled', 'INVALID_SOURCE_STATUS', 400);
        }
        update.status = status;
      }

      if (rootPath !== undefined) {
        if (typeof rootPath !== 'string' || rootPath.trim().length === 0) {
          throw new AppError('rootPath must be a non-empty string', 'INVALID_ROOT_PATH', 400);
        }
        const normalizedRootPath = rootPath.trim();
        assertRootPathAllowed(normalizedRootPath);
        update.rootPath = normalizedRootPath;
      }

      const normalizePatterns = (value: unknown): string[] => {
        if (!Array.isArray(value)) {
          throw new AppError('Patterns must be an array of strings', 'INVALID_PATTERNS', 400);
        }
        return value
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
      };

      if (includePatterns !== undefined) {
        update.includePatterns = normalizePatterns(includePatterns);
      }
      if (excludePatterns !== undefined) {
        update.excludePatterns = normalizePatterns(excludePatterns);
      }

      if (metadata !== undefined) {
        if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
          throw new AppError('Source metadata must be an object', 'INVALID_METADATA', 400);
        }
        update.metadata = metadata;
      } else if (federationAllowedExtensions.length > 0) {
        const source = federatedSourceRegistry.getSourceById(id);
        if (source) {
          update.metadata = {
            ...source.metadata,
            allowedExtensions:
              source.metadata.allowedExtensions !== undefined
                ? source.metadata.allowedExtensions
                : federationAllowedExtensions,
          };
        }
      }

      const source = federatedSourceRegistry.updateSource(id, update);
      (req as any).auditMeta = {
        sourceId: source.id,
        action: 'federation_source_updated',
      };
      res.json({
        success: true,
        data: source,
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<FederatedSourceDto>);
    })
  );

  /**
   * POST /api/federation/sources/:id/scan
   * Run indexing scan for a source
   */
  router.post(
    '/federation/sources/:id/scan',
    asyncHandler(async (req: Request, res: Response) => {
      assertFederationAccess(req, ['editor', 'admin', 'api_client']);
      const { id } = req.params;
      const modeValue = req.body?.mode;
      const mode = modeValue === undefined ? 'incremental' : String(modeValue);
      if (mode !== 'incremental' && mode !== 'full') {
        throw new AppError('Scan mode must be incremental or full', 'INVALID_SCAN_MODE', 400);
      }

      const job = federatedScanQueue.enqueueScan(id, {
        mode,
        requestedBy: (req as any).authContext?.user?.id ?? null,
        meta: {
          requestedAt: new Date().toISOString(),
          requestedIp: req.ip,
        },
      });
      (req as any).auditMeta = {
        sourceId: id,
        jobId: job.id,
        mode,
        action: 'federation_scan_enqueued',
      };

      res.status(202).json({
        success: true,
        data: job,
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<FederatedScanJobDto>);
    })
  );

  /**
   * GET /api/federation/sources/:id/scans
   * Get scan history for a source
   */
  router.get(
    '/federation/sources/:id/scans',
    asyncHandler(async (req: Request, res: Response) => {
      assertFederationAccess(req, ['viewer', 'editor', 'admin', 'api_client']);
      const { id } = req.params;
      const limit = parseIntParam(req.query.limit as string | undefined, 'limit', 20, 1, 100);
      const source = federatedSourceRegistry.getSourceById(id);
      if (!source) {
        throw new AppError(`Source not found: ${id}`, 'SOURCE_NOT_FOUND', 404);
      }

      const scans = federatedSourceRegistry.listScanRuns(id, limit);
      res.json({
        success: true,
        data: scans,
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<FederatedScanRunDto[]>);
    })
  );

  /**
   * GET /api/federation/jobs
   * List scan jobs, optionally filtered by source or status
   */
  router.get(
    '/federation/jobs',
    asyncHandler(async (req: Request, res: Response) => {
      assertFederationAccess(req, ['viewer', 'editor', 'admin', 'api_client']);

      const sourceId = req.query.sourceId ? String(req.query.sourceId) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const limit = parseIntParam(req.query.limit as string | undefined, 'limit', 50, 1, 200);
      const offset = parseIntParam(req.query.offset as string | undefined, 'offset', 0, 0, 100_000);

      const statusFilter = (() => {
        if (!status) return undefined;
        const allowed: FederatedScanJobStatus[] = ['queued', 'running', 'completed', 'failed', 'cancelled'];
        if (!allowed.includes(status as FederatedScanJobStatus)) {
          throw new AppError('Invalid job status filter', 'INVALID_JOB_STATUS', 400);
        }
        return status as FederatedScanJobStatus;
      })();

      const jobs = federatedScanQueue.listJobs({
        sourceId,
        status: statusFilter,
        limit,
        offset,
      });

      res.json({
        success: true,
        data: jobs,
        pagination: {
          limit,
          offset,
          total: jobs.length,
          totalPages: jobs.length === 0 ? 0 : Math.ceil(jobs.length / limit),
        },
        timestamp: new Date().toISOString(),
      } as OffsetListResponse<FederatedScanJobDto>);
    })
  );

  /**
   * GET /api/federation/jobs/:id
   * Get one scan job by ID
   */
  router.get(
    '/federation/jobs/:id',
    asyncHandler(async (req: Request, res: Response) => {
      assertFederationAccess(req, ['viewer', 'editor', 'admin', 'api_client']);
      const { id } = req.params;
      const job = federatedScanQueue.getJob(id);
      if (!job) {
        throw new AppError(`Scan job not found: ${id}`, 'SCAN_JOB_NOT_FOUND', 404);
      }

      res.json({
        success: true,
        data: job,
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<FederatedScanJobDto>);
    })
  );

  /**
   * POST /api/federation/jobs/:id/cancel
   * Cancel a queued/running scan job
   */
  router.post(
    '/federation/jobs/:id/cancel',
    asyncHandler(async (req: Request, res: Response) => {
      assertFederationAccess(req, ['editor', 'admin', 'api_client']);
      const { id } = req.params;
      const cancelled = federatedScanQueue.cancelJob(id);
      (req as any).auditMeta = {
        jobId: id,
        sourceId: cancelled.sourceId,
        action: 'federation_scan_cancelled',
      };

      res.json({
        success: true,
        data: cancelled,
        timestamp: new Date().toISOString(),
      } as ApiSuccessResponse<FederatedScanJobDto>);
    })
  );

  /**
   * GET /api/federation/search
   * Search across indexed federated documents
   */
  router.get(
    '/federation/search',
    asyncHandler(async (req: Request, res: Response) => {
      assertFederationAccess(req, ['viewer', 'editor', 'admin', 'api_client']);
      const q = req.query.q;
      if (q === undefined || String(q).trim().length === 0) {
        throw new AppError('Search query is required', 'MISSING_QUERY', 400);
      }

      const sourceId = req.query.sourceId ? String(req.query.sourceId) : undefined;
      const mimeType = req.query.mimeType ? String(req.query.mimeType) : undefined;
      const pathPrefix = req.query.pathPrefix ? String(req.query.pathPrefix) : undefined;
      const modifiedAfter = parseIsoDateParam(req.query.modifiedAfter as string | undefined, 'modifiedAfter');
      const modifiedBefore = parseIsoDateParam(req.query.modifiedBefore as string | undefined, 'modifiedBefore');
      const limit = parseIntParam(req.query.limit as string | undefined, 'limit', 20, 1, 100);
      const offset = parseIntParam(req.query.offset as string | undefined, 'offset', 0, 0, 100000);
      const query = String(q);
      const result = federatedSearch.search(query, {
        sourceId,
        mimeType,
        pathPrefix,
        modifiedAfter,
        modifiedBefore,
        limit,
        offset,
      });

      res.json({
        success: true,
        data: result.items,
        pagination: {
          limit,
          offset,
          total: result.total,
          totalPages: Math.max(1, Math.ceil(result.total / limit)),
        },
        query: {
          original: query,
          normalized: query.toLowerCase(),
          filters: {
            sourceId,
            mimeType,
            pathPrefix,
            modifiedAfter,
            modifiedBefore,
          },
        },
        timestamp: new Date().toISOString(),
      } as OffsetListResponse<FederatedSearchHitDto>);
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

  const universeRouter = createUniverseRouter(universeStore);
  router.use('/universe', universeRouter);

  return router;
}

/**
 * Express middleware factory to attach API to app
 */
export function setupApi(app: express.Application, db: KnowledgeDatabase): void {
  const apiRouter = createApiRouter(db);
  app.use('/api', apiRouter);

  logger.info('REST API endpoints configured');
}
