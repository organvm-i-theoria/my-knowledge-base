import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { VectorDatabase } from './vector-database.js';
import { AtomicUnit } from './types.js';

const { collectionMock, getOrCreateCollectionMock, deleteCollectionMock } = vi.hoisted(() => ({
  collectionMock: {
    add: vi.fn(),
    update: vi.fn(),
    query: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
    metadata: {
      profile_id: 'emb_profile_a',
      dimensions: 2,
    },
  },
  getOrCreateCollectionMock: vi.fn(),
  deleteCollectionMock: vi.fn(),
}));

vi.mock('chromadb', () => {
  return {
    ChromaClient: class {
      getOrCreateCollection = getOrCreateCollectionMock;
      deleteCollection = deleteCollectionMock;
    },
  };
});

describe('VectorDatabase', () => {
  const originalChromaUrl = process.env.CHROMA_URL;
  const originalChromaHost = process.env.CHROMA_HOST;
  const originalChromaPort = process.env.CHROMA_PORT;
  const pointerDir = join(process.cwd(), '.test-tmp', 'vector-db');
  const pointerPath = join(pointerDir, 'active-profile.json');

  const baseProfile = {
    provider: 'openai' as const,
    model: 'text-embedding-3-small',
    dimensions: 2,
    maxTokens: 8191,
    batchSize: 100,
    profileId: 'emb_profile_a',
  };

  beforeEach(() => {
    delete process.env.CHROMA_URL;
    delete process.env.CHROMA_HOST;
    delete process.env.CHROMA_PORT;

    mkdirSync(pointerDir, { recursive: true });
    rmSync(pointerPath, { force: true });

    getOrCreateCollectionMock.mockReset();
    deleteCollectionMock.mockReset();
    collectionMock.add.mockReset();
    collectionMock.update.mockReset();
    collectionMock.query.mockReset();
    collectionMock.count.mockReset();
    collectionMock.delete.mockReset();
    collectionMock.metadata = {
      profile_id: 'emb_profile_a',
      dimensions: 2,
    };
    collectionMock.count.mockResolvedValue(1);
    getOrCreateCollectionMock.mockResolvedValue(collectionMock);
  });

  afterEach(() => {
    rmSync(pointerDir, { recursive: true, force: true });
    if (originalChromaUrl === undefined) {
      delete process.env.CHROMA_URL;
    } else {
      process.env.CHROMA_URL = originalChromaUrl;
    }

    if (originalChromaHost === undefined) {
      delete process.env.CHROMA_HOST;
    } else {
      process.env.CHROMA_HOST = originalChromaHost;
    }

    if (originalChromaPort === undefined) {
      delete process.env.CHROMA_PORT;
    } else {
      process.env.CHROMA_PORT = originalChromaPort;
    }
  });

  function createDb(overrides: Partial<typeof baseProfile> = {}) {
    return new VectorDatabase('/tmp/chroma', {
      embeddingProfile: { ...baseProfile, ...overrides },
      activeProfilePointerPath: pointerPath,
      allowLegacyFallback: false,
    });
  }

  it('uses explicit HTTP endpoint when provided', () => {
    const db = new VectorDatabase('http://localhost:9000', {
      embeddingProfile: baseProfile,
      activeProfilePointerPath: pointerPath,
      allowLegacyFallback: false,
    });
    expect(db.getEndpoint()).toBe('http://localhost:9000');
  });

  it('uses CHROMA_URL when legacy path is provided', () => {
    process.env.CHROMA_URL = 'http://localhost:8100';

    const db = createDb();
    expect(db.getEndpoint()).toBe('http://localhost:8100');
  });

  it('initializes profile-scoped collection', async () => {
    const db = createDb();
    await db.init();

    expect(getOrCreateCollectionMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'knowledge_units__emb_profile_a' })
    );
  });

  it('rejects mismatched units and embeddings', async () => {
    const db = createDb();
    await db.init();

    await expect(db.addUnits([], [[0.1]])).rejects.toThrow(
      'Number of units and embeddings must match'
    );
  });

  it('maps search results to units', async () => {
    const db = createDb();
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

    const results = await db.searchByEmbedding([0.1, 0.2], 1);

    expect(results).toHaveLength(1);
    expect(results[0].unit.id).toBe('unit-1');
    expect(results[0].score).toBeCloseTo(0.8);
  });

  it('returns collection stats with profile identifiers', async () => {
    const db = createDb();
    await db.init();
    collectionMock.count.mockResolvedValue(42);

    const stats = await db.getStats();

    expect(stats.totalVectors).toBe(42);
    expect(stats.activeProfileId).toBe('emb_profile_a');
    expect(stats.currentProfileId).toBe('emb_profile_a');
  });

  it('adds units to the collection', async () => {
    const db = createDb();
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

  it('rejects search when active pointer profile mismatches embedding profile', async () => {
    writeFileSync(pointerPath, JSON.stringify({
      profileId: 'emb_profile_b',
      updatedAt: new Date().toISOString(),
      source: 'test',
    }));
    collectionMock.metadata = {
      profile_id: 'emb_profile_b',
      dimensions: 2,
    };

    const db = createDb();
    await db.init();

    await expect(db.searchByEmbedding([0.1, 0.2], 1)).rejects.toThrow('Active vector profile mismatch');
  });

  it('rejects search when embedding dimensions mismatch', async () => {
    const db = createDb();
    await db.init();

    await expect(db.searchByEmbedding([0.1], 1)).rejects.toThrow('Embedding dimension mismatch');
  });
});
