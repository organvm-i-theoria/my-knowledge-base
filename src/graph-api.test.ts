import { describe, it, expect, beforeEach } from 'vitest';
import { GraphManager } from './graph-api.js';
import { KnowledgeGraph } from './knowledge-graph.js';

describe('Graph Manager', () => {
  let manager: GraphManager;

  beforeEach(() => {
    manager = new GraphManager();
  });

  describe('Graph Building', () => {
    it('should build graph from units', () => {
      const units = [
        {
          id: 'u1',
          title: 'Unit 1',
          type: 'insight',
          category: 'cat1',
          keywords: ['test'],
          timestamp: new Date(),
        },
        {
          id: 'u2',
          title: 'Unit 2',
          type: 'code',
          category: 'cat2',
          keywords: ['test', 'example'],
          timestamp: new Date(),
        },
      ];
      
      const relationships = [
        {
          sourceId: 'u1',
          targetId: 'u2',
          type: 'related',
          strength: 0.8,
        },
      ];
      
      manager.buildFromUnits(units, relationships);
      const graph = manager.getGraph();
      
      expect(graph.getAllNodes()).toHaveLength(2);
      expect(graph.getAllEdges()).toHaveLength(1);
    });
  });

  describe('Auto-Detection', () => {
    it('should auto-detect relationships', () => {
      const units = [
        { id: 'u1', keywords: ['typescript', 'react'] },
        { id: 'u2', keywords: ['typescript', 'react', 'hooks'] },
        { id: 'u3', keywords: ['python', 'flask'] },
      ];
      
      manager.autoDetectRelationships(units, 0.3);
      const graph = manager.getGraph();
      
      expect(graph.getAllNodes()).toHaveLength(3);
      expect(graph.getAllEdges().length).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should get graph statistics', () => {
      const units = [
        {
          id: 'u1',
          title: 'Unit 1',
          type: 'insight',
          category: 'cat1',
          keywords: [],
          timestamp: new Date(),
        },
      ];
      
      manager.buildFromUnits(units, []);
      const stats = manager.getStatistics();
      
      expect(stats).toHaveProperty('nodeCount');
      expect(stats).toHaveProperty('edgeCount');
      expect(stats.nodeCount).toBe(1);
    });
  });

  describe('Export', () => {
    it('should export as JSON', () => {
      const units = [
        {
          id: 'u1',
          title: 'Unit 1',
          type: 'insight',
          category: 'cat1',
          keywords: ['test'],
          timestamp: new Date(),
        },
      ];
      
      manager.buildFromUnits(units, []);
      const json = manager.exportJSON();
      
      expect(json).toHaveProperty('nodes');
      expect(json).toHaveProperty('edges');
      expect(json).toHaveProperty('stats');
    });
  });
});

describe('Graph API Endpoints', () => {
  let manager: GraphManager;

  beforeEach(() => {
    manager = new GraphManager();
    
    const units = [
      {
        id: 'u1',
        title: 'Node 1',
        type: 'insight',
        category: 'programming',
        keywords: ['typescript', 'react'],
        timestamp: new Date(),
      },
      {
        id: 'u2',
        title: 'Node 2',
        type: 'code',
        category: 'programming',
        keywords: ['typescript', 'node'],
        timestamp: new Date(),
      },
      {
        id: 'u3',
        title: 'Node 3',
        type: 'question',
        category: 'design',
        keywords: ['ui', 'design'],
        timestamp: new Date(),
      },
    ];
    
    const relationships = [
      {
        sourceId: 'u1',
        targetId: 'u2',
        type: 'related',
        strength: 0.8,
      },
      {
        sourceId: 'u2',
        targetId: 'u3',
        type: 'references',
        strength: 0.6,
      },
    ];
    
    manager.buildFromUnits(units, relationships);
  });

  it('should handle node queries', () => {
    const graph = manager.getGraph();
    const nodes = graph.getAllNodes();
    
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toHaveProperty('id');
    expect(nodes[0]).toHaveProperty('title');
  });

  it('should filter nodes by type', () => {
    const graph = manager.getGraph();
    const insights = graph.findByType('insight');
    
    expect(insights).toHaveLength(1);
    expect(insights[0].type).toBe('insight');
  });

  it('should filter nodes by category', () => {
    const graph = manager.getGraph();
    const programming = graph.findByCategory('programming');
    
    expect(programming).toHaveLength(2);
  });

  it('should retrieve edges', () => {
    const graph = manager.getGraph();
    const edges = graph.getAllEdges();
    
    expect(edges).toHaveLength(2);
    expect(edges[0]).toHaveProperty('relationship');
    expect(edges[0]).toHaveProperty('strength');
  });

  it('should find shortest paths', () => {
    const graph = manager.getGraph();
    const path = graph.findShortestPath('u1', 'u3');
    
    expect(path).toHaveLength(3);
    expect(path[0]).toBe('u1');
    expect(path[path.length - 1]).toBe('u3');
  });

  it('should get neighborhoods', () => {
    const graph = manager.getGraph();
    const { nodes, edges } = graph.getNeighborhood('u2', 1);
    
    expect(nodes.length).toBeGreaterThan(0);
    expect(edges.length).toBeGreaterThan(0);
  });

  it('should calculate statistics', () => {
    const stats = manager.getStatistics();
    
    expect(stats.nodeCount).toBe(3);
    expect(stats.edgeCount).toBe(2);
    expect(stats.density).toBeGreaterThan(0);
    expect(stats.maxDegree).toBeGreaterThan(0);
  });

  it('should export visualization format', () => {
    const graph = manager.getGraph();
    const vis = graph.toVisFormat();
    
    expect(vis.nodes).toHaveLength(3);
    expect(vis.edges).toHaveLength(2);
    expect(vis.nodes[0]).toHaveProperty('label');
    expect(vis.edges[0]).toHaveProperty('from');
    expect(vis.edges[0]).toHaveProperty('to');
  });
});
