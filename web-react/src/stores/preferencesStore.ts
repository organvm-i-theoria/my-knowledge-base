/**
 * Preferences Store
 * User preferences that persist to localStorage
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SearchMode } from '../types';

export interface Preferences {
  // Search defaults
  defaultSearchMode: SearchMode;
  defaultResultsLimit: number;
  defaultFtsWeight: number;
  defaultSemanticWeight: number;

  // Display options
  compactView: boolean;
  showScores: boolean;

  // Export defaults
  defaultExportFormat: string;
}

interface PreferencesState extends Preferences {
  // Actions
  setDefaultSearchMode: (mode: SearchMode) => void;
  setDefaultResultsLimit: (limit: number) => void;
  setDefaultWeights: (fts: number, semantic: number) => void;
  setCompactView: (compact: boolean) => void;
  setShowScores: (show: boolean) => void;
  setDefaultExportFormat: (format: string) => void;
  resetToDefaults: () => void;
}

const defaultPreferences: Preferences = {
  defaultSearchMode: 'hybrid',
  defaultResultsLimit: 20,
  defaultFtsWeight: 0.4,
  defaultSemanticWeight: 0.6,
  compactView: false,
  showScores: true,
  defaultExportFormat: 'json',
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      // Default values
      ...defaultPreferences,

      // Actions
      setDefaultSearchMode: (mode) => set({ defaultSearchMode: mode }),
      setDefaultResultsLimit: (limit) => set({ defaultResultsLimit: limit }),
      setDefaultWeights: (fts, semantic) =>
        set({ defaultFtsWeight: fts, defaultSemanticWeight: semantic }),
      setCompactView: (compact) => set({ compactView: compact }),
      setShowScores: (show) => set({ showScores: show }),
      setDefaultExportFormat: (format) => set({ defaultExportFormat: format }),
      resetToDefaults: () => set(defaultPreferences),
    }),
    {
      name: 'kb-preferences-storage',
    }
  )
);
