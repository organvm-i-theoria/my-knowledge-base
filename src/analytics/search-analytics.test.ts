/**
 * Search Analytics Tests - Comprehensive test suite for query tracking and analytics
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SearchAnalyticsTracker } from './search-analytics.js';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

describe('SearchAnalyticsTracker', () => {
  let tracker: SearchAnalyticsTracker;
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory test database
    db = new Database(':memory:');

    // Initialize schema
    db.exec(`
      CREATE TABLE search_queries (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        normalized_query TEXT NOT NULL,
        search_type TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        latency_ms INTEGER NOT NULL,
        result_count INTEGER NOT NULL,
        user_session TEXT,
        filters TEXT,
        clicked_result TEXT,
        metadata TEXT
      );

      CREATE TABLE popular_queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        normalized_query TEXT NOT NULL,
        search_type TEXT,
        count INTEGER NOT NULL,
        window_start TIMESTAMP NOT NULL,
        window_end TIMESTAMP NOT NULL,
        avg_latency_ms REAL,
        avg_result_count REAL,
        UNIQUE(normalized_query, window_start, window_end)
      );

      CREATE INDEX idx_search_queries_timestamp ON search_queries(timestamp DESC);
      CREATE INDEX idx_search_queries_normalized ON search_queries(normalized_query);
    `);

    tracker = new SearchAnalyticsTracker(db);
  });

  describe('Query Tracking', () => {
    it('should track a search query with all fields', () => {
      const queryId = tracker.trackQuery({
        query: 'OAuth implementation',
        searchType: 'hybrid',
        latency: 150,
        resultCount: 23,
        userSession: 'session-123',
        filters: [{ field: 'type', value: 'code' }],
      });

      expect(queryId).toBeTruthy();
      expect(typeof queryId).toBe('string');

      // Verify in database
      const stmt = db.prepare('SELECT * FROM search_queries WHERE id = ?');
      const result = stmt.get(queryId) as any;

      expect(result).toBeDefined();
      expect(result.query).toBe('OAuth implementation');
      expect(result.search_type).toBe('hybrid');
      expect(result.latency_ms).toBe(150);
      expect(result.result_count).toBe(23);
    });

    it('should normalize query text', () => {
      const queryId = tracker.trackQuery({
        query: 'OAUTH  IMPLEMENTATION',
        searchType: 'fts',
        latency: 100,
        resultCount: 10,
      });

      const stmt = db.prepare('SELECT normalized_query FROM search_queries WHERE id = ?');
      const result = stmt.get(queryId) as any;

      expect(result.normalized_query).toBe('oauth implementation');
    });

    it('should generate unique query IDs', () => {
      const id1 = tracker.trackQuery({
        query: 'test',
        searchType: 'fts',
        latency: 100,
        resultCount: 5,
      });

      const id2 = tracker.trackQuery({
        query: 'test',
        searchType: 'fts',
        latency: 100,
        resultCount: 5,
      });

      expect(id1).not.toBe(id2);
    });

    it('should store optional fields when provided', () => {
      const filters = [{ field: 'category', value: 'programming' }];
      const queryId = tracker.trackQuery({
        query: 'test',
        searchType: 'semantic',
        latency: 200,
        resultCount: 15,
        userSession: 'user-456',
        filters,
      });

      const stmt = db.prepare('SELECT * FROM search_queries WHERE id = ?');
      const result = stmt.get(queryId) as any;

      expect(result.user_session).toBe('user-456');
      expect(result.filters).toBeTruthy();
    });

    it('should handle missing optional fields gracefully', () => {
      const queryId = tracker.trackQuery({
        query: 'minimal query',
        searchType: 'fts',
        latency: 50,
        resultCount: 3,
      });

      const stmt = db.prepare('SELECT * FROM search_queries WHERE id = ?');
      const result = stmt.get(queryId) as any;

      expect(result.user_session).toBeNull();
      expect(result.filters).toBeNull();
      expect(result.clicked_result).toBeNull();
    });

    it('should track timestamp with millisecond precision', () => {
      const queryId = tracker.trackQuery({
        query: 'test',
        searchType: 'fts',
        latency: 100,
        resultCount: 5,
      });

      const stmt = db.prepare('SELECT timestamp FROM search_queries WHERE id = ?');
      const result = stmt.get(queryId) as any;

      expect(result.timestamp).toBeTruthy();
      // Should be valid ISO timestamp
      expect(() => new Date(result.timestamp)).not.toThrow();
    });
  });

  describe('Click Tracking', () => {
    it('should track result clicks', () => {
      const queryId = tracker.trackQuery({
        query: 'test',
        searchType: 'fts',
        latency: 100,
        resultCount: 5,
      });

      const resultId = 'unit-123';
      tracker.trackClick(queryId, resultId);

      // Verify in database
      const stmt = db.prepare('SELECT clicked_result FROM search_queries WHERE id = ?');
      const result = stmt.get(queryId) as any;

      expect(result.clicked_result).toBe(resultId);
    });

    it('should update click for existing query', () => {
      const queryId = tracker.trackQuery({
        query: 'test',
        searchType: 'fts',
        latency: 100,
        resultCount: 5,
      });

      const resultId1 = 'unit-123';
      const resultId2 = 'unit-456';

      tracker.trackClick(queryId, resultId1);
      tracker.trackClick(queryId, resultId2); // Last click should win

      const stmt = db.prepare('SELECT clicked_result FROM search_queries WHERE id = ?');
      const result = stmt.get(queryId) as any;

      expect(result.clicked_result).toBe(resultId2);
    });

    it('should handle click on non-existent query gracefully', () => {
      expect(() => {
        tracker.trackClick('non-existent-id', 'unit-123');
      }).not.toThrow();
    });
  });

  describe('Popular Queries Analysis', () => {
    beforeEach(() => {
      // Insert sample queries
      const timestamp = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO search_queries (
          id, query, normalized_query, search_type, 
          timestamp, latency_ms, result_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      // Same query multiple times
      for (let i = 0; i < 5; i++) {
        stmt.run(randomUUID(), 'OAuth implementation', 'oauth implementation', 'hybrid', timestamp, 150 + i, 20);
      }

      // Different queries
      for (let i = 0; i < 3; i++) {
        stmt.run(randomUUID(), 'TypeScript basics', 'typescript basics', 'fts', timestamp, 100, 15);
      }

      stmt.run(randomUUID(), 'React patterns', 'react patterns', 'semantic', timestamp, 200, 30);
    });

    it('should retrieve popular queries', () => {
      const popular = tracker.getPopularQueries({
        limit: 10,
        windowDays: 1,
      });

      expect(popular.length).toBeGreaterThan(0);
      expect(popular[0].query).toBeTruthy();
      expect(popular[0].count).toBeGreaterThan(0);
    });

    it('should rank by frequency', () => {
      const popular = tracker.getPopularQueries({
        limit: 10,
        windowDays: 1,
      });

      if (popular.length > 1) {
        expect(popular[0].count).toBeGreaterThanOrEqual(popular[1].count);
      }
    });

    it('should limit results by count', () => {
      const popular = tracker.getPopularQueries({
        limit: 2,
        windowDays: 1,
      });

      expect(popular.length).toBeLessThanOrEqual(2);
    });

    it('should calculate average latency', () => {
      const popular = tracker.getPopularQueries({
        limit: 10,
        windowDays: 1,
      });

      popular.forEach(query => {
        if (query.avgLatency !== undefined) {
          expect(query.avgLatency).toBeGreaterThan(0);
        }
      });
    });

    it('should calculate average result count', () => {
      const popular = tracker.getPopularQueries({
        limit: 10,
        windowDays: 1,
      });

      popular.forEach(query => {
        if (query.avgResults !== undefined) {
          expect(query.avgResults).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Query Metrics', () => {
    beforeEach(() => {
      const timestamp = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO search_queries (
          id, query, normalized_query, search_type,
          timestamp, latency_ms, result_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      // Insert varied queries with different latencies
      const latencies = [50, 100, 150, 200, 250, 300];
      latencies.forEach((latency, i) => {
        stmt.run(
          randomUUID(),
          `query${i}`,
          `query${i}`,
          'hybrid',
          timestamp,
          latency,
          Math.floor(Math.random() * 50) + 10
        );
      });
    });

    it('should calculate average latency', () => {
      const metrics = tracker.getQueryMetrics({
        windowDays: 1,
      });

      expect(metrics.avgLatency).toBeGreaterThan(0);
      expect(metrics.avgLatency).toBeLessThan(1000);
    });

    it('should calculate total query count', () => {
      const metrics = tracker.getQueryMetrics({
        windowDays: 1,
      });

      expect(metrics.totalQueries).toBeGreaterThan(0);
    });

    it('should track search type distribution', () => {
      const metrics = tracker.getQueryMetrics({
        windowDays: 1,
      });

      expect(metrics.bySearchType).toBeTruthy();
      expect(typeof metrics.bySearchType).toBe('object');
    });
  });

  describe('Query Cleanup', () => {
    it('should remove old queries based on retention policy', () => {
      // Insert old query (90+ days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 95);

      const stmt = db.prepare(`
        INSERT INTO search_queries (
          id, query, normalized_query, search_type,
          timestamp, latency_ms, result_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const oldQueryId = randomUUID();
      stmt.run(oldQueryId, 'old query', 'old query', 'fts', oldDate.toISOString(), 100, 5);

      // New query
      const newQueryId = randomUUID();
      stmt.run(newQueryId, 'new query', 'new query', 'fts', new Date().toISOString(), 100, 5);

      // Cleanup old queries (90-day retention)
      tracker.cleanupOldQueries(90);

      // Old should be deleted, new should remain
      const checkStmt = db.prepare('SELECT id FROM search_queries WHERE id = ?');

      const oldResult = checkStmt.get(oldQueryId);
      const newResult = checkStmt.get(newQueryId);

      expect(oldResult).toBeUndefined();
      expect(newResult).toBeDefined();
    });

    it('should preserve recent queries', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10);

      const stmt = db.prepare(`
        INSERT INTO search_queries (
          id, query, normalized_query, search_type,
          timestamp, latency_ms, result_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const queryId = randomUUID();
      stmt.run(queryId, 'recent', 'recent', 'fts', recentDate.toISOString(), 100, 5);

      tracker.cleanupOldQueries(90); // 90-day retention

      const checkStmt = db.prepare('SELECT id FROM search_queries WHERE id = ?');
      const result = checkStmt.get(queryId);

      expect(result).toBeDefined();
    });

    it('should return count of deleted queries', () => {
      // Insert multiple old queries
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);

      const stmt = db.prepare(`
        INSERT INTO search_queries (
          id, query, normalized_query, search_type,
          timestamp, latency_ms, result_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < 3; i++) {
        stmt.run(randomUUID(), `old${i}`, `old${i}`, 'fts', oldDate.toISOString(), 100, 5);
      }

      const deleted = tracker.cleanupOldQueries(90);

      expect(deleted).toBe(3);
    });
  });

  describe('Query Normalization', () => {
    it('should normalize whitespace', () => {
      const queryId1 = tracker.trackQuery({
        query: 'react   patterns',
        searchType: 'fts',
        latency: 100,
        resultCount: 5,
      });

      const queryId2 = tracker.trackQuery({
        query: 'react patterns',
        searchType: 'fts',
        latency: 100,
        resultCount: 5,
      });

      const stmt = db.prepare('SELECT normalized_query FROM search_queries WHERE id = ?');
      const norm1 = (stmt.get(queryId1) as any).normalized_query;
      const norm2 = (stmt.get(queryId2) as any).normalized_query;

      expect(norm1).toBe(norm2);
    });

    it('should convert to lowercase', () => {
      const queryId = tracker.trackQuery({
        query: 'TYPESCRIPT PATTERNS',
        searchType: 'fts',
        latency: 100,
        resultCount: 5,
      });

      const stmt = db.prepare('SELECT normalized_query FROM search_queries WHERE id = ?');
      const result = stmt.get(queryId) as any;

      expect(result.normalized_query).toBe('typescript patterns');
    });

    it('should trim whitespace', () => {
      const queryId = tracker.trackQuery({
        query: '  react patterns  ',
        searchType: 'fts',
        latency: 100,
        resultCount: 5,
      });

      const stmt = db.prepare('SELECT normalized_query FROM search_queries WHERE id = ?');
      const result = stmt.get(queryId) as any;

      expect(result.normalized_query).toBe('react patterns');
      expect(result.normalized_query.charAt(0)).not.toBe(' ');
      expect(result.normalized_query.charAt(result.normalized_query.length - 1)).not.toBe(' ');
    });
  });

  describe('Performance', () => {
    it('should track query in < 10ms', () => {
      const start = Date.now();
      tracker.trackQuery({
        query: 'performance test',
        searchType: 'hybrid',
        latency: 100,
        resultCount: 10,
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10);
    });

    it('should track multiple queries efficiently', () => {
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        tracker.trackQuery({
          query: `query ${i}`,
          searchType: 'fts',
          latency: 100 + i,
          resultCount: 10,
        });
      }
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty query string', () => {
      const queryId = tracker.trackQuery({
        query: '',
        searchType: 'fts',
        latency: 100,
        resultCount: 0,
      });

      expect(queryId).toBeTruthy();
    });

    it('should handle very long query strings', () => {
      const longQuery = 'a'.repeat(1000);
      const queryId = tracker.trackQuery({
        query: longQuery,
        searchType: 'fts',
        latency: 100,
        resultCount: 5,
      });

      expect(queryId).toBeTruthy();

      const stmt = db.prepare('SELECT query FROM search_queries WHERE id = ?');
      const result = stmt.get(queryId) as any;
      expect(result.query.length).toBe(1000);
    });

    it('should handle zero latency', () => {
      const queryId = tracker.trackQuery({
        query: 'cached result',
        searchType: 'fts',
        latency: 0,
        resultCount: 10,
      });

      expect(queryId).toBeTruthy();

      const stmt = db.prepare('SELECT latency_ms FROM search_queries WHERE id = ?');
      const result = stmt.get(queryId) as any;
      expect(result.latency_ms).toBe(0);
    });

    it('should handle zero result count', () => {
      const queryId = tracker.trackQuery({
        query: 'no results',
        searchType: 'fts',
        latency: 100,
        resultCount: 0,
      });

      expect(queryId).toBeTruthy();
    });
  });
});
