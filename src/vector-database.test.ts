import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VectorDatabase } from './vector-database.js';
import { AtomicUnit } from './types.js';

const { collectionMock, getOrCreateCollectionMock } = vi.hoisted(() => ({
  collectionMock: {
    add: vi.fn(),
    update: vi.fn(),
    query: vi.fn(),
    count: vi.fn(),
  },
  getOrCreateCollectionMock: vi.fn(),
}));

vi.mock('chromadb', () => {
  return {
    ChromaClient: class {
      getOrCreateCollection = getOrCreateCollectionMock;
    },
  };
});

describe('VectorDatabase', () => {
  beforeEach(() => {
    getOrCreateCollectionMock.mockReset();
    collectionMock.add.mockReset();
    collectionMock.update.mockReset();
    collectionMock.query.mockReset();
    collectionMock.count.mockReset();
    getOrCreateCollectionMock.mockResolvedValue(collectionMock);
  });

  it('initializes the collection', async () => {
    const db = new VectorDatabase('/tmp/chroma');
    await db.init();

    expect(getOrCreateCollectionMock).toHaveBeenCalledOnce();
  });

  it('rejects mismatched units and embeddings', async () => {
    const db = new VectorDatabase('/tmp/chroma');
    await db.init();

    await expect(db.addUnits([], [[0.1]])).rejects.toThrow(
      'Number of units and embeddings must match'
    );
  });

  it('maps search results to units', async () => {
    const db = new VectorDatabase('/tmp/chroma');
    await db.init();

    collectionMock.query.mockResolvedValue({
      ids: [['unit-1']],
      documents: [['content']],
      metadatas: [[{
        type: 'insight',
        category: 'programming',
        tags: 'tag1,tag2',
        timestamp: new Date('2024-01-01').toISOString(),
        title: 'Unit 1',
      }]],
      distances: [[0.2]],
    });

    const results = await db.searchByEmbedding([0.1], 1);

    expect(results).toHaveLength(1);
    expect(results[0].unit.id).toBe('unit-1');
    expect(results[0].score).toBeCloseTo(0.8);
  });

  it('returns collection stats', async () => {
    const db = new VectorDatabase('/tmp/chroma');
    await db.init();
    collectionMock.count.mockResolvedValue(42);

    const stats = await db.getStats();

    expect(stats.totalVectors).toBe(42);
  });

  it('adds units to the collection', async () => {
    const db = new VectorDatabase('/tmp/chroma');
    await db.init();

    const unit: AtomicUnit = {
      id: 'unit-1',
      type: 'insight',
      title: 'Title',
      content: 'Content',
      context: 'Context',
      tags: ['tag'],
      category: 'programming',
      timestamp: new Date(),
      keywords: ['keyword'],
      relatedUnits: [],
    };

    await db.addUnits([unit], [[0.1, 0.2]]);

    expect(collectionMock.add).toHaveBeenCalledOnce();
  });
});
