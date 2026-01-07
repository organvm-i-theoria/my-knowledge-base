/**
 * Hybrid search - combines full-text search (FTS) and semantic search (vector)
 * Uses Reciprocal Rank Fusion (RRF) to merge results
 */

import { KnowledgeDatabase } from './database.js';
import { EmbeddingsService } from './embeddings-service.js';
import { VectorDatabase } from './vector-database.js';
import { AtomicUnit } from './types.js';

export interface HybridSearchResult {
  unit: AtomicUnit;
  ftsScore: number;
  semanticScore: number;
  combinedScore: number;
}

export class HybridSearch {
  private db: KnowledgeDatabase;
  private embeddingsService: EmbeddingsService;
  private vectorDb: VectorDatabase;

  constructor(
    dbPath: string = './db/knowledge.db',
    vectorDbPath: string = './atomized/embeddings/chroma'
  ) {
    this.db = new KnowledgeDatabase(dbPath);
    this.embeddingsService = new EmbeddingsService();
    this.vectorDb = new VectorDatabase(vectorDbPath);
  }

  async init() {
    await this.vectorDb.init();
  }

  /**
   * Hybrid search using both FTS and semantic search
   */
  async search(
    query: string,
    limit: number = 10,
    weights: { fts: number; semantic: number } = { fts: 0.4, semantic: 0.6 }
  ): Promise<HybridSearchResult[]> {
    // Parallel execution of both searches
    const [ftsResults, queryEmbedding] = await Promise.all([
      // Full-text search
      Promise.resolve(this.db.searchText(query, limit * 2)),
      // Generate query embedding for semantic search
      this.embeddingsService.generateEmbedding(query),
    ]);

    // Semantic search
    const semanticResults = await this.vectorDb.searchByEmbedding(queryEmbedding, limit * 2);

    // Combine results using Reciprocal Rank Fusion (RRF)
    const rrf = this.reciprocalRankFusion(
      ftsResults,
      semanticResults.map(r => r.unit),
      weights
    );

    // Merge scores
    const hybridResults: HybridSearchResult[] = rrf.map(({ unit, score }) => {
      const ftsResult = ftsResults.find(u => u.id === unit.id);
      const semanticResult = semanticResults.find(r => r.unit.id === unit.id);

      return {
        unit,
        ftsScore: ftsResult ? 1 : 0,
        semanticScore: semanticResult?.score || 0,
        combinedScore: score,
      };
    });

    return hybridResults.slice(0, limit);
  }

  /**
   * Reciprocal Rank Fusion (RRF)
   * Combines multiple ranked lists into a single ranking
   */
  private reciprocalRankFusion(
    ftsResults: AtomicUnit[],
    semanticResults: AtomicUnit[],
    weights: { fts: number; semantic: number },
    k: number = 60
  ): { unit: AtomicUnit; score: number }[] {
    const scores = new Map<string, { unit: AtomicUnit; score: number }>();

    // Add FTS results
    ftsResults.forEach((unit, rank) => {
      const score = weights.fts / (k + rank + 1);
      scores.set(unit.id, { unit, score });
    });

    // Add semantic results
    semanticResults.forEach((unit, rank) => {
      const score = weights.semantic / (k + rank + 1);

      if (scores.has(unit.id)) {
        // Combine scores if unit appears in both results
        scores.get(unit.id)!.score += score;
      } else {
        scores.set(unit.id, { unit, score });
      }
    });

    // Sort by combined score
    return Array.from(scores.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * Tag-based search (from existing database)
   */
  searchByTag(tagName: string): AtomicUnit[] {
    return this.db.getUnitsByTag(tagName);
  }

  /**
   * Get statistics
   */
  getStats() {
    return this.db.getStats();
  }

  close() {
    this.db.close();
  }
}
