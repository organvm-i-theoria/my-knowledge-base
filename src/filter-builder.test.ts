import { describe, it, expect } from 'vitest';
import { FilterBuilder, SearchFilter, FilterGroup } from './filter-builder';

describe('FilterBuilder', () => {
  const builder = new FilterBuilder();

  describe('Single Filter to SQL', () => {
    it('should convert equality filter to SQL', () => {
      const filter: SearchFilter = { field: 'category', operator: '=', value: 'code' };
      const result = builder.toSQL(filter);
      expect(result.where).toBe('category = ?');
      expect(result.params).toEqual(['code']);
    });

    it('should convert inequality filter to SQL', () => {
      const filter: SearchFilter = { field: 'type', operator: '!=', value: 'question' };
      const result = builder.toSQL(filter);
      expect(result.where).toBe('type != ?');
      expect(result.params).toEqual(['question']);
    });

    it('should convert greater-than filter to SQL', () => {
      const filter: SearchFilter = { field: 'timestamp', operator: '>', value: '2024-01-01' };
      const result = builder.toSQL(filter);
      expect(result.where).toBe('timestamp > ?');
      expect(result.params).toEqual(['2024-01-01']);
    });

    it('should convert less-than filter to SQL', () => {
      const filter: SearchFilter = { field: 'created', operator: '<', value: '2024-12-31' };
      const result = builder.toSQL(filter);
      expect(result.where).toBe('created < ?');
      expect(result.params).toEqual(['2024-12-31']);
    });

    it('should convert IN filter to SQL', () => {
      const filter: SearchFilter = { field: 'category', operator: 'in', value: ['code', 'insight'] };
      const result = builder.toSQL(filter);
      expect(result.where).toBe('category IN (?,?)');
      expect(result.params).toEqual(['code', 'insight']);
    });

    it('should convert CONTAINS filter to SQL with wildcards', () => {
      const filter: SearchFilter = { field: 'title', operator: 'contains', value: 'OAuth' };
      const result = builder.toSQL(filter);
      expect(result.where).toBe('title LIKE ?');
      expect(result.params).toEqual(['%OAuth%']);
    });

    it('should convert REGEX filter to SQL', () => {
      const filter: SearchFilter = { field: 'content', operator: 'regex', value: 'async.*await' };
      const result = builder.toSQL(filter);
      expect(result.where).toBe('content REGEXP ?');
      expect(result.params).toEqual(['async.*await']);
    });

    it('should convert BETWEEN filter to SQL', () => {
      const filter: SearchFilter = { field: 'timestamp', operator: 'between', value: ['2024-01-01', '2024-12-31'] };
      const result = builder.toSQL(filter);
      expect(result.where).toBe('timestamp BETWEEN ? AND ?');
      expect(result.params).toEqual(['2024-01-01', '2024-12-31']);
    });

    it('should handle negated filters', () => {
      const filter: SearchFilter = { field: 'type', operator: '=', value: 'question', negate: true };
      const result = builder.toSQL(filter);
      expect(result.where).toBe('NOT (type = ?)');
      expect(result.params).toEqual(['question']);
    });
  });

  describe('Filter Groups to SQL', () => {
    it('should convert AND group to SQL', () => {
      const group: FilterGroup = {
        operator: 'AND',
        filters: [
          { field: 'category', operator: '=', value: 'code' },
          { field: 'type', operator: '=', value: 'insight' }
        ]
      };
      const result = builder.toSQL(group);
      expect(result.where).toBe('(category = ? AND type = ?)');
      expect(result.params).toEqual(['code', 'insight']);
    });

    it('should convert OR group to SQL', () => {
      const group: FilterGroup = {
        operator: 'OR',
        filters: [
          { field: 'category', operator: '=', value: 'code' },
          { field: 'category', operator: '=', value: 'design' }
        ]
      };
      const result = builder.toSQL(group);
      expect(result.where).toBe('(category = ? OR category = ?)');
      expect(result.params).toEqual(['code', 'design']);
    });

    it('should convert nested groups to SQL', () => {
      const group: FilterGroup = {
        operator: 'OR',
        filters: [
          {
            operator: 'AND',
            filters: [
              { field: 'category', operator: '=', value: 'code' },
              { field: 'type', operator: '=', value: 'insight' }
            ]
          },
          { field: 'tags', operator: 'contains', value: 'typescript' }
        ]
      };
      const result = builder.toSQL(group);
      expect(result.where).toContain('AND');
      expect(result.where).toContain('OR');
      expect(result.params.length).toBe(3);
    });

    it('should handle negated groups', () => {
      const group: FilterGroup = {
        operator: 'AND',
        filters: [
          { field: 'category', operator: '=', value: 'code' },
          { field: 'type', operator: '=', value: 'insight' }
        ],
        negate: true
      };
      const result = builder.toSQL(group);
      expect(result.where).toContain('NOT');
      expect(result.params).toEqual(['code', 'insight']);
    });
  });

  describe('Validation', () => {
    it('should accept valid filters', () => {
      const filter: SearchFilter = { field: 'category', operator: '=', value: 'code' };
      expect(builder.validate(filter)).toBe(true);
    });

    it('should reject invalid field names', () => {
      const filter: SearchFilter = { field: 'invalid_field', operator: '=', value: 'code' };
      expect(builder.validate(filter)).toBe(false);
    });

    it('should accept multiple filters', () => {
      const filters: SearchFilter[] = [
        { field: 'category', operator: '=', value: 'code' },
        { field: 'type', operator: '=', value: 'insight' }
      ];
      expect(builder.validate(filters)).toBe(true);
    });

    it('should validate nested groups', () => {
      const group: FilterGroup = {
        operator: 'AND',
        filters: [
          { field: 'category', operator: '=', value: 'code' },
          {
            operator: 'OR',
            filters: [
              { field: 'type', operator: '=', value: 'insight' },
              { field: 'type', operator: '=', value: 'question' }
            ]
          }
        ]
      };
      expect(builder.validate(group)).toBe(true);
    });
  });

  describe('ChromaDB Conversion', () => {
    it('should convert equality filter to ChromaDB format', () => {
      const filter: SearchFilter = { field: 'category', operator: '=', value: 'code' };
      const result = builder.toChromaWhere(filter);
      expect(result.where).toEqual({ category: { '$eq': 'code' } });
    });

    it('should convert IN filter to ChromaDB format', () => {
      const filter: SearchFilter = { field: 'category', operator: 'in', value: ['code', 'insight'] };
      const result = builder.toChromaWhere(filter);
      expect(result.where).toEqual({ category: { '$in': ['code', 'insight'] } });
    });

    it('should skip unsupported operators (contains, regex)', () => {
      const filter: SearchFilter = { field: 'title', operator: 'contains', value: 'OAuth' };
      const result = builder.toChromaWhere(filter);
      // Should return error or empty, not throw
      expect(result.error || !result.where).toBeTruthy();
    });
  });

  describe('Date Parsing', () => {
    it('should parse ISO date strings', () => {
      const date = builder.parseDate('2024-01-15');
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(0); // January is 0
      expect(date.getDate()).toBe(15);
    });

    it('should throw on invalid date', () => {
      expect(() => builder.parseDate('invalid')).toThrow();
    });

    it('should parse relative dates', () => {
      const date = builder.parseRelativeDate('last 7 days');
      const now = new Date();
      expect(date < now).toBe(true);
      expect(now.getTime() - date.getTime()).toBeLessThan(8 * 24 * 60 * 60 * 1000);
    });

    it('should parse date ranges', () => {
      const range = builder.parseDateRange('2024-01-01 to 2024-12-31');
      expect(range.start.getFullYear()).toBe(2024);
      expect(range.end.getFullYear()).toBe(2024);
      expect(range.start < range.end).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty filter array', () => {
      const result = builder.toSQL([]);
      expect(result.where).toBe('');
      expect(result.params).toEqual([]);
    });

    it('should handle null filters', () => {
      const result = builder.toSQL(null);
      expect(result.where).toBe('');
      expect(result.params).toEqual([]);
    });

    it('should handle empty IN operator', () => {
      const filter: SearchFilter = { field: 'category', operator: 'in', value: [] };
      const result = builder.toSQL(filter);
      expect(result.where).toBe('');
      expect(result.params).toEqual([]);
    });

    it('should handle single filter in array', () => {
      const filters: SearchFilter[] = [
        { field: 'category', operator: '=', value: 'code' }
      ];
      const result = builder.toSQL(filters);
      expect(result.where).toBe('category = ?');
      expect(result.params).toEqual(['code']);
    });

    it('should handle GROUP with single filter', () => {
      const group: FilterGroup = {
        operator: 'AND',
        filters: [
          { field: 'category', operator: '=', value: 'code' }
        ]
      };
      const result = builder.toSQL(group);
      expect(result.where).toBe('category = ?');
      expect(result.params).toEqual(['code']);
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should prevent field name injection', () => {
      const filter: SearchFilter = { field: "category; DROP TABLE atomic_units;--", operator: '=', value: 'code' };
      // Should be rejected by validation
      expect(builder.validate(filter)).toBe(false);
    });

    it('should parameterize all values (no string concatenation)', () => {
      const filter: SearchFilter = { field: 'title', operator: 'contains', value: "'; DROP TABLE atomic_units;--" };
      const result = builder.toSQL(filter);
      // Value should be a parameter, not concatenated
      expect(result.params).toContain("'; DROP TABLE atomic_units;--");
      expect(result.where).not.toContain("'; DROP TABLE atomic_units;--");
    });

    it('should handle CONTAINS with special SQL characters', () => {
      const filter: SearchFilter = { field: 'title', operator: 'contains', value: '%_[]' };
      const result = builder.toSQL(filter);
      expect(result.params[0]).toBe('%' + '%_[]' + '%');
    });
  });

  describe('Complex Real-World Scenarios', () => {
    it('should handle: (category=code AND type=insight) OR tags contains typescript', () => {
      const filter: FilterGroup = {
        operator: 'OR',
        filters: [
          {
            operator: 'AND',
            filters: [
              { field: 'category', operator: '=', value: 'code' },
              { field: 'type', operator: '=', value: 'insight' }
            ]
          },
          { field: 'tags', operator: 'contains', value: 'typescript' }
        ]
      };
      const result = builder.toSQL(filter);
      expect(result.where).toContain('AND');
      expect(result.where).toContain('OR');
      expect(result.params.length).toBe(3);
    });

    it('should handle date range with category filter', () => {
      const filters: (SearchFilter | FilterGroup)[] = [
        { field: 'category', operator: '=', value: 'programming' },
        { field: 'created', operator: 'between', value: ['2024-01-01', '2024-12-31'] }
      ];
      const result = builder.toSQL(filters);
      expect(result.where).toContain('category');
      expect(result.where).toContain('BETWEEN');
      expect(result.params).toEqual(['programming', '2024-01-01', '2024-12-31']);
    });

    it('should handle NOT (type IN question, reference)', () => {
      const filter: SearchFilter = {
        field: 'type',
        operator: 'in',
        value: ['question', 'reference'],
        negate: true
      };
      const result = builder.toSQL(filter);
      expect(result.where).toContain('NOT');
      expect(result.where).toContain('IN');
      expect(result.params).toEqual(['question', 'reference']);
    });
  });
});
