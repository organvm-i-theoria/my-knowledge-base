/**
 * Saved Searches - Core implementation for saving, managing, and executing searches
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { KnowledgeDatabase } from './database.js';
import { HybridSearch, HybridSearchResult } from './hybrid-search.js';
import { AtomicUnit } from './types.js';

/**
 * Search type enum
 */
export type SavedSearchType = 'fts' | 'semantic' | 'hybrid';

/**
 * Search filters interface
 */
export interface SavedSearchFilters {
  category?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  type?: string;
}

/**
 * Saved Search interface
 */
export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  searchType: SavedSearchType;
  filters: SavedSearchFilters;
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
  executionCount: number;
}

/**
 * Create input for saved search
 */
export interface CreateSavedSearchInput {
  name: string;
  query: string;
  searchType: SavedSearchType;
  filters?: SavedSearchFilters;
}

/**
 * Update input for saved search
 */
export interface UpdateSavedSearchInput {
  name?: string;
  query?: string;
  searchType?: SavedSearchType;
  filters?: SavedSearchFilters;
}

/**
 * Search execution result
 */
export interface SearchExecutionResult {
  savedSearch: SavedSearch;
  results: AtomicUnit[];
  executionTime: number;
  total: number;
}

/**
 * Popular search result
 */
export interface PopularSearch {
  id: string;
  name: string;
  query: string;
  searchType: SavedSearchType;
  executionCount: number;
  lastExecutedAt?: Date;
}

/**
 * Saved Searches Manager
 */
export class SavedSearchesManager {
  private db: Database.Database;
  private knowledgeDb: KnowledgeDatabase;
  private hybridSearch: HybridSearch | null = null;

  constructor(
    dbPath: string = './db/knowledge.db',
    vectorDbPath: string = './atomized/embeddings/chroma'
  ) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.knowledgeDb = new KnowledgeDatabase(dbPath);

    // Try to initialize hybrid search (may fail if embeddings not available)
    try {
      this.hybridSearch = new HybridSearch(dbPath, vectorDbPath);
    } catch {
      // Hybrid/semantic search not available
    }

    this.initSchema();
  }

  /**
   * Initialize the saved_searches table
   */
  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS saved_searches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        query TEXT NOT NULL,
        search_type TEXT NOT NULL CHECK(search_type IN ('fts', 'semantic', 'hybrid')),
        filters TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_executed_at TEXT,
        execution_count INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_saved_searches_name ON saved_searches(name);
      CREATE INDEX IF NOT EXISTS idx_saved_searches_execution_count ON saved_searches(execution_count DESC);
      CREATE INDEX IF NOT EXISTS idx_saved_searches_last_executed ON saved_searches(last_executed_at DESC);
    `);
  }

  /**
   * Save a new search
   */
  saveSearch(input: CreateSavedSearchInput): SavedSearch {
    const id = randomUUID();
    const now = new Date().toISOString();
    const filters = input.filters || {};

    const stmt = this.db.prepare(`
      INSERT INTO saved_searches (id, name, query, search_type, filters, created_at, updated_at, execution_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);

    stmt.run(
      id,
      input.name,
      input.query,
      input.searchType,
      JSON.stringify(filters),
      now,
      now
    );

    return {
      id,
      name: input.name,
      query: input.query,
      searchType: input.searchType,
      filters,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      executionCount: 0,
    };
  }

  /**
   * Get a saved search by ID
   */
  getSavedSearch(id: string): SavedSearch | null {
    const stmt = this.db.prepare(`
      SELECT * FROM saved_searches WHERE id = ?
    `);

    const row = stmt.get(id) as any | undefined;
    if (!row) return null;

    return this.rowToSavedSearch(row);
  }

  /**
   * Get a saved search by name
   */
  getSavedSearchByName(name: string): SavedSearch | null {
    const stmt = this.db.prepare(`
      SELECT * FROM saved_searches WHERE name = ? LIMIT 1
    `);

    const row = stmt.get(name) as any | undefined;
    if (!row) return null;

    return this.rowToSavedSearch(row);
  }

  /**
   * List all saved searches
   */
  listSavedSearches(options: {
    limit?: number;
    offset?: number;
    sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'executionCount' | 'lastExecutedAt';
    sortOrder?: 'ASC' | 'DESC';
  } = {}): { searches: SavedSearch[]; total: number } {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const sortBy = options.sortBy ?? 'createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    // Map sort field to column name
    const sortColumnMap: Record<string, string> = {
      name: 'name',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      executionCount: 'execution_count',
      lastExecutedAt: 'last_executed_at',
    };

    const sortColumn = sortColumnMap[sortBy] || 'created_at';

    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM saved_searches');
    const countResult = countStmt.get() as { count: number };

    const stmt = this.db.prepare(`
      SELECT * FROM saved_searches
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(limit, offset) as any[];

    return {
      searches: rows.map(row => this.rowToSavedSearch(row)),
      total: countResult.count,
    };
  }

  /**
   * Update a saved search
   */
  updateSavedSearch(id: string, updates: UpdateSavedSearchInput): SavedSearch | null {
    const existing = this.getSavedSearch(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updateFields: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (updates.name !== undefined) {
      updateFields.push('name = ?');
      values.push(updates.name);
    }

    if (updates.query !== undefined) {
      updateFields.push('query = ?');
      values.push(updates.query);
    }

    if (updates.searchType !== undefined) {
      updateFields.push('search_type = ?');
      values.push(updates.searchType);
    }

    if (updates.filters !== undefined) {
      updateFields.push('filters = ?');
      values.push(JSON.stringify(updates.filters));
    }

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE saved_searches SET ${updateFields.join(', ')} WHERE id = ?
    `);

    stmt.run(...values);

    return this.getSavedSearch(id);
  }

  /**
   * Delete a saved search
   */
  deleteSavedSearch(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM saved_searches WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Execute a saved search
   */
  async executeSearch(
    id: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<SearchExecutionResult | null> {
    const savedSearch = this.getSavedSearch(id);
    if (!savedSearch) return null;

    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const startTime = Date.now();

    let results: AtomicUnit[] = [];
    let total = 0;

    // Execute based on search type
    switch (savedSearch.searchType) {
      case 'fts':
        const ftsResult = this.executeFtsSearch(savedSearch.query, savedSearch.filters, limit, offset);
        results = ftsResult.results;
        total = ftsResult.total;
        break;

      case 'semantic':
      case 'hybrid':
        if (this.hybridSearch) {
          try {
            const weights = savedSearch.searchType === 'semantic'
              ? { fts: 0.2, semantic: 0.8 }
              : { fts: 0.4, semantic: 0.6 };

            const hybridResults = await this.hybridSearch.search(
              savedSearch.query,
              limit + offset,
              weights,
              {
                dateFrom: savedSearch.filters.dateFrom,
                dateTo: savedSearch.filters.dateTo,
              }
            );

            results = hybridResults.slice(offset, offset + limit).map(r => r.unit);
            total = hybridResults.length;

            // Apply additional filters
            results = this.applyFilters(results, savedSearch.filters);
          } catch {
            // Fallback to FTS
            const ftsResult = this.executeFtsSearch(savedSearch.query, savedSearch.filters, limit, offset);
            results = ftsResult.results;
            total = ftsResult.total;
          }
        } else {
          // Fallback to FTS if hybrid not available
          const ftsResult = this.executeFtsSearch(savedSearch.query, savedSearch.filters, limit, offset);
          results = ftsResult.results;
          total = ftsResult.total;
        }
        break;
    }

    const executionTime = Date.now() - startTime;

    // Update execution stats
    this.updateExecutionStats(id);

    // Refresh the saved search to get updated stats
    const updatedSearch = this.getSavedSearch(id)!;

    return {
      savedSearch: updatedSearch,
      results,
      executionTime,
      total,
    };
  }

  /**
   * Execute FTS search with filters
   */
  private executeFtsSearch(
    query: string,
    filters: SavedSearchFilters,
    limit: number,
    offset: number
  ): { results: AtomicUnit[]; total: number } {
    const { results, total } = this.knowledgeDb.searchTextPaginated(query, offset, limit);
    const filteredResults = this.applyFilters(results, filters);
    return { results: filteredResults, total };
  }

  /**
   * Apply filters to results
   */
  private applyFilters(results: AtomicUnit[], filters: SavedSearchFilters): AtomicUnit[] {
    let filtered = results;

    if (filters.category) {
      filtered = filtered.filter(u => u.category === filters.category);
    }

    if (filters.type) {
      filtered = filtered.filter(u => u.type === filters.type);
    }

    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter(u =>
        filters.tags!.some(tag => u.tags.includes(tag))
      );
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom).getTime();
      filtered = filtered.filter(u => u.timestamp.getTime() >= fromDate);
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo).getTime();
      filtered = filtered.filter(u => u.timestamp.getTime() <= toDate);
    }

    return filtered;
  }

  /**
   * Update execution stats for a saved search
   */
  private updateExecutionStats(id: string) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE saved_searches
      SET execution_count = execution_count + 1,
          last_executed_at = ?
      WHERE id = ?
    `);
    stmt.run(now, id);
  }

  /**
   * Get popular searches (most executed)
   */
  getPopularSearches(limit: number = 10): PopularSearch[] {
    const stmt = this.db.prepare(`
      SELECT id, name, query, search_type, execution_count, last_executed_at
      FROM saved_searches
      WHERE execution_count > 0
      ORDER BY execution_count DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      query: row.query,
      searchType: row.search_type as SavedSearchType,
      executionCount: row.execution_count,
      lastExecutedAt: row.last_executed_at ? new Date(row.last_executed_at) : undefined,
    }));
  }

  /**
   * Get recently executed searches
   */
  getRecentlyExecutedSearches(limit: number = 10): SavedSearch[] {
    const stmt = this.db.prepare(`
      SELECT * FROM saved_searches
      WHERE last_executed_at IS NOT NULL
      ORDER BY last_executed_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as any[];
    return rows.map(row => this.rowToSavedSearch(row));
  }

  /**
   * Search saved searches by name or query
   */
  searchSavedSearches(searchTerm: string, limit: number = 20): SavedSearch[] {
    const likeTerm = `%${searchTerm}%`;
    const stmt = this.db.prepare(`
      SELECT * FROM saved_searches
      WHERE name LIKE ? OR query LIKE ?
      ORDER BY execution_count DESC
      LIMIT ?
    `);

    const rows = stmt.all(likeTerm, likeTerm, limit) as any[];
    return rows.map(row => this.rowToSavedSearch(row));
  }

  /**
   * Convert database row to SavedSearch object
   */
  private rowToSavedSearch(row: any): SavedSearch {
    let filters: SavedSearchFilters = {};
    try {
      filters = JSON.parse(row.filters || '{}');
    } catch {
      filters = {};
    }

    return {
      id: row.id,
      name: row.name,
      query: row.query,
      searchType: row.search_type as SavedSearchType,
      filters,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastExecutedAt: row.last_executed_at ? new Date(row.last_executed_at) : undefined,
      executionCount: row.execution_count,
    };
  }

  /**
   * Check if a search name already exists
   */
  searchNameExists(name: string, excludeId?: string): boolean {
    let stmt;
    if (excludeId) {
      stmt = this.db.prepare('SELECT 1 FROM saved_searches WHERE name = ? AND id != ? LIMIT 1');
      return stmt.get(name, excludeId) !== undefined;
    } else {
      stmt = this.db.prepare('SELECT 1 FROM saved_searches WHERE name = ? LIMIT 1');
      return stmt.get(name) !== undefined;
    }
  }

  /**
   * Close database connections
   */
  close() {
    this.db.close();
    this.knowledgeDb.close();
    if (this.hybridSearch) {
      this.hybridSearch.close();
    }
  }
}
