/**
 * Knowledge Graph - Build and query relationship networks
 */

import { Logger } from './logger.js';

const logger = new Logger({ context: 'knowledge-graph' });

export interface GraphNode {
  id: string;
  title: string;
  type: 'insight' | 'code' | 'question' | 'reference' | 'decision';
  category: string;
  keywords: string[];
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  strength: number;
  metadata?: Record<string, any>;
}

export enum RelationshipType {
  RELATED = 'related',
  SIMILAR = 'similar',
  CONTRADICTS = 'contradicts',
  EXTENDS = 'extends',
  REFERENCES = 'references',
  DEPENDS_ON = 'depends_on',
  PART_OF = 'part_of',
  FOLLOWS = 'follows',
  PRECEDES = 'precedes',
  SAME_CATEGORY = 'same_category',
  SAME_TOPIC = 'same_topic',
}

export class KnowledgeGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private adjacency: Map<string, string[]> = new Map();
  
  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, []);
    }
    logger.debug('Added node: ' + node.id);
  }
  
  addEdge(edge: GraphEdge): void {
    this.edges.set(edge.id, edge);
    const sources = this.adjacency.get(edge.source) || [];
    if (!sources.includes(edge.target)) {
      sources.push(edge.target);
      this.adjacency.set(edge.source, sources);
    }
  }
  
  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }
  
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }
  
  getEdgesFrom(nodeId: string): GraphEdge[] {
    const targetIds = this.adjacency.get(nodeId) || [];
    return targetIds
      .map(targetId => {
        const edge = Array.from(this.edges.values()).find(
          e => e.source === nodeId && e.target === targetId
        );
        return edge;
      })
      .filter((e): e is GraphEdge => e !== undefined);
  }
  
  getEdgesTo(nodeId: string): GraphEdge[] {
    return Array.from(this.edges.values()).filter(e => e.target === nodeId);
  }
  
  getAllEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }
  
  findShortestPath(sourceId: string, targetId: string): string[] {
    if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) {
      return [];
    }
    if (sourceId === targetId) {
      return [sourceId];
    }
    
    const queue: Array<{ nodeId: string; path: string[] }> = [
      { nodeId: sourceId, path: [sourceId] }
    ];
    const visited = new Set<string>();
    visited.add(sourceId);
    
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const { nodeId, path } = item;
      const neighbors = this.adjacency.get(nodeId) || [];
      
      for (const neighbor of neighbors) {
        if (neighbor === targetId) {
          return path.concat(targetId);
        }
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ nodeId: neighbor, path: path.concat(neighbor) });
        }
      }
    }
    return [];
  }
  
  getNeighborhood(nodeId: string, maxHops: number = 2): {
    nodes: GraphNode[];
    edges: GraphEdge[];
  } {
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; depth: number }> = [
      { nodeId, depth: 0 }
    ];
    visited.add(nodeId);
    
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const { nodeId: current, depth } = item;
      
      if (depth < maxHops) {
        const neighbors = this.adjacency.get(current) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push({ nodeId: neighbor, depth: depth + 1 });
          }
        }
      }
    }
    
    const nodes = Array.from(visited)
      .map(id => this.nodes.get(id))
      .filter((n): n is GraphNode => n !== undefined);
    
    const edges = Array.from(this.edges.values()).filter(
      e => visited.has(e.source) && visited.has(e.target)
    );
    
    return { nodes, edges };
  }
  
  getStatistics(): {
    nodeCount: number;
    edgeCount: number;
    density: number;
    components: number;
    avgDegree: number;
    maxDegree: number;
  } {
    const nodeCount = this.nodes.size;
    const edgeCount = this.edges.size;
    const density = nodeCount > 1 ? edgeCount / (nodeCount * (nodeCount - 1)) : 0;
    
    const degrees = Array.from(this.nodes.keys()).map(nodeId => {
      const outgoing = this.adjacency.get(nodeId)?.length || 0;
      const incoming = Array.from(this.edges.values()).filter(
        e => e.target === nodeId
      ).length;
      return outgoing + incoming;
    });
    
    const avgDegree = degrees.length > 0 ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0;
    const maxDegree = degrees.length > 0 ? Math.max(...degrees) : 0;
    
    return {
      nodeCount,
      edgeCount,
      density,
      components: 1,
      avgDegree,
      maxDegree,
    };
  }
  
  findByType(type: string): GraphNode[] {
    return Array.from(this.nodes.values()).filter(n => n.type === type);
  }
  
  findByCategory(category: string): GraphNode[] {
    return Array.from(this.nodes.values()).filter(n => n.category === category);
  }
  
  toJSON() {
    return {
      nodes: this.getAllNodes(),
      edges: this.getAllEdges(),
      stats: this.getStatistics(),
    };
  }
  
  toVisFormat() {
    return {
      nodes: this.getAllNodes().map(n => ({
        id: n.id,
        label: n.title.substring(0, 30),
        title: n.title,
        type: n.type,
        category: n.category,
      })),
      edges: this.getAllEdges().map(e => ({
        from: e.source,
        to: e.target,
        label: e.relationship,
        title: e.relationship,
      })),
    };
  }
}

export class GraphBuilder {
  static buildFromUnits(
    units: Array<{ id: string; title: string; type: string; category: string; keywords: string[]; timestamp: Date }>,
    relationships: Array<{ sourceId: string; targetId: string; type: string; strength: number }>
  ): KnowledgeGraph {
    const graph = new KnowledgeGraph();
    
    units.forEach(unit => {
      graph.addNode({
        id: unit.id,
        title: unit.title,
        type: unit.type as any,
        category: unit.category,
        keywords: unit.keywords,
        timestamp: unit.timestamp,
      });
    });
    
    relationships.forEach((rel, index) => {
      const sourceNode = units.find(u => u.id === rel.sourceId);
      const targetNode = units.find(u => u.id === rel.targetId);
      
      if (sourceNode && targetNode) {
        graph.addEdge({
          id: rel.sourceId + '-' + rel.targetId + '-' + index,
          source: rel.sourceId,
          target: rel.targetId,
          relationship: rel.type,
          strength: rel.strength,
        });
      }
    });
    
    logger.info('Built graph with ' + units.length + ' nodes');
    return graph;
  }
  
  static detectRelationships(
    units: Array<{ id: string; keywords: string[] }>,
    similarityThreshold: number = 0.3
  ): Array<{ sourceId: string; targetId: string; type: string; strength: number }> {
    const relationships: Array<{ sourceId: string; targetId: string; type: string; strength: number }> = [];
    
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const unit1 = units[i];
        const unit2 = units[j];
        
        const set1 = new Set(unit1.keywords);
        const set2 = new Set(unit2.keywords);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        const similarity = intersection.size / union.size;
        
        if (similarity >= similarityThreshold) {
          relationships.push({
            sourceId: unit1.id,
            targetId: unit2.id,
            type: RelationshipType.RELATED,
            strength: similarity,
          });
        }
      }
    }
    
    return relationships;
  }
}
