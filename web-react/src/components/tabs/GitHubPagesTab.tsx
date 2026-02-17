import { useMemo, useState } from 'react';
import pagesDirectoryData from '../../data/github-pages.json';
import type { GitHubPagesDirectory, GitHubPagesRepo } from '../../types';

interface ClickRecord {
  owner: string;
  repo: string;
  fullName: string;
  target: 'page' | 'repo';
  surface: string;
  count: number;
  lastClickedAt: string;
}

const CLICK_STORAGE_KEY = 'kb_github_pages_clicks';
const pagesDirectory = pagesDirectoryData as GitHubPagesDirectory;
type ClickRecordMap = Record<string, ClickRecord>;

function formatDate(value: string | null) {
  if (!value) return 'n/a';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleString();
}

function normalizeClickRecord(value: unknown): ClickRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;

  const valid =
    typeof candidate.owner === 'string' &&
    typeof candidate.repo === 'string' &&
    typeof candidate.fullName === 'string' &&
    (candidate.target === 'page' || candidate.target === 'repo') &&
    typeof candidate.count === 'number' &&
    Number.isFinite(candidate.count) &&
    typeof candidate.lastClickedAt === 'string';

  if (!valid) return null;

  return {
    owner: candidate.owner as string,
    repo: candidate.repo as string,
    fullName: candidate.fullName as string,
    target: candidate.target as 'page' | 'repo',
    surface: typeof candidate.surface === 'string' ? candidate.surface : 'unknown',
    count: candidate.count as number,
    lastClickedAt: candidate.lastClickedAt as string,
  };
}

function parseClickRecordMap(raw: string | null): ClickRecordMap {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const sanitized: ClickRecordMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const normalized = normalizeClickRecord(value);
      if (normalized) sanitized[key] = normalized;
    }

    return sanitized;
  } catch {
    return {};
  }
}

function readClickRecords(): ClickRecord[] {
  if (typeof window === 'undefined') return [];

  return Object.values(parseClickRecordMap(window.localStorage.getItem(CLICK_STORAGE_KEY)));
}

function trackOutboundClick(repo: GitHubPagesRepo, target: 'page' | 'repo') {
  if (typeof window === 'undefined') return;

  try {
    const parsed = parseClickRecordMap(window.localStorage.getItem(CLICK_STORAGE_KEY));

    const key = `${repo.fullName}:${target}`;
    const previous = parsed[key] ?? {
      owner: repo.owner,
      repo: repo.repo,
      fullName: repo.fullName,
      target,
      surface: 'github-pages-tab',
      count: 0,
      lastClickedAt: null,
    };

    parsed[key] = {
      owner: repo.owner,
      repo: repo.repo,
      fullName: repo.fullName,
      target,
      surface: 'github-pages-tab',
      count: Number(previous.count || 0) + 1,
      lastClickedAt: new Date().toISOString(),
    };

    window.localStorage.setItem(CLICK_STORAGE_KEY, JSON.stringify(parsed));
    window.dispatchEvent(
      new CustomEvent('kb:outbound-link-click', {
        detail: { owner: repo.owner, repo: repo.repo, target, surface: 'github-pages-tab' },
      })
    );
  } catch {
    // no-op
  }
}

export function GitHubPagesTab() {
  const [query, setQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<'all' | string>('all');
  const [showHidden, setShowHidden] = useState(false);
  const [clickVersion, setClickVersion] = useState(0);

  const generatedAtMs = Number.isFinite(Date.parse(pagesDirectory.generatedAt))
    ? Date.parse(pagesDirectory.generatedAt)
    : null;
  const ageHours = generatedAtMs === null ? null : (Date.now() - generatedAtMs) / (1000 * 60 * 60);
  const stale = ageHours !== null && ageHours > 48;

  const ownerOrder = useMemo(
    () => new Map(pagesDirectory.owners.map((owner, index) => [owner.toLowerCase(), index])),
    []
  );

  const visibleRepos = useMemo(
    () => pagesDirectory.repos.filter((repo) => showHidden || !repo.hidden),
    [showHidden]
  );

  const builtCount = visibleRepos.filter((repo) => repo.status === 'built').length;
  const erroredCount = visibleRepos.filter((repo) => repo.status === 'errored').length;
  const erroredRepos = visibleRepos.filter((repo) => repo.status === 'errored');
  const unreachableCount = visibleRepos.filter((repo) => repo.reachable === false).length;
  const recentlyChangedCount = visibleRepos.filter((repo) => {
    if (!repo.updatedAt || !Number.isFinite(Date.parse(repo.updatedAt))) return false;
    return Date.now() - Date.parse(repo.updatedAt) <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  const ownerOptions = useMemo(() => {
    const owners = new Set<string>(pagesDirectory.owners);
    for (const repo of pagesDirectory.repos) owners.add(repo.owner);
    return Array.from(owners).sort((a, b) => {
      const aOrder = ownerOrder.get(a.toLowerCase());
      const bOrder = ownerOrder.get(b.toLowerCase());
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
      if (aOrder !== undefined) return -1;
      if (bOrder !== undefined) return 1;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  }, [ownerOrder]);

  const filteredRepos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return visibleRepos
      .filter((repo) => {
        if (ownerFilter !== 'all' && repo.owner !== ownerFilter) return false;
        if (!normalizedQuery) return true;

        const haystack = [
          repo.fullName,
          repo.owner,
          repo.repo,
          repo.repoUrl,
          repo.pageUrl,
          repo.label ?? '',
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(normalizedQuery);
      })
      .sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          b.priority - a.priority ||
          a.owner.localeCompare(b.owner, undefined, { sensitivity: 'base' }) ||
          a.repo.localeCompare(b.repo, undefined, { sensitivity: 'base' })
      );
  }, [ownerFilter, query, visibleRepos]);

  const featuredRepos = useMemo(
    () => filteredRepos.filter((repo) => repo.featured).slice(0, 8),
    [filteredRepos]
  );

  const groupedRepos = useMemo(() => {
    const grouped = new Map<string, GitHubPagesRepo[]>();

    for (const repo of filteredRepos) {
      if (!grouped.has(repo.owner)) grouped.set(repo.owner, []);
      grouped.get(repo.owner)?.push(repo);
    }

    return Array.from(grouped.entries()).sort((a, b) => {
      const aOrder = ownerOrder.get(a[0].toLowerCase());
      const bOrder = ownerOrder.get(b[0].toLowerCase());
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
      if (aOrder !== undefined) return -1;
      if (bOrder !== undefined) return 1;
      return a[0].localeCompare(b[0], undefined, { sensitivity: 'base' });
    });
  }, [filteredRepos, ownerOrder]);

  const clickLeaders = useMemo(() => {
    const records = readClickRecords();
    return records
      .sort((a, b) => b.count - a.count || b.lastClickedAt.localeCompare(a.lastClickedAt))
      .slice(0, 5);
  }, [clickVersion]);

  const handleOutboundClick = (repo: GitHubPagesRepo, target: 'page' | 'repo') => {
    trackOutboundClick(repo, target);
    setClickVersion((value) => value + 1);
  };

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h3 className="text-lg font-semibold">GitHub Pages Directory</h3>
        <p className="text-sm text-[var(--ink-muted)] mt-2">
          System Pages Health: all Pages repos with curation, telemetry, and outbound-click analytics.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mt-4">
          <div className="rounded-xl bg-[var(--bg)] p-3">
            <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Visible</p>
            <p className="text-xl font-semibold">{visibleRepos.length}</p>
          </div>
          <div className="rounded-xl bg-[var(--bg)] p-3">
            <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Built</p>
            <p className="text-xl font-semibold">{builtCount}</p>
          </div>
          <div className="rounded-xl bg-[var(--bg)] p-3">
            <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Errored</p>
            <p className="text-xl font-semibold">{erroredCount}</p>
          </div>
          <div className="rounded-xl bg-[var(--bg)] p-3">
            <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Unreachable</p>
            <p className="text-xl font-semibold">{unreachableCount}</p>
          </div>
          <div className="rounded-xl bg-[var(--bg)] p-3">
            <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Updated 7d</p>
            <p className="text-xl font-semibold">{recentlyChangedCount}</p>
          </div>
          <div className="rounded-xl bg-[var(--bg)] p-3">
            <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Sync Age</p>
            <p className="text-sm font-semibold">
              {ageHours === null ? 'n/a' : `${ageHours.toFixed(2)}h`}
              {stale ? ' (stale)' : ''}
            </p>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h4 className="text-base font-semibold">Why this matters</h4>
        <p className="text-sm text-[var(--ink-muted)] mt-2">
          This directory is a live reliability surface for all tracked GitHub Pages deployments. Use it to detect
          regressions before link rot reaches users.
        </p>
        {erroredRepos.length > 0 && (
          <div className="mt-3">
            <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
              Actionable diagnostics ({erroredRepos.length})
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {erroredRepos.map((repo) => (
                <li key={`diag-${repo.fullName}`} className="text-[var(--ink-muted)]">
                  <a
                    href={repo.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--ink)]"
                    onClick={() => handleOutboundClick(repo, 'repo')}
                  >
                    {repo.fullName}
                  </a>
                  {' · '}
                  <a
                    href={repo.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--ink)]"
                    onClick={() => handleOutboundClick(repo, 'page')}
                  >
                    open page
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card p-6">
        <div className="flex flex-col md:flex-row gap-3">
          <label className="flex-1">
            <span className="text-sm text-[var(--ink-muted)] block mb-1">Search</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="input w-full"
              placeholder="Filter by owner, repo, URL, or curated label"
            />
          </label>
          <label className="w-full md:w-64">
            <span className="text-sm text-[var(--ink-muted)] block mb-1">Owner</span>
            <select
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
              className="input w-full"
            >
              <option value="all">All owners</option>
              {ownerOptions.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
          </label>
          <label className="w-full md:w-40">
            <span className="text-sm text-[var(--ink-muted)] block mb-1">Visibility</span>
            <button
              type="button"
              onClick={() => setShowHidden((value) => !value)}
              className="btn-ghost w-full h-[42px]"
            >
              {showHidden ? 'Hide hidden' : 'Show hidden'}
            </button>
          </label>
        </div>
      </section>

      {clickLeaders.length > 0 && (
        <section className="card p-6">
          <h4 className="text-base font-semibold mb-3">Top Clicked (This Browser)</h4>
          <ul className="space-y-2 text-sm">
            {clickLeaders.map((entry) => (
              <li key={`${entry.fullName}:${entry.target}`} className="flex justify-between gap-3">
                <span className="text-[var(--ink-muted)]">
                  {entry.fullName} · {entry.target} · {entry.surface}
                </span>
                <span className="font-medium">{entry.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {featuredRepos.length > 0 && (
        <section className="card p-6">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h4 className="text-base font-semibold">Featured</h4>
            <span className="text-sm text-[var(--ink-muted)]">{featuredRepos.length} highlighted</span>
          </div>
          <div className="space-y-3">
            {featuredRepos.map((repo) => (
              <article
                key={`featured-${repo.fullName}`}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={repo.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[var(--accent-3)] hover:underline"
                    onClick={() => handleOutboundClick(repo, 'page')}
                  >
                    {repo.label ?? repo.fullName}
                  </a>
                  <a
                    href={repo.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    onClick={() => handleOutboundClick(repo, 'repo')}
                  >
                    Repository
                  </a>
                  <span className="text-xs text-[var(--ink-muted)]">priority {repo.priority}</span>
                  {repo.probeMethod && (
                    <span className="text-xs text-[var(--ink-muted)]">probe {repo.probeMethod}</span>
                  )}
                  {repo.probeLatencyMs !== null && repo.probeLatencyMs !== undefined && (
                    <span className="text-xs text-[var(--ink-muted)]">{repo.probeLatencyMs}ms</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {groupedRepos.length === 0 ? (
        <section className="card p-6">
          <p className="text-sm text-[var(--ink-muted)]">No repositories match this filter.</p>
        </section>
      ) : (
        groupedRepos.map(([owner, repos]) => (
          <section key={owner} className="card p-6">
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h4 className="text-base font-semibold">{owner}</h4>
              <span className="text-sm text-[var(--ink-muted)]">
                {repos.length} repo{repos.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-3">
              {repos.map((repo) => (
                <article
                  key={repo.fullName}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      href={repo.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[var(--accent-3)] hover:underline"
                      onClick={() => handleOutboundClick(repo, 'page')}
                    >
                      {repo.label ?? repo.fullName}
                    </a>
                    <a
                      href={repo.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]"
                      onClick={() => handleOutboundClick(repo, 'repo')}
                    >
                      Repository
                    </a>
                    {repo.updatedAt && (
                      <span className="text-xs text-[var(--ink-muted)]">updated {formatDate(repo.updatedAt)}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3 text-xs">
                    {repo.featured && (
                      <span className="px-2 py-1 rounded-full border border-[var(--border)]">featured</span>
                    )}
                    {repo.status && (
                      <span
                        className={`px-2 py-1 rounded-full border ${
                          repo.status === 'errored' ? 'border-red-600 text-red-600' : 'border-[var(--border)]'
                        }`}
                      >
                        status: {repo.status}
                      </span>
                    )}
                    {repo.buildType && (
                      <span className="px-2 py-1 rounded-full border border-[var(--border)]">
                        build: {repo.buildType}
                      </span>
                    )}
                    {repo.cname && (
                      <span className="px-2 py-1 rounded-full border border-[var(--border)]">
                        cname: {repo.cname}
                      </span>
                    )}
                    {repo.sourceBranch && (
                      <span className="px-2 py-1 rounded-full border border-[var(--border)]">
                        source: {repo.sourceBranch}
                        {repo.sourcePath && repo.sourcePath !== '/' ? `:${repo.sourcePath}` : ''}
                      </span>
                    )}
                    {repo.httpStatus !== null && (
                      <span
                        className={`px-2 py-1 rounded-full border ${
                          repo.reachable ? 'border-[var(--border)]' : 'border-red-600 text-red-600'
                        }`}
                      >
                        http: {repo.httpStatus}
                      </span>
                    )}
                    {repo.probeMethod && (
                      <span className="px-2 py-1 rounded-full border border-[var(--border)]">
                        probe: {repo.probeMethod}
                      </span>
                    )}
                    {repo.probeLatencyMs !== null && repo.probeLatencyMs !== undefined && (
                      <span className="px-2 py-1 rounded-full border border-[var(--border)]">
                        latency: {repo.probeLatencyMs}ms
                      </span>
                    )}
                    {repo.redirectTarget && (
                      <span className="px-2 py-1 rounded-full border border-[var(--border)]">
                        redirected
                      </span>
                    )}
                    {repo.lastError && (
                      <span className="px-2 py-1 rounded-full border border-red-600 text-red-600">
                        probe-error
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
