/**
 * SettingsTab Component
 * User preferences and system info
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../../stores/uiStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { shortcuts } from '../../hooks/useKeyboardShortcuts';
import { statsApi, exportApi, configApi } from '../../api/client';
import type { SearchMode } from '../../types';

export function SettingsTab() {
  const { theme, setTheme } = useUIStore();
  const queryClient = useQueryClient();
  const {
    defaultSearchMode,
    setDefaultSearchMode,
    defaultResultsLimit,
    setDefaultResultsLimit,
    defaultFtsWeight,
    defaultSemanticWeight,
    setDefaultWeights,
    compactView,
    setCompactView,
    showScores,
    setShowScores,
    defaultExportFormat,
    setDefaultExportFormat,
    resetToDefaults,
  } = usePreferencesStore();

  // Fetch config
  const { data: configResponse, isLoading: configLoading } = useQuery({
    queryKey: ['system-config'],
    queryFn: () => configApi.get(),
    staleTime: 0,
  });

  // Fetch export formats
  const { data: formatsResponse } = useQuery({
    queryKey: ['export-formats'],
    queryFn: () => exportApi.getFormats(),
    staleTime: 300000,
  });

  // Fetch stats for system info
  const { data: statsResponse } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => statsApi.getDashboard(),
    staleTime: 60000,
  });

  // Check API health
  const { data: healthResponse, isError: apiError } = useQuery({
    queryKey: ['api-health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('API unavailable');
      return res.json();
    },
    staleTime: 30000,
    retry: 1,
  });

  // Config mutations
  const updateConfig = useMutation({
    mutationFn: (updates: any) => configApi.update(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-config'] });
      alert('Configuration saved successfully');
    },
    onError: (err: any) => {
      alert(`Failed to save configuration: ${err.message}`);
    }
  });

  // Local state for config form
  const [llmForm, setLlmForm] = useState<any>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Sync form with data when loaded
  if (configResponse?.data?.config && !hasChanges && Object.keys(llmForm).length === 0) {
    setLlmForm(configResponse.data.config.llm || {});
  }

  const handleLlmChange = (field: string, value: any) => {
    setLlmForm((prev: any) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const saveConfig = () => {
    updateConfig.mutate({ llm: llmForm });
    setHasChanges(false);
  };

  const formats = formatsResponse?.data || [];
  const stats = statsResponse?.data;
  const config = configResponse?.data?.config;

  return (
    <div className="space-y-6">
      {/* AI System Settings */}
      <section className="card p-6 border-l-4 border-[var(--accent)]">
        <h3 className="text-lg font-semibold mb-4">🤖 AI System Configuration</h3>
        
        {configLoading ? (
          <div className="animate-pulse h-20 bg-[var(--surface)] rounded"></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm text-[var(--ink-muted)]">Provider</span>
                <select
                  value={llmForm.provider || 'anthropic'}
                  onChange={(e) => handleLlmChange('provider', e.target.value)}
                  className="input"
                >
                  <option value="anthropic">Anthropic (Cloud)</option>
                  <option value="openai">OpenAI (Cloud)</option>
                  <option value="ollama">Ollama (Local OSS)</option>
                  <option value="custom">Custom (OpenAI Compatible)</option>
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-[var(--ink-muted)]">Model Name</span>
                <input
                  type="text"
                  value={llmForm.model || ''}
                  onChange={(e) => handleLlmChange('model', e.target.value)}
                  placeholder="e.g. claude-3-5-sonnet-20241022"
                  className="input"
                />
              </label>
            </div>

            {llmForm.provider !== 'ollama' && (
              <label className="flex flex-col gap-2">
                <span className="text-sm text-[var(--ink-muted)]">API Key</span>
                <input
                  type="password"
                  value={llmForm.apiKey || ''}
                  onChange={(e) => handleLlmChange('apiKey', e.target.value)}
                  placeholder="sk-..."
                  className="input font-mono"
                />
                <p className="text-xs text-[var(--ink-muted)]">
                  Stored securely. Leave as "********" to keep existing key.
                </p>
              </label>
            )}

            {(llmForm.provider === 'ollama' || llmForm.provider === 'custom') && (
              <label className="flex flex-col gap-2">
                <span className="text-sm text-[var(--ink-muted)]">Base URL</span>
                <input
                  type="text"
                  value={llmForm.baseUrl || ''}
                  onChange={(e) => handleLlmChange('baseUrl', e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="input font-mono"
                />
              </label>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => {
                   // Test connection logic could go here
                   alert('Test functionality coming soon');
                }}
                className="btn-ghost"
              >
                Test Connection
              </button>
              <button 
                onClick={saveConfig}
                disabled={!hasChanges || updateConfig.isPending}
                className="btn-primary"
              >
                {updateConfig.isPending ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Appearance */}
      <section className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Appearance</h3>
        <div className="space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--ink-muted)]">Theme</span>
            <div className="flex gap-4">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="theme"
                    value={t}
                    checked={theme === t}
                    onChange={() => setTheme(t)}
                    className="accent-[var(--accent-2)]"
                  />
                  <span className="capitalize">{t}</span>
                </label>
              ))}
            </div>
          </label>
        </div>
      </section>

      {/* Search Defaults */}
      <section className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Search Defaults</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--ink-muted)]">Default Search Mode</span>
            <select
              value={defaultSearchMode}
              onChange={(e) => setDefaultSearchMode(e.target.value as SearchMode)}
              className="input"
            >
              <option value="fts">FTS (Fast)</option>
              <option value="semantic">Semantic</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--ink-muted)]">Default Results Limit</span>
            <input
              type="number"
              min="5"
              max="200"
              step="5"
              value={defaultResultsLimit}
              onChange={(e) => setDefaultResultsLimit(parseInt(e.target.value) || 20)}
              className="input"
            />
          </label>

          <div className="md:col-span-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm text-[var(--ink-muted)]">
                Hybrid Search Weights (FTS: {defaultFtsWeight.toFixed(1)} / Semantic:{' '}
                {defaultSemanticWeight.toFixed(1)})
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={defaultFtsWeight}
                onChange={(e) => {
                  const fts = parseFloat(e.target.value);
                  setDefaultWeights(fts, 1 - fts);
                }}
                className="w-full max-w-md"
              />
              <div className="flex justify-between text-xs text-[var(--ink-muted)] max-w-md">
                <span>More FTS</span>
                <span>Balanced</span>
                <span>More Semantic</span>
              </div>
            </label>
          </div>
        </div>
      </section>

      {/* Display Options */}
      <section className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Display Options</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={compactView}
              onChange={(e) => setCompactView(e.target.checked)}
              className="accent-[var(--accent-2)] w-4 h-4"
            />
            <div>
              <span className="font-medium">Compact View</span>
              <p className="text-sm text-[var(--ink-muted)]">
                Show less content preview in search results
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={showScores}
              onChange={(e) => setShowScores(e.target.checked)}
              className="accent-[var(--accent-2)] w-4 h-4"
            />
            <div>
              <span className="font-medium">Show Relevance Scores</span>
              <p className="text-sm text-[var(--ink-muted)]">
                Display match scores in search results
              </p>
            </div>
          </label>
        </div>
      </section>

      {/* Export Defaults */}
      <section className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Export Defaults</h3>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-[var(--ink-muted)]">Default Export Format</span>
          <select
            value={defaultExportFormat}
            onChange={(e) => setDefaultExportFormat(e.target.value)}
            className="input max-w-md"
          >
            {formats.length > 0
              ? formats.map((format) => (
                  <option key={format.name} value={format.name}>
                    {format.name.toUpperCase()} - {format.description}
                  </option>
                ))
              : [
                  { name: 'json', desc: 'JSON' },
                  { name: 'csv', desc: 'CSV' },
                  { name: 'markdown', desc: 'Markdown' },
                  { name: 'html', desc: 'HTML' },
                ].map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name.toUpperCase()} - {f.desc}
                  </option>
                ))}
          </select>
        </label>
      </section>

      {/* Keyboard Shortcuts */}
      <section className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Keyboard Shortcuts</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {shortcuts.map(({ keys, action }) => (
            <div key={action} className="flex justify-between items-center py-1">
              <span className="flex gap-1">
                {keys.map((key, i) => (
                  <kbd
                    key={i}
                    className="px-2 py-1 bg-[var(--bg)] rounded text-sm font-mono"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
              <span className="text-[var(--ink-muted)] text-sm">{action}</span>
            </div>
          ))}
        </div>
      </section>

      {/* System Info */}
      <section className="card p-6">
        <h3 className="text-lg font-semibold mb-4">System Info</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex justify-between py-2 border-b border-[var(--border)]">
            <span className="text-[var(--ink-muted)]">API Status</span>
            <span className={apiError ? 'text-red-500' : 'text-green-500'}>
              {apiError ? 'Offline' : 'Online'}
            </span>
          </div>

          {healthResponse?.data?.version && (
            <div className="flex justify-between py-2 border-b border-[var(--border)]">
              <span className="text-[var(--ink-muted)]">Version</span>
              <span>{healthResponse.data.version}</span>
            </div>
          )}

          {stats && (
            <>
              <div className="flex justify-between py-2 border-b border-[var(--border)]">
                <span className="text-[var(--ink-muted)]">Total Units</span>
                <span>{stats.totalUnits.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[var(--border)]">
                <span className="text-[var(--ink-muted)]">Conversations</span>
                <span>{stats.totalConversations.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[var(--border)]">
                <span className="text-[var(--ink-muted)]">Tags</span>
                <span>{stats.totalTags.toLocaleString()}</span>
              </div>
            </>
          )}

          <div className="flex justify-between py-2 border-b border-[var(--border)]">
            <span className="text-[var(--ink-muted)]">Storage</span>
            <span>
              {localStorage.getItem('kb-preferences-storage') ? 'Preferences saved' : 'No data'}
            </span>
          </div>
        </div>
      </section>

      {/* Reset */}
      <section className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Reset</h3>
        <p className="text-[var(--ink-muted)] mb-4">
          Reset all preferences to their default values. This will not affect your knowledge base
          data.
        </p>
        <button onClick={resetToDefaults} className="btn-ghost text-red-500 hover:bg-red-500/10">
          Reset Preferences
        </button>
      </section>
    </div>
  );
}
