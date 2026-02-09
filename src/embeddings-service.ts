/**
 * Embeddings service - generates vector embeddings for text
 */

import { config } from 'dotenv';
import { getConfig, resolveEmbeddingProfile, EmbeddingProfile } from './config.js';
import { AIFactory } from './ai-factory.js';
import { AIProvider } from './ai-types.js';

config();

class DeterministicMockEmbeddingProvider implements AIProvider {
  id = 'mock';
  name = 'Deterministic Mock Embeddings';

  async chat(): Promise<string> {
    return '';
  }

  async embed(text: string | string[]): Promise<number[][]> {
    const inputs = Array.isArray(text) ? text : [text];
    return inputs.map(input => this.generateDeterministicVector(input));
  }

  async getModels(): Promise<string[]> {
    return ['mock-embeddings'];
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  private generateDeterministicVector(input: string, dimensions: number = 1536): number[] {
    let seed = 2166136261;
    for (let i = 0; i < input.length; i++) {
      seed ^= input.charCodeAt(i);
      seed = Math.imul(seed, 16777619) >>> 0;
    }

    const vector = new Array<number>(dimensions);
    for (let i = 0; i < dimensions; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      vector[i] = (seed / 0xffffffff) * 2 - 1;
    }

    return vector;
  }
}

export class EmbeddingsService {
  private provider: AIProvider;
  private model: string;
  private batchSize: number;
  private dimensions: number;
  private maxTokens: number;
  private profile: EmbeddingProfile;

  constructor() {
    const appConfig = getConfig().getAll();
    this.profile = resolveEmbeddingProfile(appConfig, process.env);
    this.batchSize = this.profile.batchSize;
    this.model = this.profile.model;
    this.dimensions = this.profile.dimensions;
    this.maxTokens = this.profile.maxTokens;

    if (this.profile.provider === 'mock') {
      this.provider = new DeterministicMockEmbeddingProvider();
      return;
    }

    const providerType = this.profile.provider === 'local' ? 'local' : 'openai';
    const baseUrl = providerType === 'local'
      ? appConfig.llm?.baseUrl || 'http://localhost:11434/v1'
      : undefined;
    const apiKey = providerType === 'openai' ? process.env.OPENAI_API_KEY : undefined; // allow-secret: env var reference only

    this.provider = AIFactory.createProvider(providerType, {
      apiKey,
      model: this.model,
      baseUrl
    });
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const embeddings = await this.provider.embed([text], { model: this.model });
      return embeddings[0];
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);

      console.log(`Generating embeddings for batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(texts.length / this.batchSize)}`);

      try {
        const batchEmbeddings = await this.provider.embed(batch, { model: this.model });
        embeddings.push(...batchEmbeddings);

        // Small delay to avoid rate limits
        if (i + this.batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Error generating embeddings for batch ${i}-${i + batch.length}:`, error);
        throw error;
      }
    }

    return embeddings;
  }

  /**
   * Prepare text for embedding (truncate if too long)
   */
  prepareText(text: string, maxTokens?: number): string {
    const tokenBudget = maxTokens ?? this.maxTokens;
    // Rough estimation: 1 token ≈ 4 characters
    const maxChars = tokenBudget * 4;

    if (text.length > maxChars) {
      return text.slice(0, maxChars);
    }

    return text;
  }

  /**
   * Get model info
   */
  getModelInfo() {
    return {
      model: this.model,
      provider: this.profile.provider,
      dimensions: this.dimensions,
      maxTokens: this.maxTokens,
      profileId: this.profile.profileId,
      cost: 'Local/Configured Provider',
    };
  }

  getProfile(): EmbeddingProfile {
    return { ...this.profile };
  }
}
