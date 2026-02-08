/**
 * Type definitions for knowledge-base React app
 * Matches backend types from src/types.ts
 */

export type UnitType = 'insight' | 'code' | 'question' | 'reference' | 'decision';
export type Category = 'programming' | 'writing' | 'research' | 'design' | 'general';
export type SearchMode = 'fts' | 'semantic' | 'hybrid';
export type Tab = 'search' | 'graph' | 'tags' | 'conversations' | 'admin' | 'settings';

export interface AtomicUnit {
  id: string;
  title: string;
  content: string;
  context?: string;
  type: UnitType;
  category: Category;
  tags: string[];
  keywords: string[];
  timestamp: string;
  conversationId?: string;
  documentId?: string;
  source?: string;
  format?: string;
  relatedUnits?: string[];
  embedding?: number[];
}

export interface SearchFilters {
  type?: UnitType | 'all';
  category?: Category | 'all';
  tag?: string;
  source?: string | 'all';
  format?: string | 'all';
  minScore?: number;
  sort?: 'relevance' | 'recent' | 'title';
  limit?: number;
}

export interface SearchResult {
  unit: AtomicUnit;
  score: number;
  highlights?: string[];
}

export interface SearchResponse {
  success: boolean;
  data: SearchResult[];
  total: number;
  query: string;
  mode: SearchMode;
  timestamp: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: UnitType;
  category: Category;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  strength: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Tag {
  name: string;
  count: number;
}

export interface Conversation {
  id: string;
  title: string;
  source: string;
  unitCount: number;
  timestamp: string;
}

export interface DashboardStats {
  totalUnits: number;
  totalConversations: number;
  totalTags: number;
  unitsByType: Record<UnitType, number>;
  unitsByCategory: Record<Category, number>;
  recentUnits: AtomicUnit[];
}

export interface ExportFormat {
  name: string;
  mimeType: string;
  extension: string;
  description: string;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

// WebSocket types
export type WebSocketEventType =
  | 'unit:created'
  | 'unit:updated'
  | 'unit:deleted'
  | 'tag:added'
  | 'tag:removed'
  | 'graph:updated'
  | 'search:result'
  | 'connection'
  | 'disconnection'
  | 'ping'
  | 'pong';

export interface WebSocketEvent {
  type: WebSocketEventType;
  timestamp: string;
  userId?: string;
  data: unknown;
  metadata?: Record<string, unknown>;
}

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
