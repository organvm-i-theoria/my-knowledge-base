/**
 * Tests for Saved Searches feature
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { existsSync, mkdirSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import {
  SavedSearchesManager,
  SavedSearch,
  SavedSearchType,
  CreateSavedSearchInput,
} from './saved-searches.js';

const TEST_DB_DIR = './.test-tmp';
const TEST_DB_PATH = join(TEST_DB_DIR, 'saved-searches-test.db');

describe('SavedSearchesManager', () => {
  let manager: SavedSearchesManager;
  let testDb: Database.Database;

  beforeAll(() => {
    // Create test directory
    if (!existsSync(TEST_DB_DIR)) {
      mkdirSync(TEST_DB_DIR, { recursive: true });
    }

    // Remove existing test database if present
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    // Initialize test database with required schema
    testDb = new Database(TEST_DB_PATH);
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS atomic_units (
        id TEXT PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL,
        type TEXT NOT NULL,
        created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        context TEXT,
        conversation_id TEXT,
        document_id TEXT,
        category TEXT,
        embedding BLOB,
        section_type TEXT,
        hierarchy_level INTEGER DEFAULT 0,
        parent_section_id TEXT,
        tags TEXT DEFAULT '[]',
        keywords TEXT DEFAULT '[]'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS units_fts USING fts5(
        title, content, context, tags,
        content=atomic_units,
        content_rowid=rowid
      );

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS unit_tags (
        unit_id TEXT,
        tag_id INTEGER,
        FOREIGN KEY (unit_id) REFERENCES atomic_units(id),
        FOREIGN KEY (tag_id) REFERENCES tags(id),
        PRIMARY KEY (unit_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS unit_keywords (
        unit_id TEXT,
        keyword_id INTEGER,
        FOREIGN KEY (unit_id) REFERENCES atomic_units(id),
        FOREIGN KEY (keyword_id) REFERENCES keywords(id),
        PRIMARY KEY (unit_id, keyword_id)
      );

      CREATE TABLE IF NOT EXISTS unit_relationships (
        from_unit TEXT,
        to_unit TEXT,
        relationship_type TEXT,
        FOREIGN KEY (from_unit) REFERENCES atomic_units(id),
        FOREIGN KEY (to_unit) REFERENCES atomic_units(id),
        PRIMARY KEY (from_unit, to_unit, relationship_type)
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT,
        created TIMESTAMP,
        url TEXT,
        exported_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT,
        content TEXT,
        created TIMESTAMP,
        modified TIMESTAMP,
        url TEXT,
        format TEXT,
        metadata TEXT,
        exported_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS search_queries (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        normalized_query TEXT NOT NULL,
        search_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        latency_ms INTEGER,
        result_count INTEGER,
        user_session TEXT,
        filters TEXT,
        clicked_result TEXT
      );
    `);

    // Insert some test units for search testing
    const now = new Date().toISOString();
    testDb.exec(`
      INSERT INTO atomic_units (id, timestamp, type, created, title, content, context, category, tags, keywords)
      VALUES
        ('unit-1', '${now}', 'insight', '${now}', 'TypeScript Best Practices', 'Learn TypeScript best practices for better code quality', 'Programming context', 'programming', '["typescript", "best-practices"]', '["typescript", "code"]'),
        ('unit-2', '${now}', 'code', '${now}', 'React Component Example', 'Example React component with hooks', 'React tutorial', 'programming', '["react", "hooks"]', '["react", "component"]'),
        ('unit-3', '${now}', 'reference', '${now}', 'Database Schema Design', 'Guidelines for designing database schemas', 'Architecture docs', 'design', '["database", "schema"]', '["database", "design"]');

      INSERT INTO units_fts (rowid, title, content, context, tags)
      SELECT rowid, title, content, context, tags FROM atomic_units;
    `);

    testDb.close();
  });

  afterAll(() => {
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      try {
        unlinkSync(TEST_DB_PATH);
      } catch {
        // Ignore cleanup errors
      }
    }
    // Clean up test directory
    try {
      rmSync(TEST_DB_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Create fresh manager for each test
    if (manager) {
      try {
        manager.close();
      } catch {
        // Ignore close errors
      }
    }
    manager = new SavedSearchesManager(TEST_DB_PATH);

    // Clean up saved_searches table
    const db = new Database(TEST_DB_PATH);
    db.exec('DELETE FROM saved_searches');
    db.close();
  });

  describe('saveSearch', () => {
    it('should create a new saved search', () => {
      const input: CreateSavedSearchInput = {
        name: 'My TypeScript Search',
        query: 'typescript',
        searchType: 'fts',
      };

      const result = manager.saveSearch(input);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe('My TypeScript Search');
      expect(result.query).toBe('typescript');
      expect(result.searchType).toBe('fts');
      expect(result.executionCount).toBe(0);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a saved search with filters', () => {
      const input: CreateSavedSearchInput = {
        name: 'Filtered Search',
        query: 'react',
        searchType: 'hybrid',
        filters: {
          category: 'programming',
          tags: ['react', 'hooks'],
          dateFrom: '2024-01-01',
        },
      };

      const result = manager.saveSearch(input);

      expect(result.filters).toEqual({
        category: 'programming',
        tags: ['react', 'hooks'],
        dateFrom: '2024-01-01',
      });
    });

    it('should create saved searches with different search types', () => {
      const types: SavedSearchType[] = ['fts', 'semantic', 'hybrid'];

      for (const searchType of types) {
        const result = manager.saveSearch({
          name: `${searchType} Search`,
          query: 'test',
          searchType,
        });
        expect(result.searchType).toBe(searchType);
      }
    });
  });

  describe('getSavedSearch', () => {
    it('should retrieve a saved search by ID', () => {
      const created = manager.saveSearch({
        name: 'Test Search',
        query: 'test query',
        searchType: 'fts',
      });

      const retrieved = manager.getSavedSearch(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.name).toBe('Test Search');
    });

    it('should return null for non-existent ID', () => {
      const result = manager.getSavedSearch('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('getSavedSearchByName', () => {
    it('should retrieve a saved search by name', () => {
      manager.saveSearch({
        name: 'Unique Name',
        query: 'test',
        searchType: 'fts',
      });

      const result = manager.getSavedSearchByName('Unique Name');

      expect(result).toBeDefined();
      expect(result!.name).toBe('Unique Name');
    });

    it('should return null for non-existent name', () => {
      const result = manager.getSavedSearchByName('Does Not Exist');
      expect(result).toBeNull();
    });
  });

  describe('listSavedSearches', () => {
    it('should list all saved searches with pagination', () => {
      // Create multiple searches
      for (let i = 1; i <= 5; i++) {
        manager.saveSearch({
          name: `Search ${i}`,
          query: `query ${i}`,
          searchType: 'fts',
        });
      }

      const { searches, total } = manager.listSavedSearches({ limit: 3, offset: 0 });

      expect(searches.length).toBe(3);
      expect(total).toBe(5);
    });

    it('should sort by different fields', () => {
      manager.saveSearch({ name: 'Alpha', query: 'a', searchType: 'fts' });
      manager.saveSearch({ name: 'Beta', query: 'b', searchType: 'fts' });

      const { searches: ascResults } = manager.listSavedSearches({
        sortBy: 'name',
        sortOrder: 'ASC',
      });

      expect(ascResults[0].name).toBe('Alpha');
      expect(ascResults[1].name).toBe('Beta');

      const { searches: descResults } = manager.listSavedSearches({
        sortBy: 'name',
        sortOrder: 'DESC',
      });

      expect(descResults[0].name).toBe('Beta');
      expect(descResults[1].name).toBe('Alpha');
    });

    it('should handle empty list', () => {
      const { searches, total } = manager.listSavedSearches();
      expect(searches).toEqual([]);
      expect(total).toBe(0);
    });
  });

  describe('updateSavedSearch', () => {
    it('should update saved search name', () => {
      const created = manager.saveSearch({
        name: 'Original Name',
        query: 'test',
        searchType: 'fts',
      });

      const updated = manager.updateSavedSearch(created.id, { name: 'New Name' });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('New Name');
      expect(updated!.query).toBe('test'); // Unchanged
    });

    it('should update saved search query', () => {
      const created = manager.saveSearch({
        name: 'Test',
        query: 'original query',
        searchType: 'fts',
      });

      const updated = manager.updateSavedSearch(created.id, { query: 'new query' });

      expect(updated!.query).toBe('new query');
    });

    it('should update saved search type', () => {
      const created = manager.saveSearch({
        name: 'Test',
        query: 'test',
        searchType: 'fts',
      });

      const updated = manager.updateSavedSearch(created.id, { searchType: 'hybrid' });

      expect(updated!.searchType).toBe('hybrid');
    });

    it('should update saved search filters', () => {
      const created = manager.saveSearch({
        name: 'Test',
        query: 'test',
        searchType: 'fts',
      });

      const updated = manager.updateSavedSearch(created.id, {
        filters: { category: 'programming', tags: ['react'] },
      });

      expect(updated!.filters).toEqual({ category: 'programming', tags: ['react'] });
    });

    it('should return null for non-existent ID', () => {
      const result = manager.updateSavedSearch('non-existent', { name: 'test' });
      expect(result).toBeNull();
    });

    it('should update the updatedAt timestamp', async () => {
      const created = manager.saveSearch({
        name: 'Test',
        query: 'test',
        searchType: 'fts',
      });

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = manager.updateSavedSearch(created.id, { name: 'Updated' });

      expect(updated!.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
    });
  });

  describe('deleteSavedSearch', () => {
    it('should delete a saved search', () => {
      const created = manager.saveSearch({
        name: 'To Delete',
        query: 'test',
        searchType: 'fts',
      });

      const deleted = manager.deleteSavedSearch(created.id);
      expect(deleted).toBe(true);

      const retrieved = manager.getSavedSearch(created.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent ID', () => {
      const deleted = manager.deleteSavedSearch('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('executeSearch', () => {
    it('should execute FTS search and return results', async () => {
      const created = manager.saveSearch({
        name: 'TypeScript Search',
        query: 'typescript',
        searchType: 'fts',
      });

      const result = await manager.executeSearch(created.id);

      expect(result).toBeDefined();
      expect(result!.savedSearch.id).toBe(created.id);
      expect(result!.executionTime).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result!.results)).toBe(true);
    });

    it('should increment execution count after search', async () => {
      const created = manager.saveSearch({
        name: 'Test Search',
        query: 'test',
        searchType: 'fts',
      });

      expect(created.executionCount).toBe(0);

      await manager.executeSearch(created.id);

      const updated = manager.getSavedSearch(created.id);
      expect(updated!.executionCount).toBe(1);
    });

    it('should update lastExecutedAt after search', async () => {
      const created = manager.saveSearch({
        name: 'Test Search',
        query: 'test',
        searchType: 'fts',
      });

      expect(created.lastExecutedAt).toBeUndefined();

      await manager.executeSearch(created.id);

      const updated = manager.getSavedSearch(created.id);
      expect(updated!.lastExecutedAt).toBeInstanceOf(Date);
    });

    it('should return null for non-existent search', async () => {
      const result = await manager.executeSearch('non-existent');
      expect(result).toBeNull();
    });

    it('should apply category filter during execution', async () => {
      const created = manager.saveSearch({
        name: 'Programming Search',
        query: 'react',
        searchType: 'fts',
        filters: { category: 'programming' },
      });

      const result = await manager.executeSearch(created.id);

      // All results should have category 'programming'
      for (const unit of result!.results) {
        expect(unit.category).toBe('programming');
      }
    });
  });

  describe('getPopularSearches', () => {
    it('should return searches ordered by execution count', async () => {
      const search1 = manager.saveSearch({ name: 'Search 1', query: 'a', searchType: 'fts' });
      const search2 = manager.saveSearch({ name: 'Search 2', query: 'b', searchType: 'fts' });

      // Execute search2 more times
      await manager.executeSearch(search1.id);
      await manager.executeSearch(search2.id);
      await manager.executeSearch(search2.id);
      await manager.executeSearch(search2.id);

      const popular = manager.getPopularSearches(10);

      expect(popular.length).toBe(2);
      expect(popular[0].id).toBe(search2.id);
      expect(popular[0].executionCount).toBe(3);
      expect(popular[1].id).toBe(search1.id);
      expect(popular[1].executionCount).toBe(1);
    });

    it('should exclude searches with zero executions', async () => {
      manager.saveSearch({ name: 'Never Executed', query: 'test', searchType: 'fts' });

      const popular = manager.getPopularSearches(10);

      expect(popular.length).toBe(0);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        const search = manager.saveSearch({ name: `Search ${i}`, query: 'test', searchType: 'fts' });
        await manager.executeSearch(search.id);
      }

      const popular = manager.getPopularSearches(3);

      expect(popular.length).toBe(3);
    });
  });

  describe('getRecentlyExecutedSearches', () => {
    it('should return recently executed searches', async () => {
      const search1 = manager.saveSearch({ name: 'Search 1', query: 'a', searchType: 'fts' });
      const search2 = manager.saveSearch({ name: 'Search 2', query: 'b', searchType: 'fts' });

      await manager.executeSearch(search1.id);
      await new Promise(resolve => setTimeout(resolve, 10));
      await manager.executeSearch(search2.id);

      const recent = manager.getRecentlyExecutedSearches(10);

      expect(recent.length).toBe(2);
      expect(recent[0].id).toBe(search2.id); // Most recent first
    });

    it('should exclude never-executed searches', () => {
      manager.saveSearch({ name: 'Never Executed', query: 'test', searchType: 'fts' });

      const recent = manager.getRecentlyExecutedSearches(10);

      expect(recent.length).toBe(0);
    });
  });

  describe('searchSavedSearches', () => {
    it('should find searches by name', () => {
      manager.saveSearch({ name: 'TypeScript Guide', query: 'ts', searchType: 'fts' });
      manager.saveSearch({ name: 'React Tutorial', query: 'react', searchType: 'fts' });

      const results = manager.searchSavedSearches('TypeScript');

      expect(results.length).toBe(1);
      expect(results[0].name).toBe('TypeScript Guide');
    });

    it('should find searches by query', () => {
      manager.saveSearch({ name: 'Guide 1', query: 'find database', searchType: 'fts' });
      manager.saveSearch({ name: 'Guide 2', query: 'find react', searchType: 'fts' });

      const results = manager.searchSavedSearches('database');

      expect(results.length).toBe(1);
      expect(results[0].query).toContain('database');
    });

    it('should be case-insensitive', () => {
      manager.saveSearch({ name: 'UPPERCASE NAME', query: 'test', searchType: 'fts' });

      const results = manager.searchSavedSearches('uppercase');

      expect(results.length).toBe(1);
    });
  });

  describe('searchNameExists', () => {
    it('should return true for existing name', () => {
      manager.saveSearch({ name: 'Existing Name', query: 'test', searchType: 'fts' });

      expect(manager.searchNameExists('Existing Name')).toBe(true);
    });

    it('should return false for non-existing name', () => {
      expect(manager.searchNameExists('Does Not Exist')).toBe(false);
    });

    it('should exclude specified ID when checking', () => {
      const created = manager.saveSearch({ name: 'My Search', query: 'test', searchType: 'fts' });

      // Should return false when excluding the search's own ID
      expect(manager.searchNameExists('My Search', created.id)).toBe(false);

      // Should return true when not excluding
      expect(manager.searchNameExists('My Search')).toBe(true);
    });
  });

  describe('filters parsing', () => {
    it('should preserve all filter types', () => {
      const created = manager.saveSearch({
        name: 'Full Filters',
        query: 'test',
        searchType: 'fts',
        filters: {
          category: 'programming',
          type: 'code',
          tags: ['react', 'typescript'],
          dateFrom: '2024-01-01',
          dateTo: '2024-12-31',
        },
      });

      const retrieved = manager.getSavedSearch(created.id);

      expect(retrieved!.filters).toEqual({
        category: 'programming',
        type: 'code',
        tags: ['react', 'typescript'],
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
      });
    });

    it('should handle empty filters', () => {
      const created = manager.saveSearch({
        name: 'No Filters',
        query: 'test',
        searchType: 'fts',
      });

      const retrieved = manager.getSavedSearch(created.id);

      expect(retrieved!.filters).toEqual({});
    });
  });
});
