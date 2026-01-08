/**
 * Filter Preset Manager - Store and retrieve common filter combinations
 * Allows users to save and reuse complex filter configurations
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Logger } from './logger.js';
import { SearchFilter, FilterGroup } from './filter-builder.js';

const logger = new Logger({ context: 'filter-presets' });

/**
 * Configuration for a saved search filter preset
 */
export interface FilterPreset {
  id: string;
  name: string;
  description: string;
  filters: (SearchFilter | FilterGroup)[];
  facets?: string[];
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Built-in filter presets
 */
export const BUILTIN_PRESETS: FilterPreset[] = [
  {
    id: 'recent-code',
    name: 'Recent Code Insights',
    description: 'Code-related insights from the last 30 days',
    filters: [
      { field: 'category', operator: '=', value: 'programming' },
      { field: 'type', operator: '=', value: 'insight' },
      { field: 'created', operator: '>', value: 'last 30 days' }
    ],
    facets: ['type', 'tags'],
    icon: 'code',
    color: 'blue',
    createdAt: new Date(2024, 0, 1).toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'unanswered-questions',
    name: 'Unanswered Questions',
    description: 'Questions that might need follow-up',
    filters: [
      { field: 'type', operator: '=', value: 'question' }
    ],
    facets: ['category', 'tags'],
    icon: 'help',
    color: 'orange',
    createdAt: new Date(2024, 0, 1).toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'all-decisions',
    name: 'All Decisions',
    description: 'Important decisions and their context',
    filters: [
      { field: 'type', operator: '=', value: 'decision' }
    ],
    facets: ['category', 'timestamp'],
    icon: 'gavel',
    color: 'red',
    createdAt: new Date(2024, 0, 1).toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'recent-design',
    name: 'Recent Design Work',
    description: 'Design-related content from the last 60 days',
    filters: [
      { field: 'category', operator: '=', value: 'design' },
      { field: 'created', operator: '>', value: 'last 60 days' }
    ],
    facets: ['type', 'tags'],
    icon: 'palette',
    color: 'purple',
    createdAt: new Date(2024, 0, 1).toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'typescript-only',
    name: 'TypeScript Content',
    description: 'All content related to TypeScript',
    filters: [
      { field: 'tags', operator: 'contains', value: 'typescript' }
    ],
    facets: ['category', 'type'],
    icon: 'code-bracket',
    color: 'blue',
    createdAt: new Date(2024, 0, 1).toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'exclude-incomplete',
    name: 'Exclude Incomplete Items',
    description: 'Hide incomplete and draft items',
    filters: [
      {
        field: 'tags',
        operator: 'in',
        value: ['draft', 'incomplete', 'todo'],
        negate: true
      }
    ],
    facets: ['category', 'type'],
    icon: 'check',
    color: 'green',
    createdAt: new Date(2024, 0, 1).toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'react-ecosystem',
    name: 'React Ecosystem',
    description: 'React, TypeScript, and web development content',
    filters: [
      {
        operator: 'OR',
        filters: [
          { field: 'tags', operator: 'contains', value: 'react' },
          { field: 'tags', operator: 'contains', value: 'typescript' },
          { field: 'tags', operator: 'contains', value: 'web' }
        ]
      }
    ],
    facets: ['type', 'timestamp'],
    icon: 'react',
    color: 'cyan',
    createdAt: new Date(2024, 0, 1).toISOString(),
    updatedAt: new Date().toISOString()
  }
];

/**
 * FilterPresetManager - Manage saved and built-in presets
 */
export class FilterPresetManager {
  private presets: Map<string, FilterPreset> = new Map();
  private customPresetsFile: string;

  constructor(customPresetsPath: string = './data/presets.json') {
    this.customPresetsFile = customPresetsPath;
    this.loadPresets();
  }

  /**
   * Load all presets (built-in + custom)
   */
  private loadPresets(): void {
    // Load built-in presets
    for (const preset of BUILTIN_PRESETS) {
      this.presets.set(preset.id, { ...preset });
    }

    // Load custom presets if file exists
    try {
      if (existsSync(this.customPresetsFile)) {
        const content = readFileSync(this.customPresetsFile, 'utf-8');
        const customPresets = JSON.parse(content) as FilterPreset[];

        for (const preset of customPresets) {
          this.presets.set(preset.id, preset);
        }

        logger.info('Loaded ' + customPresets.length + ' custom presets');
      }
    } catch (error) {
      logger.warn('Failed to load custom presets: ' + error);
    }
  }

  /**
   * Get preset by ID
   */
  getPreset(id: string): FilterPreset | undefined {
    return this.presets.get(id);
  }

  /**
   * List all presets
   */
  listPresets(): FilterPreset[] {
    return Array.from(this.presets.values()).sort((a, b) => {
      // Built-in first, then custom by updated date
      const aIsBuiltin = BUILTIN_PRESETS.some(p => p.id === a.id);
      const bIsBuiltin = BUILTIN_PRESETS.some(p => p.id === b.id);

      if (aIsBuiltin && !bIsBuiltin) return -1;
      if (!aIsBuiltin && bIsBuiltin) return 1;

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  /**
   * List only built-in presets
   */
  listBuiltinPresets(): FilterPreset[] {
    return BUILTIN_PRESETS.map(p => ({ ...p }));
  }

  /**
   * List only custom presets
   */
  listCustomPresets(): FilterPreset[] {
    return Array.from(this.presets.values())
      .filter(p => !BUILTIN_PRESETS.some(bp => bp.id === p.id))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Save a custom preset
   */
  savePreset(preset: Omit<FilterPreset, 'createdAt' | 'updatedAt'>): FilterPreset {
    const now = new Date().toISOString();
    const existing = this.presets.get(preset.id);

    const savedPreset: FilterPreset = {
      ...preset,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    this.presets.set(preset.id, savedPreset);
    this.persistCustomPresets();

    logger.info('Saved preset: ' + preset.id);
    return savedPreset;
  }

  /**
   * Delete a custom preset
   */
  deletePreset(id: string): boolean {
    // Cannot delete built-in presets
    if (BUILTIN_PRESETS.some(p => p.id === id)) {
      logger.warn('Cannot delete built-in preset: ' + id);
      return false;
    }

    const deleted = this.presets.delete(id);

    if (deleted) {
      this.persistCustomPresets();
      logger.info('Deleted preset: ' + id);
    }

    return deleted;
  }

  /**
   * Update an existing preset
   */
  updatePreset(id: string, updates: Partial<FilterPreset>): FilterPreset | undefined {
    const existing = this.presets.get(id);

    if (!existing) {
      logger.warn('Preset not found: ' + id);
      return undefined;
    }

    const now = new Date().toISOString();

    const updated: FilterPreset = {
      ...existing,
      ...updates,
      id: existing.id, // Cannot change ID
      createdAt: existing.createdAt, // Preserve created date
      updatedAt: now
    };

    this.presets.set(id, updated);
    this.persistCustomPresets();

    logger.info('Updated preset: ' + id);
    return updated;
  }

  /**
   * Search presets by name or description
   */
  searchPresets(query: string): FilterPreset[] {
    const lowerQuery = query.toLowerCase();

    return Array.from(this.presets.values()).filter(p => {
      return p.name.toLowerCase().includes(lowerQuery) ||
             p.description.toLowerCase().includes(lowerQuery) ||
             (p.icon && p.icon.toLowerCase().includes(lowerQuery));
    });
  }

  /**
   * Persist custom presets to file
   */
  private persistCustomPresets(): void {
    try {
      const customPresets = this.listCustomPresets();
      const json = JSON.stringify(customPresets, null, 2);
      writeFileSync(this.customPresetsFile, json, 'utf-8');
    } catch (error) {
      logger.error('Failed to persist presets: ' + error);
    }
  }

  /**
   * Export preset to JSON
   */
  exportPreset(id: string): string | undefined {
    const preset = this.getPreset(id);

    if (!preset) {
      return undefined;
    }

    return JSON.stringify(preset, null, 2);
  }

  /**
   * Import preset from JSON
   */
  importPreset(json: string): FilterPreset | undefined {
    try {
      const preset = JSON.parse(json) as Omit<FilterPreset, 'createdAt' | 'updatedAt'>;

      if (!preset.id || !preset.name || !preset.filters) {
        throw new Error('Invalid preset structure');
      }

      return this.savePreset(preset);
    } catch (error) {
      logger.error('Failed to import preset: ' + error);
      return undefined;
    }
  }

  /**
   * Get presets by category (from icon)
   */
  getPresetsByCategory(category: string): FilterPreset[] {
    return Array.from(this.presets.values()).filter(p => p.icon === category);
  }

  /**
   * Reset to only built-in presets
   */
  resetToBuiltins(): void {
    this.presets.clear();

    for (const preset of BUILTIN_PRESETS) {
      this.presets.set(preset.id, { ...preset });
    }

    try {
      writeFileSync(this.customPresetsFile, '[]', 'utf-8');
      logger.info('Reset presets to built-ins only');
    } catch (error) {
      logger.error('Failed to reset presets: ' + error);
    }
  }

  /**
   * Get statistics about presets
   */
  getStats(): {
    total: number;
    builtin: number;
    custom: number;
    byCategory: Record<string, number>;
  } {
    const all = this.listPresets();
    const custom = this.listCustomPresets();
    const byCategory: Record<string, number> = {};

    for (const preset of all) {
      if (preset.icon) {
        byCategory[preset.icon] = (byCategory[preset.icon] || 0) + 1;
      }
    }

    return {
      total: all.length,
      builtin: all.length - custom.length,
      custom: custom.length,
      byCategory
    };
  }
}

/**
 * Create default preset manager
 */
export function createPresetManager(path?: string): FilterPresetManager {
  return new FilterPresetManager(path);
}
