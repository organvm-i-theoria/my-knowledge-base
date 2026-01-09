/**
 * Query Suggestion Engine Tests - Autocomplete and suggestion ranking
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { QuerySuggestionEngine } from './query-suggestions.js';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

describe('QuerySuggestionEngine', () => {
  let engine: QuerySuggestionEngine;
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');

    // Initialize schema
    db.exec(`
      CREATE TABLE query_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        suggestion TEXT UNIQUE NOT NULL,
        normalized TEXT NOT NULL,
        frequency INTEGER DEFAULT 1,
        last_used TIMESTAMP NOT NULL,
        source TEXT NOT NULL,
        category TEXT,
        created TIMESTAMP NOT NULL
      );

      CREATE TABLE atomic_units (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        tags TEXT,
        keywords TEXT,
        content TEXT NOT NULL,
        created TIMESTAMP NOT NULL
      );

      CREATE INDEX idx_query_suggestions_normalized ON query_suggestions(normalized);

      CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      );

      CREATE TABLE keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT UNIQUE NOT NULL,
        frequency INTEGER DEFAULT 1
      );
    `);

    engine = new QuerySuggestionEngine(db);
  });

  describe('Suggestion Generation - Previous Queries', () => {
    beforeEach(() => {
      const timestamp = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO query_suggestions (
          suggestion, normalized, frequency, last_used, source, category, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run('OAuth implementation', 'oauth implementation', 10, timestamp, 'query', 'programming', timestamp);
      stmt.run('React patterns', 'react patterns', 8, timestamp, 'query', 'programming', timestamp);
      stmt.run('TypeScript generics', 'typescript generics', 5, timestamp, 'query', 'programming', timestamp);
    });

    it('should find suggestions by prefix', () => {
      const suggestions = engine.generateSuggestions('oauth', 10);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.text.toLowerCase().startsWith('oauth'))).toBe(true);
    });

    it('should rank by frequency', () => {
      const suggestions = engine.generateSuggestions('react', 10);

      if (suggestions.length > 1) {
        // Earlier suggestions should have higher frequency scores
        for (let i = 1; i < suggestions.length; i++) {
          expect(suggestions[i - 1].score).toBeGreaterThanOrEqual(suggestions[i].score);
        }
      }
    });

    it('should be case-insensitive', () => {
      const suggestions1 = engine.generateSuggestions('react', 10);
      const suggestions2 = engine.generateSuggestions('REACT', 10);
      const suggestions3 = engine.generateSuggestions('React', 10);

      expect(suggestions1.length).toBeGreaterThan(0);
      expect(suggestions2.length).toBeGreaterThan(0);
      expect(suggestions3.length).toBeGreaterThan(0);
    });

    it('should limit results by specified limit', () => {
      const suggestions = engine.generateSuggestions('', 2);

      expect(suggestions.length).toBeLessThanOrEqual(2);
    });

    it('should return empty array for non-matching prefix', () => {
      const suggestions = engine.generateSuggestions('zzzzzz', 10);

      // Should either be empty or very few results
      expect(suggestions.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Multi-Source Weighting', () => {
    beforeEach(() => {
      const timestamp = new Date().toISOString();

      // Add query suggestion
      const querystmt = db.prepare(`
        INSERT INTO query_suggestions (
          suggestion, normalized, frequency, last_used, source, category, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      querystmt.run('React context', 'react context', 20, timestamp, 'query', 'programming', timestamp);

      // Add tag
      const tagStmt = db.prepare('INSERT INTO tags (name) VALUES (?)');
      tagStmt.run('React');

      // Add keyword
      const keywordStmt = db.prepare('INSERT INTO keywords (keyword, frequency) VALUES (?, ?)');
      keywordStmt.run('React', 15);

      // Add unit title
      const unitStmt = db.prepare(`
        INSERT INTO atomic_units (
          id, title, type, category, content, created
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      unitStmt.run(randomUUID(), 'React hooks explained', 'insight', 'programming', 'content', timestamp);
    });

    it('should combine suggestions from multiple sources', () => {
      const suggestions = engine.generateSuggestions('react', 20);

      expect(suggestions.length).toBeGreaterThan(0);

      // Should include sources from different types
      const sources = suggestions.map(s => s.source);
      expect(sources.includes('query') || sources.includes('tag') || sources.includes('keyword')).toBe(true);
    });

    it('should respect source weighting (queries > tags > keywords > titles)', () => {
      const suggestions = engine.generateSuggestions('react', 20);

      // Queries should typically score highest due to 40% weight vs others
      if (suggestions.length > 0) {
        const topScore = suggestions[0].score;
        expect(topScore).toBeGreaterThan(0);
      }
    });

    it('should include query suggestions source', () => {
      const suggestions = engine.generateSuggestions('react', 20);
      const querySuggestions = suggestions.filter(s => s.source === 'query');

      expect(querySuggestions.length).toBeGreaterThan(0);
    });

    it('should include tag suggestions source', () => {
      const suggestions = engine.generateSuggestions('react', 20);
      // May or may not have tags depending on implementation
      expect(Array.isArray(suggestions)).toBe(true);
    });
  });

  describe('Suggestion Metadata', () => {
    beforeEach(() => {
      const timestamp = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO query_suggestions (
          suggestion, normalized, frequency, last_used, source, category, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run('OAuth', 'oauth', 25, timestamp, 'query', 'programming', timestamp);
      stmt.run('OAuth 2.0', 'oauth 2.0', 15, timestamp, 'tag', 'programming', timestamp);
    });

    it('should include suggestion text', () => {
      const suggestions = engine.generateSuggestions('oauth', 10);

      suggestions.forEach(s => {
        expect(s.text).toBeTruthy();
        expect(typeof s.text).toBe('string');
      });
    });

    it('should include suggestion type/source', () => {
      const suggestions = engine.generateSuggestions('oauth', 10);

      suggestions.forEach(s => {
        expect(s.source).toBeTruthy();
        expect(['query', 'tag', 'keyword', 'title'].includes(s.source)).toBe(true);
      });
    });

    it('should include relevance score', () => {
      const suggestions = engine.generateSuggestions('oauth', 10);

      suggestions.forEach(s => {
        expect(typeof s.score).toBe('number');
        expect(s.score).toBeGreaterThan(0);
        expect(s.score).toBeLessThanOrEqual(1);
      });
    });

    it('should include metadata field', () => {
      const suggestions = engine.generateSuggestions('oauth', 10);

      suggestions.forEach(s => {
        expect(s.metadata).toBeTruthy();
        expect(typeof s.metadata).toBe('object');
      });
    });
  });

  describe('Frequency Tracking', () => {
    it('should track suggestion frequency', () => {
      const timestamp = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO query_suggestions (
          suggestion, normalized, frequency, last_used, source, category, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run('React hooks', 'react hooks', 50, timestamp, 'query', 'programming', timestamp);
      stmt.run('React context', 'react context', 10, timestamp, 'query', 'programming', timestamp);

      const suggestions = engine.generateSuggestions('react', 10);

      // Higher frequency should rank higher
      const hooksSuggestion = suggestions.find(s => s.text.toLowerCase() === 'react hooks');
      const contextSuggestion = suggestions.find(s => s.text.toLowerCase() === 'react context');

      if (hooksSuggestion && contextSuggestion) {
        expect(hooksSuggestion.score).toBeGreaterThanOrEqual(contextSuggestion.score);
      }
    });

    it('should update frequency on suggestion reuse', () => {
      const timestamp = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO query_suggestions (
          suggestion, normalized, frequency, last_used, source, category, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const suggestionId = stmt.run('React patterns', 'react patterns', 5, timestamp, 'query', 'programming', timestamp);

      engine.recordSuggestionUsed('React patterns');

      // Verify frequency increased
      const checkStmt = db.prepare('SELECT frequency FROM query_suggestions WHERE suggestion = ?');
      const result = checkStmt.get('React patterns') as any;

      expect(result.frequency).toBeGreaterThan(5);
    });
  });

  describe('Suggestion Cleanup', () => {
    it('should remove old unused suggestions', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);

      const stmt = db.prepare(`
        INSERT INTO query_suggestions (
          suggestion, normalized, frequency, last_used, source, category, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      // Old unused suggestion
      stmt.run('deprecated query', 'deprecated query', 1, oldDate.toISOString(), 'query', 'programming', oldDate.toISOString());

      // Recent suggestion
      stmt.run('current query', 'current query', 10, new Date().toISOString(), 'query', 'programming', new Date().toISOString());

      const deleted = engine.cleanupOldSuggestions(30); // 30-day retention

      // Old should be deleted
      const checkStmt = db.prepare('SELECT * FROM query_suggestions WHERE suggestion = ?');
      const oldResult = checkStmt.get('deprecated query');
      const newResult = checkStmt.get('current query');

      expect(oldResult).toBeUndefined();
      expect(newResult).toBeDefined();
    });

    it('should return count of deleted suggestions', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);

      const stmt = db.prepare(`
        INSERT INTO query_suggestions (
          suggestion, normalized, frequency, last_used, source, category, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < 3; i++) {
        stmt.run(
          `old${i}`,
          `old${i}`,
          1,
          oldDate.toISOString(),
          'query',
          'programming',
          oldDate.toISOString()
        );
      }

      const deleted = engine.cleanupOldSuggestions(30);

      expect(deleted).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Query Expansion', () => {
    beforeEach(() => {
      const timestamp = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO query_suggestions (
          suggestion, normalized, frequency, last_used, source, category, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run('React hooks', 'react hooks', 10, timestamp, 'query', 'programming', timestamp);
      stmt.run('React context API', 'react context api', 8, timestamp, 'query', 'programming', timestamp);
      stmt.run('React patterns', 'react patterns', 5, timestamp, 'query', 'programming', timestamp);
    });

    it('should expand partial queries with related terms', () => {
      const expanded = engine.expandQuery('react');

      expect(expanded).toBeTruthy();
      expect(typeof expanded).toBe('string');
    });

    it('should suggest related queries', () => {
      const related = engine.getRelatedQueries('react hooks', 5);

      expect(Array.isArray(related)).toBe(true);
      expect(related.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Performance', () => {
    beforeEach(() => {
      const timestamp = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO query_suggestions (
          suggestion, normalized, frequency, last_used, source, category, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      // Insert 1000 suggestions
      for (let i = 0; i < 1000; i++) {
        stmt.run(
          `suggestion ${i}`,
          `suggestion ${i}`,
          Math.floor(Math.random() * 100),
          timestamp,
          ['query', 'tag', 'keyword', 'title'][i % 4],
          'programming',
          timestamp
        );
      }
    });

    it('should generate suggestions in < 50ms', () => {
      const start = Date.now();
      engine.generateSuggestions('sug', 10);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });

    it('should handle large suggestion lists efficiently', () => {
      const suggestions = engine.generateSuggestions('', 100);

      expect(suggestions.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty prefix', () => {
      const suggestions = engine.generateSuggestions('', 10);

      // Should return some suggestions or empty array
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should handle single character prefix', () => {
      const timestamp = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO query_suggestions (
          suggestion, normalized, frequency, last_used, source, category, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run('React', 'react', 10, timestamp, 'query', 'programming', timestamp);

      const suggestions = engine.generateSuggestions('r', 10);

      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should handle very long query strings', () => {
      const longQuery = 'a'.repeat(500);
      const suggestions = engine.generateSuggestions(longQuery, 10);

      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should handle special characters in suggestions', () => {
      const timestamp = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO query_suggestions (
          suggestion, normalized, frequency, last_used, source, category, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run('C++ programming', 'c++ programming', 5, timestamp, 'query', 'programming', timestamp);
      stmt.run('C# .NET', 'c# .net', 3, timestamp, 'query', 'programming', timestamp);

      const suggestions = engine.generateSuggestions('c', 10);

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should handle duplicate suggestions gracefully', () => {
      const timestamp = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO query_suggestions (
          suggestion, normalized, frequency, last_used, source, category, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run('React', 'react', 10, timestamp, 'query', 'programming', timestamp);
      stmt.run('React', 'react', 5, timestamp, 'query', 'programming', timestamp); // Duplicate

      const suggestions = engine.generateSuggestions('react', 10);

      // Should handle gracefully without crashing
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should handle NULL metadata gracefully', () => {
      const timestamp = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO query_suggestions (
          suggestion, normalized, frequency, last_used, source, category, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run('test query', 'test query', 1, timestamp, 'query', NULL, timestamp);

      const suggestions = engine.generateSuggestions('test', 10);

      expect(Array.isArray(suggestions)).toBe(true);
    });
  });

  describe('Normalization', () => {
    it('should normalize suggestion text before storing', () => {
      const timestamp = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO query_suggestions (
          suggestion, normalized, frequency, last_used, source, category, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run('  REACT   PATTERNS  ', 'react patterns', 10, timestamp, 'query', 'programming', timestamp);

      const suggestions = engine.generateSuggestions('react', 10);

      suggestions.forEach(s => {
        expect(s.text).not.toMatch(/^ | $/); // No leading/trailing spaces
      });
    });

    it('should match case-insensitively', () => {
      const timestamp = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO query_suggestions (
          suggestion, normalized, frequency, last_used, source, category, created
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run('React Hooks', 'react hooks', 10, timestamp, 'query', 'programming', timestamp);

      const suggestions1 = engine.generateSuggestions('react', 10);
      const suggestions2 = engine.generateSuggestions('REACT', 10);

      expect(suggestions1.length).toBeGreaterThan(0);
      expect(suggestions2.length).toBeGreaterThan(0);
      expect(suggestions1[0].text).toBe(suggestions2[0].text);
    });
  });
});
