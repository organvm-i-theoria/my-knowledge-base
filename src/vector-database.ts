/**
 * Vector database service using ChromaDB
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { ChromaClient, Collection, type CollectionMetadata } from 'chromadb';
import { resolveEmbeddingProfile, EmbeddingProfile } from './config.js';
import { AtomicUnit } from './types.js';

export interface VectorSearchResult {
  unit: AtomicUnit;
  score: number;
  distance: number;
}

export interface ActiveVectorProfilePointer {
  profileId: string;
  updatedAt: string;
  source?: string;
}

export interface VectorDatabaseOptions {
  embeddingProfile?: EmbeddingProfile;
  collectionPrefix?: string;
  activeProfilePointerPath?: string;
  allowLegacyFallback?: boolean;
}

export interface VectorCollectionVerification {
  profileId: string;
  collectionName: string;
  totalVectors: number;
}

export class VectorDatabase {
  private client: ChromaClient;
  private collection?: Collection;
  private collectionName: string;
  private endpoint: string;
  private initPromise: Promise<void> | null = null;
  private readonly embeddingProfile: EmbeddingProfile;
  private readonly collectionPrefix: string;
  private readonly legacyCollectionName: string;
  private readonly activeProfilePointerPath: string;
  private readonly allowLegacyFallback: boolean;
  private activeProfileId: string;
  private usingLegacyCollection = false;

  constructor(
    endpointOrLegacyPath: string = './atomized/embeddings/chroma',
    options: VectorDatabaseOptions = {}
  ) {
    this.embeddingProfile = options.embeddingProfile ?? resolveEmbeddingProfile();
    this.collectionPrefix = options.collectionPrefix || 'knowledge_units';
    this.legacyCollectionName = this.collectionPrefix;
    this.activeProfilePointerPath = options.activeProfilePointerPath
      ? resolve(options.activeProfilePointerPath)
      : resolve('./atomized/embeddings/active-profile.json');
    this.allowLegacyFallback = options.allowLegacyFallback ?? true;
    this.activeProfileId = this.resolveActiveProfileId();
    this.collectionName = this.collectionNameForProfile(this.activeProfileId);

    this.endpoint = this.resolveEndpoint(endpointOrLegacyPath);
    this.client = new ChromaClient({ path: this.endpoint });
  }

  /**
   * Initialize or get the collection
   */
  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize().catch(error => {
        this.initPromise = null;
        throw error;
      });
    }

    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    this.activeProfileId = this.resolveActiveProfileId();
    this.collectionName = this.collectionNameForProfile(this.activeProfileId);
    this.usingLegacyCollection = false;

    this.collection = await this.client.getOrCreateCollection({
      name: this.collectionName,
      metadata: this.buildCollectionMetadata(this.activeProfileId),
    });

    if (this.allowLegacyFallback && this.collectionName !== this.legacyCollectionName) {
      try {
        const profileCount = await this.collection.count();
        if (profileCount === 0) {
          const legacyCollection = await this.client.getOrCreateCollection({
            name: this.legacyCollectionName,
            metadata: {
              description: 'Legacy atomized knowledge collection',
            },
          });
          const legacyCount = await legacyCollection.count();
          if (legacyCount > 0) {
            this.collection = legacyCollection;
            this.collectionName = this.legacyCollectionName;
            this.usingLegacyCollection = true;
            console.warn(
              `⚠️ Using legacy vector collection "${this.legacyCollectionName}" while profile collection "${this.collectionNameForProfile(this.activeProfileId)}" is empty.`
            );
          }
        }
      } catch {
        // Best-effort fallback only. Primary profile collection is still usable.
      }
    }

    console.log(`✅ Vector database initialized (${this.endpoint})`);
  }

  /**
   * Resolve Chroma endpoint from explicit args or environment.
   * Chroma JS client expects an HTTP endpoint (not a filesystem path).
   */
  private resolveEndpoint(endpointOrLegacyPath: string): string {
    const explicitEndpoint = endpointOrLegacyPath.trim();
    const chromaUrl = process.env.CHROMA_URL?.trim();
    const chromaHost = process.env.CHROMA_HOST?.trim();
    const chromaPort = process.env.CHROMA_PORT?.trim();

    const normalize = (value: string): string => value.replace(/\/+$/, '');
    const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

    if (isHttpUrl(explicitEndpoint)) {
      return normalize(explicitEndpoint);
    }

    if (chromaUrl && isHttpUrl(chromaUrl)) {
      return normalize(chromaUrl);
    }

    if (chromaHost) {
      const host = isHttpUrl(chromaHost) ? chromaHost : `http://${chromaHost}`;
      const hasPort = /:\d+$/.test(host);
      return normalize(hasPort || !chromaPort ? host : `${host}:${chromaPort}`);
    }

    if (chromaPort) {
      return `http://127.0.0.1:${chromaPort}`;
    }

    // Legacy local filesystem paths are treated as "use default endpoint".
    return 'http://127.0.0.1:8000';
  }

  getEndpoint(): string {
    return this.endpoint;
  }

  getCollectionName(): string {
    return this.collectionName;
  }

  getEmbeddingProfile(): EmbeddingProfile {
    return { ...this.embeddingProfile };
  }

  getActiveProfileId(): string {
    return this.activeProfileId;
  }

  getCurrentProfileId(): string {
    return this.embeddingProfile.profileId;
  }

  getPointerPath(): string {
    return this.activeProfilePointerPath;
  }

  isUsingLegacyCollection(): boolean {
    return this.usingLegacyCollection;
  }

  /**
   * Add atomic units with their embeddings
   */
  async addUnits(units: AtomicUnit[], embeddings: number[][]): Promise<void> {
    await this.init();
    if (!this.collection) {
      throw new Error('Collection not initialized. Call init() first.');
    }

    this.assertProfileCompatibility();

    if (units.length !== embeddings.length) {
      throw new Error('Number of units and embeddings must match');
    }

    const batchSize = Math.max(1, this.embeddingProfile.batchSize || 100);
    const totalBatches = Math.ceil(units.length / batchSize);

    try {
      for (let i = 0; i < units.length; i += batchSize) {
        const batchUnits = units.slice(i, i + batchSize);
        const batchEmbeddings = embeddings.slice(i, i + batchSize);

        const ids = batchUnits.map(u => u.id);
        const documents = batchUnits.map(u => this.prepareDocument(u));
        const metadatas = batchUnits.map(u => {
          const meta: Record<string, string> = {
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

        await this.collection.add({
          ids,
          embeddings: batchEmbeddings,
          documents,
          metadatas,
        });

        const batchIndex = Math.floor(i / batchSize) + 1;
        if (batchIndex === 1 || batchIndex === totalBatches || batchIndex % 20 === 0) {
          console.log(`🗄️ Vector write progress: batch ${batchIndex}/${totalBatches}`);
        }
      }

      console.log(`✅ Added ${units.length} units to vector database`);
    } catch (error) {
      console.error('Error adding units to vector database:', error);
      throw error;
    }
  }

  /**
   * Update a single unit's embedding
   */
  async updateUnit(unit: AtomicUnit, embedding: number[]): Promise<void> {
    await this.init();
    if (!this.collection) {
      throw new Error('Collection not initialized. Call init() first.');
    }

    this.assertProfileCompatibility();
    this.assertEmbeddingDimensions(embedding);

    try {
      const meta: Record<string, string> = {
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
    await this.init();
    if (!this.collection) {
      throw new Error('Collection not initialized. Call init() first.');
    }

    this.assertProfileCompatibility();
    this.assertEmbeddingDimensions(queryEmbedding);

    // Build where clause for filtering
    const where: Record<string, string> = {};
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
  async getStats(): Promise<{
    totalVectors: number;
    collectionName: string;
    activeProfileId: string;
    currentProfileId: string;
    usingLegacyCollection: boolean;
  }> {
    await this.init();
    if (!this.collection) {
      throw new Error('Collection not initialized. Call init() first.');
    }

    try {
      const count = await this.collection.count();

      return {
        totalVectors: count,
        collectionName: this.collectionName,
        activeProfileId: this.activeProfileId,
        currentProfileId: this.embeddingProfile.profileId,
        usingLegacyCollection: this.usingLegacyCollection,
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    }
  }

  /**
   * Verify collection existence/count for a profile.
   */
  async verifyProfileCollection(profileId: string = this.embeddingProfile.profileId): Promise<VectorCollectionVerification> {
    const collectionName = this.collectionNameForProfile(profileId);
    const collection = await this.client.getOrCreateCollection({
      name: collectionName,
      metadata: this.buildCollectionMetadata(profileId),
    });
    const totalVectors = await collection.count();

    return {
      profileId,
      collectionName,
      totalVectors,
    };
  }

  async switchActiveProfile(profileId: string, source: string = 'manual'): Promise<void> {
    const trimmed = profileId.trim();
    if (!trimmed) {
      throw new Error('Profile ID is required for switchActiveProfile');
    }

    this.writeActiveProfilePointer({
      profileId: trimmed,
      updatedAt: new Date().toISOString(),
      source,
    });

    this.activeProfileId = trimmed;
    this.collectionName = this.collectionNameForProfile(trimmed);
    this.usingLegacyCollection = false;
    this.collection = await this.client.getOrCreateCollection({
      name: this.collectionName,
      metadata: this.buildCollectionMetadata(trimmed),
    });
  }

  async clearProfileCollection(profileId: string = this.embeddingProfile.profileId): Promise<void> {
    const collectionName = this.collectionNameForProfile(profileId);
    await this.client.deleteCollection({ name: collectionName });
    if (this.collectionName === collectionName) {
      this.collection = undefined;
      this.initPromise = null;
      await this.init();
    }
  }

  /**
   * Delete a unit from the vector database
   */
  async deleteUnit(unitId: string): Promise<void> {
    await this.init();
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
   * Clear active vectors (use with caution!)
   */
  async clear(): Promise<void> {
    await this.init();
    if (!this.collection) {
      throw new Error('Collection not initialized. Call init() first.');
    }

    try {
      await this.client.deleteCollection({ name: this.collectionName });
      this.collection = undefined;
      this.initPromise = null;
      await this.init(); // Recreate the collection
      console.log('✅ Vector database cleared');
    } catch (error) {
      console.error('Error clearing vector database:', error);
      throw error;
    }
  }

  readActiveProfilePointer(): ActiveVectorProfilePointer | null {
    if (!existsSync(this.activeProfilePointerPath)) {
      return null;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.activeProfilePointerPath, 'utf-8')) as Partial<ActiveVectorProfilePointer>;
      if (!parsed.profileId || typeof parsed.profileId !== 'string') {
        return null;
      }
      return {
        profileId: parsed.profileId,
        updatedAt: parsed.updatedAt || '',
        source: parsed.source,
      };
    } catch {
      return null;
    }
  }

  private resolveActiveProfileId(): string {
    const pointer = this.readActiveProfilePointer();
    if (pointer?.profileId) {
      return pointer.profileId;
    }
    return this.embeddingProfile.profileId;
  }

  private writeActiveProfilePointer(pointer: ActiveVectorProfilePointer): void {
    mkdirSync(dirname(this.activeProfilePointerPath), { recursive: true });
    writeFileSync(this.activeProfilePointerPath, JSON.stringify(pointer, null, 2));
  }

  private collectionNameForProfile(profileId: string): string {
    return `${this.collectionPrefix}__${profileId}`;
  }

  private buildCollectionMetadata(profileId: string): CollectionMetadata {
    return {
      description: 'Atomized knowledge from Claude conversations',
      embedding_provider: this.embeddingProfile.provider,
      embedding_model: this.embeddingProfile.model,
      dimensions: this.embeddingProfile.dimensions,
      max_tokens: this.embeddingProfile.maxTokens,
      profile_id: profileId,
      current_profile_id: this.embeddingProfile.profileId,
    };
  }

  private assertProfileCompatibility(): void {
    if (this.usingLegacyCollection) {
      throw new Error(
        `Active vector profile mismatch: using legacy collection ${this.legacyCollectionName} without profile_id metadata`
      );
    }

    if (this.activeProfileId !== this.embeddingProfile.profileId) {
      throw new Error(
        `Active vector profile mismatch: active=${this.activeProfileId}, current=${this.embeddingProfile.profileId}`
      );
    }

    const metadataProfileId = this.collection?.metadata?.profile_id;
    if (typeof metadataProfileId === 'string' && metadataProfileId !== this.embeddingProfile.profileId) {
      throw new Error(
        `Active vector profile mismatch: collection=${metadataProfileId}, current=${this.embeddingProfile.profileId}`
      );
    }
  }

  private assertEmbeddingDimensions(queryEmbedding: number[]): void {
    if (queryEmbedding.length !== this.embeddingProfile.dimensions) {
      throw new Error(
        `Embedding dimension mismatch: got=${queryEmbedding.length}, expected=${this.embeddingProfile.dimensions}`
      );
    }

    const metadataDimensions = this.collection?.metadata?.dimensions;
    const dimensionFromMetadata =
      typeof metadataDimensions === 'number'
        ? metadataDimensions
        : typeof metadataDimensions === 'string'
          ? Number.parseInt(metadataDimensions, 10)
          : undefined;
    if (
      dimensionFromMetadata !== undefined &&
      Number.isFinite(dimensionFromMetadata) &&
      dimensionFromMetadata > 0 &&
      queryEmbedding.length !== dimensionFromMetadata
    ) {
      throw new Error(
        `Embedding dimension mismatch: query=${queryEmbedding.length}, collection=${dimensionFromMetadata}`
      );
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
