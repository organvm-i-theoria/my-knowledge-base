import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import { createApiRouter } from './api.js';
import { KnowledgeDatabase } from './database.js';

describe('REST API', () => {
  let tempDir: string;
  let dbPath: string;
  let db: KnowledgeDatabase;
  let app: express.Application;

  beforeEach(async () => {
    tempDir = join(process.cwd(), '.test-tmp', 'api');
    dbPath = join(tempDir, 'test.db');
    mkdirSync(tempDir, { recursive: true });

    // Initialize database
    db = new KnowledgeDatabase(dbPath);

    // Create Express app with API router
    app = express();
    app.use(express.json());
    app.use('/api', createApiRouter(db));
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

  describe('GET /api/units', () => {
    beforeEach(() => {
      // Insert test units
      for (let i = 0; i < 5; i++) {
        db['db'].prepare(`
          INSERT INTO atomic_units (
            id, type, title, content, context, category, tags, keywords, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `unit-${i}`,
          ['insight', 'code', 'question', 'reference', 'decision'][i % 5],
          `Title ${i}`,
          `Content ${i}`,
          'context',
          'programming',
          '[]',
          '[]',
          new Date().toISOString()
        );
      }
    });

    it('should list all units', async () => {
      const response = await request(app)
        .get('/api/units')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(5);
      expect(response.body.pagination.total).toBe(5);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/units?page=1&pageSize=2')
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.pageSize).toBe(2);
      expect(response.body.pagination.totalPages).toBe(3);
    });

    it('should filter by type', async () => {
      const response = await request(app)
        .get('/api/units?type=insight')
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      response.body.data.forEach((unit: any) => {
        expect(unit.type).toBe('insight');
      });
    });

    it('should filter by category', async () => {
      const response = await request(app)
        .get('/api/units?category=programming')
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should search by query', async () => {
      const response = await request(app)
        .get('/api/units?q=Title%202')
        .expect(200);

      expect(response.body.data.some((u: any) => u.title === 'Title 2')).toBe(true);
    });

    it('should support sorting', async () => {
      const response = await request(app)
        .get('/api/units?sortBy=title&sortOrder=ASC')
        .expect(200);

      expect(response.body.data).toHaveLength(5);
    });
  });

  describe('GET /api/units/:id', () => {
    beforeEach(() => {
      db['db'].prepare(`
        INSERT INTO atomic_units (
          id, type, title, content, context, category, tags, keywords, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-unit-1',
        'insight',
        'Test Title',
        'Test Content',
        'context',
        'programming',
        '["tag1", "tag2"]',
        '["keyword1"]',
        new Date().toISOString()
      );
    });

    it('should retrieve a unit by ID', async () => {
      const response = await request(app)
        .get('/api/units/test-unit-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('test-unit-1');
      expect(response.body.data.title).toBe('Test Title');
    });

    it('should return 404 for non-existent unit', async () => {
      const response = await request(app)
        .get('/api/units/nonexistent')
        .expect(404);

      expect(response.body.error).toContain('not found');
    });
  });

  describe('POST /api/units', () => {
    it('should create a new unit', async () => {
      const response = await request(app)
        .post('/api/units')
        .send({
          type: 'insight',
          title: 'New Unit',
          content: 'This is new content',
          category: 'programming',
          tags: ['typescript', 'testing'],
          keywords: ['new', 'unit'],
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('New Unit');
      expect(response.body.data.type).toBe('insight');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/units')
        .send({
          type: 'insight',
          // Missing title and content
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should validate unit type', async () => {
      const response = await request(app)
        .post('/api/units')
        .send({
          type: 'invalid_type',
          title: 'Title',
          content: 'Content',
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid unit type');
    });

    it('should set defaults for optional fields', async () => {
      const response = await request(app)
        .post('/api/units')
        .send({
          type: 'code',
          title: 'Code Unit',
          content: 'const x = 1;',
        })
        .expect(201);

      expect(response.body.data.category).toBe('general');
      expect(response.body.data.tags).toEqual([]);
    });
  });

  describe('PUT /api/units/:id', () => {
    beforeEach(() => {
      db['db'].prepare(`
        INSERT INTO atomic_units (
          id, type, title, content, context, category, tags, keywords, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-unit-1',
        'insight',
        'Original Title',
        'Original Content',
        'context',
        'programming',
        '[]',
        '[]',
        new Date().toISOString()
      );
    });

    it('should update a unit', async () => {
      const response = await request(app)
        .put('/api/units/test-unit-1')
        .send({
          title: 'Updated Title',
          content: 'Updated Content',
        })
        .expect(200);

      expect(response.body.data.title).toBe('Updated Title');
      expect(response.body.data.content).toBe('Updated Content');
    });

    it('should return 404 for non-existent unit', async () => {
      const response = await request(app)
        .put('/api/units/nonexistent')
        .send({ title: 'New Title' })
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    it('should validate updated fields', async () => {
      const response = await request(app)
        .put('/api/units/test-unit-1')
        .send({
          type: 'invalid_type',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle partial updates', async () => {
      const response = await request(app)
        .put('/api/units/test-unit-1')
        .send({
          category: 'design',
        })
        .expect(200);

      expect(response.body.data.category).toBe('design');
      expect(response.body.data.title).toBe('Original Title');
    });

    it('should reject empty updates', async () => {
      const response = await request(app)
        .put('/api/units/test-unit-1')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('No fields to update');
    });
  });

  describe('DELETE /api/units/:id', () => {
    beforeEach(() => {
      db['db'].prepare(`
        INSERT INTO atomic_units (
          id, type, title, content, context, category, tags, keywords, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-unit-1',
        'insight',
        'Title',
        'Content',
        'context',
        'programming',
        '[]',
        '[]',
        new Date().toISOString()
      );
    });

    it('should delete a unit', async () => {
      const response = await request(app)
        .delete('/api/units/test-unit-1')
        .expect(200);

      expect(response.body.data.deleted).toBe(true);

      // Verify deletion
      const checkResponse = await request(app)
        .get('/api/units/test-unit-1')
        .expect(404);
    });

    it('should return 404 for non-existent unit', async () => {
      const response = await request(app)
        .delete('/api/units/nonexistent')
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    it('should clean up related tags', async () => {
      // Create unit with tags first
      db['db'].prepare('INSERT INTO tags (name) VALUES (?)').run('test-tag');
      const tag = db['db'].prepare('SELECT * FROM tags WHERE name = ?').get('test-tag') as any;

      db['db'].prepare('INSERT INTO unit_tags (unit_id, tag_id) VALUES (?, ?)').run('test-unit-1', tag.id);

      // Delete unit
      await request(app)
        .delete('/api/units/test-unit-1')
        .expect(200);

      // Check that unit_tags relation is deleted
      const relation = db['db'].prepare('SELECT * FROM unit_tags WHERE unit_id = ?').get('test-unit-1');
      expect(relation).toBeUndefined();
    });
  });

  describe('GET /api/units/:id/tags', () => {
    beforeEach(() => {
      db['db'].prepare(`
        INSERT INTO atomic_units (
          id, type, title, content, context, category, tags, keywords, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-unit-1',
        'insight',
        'Title',
        'Content',
        'context',
        'programming',
        '[]',
        '[]',
        new Date().toISOString()
      );

      db['db'].prepare('INSERT INTO tags (name) VALUES (?)').run('typescript');
      db['db'].prepare('INSERT INTO tags (name) VALUES (?)').run('testing');

      const tags = db['db'].prepare('SELECT * FROM tags').all() as any[];
      tags.forEach(tag => {
        db['db'].prepare('INSERT INTO unit_tags (unit_id, tag_id) VALUES (?, ?)').run('test-unit-1', tag.id);
      });
    });

    it('should retrieve tags for a unit', async () => {
      const response = await request(app)
        .get('/api/units/test-unit-1/tags')
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.some((t: any) => t.name === 'typescript')).toBe(true);
    });

    it('should return 404 for non-existent unit', async () => {
      const response = await request(app)
        .get('/api/units/nonexistent/tags')
        .expect(404);

      expect(response.body.error).toContain('not found');
    });
  });

  describe('POST /api/units/:id/tags', () => {
    beforeEach(() => {
      db['db'].prepare(`
        INSERT INTO atomic_units (
          id, type, title, content, context, category, tags, keywords, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-unit-1',
        'insight',
        'Title',
        'Content',
        'context',
        'programming',
        '[]',
        '[]',
        new Date().toISOString()
      );
    });

    it('should add tags to a unit', async () => {
      const response = await request(app)
        .post('/api/units/test-unit-1/tags')
        .send({
          tags: ['typescript', 'testing'],
        })
        .expect(200);

      expect(response.body.data.addedTags).toHaveLength(2);
    });

    it('should create new tags if they do not exist', async () => {
      const response = await request(app)
        .post('/api/units/test-unit-1/tags')
        .send({
          tags: ['brand-new-tag'],
        })
        .expect(200);

      expect(response.body.data.addedTags).toContain('brand-new-tag');

      const tag = db['db'].prepare('SELECT * FROM tags WHERE name = ?').get('brand-new-tag');
      expect(tag).toBeDefined();
    });

    it('should skip duplicate tags', async () => {
      // Add first time
      await request(app)
        .post('/api/units/test-unit-1/tags')
        .send({
          tags: ['typescript'],
        })
        .expect(200);

      // Add second time
      const response = await request(app)
        .post('/api/units/test-unit-1/tags')
        .send({
          tags: ['typescript'],
        })
        .expect(200);

      expect(response.body.data.addedTags).toHaveLength(0);
    });

    it('should return 404 for non-existent unit', async () => {
      const response = await request(app)
        .post('/api/units/nonexistent/tags')
        .send({
          tags: ['tag'],
        })
        .expect(404);

      expect(response.body.error).toContain('not found');
    });
  });

  describe('GET /api/search', () => {
    beforeEach(() => {
      for (let i = 0; i < 3; i++) {
        db['db'].prepare(`
          INSERT INTO atomic_units (
            id, type, title, content, context, category, tags, keywords, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `unit-${i}`,
          'insight',
          `TypeScript ${i}`,
          `Content about TypeScript`,
          'context',
          'programming',
          '[]',
          '[]',
          new Date().toISOString()
        );
      }
    });

    it('should search units by query', async () => {
      const response = await request(app)
        .get('/api/search?q=TypeScript')
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should return paginated search results', async () => {
      const response = await request(app)
        .get('/api/search?q=TypeScript&page=1&pageSize=2')
        .expect(200);

      expect(response.body.pagination.pageSize).toBe(2);
    });

    it('should require search query', async () => {
      const response = await request(app)
        .get('/api/search')
        .expect(400);

      expect(response.body.error).toContain('query is required');
    });
  });

  describe('GET /api/stats', () => {
    beforeEach(() => {
      for (let i = 0; i < 3; i++) {
        db['db'].prepare(`
          INSERT INTO atomic_units (
            id, type, title, content, context, category, tags, keywords, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `unit-${i}`,
          ['insight', 'code', 'question'][i],
          `Title ${i}`,
          `Content ${i}`,
          'context',
          'programming',
          '[]',
          '[]',
          new Date().toISOString()
        );
      }
    });

    it('should return database statistics', async () => {
      const response = await request(app)
        .get('/api/stats')
        .expect(200);

      expect(response.body.data.units).toBe(3);
      expect(response.body.data.typeDistribution).toBeDefined();
      expect(response.body.data.categoryDistribution).toBeDefined();
    });

    it('should include type distribution', async () => {
      const response = await request(app)
        .get('/api/stats')
        .expect(200);

      expect(response.body.data.typeDistribution.insight).toBe(1);
      expect(response.body.data.typeDistribution.code).toBe(1);
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data.uptime).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const response = await request(app)
        .get('/api/units/invalid%00id')
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should return appropriate error codes', async () => {
      const response = await request(app)
        .post('/api/units')
        .send({})
        .expect(400);

      expect(response.body.code).toBeDefined();
      expect(response.body.statusCode).toBe(400);
    });
  });
});
