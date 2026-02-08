/**
 * API Client
 * Centralized API communication with the backend
 */

const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  timestamp: string;
}

class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      error.error || `Request failed: ${response.statusText}`,
      response.status,
      error
    );
  }

  return response.json();
}

// Units API
export const unitsApi = {
  list: (params?: { limit?: number; offset?: number }) =>
    request<ApiResponse<import('../types').AtomicUnit[]>>(
      `/units${params ? `?${new URLSearchParams(params as Record<string, string>)}` : ''}`
    ),

  get: (id: string) =>
    request<ApiResponse<import('../types').AtomicUnit>>(`/units/${id}`),

  create: (unit: Partial<import('../types').AtomicUnit>) =>
    request<ApiResponse<import('../types').AtomicUnit>>('/units', {
      method: 'POST',
      body: JSON.stringify(unit),
    }),

  update: (id: string, updates: Partial<import('../types').AtomicUnit>) =>
    request<ApiResponse<import('../types').AtomicUnit>>(`/units/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  delete: (id: string) =>
    request<ApiResponse<void>>(`/units/${id}`, { method: 'DELETE' }),

  getRelated: (id: string) =>
    request<ApiResponse<import('../types').AtomicUnit[]>>(`/units/${id}/related`),
};

// Search API
export const searchApi = {
  fts: (query: string, params?: Record<string, string | number>) =>
    request<ApiResponse<import('../types').SearchResult[]>>(
      `/search?q=${encodeURIComponent(query)}${params ? `&${new URLSearchParams(params as Record<string, string>)}` : ''}`
    ),

  semantic: (query: string, params?: Record<string, string | number>) =>
    request<ApiResponse<import('../types').SearchResult[]>>(
      `/search/semantic?q=${encodeURIComponent(query)}${params ? `&${new URLSearchParams(params as Record<string, string>)}` : ''}`
    ),

  hybrid: (
    query: string,
    params?: Record<string, string | number>
  ) =>
    request<ApiResponse<import('../types').SearchResult[]>>(
      `/search/hybrid?q=${encodeURIComponent(query)}${params ? `&${new URLSearchParams(params as Record<string, string>)}` : ''}`
    ),

  suggestions: (query: string) =>
    request<ApiResponse<string[]>>(`/search/suggestions?q=${encodeURIComponent(query)}`),

  facets: () => request<ApiResponse<Record<string, number>>>('/search/facets'),
};

// Tags API
export const tagsApi = {
  list: () => request<ApiResponse<import('../types').Tag[]>>('/tags'),

  getUnits: (tag: string) =>
    request<ApiResponse<import('../types').AtomicUnit[]>>(`/tags/${encodeURIComponent(tag)}/units`),

  add: (unitId: string, tags: string[]) =>
    request<ApiResponse<void>>(`/units/${unitId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tags }),
    }),

  remove: (unitId: string, tag: string) =>
    request<ApiResponse<void>>(`/units/${unitId}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE',
    }),
};

// Graph API
export const graphApi = {
  getVisualization: (params?: {
    limit?: number;
    type?: string;
    category?: string;
  }) =>
    request<ApiResponse<import('../types').GraphData>>(
      `/graph/visualization${params ? `?${new URLSearchParams(params as Record<string, string>)}` : ''}`
    ),

  getNeighborhood: (id: string, hops?: number) =>
    request<ApiResponse<import('../types').GraphData>>(
      `/graph/neighborhood/${id}${hops ? `?hops=${hops}` : ''}`
    ),

  getStats: () => request<ApiResponse<Record<string, number>>>('/graph/stats'),
};

// Stats API
export const statsApi = {
  getDashboard: () =>
    request<ApiResponse<import('../types').DashboardStats>>('/stats'),

  getWordCloud: (params?: { source?: string; limit?: number }) =>
    request<ApiResponse<Array<{ text: string; size: number }>>>(
      `/stats/wordcloud${params ? `?${new URLSearchParams(params as Record<string, string>)}` : ''}`
    ),
};

// Conversations API
export const conversationsApi = {
  list: () =>
    request<ApiResponse<import('../types').Conversation[]>>('/conversations'),

  get: (id: string) =>
    request<ApiResponse<import('../types').Conversation>>(`/conversations/${id}`),
};

// Export API
export const exportApi = {
  getFormats: () =>
    request<ApiResponse<import('../types').ExportFormat[]>>('/export/formats'),

  export: (
    units: import('../types').AtomicUnit[],
    format: string,
    options?: Record<string, unknown>
  ) =>
    request<Blob>(`/export/${format}`, {
      method: 'POST',
      body: JSON.stringify({ units, options }),
    }),
};

// Categories API
export const categoriesApi = {
  list: () => request<ApiResponse<string[]>>('/categories'),

  getUnits: (category: string) =>
    request<ApiResponse<import('../types').AtomicUnit[]>>(
      `/units/by-category/${category}`
    ),
};

// Health API
export const healthApi = {
  check: () => request<{ status: string; timestamp: string }>('/health'),
};

// Config API
export const configApi = {
  get: () => request<ApiResponse<{ config: any; env: any }>>('/config'),
  
  update: (updates: any) => 
    request<{ success: boolean; message: string }>('/config', {
      method: 'POST',
      body: JSON.stringify(updates)
    }),
    
  testLLM: (data: { provider: string; apiKey?: string; baseUrl?: string; model?: string }) =>
    request<{ success: boolean; response?: string; error?: string }>('/config/test-llm', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    
  listModels: (data: { provider: string; apiKey?: string; baseUrl?: string }) =>
    request<{ models: string[] }>('/config/models', {
      method: 'POST',
      body: JSON.stringify(data)
    })
};
