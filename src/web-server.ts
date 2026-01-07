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
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '../web')));

// Initialize services
const db = new KnowledgeDatabase('./db/knowledge.db');

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

// Get all tags
app.get('/api/tags', (req, res) => {
  try {
    const stats = db.getStats();
    // Get all tags from database
    const tagsQuery = (db as any).db.prepare('SELECT name FROM tags ORDER BY name').all();
    const tags = tagsQuery.map((t: any) => t.name);

    res.json({ tags, count: tags.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tags' });
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
  console.log(`   GET /api/tags                     - Get all tags`);
  console.log(`   GET /api/tags/:tag/units          - Get units by tag`);
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
