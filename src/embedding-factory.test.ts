import { describe, it, expect, beforeEach } from 'vitest';
import {
  EmbeddingFactory,
  OpenAIEmbeddingProvider,
  LocalEmbeddingProvider,
  HuggingFaceEmbeddingProvider,
  SmartEmbeddingProvider,
  EMBEDDING_MODELS,
} from './embedding-factory.js';

describe('Embedding Factory', () => {
  describe('Model Registry', () => {
    it('should have registered models', () => {
      const models = Object.values(EMBEDDING_MODELS);
      expect(models.length).toBeGreaterThan(0);
    });

    it('should support OpenAI models', () => {
      const models = EmbeddingFactory.getModelsByProvider('openai');
      expect(models.length).toBeGreaterThan(0);
    });

    it('should support local models', () => {
      const models = EmbeddingFactory.getModelsByProvider('local');
      expect(models.length).toBeGreaterThan(0);
    });

    it('should support Hugging Face models', () => {
      const models = EmbeddingFactory.getModelsByProvider('huggingface');
      expect(models.length).toBeGreaterThan(0);
    });
  });

  describe('OpenAI Provider', () => {
    it('should create OpenAI provider', () => {
      const provider = new OpenAIEmbeddingProvider('test-key');
      expect(provider).toBeDefined();
    });

    it('should throw without API key', () => {
      expect(() => {
        EmbeddingFactory.createProvider('text-embedding-3-small', {});
      }).toThrow();
    });

    it('should embed text', async () => {
      const provider = new OpenAIEmbeddingProvider('test-key');
      const result = await provider.embed('test text');
      
      expect(result).toHaveProperty('embedding');
      expect(Array.isArray(result.embedding)).toBe(true);
      expect(result.text).toBe('test text');
    });

    it('should batch embed', async () => {
      const provider = new OpenAIEmbeddingProvider('test-key');
      const results = await provider.embed(['text1', 'text2', 'text3']);
      
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(3);
    });

    it('should return model info', () => {
      const provider = new OpenAIEmbeddingProvider('test-key');
      const model = provider.getModel();
      
      expect(model.name).toContain('OpenAI');
      expect(model.dimensions).toBe(1536);
      expect(model.provider).toBe('openai');
    });
  });

  describe('Local Provider', () => {
    it('should create local provider', () => {
      const provider = new LocalEmbeddingProvider();
      expect(provider).toBeDefined();
    });

    it('should support Ollama models', () => {
      const provider = new LocalEmbeddingProvider('ollama-nomic-embed-text');
      const model = provider.getModel();
      expect(model.provider).toBe('local');
    });

    it('should embed without API key', async () => {
      const provider = new LocalEmbeddingProvider();
      const result = await provider.embed('test');
      
      expect(result).toHaveProperty('embedding');
      expect(result.model).toContain('Ollama');
    });

    it('should work with custom base URL', async () => {
      const provider = new LocalEmbeddingProvider(
        'ollama-nomic-embed-text',
        'http://custom:11434'
      );
      const model = provider.getModel();
      expect(model.dimensions).toBe(768);
    });
  });

  describe('Hugging Face Provider', () => {
    it('should create HF provider with key', () => {
      const provider = new HuggingFaceEmbeddingProvider('hf-key');
      expect(provider).toBeDefined();
    });

    it('should throw without API key', () => {
      expect(() => {
        EmbeddingFactory.createProvider('huggingface-sentence-transformers', {});
      }).toThrow();
    });

    it('should embed text', async () => {
      const provider = new HuggingFaceEmbeddingProvider('hf-key');
      const result = await provider.embed('test');
      
      expect(result).toHaveProperty('embedding');
      expect(result.model).toContain('Hugging Face');
    });
  });

  describe('Factory Pattern', () => {
    it('should create correct provider for model', () => {
      const openaiProvider = EmbeddingFactory.createProvider(
        'text-embedding-3-small',
        { openaiKey: 'test' }
      );
      expect(openaiProvider).toBeInstanceOf(OpenAIEmbeddingProvider);
    });

    it('should create local provider for local model', () => {
      const localProvider = EmbeddingFactory.createProvider('ollama-nomic-embed-text');
      expect(localProvider).toBeInstanceOf(LocalEmbeddingProvider);
    });

    it('should throw for unknown model', () => {
      expect(() => {
        EmbeddingFactory.createProvider('unknown-model');
      }).toThrow();
    });

    it('should list all available models', () => {
      const models = EmbeddingFactory.getAvailableModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('name');
      expect(models[0]).toHaveProperty('provider');
    });
  });

  describe('Smart Provider', () => {
    let smartProvider: SmartEmbeddingProvider;

    beforeEach(() => {
      smartProvider = new SmartEmbeddingProvider();
    });

    it('should initialize with available providers', async () => {
      await smartProvider.initialize({});
      expect(await smartProvider.isAvailable()).toBe(true);
    });

    it('should return available models', async () => {
      await smartProvider.initialize({});
      const models = smartProvider.getAvailableModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it('should embed with selected model', async () => {
      await smartProvider.initialize({});
      const result = await smartProvider.embed('test');
      expect(result).toHaveProperty('embedding');
    });

    it('should switch between models', async () => {
      await smartProvider.initialize({});
      const available = smartProvider.getAvailableModels();
      
      if (available.length > 1) {
        smartProvider.switchModel(available[0]);
        const model = smartProvider.getModel();
        expect(model.name).toContain(available[0].split(':')[0] || '');
      }
    });

    it('should throw when switching to unavailable model', async () => {
      await smartProvider.initialize({});
      expect(() => {
        smartProvider.switchModel('nonexistent-model');
      }).toThrow();
    });

    it('should support preferred model', async () => {
      await smartProvider.initialize({
        preferredModel: 'ollama-nomic-embed-text',
      });
      const model = smartProvider.getModel();
      expect(model.dimensions).toBeGreaterThan(0);
    });
  });

  describe('Embedding Results', () => {
    it('should include model name in result', async () => {
      const provider = new OpenAIEmbeddingProvider('test-key');
      const result = await provider.embed('test');
      
      expect(result.model).toBeDefined();
      expect(typeof result.model).toBe('string');
    });

    it('should preserve text in result', async () => {
      const provider = new LocalEmbeddingProvider();
      const text = 'important text to embed';
      const result = await provider.embed(text);
      
      expect(result.text).toBe(text);
    });

    it('should generate consistent dimensions', async () => {
      const provider = new OpenAIEmbeddingProvider('test-key');
      const result = await provider.embed('test');
      const model = provider.getModel();
      
      expect(result.embedding.length).toBe(model.dimensions);
    });
  });

  describe('Model Metadata', () => {
    it('should have dimensions for all models', () => {
      const models = EmbeddingFactory.getAvailableModels();
      models.forEach(m => {
        expect(m.dimensions).toBeGreaterThan(0);
      });
    });

    it('should have descriptions', () => {
      const models = EmbeddingFactory.getAvailableModels();
      models.forEach(m => {
        expect(m.description.length).toBeGreaterThan(0);
      });
    });

    it('should have pricing for commercial models', () => {
      const models = EmbeddingFactory.getModelsByProvider('openai');
      models.forEach(m => {
        expect(m.costPer1kTokens).toBeGreaterThan(0);
      });
    });

    it('should have zero cost for local models', () => {
      const models = EmbeddingFactory.getModelsByProvider('local');
      models.forEach(m => {
        expect(m.costPer1kTokens).toBeUndefined();
      });
    });
  });
});
