export type ProviderId = 'chatgpt' | 'claude' | 'gemini' | 'grok' | 'copilot' | 'unknown';

export interface ProviderRecord {
  id: string;
  providerId: ProviderId;
  displayName: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderAccount {
  id: string;
  providerRefId: string;
  externalAccountId?: string;
  displayName?: string;
  email?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ChatThread {
  id: string;
  providerRefId: string;
  accountRefId?: string;
  externalThreadId?: string;
  title: string;
  sourcePath: string;
  createdAt?: string;
  updatedAt?: string;
  metadata: Record<string, unknown>;
}

export interface ChatTurn {
  id: string;
  threadId: string;
  turnIndex: number;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp?: string;
  pairTurnId?: string;
  metadata: Record<string, unknown>;
}

export interface TermOccurrence {
  id: string;
  term: string;
  normalizedTerm: string;
  providerId: ProviderId;
  threadId: string;
  turnId: string;
  chatTitle: string;
  turnIndex: number;
  role: string;
  content: string;
  position: number;
  contextBefore?: string;
  contextAfter?: string;
}

export interface ParallelNetworkEdge {
  id: string;
  sourceThreadId: string;
  targetThreadId: string;
  edgeType: 'cooccurrence' | 'semantic' | 'temporal';
  weight: number;
  evidence: Record<string, unknown>;
}

export interface UniverseSummary {
  providers: number;
  accounts: number;
  chats: number;
  turns: number;
  terms: number;
  occurrences: number;
  updatedAt: string;
}

export interface UniverseChat extends ChatThread {
  providerId: ProviderId;
  providerName: string;
  turnCount: number;
}

export interface UniverseProvider extends ProviderRecord {}

export interface UniverseTurn extends ChatTurn {}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  timestamp: string;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

export interface ApiListSuccess<T> extends ApiSuccess<T[]> {
  pagination: {
    limit: number;
    offset: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiPageListSuccess<T> extends ApiSuccess<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export type SearchFallbackReason =
  | 'semantic_unavailable'
  | 'hybrid_unavailable'
  | 'runtime_error'
  | 'no_semantic_results'
  | 'no_hybrid_results';

export interface SearchFacetBucket {
  value: string;
  count: number;
  startDate?: string;
  endDate?: string;
}

export interface SearchFacetField {
  field: string;
  buckets: SearchFacetBucket[];
}

export interface SearchQueryMeta {
  original: string;
  normalized: string;
  degradedMode?: boolean;
  fallbackReason?: SearchFallbackReason;
  searchPolicyApplied?: 'degrade' | 'strict';
  vectorProfileId?: string;
}

export interface SearchResponse<T> extends ApiSuccess<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    offset?: number;
  };
  query: SearchQueryMeta;
  filters?: {
    applied: Array<Record<string, unknown>>;
    available: SearchFacetField[];
  };
  facets?: SearchFacetField[];
  searchTime: number;
  stats?: {
    cacheHit: boolean;
  };
}

export type SuggestionSource = 'query' | 'tag' | 'keyword' | 'title';

export interface SearchSuggestion {
  text: string;
  type: SuggestionSource;
  source: SuggestionSource;
  score: number;
  metadata?: {
    frequency?: number;
    lastUsed?: string;
    resultCount?: number;
  };
}

export interface SearchSuggestionsResponse extends ApiSuccess<SearchSuggestion[]> {
  suggestions: string[];
  count: number;
}

export type SavedSearchType = 'fts' | 'semantic' | 'hybrid';

export interface SavedSearchFilters {
  category?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  type?: string;
}

export interface SavedSearchRecord {
  id: string;
  name: string;
  query: string;
  searchType: SavedSearchType;
  filters: SavedSearchFilters;
  createdAt: string;
  updatedAt: string;
  lastExecutedAt: string | null;
  executionCount: number;
}

export interface SavedSearchExecutionResult<T = Record<string, unknown>> {
  savedSearch: SavedSearchRecord;
  results: T[];
  executionTime: number;
  pagination: {
    offset: number;
    limit: number;
    total: number;
  };
}

export interface PopularSavedSearchRecord {
  id: string;
  name: string;
  query: string;
  searchType: SavedSearchType;
  executionCount: number;
  lastExecutedAt: string | null;
}

export type DashboardUnitType = 'insight' | 'code' | 'question' | 'reference' | 'decision';
export type DashboardCategory = 'programming' | 'writing' | 'research' | 'design' | 'general';

export interface DashboardStats<TUnit = Record<string, unknown>> {
  totalUnits: number;
  totalConversations: number;
  totalTags: number;
  unitsByType: Record<DashboardUnitType, number>;
  unitsByCategory: Record<DashboardCategory, number>;
  recentUnits: TUnit[];
}

export interface DatabaseCount {
  count: number;
}

export interface DatabaseSourceStat {
  source: string | null;
  count: number;
}

export interface DatabaseStatsPayload {
  units: number;
  tags: number;
  conversations: number;
  documents: number;
  typeDistribution: Record<string, number>;
  categoryDistribution: Record<string, number>;
  totalUnits: DatabaseCount;
  totalConversations: DatabaseCount;
  totalDocuments: DatabaseCount;
  totalTags: DatabaseCount;
  unitsByType: Array<{ type: string; count: number }>;
  sourceStats: DatabaseSourceStat[];
}

export type FederatedSourceKind = 'local-filesystem';
export type FederatedSourceStatus = 'active' | 'disabled';
export type FederatedScanStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type FederatedScanMode = 'incremental' | 'full';
export type FederatedScanJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface FederatedSource {
  id: string;
  name: string;
  kind: FederatedSourceKind;
  status: FederatedSourceStatus;
  rootPath: string;
  includePatterns: string[];
  excludePatterns: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastScanAt?: string;
  lastScanStatus?: FederatedScanStatus;
  lastScanSummary?: Record<string, unknown>;
}

export interface FederatedDocument {
  id: string;
  sourceId: string;
  externalId: string;
  path: string;
  title: string;
  content: string;
  hash: string;
  sizeBytes: number | null;
  mimeType: string | null;
  modifiedAt: string | null;
  indexedAt: string;
  metadata: Record<string, unknown>;
}

export interface FederatedScanRun {
  id: string;
  sourceId: string;
  jobId: string | null;
  status: FederatedScanStatus;
  scannedCount: number;
  indexedCount: number;
  skippedCount: number;
  errorCount: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  summary: Record<string, unknown>;
}

export interface FederatedScanJob {
  id: string;
  sourceId: string;
  mode: FederatedScanMode;
  status: FederatedScanJobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  runId: string | null;
  requestedBy: string | null;
  errorMessage: string | null;
  meta: Record<string, unknown>;
}

export interface FederatedSearchHit {
  id: string;
  sourceId: string;
  sourceName: string;
  path: string;
  title: string;
  snippet: string;
  score: number;
  mimeType: string | null;
  modifiedAt: string | null;
  indexedAt: string;
}

export interface CreateFederatedSourceInput {
  name: string;
  rootPath: string;
  kind?: FederatedSourceKind;
  includePatterns?: string[];
  excludePatterns?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateFederatedSourceInput {
  name?: string;
  status?: FederatedSourceStatus;
  rootPath?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  metadata?: Record<string, unknown>;
}

export type IngestRunStatus = 'running' | 'completed' | 'failed';

export interface UniverseReindexStart {
  runId: string;
  status: IngestRunStatus;
}

export interface UniverseIngestRun {
  id: string;
  sourceRoot: string;
  status: IngestRunStatus;
  filesScanned: number;
  filesIngested: number;
  filesQuarantined: number;
  chatsIngested: number;
  turnsIngested: number;
  policyReportPath?: string;
  startedAt: string;
  completedAt?: string;
  metadata: Record<string, unknown>;
}

export type BranchDirection = 'out' | 'in' | 'both';
export type BranchEdgeDirection = 'out' | 'in';

export interface BranchUnitSummary {
  id: string;
  title: string;
  type: string;
  category: string;
}

export interface BranchEdge {
  fromUnitId: string;
  toUnitId: string;
  relationshipType: string;
  source: string;
  confidence: number | null;
  explanation: string | null;
  createdAt: string | null;
  direction: BranchEdgeDirection;
  depth: number;
}

export interface BranchColumn {
  depth: number;
  units: BranchUnitSummary[];
}

export interface UnitBranchResponse {
  root: BranchUnitSummary;
  columns: BranchColumn[];
  edges: BranchEdge[];
  meta: {
    depth: number;
    direction: BranchDirection;
    limitPerNode: number;
    relationshipTypes: string[];
    truncated: boolean;
    filteredBackEdges: number;
    visitedCount: number;
    edgeCount: number;
  };
}

export * from './universe-visual.js';

export interface PagedRequest {
  limit?: number;
  offset?: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
