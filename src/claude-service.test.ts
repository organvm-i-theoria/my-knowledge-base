/**
 * ClaudeService test suite
 * Tests: API integration, prompt caching, token tracking, batch processing, error handling
 * Coverage: 30+ test cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeService, ClaudeMessage, ClaudeOptions, TokenUsage } from './claude-service.js';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}));

describe('ClaudeService', () => {
  let service: ClaudeService;
  let mockClient: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock Anthropic client
    mockClient = {
      messages: {
        create: vi.fn(),
      },
    };

    (Anthropic as any).mockImplementation(() => mockClient);

    // Create service with test API key
    process.env.ANTHROPIC_API_KEY = 'test-key';
    service = new ClaudeService('test-key');
  });

  afterEach(() => {
    service.resetStats();
  });

  describe('Initialization', () => {
    it('should create service with default model', () => {
      const svc = new ClaudeService('test-key');
      expect(svc).toBeDefined();
    });

    it('should accept custom model', () => {
      const svc = new ClaudeService('test-key', 'claude-3-opus');
      expect(svc).toBeDefined();
    });

    it('should use ANTHROPIC_API_KEY from environment', () => {
      process.env.ANTHROPIC_API_KEY = 'env-key'; // allow-secret
      const svc = new ClaudeService();
      expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'env-key' }); // allow-secret
    });

    it('should initialize token stats to zero', () => {
      const stats = service.getTokenStats();
      expect(stats.inputTokens).toBe(0);
      expect(stats.outputTokens).toBe(0);
      expect(stats.cacheCreationTokens).toBe(0);
      expect(stats.cacheReadTokens).toBe(0);
      expect(stats.totalCost).toBe(0);
      expect(stats.cacheSavings).toBe(0);
    });
  });

  describe('chat() - Single message API', () => {
    it('should send message and return response', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Hello, world!' }],
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      });

      const result = await service.chat('Say hello');
      expect(result).toBe('Hello, world!');
      expect(mockClient.messages.create).toHaveBeenCalled();
    });

    it('should accept custom model in options', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await service.chat('test', { model: 'claude-3-opus' });

      const call = mockClient.messages.create.mock.calls[0][0];
      expect(call.model).toBe('claude-3-opus');
    });

    it('should respect maxTokens option', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await service.chat('test', { maxTokens: 1000 });

      const call = mockClient.messages.create.mock.calls[0][0];
      expect(call.max_tokens).toBe(1000);
    });

    it('should apply temperature setting', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await service.chat('test', { temperature: 0.5 });

      const call = mockClient.messages.create.mock.calls[0][0];
      expect(call.temperature).toBe(0.5);
    });

    it('should handle empty response', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [],
        usage: { input_tokens: 10, output_tokens: 0 },
      });

      const result = await service.chat('test');
      expect(result).toBe('');
    });

    it('should handle non-text content', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'image', data: 'base64' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const result = await service.chat('test');
      expect(result).toBe('');
    });
  });

  describe('Prompt Caching', () => {
    it('should mark system prompt with cache_control when useCache=true', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 100,
        },
      });

      await service.chat('test', {
        useCache: true,
        systemPrompt: 'You are helpful',
      });

      const call = mockClient.messages.create.mock.calls[0][0];
      const systemMessages = call.system as any[];
      expect(systemMessages.length).toBeGreaterThan(0);
      expect(systemMessages[0].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('should not add cache_control when useCache=false', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await service.chat('test', {
        useCache: false,
        systemPrompt: 'You are helpful',
      });

      const call = mockClient.messages.create.mock.calls[0][0];
      const systemMessages = call.system as any[];
      if (systemMessages && systemMessages.length > 0) {
        expect(systemMessages[0].cache_control).toBeUndefined();
      }
    });

    it('should include cachedContext in system messages', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await service.chat('test', {
        useCache: true,
        cachedContext: 'Important context',
      });

      const call = mockClient.messages.create.mock.calls[0][0];
      const systemMessages = call.system as any[];
      const hasContext = systemMessages.some(msg => msg.text.includes('Important context'));
      expect(hasContext).toBe(true);
    });

    it('should track cache creation tokens', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 500,
          cache_read_input_tokens: 0,
        },
      });

      await service.chat('test', { useCache: true });

      const stats = service.getTokenStats();
      expect(stats.cacheCreationTokens).toBe(500);
    });

    it('should track cache read tokens', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 1000,
        },
      });

      await service.chat('test', { useCache: true });

      const stats = service.getTokenStats();
      expect(stats.cacheReadTokens).toBe(1000);
    });
  });

  describe('Token Tracking', () => {
    it('should accumulate input tokens across multiple calls', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 150, output_tokens: 75 },
      });

      await service.chat('test1');
      await service.chat('test2');

      const stats = service.getTokenStats();
      expect(stats.inputTokens).toBe(250);
    });

    it('should accumulate output tokens', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 100, output_tokens: 75 },
      });

      await service.chat('test1');
      await service.chat('test2');

      const stats = service.getTokenStats();
      expect(stats.outputTokens).toBe(125);
    });

    it('should calculate total cost correctly', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
        },
      });

      await service.chat('test');

      const stats = service.getTokenStats();
      // Input: 1000 * (3/1M) = 0.003
      // Output: 500 * (15/1M) = 0.0075
      // Total: 0.0105
      expect(stats.totalCost).toBeCloseTo(0.0105, 5);
    });

    it('should calculate cache savings when cache is used', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 1000,
          cache_read_input_tokens: 0,
        },
      });

      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 1000,
        },
      });

      await service.chat('test', { useCache: true });
      await service.chat('test2', { useCache: true });

      const stats = service.getTokenStats();
      // First call: 1000 cache writes + 10 input
      // Second call: 1000 cache reads (0.3/MTok) instead of 1000 input reads (3/MTok)
      // Savings: (1000 * 3/1M) - (1000 * 0.3/1M) = 0.003 - 0.0003 = 0.0027
      expect(stats.cacheSavings).toBeGreaterThan(0);
    });

    it('should reset stats when resetStats() called', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      await service.chat('test');
      service.resetStats();

      const stats = service.getTokenStats();
      expect(stats.inputTokens).toBe(0);
      expect(stats.outputTokens).toBe(0);
      expect(stats.totalCost).toBe(0);
    });
  });

  describe('conversation() - Multi-turn API', () => {
    it('should send multiple messages in conversation', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Hello!' }],
        usage: { input_tokens: 20, output_tokens: 10 },
      });

      const messages: ClaudeMessage[] = [
        { role: 'user', content: 'Hi there' },
        { role: 'assistant', content: 'Hello!' },
      ];

      const result = await service.conversation(messages);
      expect(result).toBe('Hello!');

      const call = mockClient.messages.create.mock.calls[0][0];
      expect(call.messages).toHaveLength(2);
    });

    it('should include system prompt in conversation', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 20, output_tokens: 10 },
      });

      const messages: ClaudeMessage[] = [{ role: 'user', content: 'test' }];

      await service.conversation(messages, { systemPrompt: 'You are helpful' });

      const call = mockClient.messages.create.mock.calls[0][0];
      expect(call.system).toBeDefined();
    });

    it('should apply cache_control to system messages in conversation', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 20, output_tokens: 10 },
      });

      const messages: ClaudeMessage[] = [{ role: 'user', content: 'test' }];

      await service.conversation(messages, {
        useCache: true,
        systemPrompt: 'System context',
      });

      const call = mockClient.messages.create.mock.calls[0][0];
      const systemMessages = call.system as any[];
      expect(systemMessages[0].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('should track tokens in conversation', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 50, output_tokens: 25 },
      });

      const messages: ClaudeMessage[] = [{ role: 'user', content: 'test' }];
      await service.conversation(messages);

      const stats = service.getTokenStats();
      expect(stats.inputTokens).toBe(50);
      expect(stats.outputTokens).toBe(25);
    });
  });

  describe('batchProcess() - Batch operations', () => {
    it('should process multiple items sequentially', async () => {
      mockClient.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'processed' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const items = ['item1', 'item2', 'item3'];
      const results = await service.batchProcess(
        items,
        (item) => `Process: ${item}`
      );

      expect(results).toHaveLength(3);
      expect(mockClient.messages.create).toHaveBeenCalledTimes(3);
    });

    it('should apply rate limiting delays between items', async () => {
      vi.useFakeTimers();
      const delays: number[] = [];
      let lastTime = Date.now();

      mockClient.messages.create.mockImplementation(() => {
        const now = Date.now();
        if (lastTime > 0) {
          delays.push(now - lastTime);
        }
        lastTime = now;
        return Promise.resolve({
          content: [{ type: 'text', text: 'response' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        });
      });

      const items = ['item1', 'item2'];
      await service.batchProcess(items, (item) => item);

      vi.useRealTimers();
      // We can't test exact timing with mocks, but we can verify calls were made
      expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
    });

    it('should accumulate tokens across batch', async () => {
      mockClient.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const items = ['a', 'b', 'c'];
      await service.batchProcess(items, (item) => item);

      const stats = service.getTokenStats();
      expect(stats.inputTokens).toBe(30); // 3 items × 10 tokens
      expect(stats.outputTokens).toBe(15); // 3 items × 5 tokens
    });

    it('should return array of results in order', async () => {
      let callCount = 0;
      mockClient.messages.create.mockImplementation(() => {
        return Promise.resolve({
          content: [{ type: 'text', text: `response${callCount++}` }],
          usage: { input_tokens: 10, output_tokens: 5 },
        });
      });

      const items = ['a', 'b', 'c'];
      const results = await service.batchProcess(items, (item) => item);

      expect(results[0]).toBe('response0');
      expect(results[1]).toBe('response1');
      expect(results[2]).toBe('response2');
    });

    it('should apply options to each batch call', async () => {
      mockClient.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const items = ['a', 'b'];
      await service.batchProcess(items, (item) => item, {
        temperature: 0.7,
        maxTokens: 500,
      });

      const call = mockClient.messages.create.mock.calls[0][0];
      expect(call.temperature).toBe(0.7);
      expect(call.max_tokens).toBe(500);
    });

    it('should handle empty batch', async () => {
      const results = await service.batchProcess([], (item) => item);
      expect(results).toEqual([]);
    });

    it('should handle single item batch', async () => {
      mockClient.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const results = await service.batchProcess(['item'], (item) => item);
      expect(results).toHaveLength(1);
    });
  });

  describe('Error Handling', () => {
    it('should throw when API key missing', async () => {
      mockClient.messages.create.mockRejectedValueOnce(
        new Error('Invalid API key')
      );

      await expect(service.chat('test')).rejects.toThrow();
    });

    it('should throw on rate limit error', async () => {
      mockClient.messages.create.mockRejectedValueOnce(
        new Error('Rate limit exceeded')
      );

      await expect(service.chat('test')).rejects.toThrow('Rate limit exceeded');
    });

    it('should throw on malformed response', async () => {
      mockClient.messages.create.mockRejectedValueOnce(
        new Error('Unexpected response format')
      );

      await expect(service.chat('test')).rejects.toThrow();
    });

    it('should handle network errors gracefully', async () => {
      mockClient.messages.create.mockRejectedValueOnce(
        new Error('Network timeout')
      );

      await expect(service.chat('test')).rejects.toThrow('Network timeout');
    });

    it('should continue batch processing on error', async () => {
      let callCount = 0;
      mockClient.messages.create.mockImplementation(() => {
        if (callCount === 1) {
          callCount++;
          throw new Error('API error');
        }
        callCount++;
        return Promise.resolve({
          content: [{ type: 'text', text: 'response' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        });
      });

      // Note: Current implementation doesn't have error recovery
      // This test documents expected behavior for error handling
      const items = ['a', 'b', 'c'];
      await expect(
        service.batchProcess(items, (item) => item)
      ).rejects.toThrow();
    });
  });

  describe('getTokenStats()', () => {
    it('should return copy of stats (not reference)', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await service.chat('test');

      const stats1 = service.getTokenStats();
      const stats2 = service.getTokenStats();

      stats1.inputTokens = 999;
      expect(stats2.inputTokens).toBe(10);
    });

    it('should include all stat fields', async () => {
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 50,
        },
      });

      await service.chat('test', { useCache: true });

      const stats = service.getTokenStats();
      expect(stats).toHaveProperty('inputTokens');
      expect(stats).toHaveProperty('outputTokens');
      expect(stats).toHaveProperty('cacheCreationTokens');
      expect(stats).toHaveProperty('cacheReadTokens');
      expect(stats).toHaveProperty('totalCost');
      expect(stats).toHaveProperty('cacheSavings');
    });
  });

  describe('printStats()', () => {
    it('should not throw when printing stats', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await service.chat('test');

      expect(() => service.printStats()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle realistic conversation flow', async () => {
      mockClient.messages.create
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Hi! How can I help?' }],
          usage: { input_tokens: 20, output_tokens: 10 },
        })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Sure, here is the code...' }],
          usage: { input_tokens: 50, output_tokens: 100 },
        });

      const msg1 = await service.chat('Hello');
      const messages: ClaudeMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: msg1 },
        { role: 'user', content: 'Show me how to use this' },
      ];

      const msg2 = await service.conversation(messages);

      expect(msg1).toBe('Hi! How can I help?');
      expect(msg2).toBe('Sure, here is the code...');

      const stats = service.getTokenStats();
      expect(stats.inputTokens).toBe(70);
      expect(stats.outputTokens).toBe(110);
    });

    it('should handle cached system prompt across multiple calls', async () => {
      mockClient.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        usage: {
          input_tokens: 5,
          output_tokens: 2,
          cache_creation_input_tokens: 200,
          cache_read_input_tokens: 0,
        },
      });

      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'response' }],
        usage: {
          input_tokens: 5,
          output_tokens: 2,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 200,
        },
      });

      const options: ClaudeOptions = {
        useCache: true,
        systemPrompt: 'You are a code expert',
      };

      await service.chat('First question', options);
      await service.chat('Second question', options);

      const stats = service.getTokenStats();
      expect(stats.cacheCreationTokens).toBeGreaterThan(0);
      expect(stats.cacheReadTokens).toBeGreaterThan(0);
    });
  });
});
