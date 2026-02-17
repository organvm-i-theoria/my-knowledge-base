import type {
  DashboardStats as ContractsDashboardStats,
  BranchColumn as ContractsBranchColumn,
  BranchDirection as ContractsBranchDirection,
  BranchEdge as ContractsBranchEdge,
  BranchUnitSummary as ContractsBranchUnitSummary,
  FederatedScanJob as ContractsFederatedScanJob,
  FederatedScanRun as ContractsFederatedScanRun,
  FederatedSearchHit as ContractsFederatedSearchHit,
  FederatedSource as ContractsFederatedSource,
  SearchFacetField as ContractsSearchFacetField,
  SearchResponse as ContractsSearchResponse,
  SearchSuggestion as ContractsSearchSuggestion,
  UnitBranchResponse as ContractsUnitBranchResponse,
  UniverseIngestRun as ContractsUniverseIngestRun,
  ParallelNetworkEdge as ContractsParallelNetworkEdge,
  UniverseReindexStart as ContractsUniverseReindexStart,
  TermOccurrence as ContractsTermOccurrence,
  UniverseChat as ContractsUniverseChat,
  UniverseProvider as ContractsUniverseProvider,
  UniverseSummary as ContractsUniverseSummary,
  UniverseTurn as ContractsUniverseTurn,
} from '@knowledge-base/contracts';

/**
 * Type definitions for knowledge-base React app
 * Matches backend types from src/types.ts
 */

export type UnitType = 'insight' | 'code' | 'question' | 'reference' | 'decision';
export type Category = 'programming' | 'writing' | 'research' | 'design' | 'general';
export type SearchMode = 'fts' | 'semantic' | 'hybrid';
export type Tab =
  | 'universe'
  | 'search'
  | 'branches'
  | 'federation'
  | 'graph'
  | 'tags'
  | 'conversations'
  | 'exports'
  | 'pages'
  | 'notifications'
  | 'profile'
  | 'admin'
  | 'settings';

export interface GitHubPagesRepo {
  owner: string;
  repo: string;
  fullName: string;
  repoUrl: string;
  pageUrl: string;
  status: string | null;
  buildType: string | null;
  cname: string | null;
  sourceBranch: string | null;
  sourcePath: string | null;
  updatedAt: string | null;
  featured: boolean;
  priority: number;
  hidden: boolean;
  label: string | null;
  httpStatus: number | null;
  reachable: boolean;
  redirectTarget: string | null;
  lastCheckedAt: string;
  probeMethod?: string | null;
  probeLatencyMs?: number | null;
  lastError?: string | null;
}

export interface GitHubPagesDirectory {
  schemaVersion: string;
  syncCoreVersion: string;
  generatedAt: string;
  owners: string[];
  totalRepos: number;
  syncStatus?: string;
  syncWarnings?: string[];
  stats?: Record<string, unknown>;
  repos: GitHubPagesRepo[];
}

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

export type SearchResponse = ContractsSearchResponse<SearchResult>;
export type SearchSuggestion = ContractsSearchSuggestion;
export type SearchFacetField = ContractsSearchFacetField;
export type BranchDirection = ContractsBranchDirection;
export type BranchUnitSummary = ContractsBranchUnitSummary;
export type BranchEdge = ContractsBranchEdge;
export type BranchColumn = ContractsBranchColumn;
export type UnitBranchResponse = ContractsUnitBranchResponse;

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

export type UniverseSummary = ContractsUniverseSummary;
export type UniverseProvider = ContractsUniverseProvider;
export type UniverseChat = ContractsUniverseChat;
export type UniverseTurn = ContractsUniverseTurn;
export type UniverseTermOccurrence = ContractsTermOccurrence;
export type UniverseNetworkEdge = ContractsParallelNetworkEdge;
export type UniverseReindexStart = ContractsUniverseReindexStart;
export type UniverseIngestRun = ContractsUniverseIngestRun;

export type DashboardStats = ContractsDashboardStats<AtomicUnit>;

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

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  read: boolean;
  sourceEventType?: string;
}

export type FederatedSource = ContractsFederatedSource;
export type FederatedScanRun = ContractsFederatedScanRun;
export type FederatedScanJob = ContractsFederatedScanJob;
export type FederatedSearchHit = ContractsFederatedSearchHit;

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
