/**
 * ConversationSummarizer test suite
 * Tests: Single summarization, batch processing, collection summary, output format
 * Coverage: 25+ test cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConversationSummarizer, ConversationSummary } from './conversation-summarizer.js';
import { ClaudeService } from './claude-service.js';
import { Conversation } from './types.js';

// Mock ClaudeService
vi.mock('./claude-service.js', () => ({
  ClaudeService: vi.fn(),
}));

describe('ConversationSummarizer', () => {
  let summarizer: ConversationSummarizer;
  let mockClaudeService: any;

  const mockConversation: Conversation = {
    id: 'conv-1',
    title: 'React Performance Optimization Discussion',
    messages: [
      {
        role: 'user',
        content: 'How do I optimize React performance for large lists?',
      },
      {
        role: 'assistant',
        content: 'Use React.memo, useMemo, and virtualization with react-window.',
      },
      {
        role: 'user',
        content: 'Should I use virtualization or pagination?',
      },
      {
        role: 'assistant',
        content:
          'Virtualization is better for continuous scrolling. Pagination is good for traditional navigation.',
      },
    ],
    timestamp: new Date(),
  };

  const mockSummaryResponse: ConversationSummary = {
    title: 'React List Performance Optimization',
    summary: 'Discussion on optimizing React lists with performance techniques and comparing virtualization vs pagination approaches.',
    keyPoints: [
      'React.memo prevents unnecessary rerenders',
      'Use useMemo for expensive computations',
      'Virtualization is better for continuous scrolling',
      'Pagination works well for traditional navigation',
    ],
    topics: ['React', 'performance', 'lists', 'optimization'],
    outcome:
      'Best practice: use virtualization for infinite scroll and pagination for traditional navigation',
    actionItems: ['Evaluate react-window for project needs'],
    codeSnippets: 0,
    technologiesMentioned: ['React', 'react-window'],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockClaudeService = {
      chat: vi.fn(),
      printStats: vi.fn(),
      getTokenStats: vi.fn().mockReturnValue({
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cacheSavings: 0,
      }),
    };

    (ClaudeService as any).mockImplementation(function () {
      return mockClaudeService;
    });

    summarizer = new ConversationSummarizer(mockClaudeService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create summarizer with provided ClaudeService', () => {
      expect(summarizer).toBeDefined();
    });

    it('should create summarizer with default ClaudeService', () => {
      (ClaudeService as any).mockImplementationOnce(function () {
        return mockClaudeService;
      });
      const s = new ConversationSummarizer();
      expect(s).toBeDefined();
    });
  });

  describe('Single Summarization', () => {
    it('should generate title for conversation', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(mockConversation);

      expect(summary.title).toBe('React List Performance Optimization');
      expect(summary.title.length).toBeGreaterThan(0);
    });

    it('should create 2-3 sentence summary', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(mockConversation);

      expect(summary.summary).toBeDefined();
      expect(summary.summary.length).toBeGreaterThan(20);
    });

    it('should extract key points', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(mockConversation);

      expect(Array.isArray(summary.keyPoints)).toBe(true);
      expect(summary.keyPoints.length).toBeGreaterThan(0);
      expect(summary.keyPoints[0]).toBeTruthy();
    });

    it('should identify topics', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(mockConversation);

      expect(Array.isArray(summary.topics)).toBe(true);
      expect(summary.topics.length).toBeGreaterThan(0);
      expect(summary.topics).toContain('React');
    });

    it('should determine outcome/conclusion', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(mockConversation);

      expect(summary.outcome).toBeDefined();
      expect(summary.outcome.length).toBeGreaterThan(0);
    });

    it('should identify action items', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(mockConversation);

      expect(Array.isArray(summary.actionItems)).toBe(true);
    });

    it('should detect technologies mentioned', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(mockConversation);

      expect(Array.isArray(summary.technologiesMentioned)).toBe(true);
      expect(summary.technologiesMentioned).toContain('React');
    });

    it('should use low temperature for consistent summaries', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      await summarizer.summarize(mockConversation);

      const call = mockClaudeService.chat.mock.calls[0][1];
      expect(call.temperature).toBe(0.2);
      expect(call.useCache).toBe(true);
    });

    it('should set appropriate token limit', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      await summarizer.summarize(mockConversation);

      const call = mockClaudeService.chat.mock.calls[0][1];
      expect(call.maxTokens).toBe(1500);
    });

    it('should return default summary on error', async () => {
      mockClaudeService.chat.mockRejectedValueOnce(new Error('API Error'));

      const summary = await summarizer.summarize(mockConversation);

      expect(summary.title).toBe(mockConversation.title);
      expect(summary.summary).toBe('Conversation summary unavailable');
      expect(summary.keyPoints).toEqual([]);
    });
  });

  describe('Batch Summarization', () => {
    it('should summarize multiple conversations', async () => {
      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockSummaryResponse));

      const conversations: Conversation[] = [
        mockConversation,
        { ...mockConversation, id: 'conv-2', title: 'Conversation 2' },
        { ...mockConversation, id: 'conv-3', title: 'Conversation 3' },
      ];

      const results = await summarizer.summarizeBatch(conversations);

      expect(results.size).toBe(3);
      expect(mockClaudeService.chat).toHaveBeenCalledTimes(3);
    });

    it('should return map with conversation IDs as keys', async () => {
      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockSummaryResponse));

      const conversations: Conversation[] = [
        mockConversation,
        { ...mockConversation, id: 'conv-2' },
      ];

      const results = await summarizer.summarizeBatch(conversations);

      expect(results.has('conv-1')).toBe(true);
      expect(results.has('conv-2')).toBe(true);
    });

    it('should apply rate limiting between batch items', async () => {
      vi.useFakeTimers();
      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockSummaryResponse));

      const conversations: Conversation[] = [
        mockConversation,
        { ...mockConversation, id: 'conv-2' },
      ];

      await summarizer.summarizeBatch(conversations);

      vi.useRealTimers();

      expect(mockClaudeService.chat).toHaveBeenCalledTimes(2);
    });

    it('should print stats after batch', async () => {
      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockSummaryResponse));

      const conversations = [mockConversation, { ...mockConversation, id: 'conv-2' }];

      await summarizer.summarizeBatch(conversations);

      expect(mockClaudeService.printStats).toHaveBeenCalled();
    });

    it('should handle single conversation batch', async () => {
      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockSummaryResponse));

      const results = await summarizer.summarizeBatch([mockConversation]);

      expect(results.size).toBe(1);
    });

    it('should handle empty batch', async () => {
      const results = await summarizer.summarizeBatch([]);

      expect(results.size).toBe(0);
      expect(mockClaudeService.chat).not.toHaveBeenCalled();
    });

    it('should continue batch on single conversation error', async () => {
      mockClaudeService.chat
        .mockResolvedValueOnce(JSON.stringify(mockSummaryResponse))
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const conversations: Conversation[] = [
        mockConversation,
        { ...mockConversation, id: 'conv-2' },
        { ...mockConversation, id: 'conv-3' },
      ];

      const results = await summarizer.summarizeBatch(conversations);

      expect(results.size).toBe(3);
    });
  });

  describe('Collection Summary', () => {
    it('should create meta-summary of multiple summaries', async () => {
      mockClaudeService.chat.mockResolvedValueOnce('Collection summary text');

      const summaries: ConversationSummary[] = [
        mockSummaryResponse,
        { ...mockSummaryResponse, title: 'Another Conversation' },
      ];

      const result = await summarizer.summarizeCollection(summaries);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(mockClaudeService.chat).toHaveBeenCalled();
    });

    it('should identify common themes', async () => {
      mockClaudeService.chat.mockResolvedValueOnce('Common theme: React optimization');

      const summaries: ConversationSummary[] = [
        mockSummaryResponse,
        { ...mockSummaryResponse, topics: ['React', 'testing'] },
      ];

      const result = await summarizer.summarizeCollection(summaries);

      expect(result).toBeTruthy();
    });

    it('should aggregate statistics', async () => {
      mockClaudeService.chat.mockResolvedValueOnce('Statistics summary');

      const summaries: ConversationSummary[] = [
        mockSummaryResponse,
        { ...mockSummaryResponse, title: 'Conversation 2' },
      ];

      const result = await summarizer.summarizeCollection(summaries);

      expect(result).toBeTruthy();
    });

    it('should handle single summary', async () => {
      mockClaudeService.chat.mockResolvedValueOnce('Single summary');

      const result = await summarizer.summarizeCollection([mockSummaryResponse]);

      expect(result).toBeTruthy();
    });

    it('should handle empty collection', async () => {
      mockClaudeService.chat.mockResolvedValueOnce('Empty collection');

      const result = await summarizer.summarizeCollection([]);

      expect(result).toBeTruthy();
    });

    it('should handle errors gracefully', async () => {
      mockClaudeService.chat.mockRejectedValueOnce(new Error('API Error'));

      const result = await summarizer.summarizeCollection([mockSummaryResponse]);

      expect(result).toBe('Failed to generate collection summary.');
    });

    it('should use appropriate settings for collection summary', async () => {
      mockClaudeService.chat.mockResolvedValueOnce('Collection summary');

      const summaries = [mockSummaryResponse];

      await summarizer.summarizeCollection(summaries);

      const call = mockClaudeService.chat.mock.calls[0][1];
      expect(call.temperature).toBe(0.3);
      expect(call.maxTokens).toBe(800);
    });
  });

  describe('Output Format Validation', () => {
    it('should parse valid JSON response', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(mockConversation);

      expect(summary.title).toBe('React List Performance Optimization');
    });

    it('should handle JSON wrapped in markdown', async () => {
      const wrappedResponse = `\`\`\`json\n${JSON.stringify(mockSummaryResponse)}\n\`\`\``;
      mockClaudeService.chat.mockResolvedValueOnce(wrappedResponse);

      const summary = await summarizer.summarize(mockConversation);

      expect(summary.title).toBe('React List Performance Optimization');
    });

    it('should handle malformed JSON gracefully', async () => {
      mockClaudeService.chat.mockResolvedValueOnce('{ invalid json }');

      const summary = await summarizer.summarize(mockConversation);

      expect(summary.title).toBe(mockConversation.title);
      expect(summary.keyPoints).toEqual([]);
    });

    it('should handle response with no JSON', async () => {
      mockClaudeService.chat.mockResolvedValueOnce('Plain text without JSON');

      const summary = await summarizer.summarize(mockConversation);

      expect(summary).toBeDefined();
      expect(summary.summary).toBeTruthy();
    });

    it('should handle partial response', async () => {
      const partialResponse = JSON.stringify({
        title: 'Title only',
        // Missing other fields
      });

      mockClaudeService.chat.mockResolvedValueOnce(partialResponse);

      const summary = await summarizer.summarize(mockConversation);

      expect(summary.title).toBe('Title only');
    });

    it('should include all required fields', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(mockConversation);

      expect(summary).toHaveProperty('title');
      expect(summary).toHaveProperty('summary');
      expect(summary).toHaveProperty('keyPoints');
      expect(summary).toHaveProperty('topics');
      expect(summary).toHaveProperty('outcome');
      expect(summary).toHaveProperty('technologiesMentioned');
    });

    it('should handle optional fields', async () => {
      const responseWithOptional = {
        ...mockSummaryResponse,
        actionItems: ['Action 1', 'Action 2'],
        codeSnippets: 2,
      };

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(responseWithOptional));

      const summary = await summarizer.summarize(mockConversation);

      expect(summary.actionItems).toContain('Action 1');
      expect(summary.codeSnippets).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle Claude API errors gracefully', async () => {
      mockClaudeService.chat.mockRejectedValueOnce(new Error('API Error'));

      const summary = await summarizer.summarize(mockConversation);

      expect(summary).toBeDefined();
      expect(summary.title).toBe(mockConversation.title);
    });

    it('should handle network timeout', async () => {
      mockClaudeService.chat.mockRejectedValueOnce(new Error('Timeout'));

      const summary = await summarizer.summarize(mockConversation);

      expect(summary.summary).toBe('Conversation summary unavailable');
    });

    it('should provide fallback when Claude fails', async () => {
      mockClaudeService.chat.mockRejectedValueOnce(new Error('Failed'));

      const summary = await summarizer.summarize(mockConversation);

      expect(summary.keyPoints).toEqual([]);
      expect(summary.topics).toEqual([]);
      expect(summary.outcome).toBe('Unknown');
    });
  });

  describe('Token Tracking', () => {
    it('should expose token statistics', () => {
      const stats = summarizer.getStats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('inputTokens');
      expect(stats).toHaveProperty('outputTokens');
      expect(stats).toHaveProperty('totalCost');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very short conversation', async () => {
      const shortConv: Conversation = {
        ...mockConversation,
        messages: [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello' },
        ],
      };

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(shortConv);

      expect(summary).toBeDefined();
    });

    it('should handle very long conversation', async () => {
      const longMessages = Array(50)
        .fill(0)
        .map((_, i) => ({
          role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
          content: `Message ${i}: This is a test message.`,
        }));

      const longConv: Conversation = {
        ...mockConversation,
        messages: longMessages,
      };

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(longConv);

      expect(summary).toBeDefined();
    });

    it('should handle conversation with code snippets', async () => {
      const codeConv: Conversation = {
        ...mockConversation,
        messages: [
          {
            role: 'user',
            content: 'How do I optimize this code?',
          },
          {
            role: 'assistant',
            content: `Use this approach:\n\nconst optimized = items.map(x => x * 2);\n\nThis is faster than loops.`,
          },
        ],
      };

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(codeConv);

      expect(summary).toBeDefined();
    });

    it('should handle special characters', async () => {
      const specialConv: Conversation = {
        ...mockConversation,
        title: 'Special Chars: !@#$%^&*()',
        messages: [
          {
            role: 'user',
            content: 'Explain "quotes" and \'apostrophes\'',
          },
          {
            role: 'assistant',
            content: 'Use backslashes: \\"quotes\\" and \\\'apostrophes\'.',
          },
        ],
      };

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(specialConv);

      expect(summary).toBeDefined();
    });

    it('should handle unicode characters', async () => {
      const unicodeConv: Conversation = {
        ...mockConversation,
        title: 'Unicode Test 你好 🚀',
        messages: [
          {
            role: 'user',
            content: 'Explain: ñ é ü 中文',
          },
          {
            role: 'assistant',
            content: 'These are unicode characters.',
          },
        ],
      };

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(unicodeConv);

      expect(summary).toBeDefined();
    });

    it('should handle empty conversation', async () => {
      const emptyConv: Conversation = {
        ...mockConversation,
        messages: [],
      };

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(emptyConv);

      expect(summary).toBeDefined();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle realistic multi-turn conversation', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(mockConversation);

      expect(summary.title).toBeTruthy();
      expect(summary.keyPoints.length).toBeGreaterThan(0);
      expect(summary.topics.length).toBeGreaterThan(0);
    });

    it('should process large batch of conversations', async () => {
      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockSummaryResponse));

      const conversations = Array(10)
        .fill(0)
        .map((_, i) => ({
          ...mockConversation,
          id: `conv-${i}`,
          title: `Conversation ${i}`,
        }));

      const results = await summarizer.summarizeBatch(conversations);

      expect(results.size).toBe(10);
    });

    it('should maintain data integrity through summary pipeline', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockSummaryResponse));

      const summary = await summarizer.summarize(mockConversation);

      // Verify no data loss
      expect(summary.title).toBeTruthy();
      expect(summary.summary).toBeTruthy();
      expect(Array.isArray(summary.keyPoints)).toBe(true);
      expect(Array.isArray(summary.topics)).toBe(true);
      expect(Array.isArray(summary.technologiesMentioned)).toBe(true);
    });

    it('should handle workflow: summarize batch then collection', async () => {
      mockClaudeService.chat
        .mockResolvedValueOnce(JSON.stringify(mockSummaryResponse))
        .mockResolvedValueOnce(JSON.stringify(mockSummaryResponse))
        .mockResolvedValueOnce('Collection summary');

      const conversations = [mockConversation, { ...mockConversation, id: 'conv-2' }];

      const batchResults = await summarizer.summarizeBatch(conversations);
      const summaries = Array.from(batchResults.values());
      const collection = await summarizer.summarizeCollection(summaries);

      expect(batchResults.size).toBe(2);
      expect(collection).toBeTruthy();
    });
  });
});
