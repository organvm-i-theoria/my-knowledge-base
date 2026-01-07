/**
 * Knowledge Graph API Endpoints
 * Provides REST endpoints for graph queries, visualization, and analysis
 */

import { Router } from 'express';
import { Logger } from './logger.js';
import { KnowledgeGraph, GraphBuilder } from './knowledge-graph.js';
import { AdvancedSearch } from './advanced-search.js';

const logger = new Logger({ context: 'graph-api' });

export function createGraphRoutes(graphManager: GraphManager): Router {
  const router = Router();

  // GET /api/graph/nodes - Get all nodes
  router.get('/nodes', (req, res) => {
    try {
      const filter = req.query.type || req.query.category;
      const graph = graphManager.getGraph();
      
      let nodes = graph.getAllNodes();
      
      if (req.query.type) {
        nodes = graph.findByType(req.query.type as string);
      } else if (req.query.category) {
        nodes = graph.findByCategory(req.query.category as string);
      }
      
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const paginated = nodes.slice(offset, offset + limit);
      
      res.json({
        success: true,
        data: paginated,
        total: nodes.length,
        limit,
        offset,
      });
    } catch (error) {
      logger.error('Error fetching nodes: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch nodes',
      });
    }
  });

  // GET /api/graph/nodes/:id - Get specific node
  router.get('/nodes/:id', (req, res) => {
    try {
      const graph = graphManager.getGraph();
      const node = graph.getNode(req.params.id);
      
      if (!node) {
        return res.status(404).json({
          success: false,
          error: 'Node not found',
        });
      }
      
      const incoming = graph.getEdgesTo(node.id);
      const outgoing = graph.getEdgesFrom(node.id);
      
      res.json({
        success: true,
        data: {
          node,
          incoming: incoming.length,
          outgoing: outgoing.length,
        },
      });
    } catch (error) {
      logger.error('Error fetching node: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch node',
      });
    }
  });

  // GET /api/graph/edges - Get all edges
  router.get('/edges', (req, res) => {
    try {
      const graph = graphManager.getGraph();
      const edges = graph.getAllEdges();
      
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const paginated = edges.slice(offset, offset + limit);
      
      res.json({
        success: true,
        data: paginated,
        total: edges.length,
        limit,
        offset,
      });
    } catch (error) {
      logger.error('Error fetching edges: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch edges',
      });
    }
  });

  // GET /api/graph/path/:source/:target - Find shortest path
  router.get('/path/:source/:target', (req, res) => {
    try {
      const graph = graphManager.getGraph();
      const path = graph.findShortestPath(req.params.source, req.params.target);
      
      if (path.length === 0) {
        return res.json({
          success: true,
          data: { path: [], found: false },
        });
      }
      
      const nodes = path.map(id => graph.getNode(id)).filter(Boolean);
      
      res.json({
        success: true,
        data: {
          path,
          nodes,
          hops: path.length - 1,
          found: true,
        },
      });
    } catch (error) {
      logger.error('Error finding path: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to find path',
      });
    }
  });

  // GET /api/graph/neighborhood/:id - Get neighborhood
  router.get('/neighborhood/:id', (req, res) => {
    try {
      const graph = graphManager.getGraph();
      const maxHops = parseInt(req.query.maxHops as string) || 2;
      
      const { nodes, edges } = graph.getNeighborhood(req.params.id, maxHops);
      
      res.json({
        success: true,
        data: {
          nodes,
          edges,
          center: req.params.id,
          maxHops,
        },
      });
    } catch (error) {
      logger.error('Error fetching neighborhood: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch neighborhood',
      });
    }
  });

  // GET /api/graph/stats - Graph statistics
  router.get('/stats', (req, res) => {
    try {
      const graph = graphManager.getGraph();
      const stats = graph.getStatistics();
      
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error fetching stats: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics',
      });
    }
  });

  // GET /api/graph/visualization - Export for vis.js visualization
  router.get('/visualization', (req, res) => {
    try {
      const graph = graphManager.getGraph();
      const visData = graph.toVisFormat();
      
      res.json({
        success: true,
        data: visData,
      });
    } catch (error) {
      logger.error('Error exporting visualization: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to export visualization',
      });
    }
  });

  // GET /api/graph/search - Search nodes
  router.get('/search', (req, res) => {
    try {
      const graph = graphManager.getGraph();
      const query = req.query.q as string;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Search query required',
        });
      }
      
      const lowerQuery = query.toLowerCase();
      const nodes = graph.getAllNodes().filter(n =>
        n.title.toLowerCase().includes(lowerQuery) ||
        n.keywords.some(k => k.toLowerCase().includes(lowerQuery))
      );
      
      const limit = parseInt(req.query.limit as string) || 20;
      const results = nodes.slice(0, limit);
      
      res.json({
        success: true,
        data: results,
        total: nodes.length,
        limit,
      });
    } catch (error) {
      logger.error('Error searching graph: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to search graph',
      });
    }
  });

  return router;
}

/**
 * GraphManager - Manages graph lifecycle and updates
 */
export class GraphManager {
  private graph: KnowledgeGraph;
  private search: AdvancedSearch;
  
  constructor() {
    this.graph = new KnowledgeGraph();
    this.search = new AdvancedSearch();
  }
  
  getGraph(): KnowledgeGraph {
    return this.graph;
  }
  
  /**
   * Build graph from units and relationships
   */
  buildFromUnits(
    units: Array<{ id: string; title: string; type: string; category: string; keywords: string[]; timestamp: Date }>,
    relationships: Array<{ sourceId: string; targetId: string; type: string; strength: number }>
  ): void {
    this.graph = GraphBuilder.buildFromUnits(units, relationships);
    logger.info('Graph rebuilt with ' + units.length + ' units');
  }
  
  /**
   * Auto-detect relationships between units
   */
  autoDetectRelationships(
    units: Array<{ id: string; keywords: string[] }>,
    threshold: number = 0.3
  ): void {
    const relationships = GraphBuilder.detectRelationships(units, threshold);
    const fullUnits = units as any;
    this.buildFromUnits(fullUnits, relationships);
    logger.info('Auto-detected ' + relationships.length + ' relationships');
  }
  
  /**
   * Get graph as JSON for export
   */
  exportJSON(): any {
    return this.graph.toJSON();
  }
  
  /**
   * Get statistics
   */
  getStatistics(): any {
    return this.graph.getStatistics();
  }
}
