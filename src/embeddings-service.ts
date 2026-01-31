/**
 * Embeddings service - generates vector embeddings for text
 */

import { config } from 'dotenv';
import { getConfig } from './config.js';
import { AIFactory } from './ai-factory.js';
import { AIProvider } from './ai-types.js';

config();

export class EmbeddingsService {
  private provider: AIProvider;
  private model: string;
  private batchSize: number;

  constructor() {
    const appConfig = getConfig().getAll();
    const embeddingConfig = appConfig.embedding || appConfig.embeddings || {};
    
    this.provider = AIFactory.createProvider(embeddingConfig.provider || 'openai', {
      provider: embeddingConfig.provider || 'openai',
      model: embeddingConfig.model || 'text-embedding-3-small',
      baseUrl: embeddingConfig.baseUrl
    });
    
    this.model = embeddingConfig.model || 'text-embedding-3-small';
    this.batchSize = embeddingConfig.batchSize || 100;
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
