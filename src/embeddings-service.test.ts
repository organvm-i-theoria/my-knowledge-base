import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createProviderMock, embedMock } = vi.hoisted(() => ({
  createProviderMock: vi.fn(),
  embedMock: vi.fn(),
}));

vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

vi.mock('./config.js', () => ({
  getConfig: () => ({
    getAll: () => ({
      embedding: {
        provider: 'openai',
        model: 'text-embedding-3-small',
        batchSize: 100,
      },
    }),
  }),
  resolveEmbeddingProfile: (_config?: any, env: NodeJS.ProcessEnv = process.env) => {
    const provider = env.KB_EMBEDDINGS_PROVIDER === 'mock' ? 'mock' : 'openai';
    const model = provider === 'mock' ? 'mock-embeddings' : 'text-embedding-3-small';
    return {
      provider,
      model,
      dimensions: 1536,
      maxTokens: 8191,
      batchSize: 100,
      profileId: 'emb_test_profile',
    };
  },
}));

vi.mock('./ai-factory.js', () => ({
  AIFactory: {
    createProvider: createProviderMock,
  },
}));

import { EmbeddingsService } from './embeddings-service.js';

describe('EmbeddingsService', () => {
  beforeEach(() => {
    delete process.env.KB_EMBEDDINGS_PROVIDER;
    embedMock.mockReset();
    createProviderMock.mockReset();
    createProviderMock.mockReturnValue({
      id: 'openai',
      name: 'OpenAI Compatible',
      chat: vi.fn(async () => ''),
      embed: embedMock,
      getModels: vi.fn(async () => []),
      healthCheck: vi.fn(async () => true),
    });
  });

  it('uses deterministic mock provider in test mode', async () => {
    process.env.KB_EMBEDDINGS_PROVIDER = 'mock';
    const service = new EmbeddingsService();

    const first = await service.generateEmbedding('hello');
    const second = await service.generateEmbedding('hello');
    const different = await service.generateEmbedding('different');

    expect(createProviderMock).not.toHaveBeenCalled();
    expect(first).toHaveLength(1536);
    expect(first).toEqual(second);
    expect(first).not.toEqual(different);
  });

  it('generates a single embedding', async () => {
    embedMock.mockResolvedValueOnce([[0.1, 0.2]]);
    const service = new EmbeddingsService();

    const embedding = await service.generateEmbedding('hello');

    expect(embedding).toEqual([0.1, 0.2]);
    expect(embedMock).toHaveBeenCalledWith(['hello'], {
      model: 'text-embedding-3-small',
    });
    expect(createProviderMock).toHaveBeenCalledWith(
      'openai',
      expect.objectContaining({
        model: 'text-embedding-3-small',
      }),
    );
  });

  it('batches embedding generation', async () => {
    embedMock
      .mockResolvedValueOnce([[0.1], [0.2]])
      .mockResolvedValueOnce([[0.3]]);

    const service = new EmbeddingsService();
    (service as any).batchSize = 2;

    const embeddings = await service.generateEmbeddings(['a', 'b', 'c']);

    expect(embeddings).toEqual([[0.1], [0.2], [0.3]]);
    expect(embedMock).toHaveBeenCalledTimes(2);
    expect(embedMock).toHaveBeenNthCalledWith(1, ['a', 'b'], {
      model: 'text-embedding-3-small',
    });
    expect(embedMock).toHaveBeenNthCalledWith(2, ['c'], {
      model: 'text-embedding-3-small',
    });
  });

  it('truncates long text based on token budget', () => {
    const service = new EmbeddingsService();
    const text = 'a'.repeat(50);

    const truncated = service.prepareText(text, 5); // 5 tokens ~ 20 chars

    expect(truncated.length).toBe(20);
  });

  it('exposes embedding profile metadata', () => {
    const service = new EmbeddingsService();
    const profile = service.getProfile();

    expect(profile.profileId).toBe('emb_test_profile');
    expect(profile.dimensions).toBe(1536);
    expect(profile.model).toBe('text-embedding-3-small');
  });
});
