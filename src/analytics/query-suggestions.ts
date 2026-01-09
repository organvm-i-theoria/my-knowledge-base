/**
 * Query Suggestion Engine - Generate autocomplete suggestions
 * Combines previous queries, tags, keywords, and titles
 */

import { logger } from '../logger.js';
import Database from 'better-sqlite3';

export interface SuggestionResult {
  text: string;
  type: 'query' | 'tag' | 'keyword' | 'title';
  score: number;
  metadata?: {
    frequency?: number;
    lastUsed?: string;
    resultCount?: number;
  };
}

const SOURCE_WEIGHTS = {
  query: 0.4,
  tag: 0.3,
  keyword: 0.2,
  title: 0.1
};

/**
 * QuerySuggestionEngine - Generate suggestions from multiple sources
 */
export class QuerySuggestionEngine {
  private db: Database.Database;

  constructor(dbPath: string = './db/knowledge.db') {
    this.db = new Database(dbPath);
  }

  /**
   * Generate suggestions for partial query
   */
  generateSuggestions(prefix: string, limit: number = 10): SuggestionResult[] {
    if (prefix.length < 1) {
      return [];
    }

    const likePrefix = prefix + '%';
    const suggestions: Map<string, SuggestionResult> = new Map();

    // 1. Get previous queries (40% weight)
    const queryMatches = this.getPreviousQueries(likePrefix, limit);
    for (const q of queryMatches) {
      const key = q.toLowerCase();
      if (!suggestions.has(key)) {
        suggestions.set(key, {
          text: q,
          type: 'query',
          score: SOURCE_WEIGHTS.query * (1 + Math.log(1 + 1) / 10),
          metadata: {}
        });
      }
    }

    // 2. Get tags (30% weight)
    const tagMatches = this.getTags(likePrefix, limit);
    for (const tag of tagMatches) {
      const key = tag.toLowerCase();
      if (!suggestions.has(key)) {
        suggestions.set(key, {
          text: tag,
          type: 'tag',
          score: SOURCE_WEIGHTS.tag,
          metadata: {}
        });
      }
    }

    // 3. Get keywords (20% weight)
    const keywordMatches = this.getKeywords(likePrefix, limit);
    for (const kw of keywordMatches) {
      const key = kw.toLowerCase();
      if (!suggestions.has(key)) {
        suggestions.set(key, {
          text: kw,
          type: 'keyword',
          score: SOURCE_WEIGHTS.keyword,
          metadata: {}
        });
      }
    }

    // 4. Get title suggestions (10% weight)
    const titleMatches = this.getTitles(likePrefix, limit);
    for (const title of titleMatches) {
      const key = title.toLowerCase();
      if (!suggestions.has(key)) {
        suggestions.set(key, {
          text: title,
          type: 'title',
          score: SOURCE_WEIGHTS.title,
          metadata: {}
        });
      }
    }

    // Sort by score and return top N
    return Array.from(suggestions.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Get previous queries matching prefix
   */
  private getPreviousQueries(prefix: string, limit: number): string[] {
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT query FROM query_suggestions
        WHERE normalized LIKE ?
        ORDER BY frequency DESC
        LIMIT ?
      `);

      const results = stmt.all(prefix.toLowerCase() + '%', limit) as Array<{ query: string }>;
      return results.map(r => r.query || '');
    } catch {
      return [];
    }
  }

  /**
   * Get tags matching prefix
   */
  private getTags(prefix: string, limit: number): string[] {
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT name FROM tags
        WHERE name LIKE ?
        ORDER BY name
        LIMIT ?
      `);

      const results = stmt.all(prefix, limit) as Array<{ name: string }>;
      return results.map(r => r.name);
    } catch {
      return [];
    }
  }

  /**
   * Get keywords matching prefix
   */
  private getKeywords(prefix: string, limit: number): string[] {
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT keyword FROM keywords
        WHERE keyword LIKE ?
        ORDER BY keyword
        LIMIT ?
      `);

      const results = stmt.all(prefix, limit) as Array<{ keyword: string }>;
      return results.map(r => r.keyword);
    } catch {
      return [];
    }
  }

  /**
   * Get unit titles matching prefix
   */
  private getTitles(prefix: string, limit: number): string[] {
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT title FROM atomic_units
        WHERE title LIKE ?
        ORDER BY created DESC
        LIMIT ?
      `);

      const results = stmt.all(prefix, limit) as Array<{ title: string }>;
      return results.map(r => r.title);
    } catch {
      return [];
    }
  }

  /**
   * Save suggestion to database
   */
  saveSuggestion(suggestion: string, source: 'query_log' | 'tags' | 'keywords' | 'titles'): void {
    try {
      const normalized = suggestion.toLowerCase();
      const now = new Date().toISOString();

      const stmt = this.db.prepare(`
        INSERT INTO query_suggestions (suggestion, normalized, frequency, last_used, source, created)
        VALUES (?, ?, 1, ?, ?, ?)
        ON CONFLICT(suggestion) DO UPDATE SET
          frequency = frequency + 1,
          last_used = excluded.last_used
      `);

      stmt.run(suggestion, normalized, now, source, now);
    } catch (error) {
      logger.error('Failed to save suggestion: ' + error);
    }
  }

  /**
   * Update suggestions from analytics
   */
  updateFromAnalytics(): void {
    try {
      // Get top queries from last 7 days
      const minDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const topQueriesStmt = this.db.prepare(`
        SELECT query, COUNT(*) as count
        FROM search_queries
        WHERE timestamp >= ?
        GROUP BY normalized_query
        ORDER BY count DESC
        LIMIT 100
      `);

      const queries = topQueriesStmt.all(minDate) as Array<{ query: string; count: number }>;

      for (const q of queries) {
        this.saveSuggestion(q.query, 'query_log');
      }

      logger.info('Updated suggestions from analytics: ' + queries.length + ' queries');
    } catch (error) {
      logger.error('Failed to update from analytics: ' + error);
    }
  }

  /**
   * Cleanup old suggestions
   */
  cleanup(daysToKeep: number = 30): number {
    try {
      const minDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

      const stmt = this.db.prepare(`
        DELETE FROM query_suggestions
        WHERE last_used < ? AND frequency < 2
      `);

      const result = stmt.run(minDate);
      return result.changes || 0;
    } catch (error) {
      logger.error('Failed to cleanup suggestions: ' + error);
      return 0;
    }
  }
}

export function createSuggestionEngine(dbPath?: string): QuerySuggestionEngine {
  return new QuerySuggestionEngine(dbPath);
}
