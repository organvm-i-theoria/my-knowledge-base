/**
 * SearchBar Component
 * Search input with autocomplete suggestions
 */

import { useState, useRef, useEffect } from 'react';
import { useSearchStore } from '../stores/searchStore';
import { useSearch } from '../hooks/useSearch';
import type { SearchMode } from '../types';

export function SearchBar() {
  const {
    query,
    setQuery,
    mode,
    setMode,
    ftsWeight,
    semanticWeight,
    setWeights,
    filters,
    setFilters,
    clearFilters,
    loading,
  } = useSearchStore();

  const { executeSearch, suggestions } = useSearch();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setShowSuggestions(true);
    setSelectedIndex(-1);
  };

  // Handle search submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    executeSearch();
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    executeSearch();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        if (selectedIndex >= 0) {
          e.preventDefault();
          handleSuggestionClick(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!inputRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <section className="card p-6 mb-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Search Input */}
        <div className="flex gap-3">
          <div className="relative flex-1" ref={inputRef}>
            <input
              id="searchInput"
              type="text"
              value={query}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search insights, code, or decisions..."
              className="input w-full"
              autoComplete="off"
            />

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 card z-50 max-h-60 overflow-auto">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className={`w-full text-left px-4 py-2 hover:bg-[var(--bg)] transition-colors ${
                      index === selectedIndex ? 'bg-[var(--bg)]' : ''
                    }`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Search Mode */}
        <div className="flex items-center gap-6">
          <div className="flex gap-4">
            {(['fts', 'semantic', 'hybrid'] as SearchMode[]).map((m) => (
              <label key={m} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="searchMode"
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="accent-[var(--accent-2)]"
                />
                <span className="capitalize">
                  {m === 'fts' ? 'FTS (Fast)' : m}
                </span>
              </label>
            ))}
          </div>

          {/* Hybrid weights */}
          {mode === 'hybrid' && (
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                FTS Weight
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={ftsWeight}
                  onChange={(e) =>
                    setWeights(parseFloat(e.target.value), 1 - parseFloat(e.target.value))
                  }
                  className="w-20"
                />
                <span className="text-[var(--ink-muted)] w-8">{ftsWeight.toFixed(1)}</span>
              </label>
              <label className="flex items-center gap-2">
                Semantic
                <span className="text-[var(--ink-muted)] w-8">{semanticWeight.toFixed(1)}</span>
              </label>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-[var(--ink-muted)]">Type</span>
            <select
              value={filters.type || 'all'}
              onChange={(e) => setFilters({ type: e.target.value as any })}
              className="input"
            >
              <option value="all">All types</option>
              <option value="insight">Insight</option>
              <option value="code">Code</option>
              <option value="question">Question</option>
              <option value="reference">Reference</option>
              <option value="decision">Decision</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[var(--ink-muted)]">Category</span>
            <select
              value={filters.category || 'all'}
              onChange={(e) => setFilters({ category: e.target.value as any })}
              className="input"
            >
              <option value="all">All categories</option>
              <option value="programming">Programming</option>
              <option value="writing">Writing</option>
              <option value="research">Research</option>
              <option value="design">Design</option>
              <option value="general">General</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[var(--ink-muted)]">Source</span>
            <select
              value={filters.source || 'all'}
              onChange={(e) => setFilters({ source: e.target.value })}
              className="input"
            >
              <option value="all">All sources</option>
              <option value="claude">Claude</option>
              <option value="dropbox">Dropbox</option>
              <option value="local">Local Drive</option>
              <option value="apple-notes">Apple Notes</option>
              <option value="web-clipper">Web Clipper</option>
              <option value="google-docs">Google Docs</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[var(--ink-muted)]">Format</span>
            <select
              value={filters.format || 'all'}
              onChange={(e) => setFilters({ format: e.target.value })}
              className="input"
            >
              <option value="all">All formats</option>
              <option value="markdown">Markdown</option>
              <option value="pdf">PDF</option>
              <option value="html">HTML</option>
              <option value="txt">Text</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[var(--ink-muted)]">Tag</span>
            <input
              type="text"
              value={filters.tag || ''}
              onChange={(e) => setFilters({ tag: e.target.value })}
              placeholder="Filter by tag"
              className="input w-36"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[var(--ink-muted)]">Min Score</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={filters.minScore || 0.2}
              onChange={(e) => setFilters({ minScore: parseFloat(e.target.value) })}
              className="input w-20"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[var(--ink-muted)]">Sort</span>
            <select
              value={filters.sort || 'relevance'}
              onChange={(e) => setFilters({ sort: e.target.value as any })}
              className="input"
            >
              <option value="relevance">Relevance</option>
              <option value="recent">Most recent</option>
              <option value="title">Title A→Z</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[var(--ink-muted)]">Limit</span>
            <input
              type="number"
              min="5"
              max="200"
              step="5"
              value={filters.limit || 20}
              onChange={(e) => setFilters({ limit: parseInt(e.target.value) })}
              className="input w-20"
            />
          </label>

          <button type="button" onClick={clearFilters} className="btn-ghost">
            Clear Filters
          </button>
        </div>
      </form>
    </section>
  );
}
