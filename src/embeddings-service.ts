/**
 * Embeddings service - generates vector embeddings for text
 */

import { config } from 'dotenv';
import { getConfig } from './config.js';
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

  constructor() {
    const appConfig = getConfig().getAll();
    const embeddingConfig = appConfig.embedding || appConfig.embeddings || {};
    this.batchSize = embeddingConfig.batchSize || 100;

    if (process.env.KB_EMBEDDINGS_PROVIDER === 'mock') {
      this.provider = new DeterministicMockEmbeddingProvider();
      this.model = 'mock-embeddings';
      return;
    }

    const providerType = embeddingConfig.provider || 'openai';
    const baseUrl = providerType === 'local'
      ? appConfig.llm?.baseUrl || 'http://localhost:11434/v1'
      : undefined;
    const apiKey = providerType === 'openai' ? process.env.OPENAI_API_KEY : undefined; // allow-secret: env var reference only

    this.provider = AIFactory.createProvider(providerType, {
      apiKey,
      model: embeddingConfig.model || 'text-embedding-3-small',
      baseUrl
    });
    
    this.model = embeddingConfig.model || 'text-embedding-3-small';
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const embeddings = await this.provider.embed([text]);
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
        const batchEmbeddings = await this.provider.embed(batch);
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
  prepareText(text: string, maxTokens: number = 8191): string {
    // Rough estimation: 1 token ≈ 4 characters
    const maxChars = maxTokens * 4;

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
      dimensions: this.model.includes('small') ? 1536 : 3072, // Rough default
      maxTokens: 8191,
      cost: 'Local/Configured Provider',
    };
  }
}
