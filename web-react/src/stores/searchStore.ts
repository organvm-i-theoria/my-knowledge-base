/**
 * Search State Store
 * Manages search query, filters, results, and mode
 */

import { create } from 'zustand';
import type { SearchMode, SearchFilters, SearchResult, AtomicUnit } from '../types';

interface SearchState {
  // Query
  query: string;
  setQuery: (query: string) => void;

  // Search mode
  mode: SearchMode;
  setMode: (mode: SearchMode) => void;

  // Hybrid weights
  ftsWeight: number;
  semanticWeight: number;
  setWeights: (fts: number, semantic: number) => void;

  // Filters
  filters: SearchFilters;
  setFilters: (filters: Partial<SearchFilters>) => void;
  clearFilters: () => void;

  // Results
  results: SearchResult[];
  setResults: (results: SearchResult[]) => void;
  total: number;
  setTotal: (total: number) => void;

  // Loading state
  loading: boolean;
  setLoading: (loading: boolean) => void;

  // Error state
  error: string | null;
  setError: (error: string | null) => void;

  // Suggestions
  suggestions: string[];
  setSuggestions: (suggestions: string[]) => void;

  // Selected unit for detail view
  selectedUnit: AtomicUnit | null;
  setSelectedUnit: (unit: AtomicUnit | null) => void;
}

const defaultFilters: SearchFilters = {
  type: 'all',
  category: 'all',
  tag: '',
  source: 'all',
  format: 'all',
  minScore: 0.2,
  sort: 'relevance',
  limit: 20,
};

export const useSearchStore = create<SearchState>((set) => ({
  // Query
  query: '',
  setQuery: (query) => set({ query }),

  // Search mode - default to hybrid
  mode: 'hybrid',
  setMode: (mode) => set({ mode }),

  // Hybrid weights - 60% semantic, 40% FTS by default
  ftsWeight: 0.4,
  semanticWeight: 0.6,
  setWeights: (fts, semantic) => set({ ftsWeight: fts, semanticWeight: semantic }),

  // Filters
  filters: { ...defaultFilters },
  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters },
    })),
  clearFilters: () => set({ filters: { ...defaultFilters } }),

  // Results
  results: [],
  setResults: (results) => set({ results }),
  total: 0,
  setTotal: (total) => set({ total }),

  // Loading state
  loading: false,
  setLoading: (loading) => set({ loading }),

  // Error state
  error: null,
  setError: (error) => set({ error }),

  // Suggestions
  suggestions: [],
  setSuggestions: (suggestions) => set({ suggestions }),

  // Selected unit
  selectedUnit: null,
  setSelectedUnit: (unit) => set({ selectedUnit: unit }),
}));
