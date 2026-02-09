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
  private ownsDbConnection: boolean;
  private initPromise: Promise<void> | null = null;

  constructor(
    dbPathOrInstance: string | KnowledgeDatabase = './db/knowledge.db',
    vectorDbPath: string = './atomized/embeddings/chroma'
  ) {
    if (typeof dbPathOrInstance === 'string') {
      this.db = new KnowledgeDatabase(dbPathOrInstance);
      this.ownsDbConnection = true;
    } else {
      this.db = dbPathOrInstance;
      this.ownsDbConnection = false;
    }
    this.embeddingsService = new EmbeddingsService();
    this.vectorDb = new VectorDatabase(vectorDbPath, {
      embeddingProfile: this.embeddingsService.getProfile(),
    });
  }

  async init() {
    if (!this.initPromise) {
      this.initPromise = this.vectorDb.init().catch(error => {
        this.initPromise = null;
        throw error;
      });
    }

    await this.initPromise;
  }

  /**
   * Hybrid search using both FTS and semantic search
   */
  async search(
    query: string,
    limit: number = 10,
    weights: { fts: number; semantic: number } = { fts: 0.6, semantic: 0.4 },
    options: {
      dateFrom?: string;
      dateTo?: string;
      source?: string;
      format?: string;
    } = {}
  ): Promise<HybridSearchResult[]> {
    await this.init();

    // Increase fetch limit to account for filtering
    const fetchLimit = limit * 5;

    // Parallel execution of both searches
    const [ftsResults, queryEmbedding] = await Promise.all([
      // Full-text search
      Promise.resolve(this.db.searchText(query, fetchLimit)),
      // Generate query embedding for semantic search
      this.embeddingsService.generateEmbedding(query),
    ]);

    // Semantic search
    const semanticResults = await this.vectorDb.searchByEmbedding(queryEmbedding, fetchLimit);

    // Combine results using Reciprocal Rank Fusion (RRF)
    const rrf = await this.reciprocalRankFusion(
      ftsResults,
      semanticResults.map(r => r.unit),
      weights,
      60,
      options
    );

    return rrf.slice(0, limit).map(r => ({
      unit: r.unit,
      ftsScore: ftsResults.find(u => u.id === r.unit.id) ? 1 : 0,
      semanticScore: semanticResults.find(s => s.unit.id === r.unit.id)?.score || 0,
      combinedScore: r.score
    }));
  }

  /**
   * Reciprocal Rank Fusion (RRF)
   * Combines multiple ranked lists into a single ranking
   */
  private async reciprocalRankFusion(
    ftsResults: AtomicUnit[],
    semanticResults: AtomicUnit[],
    weights: { fts: number; semantic: number },
    k: number = 60,
    filters: {
      dateFrom?: string;
      dateTo?: string;
      source?: string;
      format?: string;
    } = {}
  ): Promise<{ unit: AtomicUnit; score: number }[]> {
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

    let results = Array.from(scores.values());

    // Enrich with Document metadata if filtering by source/format
    if (filters.source || filters.format) {
      // Fetch documents for units that have documentId
      const docIds = [...new Set(results.map(r => r.unit.documentId).filter(Boolean) as string[])];
      if (docIds.length > 0) {
        // We need a method to get docs by IDs. KnowledgeDatabase doesn't have it exposed nicely.
        // Let's rely on unit details or we need to add a method.
        // Since we are in the same process, we can access the DB if we make a method.
        // Or we can use `db` property since this is a class method.
        
        // Let's assume we can fetch docs. 
        // For performance, let's fetch only if needed.
        // But we need to filter BEFORE sorting? No, we can filter after RRF but before boost.
        
        // Actually, filtering implies we remove items.
        
        const docs = this.db['db'].prepare(`
          SELECT id, format, metadata FROM documents WHERE id IN (${docIds.map(() => '?').join(',')})
        `).all(...docIds) as Array<{ id: string; format: string; metadata: string }>;
        
        const docMap = new Map(docs.map(d => [d.id, d]));
        
        results = results.filter(r => {
          if (!r.unit.documentId) return !filters.source && !filters.format;
          
          const doc = docMap.get(r.unit.documentId);
          if (!doc) return false;
          
          if (filters.format && doc.format !== filters.format) return false;
          
          if (filters.source) {
             try {
                const meta = JSON.parse(doc.metadata);
                if (meta.sourceId !== filters.source) return false;
             } catch {
                return false;
             }
          }
          return true;
        });
      } else if (filters.source || filters.format) {
         // If we have filters but no docIds, we filter out everything?
         // Unless source='claude' (no docId).
         if (filters.source === 'claude') {
             results = results.filter(r => r.unit.conversationId);
         } else {
             results = [];
         }
      }
    }

    // Apply boosts
    results = results.map(item => {
      let boost = 0;
      
      // Boost for high-quality chunks
      if (item.unit.tags.some(t => t.startsWith('chunk-strategy-'))) {
        boost += 0.05;
      }
      
      // Conditional boost for images (simple for now)
      if (item.unit.tags.includes('has-image')) {
        boost += 0.02;
      }
      
      return { ...item, score: item.score + boost };
    });
    
    // Apply Date filters
    if (filters.dateFrom || filters.dateTo) {
        const from = filters.dateFrom ? new Date(filters.dateFrom).getTime() : 0;
        const to = filters.dateTo ? new Date(filters.dateTo).getTime() : Infinity;
        
        results = results.filter(r => {
            const t = r.unit.timestamp.getTime();
            return t >= from && t <= to;
        });
    }

    // Sort by combined score
    return results.sort((a, b) => b.score - a.score);
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

  getVectorEndpoint(): string {
    return this.vectorDb.getEndpoint();
  }

  getVectorProfileId(): string {
    return this.vectorDb.getActiveProfileId();
  }

  getEmbeddingProfileId(): string {
    return this.embeddingsService.getProfile().profileId;
  }

  close() {
    if (this.ownsDbConnection) {
      this.db.close();
    }
  }
}
