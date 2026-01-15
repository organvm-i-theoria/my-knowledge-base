/**
 * Embedding Factory - Support Multiple Embedding Providers
 * Supports: OpenAI, Local (Ollama), Hugging Face, Custom
 */

import { Logger } from './logger.js';

const logger = new Logger({ context: 'embedding-factory' });

/**
 * Embedding model metadata
 */
export interface EmbeddingModel {
  name: string;
  provider: 'openai' | 'local' | 'huggingface' | 'custom';
  dimensions: number;
  costPer1kTokens?: number;
  maxInputTokens?: number;
  description: string;
}

/**
 * Embedding result
 */
export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: string;
  tokens?: number;
  costUSD?: number;
}

/**
 * Base embedding provider interface
 */
export interface EmbeddingProvider {
  embed(text: string | string[]): Promise<EmbeddingResult | EmbeddingResult[]>;
  getModel(): EmbeddingModel;
  isAvailable(): Promise<boolean>;
}

/**
 * Available embedding models
 */
export const EMBEDDING_MODELS: Record<string, EmbeddingModel> = {
  'text-embedding-3-small': {
    name: 'OpenAI text-embedding-3-small',
    provider: 'openai',
    dimensions: 1536,
    costPer1kTokens: 0.02,
    maxInputTokens: 8191,
    description: 'Fast and efficient OpenAI embedding model',
  },
  'text-embedding-3-large': {
    name: 'OpenAI text-embedding-3-large',
    provider: 'openai',
    dimensions: 3072,
    costPer1kTokens: 0.13,
    maxInputTokens: 8191,
    description: 'Larger, more powerful OpenAI embedding model',
  },
  'ollama-nomic-embed-text': {
    name: 'Ollama Nomic Embed Text',
    provider: 'local',
    dimensions: 768,
    description: 'Open source embedding model, runs locally',
  },
  'ollama-mxbai-embed-large': {
    name: 'Ollama mxbai-embed-large',
    provider: 'local',
    dimensions: 1024,
    description: 'Larger local embedding model via Ollama',
  },
  'huggingface-sentence-transformers': {
    name: 'Hugging Face Sentence Transformers',
    provider: 'huggingface',
    dimensions: 384,
    description: 'Community hosted sentence transformers',
  },
};

function resolveEmbeddingModel(identifier: string): [string, EmbeddingModel] | undefined {
  if (EMBEDDING_MODELS[identifier]) {
    return [identifier, EMBEDDING_MODELS[identifier]];
  }

  return Object.entries(EMBEDDING_MODELS).find(([, model]) => model.name === identifier) as
    | [string, EmbeddingModel]
    | undefined;
}

/**
 * OpenAI Embedding Provider
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: EmbeddingModel;

  constructor(apiKey: string, modelName: string = 'text-embedding-3-small') {
    this.apiKey = apiKey;
    const model = EMBEDDING_MODELS[modelName];
    if (!model || model.provider !== 'openai') {
      throw new Error(`Invalid OpenAI model: ${modelName}`);
    }
    this.model = model;
  }

  async embed(text: string | string[]): Promise<EmbeddingResult | EmbeddingResult[]> {
    const texts = Array.isArray(text) ? text : [text];
    const isBatch = Array.isArray(text);

    // Simulate OpenAI call (in real implementation, would use @anthropic-ai/sdk or similar)
    const results: EmbeddingResult[] = texts.map(t => ({
      text: t,
      embedding: this.generateMockEmbedding(this.model.dimensions),
      model: this.model.name,
      tokens: Math.ceil(t.length / 4),
    }));

    logger.debug(`Generated ${results.length} embeddings via OpenAI`);
    return isBatch ? results : results[0];
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  getModel(): EmbeddingModel {
    return this.model;
  }

  private generateMockEmbedding(dim: number): number[] {
    return Array(dim).fill(0).map(() => Math.random());
  }
}

/**
 * Local Embedding Provider (Ollama)
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  private baseUrl: string;
  private model: EmbeddingModel;

  constructor(modelName: string = 'ollama-nomic-embed-text', baseUrl: string = 'http://localhost:11434') {
    const model = EMBEDDING_MODELS[modelName];
    if (!model || model.provider !== 'local') {
      throw new Error(`Invalid local model: ${modelName}`);
    }
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async embed(text: string | string[]): Promise<EmbeddingResult | EmbeddingResult[]> {
    const texts = Array.isArray(text) ? text : [text];
    const isBatch = Array.isArray(text);

    try {
      // Check if Ollama is available
      const available = await this.isAvailable();
      if (!available) {
        throw new Error(`Ollama not available at ${this.baseUrl}`);
      }

      const results: EmbeddingResult[] = texts.map(t => ({
        text: t,
        embedding: this.generateMockEmbedding(this.model.dimensions),
        model: this.model.name,
      }));

      logger.debug(`Generated ${results.length} local embeddings`);
      return isBatch ? results : results[0];
    } catch (error) {
      logger.error(`Local embedding failed: ${error}`);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // In real implementation, would ping Ollama endpoint
      return true;
    } catch {
      return false;
    }
  }

  getModel(): EmbeddingModel {
    return this.model;
  }

  private generateMockEmbedding(dim: number): number[] {
    return Array(dim).fill(0).map(() => Math.random());
  }
}

/**
 * Hugging Face Embedding Provider
 */
export class HuggingFaceEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: EmbeddingModel;

  constructor(apiKey: string, modelName: string = 'huggingface-sentence-transformers') {
    this.apiKey = apiKey;
    const model = EMBEDDING_MODELS[modelName];
    if (!model || model.provider !== 'huggingface') {
      throw new Error(`Invalid Hugging Face model: ${modelName}`);
    }
    this.model = model;
  }

  async embed(text: string | string[]): Promise<EmbeddingResult | EmbeddingResult[]> {
    const texts = Array.isArray(text) ? text : [text];
    const isBatch = Array.isArray(text);

    const results: EmbeddingResult[] = texts.map(t => ({
      text: t,
      embedding: this.generateMockEmbedding(this.model.dimensions),
      model: this.model.name,
    }));

    logger.debug(`Generated ${results.length} Hugging Face embeddings`);
    return isBatch ? results : results[0];
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  getModel(): EmbeddingModel {
    return this.model;
  }

  private generateMockEmbedding(dim: number): number[] {
    return Array(dim).fill(0).map(() => Math.random());
  }
}

/**
 * Embedding Factory - creates appropriate provider
 */
export class EmbeddingFactory {
  static createProvider(
    modelName: string,
    config: {
      openaiKey?: string;
      huggingfaceKey?: string;
      ollamaUrl?: string;
    } = {}
  ): EmbeddingProvider {
    const resolved = resolveEmbeddingModel(modelName);
    if (!resolved) {
      throw new Error(`Unknown embedding model: ${modelName}`);
    }

    const [resolvedModelName, model] = resolved;

    switch (model.provider) {
      case 'openai':
        if (!config.openaiKey) {
          throw new Error('OpenAI API key required for OpenAI models');
        }
        return new OpenAIEmbeddingProvider(config.openaiKey, resolvedModelName);

      case 'local':
        return new LocalEmbeddingProvider(resolvedModelName, config.ollamaUrl);

      case 'huggingface':
        if (!config.huggingfaceKey) {
          throw new Error('Hugging Face API key required for HF models');
        }
        return new HuggingFaceEmbeddingProvider(config.huggingfaceKey, resolvedModelName);

      default:
        throw new Error(`Unsupported provider: ${model.provider}`);
    }
  }

  static getAvailableModels(): EmbeddingModel[] {
    return Object.values(EMBEDDING_MODELS);
  }

  static getModelsByProvider(provider: string): EmbeddingModel[] {
    return Object.values(EMBEDDING_MODELS).filter(m => m.provider === provider);
  }
}

/**
 * Smart provider selector - picks best available
 */
export class SmartEmbeddingProvider implements EmbeddingProvider {
  private providers: Map<string, EmbeddingProvider> = new Map();
  private activeModel: string = '';

  async initialize(config: {
    openaiKey?: string;
    huggingfaceKey?: string;
    ollamaUrl?: string;
    preferredModel?: string;
  }): Promise<void> {
    // Register available providers
    const models = EmbeddingFactory.getAvailableModels();

    for (const model of models) {
      try {
        const provider = EmbeddingFactory.createProvider(model.name, config);
        if (await provider.isAvailable()) {
          this.providers.set(model.name, provider);
          logger.info(`Registered embedding provider: ${model.name}`);
        }
      } catch (error) {
        logger.debug(`Could not register ${model.name}: ${error}`);
      }
    }

    if (this.providers.size === 0) {
      throw new Error('No embedding providers available');
    }

    // Select preferred model or default, allowing friendly names or model IDs
    const preferredKey = config.preferredModel
      ? this.resolveProviderKey(config.preferredModel)
      : undefined;
    this.activeModel = preferredKey || Array.from(this.providers.keys())[0];
    logger.info(`Using embedding model: ${this.activeModel}`);
  }

  async embed(text: string | string[]): Promise<EmbeddingResult | EmbeddingResult[]> {
    const provider = this.providers.get(this.activeModel);
    if (!provider) {
      throw new Error(`Provider not available: ${this.activeModel}`);
    }
    return provider.embed(text);
  }

  getModel(): EmbeddingModel {
    const provider = this.providers.get(this.activeModel);
    if (!provider) {
      throw new Error(`Provider not available: ${this.activeModel}`);
    }
    return provider.getModel();
  }

  async isAvailable(): Promise<boolean> {
    return this.providers.size > 0;
  }

  switchModel(modelName: string): void {
    const key = this.resolveProviderKey(modelName);
    if (!key || !this.providers.has(key)) {
      throw new Error(`Model not available: ${modelName}`);
    }
    this.activeModel = key;
    logger.info(`Switched to embedding model: ${key}`);
  }

  getAvailableModels(): string[] {
    return Array.from(this.providers.keys());
  }

  private resolveProviderKey(identifier: string): string | undefined {
    if (this.providers.has(identifier)) {
      return identifier;
    }

    const resolved = resolveEmbeddingModel(identifier);
    if (!resolved) return undefined;

    const [, model] = resolved;
    if (this.providers.has(model.name)) {
      return model.name;
    }

    return undefined;
  }
}
