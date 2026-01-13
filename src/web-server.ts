#!/usr/bin/env node
/**
 * Web server for knowledge base UI
 */

import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeDatabase } from './database.js';
import { HybridSearch } from './hybrid-search.js';
import { VectorDatabase } from './vector-database.js';
import { EmbeddingsService } from './embeddings-service.js';
import { config } from 'dotenv';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const corsOptions = {
  origin: corsOrigins.length > 0 ? corsOrigins : true,
  methods: (process.env.CORS_METHODS || 'GET,POST,PUT,DELETE,OPTIONS')
    .split(',')
    .map(method => method.trim()),
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(join(__dirname, '../web')));

const enforceHttps = process.env.ENFORCE_HTTPS === 'true';
if (enforceHttps) {
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol = typeof forwardedProto === 'string' ? forwardedProto : req.protocol;
    if (protocol !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    }
    next();
  });
}

// Initialize services
const db = new KnowledgeDatabase('./db/knowledge.db');
const rawDb = (db as any).db;

function updateUnitFtsTags(unitId: string) {
  const tags = rawDb.prepare(`
    SELECT t.name FROM tags t
    JOIN unit_tags ut ON t.id = ut.tag_id
    WHERE ut.unit_id = ?
  `).all(unitId) as { name: string }[];

  rawDb.prepare(`
    INSERT INTO units_fts (rowid, title, content, context, tags)
    SELECT rowid, title, content, context, ?
    FROM atomic_units WHERE id = ?
  `).run(tags.map(t => t.name).join(' '), unitId);
}

// Optional services (require OpenAI API key)
let hybridSearch: HybridSearch | null = null;
let vectorDb: VectorDatabase | null = null;
let embeddingsService: EmbeddingsService | null = null;
let servicesReady = false;

// Initialize async services only if API keys are available
async function initServices() {
  if (process.env.OPENAI_API_KEY) {
    try {
      embeddingsService = new EmbeddingsService();
      vectorDb = new VectorDatabase();
      hybridSearch = new HybridSearch();

      await hybridSearch.init();
      await vectorDb.init();
      servicesReady = true;
      console.log('✅ Semantic search services initialized');
    } catch (error) {
      console.warn('⚠️  Failed to initialize semantic search services:', error);
      console.warn('   FTS search will still work');
    }
  } else {
    console.log('ℹ️  OPENAI_API_KEY not found - semantic search disabled');
    console.log('   FTS search and other features will still work');
  }
}

initServices().catch(console.error);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    servicesReady,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
  });
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Search endpoints
app.get('/api/search/fts', (req, res) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    const results = db.searchText(query, limit);
    res.json({ results, count: results.length });
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/search/semantic', async (req, res) => {
  try {
    if (!servicesReady || !embeddingsService || !vectorDb) {
      return res.status(503).json({ error: 'Semantic search not available (OPENAI_API_KEY required)' });
    }

    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    // Generate query embedding
    const queryEmbedding = await embeddingsService.generateEmbedding(query);

    // Search
    const results = await vectorDb.searchByEmbedding(queryEmbedding, limit);

    res.json({ results, count: results.length });
  } catch (error) {
    res.status(500).json({ error: 'Semantic search failed' });
  }
});

app.get('/api/search/hybrid', async (req, res) => {
  try {
    if (!servicesReady || !hybridSearch) {
      return res.status(503).json({ error: 'Hybrid search not available (OPENAI_API_KEY required)' });
    }

    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 10;
    const ftsWeight = parseFloat(req.query.ftsWeight as string) || 0.4;
    const semanticWeight = parseFloat(req.query.semanticWeight as string) || 0.6;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    const results = await hybridSearch.search(query, limit, {
      fts: ftsWeight,
      semantic: semanticWeight,
    });

    res.json({ results, count: results.length });
  } catch (error) {
    res.status(500).json({ error: 'Hybrid search failed' });
  }
});

// Get unit by ID
app.get('/api/units/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Get unit from database
    const units = db.searchText('*', 100000);
    const unit = units.find(u => u.id === id);

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    res.json(unit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get unit' });
  }
});

// List categories with counts
app.get('/api/categories', (req, res) => {
  try {
    const categories = rawDb.prepare(`
      SELECT category, COUNT(*) as count FROM atomic_units
      WHERE category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `).all();
    res.json({ categories, count: categories.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

// Get units by tag
app.get('/api/tags/:tag/units', (req, res) => {
  try {
    const { tag } = req.params;
    const units = db.getUnitsByTag(tag);
    res.json({ units, count: units.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get units by tag' });
  }
});

// Get tag usage summary
app.get('/api/tags/summary', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const tags = db.getTagFacets('', [], limit).map(tag => ({
      name: tag.value,
      count: tag.count
    }));
    res.json({ tags, count: tags.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tag summary' });
  }
});

// Get all tags
app.get('/api/tags', (req, res) => {
  try {
    // Get all tags from database
    const tagsQuery = rawDb.prepare('SELECT name FROM tags ORDER BY name').all();
    const tags = tagsQuery.map((t: any) => t.name);

    res.json({ tags, count: tags.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

// Add tags to a unit
app.post('/api/units/:id/tags', (req, res) => {
  try {
    const { id } = req.params;
    const tagNames = Array.isArray(req.body?.tags) ? req.body.tags : [];
    if (tagNames.length === 0) {
      return res.status(400).json({ error: 'tags array required' });
    }

    const unit = rawDb.prepare('SELECT id FROM atomic_units WHERE id = ?').get(id);
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const insertTag = rawDb.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
    const getTagId = rawDb.prepare('SELECT id FROM tags WHERE name = ?');
    const linkTag = rawDb.prepare('INSERT OR IGNORE INTO unit_tags (unit_id, tag_id) VALUES (?, ?)');

    for (const rawTag of tagNames) {
      const tag = typeof rawTag === 'string' ? rawTag.trim() : '';
      if (!tag) continue;
      insertTag.run(tag);
      const tagRow = getTagId.get(tag) as { id: number };
      if (tagRow?.id) {
        linkTag.run(id, tagRow.id);
      }
    }

    updateUnitFtsTags(id);

    const updatedTags = rawDb.prepare(`
      SELECT t.name FROM tags t
      JOIN unit_tags ut ON t.id = ut.tag_id
      WHERE ut.unit_id = ?
    `).all(id) as { name: string }[];

    res.json({ unitId: id, tags: updatedTags.map(tag => tag.name) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add tags' });
  }
});

// Remove a tag from a unit
app.delete('/api/units/:id/tags/:tag', (req, res) => {
  try {
    const { id, tag } = req.params;
    const unit = rawDb.prepare('SELECT id FROM atomic_units WHERE id = ?').get(id);
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const tagRecord = rawDb.prepare('SELECT id FROM tags WHERE name = ?').get(tag) as { id: number } | undefined;
    if (!tagRecord) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    rawDb.prepare('DELETE FROM unit_tags WHERE unit_id = ? AND tag_id = ?').run(id, tagRecord.id);
    updateUnitFtsTags(id);

    const updatedTags = rawDb.prepare(`
      SELECT t.name FROM tags t
      JOIN unit_tags ut ON t.id = ut.tag_id
      WHERE ut.unit_id = ?
    `).all(id) as { name: string }[];

    res.json({ unitId: id, tags: updatedTags.map(tag => tag.name) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

// Get graph data (for visualization)
app.get('/api/graph', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    // Get units
    const units = db.searchText('*', limit);

    // Get relationships
    const relationships: any[] = [];
    for (const unit of units) {
      for (const relatedId of unit.relatedUnits) {
        relationships.push({
          source: unit.id,
          target: relatedId,
          type: 'related',
        });
      }
    }

    // Format for graph visualization
    const nodes = units.map(u => ({
      id: u.id,
      label: u.title,
      type: u.type,
      category: u.category,
      tags: u.tags,
    }));

    res.json({ nodes, edges: relationships });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get graph data' });
  }
});

// Get conversations
app.get('/api/conversations', (req, res) => {
  try {
    const conversations = db.getAllConversations();
    res.json({ conversations, count: conversations.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🌐 Knowledge Base Web UI`);
  console.log(`\n📍 Server running at: http://localhost:${PORT}`);
  console.log(`\n🔍 API endpoints:`);
  console.log(`   GET /api/stats                    - Database statistics`);
  console.log(`   GET /api/search/fts?q=query       - Full-text search`);
  console.log(`   GET /api/search/semantic?q=query  - Semantic search`);
  console.log(`   GET /api/search/hybrid?q=query    - Hybrid search`);
  console.log(`   GET /api/units/:id                - Get unit by ID`);
  console.log(`   GET /api/categories               - List categories`);
  console.log(`   GET /api/tags                     - Get all tags`);
  console.log(`   GET /api/tags/summary             - Tag usage summary`);
  console.log(`   GET /api/tags/:tag/units          - Get units by tag`);
  console.log(`   POST /api/units/:id/tags          - Add tags to a unit`);
  console.log(`   DELETE /api/units/:id/tags/:tag   - Remove tag from a unit`);
  console.log(`   GET /api/graph                    - Get graph data`);
  console.log(`   GET /api/conversations            - Get all conversations`);
  console.log(`\n💡 Open http://localhost:${PORT} in your browser\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  db.close();
  if (hybridSearch) {
    hybridSearch.close();
  }
  process.exit(0);
});
