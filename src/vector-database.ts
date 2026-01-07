/**
 * Vector database service using ChromaDB
 */

import { ChromaClient, Collection } from 'chromadb';
import { AtomicUnit } from './types.js';

export interface VectorSearchResult {
  unit: AtomicUnit;
  score: number;
  distance: number;
}

export class VectorDatabase {
  private client: ChromaClient;
  private collection?: Collection;
  private collectionName: string = 'knowledge_units';

  constructor(path: string = './atomized/embeddings/chroma') {
    this.client = new ChromaClient({ path });
  }

  /**
   * Initialize or get the collection
   */
  async init() {
    try {
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: {
          description: 'Atomized knowledge from Claude conversations',
          embedding_model: 'text-embedding-3-small',
          dimensions: 1536,
        },
      });

      console.log('✅ Vector database initialized');
    } catch (error) {
      console.error('Error initializing vector database:', error);
      throw error;
    }
  }

  /**
   * Add atomic units with their embeddings
   */
  async addUnits(units: AtomicUnit[], embeddings: number[][]) {
    if (!this.collection) {
      throw new Error('Collection not initialized. Call init() first.');
    }

    if (units.length !== embeddings.length) {
      throw new Error('Number of units and embeddings must match');
    }

    const ids = units.map(u => u.id);
    const documents = units.map(u => this.prepareDocument(u));
    const metadatas = units.map(u => {
      const meta: any = {
        type: u.type,
        category: u.category,
        tags: u.tags.join(','),
        timestamp: u.timestamp.toISOString(),
        title: u.title,
      };
      if (u.conversationId) meta.conversationId = u.conversationId;
      if (u.documentId) meta.documentId = u.documentId;
      return meta;
    });

    try {
      await this.collection.add({
        ids,
        embeddings,
        documents,
        metadatas,
      });

      console.log(`✅ Added ${units.length} units to vector database`);
    } catch (error) {
      console.error('Error adding units to vector database:', error);
      throw error;
    }
  }

  /**
   * Update a single unit's embedding
   */
  async updateUnit(unit: AtomicUnit, embedding: number[]) {
    if (!this.collection) {
      throw new Error('Collection not initialized. Call init() first.');
    }

    try {
      const meta: any = {
        type: unit.type,
        category: unit.category,
        tags: unit.tags.join(','),
        timestamp: unit.timestamp.toISOString(),
        title: unit.title,
      };
      if (unit.conversationId) meta.conversationId = unit.conversationId;
      if (unit.documentId) meta.documentId = unit.documentId;

      await this.collection.update({
        ids: [unit.id],
        embeddings: [embedding],
        documents: [this.prepareDocument(unit)],
        metadatas: [meta],
      });
    } catch (error) {
      console.error('Error updating unit in vector database:', error);
      throw error;
    }
  }

  /**
   * Semantic search by query embedding
   */
  async searchByEmbedding(
    queryEmbedding: number[],
    limit: number = 10,
    filters?: { category?: string; tags?: string[]; type?: string }
  ): Promise<VectorSearchResult[]> {
    if (!this.collection) {
      throw new Error('Collection not initialized. Call init() first.');
    }

    // Build where clause for filtering
    const where: any = {};
    if (filters?.category) {
      where.category = filters.category;
    }
    if (filters?.type) {
      where.type = filters.type;
    }

    try {
      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: limit,
        where: Object.keys(where).length > 0 ? where : undefined,
      });

      // Convert results to VectorSearchResult
      const searchResults: VectorSearchResult[] = [];

      if (results.ids && results.ids[0]) {
        for (let i = 0; i < results.ids[0].length; i++) {
          const metadata = results.metadatas?.[0]?.[i];
          if (!metadata) continue;

          const unit: AtomicUnit = {
            id: results.ids[0][i],
            type: metadata.type as any,
            timestamp: new Date(metadata.timestamp as string),
            title: metadata.title as string,
            content: results.documents?.[0]?.[i] || '',
            context: '',
            tags: (metadata.tags as string)?.split(',') || [],
            category: metadata.category as string,
            conversationId: metadata.conversationId as string,
            documentId: metadata.documentId as string,
            relatedUnits: [],
            keywords: [],
          };

          searchResults.push({
            unit,
            score: 1 - (results.distances?.[0]?.[i] || 0), // Convert distance to similarity score
            distance: results.distances?.[0]?.[i] || 0,
          });
        }
      }

      return searchResults;
    } catch (error) {
      console.error('Error searching vector database:', error);
      throw error;
    }
  }

  /**
   * Get statistics about the collection
   */
  async getStats() {
    if (!this.collection) {
      throw new Error('Collection not initialized. Call init() first.');
    }

    try {
      const count = await this.collection.count();

      return {
        totalVectors: count,
        collectionName: this.collectionName,
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    }
  }

  /**
   * Delete a unit from the vector database
   */
  async deleteUnit(unitId: string) {
    if (!this.collection) {
      throw new Error('Collection not initialized. Call init() first.');
    }

    try {
      await this.collection.delete({
        ids: [unitId],
      });
    } catch (error) {
      console.error('Error deleting unit:', error);
      throw error;
    }
  }

  /**
   * Clear all vectors (use with caution!)
   */
  async clear() {
    if (!this.collection) {
      throw new Error('Collection not initialized. Call init() first.');
    }

    try {
      await this.client.deleteCollection({ name: this.collectionName });
      await this.init(); // Recreate the collection
      console.log('✅ Vector database cleared');
    } catch (error) {
      console.error('Error clearing vector database:', error);
      throw error;
    }
  }

  /**
   * Prepare document text for storage
   */
  private prepareDocument(unit: AtomicUnit): string {
    // Combine title and content for better search
    return `${unit.title}\n\n${unit.content}`;
  }
}
