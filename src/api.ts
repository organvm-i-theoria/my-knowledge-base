/**
 * REST API endpoints for knowledge base
 * Provides comprehensive CRUD operations on atomic units
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'crypto';
import { KnowledgeDatabase } from './database.js';
import { Logger, AppError } from './logger.js';
import { AtomicUnit } from './types.js';

const logger = new Logger({ context: 'api' });

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
 * Create REST API router
 */
export function createApiRouter(db: KnowledgeDatabase): Router {
  const router = Router();

  // Error handling middleware
  const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

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
        data: units.map(formatUnit),
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
        data: formatUnit(unit),
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

      const id = uuidv4().toString();
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
        data: formatUnit(unit),
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
        data: formatUnit(unit),
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
        data: results.map(formatUnit),
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
   * Error handling middleware
   */
  router.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof AppError) {
      logger.error(`API Error: ${err.message}`, { code: err.code, statusCode: err.statusCode });
      res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
        statusCode: err.statusCode,
        details: err.context,
      } as ApiErrorResponse);
    } else {
      logger.error(`Unexpected error: ${err.message}`, { stack: err.stack });
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        statusCode: 500,
      } as ApiErrorResponse);
    }
  });

  return router;
}

/**
 * Format atomic unit for API response
 */
function formatUnit(unit: AtomicUnit): Record<string, any> {
  return {
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
}

/**
 * Express middleware factory to attach API to app
 */
export function setupApi(app: express.Application, db: KnowledgeDatabase): void {
  const apiRouter = createApiRouter(db);
  app.use('/api', apiRouter);

  logger.info('REST API endpoints configured');
}
