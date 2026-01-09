/**
 * Phase 3: Claude Intelligence REST API
 * Exposes insight extraction, smart tagging, relationship detection, and summarization
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import { KnowledgeDatabase } from './database.js';
import { logger, AppError } from './logger.js';
import { InsightExtractor } from './insight-extractor.js';
import { SmartTagger } from './smart-tagger.js';
import { RelationshipDetector } from './relationship-detector.js';
import { ConversationSummarizer } from './conversation-summarizer.js';
import { ClaudeService } from './claude-service.js';

/**
 * Intelligence API response format
 */
interface IntelligenceResponse<T> {
  success: true;
  data: T;
  metadata?: {
    tokenUsage?: {
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens?: number;
      cacheReadTokens?: number;
      totalCost: number;
    };
    processingTime: number;
    cached?: boolean;
  };
  timestamp: string;
}

/**
 * Create intelligence API router for Phase 3
 */
export function createIntelligenceRouter(db: KnowledgeDatabase): Router {
  const router = Router();

  // Initialize Phase 3 services
  const claudeService = new ClaudeService();
  const insightExtractor = new InsightExtractor(claudeService);
  const smartTagger = new SmartTagger(claudeService);
  let relationshipDetector: RelationshipDetector | null = null;
  const conversationSummarizer = new ConversationSummarizer(claudeService);

  try {
    relationshipDetector = new RelationshipDetector('./db/knowledge.db', './atomized/embeddings/chroma', claudeService);
  } catch (e) {
    logger.warn('RelationshipDetector not available - vector embeddings required');
  }

  // Error handling middleware
  const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

  /**
   * GET /api/intelligence/insights
   * List extracted insights from atomic units
   */
  router.get(
    '/insights',
    asyncHandler(async (req: Request, res: Response) => {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
      const type = req.query.type as string | undefined;
      const category = req.query.category as string | undefined;
      const startTime = Date.now();

      // Query insights from atomic_units where type IN ('insight', 'decision')
      let query = `
        SELECT * FROM atomic_units
        WHERE type IN ('insight', 'decision')
      `;
      const params: any[] = [];

      if (type && ['insight', 'decision'].includes(type)) {
        query += ` AND type = ?`;
        params.push(type);
      }

      if (category) {
        query += ` AND category = ?`;
        params.push(category);
      }

      query += ` ORDER BY created DESC LIMIT ? OFFSET ?`;
      params.push(pageSize, (page - 1) * pageSize);

      const insights = db['db'].prepare(query).all(...params) as any[];

      // Get total count
      let countQuery = `SELECT COUNT(*) as count FROM atomic_units WHERE type IN ('insight', 'decision')`;
      if (type) countQuery += ` AND type = ?`;
      if (category) countQuery += ` AND category = ?`;

      const countParams: any[] = [];
      if (type) countParams.push(type);
      if (category) countParams.push(category);

      const { count } = db['db'].prepare(countQuery).get(...countParams) as any;
      const total = count || 0;

      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: insights,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
        metadata: {
          processingTime,
        },
        timestamp: new Date().toISOString(),
      });
    })
  );

  /**
   * POST /api/intelligence/insights/extract
   * Extract insights from conversation or units on demand
   */
  router.post(
    '/insights/extract',
    asyncHandler(async (req: Request, res: Response) => {
      const { conversationId, unitIds, save } = req.body;
      const startTime = Date.now();

      if (!conversationId && (!unitIds || unitIds.length === 0)) {
        throw new AppError('Either conversationId or unitIds must be provided', 'MISSING_SOURCE', 400);
      }

      if (!process.env.ANTHROPIC_API_KEY) {
        throw new AppError('ANTHROPIC_API_KEY not configured', 'API_KEY_MISSING', 503);
      }

      try {
        let insights: any[] = [];

        if (conversationId) {
          // Load conversation from database
          const conversation = db['db']
            .prepare('SELECT * FROM conversations WHERE id = ?')
            .get(conversationId) as any;

          if (!conversation) {
            throw new AppError('Conversation not found', 'NOT_FOUND', 404);
          }

          // Extract insights (simplified - would load actual conversation messages)
          insights = await insightExtractor.extract(conversation.title + '\n' + conversation.summary);
        } else if (unitIds && unitIds.length > 0) {
          // Extract from provided units
          for (const unitId of unitIds) {
            const unit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(unitId) as any;
            if (unit) {
              const extracted = await insightExtractor.extract(unit.content);
              insights.push(...extracted);
            }
          }
        }

        // Optionally save to database
        if (save) {
          for (const insight of insights) {
            db['db']
              .prepare(`
                INSERT INTO atomic_units (id, type, title, content, context, category, tags, keywords, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `)
              .run(
                insight.id,
                insight.type,
                insight.title,
                insight.content,
                'auto-extracted',
                insight.category || 'general',
                JSON.stringify(insight.tags || []),
                JSON.stringify(insight.keywords || []),
                new Date().toISOString()
              );
          }
        }

        const processingTime = Date.now() - startTime;
        const stats = claudeService.getTokenStats();

        res.json({
          success: true,
          data: insights,
          metadata: {
            tokenUsage: {
              inputTokens: stats.totalInputTokens,
              outputTokens: stats.totalOutputTokens,
              totalCost: stats.totalCost,
            },
            processingTime,
          },
          timestamp: new Date().toISOString(),
        } as IntelligenceResponse<any[]>);
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(`Insight extraction failed: ${error}`, 'EXTRACTION_ERROR', 500);
      }
    })
  );

  /**
   * GET /api/intelligence/tags/suggestions
   * Get smart tag suggestions for a unit
   */
  router.get(
    '/tags/suggestions',
    asyncHandler(async (req: Request, res: Response) => {
      const { unitId, content, title } = req.query;
      const startTime = Date.now();

      if (!process.env.ANTHROPIC_API_KEY) {
        throw new AppError('ANTHROPIC_API_KEY not configured', 'API_KEY_MISSING', 503);
      }

      let unitContent = content as string;
      let unitTitle = title as string;

      // Load from database if unitId provided
      if (unitId) {
        const unit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(unitId) as any;
        if (!unit) {
          throw new AppError('Unit not found', 'NOT_FOUND', 404);
        }
        unitContent = unit.content;
        unitTitle = unit.title;
      }

      if (!unitContent) {
        throw new AppError('Unit content or unitId is required', 'MISSING_CONTENT', 400);
      }

      try {
        const suggestions = await smartTagger.tagUnit({
          content: unitContent,
          title: unitTitle || 'Untitled',
          type: 'insight',
        });

        const processingTime = Date.now() - startTime;
        const stats = claudeService.getTokenStats();

        res.json({
          success: true,
          data: {
            tags: suggestions.tags,
            category: suggestions.category,
            keywords: suggestions.keywords,
            confidence: suggestions.confidence,
          },
          metadata: {
            tokenUsage: {
              inputTokens: stats.totalInputTokens,
              outputTokens: stats.totalOutputTokens,
              totalCost: stats.totalCost,
            },
            processingTime,
          },
          timestamp: new Date().toISOString(),
        } as IntelligenceResponse<any>);
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(`Tag suggestion failed: ${error}`, 'TAGGING_ERROR', 500);
      }
    })
  );

  /**
   * GET /api/intelligence/relationships
   * List relationships for a unit
   */
  router.get(
    '/relationships',
    asyncHandler(async (req: Request, res: Response) => {
      const { unitId, type, minStrength } = req.query;
      const startTime = Date.now();

      if (!unitId) {
        throw new AppError('unitId is required', 'MISSING_UNIT_ID', 400);
      }

      // Check if unit exists
      const unit = db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(unitId) as any;
      if (!unit) {
        throw new AppError('Unit not found', 'NOT_FOUND', 404);
      }

      // Query relationships
      let query = `
        SELECT r.*, u.title, u.type, u.category
        FROM unit_relationships r
        JOIN atomic_units u ON r.to_unit = u.id
        WHERE r.from_unit = ?
      `;
      const params: any[] = [unitId];

      if (type) {
        query += ` AND r.relationship_type = ?`;
        params.push(type);
      }

      const relationships = db['db'].prepare(query).all(...params) as any[];

      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: relationships,
        metadata: {
          processingTime,
        },
        timestamp: new Date().toISOString(),
      } as IntelligenceResponse<any[]>);
    })
  );

  /**
   * POST /api/intelligence/relationships/detect
   * Detect relationships between units
   */
  router.post(
    '/relationships/detect',
    asyncHandler(async (req: Request, res: Response) => {
      const { unitIds, threshold, save } = req.body;
      const startTime = Date.now();

      if (!unitIds || unitIds.length === 0) {
        throw new AppError('unitIds array is required', 'MISSING_UNITS', 400);
      }

      if (!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY) {
        throw new AppError('ANTHROPIC_API_KEY and OPENAI_API_KEY are required', 'API_KEY_MISSING', 503);
      }

      if (!relationshipDetector) {
        throw new AppError('Relationship detection not available - embeddings required', 'SERVICE_UNAVAILABLE', 503);
      }

      try {
        // Load units from database
        const units = unitIds
          .map((id: string) => db['db'].prepare('SELECT * FROM atomic_units WHERE id = ?').get(id))
          .filter((u: any) => u);

        if (units.length === 0) {
          throw new AppError('No valid units found', 'NOT_FOUND', 404);
        }

        // Detect relationships
        const relationships = await relationshipDetector.buildRelationshipGraph(units, threshold || 0.7);

        // Optionally save to database
        if (save) {
          const insertStmt = db['db'].prepare(`
            INSERT OR REPLACE INTO unit_relationships (from_unit, to_unit, relationship_type)
            VALUES (?, ?, ?)
          `);

          for (const [unitId, rels] of relationships) {
            for (const rel of rels) {
              insertStmt.run(unitId, rel.unitId, rel.type);
            }
          }
        }

        // Convert to array format for response
        const relationshipsArray = Array.from(relationships).map(([unitId, rels]) => ({
          fromUnit: unitId,
          relationships: rels,
        }));

        const processingTime = Date.now() - startTime;
        const stats = claudeService.getTokenStats();

        res.json({
          success: true,
          data: relationshipsArray,
          metadata: {
            tokenUsage: {
              inputTokens: stats.totalInputTokens,
              outputTokens: stats.totalOutputTokens,
              totalCost: stats.totalCost,
            },
            processingTime,
          },
          timestamp: new Date().toISOString(),
        } as IntelligenceResponse<any[]>);
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(`Relationship detection failed: ${error}`, 'DETECTION_ERROR', 500);
      }
    })
  );

  /**
   * GET /api/intelligence/summaries
   * List conversation summaries
   */
  router.get(
    '/summaries',
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();

      // Load summaries from database or file
      // For now, query from conversations table with summary field
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));

      const summaries = db['db']
        .prepare('SELECT id, title, summary FROM conversations ORDER BY created DESC LIMIT ? OFFSET ?')
        .all(pageSize, (page - 1) * pageSize) as any[];

      const { count } = db['db'].prepare('SELECT COUNT(*) as count FROM conversations').get() as any;
      const total = count || 0;

      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: summaries,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
        metadata: {
          processingTime,
        },
        timestamp: new Date().toISOString(),
      });
    })
  );

  /**
   * GET /api/intelligence/health
   * Check intelligence services availability
   */
  router.get(
    '/health',
    asyncHandler(async (req: Request, res: Response) => {
      const checks = {
        claudeService: !!process.env.ANTHROPIC_API_KEY,
        relationshipDetector: !!relationshipDetector && !!process.env.OPENAI_API_KEY,
        database: true,
      };

      const allHealthy = Object.values(checks).every((v) => v);

      res.json({
        success: true,
        data: {
          status: allHealthy ? 'healthy' : 'degraded',
          services: checks,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    })
  );

  return router;
}
