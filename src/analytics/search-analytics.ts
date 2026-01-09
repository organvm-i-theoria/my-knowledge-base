/**
 * Search Analytics Tracker - Track search queries and performance
 * Logs all searches for analytics, trending, and quality measurement
 */

import { logger } from '../logger.js';
import Database from 'better-sqlite3';

export interface SearchQuery {
  id: string;
  query: string;
  normalizedQuery: string;
  searchType: 'fts' | 'semantic' | 'hybrid';
  timestamp: string;
  latencyMs: number;
  resultCount: number;
  userSession?: string;
  filters?: string;
  clickedResult?: string;
  metadata?: string;
}

/**
 * SearchAnalyticsTracker - Track search activity
 */
export class SearchAnalyticsTracker {
  private db: Database.Database;

  constructor(dbPath: string = './db/knowledge.db') {
    this.db = new Database(dbPath);
  }

  /**
   * Track a search query
   */
  trackQuery(options: {
    query: string;
    searchType: 'fts' | 'semantic' | 'hybrid';
    latencyMs: number;
    resultCount: number;
    userSession?: string;
    filters?: Record<string, any>;
  }): void {
    try {
      const normalized = options.query.toLowerCase().trim();
      const id = 'query_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

      const stmt = this.db.prepare(`
        INSERT INTO search_queries
        (id, query, normalized_query, search_type, timestamp, latency_ms, result_count, user_session, filters)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        options.query,
        normalized,
        options.searchType,
        new Date().toISOString(),
        options.latencyMs,
        options.resultCount,
        options.userSession || null,
        options.filters ? JSON.stringify(options.filters) : null
      );

      logger.debug('Tracked search: ' + options.searchType + ' query: ' + options.query);
    } catch (error) {
      logger.error('Failed to track query: ' + error);
    }
  }

  /**
   * Track a result click
   */
  trackClick(queryId: string, resultId: string): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE search_queries SET clicked_result = ? WHERE id = ?
      `);

      stmt.run(resultId, queryId);
    } catch (error) {
      logger.error('Failed to track click: ' + error);
    }
  }

  /**
   * Get popular queries in time window
   */
  getPopularQueries(days: number = 7, limit: number = 20): Array<{
    query: string;
    count: number;
    avgLatency: number;
    avgResults: number;
  }> {
    try {
      const minDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const stmt = this.db.prepare(`
        SELECT
          query,
          COUNT(*) as count,
          AVG(latency_ms) as avgLatency,
          AVG(result_count) as avgResults
        FROM search_queries
        WHERE timestamp >= ?
        GROUP BY normalized_query
        ORDER BY count DESC
        LIMIT ?
      `);

      return stmt.all(minDate, limit) as Array<{
        query: string;
        count: number;
        avgLatency: number;
        avgResults: number;
      }>;
    } catch (error) {
      logger.error('Failed to get popular queries: ' + error);
      return [];
    }
  }

  /**
   * Get search statistics
   */
  getStatistics(days: number = 7): {
    totalQueries: number;
    uniqueQueries: number;
    avgLatency: number;
    avgResults: number;
    byType: Record<string, { count: number; avgLatency: number }>;
  } {
    try {
      const minDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const totalStmt = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          COUNT(DISTINCT normalized_query) as unique,
          AVG(latency_ms) as avgLatency,
          AVG(result_count) as avgResults
        FROM search_queries
        WHERE timestamp >= ?
      `);

      const totalResult = totalStmt.get(minDate) as {
        total: number;
        unique: number;
        avgLatency: number;
        avgResults: number;
      };

      const byTypeStmt = this.db.prepare(`
        SELECT
          search_type,
          COUNT(*) as count,
          AVG(latency_ms) as avgLatency
        FROM search_queries
        WHERE timestamp >= ?
        GROUP BY search_type
      `);

      const byType: Record<string, { count: number; avgLatency: number }> = {};

      const typeResults = byTypeStmt.all(minDate) as Array<{
        search_type: string;
        count: number;
        avgLatency: number;
      }>;

      for (const result of typeResults) {
        byType[result.search_type] = {
          count: result.count,
          avgLatency: result.avgLatency
        };
      }

      return {
        totalQueries: totalResult.total,
        uniqueQueries: totalResult.unique,
        avgLatency: totalResult.avgLatency,
        avgResults: totalResult.avgResults,
        byType
      };
    } catch (error) {
      logger.error('Failed to get statistics: ' + error);
      return {
        totalQueries: 0,
        uniqueQueries: 0,
        avgLatency: 0,
        avgResults: 0,
        byType: {}
      };
    }
  }

  /**
   * Clean up old queries
   */
  cleanupOldQueries(daysToKeep: number = 90): number {
    try {
      const minDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

      const stmt = this.db.prepare(`
        DELETE FROM search_queries WHERE timestamp < ?
      `);

      const result = stmt.run(minDate);
      const deleted = result.changes || 0;

      logger.info('Cleaned up ' + deleted + ' old queries');
      return deleted;
    } catch (error) {
      logger.error('Failed to cleanup queries: ' + error);
      return 0;
    }
  }
}

export function createAnalyticsTracker(dbPath?: string): SearchAnalyticsTracker {
  return new SearchAnalyticsTracker(dbPath);
}
