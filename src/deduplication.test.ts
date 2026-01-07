import { describe, it, expect, beforeEach } from 'vitest';
import { UnitDeduplicator, BatchDeduplicator, DeduplicationReport } from './deduplication.js';

const sampleUnits = [
  {
    id: 'u1',
    title: 'TypeScript Basics Guide',
    type: 'code',
    category: 'programming',
    keywords: ['typescript', 'javascript', 'beginner'],
    content: 'TypeScript is a strongly typed programming language...',
    tags: ['typescript', 'tutorial'],
    relatedUnits: [],
  },
  {
    id: 'u2',
    title: 'TypeScript Basics Tutorial',
    type: 'code',
    category: 'programming',
    keywords: ['typescript', 'javascript', 'learning'],
    content: 'Learn TypeScript basics with this comprehensive guide...',
    tags: ['typescript', 'tutorial'],
    relatedUnits: [],
  },
  {
    id: 'u3',
    title: 'React Hooks Introduction',
    type: 'code',
    category: 'programming',
    keywords: ['react', 'hooks', 'javascript'],
    content: 'Hooks allow you to use state in functional components...',
    tags: ['react', 'hooks'],
    relatedUnits: [],
  },
  {
    id: 'u4',
    title: 'Advanced TypeScript Types',
    type: 'code',
    category: 'programming',
    keywords: ['typescript', 'types', 'advanced'],
    content: 'Advanced typing patterns in TypeScript...',
    tags: ['typescript'],
    relatedUnits: [],
  },
];

describe('Unit Deduplicator', () => {
  let deduplicator: UnitDeduplicator;

  beforeEach(() => {
    deduplicator = new UnitDeduplicator(0.7);
  });

  describe('Duplicate Detection', () => {
    it('should detect very similar units', () => {
      const duplicates = deduplicator.findDuplicates([sampleUnits[0], sampleUnits[1]]);
      
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].similarity).toBeGreaterThan(0.7);
      expect(duplicates[0].type).toBe('very-similar');
    });

    it('should find all duplicates in unit set', () => {
      const duplicates = deduplicator.findDuplicates(sampleUnits);
      
      expect(duplicates.length).toBeGreaterThan(0);
    });

    it('should assign correct similarity types', () => {
      const duplicates = deduplicator.findDuplicates([sampleUnits[0], sampleUnits[1]]);
      
      duplicates.forEach(dup => {
        expect(['duplicate', 'very-similar', 'related']).toContain(dup.type);
      });
    });

    it('should respect similarity threshold', () => {
      const strictDeduplicator = new UnitDeduplicator(0.95);
      const duplicates = strictDeduplicator.findDuplicates(sampleUnits);
      
      duplicates.forEach(dup => {
        expect(dup.similarity).toBeGreaterThan(0.95);
      });
    });

    it('should include similarity details', () => {
      const duplicates = deduplicator.findDuplicates([sampleUnits[0], sampleUnits[1]]);
      
      if (duplicates.length > 0) {
        const dup = duplicates[0];
        expect(dup.details).toHaveProperty('titleSimilarity');
        expect(dup.details).toHaveProperty('keywordOverlap');
        expect(dup.details).toHaveProperty('contentLength');
        expect(dup.details).toHaveProperty('categoryMatch');
      }
    });
  });

  describe('Unit Merging', () => {
    it('should merge two units', () => {
      const merge = deduplicator.merge(sampleUnits[0], sampleUnits[1], true);
      
      expect(merge.survivingId).toBe(sampleUnits[0].id);
      expect(merge.removedId).toBe(sampleUnits[1].id);
      expect(merge.mergedUnit).toBeDefined();
    });

    it('should preserve unit 1 title when keeping unit 1', () => {
      const merge = deduplicator.merge(sampleUnits[0], sampleUnits[1], true);
      
      expect(merge.mergedUnit.title).toBe(sampleUnits[0].title);
    });

    it('should preserve unit 2 title when keeping unit 2', () => {
      const merge = deduplicator.merge(sampleUnits[0], sampleUnits[1], false);
      
      expect(merge.mergedUnit.title).toBe(sampleUnits[1].title);
    });

    it('should deduplicate and merge keywords', () => {
      const merge = deduplicator.merge(sampleUnits[0], sampleUnits[1], true);
      
      expect(merge.mergedUnit.keywords).toContain('typescript');
      expect(merge.mergedUnit.keywords).toContain('javascript');
      expect(merge.mergedUnit.keywords).toContain('beginner');
      expect(merge.mergedUnit.keywords).toContain('learning');
    });

    it('should merge tags', () => {
      const merge = deduplicator.merge(sampleUnits[0], sampleUnits[1], true);
      
      expect(merge.mergedUnit.tags.length).toBeGreaterThan(0);
    });

    it('should include merge metadata', () => {
      const merge = deduplicator.merge(sampleUnits[0], sampleUnits[1], true);
      
      expect(merge.mergedUnit.mergedFrom).toEqual([sampleUnits[0].id, sampleUnits[1].id]);
      expect(merge.mergedUnit.mergedAt).toBeInstanceOf(Date);
    });

    it('should track merge in history', () => {
      deduplicator.merge(sampleUnits[0], sampleUnits[1], true);
      
      const history = deduplicator.getMergeHistory();
      expect(history).toHaveLength(1);
      expect(history[0].survivingId).toBe(sampleUnits[0].id);
    });

    it('should clear merge history', () => {
      deduplicator.merge(sampleUnits[0], sampleUnits[1], true);
      deduplicator.clearHistory();
      
      expect(deduplicator.getMergeHistory()).toHaveLength(0);
    });
  });

  describe('Content Merging', () => {
    it('should prefer longer content', () => {
      const unit1 = { id: 'u1', content: 'Short', title: 'Test' };
      const unit2 = { id: 'u2', content: 'This is a much longer content block', title: 'Test' };
      
      const merge = deduplicator.merge(unit1, unit2, true);
      
      expect(merge.mergedUnit.content).toBe(unit2.content);
    });

    it('should handle missing content', () => {
      const unit1 = { id: 'u1', title: 'Test' };
      const unit2 = { id: 'u2', content: 'Some content', title: 'Test' };
      
      const merge = deduplicator.merge(unit1, unit2, true);
      
      expect(merge.mergedUnit.content).toBe(unit2.content);
    });
  });
});

describe('Batch Deduplicator', () => {
  it('should deduplicate unit set', () => {
    const batchDedup = new BatchDeduplicator();
    const result = batchDedup.deduplicate(sampleUnits, false);
    
    expect(result.cleaned).toBeDefined();
    expect(result.duplicates).toBeDefined();
  });

  it('should auto-merge when enabled', () => {
    const batchDedup = new BatchDeduplicator();
    const result = batchDedup.deduplicate(sampleUnits, true);
    
    expect(result.merges.length).toBeGreaterThanOrEqual(0);
    expect(result.cleaned.length).toBeLessThanOrEqual(sampleUnits.length);
  });

  it('should not modify units when auto-merge disabled', () => {
    const batchDedup = new BatchDeduplicator();
    const result = batchDedup.deduplicate(sampleUnits, false);
    
    expect(result.cleaned).toHaveLength(sampleUnits.length);
  });

  it('should provide deduplication statistics', () => {
    const batchDedup = new BatchDeduplicator();
    const result = batchDedup.deduplicate(sampleUnits, true);
    
    expect(result.cleaned).toBeDefined();
    expect(result.duplicates).toBeDefined();
    expect(result.merges).toBeDefined();
  });
});

describe('Deduplication Report', () => {
  it('should generate report', () => {
    const duplicates = [
      {
        unit1Id: 'u1',
        unit2Id: 'u2',
        similarity: 0.95,
        type: 'duplicate' as const,
        reason: 'Test',
        details: { titleSimilarity: 0.9, keywordOverlap: 0.8, contentLength: 100, categoryMatch: true },
      },
    ];
    
    const report = DeduplicationReport.generate(10, duplicates, [], 9);
    
    expect(report.summary).toBeDefined();
    expect(report.summary.originalUnits).toBe(10);
    expect(report.summary.finalUnits).toBe(9);
    expect(report.duplicates).toBeDefined();
    expect(report.merges).toBeDefined();
  });

  it('should calculate deduplication rate', () => {
    const report = DeduplicationReport.generate(100, [], [], 95);
    
    expect(report.summary.deduplicationRate).toBe('5.00%');
  });

  it('should include recommendations', () => {
    const report = DeduplicationReport.generate(10, [], [], 10);
    
    expect(report.recommendations).toBeDefined();
    expect(Array.isArray(report.recommendations)).toBe(true);
  });
});

describe('String Similarity', () => {
  it('should detect identical strings', () => {
    const dedup = new UnitDeduplicator();
    const unit1 = { id: 'u1', title: 'Test Title', keywords: [], content: 'test' };
    const unit2 = { id: 'u2', title: 'Test Title', keywords: [], content: 'test' };
    
    const similarity = dedup.findDuplicates([unit1, unit2]);
    
    expect(similarity[0].similarity).toBeCloseTo(1, 1);
  });

  it('should detect similar strings with typos', () => {
    const dedup = new UnitDeduplicator();
    const unit1 = { id: 'u1', title: 'TypeScript Basics', keywords: [], content: 'test' };
    const unit2 = { id: 'u2', title: 'Typescript Basics', keywords: [], content: 'test' };
    
    const similarity = dedup.findDuplicates([unit1, unit2]);
    
    expect(similarity[0].similarity).toBeGreaterThan(0.8);
  });
});
