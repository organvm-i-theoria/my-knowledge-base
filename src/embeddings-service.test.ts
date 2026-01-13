import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingsService } from './embeddings-service.js';

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
}));

vi.mock('openai', () => {
  return {
    default: class OpenAI {
      embeddings = { create: createMock };
    },
  };
});

describe('EmbeddingsService', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('generates a single embedding', async () => {
    createMock.mockResolvedValueOnce({ data: [{ embedding: [0.1, 0.2] }] });
    const service = new EmbeddingsService('test-key', 'text-embedding-3-small');

    const embedding = await service.generateEmbedding('hello');

    expect(embedding).toEqual([0.1, 0.2]);
    expect(createMock).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: 'hello',
      encoding_format: 'float',
    });
  });

  it('batches embedding generation', async () => {
    createMock
      .mockResolvedValueOnce({ data: [{ embedding: [0.1] }, { embedding: [0.2] }] })
      .mockResolvedValueOnce({ data: [{ embedding: [0.3] }] });

    const service = new EmbeddingsService('test-key', 'text-embedding-3-small');
    (service as any).batchSize = 2;

    const embeddings = await service.generateEmbeddings(['a', 'b', 'c']);

    expect(embeddings).toEqual([[0.1], [0.2], [0.3]]);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('truncates long text based on token budget', () => {
    const service = new EmbeddingsService('test-key', 'text-embedding-3-small');
    const text = 'a'.repeat(50);

    const truncated = service.prepareText(text, 5); // 5 tokens ~ 20 chars

    expect(truncated.length).toBe(20);
  });
});
