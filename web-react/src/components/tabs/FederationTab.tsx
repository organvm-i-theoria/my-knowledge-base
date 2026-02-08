import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { federationApi } from '../../api/client';
import { useUIStore } from '../../stores/uiStore';
import type { FederatedSearchHit, FederatedSource } from '../../types';

function splitPatterns(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function FederationTab() {
  const queryClient = useQueryClient();
  const { addToast } = useUIStore();
  const [name, setName] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [includePatterns, setIncludePatterns] = useState('**/*');
  const [excludePatterns, setExcludePatterns] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSourceId, setSearchSourceId] = useState<string>('');
  const [searchResults, setSearchResults] = useState<FederatedSearchHit[]>([]);

  const sourcesQuery = useQuery({
    queryKey: ['federation-sources'],
    queryFn: () => federationApi.listSources(),
    staleTime: 15_000,
  });

  const sources = sourcesQuery.data?.data ?? [];

  useEffect(() => {
    if (!selectedSourceId && sources.length > 0) {
      setSelectedSourceId(sources[0].id);
    }
  }, [selectedSourceId, sources]);

  const scansQuery = useQuery({
    queryKey: ['federation-scans', selectedSourceId],
    queryFn: () => federationApi.listScans(selectedSourceId),
    enabled: selectedSourceId.length > 0,
    staleTime: 5_000,
  });

  const createSourceMutation = useMutation({
    mutationFn: () =>
      federationApi.createSource({
        name,
        rootPath,
        includePatterns: splitPatterns(includePatterns),
        excludePatterns: splitPatterns(excludePatterns),
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['federation-sources'] });
      addToast(`Source registered: ${response.data.name}`, 'success');
      setName('');
      setRootPath('');
      setIncludePatterns('**/*');
      setExcludePatterns('');
    },
    onError: (error: Error) => {
      addToast(error.message, 'error');
    },
  });

  const runScanMutation = useMutation({
    mutationFn: (sourceId: string) => federationApi.scanSource(sourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['federation-sources'] });
      queryClient.invalidateQueries({ queryKey: ['federation-scans', selectedSourceId] });
      addToast('Federated scan completed', 'success');
    },
    onError: (error: Error) => {
      addToast(error.message, 'error');
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ source }: { source: FederatedSource }) =>
      federationApi.updateSource(source.id, {
        status: source.status === 'active' ? 'disabled' : 'active',
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['federation-sources'] });
      addToast(`Source ${response.data.status === 'active' ? 'enabled' : 'disabled'}`, 'success');
    },
    onError: (error: Error) => {
      addToast(error.message, 'error');
    },
  });

  const searchMutation = useMutation({
    mutationFn: () =>
      federationApi.search(searchQuery, {
        sourceId: searchSourceId || undefined,
        limit: 25,
      }),
    onSuccess: (response) => {
      setSearchResults(response.data);
    },
    onError: (error: Error) => {
      addToast(error.message, 'error');
      setSearchResults([]);
    },
  });

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId),
    [selectedSourceId, sources]
  );

  const scans = scansQuery.data?.data ?? [];

  const onCreateSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createSourceMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Register Federated Source</h3>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={onCreateSource}>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--ink-muted)]">Name</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Local Engineering Docs"
              required
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--ink-muted)]">Root Path</span>
            <input
              className="input"
              value={rootPath}
              onChange={(event) => setRootPath(event.target.value)}
              placeholder="/Users/4jp/Documents/notes"
              required
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--ink-muted)]">Include Patterns</span>
            <input
              className="input"
              value={includePatterns}
              onChange={(event) => setIncludePatterns(event.target.value)}
              placeholder="**/*.md, **/*.txt"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--ink-muted)]">Exclude Patterns</span>
            <input
              className="input"
              value={excludePatterns}
              onChange={(event) => setExcludePatterns(event.target.value)}
              placeholder="**/node_modules/**, **/.git/**"
            />
          </label>
          <div className="md:col-span-2 flex justify-end">
            <button className="btn-primary" disabled={createSourceMutation.isPending} type="submit">
              {createSourceMutation.isPending ? 'Registering...' : 'Register Source'}
            </button>
          </div>
        </form>
      </section>

      <section className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Sources</h3>
          {sourcesQuery.isLoading && <span className="text-sm text-[var(--ink-muted)]">Loading...</span>}
        </div>

        {sources.length === 0 ? (
          <p className="text-[var(--ink-muted)]">No sources registered yet.</p>
        ) : (
          <div className="space-y-3">
            {sources.map((source) => (
              <div
                key={source.id}
                className={`border border-[var(--border)] rounded-lg p-4 ${
                  selectedSourceId === source.id ? 'bg-[var(--surface)]' : ''
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    className="text-left"
                    onClick={() => setSelectedSourceId(source.id)}
                    type="button"
                  >
                    <p className="font-medium">{source.name}</p>
                    <p className="text-sm text-[var(--ink-muted)]">{source.rootPath}</p>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className={`tag ${source.status === 'active' ? 'bg-emerald-700/20' : ''}`}>
                      {source.status}
                    </span>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => runScanMutation.mutate(source.id)}
                      disabled={runScanMutation.isPending || source.status !== 'active'}
                    >
                      Scan
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => toggleStatusMutation.mutate({ source })}
                      disabled={toggleStatusMutation.isPending}
                    >
                      {source.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Scan History</h3>
        {!selectedSource ? (
          <p className="text-[var(--ink-muted)]">Select a source to view scans.</p>
        ) : scans.length === 0 ? (
          <p className="text-[var(--ink-muted)]">No scan runs for this source yet.</p>
        ) : (
          <div className="space-y-2">
            {scans.map((scan) => (
              <div key={scan.id} className="flex items-center justify-between border border-[var(--border)] rounded p-3">
                <div>
                  <p className="font-medium">{scan.status}</p>
                  <p className="text-sm text-[var(--ink-muted)]">
                    scanned {scan.scannedCount} | indexed {scan.indexedCount} | skipped {scan.skippedCount}
                  </p>
                </div>
                <p className="text-sm text-[var(--ink-muted)]">{new Date(scan.startedAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Federated Search</h3>
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <input
            className="input flex-1"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search indexed external documents"
          />
          <select
            className="input md:w-64"
            value={searchSourceId}
            onChange={(event) => setSearchSourceId(event.target.value)}
          >
            <option value="">All Sources</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary"
            onClick={() => searchMutation.mutate()}
            disabled={searchMutation.isPending || searchQuery.trim().length === 0}
          >
            {searchMutation.isPending ? 'Searching...' : 'Search'}
          </button>
        </div>

        {searchResults.length === 0 ? (
          <p className="text-[var(--ink-muted)]">No federated search results yet.</p>
        ) : (
          <div className="space-y-3">
            {searchResults.map((result) => (
              <div key={result.id} className="border border-[var(--border)] rounded-lg p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="font-medium">{result.title}</p>
                  <span className="text-xs text-[var(--ink-muted)]">{result.sourceName}</span>
                </div>
                <p className="text-xs text-[var(--ink-muted)] mb-2">{result.path}</p>
                <p className="text-sm text-[var(--ink)]">{result.snippet}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
