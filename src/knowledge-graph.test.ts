import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeGraph, GraphBuilder, RelationshipType } from './knowledge-graph.js';

describe('Knowledge Graph', () => {
  let graph: KnowledgeGraph;

  beforeEach(() => {
    graph = new KnowledgeGraph();
  });

  describe('Node Operations', () => {
    it('should add and retrieve nodes', () => {
      const node = {
        id: 'node1',
        title: 'Test Node',
        type: 'insight' as const,
        category: 'testing',
        keywords: ['test', 'example'],
        timestamp: new Date(),
      };
      
      graph.addNode(node);
      const retrieved = graph.getNode('node1');
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe('Test Node');
    });

    it('should get all nodes', () => {
      graph.addNode({
        id: 'node1',
        title: 'Node 1',
        type: 'insight',
        category: 'cat1',
        keywords: [],
        timestamp: new Date(),
      });
      
      graph.addNode({
        id: 'node2',
        title: 'Node 2',
        type: 'code',
        category: 'cat2',
        keywords: [],
        timestamp: new Date(),
      });
      
      const nodes = graph.getAllNodes();
      expect(nodes).toHaveLength(2);
    });

    it('should find nodes by type', () => {
      graph.addNode({
        id: 'insight1',
        title: 'Insight',
        type: 'insight',
        category: 'cat1',
        keywords: [],
        timestamp: new Date(),
      });
      
      graph.addNode({
        id: 'code1',
        title: 'Code',
        type: 'code',
        category: 'cat2',
        keywords: [],
        timestamp: new Date(),
      });
      
      const insights = graph.findByType('insight');
      expect(insights).toHaveLength(1);
      expect(insights[0].id).toBe('insight1');
    });

    it('should find nodes by category', () => {
      graph.addNode({
        id: 'node1',
        title: 'Node 1',
        type: 'insight',
        category: 'programming',
        keywords: [],
        timestamp: new Date(),
      });
      
      graph.addNode({
        id: 'node2',
        title: 'Node 2',
        type: 'code',
        category: 'design',
        keywords: [],
        timestamp: new Date(),
      });
      
      const progNodes = graph.findByCategory('programming');
      expect(progNodes).toHaveLength(1);
    });
  });

  describe('Edge Operations', () => {
    beforeEach(() => {
      graph.addNode({
        id: 'node1',
        title: 'Node 1',
        type: 'insight',
        category: 'cat1',
        keywords: [],
        timestamp: new Date(),
      });
      
      graph.addNode({
        id: 'node2',
        title: 'Node 2',
        type: 'code',
        category: 'cat2',
        keywords: [],
        timestamp: new Date(),
      });
    });

    it('should add and retrieve edges', () => {
      graph.addEdge({
        id: 'edge1',
        source: 'node1',
        target: 'node2',
        relationship: 'related',
        strength: 0.8,
      });
      
      const edges = graph.getEdgesFrom('node1');
      expect(edges).toHaveLength(1);
      expect(edges[0].relationship).toBe('related');
    });

    it('should get edges to node', () => {
      graph.addEdge({
        id: 'edge1',
        source: 'node1',
        target: 'node2',
        relationship: 'references',
        strength: 0.9,
      });
      
      const edges = graph.getEdgesTo('node2');
      expect(edges).toHaveLength(1);
      expect(edges[0].source).toBe('node1');
    });

    it('should get all edges', () => {
      graph.addEdge({
        id: 'edge1',
        source: 'node1',
        target: 'node2',
        relationship: 'related',
        strength: 0.8,
      });
      
      graph.addEdge({
        id: 'edge2',
        source: 'node2',
        target: 'node1',
        relationship: 'references',
        strength: 0.7,
      });
      
      const edges = graph.getAllEdges();
      expect(edges).toHaveLength(2);
    });
  });

  describe('Path Finding', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        graph.addNode({
          id: 'node' + i,
          title: 'Node ' + i,
          type: 'insight',
          category: 'cat',
          keywords: [],
          timestamp: new Date(),
        });
      }
      
      graph.addEdge({
        id: 'e1',
        source: 'node1',
        target: 'node2',
        relationship: 'related',
        strength: 1,
      });
      
      graph.addEdge({
        id: 'e2',
        source: 'node2',
        target: 'node3',
        relationship: 'related',
        strength: 1,
      });
      
      graph.addEdge({
        id: 'e3',
        source: 'node3',
        target: 'node4',
        relationship: 'related',
        strength: 1,
      });
    });

    it('should find shortest path', () => {
      const path = graph.findShortestPath('node1', 'node4');
      expect(path).toEqual(['node1', 'node2', 'node3', 'node4']);
    });

    it('should return empty for non-existent path', () => {
      const path = graph.findShortestPath('node1', 'node5');
      expect(path).toHaveLength(0);
    });

    it('should return single node for same source and target', () => {
      const path = graph.findShortestPath('node1', 'node1');
      expect(path).toEqual(['node1']);
    });
  });

  describe('Neighborhood Queries', () => {
    beforeEach(() => {
      graph.addNode({
        id: 'center',
        title: 'Center',
        type: 'insight',
        category: 'cat',
        keywords: [],
        timestamp: new Date(),
      });
      
      for (let i = 1; i <= 3; i++) {
        graph.addNode({
          id: 'neighbor' + i,
          title: 'Neighbor ' + i,
          type: 'code',
          category: 'cat',
          keywords: [],
          timestamp: new Date(),
        });
        
        graph.addEdge({
          id: 'edge' + i,
          source: 'center',
          target: 'neighbor' + i,
          relationship: 'related',
          strength: 1,
        });
      }
    });

    it('should get neighborhood within hops', () => {
      const { nodes, edges } = graph.getNeighborhood('center', 1);
      
      expect(nodes.length).toBeGreaterThanOrEqual(4);
      expect(edges.length).toBe(3);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      for (let i = 1; i <= 3; i++) {
        graph.addNode({
          id: 'node' + i,
          title: 'Node ' + i,
          type: 'insight',
          category: 'cat',
          keywords: [],
          timestamp: new Date(),
        });
      }
      
      graph.addEdge({
        id: 'e1',
        source: 'node1',
        target: 'node2',
        relationship: 'related',
        strength: 1,
      });
      
      graph.addEdge({
        id: 'e2',
        source: 'node2',
        target: 'node3',
        relationship: 'related',
        strength: 1,
      });
    });

    it('should calculate correct statistics', () => {
      const stats = graph.getStatistics();
      
      expect(stats.nodeCount).toBe(3);
      expect(stats.edgeCount).toBe(2);
      expect(stats.density).toBeGreaterThan(0);
      expect(stats.avgDegree).toBeGreaterThan(0);
      expect(stats.maxDegree).toBeGreaterThan(0);
    });
  });

  describe('Graph Export', () => {
    beforeEach(() => {
      graph.addNode({
        id: 'node1',
        title: 'Node 1',
        type: 'insight',
        category: 'cat1',
        keywords: ['test'],
        timestamp: new Date(),
      });
      
      graph.addEdge({
        id: 'edge1',
        source: 'node1',
        target: 'node1',
        relationship: 'related',
        strength: 0.5,
      });
    });

    it('should export as JSON', () => {
      const json = graph.toJSON();
      
      expect(json).toHaveProperty('nodes');
      expect(json).toHaveProperty('edges');
      expect(json).toHaveProperty('stats');
      expect(json.nodes).toHaveLength(1);
      expect(json.edges).toHaveLength(1);
    });

    it('should export in vis.js format', () => {
      const vis = graph.toVisFormat();
      
      expect(vis).toHaveProperty('nodes');
      expect(vis).toHaveProperty('edges');
      expect(vis.nodes[0]).toHaveProperty('id');
      expect(vis.nodes[0]).toHaveProperty('label');
      expect(vis.nodes[0]).toHaveProperty('title');
      expect(vis.edges[0]).toHaveProperty('from');
      expect(vis.edges[0]).toHaveProperty('to');
      expect(vis.edges[0]).toHaveProperty('label');
    });
  });
});

describe('Graph Builder', () => {
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
    
    const graph = GraphBuilder.buildFromUnits(units, relationships);
    
    expect(graph.getAllNodes()).toHaveLength(2);
    expect(graph.getAllEdges()).toHaveLength(1);
  });

  it('should detect relationships via keyword overlap', () => {
    const units = [
      { id: 'u1', keywords: ['typescript', 'react', 'testing'] },
      { id: 'u2', keywords: ['typescript', 'react', 'hooks'] },
      { id: 'u3', keywords: ['python', 'flask'] },
    ];
    
    const relationships = GraphBuilder.detectRelationships(units, 0.4);
    
    expect(relationships.length).toBeGreaterThan(0);
    const u1u2Rel = relationships.find(
      r => (r.sourceId === 'u1' && r.targetId === 'u2') ||
           (r.sourceId === 'u2' && r.targetId === 'u1')
    );
    expect(u1u2Rel).toBeDefined();
  });

  it('should respect similarity threshold', () => {
    const units = [
      { id: 'u1', keywords: ['a', 'b', 'c'] },
      { id: 'u2', keywords: ['x', 'y', 'z'] },
    ];
    
    const relationships = GraphBuilder.detectRelationships(units, 0.5);
    expect(relationships).toHaveLength(0);
  });
});
