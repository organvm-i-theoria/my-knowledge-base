/**
 * Search Hook
 * Combines React Query with Zustand store for search functionality
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { searchApi } from '../api/client';
import { useSearchStore } from '../stores/searchStore';
import { useUIStore } from '../stores/uiStore';
import type { SearchResult } from '../types';

export function useSearch() {
  const {
    query,
    mode,
    ftsWeight,
    semanticWeight,
    filters,
    setResults,
    setTotal,
    setLoading,
    setError,
  } = useSearchStore();

  const { addToast } = useUIStore();

  // Build query params from filters
  const buildParams = () => {
    const params: Record<string, string | number> = {};
    if (filters.limit) params.limit = filters.limit;
    if (filters.type && filters.type !== 'all') params.type = filters.type;
    if (filters.category && filters.category !== 'all') params.category = filters.category;
    if (filters.source && filters.source !== 'all') params.source = filters.source;
    if (filters.format && filters.format !== 'all') params.format = filters.format;
    if (filters.tag) params.tag = filters.tag;
    if (filters.minScore) params.minScore = filters.minScore;
    if (filters.sort) params.sort = filters.sort;
    if (mode === 'hybrid') {
      params.ftsWeight = ftsWeight;
      params.semanticWeight = semanticWeight;
    }
    return params;
  };

  // Search query
  const searchQuery = useQuery({
    queryKey: ['search', query, mode, filters, ftsWeight, semanticWeight],
    queryFn: async () => {
      if (!query.trim()) {
        return { data: [], total: 0 };
      }

      setLoading(true);
      setError(null);

      try {
        const params = buildParams();
        let response;

        switch (mode) {
          case 'fts':
            response = await searchApi.fts(query, params);
            break;
          case 'semantic':
            response = await searchApi.semantic(query, params);
            break;
          case 'hybrid':
          default:
            response = await searchApi.hybrid(query, params);
            break;
        }

        const results = response.data || [];
        setResults(results);
        setTotal(results.length);
        return { data: results, total: results.length };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Search failed';
        setError(message);
        addToast(message, 'error');
        throw error;
      } finally {
        setLoading(false);
      }
    },
    enabled: false, // Manual trigger only
    staleTime: 30000, // 30 seconds
  });

  // Suggestions query
  const suggestionsQuery = useQuery({
    queryKey: ['suggestions', query],
    queryFn: async () => {
      if (!query.trim() || query.length < 2) {
        return [];
      }
      const response = await searchApi.suggestions(query);
      return response.data || [];
    },
    enabled: query.length >= 2,
    staleTime: 60000, // 1 minute
  });

  // Facets query
  const facetsQuery = useQuery({
    queryKey: ['facets'],
    queryFn: async () => {
      const response = await searchApi.facets();
      return response.data || {};
    },
    staleTime: 300000, // 5 minutes
  });

  // Execute search
  const executeSearch = () => {
    if (query.trim()) {
      searchQuery.refetch();
    }
  };

  return {
    // Search
    executeSearch,
    searchResults: searchQuery.data?.data || [],
    searchTotal: searchQuery.data?.total || 0,
    isSearching: searchQuery.isFetching,
    searchError: searchQuery.error,

    // Suggestions
    suggestions: suggestionsQuery.data || [],
    suggestionsLoading: suggestionsQuery.isLoading,

    // Facets
    facets: facetsQuery.data || {},
    facetsLoading: facetsQuery.isLoading,
  };
}

export function useUnit(id: string | null) {
  return useQuery({
    queryKey: ['unit', id],
    queryFn: async () => {
      if (!id) return null;
      const { unitsApi } = await import('../api/client');
      const response = await unitsApi.get(id);
      return response.data;
    },
    enabled: !!id,
    staleTime: 60000, // 1 minute
  });
}

export function useRelatedUnits(id: string | null) {
  return useQuery({
    queryKey: ['relatedUnits', id],
    queryFn: async () => {
      if (!id) return [];
      const { unitsApi } = await import('../api/client');
      const response = await unitsApi.getRelated(id);
      return response.data || [];
    },
    enabled: !!id,
    staleTime: 60000, // 1 minute
  });
}
