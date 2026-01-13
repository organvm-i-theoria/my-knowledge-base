import { describe, expect, it, vi } from 'vitest';
import { HybridSearch } from './hybrid-search.js';
import { AtomicUnit } from './types.js';

vi.mock('./embeddings-service.js', () => ({
  EmbeddingsService: class {
    generateEmbedding = vi.fn().mockResolvedValue([0.1, 0.2]);
  },
}));

function makeUnit(id: string): AtomicUnit {
  return {
    id,
    type: 'insight',
    title: id,
    content: 'content',
    context: 'context',
    tags: [],
    category: 'programming',
    timestamp: new Date(),
    keywords: [],
    relatedUnits: [],
  };
}

describe('HybridSearch', () => {
  it('combines FTS and semantic rankings', async () => {
    const hybrid = new HybridSearch('/tmp/knowledge.db', '/tmp/chroma');

    const unitA = makeUnit('a');
    const unitB = makeUnit('b');
    const unitC = makeUnit('c');

    (hybrid as any).db = {
      searchText: vi.fn().mockReturnValue([unitA, unitB]),
      getUnitsByTag: vi.fn(),
      getStats: vi.fn(),
      close: vi.fn(),
    };
    (hybrid as any).embeddingsService = {
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2]),
    };
    (hybrid as any).vectorDb = {
      searchByEmbedding: vi
        .fn()
        .mockResolvedValue([{ unit: unitB, score: 0.9, distance: 0.1 }, { unit: unitC, score: 0.8, distance: 0.2 }]),
      init: vi.fn(),
    };

    const results = await hybrid.search('query', 3);

    expect(results[0].unit.id).toBe('b');
    expect(results.map(result => result.unit.id)).toEqual(['b', 'a', 'c']);
  });

  it('delegates tag lookup to the database', () => {
    const hybrid = new HybridSearch('/tmp/knowledge.db', '/tmp/chroma');
    const getUnitsByTag = vi.fn().mockReturnValue([]);
    (hybrid as any).db = { getUnitsByTag };

    const results = hybrid.searchByTag('tag');

    expect(getUnitsByTag).toHaveBeenCalledWith('tag');
    expect(results).toEqual([]);
  });
});
