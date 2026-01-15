/**
 * Filter Builder - Converts SearchFilter objects to SQL and ChromaDB queries
 * Handles complex filter compositions (AND/OR/NOT) safely with prepared statements
 */

import { Logger } from './logger.js';

const logger = new Logger({ context: 'filter-builder' });

/**
 * Supported filter operators
 */
export type FilterOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'contains' | 'regex' | 'between';

/**
 * Individual filter condition
 */
export interface SearchFilter {
  field: string;
  operator: FilterOperator;
  value: any;
  negate?: boolean;
}

/**
 * Group of filters with AND/OR logic
 */
export interface FilterGroup {
  operator: 'AND' | 'OR';
  filters: (SearchFilter | FilterGroup)[];
  negate?: boolean;
}

/**
 * Result of building a SQL WHERE clause
 */
export interface SqlWhereResult {
  where: string;
  params: any[];
}

/**
 * Result of building a ChromaDB where clause
 */
export interface ChromaWhereResult {
  where?: Record<string, any>;
  error?: string;
}

/**
 * Validates field names to prevent SQL injection
 */
export const ALLOWED_FIELDS = new Set([
  'id',
  'type',
  'title',
  'content',
  'context',
  'category',
  'timestamp',
  'created',
  'tags',
  'keywords',
  'conversationId',
  'embedding_status'
]);

/**
 * FilterBuilder class - Converts filters to database queries
 */
export class FilterBuilder {
  /**
   * Validate filter structure and field names
   */
  validate(filter: SearchFilter | FilterGroup | (SearchFilter | FilterGroup)[]): boolean {
    try {
      if (Array.isArray(filter)) {
        return filter.every(f => this.validateSingle(f));
      }
      return this.validateSingle(filter);
    } catch (error) {
      logger.error('Filter validation error: ' + error);
      return false;
    }
  }

  private validateSingle(filter: SearchFilter | FilterGroup): boolean {
    if ('filters' in filter) {
      // It's a FilterGroup
      if (!['AND', 'OR'].includes(filter.operator)) {
        return false;
      }
      return filter.filters.every(f => this.validateSingle(f));
    }

    // It's a SearchFilter
    if (!ALLOWED_FIELDS.has(filter.field)) {
      logger.warn('Invalid field in filter: ' + filter.field);
      return false;
    }

    return true;
  }

  /**
   * Convert filters to SQL WHERE clause with prepared statement parameters
   */
  toSQL(filters: SearchFilter | FilterGroup | (SearchFilter | FilterGroup)[] | null | undefined): SqlWhereResult {
    if (!filters) {
      return { where: '', params: [] };
    }

    if (Array.isArray(filters) && filters.length === 0) {
      return { where: '', params: [] };
    }

    try {
      const filterArray = Array.isArray(filters) ? filters : [filters];
      const parts: string[] = [];
      const params: any[] = [];

      for (const filter of filterArray) {
        const result = this.filterToSQL(filter);
        if (result.where) {
          parts.push(result.where);
          params.push(...result.params);
        }
      }

      if (parts.length === 0) {
        return { where: '', params: [] };
      }

      return {
        where: parts.length === 1 ? parts[0] : '(' + parts.join(' AND ') + ')',
        params
      };
    } catch (error) {
      logger.error('SQL conversion error: ' + error);
      throw new Error('Failed to convert filters to SQL: ' + error);
    }
  }

  private filterToSQL(filter: SearchFilter | FilterGroup): SqlWhereResult {
    if ('filters' in filter) {
      return this.groupToSQL(filter);
    }

    return this.singleFilterToSQL(filter);
  }

  private singleFilterToSQL(filter: SearchFilter): SqlWhereResult {
    const field = filter.field;
    const operator = filter.operator;
    const value = filter.value;
    const negate = filter.negate || false;

    let where = '';
    let params: any[] = [];

    switch (operator) {
      case '=':
        where = field + ' = ?';
        params = [value];
        break;

      case '!=':
        where = field + ' != ?';
        params = [value];
        break;

      case '>':
        where = field + ' > ?';
        params = [value];
        break;

      case '<':
        where = field + ' < ?';
        params = [value];
        break;

      case '>=':
        where = field + ' >= ?';
        params = [value];
        break;

      case '<=':
        where = field + ' <= ?';
        params = [value];
        break;

      case 'in':
        if (!Array.isArray(value) || value.length === 0) {
          return { where: '', params: [] };
        }
        where = field + ' IN (' + value.map(() => '?').join(',') + ')';
        params = value;
        break;

      case 'contains':
        where = field + " LIKE '%' || ? || '%'";
        params = [value];
        break;

      case 'regex':
        where = field + ' REGEXP ?';
        params = [value];
        break;

      case 'between':
        if (!Array.isArray(value) || value.length !== 2) {
          return { where: '', params: [] };
        }
        where = field + ' BETWEEN ? AND ?';
        params = value;
        break;

      default:
        throw new Error('Unknown operator: ' + operator);
    }

    if (negate) {
      where = 'NOT (' + where + ')';
    }

    return { where, params };
  }

  private groupToSQL(group: FilterGroup): SqlWhereResult {
    const parts: string[] = [];
    const params: any[] = [];

    for (const filter of group.filters) {
      const result = this.filterToSQL(filter);
      if (result.where) {
        parts.push(result.where);
        params.push(...result.params);
      }
    }

    if (parts.length === 0) {
      return { where: '', params: [] };
    }

    const joiner = ' ' + group.operator + ' ';
    let where = parts.length === 1 ? parts[0] : '(' + parts.join(joiner) + ')';

    if (group.negate) {
      where = 'NOT (' + where + ')';
    }

    return { where, params };
  }

  /**
   * Convert filters to ChromaDB where clause
   * Note: ChromaDB has limited filter support compared to SQL
   */
  toChromaWhere(filters: SearchFilter | FilterGroup | (SearchFilter | FilterGroup)[] | null): ChromaWhereResult {
    if (!filters) {
      return {};
    }

    try {
      const filterArray = Array.isArray(filters) ? filters : [filters];
      const where = this.buildChromaWhere(filterArray);
      if (Object.keys(where).length === 0) {
        return {};
      }
      return { where };
    } catch (error) {
      logger.warn('ChromaDB conversion error (will fall back to post-filtering): ' + error);
      return { error: error as string };
    }
  }

  private buildChromaWhere(filters: (SearchFilter | FilterGroup)[]): Record<string, any> {
    const conditions: Record<string, any>[] = [];

    for (const filter of filters) {
      const condition = this.filterToChromaCondition(filter);
      if (condition) {
        conditions.push(condition);
      }
    }

    if (conditions.length === 0) {
      return {};
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    // Combine with AND
    return {
      '$and': conditions
    };
  }

  private filterToChromaCondition(filter: SearchFilter | FilterGroup): Record<string, any> | null {
    if ('filters' in filter) {
      // FilterGroup - merge sub-conditions
      const subConditions: Record<string, any>[] = [];

      for (const f of filter.filters) {
        const condition = this.filterToChromaCondition(f);
        if (condition) {
          subConditions.push(condition);
        }
      }

      if (subConditions.length === 0) {
        return null;
      }

      const operator = filter.operator === 'AND' ? '$and' : '$or';
      const result = subConditions.length === 1
        ? subConditions[0]
        : { [operator]: subConditions };

      if (filter.negate) {
        return { '$not': result };
      }

      return result;
    }

    // SearchFilter - convert to ChromaDB condition
    const { field, operator, value, negate } = filter;

    let condition: Record<string, any> | null = null;

    // ChromaDB supports: ==, !=, >, <, >=, <=, $in, $nin, $and, $or, $not
    switch (operator) {
      case '=':
        condition = { [field]: { '$eq': value } };
        break;

      case '!=':
        condition = { [field]: { '$ne': value } };
        break;

      case '>':
        condition = { [field]: { '$gt': value } };
        break;

      case '<':
        condition = { [field]: { '$lt': value } };
        break;

      case '>=':
        condition = { [field]: { '$gte': value } };
        break;

      case '<=':
        condition = { [field]: { '$lte': value } };
        break;

      case 'in':
        condition = { [field]: { '$in': value } };
        break;

      default:
        // ChromaDB doesn't support contains, regex, between
        return null;
    }

    if (!condition) {
      return null;
    }

    if (negate) {
      return { '$not': condition };
    }

    return condition;
  }

  /**
   * Optimize filter order (put indexed fields first for better query performance)
   */
  optimize(filters: SearchFilter | FilterGroup | (SearchFilter | FilterGroup)[]): SearchFilter | FilterGroup | (SearchFilter | FilterGroup)[] {
    // For now, return as-is. In the future, could reorder for index usage.
    return filters;
  }

  /**
   * Parse date string to Date object
   */
  parseDate(dateString: string): Date {
    const isoMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format: ' + dateString + '. Use ISO 8601 (e.g., 2024-01-01)');
    }
    return date;
  }

  /**
   * Parse relative date (e.g., "last 7 days")
   */
  parseRelativeDate(relative: string): Date {
    const now = new Date();
    const match = relative.match(/last\s+(\d+)\s+(day|week|month|year)s?/i);

    if (!match) {
      throw new Error('Unknown relative date format: ' + relative);
    }

    const [, amount, unit] = match;
    const num = parseInt(amount, 10);

    const date = new Date(now);

    switch (unit.toLowerCase()) {
      case 'day':
        date.setDate(date.getDate() - num);
        break;
      case 'week':
        date.setDate(date.getDate() - (num * 7));
        break;
      case 'month':
        date.setMonth(date.getMonth() - num);
        break;
      case 'year':
        date.setFullYear(date.getFullYear() - num);
        break;
    }

    return date;
  }

  /**
   * Parse date range (e.g., "2024-01-01 to 2024-12-31")
   */
  parseDateRange(rangeString: string): { start: Date; end: Date } {
    const parts = rangeString.split(/\s+to\s+/i);

    if (parts.length !== 2) {
      throw new Error('Invalid date range format. Use "YYYY-MM-DD to YYYY-MM-DD"');
    }

    return {
      start: this.parseDate(parts[0].trim()),
      end: this.parseDate(parts[1].trim())
    };
  }
}

/**
 * Create default FilterBuilder instance
 */
export function createFilterBuilder(): FilterBuilder {
  return new FilterBuilder();
}
