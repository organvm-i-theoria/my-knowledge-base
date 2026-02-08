import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeService } from './claude-service.js';

const {
  chatMock,
  createProviderMock,
  getConfiguredProviderMock,
  provider,
} = vi.hoisted(() => {
  const chatMock = vi.fn();
  const provider = {
    id: 'anthropic',
    name: 'Anthropic',
    chat: chatMock,
    embed: vi.fn(async () => []),
    getModels: vi.fn(async () => ['claude-3-5-sonnet-20241022']),
    healthCheck: vi.fn(async () => true),
  };

  return {
    chatMock,
    createProviderMock: vi.fn(() => provider),
    getConfiguredProviderMock: vi.fn(() => provider),
    provider,
  };
});

vi.mock('./ai-factory.js', () => ({
  AIFactory: {
    createProvider: createProviderMock,
    getConfiguredProvider: getConfiguredProviderMock,
  },
}));

describe('ClaudeService', () => {
  const TEST_API_KEY = 'unit-test-api-key-placeholder'; // allow-secret

  beforeEach(() => {
    vi.clearAllMocks();
    provider.id = 'anthropic';
    chatMock.mockResolvedValue('ok');
  });

  it('uses explicit api key path when provided', () => {
    // eslint-disable-next-line no-new
    new ClaudeService(TEST_API_KEY);
    expect(createProviderMock).toHaveBeenCalledWith('anthropic', { apiKey: TEST_API_KEY }); // allow-secret
  });

  it('uses configured provider when api key is omitted', () => {
    // eslint-disable-next-line no-new
    new ClaudeService();
    expect(getConfiguredProviderMock).toHaveBeenCalledTimes(1);
  });

  it('sends chat message with options to provider', async () => {
    const service = new ClaudeService(TEST_API_KEY, 'claude-test');
    chatMock.mockResolvedValueOnce('response text');

    const response = await service.chat('hello', {
      model: 'claude-custom',
      maxTokens: 123,
      temperature: 0.4,
      stop: ['END'],
    });

    expect(response).toBe('response text');
    expect(chatMock).toHaveBeenCalledWith(
      [{ role: 'user', content: 'hello' }],
      expect.objectContaining({
        model: 'claude-custom',
        maxTokens: 123,
        temperature: 0.4,
        stop: ['END'],
      }),
    );
  });

  it('combines system prompt and cached context into system message', async () => {
    const service = new ClaudeService(TEST_API_KEY);
    await service.chat('question', {
      systemPrompt: 'You are helpful',
      cachedContext: 'cached details',
    });

    const [messages] = chatMock.mock.calls[0];
    expect(messages[0]).toMatchObject({
      role: 'system',
    });
    expect(messages[0].content).toContain('You are helpful');
    expect(messages[0].content).toContain('cached details');
    expect(messages[1]).toEqual({ role: 'user', content: 'question' });
  });

  it('supports multi-turn conversation messages', async () => {
    const service = new ClaudeService(TEST_API_KEY);
    chatMock.mockResolvedValueOnce('conversation response');

    const response = await service.conversation([
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
    ], { systemPrompt: 'system header' });

    expect(response).toBe('conversation response');
    const [messages] = chatMock.mock.calls[0];
    expect(messages[0]).toEqual({ role: 'system', content: 'system header' });
    expect(messages).toHaveLength(4);
  });

  it('tracks token and cost estimates for non-local providers', async () => {
    const service = new ClaudeService(TEST_API_KEY);
    chatMock.mockResolvedValueOnce('12345678');

    await service.chat('abcdefgh');
    const stats = service.getTokenStats();

    expect(stats.inputTokens).toBe(2);
    expect(stats.outputTokens).toBe(2);
    expect(stats.totalCost).toBeGreaterThan(0);
  });

  it('does not add cloud cost estimates for local provider', async () => {
    provider.id = 'ollama';
    const service = new ClaudeService(TEST_API_KEY);
    chatMock.mockResolvedValueOnce('local reply');

    await service.chat('local prompt');
    const stats = service.getTokenStats();

    expect(stats.inputTokens).toBeGreaterThan(0);
    expect(stats.outputTokens).toBeGreaterThan(0);
    expect(stats.totalCost).toBe(0);
  });

  it('resets statistics via resetStats()', async () => {
    const service = new ClaudeService(TEST_API_KEY);
    chatMock.mockResolvedValueOnce('some output');

    await service.chat('some input');
    service.resetStats();

    expect(service.getTokenStats()).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0,
      cacheSavings: 0,
    });
  });

  it('returns a defensive copy from getTokenStats()', async () => {
    const service = new ClaudeService(TEST_API_KEY);
    chatMock.mockResolvedValueOnce('reply');

    await service.chat('input');
    const stats = service.getTokenStats();
    stats.inputTokens = 99999;

    expect(service.getTokenStats().inputTokens).not.toBe(99999);
  });

  it('batchProcess runs each item through chat pipeline', async () => {
    vi.useFakeTimers();
    const service = new ClaudeService(TEST_API_KEY);
    chatMock.mockResolvedValue('done');

    const pending = service.batchProcess(['a', 'b'], (item) => `process:${item}`);
    await vi.runAllTimersAsync();
    const results = await pending;
    vi.useRealTimers();

    expect(results).toEqual(['done', 'done']);
    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(chatMock.mock.calls[0][0]).toEqual([{ role: 'user', content: 'process:a' }]);
    expect(chatMock.mock.calls[1][0]).toEqual([{ role: 'user', content: 'process:b' }]);
  });
});
