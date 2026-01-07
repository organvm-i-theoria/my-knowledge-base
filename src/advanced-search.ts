/**
 * Advanced Search with Filters and Facets
 */

import { Logger } from './logger.js';

const logger = new Logger({ context: 'advanced-search' });

export interface SearchFilter {
  field: string;
  operator: '=' | '!=' | '>' | '<' | 'in' | 'contains' | 'regex';
  value: any;
}

export interface FacetConfig {
  field: string;
  type: 'terms' | 'numeric' | 'date';
  size?: number;
}

export interface FacetResult {
  field: string;
  buckets: Array<{
    value: any;
    count: number;
  }>;
}

export interface AdvancedSearchResult {
  hits: Array<{
    id: string;
    title: string;
    content: string;
    score: number;
  }>;
  total: number;
  facets: FacetResult[];
  filters: SearchFilter[];
  queryTime: number;
}

/**
 * Advanced Search Engine
 */
export class AdvancedSearch {
  /**
   * Apply filters to dataset
   */
  applyFilters(data: any[], filters: SearchFilter[]): any[] {
    return data.filter(item => {
      return filters.every(filter => this.matchesFilter(item, filter));
    });
  }

  /**
   * Check if item matches filter
   */
  private matchesFilter(item: any, filter: SearchFilter): boolean {
    const value = item[filter.field];

    switch (filter.operator) {
      case '=':
        return value === filter.value;
      case '!=':
        return value !== filter.value;
      case '>':
        return value > filter.value;
      case '<':
        return value < filter.value;
      case 'in':
        return Array.isArray(filter.value) && filter.value.includes(value);
      case 'contains':
        return typeof value === 'string' && value.includes(filter.value);
      case 'regex':
        return new RegExp(filter.value).test(value);
      default:
        return true;
    }
  }

  /**
   * Generate facets for field
   */
  generateFacets(data: any[], config: FacetConfig): FacetResult {
    const buckets = new Map<any, number>();

    data.forEach(item => {
      const value = item[config.field];
      if (value !== undefined && value !== null) {
        const key = config.type === 'terms' ? String(value) : value;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
    });

    const sorted = Array.from(buckets.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, config.size || 10)
      .map(([value, count]) => ({ value, count }));

    return {
      field: config.field,
      buckets: sorted,
    };
  }

  /**
   * Generate all facets
   */
  generateAllFacets(data: any[], configs: FacetConfig[]): FacetResult[] {
    return configs.map(config => this.generateFacets(data, config));
  }

  /**
   * Score documents based on query
   */
  scoreDocuments(
    documents: any[],
    query: string,
    searchFields: string[] = ['title', 'content']
  ): Array<{ id: string; score: number }> {
    const queryTerms = query.toLowerCase().split(/\s+/);

    return documents.map(doc => {
      let score = 0;

      searchFields.forEach((field, fieldIndex) => {
        const content = (doc[field] || '').toLowerCase();
        const fieldWeight = fieldIndex === 0 ? 2 : 1; // Title weighs more

        queryTerms.forEach(term => {
          const matches = (content.match(new RegExp(term, 'g')) || []).length;
          score += matches * fieldWeight;
        });
      });

      return {
        id: doc.id,
        score,
      };
    });
  }

  /**
   * Perform advanced search
   */
  search(
    documents: any[],
    options: {
      query?: string;
      filters?: SearchFilter[];
      facets?: FacetConfig[];
      limit?: number;
      offset?: number;
      searchFields?: string[];
    } = {}
  ): AdvancedSearchResult {
    const startTime = Date.now();

    let results = [...documents];

    // Apply filters
    if (options.filters && options.filters.length > 0) {
      results = this.applyFilters(results, options.filters);
    }

    // Score and sort
    if (options.query) {
      const scores = this.scoreDocuments(results, options.query, options.searchFields);
      const scoreMap = new Map(scores.map(s => [s.id, s.score]));

      results = results
        .filter(r => (scoreMap.get(r.id) || 0) > 0)
        .sort((a, b) => (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0));
    }

    // Generate facets before pagination
    const facets = options.facets
      ? this.generateAllFacets(results, options.facets)
      : [];

    // Pagination
    const limit = options.limit || 20;
    const offset = options.offset || 0;
    const paginatedResults = results.slice(offset, offset + limit);

    const hits = paginatedResults.map(doc => ({
      id: doc.id,
      title: doc.title || '',
      content: doc.content || '',
      score: 1,
    }));

    const queryTime = Date.now() - startTime;

    logger.debug(`Advanced search completed in ${queryTime}ms`);

    return {
      hits,
      total: results.length,
      facets,
      filters: options.filters || [],
      queryTime,
    };
  }
}

/**
 * Saved search
 */
export interface SavedSearch {
  id: string;
  name: string;
  query?: string;
  filters: SearchFilter[];
  facets: FacetConfig[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Saved Search Manager
 */
export class SavedSearchManager {
  private searches: Map<string, SavedSearch> = new Map();

  saveSearch(
    id: string,
    name: string,
    query: string | undefined,
    filters: SearchFilter[],
    facets: FacetConfig[]
  ): SavedSearch {
    const search: SavedSearch = {
      id,
      name,
      query,
      filters,
      facets,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.searches.set(id, search);
    logger.info('Saved search: ' + name);
    return search;
  }

  getSearch(id: string): SavedSearch | undefined {
    return this.searches.get(id);
  }

  listSearches(): SavedSearch[] {
    return Array.from(this.searches.values());
  }

  updateSearch(id: string, updates: Partial<SavedSearch>): SavedSearch {
    const search = this.searches.get(id);
    if (!search) throw new Error('Search not found: ' + id);

    const updated = { ...search, ...updates, updatedAt: new Date() };
    this.searches.set(id, updated);
    logger.info('Updated search: ' + id);
    return updated;
  }

  deleteSearch(id: string): void {
    this.searches.delete(id);
    logger.info('Deleted search: ' + id);
  }
}

/**
 * Smart Collections - automatic grouping
 */
export interface SmartCollection {
  id: string;
  name: string;
  description: string;
  criteria: SearchFilter[];
  tags: string[];
  autoUpdate: boolean;
  createdAt: Date;
}

export class SmartCollectionManager {
  private collections: Map<string, SmartCollection> = new Map();

  create(
    id: string,
    name: string,
    description: string,
    criteria: SearchFilter[]
  ): SmartCollection {
    const collection: SmartCollection = {
      id,
      name,
      description,
      criteria,
      tags: [],
      autoUpdate: true,
      createdAt: new Date(),
    };

    this.collections.set(id, collection);
    logger.info('Created smart collection: ' + name);
    return collection;
  }

  getCollection(id: string): SmartCollection | undefined {
    return this.collections.get(id);
  }

  listCollections(): SmartCollection[] {
    return Array.from(this.collections.values());
  }

  addTag(collectionId: string, tag: string): SmartCollection {
    const collection = this.collections.get(collectionId);
    if (!collection) throw new Error('Collection not found');

    if (!collection.tags.includes(tag)) {
      collection.tags.push(tag);
    }

    return collection;
  }

  removeTag(collectionId: string, tag: string): SmartCollection {
    const collection = this.collections.get(collectionId);
    if (!collection) throw new Error('Collection not found');

    collection.tags = collection.tags.filter(t => t !== tag);
    return collection;
  }

  delete(id: string): void {
    this.collections.delete(id);
    logger.info('Deleted smart collection: ' + id);
  }
}
