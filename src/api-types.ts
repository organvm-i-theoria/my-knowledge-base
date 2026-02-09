import { SearchFilter } from './filter-builder.js';

/**
 * API error response format
 */
export interface ApiErrorResponse {
  error: string;
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

/**
 * API success response format
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

/**
 * Paginated response format
 */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  timestamp: string;
}

export type SearchFallbackReason =
  | 'semantic_unavailable'
  | 'hybrid_unavailable'
  | 'runtime_error'
  | 'no_semantic_results'
  | 'no_hybrid_results';

/**
 * Search response format (Phase 2)
 */
export interface SearchResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    offset: number;
  };
  query: {
    original: string;
    normalized: string;
    degradedMode?: boolean;
    fallbackReason?: SearchFallbackReason;
    searchPolicyApplied?: 'degrade' | 'strict';
    vectorProfileId?: string;
  };
  filters?: {
    applied: SearchFilter[];
    available: Array<{ field: string; buckets: Array<{ value: string; count: number }> }>;
  };
  facets?: Array<{ field: string; buckets: Array<{ value: string; count: number }> }>;
  searchTime: number;
  stats?: {
    cacheHit: boolean;
  };
  timestamp: string;
}
