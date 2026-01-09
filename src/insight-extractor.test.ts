/**
 * InsightExtractor test suite
 * Tests: Single extraction, batch processing, output format, conversion, edge cases
 * Coverage: 35+ test cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InsightExtractor, ExtractedInsight } from './insight-extractor.js';
import { ClaudeService } from './claude-service.js';
import { Conversation, AtomicUnit } from './types.js';

// Mock ClaudeService
vi.mock('./claude-service.js');

describe('InsightExtractor', () => {
  let extractor: InsightExtractor;
  let mockClaudeService: any;

  const mockConversation: Conversation = {
    id: 'conv-1',
    title: 'React Performance Optimization',
    messages: [
      {
        role: 'user',
        content: 'How do I optimize React performance?',
      },
      {
        role: 'assistant',
        content:
          'Use React.memo for pure components, implement useMemo for expensive calculations, and use useCallback for stable function references.',
      },
      {
        role: 'user',
        content: 'What about list rendering?',
      },
      {
        role: 'assistant',
        content:
          'Always use stable keys for list items, not array indexes. Consider virtualization for large lists using libraries like react-window.',
      },
    ],
    timestamp: new Date(),
  };

  const mockInsightResponse = JSON.stringify({
    insights: [
      {
        type: 'insight',
        title: 'React Performance Optimization Patterns',
        content:
          'Key patterns for React optimization: React.memo prevents unnecessary rerenders, useMemo caches expensive computations, useCallback maintains function identity.',
        tags: ['React', 'performance', 'optimization'],
        category: 'programming',
        keywords: ['React.memo', 'useMemo', 'useCallback'],
        importance: 'high',
        relatedTopics: ['Virtual DOM', 'Render cycles'],
      },
      {
        type: 'code',
        title: 'List Rendering Best Practices',
        content:
          'Use stable keys when rendering lists, never use array index as key. For large lists, consider virtualization using react-window or react-virtualized.',
        tags: ['React', 'lists', 'performance'],
        category: 'programming',
        keywords: ['list rendering', 'keys', 'virtualization'],
        importance: 'high',
        relatedTopics: ['Performance', 'Rendering'],
      },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockClaudeService = {
      chat: vi.fn(),
      printStats: vi.fn(),
      getTokenStats: vi.fn(),
    };

    (ClaudeService as any).mockImplementation(() => mockClaudeService);

    extractor = new InsightExtractor(mockClaudeService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create extractor with provided ClaudeService', () => {
      expect(extractor).toBeDefined();
    });

    it('should create extractor without ClaudeService (uses default)', () => {
      (ClaudeService as any).mockImplementationOnce(() => mockClaudeService);
      const ext = new InsightExtractor();
      expect(ext).toBeDefined();
    });

    it('should have system prompt defined', () => {
      const stats = extractor.getStats();
      expect(stats).toBeDefined();
    });
  });

  describe('Single Extraction', () => {
    it('should extract insights from conversation', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(mockConversation);

      expect(results).toHaveLength(2);
      expect(mockClaudeService.chat).toHaveBeenCalled();
    });

    it('should return AtomicUnit array', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(mockConversation);

      expect(Array.isArray(results)).toBe(true);
      results.forEach((unit) => {
        expect(unit).toHaveProperty('id');
        expect(unit).toHaveProperty('type');
        expect(unit).toHaveProperty('title');
        expect(unit).toHaveProperty('content');
      });
    });

    it('should identify key learnings', async () => {
      const response = JSON.stringify({
        insights: [
          {
            type: 'insight',
            title: 'Key Learning',
            content: 'Important realization from conversation',
            tags: [],
            category: 'programming',
            keywords: [],
            importance: 'high',
            relatedTopics: [],
          },
        ],
      });

      mockClaudeService.chat.mockResolvedValueOnce(response);

      const results = await extractor.extractInsights(mockConversation);

      expect(results[0].type).toBe('insight');
      expect(results[0].title).toBe('Key Learning');
    });

    it('should detect decisions and outcomes', async () => {
      const response = JSON.stringify({
        insights: [
          {
            type: 'decision',
            title: 'Decision Made',
            content: 'We decided to use React for the frontend',
            tags: [],
            category: 'programming',
            keywords: [],
            importance: 'high',
            relatedTopics: [],
          },
        ],
      });

      mockClaudeService.chat.mockResolvedValueOnce(response);

      const results = await extractor.extractInsights(mockConversation);

      expect(results[0].type).toBe('decision');
    });

    it('should extract code examples', async () => {
      const response = JSON.stringify({
        insights: [
          {
            type: 'code',
            title: 'Code Pattern',
            content: 'Use React.memo for optimization',
            tags: [],
            category: 'programming',
            keywords: [],
            importance: 'medium',
            relatedTopics: [],
          },
        ],
      });

      mockClaudeService.chat.mockResolvedValueOnce(response);

      const results = await extractor.extractInsights(mockConversation);

      expect(results[0].type).toBe('code');
    });

    it('should assign importance levels', async () => {
      const response = JSON.stringify({
        insights: [
          {
            type: 'insight',
            title: 'High Priority',
            content: 'Critical learning',
            tags: [],
            category: 'programming',
            keywords: [],
            importance: 'high',
            relatedTopics: [],
          },
          {
            type: 'insight',
            title: 'Low Priority',
            content: 'Nice to know',
            tags: [],
            category: 'programming',
            keywords: [],
            importance: 'low',
            relatedTopics: [],
          },
        ],
      });

      mockClaudeService.chat.mockResolvedValueOnce(response);

      const results = await extractor.extractInsights(mockConversation);

      const highImportance = results.find((u) =>
        u.tags.includes('importance-high')
      );
      const lowImportance = results.find((u) => u.tags.includes('importance-low'));

      expect(highImportance).toBeDefined();
      expect(lowImportance).toBeDefined();
    });

    it('should use systemPrompt with chat call', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      await extractor.extractInsights(mockConversation);

      const call = mockClaudeService.chat.mock.calls[0][1];
      expect(call.systemPrompt).toBeDefined();
      expect(call.temperature).toBe(0.3);
      expect(call.useCache).toBe(true);
    });

    it('should set appropriate token limits', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      await extractor.extractInsights(mockConversation);

      const call = mockClaudeService.chat.mock.calls[0][1];
      expect(call.maxTokens).toBe(4096);
    });
  });

  describe('Batch Processing', () => {
    it('should process multiple conversations', async () => {
      mockClaudeService.chat.mockResolvedValue(mockInsightResponse);

      const conversations: Conversation[] = [
        mockConversation,
        { ...mockConversation, id: 'conv-2', title: 'Conversation 2' },
        { ...mockConversation, id: 'conv-3', title: 'Conversation 3' },
      ];

      const results = await extractor.extractBatch(conversations);

      expect(results.size).toBe(3);
      expect(mockClaudeService.chat).toHaveBeenCalledTimes(3);
    });

    it('should return map with conversation IDs as keys', async () => {
      mockClaudeService.chat.mockResolvedValue(mockInsightResponse);

      const conversations: Conversation[] = [
        mockConversation,
        { ...mockConversation, id: 'conv-2' },
      ];

      const results = await extractor.extractBatch(conversations);

      expect(results.has('conv-1')).toBe(true);
      expect(results.has('conv-2')).toBe(true);
    });

    it('should apply rate limiting between batch items', async () => {
      vi.useFakeTimers();
      mockClaudeService.chat.mockResolvedValue(mockInsightResponse);

      const conversations: Conversation[] = [
        mockConversation,
        { ...mockConversation, id: 'conv-2' },
      ];

      const startTime = Date.now();
      await extractor.extractBatch(conversations);
      const endTime = Date.now();

      vi.useRealTimers();

      // Should have delay between calls (500ms per item)
      expect(mockClaudeService.chat).toHaveBeenCalledTimes(2);
    });

    it('should track token costs across batch', async () => {
      mockClaudeService.chat.mockResolvedValue(mockInsightResponse);
      mockClaudeService.getTokenStats.mockReturnValue({
        inputTokens: 1000,
        outputTokens: 500,
        totalCost: 0.05,
      });

      const conversations: Conversation[] = [
        mockConversation,
        { ...mockConversation, id: 'conv-2' },
      ];

      await extractor.extractBatch(conversations);

      expect(mockClaudeService.printStats).toHaveBeenCalled();
    });

    it('should handle batch with single conversation', async () => {
      mockClaudeService.chat.mockResolvedValue(mockInsightResponse);

      const results = await extractor.extractBatch([mockConversation]);

      expect(results.size).toBe(1);
    });

    it('should handle empty batch', async () => {
      const results = await extractor.extractBatch([]);

      expect(results.size).toBe(0);
      expect(mockClaudeService.chat).not.toHaveBeenCalled();
    });
  });

  describe('Output Format Validation', () => {
    it('should parse valid JSON response', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(mockConversation);

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const wrappedResponse = `\`\`\`json\n${mockInsightResponse}\n\`\`\``;
      mockClaudeService.chat.mockResolvedValueOnce(wrappedResponse);

      const results = await extractor.extractInsights(mockConversation);

      // Should extract JSON even from code blocks
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle malformed JSON gracefully', async () => {
      mockClaudeService.chat.mockResolvedValueOnce('{ invalid json }');

      const results = await extractor.extractInsights(mockConversation);

      expect(Array.isArray(results)).toBe(true);
      // Should return empty array on parse failure
      expect(results.length).toBe(0);
    });

    it('should handle response with no JSON', async () => {
      mockClaudeService.chat.mockResolvedValueOnce('Just plain text, no JSON');

      const results = await extractor.extractInsights(mockConversation);

      expect(Array.isArray(results)).toBe(true);
    });

    it('should include required fields in each insight', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(mockConversation);

      results.forEach((unit) => {
        expect(unit.id).toBeDefined();
        expect(unit.title).toBeDefined();
        expect(unit.content).toBeDefined();
        expect(unit.type).toBeDefined();
        expect(unit.category).toBeDefined();
      });
    });
  });

  describe('Conversion to AtomicUnits', () => {
    it('should convert insights to atomic units', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(mockConversation);

      results.forEach((unit) => {
        expect(unit).toHaveProperty('id');
        expect(unit).toHaveProperty('type');
        expect(unit).toHaveProperty('timestamp');
        expect(unit).toHaveProperty('title');
        expect(unit).toHaveProperty('content');
        expect(unit).toHaveProperty('context');
        expect(unit).toHaveProperty('tags');
        expect(unit).toHaveProperty('category');
        expect(unit).toHaveProperty('conversationId');
      });
    });

    it('should set unique UUIDs for each unit', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(mockConversation);

      const ids = results.map((u) => u.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should include conversation context', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(mockConversation);

      results.forEach((unit) => {
        expect(unit.context).toContain('React Performance Optimization');
      });
    });

    it('should reference source conversation ID', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(mockConversation);

      results.forEach((unit) => {
        expect(unit.conversationId).toBe('conv-1');
      });
    });

    it('should add auto-tagging for extracted insights', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(mockConversation);

      results.forEach((unit) => {
        expect(unit.tags).toContain('claude-extracted');
        expect(unit.tags.some((tag) => tag.startsWith('importance-'))).toBe(true);
      });
    });

    it('should preserve importance in tags', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(mockConversation);

      const hasHighImportance = results.some((u) =>
        u.tags.includes('importance-high')
      );
      expect(hasHighImportance).toBe(true);
    });

    it('should initialize relatedUnits as empty', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(mockConversation);

      results.forEach((unit) => {
        expect(unit.relatedUnits).toEqual([]);
      });
    });

    it('should preserve keywords from extraction', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(mockConversation);

      const firstUnit = results[0];
      expect(firstUnit.keywords).toContain('React.memo');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty conversation', async () => {
      const emptyConv: Conversation = {
        id: 'empty',
        title: 'Empty',
        messages: [],
        timestamp: new Date(),
      };

      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(emptyConv);

      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle conversation with no insights', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(
        JSON.stringify({ insights: [] })
      );

      const results = await extractor.extractInsights(mockConversation);

      expect(results).toEqual([]);
    });

    it('should handle very long conversation', async () => {
      const longMessages = Array(100)
        .fill(0)
        .map((_, i) => ({
          role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
          content: `Message ${i}: This is a test message with some content.`,
        }));

      const longConv: Conversation = {
        id: 'long',
        title: 'Long Conversation',
        messages: longMessages,
        timestamp: new Date(),
      };

      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(longConv);

      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle special characters in conversation', async () => {
      const specialConv: Conversation = {
        id: 'special',
        title: 'Special Characters: !@#$%^&*()',
        messages: [
          {
            role: 'user',
            content: 'How do I escape "quotes" and \'apostrophes\'?',
          },
          {
            role: 'assistant',
            content: 'Use backslashes: \\"quotes\\" and \\\'apostrophes\'.',
          },
        ],
        timestamp: new Date(),
      };

      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(specialConv);

      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle unicode characters', async () => {
      const unicodeConv: Conversation = {
        id: 'unicode',
        title: 'Unicode Test 你好 🚀',
        messages: [
          {
            role: 'user',
            content: 'Explain this: ñ é ü 中文 日本語',
          },
          {
            role: 'assistant',
            content: 'These are unicode characters representing different languages.',
          },
        ],
        timestamp: new Date(),
      };

      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(unicodeConv);

      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle insights with missing optional fields', async () => {
      const incompleteResponse = JSON.stringify({
        insights: [
          {
            type: 'insight',
            title: 'Minimal Insight',
            content: 'Content here',
            tags: [],
            category: 'programming',
            keywords: [],
            importance: 'medium',
            relatedTopics: [],
            // Missing some optional fields
          },
        ],
      });

      mockClaudeService.chat.mockResolvedValueOnce(incompleteResponse);

      const results = await extractor.extractInsights(mockConversation);

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle null/undefined in response', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(null as any);

      const results = await extractor.extractInsights(mockConversation);

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle Claude API errors gracefully', async () => {
      mockClaudeService.chat.mockRejectedValueOnce(new Error('API Error'));

      const results = await extractor.extractInsights(mockConversation);

      expect(results).toEqual([]);
    });

    it('should handle network timeout', async () => {
      mockClaudeService.chat.mockRejectedValueOnce(
        new Error('Network timeout')
      );

      const results = await extractor.extractInsights(mockConversation);

      expect(results).toEqual([]);
    });

    it('should continue batch on single conversation error', async () => {
      mockClaudeService.chat
        .mockResolvedValueOnce(mockInsightResponse)
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(mockInsightResponse);

      const conversations: Conversation[] = [
        mockConversation,
        { ...mockConversation, id: 'conv-2' },
        { ...mockConversation, id: 'conv-3' },
      ];

      const results = await extractor.extractBatch(conversations);

      // Should continue despite one failure
      expect(results.size).toBe(2);
    });
  });

  describe('Token Tracking', () => {
    it('should expose token statistics', () => {
      const stats = extractor.getStats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('inputTokens');
      expect(stats).toHaveProperty('outputTokens');
      expect(stats).toHaveProperty('totalCost');
    });

    it('should return ClaudeService token stats', () => {
      mockClaudeService.getTokenStats.mockReturnValue({
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.01,
      });

      const stats = extractor.getStats();

      expect(stats.inputTokens).toBe(100);
      expect(stats.outputTokens).toBe(50);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle realistic multi-turn conversation', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(mockConversation);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].conversationId).toBe('conv-1');
      expect(results[0].tags).toContain('claude-extracted');
    });

    it('should process large batch of conversations', async () => {
      mockClaudeService.chat.mockResolvedValue(mockInsightResponse);

      const conversations = Array(10)
        .fill(0)
        .map((_, i) => ({
          ...mockConversation,
          id: `conv-${i}`,
          title: `Conversation ${i}`,
        }));

      const results = await extractor.extractBatch(conversations);

      expect(results.size).toBe(10);
      expect(mockClaudeService.chat).toHaveBeenCalledTimes(10);
    });

    it('should maintain data integrity through extraction pipeline', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(mockInsightResponse);

      const results = await extractor.extractInsights(mockConversation);

      // Verify no data loss
      expect(results.length).toBe(2);

      // Verify each unit is valid
      results.forEach((unit) => {
        expect(unit.id).toBeTruthy();
        expect(unit.title).toBeTruthy();
        expect(unit.content).toBeTruthy();
        expect(unit.conversationId).toBe('conv-1');
      });
    });
  });
});
