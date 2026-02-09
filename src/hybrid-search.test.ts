import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { HybridSearch } from './hybrid-search.js';
import { KnowledgeDatabase } from './database.js';
import { VectorDatabase } from './vector-database.js';
import { AtomicUnit, KnowledgeDocument } from './types.js';

const TEST_DIR = join(process.cwd(), '.test-tmp', 'search-filters');
const TEST_DB = join(TEST_DIR, 'knowledge.db');
const TEST_VECTOR_DB = join(TEST_DIR, 'chroma');

// Mocks
vi.mock('./embeddings-service.js', () => {
  return {
    EmbeddingsService: class {
      async generateEmbedding(text: string) {
        return new Array(1536).fill(0.1);
      }

      getProfile() {
        return {
          provider: 'openai',
          model: 'text-embedding-3-small',
          dimensions: 1536,
          maxTokens: 8191,
          batchSize: 100,
          profileId: 'emb_test_profile',
        };
      }
    }
  };
});

// We need to mock VectorDatabase searchByEmbedding because we can't easily run Chroma in unit tests
// without actual integration setup or using in-memory mode if supported.
// But VectorDatabase impl in this project seems to wrap Chroma client.
// Let's mock the method on the prototype or instance.
// But since we are importing the class, we can just spy/mock it if needed, or rely on empty results if empty.
// We want to test filtering logic, so we need RESULTS.

describe('HybridSearch Filters', () => {
  let hybridSearch: HybridSearch;
  let db: KnowledgeDatabase;

  beforeEach(async () => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    if (existsSync(TEST_DB)) {
      rmSync(TEST_DB, { force: true });
    }
    
    // Setup DB
    db = new KnowledgeDatabase(TEST_DB);
    
    // Create Docs
    db.insertDocument({
      id: 'doc-1',
      title: 'Doc 1',
      content: 'Content 1',
      created: new Date('2025-01-01'),
      modified: new Date(),
      format: 'markdown',
      metadata: { sourceId: 'src-1' },
      url: ''
    });
    
    db.insertDocument({
      id: 'doc-2',
      title: 'Doc 2',
      content: 'Content 2',
      created: new Date('2025-01-02'),
      modified: new Date(),
      format: 'pdf',
      metadata: { sourceId: 'src-2' },
      url: ''
    });

    // Create Units
    const u1: AtomicUnit = {
      id: 'u1',
      title: 'Unit 1',
      content: 'Content 1',
      type: 'insight',
      timestamp: new Date('2025-01-01'),
      documentId: 'doc-1',
      tags: ['chunk-strategy-semantic'],
      category: 'general',
      context: '',
      relatedUnits: [],
      keywords: []
    };

    const u2: AtomicUnit = {
      id: 'u2',
      title: 'Unit 2',
      content: 'Content 2',
      type: 'insight',
      timestamp: new Date('2025-01-02'),
      documentId: 'doc-2',
      tags: ['has-image'],
      category: 'general',
      context: '',
      relatedUnits: [],
      keywords: []
    };
    
    db.insertAtomicUnit(u1);
    db.insertAtomicUnit(u2);
    db.close();

    hybridSearch = new HybridSearch(TEST_DB, TEST_VECTOR_DB);
    vi.spyOn(hybridSearch['vectorDb'], 'init').mockResolvedValue();
    
    // Mock Vector DB search to return both units
    vi.spyOn(hybridSearch['vectorDb'], 'searchByEmbedding').mockResolvedValue([
      { unit: u1, score: 0.9, distance: 0.1 },
      { unit: u2, score: 0.8, distance: 0.2 }
    ]);
    
    // Mock FTS to return both units
    vi.spyOn(hybridSearch['db'], 'searchText').mockReturnValue([u1, u2]);
    
    // Mock DB prepare for the manual query in RRF
    // The RRF method does: this.db['db'].prepare(...)
    // Since we reopened the DB in HybridSearch constructor, it has its own connection.
    // We can't easily mock the internal DB connection unless we access it.
    // HybridSearch creates `this.db`.
  });

  afterEach(() => {
    hybridSearch.close();
    if (existsSync(TEST_DB)) {
      rmSync(TEST_DB, { force: true });
    }
  });

  it('filters by source', async () => {
    const results = await hybridSearch.search('query', 10, undefined, { source: 'src-1' });
    expect(results.length).toBe(1);
    expect(results[0].unit.id).toBe('u1');
  });

  it('filters by format', async () => {
    const results = await hybridSearch.search('query', 10, undefined, { format: 'pdf' });
    expect(results.length).toBe(1);
    expect(results[0].unit.id).toBe('u2');
  });

  it('applies scoring boost for chunk-strategy', async () => {
    // Both match query. u1 has chunk-strategy. u2 has has-image.
    // u1 base score (FTS+Vector) vs u2.
    // u1: FTS rank 0 (score 0.6/61) + Vector rank 0 (score 0.4/61) = 0.0098 + 0.0065 = 0.0163
    // u2: FTS rank 1 (score 0.6/62) + Vector rank 1 (score 0.4/62) = 0.0096 + 0.0064 = 0.0160
    // u1 should be higher naturally.
    // Boosts: u1 +0.05. u2 +0.02.
    // u1 should still be higher.
    
    const results = await hybridSearch.search('query', 10);
    expect(results[0].unit.id).toBe('u1');
    expect(results[0].combinedScore).toBeGreaterThan(0.0163 + 0.05 - 0.0001); // Approx check
  });
});
