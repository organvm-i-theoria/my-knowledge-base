/**
 * Embeddings service - generates vector embeddings for text
 */

import OpenAI from 'openai';
import { config } from 'dotenv';

config();

export class EmbeddingsService {
  private client: OpenAI;
  private model: string;
  private batchSize: number = 100; // OpenAI allows up to 2048 inputs per request

  constructor(apiKey?: string, model: string = 'text-embedding-3-small') {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
    this.model = model;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
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
        const response = await this.client.embeddings.create({
          model: this.model,
          input: batch,
          encoding_format: 'float',
        });

        embeddings.push(...response.data.map(d => d.embedding));

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
      dimensions: this.model === 'text-embedding-3-small' ? 1536 : 3072,
      maxTokens: 8191,
      cost: {
        'text-embedding-3-small': '$0.02 / 1M tokens',
        'text-embedding-3-large': '$0.13 / 1M tokens',
      }[this.model],
    };
  }
}
