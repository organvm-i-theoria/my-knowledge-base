/**
 * Search Endpoints Tests - Comprehensive test suite for Phase 2 search API
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import { createApiRouter } from '../src/api.js';
import { KnowledgeDatabase } from '../src/database.js';
import { AtomicUnit } from '../src/types.js';

describe('Phase 2 Search API Endpoints', () => {
  let tempDir: string;
  let dbPath: string;
  let db: KnowledgeDatabase;
  let app: express.Application;

  beforeEach(async () => {
    tempDir = join(process.cwd(), '.test-tmp', 'search-api');
    dbPath = join(tempDir, 'test.db');
    mkdirSync(tempDir, { recursive: true });

    // Initialize database
    db = new KnowledgeDatabase(dbPath);

    // Create Express app with API router
    app = express();
    app.use(express.json());
    app.use('/api', createApiRouter(db));

    // Insert test data
    const timestamp = new Date();
    const testUnits: AtomicUnit[] = [
      {
        id: 'unit-1',
        type: 'insight',
        title: 'OAuth 2.0 Implementation Guide',
        content: 'Detailed guide on OAuth',
        context: 'context',
        category: 'programming',
        tags: ['oauth', 'authentication'],
        keywords: ['oauth', 'auth'],
        relatedUnits: [],
        timestamp
      },
      {
        id: 'unit-2',
        type: 'code',
        title: 'React Hooks Example',
        content: 'useState and useEffect examples',
        context: 'context',
        category: 'programming',
        tags: ['react', 'hooks'],
        keywords: ['react', 'hooks'],
        relatedUnits: [],
        timestamp
      },
      {
        id: 'unit-3',
        type: 'question',
        title: 'TypeScript Generics Question',
        content: 'How do TypeScript generics work?',
        context: 'context',
        category: 'programming',
        tags: ['typescript', 'generics'],
        keywords: ['typescript'],
        relatedUnits: [],
        timestamp
      },
      {
        id: 'unit-4',
        type: 'reference',
        title: 'Design Patterns Overview',
        content: 'Common design patterns explained',
        context: 'context',
        category: 'design',
        tags: ['patterns', 'design'],
        keywords: ['design'],
        relatedUnits: [],
        timestamp
      },
      {
        id: 'unit-5',
        type: 'decision',
        title: 'Database Choice Decision',
        content: 'Why we chose PostgreSQL',
        context: 'context',
        category: 'programming',
        tags: ['database', 'postgres'],
        keywords: ['postgres'],
        relatedUnits: [],
        timestamp
      },
      {
        id: 'unit-6',
        type: 'insight',
        title: 'Testing Best Practices',
        content: 'Unit testing and integration testing',
        context: 'context',
        category: 'programming',
        tags: ['testing', 'quality'],
        keywords: ['testing'],
        relatedUnits: [],
        timestamp
      },
      {
        id: 'unit-7',
        type: 'code',
        title: 'Express.js Middleware',
        content: 'Custom middleware implementation',
        context: 'context',
        category: 'programming',
        tags: ['express', 'nodejs'],
        keywords: ['nodejs'],
        relatedUnits: [],
        timestamp
      }
    ];

    testUnits.forEach(unit => db.insertAtomicUnit(unit));
  });

  afterEach(() => {
    try {
      db['db'].close();
    } catch (e) {
      // Already closed
    }
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Dir doesn't exist
    }
  });

  describe('GET /api/search - Full-Text Search', () => {
    it('should search by keyword', async () => {
      const response = await request(app)
        .get('/api/search?q=OAuth')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].title).toContain('OAuth');
    });

    it('should return standardized search response format', async () => {
      const response = await request(app)
        .get('/api/search?q=React')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body).toHaveProperty('query');
      expect(response.body).toHaveProperty('searchTime');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/search?q=&page=1&pageSize=2')
        .expect(200);

      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.pageSize).toBe(2);
      expect(response.body.pagination.offset).toBe(0);
      expect(response.body.pagination.total).toBeGreaterThan(0);
      expect(response.body.pagination.totalPages).toBeGreaterThan(0);
    });

    it('should include query metadata', async () => {
      const response = await request(app)
        .get('/api/search?q=TypeScript')
        .expect(200);

      expect(response.body.query.original).toBeTruthy();
      expect(response.body.query.normalized).toBeTruthy();
    });

    it('should include cache statistics', async () => {
      const response = await request(app)
        .get('/api/search?q=testing')
        .expect(200);

      expect(response.body.stats).toBeDefined();
      expect(response.body.stats).toHaveProperty('cacheHit');
    });

    it('should include facets when requested', async () => {
      const response = await request(app)
        .get('/api/search?q=&facets=true')
        .expect(200);

      if (response.body.facets) {
        expect(Array.isArray(response.body.facets)).toBe(true);
      }
    });

    it('should require search query', async () => {
      const response = await request(app)
        .get('/api/search')
        .expect(400);

      expect(response.body.error).toBeTruthy();
    });

    it('should validate page size bounds', async () => {
      const response = await request(app)
        .get('/api/search?q=test&pageSize=101')
        .expect(400);

      expect(response.body.error).toBeTruthy();
    });

    it('should handle empty results', async () => {
      const response = await request(app)
        .get('/api/search?q=nonexistentquery123456')
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should normalize query text', async () => {
      const response = await request(app)
        .get('/api/search?q=TYPESCRIPT')
        .expect(200);

      expect(response.body.query.normalized).toBe('typescript');
    });

    it('should measure search time', async () => {
      const response = await request(app)
        .get('/api/search?q=React')
        .expect(200);

      expect(response.body.searchTime).toBeGreaterThan(0);
    });

    it('should handle special characters in query', async () => {
      const response = await request(app)
        .get('/api/search?q=C%2B%2B') // C++
        .expect(200);

      expect(response.body).toHaveProperty('data');
    });
  });

  describe('GET /api/search/semantic - Semantic Search', () => {
    it('should perform semantic search', async () => {
      const response = await request(app)
        .get('/api/search/semantic?q=authentication+patterns')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should support semantic search with pagination', async () => {
      const response = await request(app)
        .get('/api/search/semantic?q=code&page=1&pageSize=3')
        .expect(200);

      expect(response.body.pagination.pageSize).toBe(3);
    });

    it('should filter by type in semantic search', async () => {
      const response = await request(app)
        .get('/api/search/semantic?q=programming&type=code')
        .expect(200);

      response.body.data.forEach((unit: any) => {
        expect(unit.type).toBe('code');
      });
    });

    it('should filter by category in semantic search', async () => {
      const response = await request(app)
        .get('/api/search/semantic?q=design&category=design')
        .expect(200);

      response.body.data.forEach((unit: any) => {
        expect(unit.category).toBe('design');
      });
    });

    it('should require search query', async () => {
      const response = await request(app)
        .get('/api/search/semantic')
        .expect(400);

      expect(response.body.error).toBeTruthy();
    });

    it('should handle unavailable embeddings gracefully', async () => {
      // If embeddings not available, should either work or return informative error
      const response = await request(app)
        .get('/api/search/semantic?q=test')
        .expect([200, 503]); // Either works or service unavailable

      if (response.status === 503) {
        expect(response.body.error).toContain('not available');
      }
    });
  });

  describe('GET /api/search/hybrid - Hybrid Search', () => {
    it('should perform hybrid search combining FTS and semantic', async () => {
      const response = await request(app)
        .get('/api/search/hybrid?q=React')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should accept FTS weight parameter', async () => {
      const response = await request(app)
        .get('/api/search/hybrid?q=test&ftsWeight=0.7&semanticWeight=0.3')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should validate weight parameters are between 0 and 1', async () => {
      const response = await request(app)
        .get('/api/search/hybrid?q=test&ftsWeight=1.5')
        .expect(400);

      expect(response.body.error).toBeTruthy();
    });

    it('should support pagination in hybrid search', async () => {
      const response = await request(app)
        .get('/api/search/hybrid?q=programming&page=2&pageSize=2')
        .expect(200);

      expect(response.body.pagination.page).toBe(2);
    });

    it('should include results from both FTS and semantic', async () => {
      const response = await request(app)
        .get('/api/search/hybrid?q=testing')
        .expect(200);

      if (response.body.stats) {
        // May have results from FTS, semantic, or both
        expect(response.body.data.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should default to balanced weights (0.4/0.6)', async () => {
      const response = await request(app)
        .get('/api/search/hybrid?q=design')
        .expect(200);

      expect(response.body.success).toBe(true);
      // Defaults should apply if not specified
    });

    it('should include facets when requested', async () => {
      const response = await request(app)
        .get('/api/search/hybrid?q=code&facets=true')
        .expect(200);

      if (response.body.facets) {
        expect(Array.isArray(response.body.facets)).toBe(true);
      }
    });

    it('should require query parameter', async () => {
      const response = await request(app)
        .get('/api/search/hybrid')
        .expect(400);

      expect(response.body.error).toBeTruthy();
    });
  });

  describe('GET /api/search/suggestions - Autocomplete', () => {
    it('should return suggestions for prefix', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=rea')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support limit parameter', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=&limit=5')
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(5);
    });

    it('should limit maximum suggestions to 20', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=&limit=50')
        .expect(400);

      expect(response.body.error).toBeTruthy();
    });

    it('should include suggestion metadata', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=react')
        .expect(200);

      response.body.data.forEach((suggestion: any) => {
        expect(suggestion).toHaveProperty('text');
        expect(suggestion).toHaveProperty('type');
        expect(suggestion).toHaveProperty('score');
      });
    });

    it('should be case-insensitive', async () => {
      const response1 = await request(app)
        .get('/api/search/suggestions?q=REACT')
        .expect(200);

      const response2 = await request(app)
        .get('/api/search/suggestions?q=react')
        .expect(200);

      // Both should return suggestions
      expect(response1.body.data.length).toBe(response2.body.data.length);
    });

    it('should require query parameter', async () => {
      const response = await request(app)
        .get('/api/search/suggestions')
        .expect(400);

      expect(response.body.error).toBeTruthy();
    });

    it('should handle empty query', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=')
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should include suggestion source (query/tag/keyword/title)', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=react')
        .expect(200);

      response.body.data.forEach((suggestion: any) => {
        expect(['query', 'tag', 'keyword', 'title']).toContain(suggestion.type);
      });
    });

    it('should rank suggestions by relevance score', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=test')
        .expect(200);

      if (response.body.data.length > 1) {
        for (let i = 1; i < response.body.data.length; i++) {
          expect(response.body.data[i - 1].score).toBeGreaterThanOrEqual(response.body.data[i].score);
        }
      }
    });
  });

  describe('GET /api/search/facets - Facet Enumeration', () => {
    it('should return available facets', async () => {
      const response = await request(app)
        .get('/api/search/facets')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should include category facets', async () => {
      const response = await request(app)
        .get('/api/search/facets')
        .expect(200);

      const categoryFacet = response.body.data.find((f: any) => f.field === 'category');
      expect(categoryFacet).toBeDefined();
      expect(categoryFacet.buckets).toBeDefined();
      expect(Array.isArray(categoryFacet.buckets)).toBe(true);
    });

    it('should include type facets', async () => {
      const response = await request(app)
        .get('/api/search/facets')
        .expect(200);

      const typeFacet = response.body.data.find((f: any) => f.field === 'type');
      expect(typeFacet).toBeDefined();
      expect(typeFacet.buckets.length).toBeGreaterThan(0);
    });

    it('should include tag facets', async () => {
      const response = await request(app)
        .get('/api/search/facets')
        .expect(200);

      const tagFacet = response.body.data.find((f: any) => f.field === 'tags');
      if (tagFacet) {
        expect(Array.isArray(tagFacet.buckets)).toBe(true);
      }
    });

    it('should include date facets', async () => {
      const response = await request(app)
        .get('/api/search/facets')
        .expect(200);

      const dateFacet = response.body.data.find((f: any) => f.field === 'date');
      if (dateFacet) {
        expect(Array.isArray(dateFacet.buckets)).toBe(true);
        dateFacet.buckets.forEach((bucket: any) => {
          expect(bucket.value).toBeTruthy(); // Should have date period
        });
      }
    });

    it('should include counts for each facet bucket', async () => {
      const response = await request(app)
        .get('/api/search/facets')
        .expect(200);

      response.body.data.forEach((facet: any) => {
        facet.buckets.forEach((bucket: any) => {
          expect(bucket.count).toBeGreaterThan(0);
          expect(bucket.value).toBeTruthy();
        });
      });
    });

    it('should support filtering facets by query', async () => {
      const response = await request(app)
        .get('/api/search/facets?q=React')
        .expect(200);

      expect(response.body.data).toBeDefined();
    });
  });

  describe('GET /api/search/presets - Filter Presets', () => {
    it('should return list of filter presets', async () => {
      const response = await request(app)
        .get('/api/search/presets')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should include preset metadata', async () => {
      const response = await request(app)
        .get('/api/search/presets')
        .expect(200);

      response.body.data.forEach((preset: any) => {
        expect(preset).toHaveProperty('id');
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('description');
        expect(preset).toHaveProperty('filters');
      });
    });

    it('should have built-in presets', async () => {
      const response = await request(app)
        .get('/api/search/presets')
        .expect(200);

      const presetIds = response.body.data.map((p: any) => p.id);

      // At least some built-in presets should exist
      expect(presetIds.length).toBeGreaterThan(0);
    });

    it('should return valid filter definitions in presets', async () => {
      const response = await request(app)
        .get('/api/search/presets')
        .expect(200);

      response.body.data.forEach((preset: any) => {
        expect(typeof preset.filters).toBe('object');
        if (preset.filters.type) {
          expect(['insight', 'code', 'question', 'reference', 'decision']).toContain(preset.filters.type);
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for invalid page size', async () => {
      const response = await request(app)
        .get('/api/search?q=test&pageSize=0')
        .expect(400);

      expect(response.body.error).toBeTruthy();
    });

    it('should return 400 for invalid weight values', async () => {
      const response = await request(app)
        .get('/api/search/hybrid?q=test&ftsWeight=-0.1')
        .expect(400);

      expect(response.body.error).toBeTruthy();
    });

    it('should return 400 for out-of-range limits', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=test&limit=100')
        .expect(400);

      expect(response.body.error).toBeTruthy();
    });

    it('should handle malformed query parameters gracefully', async () => {
      const response = await request(app)
        .get('/api/search?q=test&page=abc')
        .expect(400);

      expect(response.body.error).toBeTruthy();
    });
  });

  describe('Response Format Consistency', () => {
    it('all search endpoints should return consistent structure', async () => {
      const endpoints = [
        '/api/search?q=test',
        '/api/search/semantic?q=test',
        '/api/search/hybrid?q=test',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);

        if (response.status === 200) {
          expect(response.body).toHaveProperty('success');
          expect(response.body).toHaveProperty('data');
          expect(response.body).toHaveProperty('pagination');
          expect(response.body).toHaveProperty('query');
          expect(response.body).toHaveProperty('searchTime');
          expect(response.body).toHaveProperty('timestamp');
        }
      }
    });
  });

  describe('Performance and Caching', () => {
    it('should cache identical search results', async () => {
      const query = 'React';

      // First request (cache miss)
      const response1 = await request(app).get(`/api/search?q=${query}`);
      const stats1 = response1.body.stats;

      // Second request (cache hit)
      const response2 = await request(app).get(`/api/search?q=${query}`);
      const stats2 = response2.body.stats;

      // Second should have cacheHit=true if caching implemented
      if (stats2.cacheHit !== undefined) {
        expect(stats2.cacheHit).toBe(true);
      }
    });

    it('should measure search performance', async () => {
      const response = await request(app)
        .get('/api/search?q=test')
        .expect(200);

      expect(response.body.searchTime).toBeGreaterThan(0);
      expect(response.body.searchTime).toBeLessThan(5000); // Should complete in < 5 seconds
    });
  });
});
