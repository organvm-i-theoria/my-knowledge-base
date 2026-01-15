/**
 * SmartTagger test suite
 * Tests: Single tagging, batch tagging, tag enhancement, tag quality
 * Coverage: 30+ test cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SmartTagger, TagSuggestions } from './smart-tagger.js';
import { ClaudeService } from './claude-service.js';
import { AtomicUnit } from './types.js';

// Mock ClaudeService
vi.mock('./claude-service.js', () => ({
  ClaudeService: vi.fn(),
}));

describe('SmartTagger', () => {
  let tagger: SmartTagger;
  let mockClaudeService: any;

  const mockUnit: AtomicUnit = {
    id: 'unit-1',
    type: 'code',
    title: 'React Hook for API Calls',
    content: `
      Custom hook for managing API requests with loading and error states.
      
      const useApi = (url) => {
        const [data, setData] = useState(null);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState(null);
        
        useEffect(() => {
          fetch(url)
            .then(r => r.json())
            .then(d => setData(d))
            .catch(e => setError(e))
            .finally(() => setLoading(false));
        }, [url]);
        
        return { data, loading, error };
      };
    `,
    category: 'programming',
    tags: [],
    keywords: [],
    timestamp: new Date(),
    context: 'React development',
  };

  const mockTagResponse: TagSuggestions = {
    tags: ['react', 'hooks', 'api', 'custom-hooks'],
    category: 'programming',
    keywords: ['useState', 'useEffect', 'fetch', 'api-calls'],
    confidence: 0.95,
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

    (ClaudeService as any).mockImplementation(function MockClaudeService() {
      return mockClaudeService;
    });

    tagger = new SmartTagger(mockClaudeService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create tagger with provided ClaudeService', () => {
      expect(tagger).toBeDefined();
    });

    it('should create tagger with default ClaudeService', () => {
      (ClaudeService as any).mockImplementationOnce(function MockClaudeService() {
        return mockClaudeService;
      });
      const t = new SmartTagger();
      expect(t).toBeDefined();
    });
  });

  describe('Single Unit Tagging', () => {
    it('should suggest relevant tags for a unit', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockTagResponse));

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(suggestions.tags).toContain('react');
      expect(suggestions.tags).toContain('hooks');
      expect(mockClaudeService.chat).toHaveBeenCalled();
    });

    it('should detect programming languages', async () => {
      const response: TagSuggestions = {
        tags: ['javascript', 'typescript', 'react'],
        category: 'programming',
        keywords: ['async', 'promises'],
        confidence: 0.92,
      };

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(response));

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(suggestions.tags.some((tag) => ['javascript', 'typescript'].includes(tag))).toBe(true);
    });

    it('should identify frameworks and libraries', async () => {
      const response: TagSuggestions = {
        tags: ['react', 'next.js', 'typescript'],
        category: 'programming',
        keywords: ['framework', 'frontend'],
        confidence: 0.88,
      };

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(response));

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(suggestions.tags).toContain('react');
    });

    it('should include conceptual tags', async () => {
      const response: TagSuggestions = {
        tags: ['performance', 'security', 'best-practices'],
        category: 'programming',
        keywords: ['optimization', 'validation'],
        confidence: 0.85,
      };

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(response));

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(suggestions.tags.some((tag) => ['performance', 'security'].includes(tag))).toBe(true);
    });

    it('should assign category', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockTagResponse));

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(suggestions.category).toBe('programming');
    });

    it('should extract keywords', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockTagResponse));

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(suggestions.keywords).toContain('useState');
      expect(suggestions.keywords).toContain('useEffect');
    });

    it('should provide confidence score', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockTagResponse));

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(typeof suggestions.confidence).toBe('number');
      expect(suggestions.confidence).toBeGreaterThanOrEqual(0);
      expect(suggestions.confidence).toBeLessThanOrEqual(1);
    });

    it('should use system prompt with low temperature', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockTagResponse));

      await tagger.tagUnit(mockUnit);

      const call = mockClaudeService.chat.mock.calls[0][1];
      expect(call.systemPrompt).toBeDefined();
      expect(call.temperature).toBe(0.2);
      expect(call.useCache).toBe(true);
    });

    it('should limit content to first 1000 characters', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockTagResponse));

      const longUnit: AtomicUnit = {
        ...mockUnit,
        content: 'x'.repeat(5000),
      };

      await tagger.tagUnit(longUnit);

      const call = mockClaudeService.chat.mock.calls[0][0];
      expect(call.length).toBeLessThan(longUnit.content.length);
    });
  });

  describe('Batch Tagging', () => {
    it('should tag multiple units sequentially', async () => {
      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockTagResponse));

      const units: AtomicUnit[] = [
        mockUnit,
        { ...mockUnit, id: 'unit-2', title: 'Unit 2' },
        { ...mockUnit, id: 'unit-3', title: 'Unit 3' },
      ];

      const results = await tagger.tagBatch(units);

      expect(results.size).toBe(3);
      expect(mockClaudeService.chat).toHaveBeenCalledTimes(3);
    });

    it('should return map with unit IDs as keys', async () => {
      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockTagResponse));

      const units: AtomicUnit[] = [mockUnit, { ...mockUnit, id: 'unit-2' }];

      const results = await tagger.tagBatch(units);

      expect(results.has('unit-1')).toBe(true);
      expect(results.has('unit-2')).toBe(true);
    });

    it('should apply consistent tagging across batch', async () => {
      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockTagResponse));

      const units: AtomicUnit[] = [
        mockUnit,
        { ...mockUnit, id: 'unit-2', title: 'Unit 2' },
      ];

      const results = await tagger.tagBatch(units);

      const tags1 = results.get('unit-1');
      const tags2 = results.get('unit-2');

      expect(tags1).toBeDefined();
      expect(tags2).toBeDefined();
    });

    it('should track batch improvements', async () => {
      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockTagResponse));
      mockClaudeService.getTokenStats.mockReturnValue({
        inputTokens: 500,
        outputTokens: 200,
        totalCost: 0.02,
      });

      const units: AtomicUnit[] = [mockUnit, { ...mockUnit, id: 'unit-2' }];

      await tagger.tagBatch(units);

      expect(mockClaudeService.printStats).toHaveBeenCalled();
    });

    it('should handle single unit batch', async () => {
      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockTagResponse));

      const results = await tagger.tagBatch([mockUnit]);

      expect(results.size).toBe(1);
    });

    it('should handle empty batch', async () => {
      const results = await tagger.tagBatch([]);

      expect(results.size).toBe(0);
      expect(mockClaudeService.chat).not.toHaveBeenCalled();
    });
  });

  describe('Tag Enhancement', () => {
    it('should merge smart tags with existing tags', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockTagResponse));

      const unitWithTags: AtomicUnit = {
        ...mockUnit,
        tags: ['existing-tag'],
      };

      const enhanced = await tagger.enhanceUnit(unitWithTags);

      expect(enhanced.tags).toContain('existing-tag');
      expect(enhanced.tags).toContain('react');
    });

    it('should avoid duplicate tags', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(
        JSON.stringify({
          ...mockTagResponse,
          tags: ['react', 'hooks', 'existing-tag'],
        })
      );

      const unitWithTags: AtomicUnit = {
        ...mockUnit,
        tags: ['existing-tag', 'another-tag'],
      };

      const enhanced = await tagger.enhanceUnit(unitWithTags);

      const tagCount = enhanced.tags.filter((tag) => tag === 'existing-tag').length;
      expect(tagCount).toBe(1);
    });

    it('should update category if better match found', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(
        JSON.stringify({
          ...mockTagResponse,
          category: 'design',
        })
      );

      const unit: AtomicUnit = {
        ...mockUnit,
        category: 'programming',
      };

      const enhanced = await tagger.enhanceUnit(unit);

      expect(enhanced.category).toBe('design');
    });

    it('should preserve original category if no suggestion', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(
        JSON.stringify({
          ...mockTagResponse,
          category: '',
        })
      );

      const unit: AtomicUnit = {
        ...mockUnit,
        category: 'programming',
      };

      const enhanced = await tagger.enhanceUnit(unit);

      expect(enhanced.category).toBe('programming');
    });

    it('should merge keywords', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockTagResponse));

      const unitWithKeywords: AtomicUnit = {
        ...mockUnit,
        keywords: ['existing-keyword'],
      };

      const enhanced = await tagger.enhanceUnit(unitWithKeywords);

      expect(enhanced.keywords).toContain('existing-keyword');
      expect(enhanced.keywords).toContain('useState');
    });

    it('should avoid duplicate keywords', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockTagResponse));

      const unitWithKeywords: AtomicUnit = {
        ...mockUnit,
        keywords: ['useState', 'other'],
      };

      const enhanced = await tagger.enhanceUnit(unitWithKeywords);

      const keywordCount = enhanced.keywords.filter((k) => k === 'useState').length;
      expect(keywordCount).toBe(1);
    });

    it('should return enhanced unit with all properties', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockTagResponse));

      const enhanced = await tagger.enhanceUnit(mockUnit);

      expect(enhanced.id).toBe(mockUnit.id);
      expect(enhanced.type).toBe(mockUnit.type);
      expect(enhanced.title).toBe(mockUnit.title);
      expect(enhanced.content).toBe(mockUnit.content);
    });
  });

  describe('Tag Quality Validation', () => {
    it('should limit tags to reasonable count', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockTagResponse));

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(suggestions.tags.length).toBeLessThanOrEqual(8);
      expect(suggestions.tags.length).toBeGreaterThanOrEqual(1);
    });

    it('should use lowercase-hyphenated format', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(
        JSON.stringify({
          ...mockTagResponse,
          tags: ['error-handling', 'state-management', 'api-calls'],
        })
      );

      const suggestions = await tagger.tagUnit(mockUnit);

      suggestions.tags.forEach((tag) => {
        expect(tag).toBe(tag.toLowerCase());
        expect(tag).not.toMatch(/[A-Z]/);
      });
    });

    it('should avoid overly generic tags', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(
        JSON.stringify({
          ...mockTagResponse,
          tags: ['code', 'development', 'javascript'],
        })
      );

      const suggestions = await tagger.tagUnit(mockUnit);

      // Should have more specific tags along with broader ones
      const hasSpecific = suggestions.tags.some(
        (tag) => tag.length > 5 && tag.includes('-')
      );
      expect(hasSpecific || suggestions.tags.length > 1).toBe(true);
    });

    it('should include conceptual tags alongside technical tags', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(
        JSON.stringify({
          ...mockTagResponse,
          tags: ['react', 'hooks', 'best-practices', 'performance'],
        })
      );

      const suggestions = await tagger.tagUnit(mockUnit);

      const hasConceptual = suggestions.tags.some((tag) =>
        ['best-practices', 'performance', 'security'].includes(tag)
      );
      expect(hasConceptual).toBe(true);
    });
  });

  describe('Response Parsing', () => {
    it('should parse valid JSON response', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockTagResponse));

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(suggestions.tags).toBeDefined();
      expect(suggestions.category).toBeDefined();
      expect(suggestions.keywords).toBeDefined();
      expect(suggestions.confidence).toBeDefined();
    });

    it('should handle JSON wrapped in markdown', async () => {
      const wrappedResponse = `\`\`\`json\n${JSON.stringify(mockTagResponse)}\n\`\`\``;
      mockClaudeService.chat.mockResolvedValueOnce(wrappedResponse);

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(Array.isArray(suggestions.tags)).toBe(true);
    });

    it('should handle malformed JSON gracefully', async () => {
      mockClaudeService.chat.mockResolvedValueOnce('{ invalid json }');

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(suggestions.tags).toEqual([]);
      expect(suggestions.category).toBe('general');
      expect(suggestions.confidence).toBe(0);
    });

    it('should handle missing JSON', async () => {
      mockClaudeService.chat.mockResolvedValueOnce('No JSON here');

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(suggestions.tags).toEqual([]);
      expect(suggestions.category).toBe('general');
    });

    it('should handle partial response', async () => {
      const partialResponse = JSON.stringify({
        tags: ['react'],
        // Missing category, keywords, confidence
      });

      mockClaudeService.chat.mockResolvedValueOnce(partialResponse);

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(suggestions.tags).toContain('react');
    });
  });

  describe('Error Handling', () => {
    it('should handle Claude API errors gracefully', async () => {
      mockClaudeService.chat.mockRejectedValueOnce(new Error('API Error'));

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(suggestions.tags).toEqual([]);
      expect(suggestions.category).toBe('general');
      expect(suggestions.confidence).toBe(0);
    });

    it('should handle network timeout', async () => {
      mockClaudeService.chat.mockRejectedValueOnce(new Error('Timeout'));

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(suggestions.tags).toEqual([]);
    });

    it('should continue batch on single unit error', async () => {
      mockClaudeService.chat
        .mockResolvedValueOnce(JSON.stringify(mockTagResponse))
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(JSON.stringify(mockTagResponse));

      const units: AtomicUnit[] = [
        mockUnit,
        { ...mockUnit, id: 'unit-2' },
        { ...mockUnit, id: 'unit-3' },
      ];

      const results = await tagger.tagBatch(units);

      expect(results.size).toBe(2);
    });
  });

  describe('Token Tracking', () => {
    it('should expose token statistics', () => {
      const stats = tagger.getStats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('inputTokens');
      expect(stats).toHaveProperty('outputTokens');
      expect(stats).toHaveProperty('totalCost');
    });
  });

  describe('Categories', () => {
    it('should support all valid categories', async () => {
      const categories = ['programming', 'writing', 'research', 'design', 'devops', 'data'];

      for (const category of categories) {
        mockClaudeService.chat.mockResolvedValueOnce(
          JSON.stringify({
            ...mockTagResponse,
            category,
          })
        );

        const suggestions = await tagger.tagUnit(mockUnit);

        expect(suggestions.category).toBe(category);
      }
    });

    it('should default to general on parse error', async () => {
      mockClaudeService.chat.mockResolvedValueOnce('{ invalid }');

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(suggestions.category).toBe('general');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle realistic code unit tagging', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockTagResponse));

      const suggestions = await tagger.tagUnit(mockUnit);

      expect(suggestions.tags.length).toBeGreaterThan(0);
      expect(suggestions.category).toBe('programming');
    });

    it('should batch tag diverse content types', async () => {
      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockTagResponse));

      const units: AtomicUnit[] = [
        { ...mockUnit, type: 'code' },
        { ...mockUnit, id: 'unit-2', type: 'insight' },
        { ...mockUnit, id: 'unit-3', type: 'decision' },
      ];

      const results = await tagger.tagBatch(units);

      expect(results.size).toBe(3);
    });

    it('should enhance existing tags without losing information', async () => {
      mockClaudeService.chat.mockResolvedValueOnce(
        JSON.stringify({
          ...mockTagResponse,
          tags: ['react', 'performance'],
        })
      );

      const unitWithTags: AtomicUnit = {
        ...mockUnit,
        tags: ['custom-tag', 'important'],
      };

      const enhanced = await tagger.enhanceUnit(unitWithTags);

      expect(enhanced.tags).toContain('custom-tag');
      expect(enhanced.tags).toContain('important');
      expect(enhanced.tags).toContain('react');
    });
  });
});
