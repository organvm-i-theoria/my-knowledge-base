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
import { CollectionsManager } from './collections.js';
import { createCollectionsRoutes, createFavoritesRoutes, createCollectionsStatsRoute } from './collections-api.js';
import { createSavedSearchesRouter } from './saved-searches-api.js';
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
    
    // Add source breakdown
    const sourceStats = rawDb.prepare(`
      SELECT 
        json_extract(metadata, '$.sourceName') as source, 
        COUNT(*) as count 
      FROM documents 
      GROUP BY source
    `).all();

    res.json({ ...stats, sourceStats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Dashboard Page
app.get('/dashboard', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Knowledge Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-gray-100 p-8">
    <div class="max-w-6xl mx-auto">
        <h1 class="text-3xl font-bold mb-8 text-gray-800">🧠 Knowledge Operating System</h1>
        
        <!-- Key Metrics -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-gray-500 text-sm font-medium">Total Units</h3>
                <p class="text-3xl font-bold text-blue-600" id="stat-units">-</p>
            </div>
            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-gray-500 text-sm font-medium">Conversations</h3>
                <p class="text-3xl font-bold text-purple-600" id="stat-chats">-</p>
            </div>
            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-gray-500 text-sm font-medium">Documents</h3>
                <p class="text-3xl font-bold text-green-600" id="stat-docs">-</p>
            </div>
            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-gray-500 text-sm font-medium">Tags</h3>
                <p class="text-3xl font-bold text-orange-600" id="stat-tags">-</p>
            </div>
        </div>

        <!-- Charts Row -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-lg font-bold mb-4">Ingestion by Source</h3>
                <canvas id="sourceChart"></canvas>
            </div>
            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-lg font-bold mb-4">Knowledge Types</h3>
                <canvas id="typeChart"></canvas>
            </div>
        </div>

        <!-- Recent Activity -->
        <div class="bg-white p-6 rounded-lg shadow-sm">
            <h3 class="text-lg font-bold mb-4">Recent Ingestions</h3>
            <div id="recent-list" class="space-y-3">
                <p class="text-gray-400">Loading...</p>
            </div>
        </div>
    </div>

    <script>
        async function loadData() {
            try {
                // Fetch Stats
                const statsRes = await fetch('/api/stats');
                const stats = await statsRes.json();

                document.getElementById('stat-units').textContent = stats.totalUnits.count;
                document.getElementById('stat-chats').textContent = stats.totalConversations.count;
                document.getElementById('stat-docs').textContent = stats.totalDocuments.count;
                document.getElementById('stat-tags').textContent = stats.totalTags.count;

                // Source Chart
                const sourceCtx = document.getElementById('sourceChart').getContext('2d');
                new Chart(sourceCtx, {
                    type: 'doughnut',
                    data: {
                        labels: stats.sourceStats.map(s => s.source || 'Unknown'),
                        datasets: [{
                            data: stats.sourceStats.map(s => s.count),
                            backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
                        }]
                    }
                });

                // Type Chart
                const typeCtx = document.getElementById('typeChart').getContext('2d');
                new Chart(typeCtx, {
                    type: 'bar',
                    data: {
                        labels: stats.unitsByType.map(t => t.type),
                        datasets: [{
                            label: 'Units',
                            data: stats.unitsByType.map(t => t.count),
                            backgroundColor: '#6366F1'
                        }]
                    },
                    options: {
                        scales: { y: { beginAtZero: true } }
                    }
                });

                // Recent Items (Fetch logic to be added to API)
                // For now, simulate
                document.getElementById('recent-list').innerHTML = '';
            } catch (e) {
                console.error('Error loading dashboard:', e);
            }
        }
        loadData();
    </script>
</body>
</html>
  `);
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

    const unit = db.getUnitById(id);

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    res.json(unit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get unit' });
  }
});

// Search suggestions (autocomplete)
app.get('/api/search/suggestions', (req, res) => {
  try {
    const prefix = (req.query.q as string | undefined)?.trim() ?? '';
    const limit = parseInt(req.query.limit as string) || 8;

    if (prefix.length === 0) {
      return res.json({ suggestions: [], count: 0 });
    }

    const suggestions = db.getSearchSuggestions(prefix, limit);
    res.json({ suggestions, count: suggestions.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get suggestions' });
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
    const type = (req.query.type as string | undefined)?.trim();
    const category = (req.query.category as string | undefined)?.trim();
    const focusId = (req.query.focusId as string | undefined)?.trim();
    const hops = Math.min(Math.max(parseInt(req.query.hops as string) || 1, 1), 3);

    let units = focusId
      ? (() => {
          const start = db.getUnitById(focusId);
          if (!start) return [];

          const visited = new Set<string>([start.id]);
          let frontier = new Set<string>([start.id]);

          for (let hop = 0; hop < hops; hop += 1) {
            const frontierIds = Array.from(frontier);
            const edges = db.getRelationshipsForUnitIds(frontierIds);
            const nextFrontier = new Set<string>();

            for (const edge of edges) {
              if (!visited.has(edge.fromUnit)) nextFrontier.add(edge.fromUnit);
              if (!visited.has(edge.toUnit)) nextFrontier.add(edge.toUnit);
            }

            for (const id of nextFrontier) {
              visited.add(id);
              if (visited.size >= limit) break;
            }

            frontier = nextFrontier;
            if (frontier.size === 0 || visited.size >= limit) break;
          }

          return db.getUnitsByIds(Array.from(visited), { limit, type, category });
        })()
      : db.getUnitsForGraph({ limit, type, category });

    const nodeIds = units.map(u => u.id);
    const nodeIdSet = new Set(nodeIds);
    const relationships = db
      .getRelationshipsForUnitIds(nodeIds)
      .filter(edge => nodeIdSet.has(edge.fromUnit) && nodeIdSet.has(edge.toUnit))
      .map(edge => ({
        source: edge.fromUnit,
        target: edge.toUnit,
        type: edge.type || 'related',
      }));

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

// Collections & Favorites API
const collectionsManager = new CollectionsManager('./db/knowledge.db');
app.use('/api/collections', createCollectionsRoutes(collectionsManager));
app.use('/api/favorites', createFavoritesRoutes(collectionsManager));
app.use('/api/collections', createCollectionsStatsRoute(collectionsManager));

// Saved Searches API
const savedSearchesRouter = createSavedSearchesRouter('./db/knowledge.db');
app.use('/api/searches', savedSearchesRouter);

// Start server
app.listen(PORT, () => {
  console.log(`\n🌐 Knowledge Base Web UI`);
  console.log(`\n📍 Server running at: http://localhost:${PORT}`);
  console.log(`\n🔍 API endpoints:`);
  console.log(`   GET /api/stats                    - Database statistics`);
  console.log(`   GET /api/search/fts?q=query       - Full-text search`);
  console.log(`   GET /api/search/semantic?q=query  - Semantic search`);
  console.log(`   GET /api/search/hybrid?q=query    - Hybrid search`);
  console.log(`   GET /api/search/suggestions?q=pr  - Autocomplete suggestions`);
  console.log(`   GET /api/units/:id                - Get unit by ID`);
  console.log(`   GET /api/categories               - List categories`);
  console.log(`   GET /api/tags                     - Get all tags`);
  console.log(`   GET /api/tags/summary             - Tag usage summary`);
  console.log(`   GET /api/tags/:tag/units          - Get units by tag`);
  console.log(`   POST /api/units/:id/tags          - Add tags to a unit`);
  console.log(`   DELETE /api/units/:id/tags/:tag   - Remove tag from a unit`);
  console.log(`   GET /api/graph                    - Get graph data (type/category/focusId/hops)`);
  console.log(`   GET /api/conversations            - Get all conversations`);
  console.log(`   GET /api/collections              - List collections`);
  console.log(`   POST /api/collections             - Create collection`);
  console.log(`   GET /api/collections/:id          - Get collection`);
  console.log(`   PUT /api/collections/:id          - Update collection`);
  console.log(`   DELETE /api/collections/:id       - Delete collection`);
  console.log(`   POST /api/collections/:id/units   - Add unit to collection`);
  console.log(`   DELETE /api/collections/:id/units/:unitId - Remove unit`);
  console.log(`   GET /api/favorites                - List favorites`);
  console.log(`   POST /api/favorites/:unitId       - Add favorite`);
  console.log(`   DELETE /api/favorites/:unitId     - Remove favorite`);
  console.log(`   POST /api/searches/saved          - Save a search`);
  console.log(`   GET /api/searches/saved           - List saved searches`);
  console.log(`   GET /api/searches/saved/:id       - Get saved search`);
  console.log(`   PUT /api/searches/saved/:id       - Update saved search`);
  console.log(`   DELETE /api/searches/saved/:id    - Delete saved search`);
  console.log(`   POST /api/searches/saved/:id/execute - Execute saved search`);
  console.log(`   GET /api/searches/popular         - Get popular searches`);
  console.log(`   GET /api/searches/recent          - Get recent searches`);
  console.log(`\n💡 Open http://localhost:${PORT} in your browser\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  db.close();
  if (hybridSearch) {
    hybridSearch.close();
  }
  collectionsManager.close();
  process.exit(0);
});
