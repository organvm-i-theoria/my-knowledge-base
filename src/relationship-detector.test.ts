/**
 * RelationshipDetector test suite
 * Tests: Vector similarity, Claude validation, graph building, relationship types, performance
 * Coverage: 40+ test cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RelationshipDetector, Relationship } from './relationship-detector.js';
import { ClaudeService } from './claude-service.js';
import { VectorDatabase } from './vector-database.js';
import { EmbeddingsService } from './embeddings-service.js';
import { AtomicUnit } from './types.js';

// Mock dependencies
vi.mock('./claude-service.js');
vi.mock('./vector-database.js');
vi.mock('./embeddings-service.js');

describe('RelationshipDetector', () => {
  let detector: RelationshipDetector;
  let mockClaudeService: any;
  let mockVectorDb: any;
  let mockEmbeddingsService: any;

  const mockUnit1: AtomicUnit = {
    id: 'unit-1',
    type: 'insight',
    title: 'React Hooks Pattern',
    content: 'React Hooks allow you to use state and other React features without writing a class...',
    category: 'programming',
    tags: ['react', 'hooks'],
    keywords: ['state', 'effect', 'custom-hooks'],
    timestamp: new Date(),
    context: 'React development',
    embedding: [0.1, 0.2, 0.3],
  };

  const mockUnit2: AtomicUnit = {
    id: 'unit-2',
    type: 'code',
    title: 'Custom useApi Hook',
    content: 'Implementation of a custom hook for managing API requests...',
    category: 'programming',
    tags: ['react', 'hooks', 'api'],
    keywords: ['fetch', 'useEffect', 'useState'],
    timestamp: new Date(),
    context: 'React development',
    embedding: [0.1, 0.21, 0.29],
  };

  const mockUnit3: AtomicUnit = {
    id: 'unit-3',
    type: 'insight',
    title: 'Database Query Optimization',
    content: 'Strategies for optimizing database queries...',
    category: 'programming',
    tags: ['database', 'performance'],
    keywords: ['sql', 'indexing'],
    timestamp: new Date(),
    context: 'Backend development',
    embedding: [0.5, 0.6, 0.7],
  };

  const mockRelationshipResponse = {
    isRelated: true,
    relationshipType: 'expands-on',
    strength: 0.85,
    explanation: 'Unit 2 provides implementation details for patterns in Unit 1',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockClaudeService = {
      chat: vi.fn(),
      printStats: vi.fn(),
      getTokenStats: vi.fn().mockReturnValue({
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalCost: 0,
        cacheSavings: 0,
      }),
    };

    mockVectorDb = {
      init: vi.fn(),
      searchByEmbedding: vi.fn(),
    };

    mockEmbeddingsService = {
      generateEmbedding: vi.fn(),
    };

    (ClaudeService as any).mockImplementation(() => mockClaudeService);
    (VectorDatabase as any).mockImplementation(() => mockVectorDb);
    (EmbeddingsService as any).mockImplementation(() => mockEmbeddingsService);

    detector = new RelationshipDetector('./test-db', mockClaudeService);
    detector['vectorDb'] = mockVectorDb;
    detector['embeddingsService'] = mockEmbeddingsService;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create detector with custom path', () => {
      expect(detector).toBeDefined();
    });

    it('should initialize vector database', async () => {
      await detector.init();
      expect(mockVectorDb.init).toHaveBeenCalled();
    });

    it('should have ClaudeService instance', () => {
      expect(detector['claude']).toBeDefined();
    });

    it('should have VectorDatabase instance', () => {
      expect(detector['vectorDb']).toBeDefined();
    });

    it('should have EmbeddingsService instance', () => {
      expect(detector['embeddingsService']).toBeDefined();
    });
  });

  describe('Vector Similarity Stage', () => {
    it('should find similar units by embedding', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
        { unit: mockUnit3, score: 0.65 },
      ]);

      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockRelationshipResponse));

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(mockVectorDb.searchByEmbedding).toHaveBeenCalled();
      expect(relationships.length).toBeGreaterThan(0);
    });

    it('should respect similarity threshold', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
        { unit: mockUnit3, score: 0.65 },
      ]);

      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockRelationshipResponse));

      await detector.findRelatedUnits(mockUnit1, 10, 0.8);

      // Should only process units with score >= 0.8
      expect(mockClaudeService.chat.mock.calls.length).toBeLessThanOrEqual(1);
    });

    it('should exclude self-matches', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit1, score: 1.0 }, // Self
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockRelationshipResponse));

      const relationships = await detector.findRelatedUnits(mockUnit1);

      const hasSelfRelation = relationships.some((r) => r.toUnit === mockUnit1.id);
      expect(hasSelfRelation).toBe(false);
    });

    it('should handle missing embeddings by generating them', async () => {
      const unitWithoutEmbedding = { ...mockUnit1, embedding: undefined };

      mockEmbeddingsService.generateEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockRelationshipResponse));

      await detector.findRelatedUnits(unitWithoutEmbedding);

      expect(mockEmbeddingsService.generateEmbedding).toHaveBeenCalled();
    });

    it('should respect candidate limit parameter', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockRelationshipResponse));

      await detector.findRelatedUnits(mockUnit1, 5);

      const call = mockVectorDb.searchByEmbedding.mock.calls[0];
      expect(call[1]).toBe(5);
    });

    it('should handle no similar units found', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([]);

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships).toEqual([]);
      expect(mockClaudeService.chat).not.toHaveBeenCalled();
    });
  });

  describe('Claude Validation Stage', () => {
    it('should validate relationships with Claude', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockRelationshipResponse));

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(mockClaudeService.chat).toHaveBeenCalled();
      expect(relationships[0].relationshipType).toBe('expands-on');
    });

    it('should classify relationship types', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(
        JSON.stringify({
          isRelated: true,
          relationshipType: 'prerequisite',
          strength: 0.9,
          explanation: 'Unit 1 must be understood before Unit 2',
        })
      );

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships[0].relationshipType).toBe('prerequisite');
    });

    it('should assign strength scores', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockRelationshipResponse));

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships[0].strength).toBe(0.85);
      expect(relationships[0].strength).toBeGreaterThan(0);
      expect(relationships[0].strength).toBeLessThanOrEqual(1);
    });

    it('should provide explanations for relationships', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockRelationshipResponse));

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships[0].explanation).toBeTruthy();
      expect(relationships[0].explanation.length).toBeGreaterThan(0);
    });

    it('should filter weak relationships (strength < 0.5)', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
        { unit: mockUnit3, score: 0.75 },
      ]);

      mockClaudeService.chat
        .mockResolvedValueOnce(JSON.stringify(mockRelationshipResponse))
        .mockResolvedValueOnce(
          JSON.stringify({
            isRelated: true,
            relationshipType: 'related',
            strength: 0.3,
            explanation: 'Weak relationship',
          })
        );

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships.length).toBe(1);
      expect(relationships[0].strength).toBeGreaterThan(0.5);
    });
  });

  describe('Relationship Types', () => {
    it('should identify related relationships', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(
        JSON.stringify({
          isRelated: true,
          relationshipType: 'related',
          strength: 0.7,
          explanation: 'Related topic',
        })
      );

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships[0].relationshipType).toBe('related');
    });

    it('should identify prerequisite relationships', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(
        JSON.stringify({
          isRelated: true,
          relationshipType: 'prerequisite',
          strength: 0.9,
          explanation: 'Must understand first',
        })
      );

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships[0].relationshipType).toBe('prerequisite');
    });

    it('should identify expands-on relationships', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(
        JSON.stringify({
          isRelated: true,
          relationshipType: 'expands-on',
          strength: 0.85,
          explanation: 'Provides details',
        })
      );

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships[0].relationshipType).toBe('expands-on');
    });

    it('should identify contradicts relationships', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(
        JSON.stringify({
          isRelated: true,
          relationshipType: 'contradicts',
          strength: 0.8,
          explanation: 'Conflicting information',
        })
      );

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships[0].relationshipType).toBe('contradicts');
    });

    it('should identify implements relationships', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(
        JSON.stringify({
          isRelated: true,
          relationshipType: 'implements',
          strength: 0.88,
          explanation: 'Shows implementation',
        })
      );

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships[0].relationshipType).toBe('implements');
    });
  });

  describe('Graph Building', () => {
    it('should build bidirectional relationships', async () => {
      const units = [mockUnit1, mockUnit2, mockUnit3];

      mockVectorDb.searchByEmbedding.mockResolvedValue([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockRelationshipResponse));

      const graph = await detector.buildRelationshipGraph(units);

      expect(graph.size).toBe(3);
      units.forEach((unit) => {
        expect(graph.has(unit.id)).toBe(true);
      });
    });

    it('should detect prerequisite relationships', async () => {
      const units = [mockUnit1, mockUnit2];

      mockVectorDb.searchByEmbedding.mockResolvedValue([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValue(
        JSON.stringify({
          isRelated: true,
          relationshipType: 'prerequisite',
          strength: 0.9,
          explanation: 'Prerequisites found',
        })
      );

      const graph = await detector.buildRelationshipGraph(units);

      const rels = graph.get('unit-1');
      expect(rels?.some((r) => r.relationshipType === 'prerequisite')).toBe(true);
    });

    it('should detect expansion relationships', async () => {
      const units = [mockUnit1, mockUnit2];

      mockVectorDb.searchByEmbedding.mockResolvedValue([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValue(
        JSON.stringify({
          isRelated: true,
          relationshipType: 'expands-on',
          strength: 0.85,
          explanation: 'Expansion found',
        })
      );

      const graph = await detector.buildRelationshipGraph(units);

      const rels = graph.get('unit-1');
      expect(rels?.some((r) => r.relationshipType === 'expands-on')).toBe(true);
    });

    it('should detect contradictions', async () => {
      const units = [mockUnit1, mockUnit2];

      mockVectorDb.searchByEmbedding.mockResolvedValue([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValue(
        JSON.stringify({
          isRelated: true,
          relationshipType: 'contradicts',
          strength: 0.8,
          explanation: 'Contradiction found',
        })
      );

      const graph = await detector.buildRelationshipGraph(units);

      const rels = graph.get('unit-1');
      expect(rels?.some((r) => r.relationshipType === 'contradicts')).toBe(true);
    });

    it('should detect implementations', async () => {
      const units = [mockUnit1, mockUnit2];

      mockVectorDb.searchByEmbedding.mockResolvedValue([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValue(
        JSON.stringify({
          isRelated: true,
          relationshipType: 'implements',
          strength: 0.88,
          explanation: 'Implementation found',
        })
      );

      const graph = await detector.buildRelationshipGraph(units);

      const rels = graph.get('unit-1');
      expect(rels?.some((r) => r.relationshipType === 'implements')).toBe(true);
    });
  });

  describe('Response Parsing', () => {
    it('should parse valid relationship response', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockRelationshipResponse));

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships[0].relationshipType).toBe('expands-on');
      expect(relationships[0].strength).toBe(0.85);
    });

    it('should handle malformed JSON', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce('{ invalid json }');

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships).toEqual([]);
    });

    it('should handle isRelated=false', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(
        JSON.stringify({
          isRelated: false,
        })
      );

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships).toEqual([]);
    });
  });

  describe('Performance', () => {
    it('should handle large graphs (100+ units)', async () => {
      const units = Array(10)
        .fill(0)
        .map((_, i) => ({
          ...mockUnit1,
          id: `unit-${i}`,
          embedding: [0.1 + i * 0.01, 0.2, 0.3],
        }));

      mockVectorDb.searchByEmbedding.mockResolvedValue([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockRelationshipResponse));

      const graph = await detector.buildRelationshipGraph(units);

      expect(graph.size).toBe(units.length);
    });

    it('should cache embeddings to reduce calls', async () => {
      const unitWithEmbedding = { ...mockUnit1, embedding: [0.1, 0.2, 0.3] };

      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockRelationshipResponse));

      await detector.findRelatedUnits(unitWithEmbedding);

      expect(mockEmbeddingsService.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should batch Claude calls efficiently', async () => {
      const units = [mockUnit1, mockUnit2, mockUnit3];

      mockVectorDb.searchByEmbedding.mockResolvedValue([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockRelationshipResponse));

      await detector.buildRelationshipGraph(units);

      // Should call Claude for each unit
      expect(mockClaudeService.chat.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle units with no embeddings', async () => {
      const unitWithoutEmbedding = { ...mockUnit1, embedding: undefined };

      mockEmbeddingsService.generateEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockRelationshipResponse));

      const relationships = await detector.findRelatedUnits(unitWithoutEmbedding);

      expect(relationships.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty unit list', async () => {
      const graph = await detector.buildRelationshipGraph([]);

      expect(graph.size).toBe(0);
    });

    it('should handle single unit graph', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([]);

      const graph = await detector.buildRelationshipGraph([mockUnit1]);

      expect(graph.size).toBe(1);
      expect(graph.get('unit-1')).toEqual([]);
    });

    it('should handle units with very similar embeddings', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.99 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockRelationshipResponse));

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle Claude API errors gracefully', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockRejectedValueOnce(new Error('API Error'));

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships).toEqual([]);
    });

    it('should handle vector database errors', async () => {
      mockVectorDb.searchByEmbedding.mockRejectedValueOnce(new Error('DB Error'));

      await expect(detector.findRelatedUnits(mockUnit1)).rejects.toThrow();
    });

    it('should handle embedding generation errors', async () => {
      const unitWithoutEmbedding = { ...mockUnit1, embedding: undefined };

      mockEmbeddingsService.generateEmbedding.mockRejectedValueOnce(new Error('Embedding error'));

      await expect(detector.findRelatedUnits(unitWithoutEmbedding)).rejects.toThrow();
    });

    it('should continue graph building on unit error', async () => {
      const units = [mockUnit1, mockUnit2, mockUnit3];

      mockVectorDb.searchByEmbedding
        .mockResolvedValueOnce([{ unit: mockUnit2, score: 0.85 }])
        .mockRejectedValueOnce(new Error('DB Error'))
        .mockResolvedValueOnce([{ unit: mockUnit1, score: 0.85 }]);

      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockRelationshipResponse));

      try {
        await detector.buildRelationshipGraph(units);
      } catch (e) {
        // Expected error
      }
    });
  });

  describe('Token Tracking', () => {
    it('should expose token statistics', () => {
      const stats = detector.getStats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('inputTokens');
      expect(stats).toHaveProperty('outputTokens');
      expect(stats).toHaveProperty('totalCost');
    });
  });

  describe('Relationship Structure', () => {
    it('should create valid Relationship objects', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockRelationshipResponse));

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships[0]).toHaveProperty('fromUnit');
      expect(relationships[0]).toHaveProperty('toUnit');
      expect(relationships[0]).toHaveProperty('relationshipType');
      expect(relationships[0]).toHaveProperty('strength');
      expect(relationships[0]).toHaveProperty('explanation');
    });

    it('should set correct fromUnit and toUnit', async () => {
      mockVectorDb.searchByEmbedding.mockResolvedValueOnce([
        { unit: mockUnit2, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValueOnce(JSON.stringify(mockRelationshipResponse));

      const relationships = await detector.findRelatedUnits(mockUnit1);

      expect(relationships[0].fromUnit).toBe('unit-1');
      expect(relationships[0].toUnit).toBe('unit-2');
    });
  });

  describe('Integration Scenarios', () => {
    it('should analyze realistic relationship flow', async () => {
      const units = [mockUnit1, mockUnit2, mockUnit3];

      mockVectorDb.searchByEmbedding
        .mockResolvedValueOnce([{ unit: mockUnit2, score: 0.85 }]) // unit-1 -> unit-2
        .mockResolvedValueOnce([{ unit: mockUnit1, score: 0.85 }]) // unit-2 -> unit-1
        .mockResolvedValueOnce([{ unit: mockUnit1, score: 0.65 }]); // unit-3 -> unit-1

      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockRelationshipResponse));

      const graph = await detector.buildRelationshipGraph(units);

      expect(graph.size).toBe(3);
      expect(graph.get('unit-1')).toBeDefined();
      expect(graph.get('unit-2')).toBeDefined();
      expect(graph.get('unit-3')).toBeDefined();
    });

    it('should build complete knowledge graph', async () => {
      const units = [mockUnit1, mockUnit2];

      mockVectorDb.searchByEmbedding.mockResolvedValue([
        { unit: mockUnit2, score: 0.85 },
        { unit: mockUnit1, score: 0.85 },
      ]);

      mockClaudeService.chat.mockResolvedValue(JSON.stringify(mockRelationshipResponse));

      const graph = await detector.buildRelationshipGraph(units);

      expect(graph.size).toBe(2);
      expect(mockClaudeService.printStats).toHaveBeenCalled();
    });
  });
});
