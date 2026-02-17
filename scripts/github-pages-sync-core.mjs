import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const SYNC_CORE_VERSION = '2.1.0';
export const GITHUB_PAGES_SCHEMA_VERSION = 'github-pages-index.v2.1';

export const DEFAULT_OWNERS = [
  '4444J99',
  'organvm-i-theoria',
  'organvm-ii-poiesis',
  'organvm-iii-ergon',
  'organvm-iv-taxis',
  'organvm-v-logos',
  'organvm-vi-koinonia',
  'organvm-vii-kerygma',
  'meta-organvm',
];

const GITHUB_API_BASE = 'https://api.github.com';
const DEFAULT_RETRY_ATTEMPTS = 4;
const DEFAULT_REPO_CONCURRENCY = 6;
const DEFAULT_PAGES_CONCURRENCY = 8;
const DEFAULT_PROBE_CONCURRENCY = 8;
const DEFAULT_BACKOFF_BASE_MS = 250;
const DEFAULT_BACKOFF_MAX_MS = 3_000;

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const [urlPart, ...meta] = part.split(';').map((segment) => segment.trim());
    if (!urlPart?.startsWith('<') || !urlPart.endsWith('>')) continue;
    if (!meta.includes('rel="next"')) continue;
    return urlPart.slice(1, -1);
  }
  return null;
}

function createApiHeaders() {
  const token =
    (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()) ||
    (process.env.GH_TOKEN && process.env.GH_TOKEN.trim()) ||
    null;

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'github-pages-sync-core',
  };

  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function readJsonIfExists(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function normalizeNumber(value, fallback = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return value;
}

function normalizeStringOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizePositiveInt(value, fallback) {
  const normalized = Number.parseInt(String(value), 10);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

function normalizeCurationMap(curationPayload) {
  const rawOverrides =
    curationPayload &&
    typeof curationPayload === 'object' &&
    !Array.isArray(curationPayload) &&
    curationPayload.overrides &&
    typeof curationPayload.overrides === 'object' &&
    !Array.isArray(curationPayload.overrides)
      ? curationPayload.overrides
      : curationPayload && typeof curationPayload === 'object' && !Array.isArray(curationPayload)
      ? curationPayload
      : {};

  const entries = Object.entries(rawOverrides);
  const map = new Map();

  for (const [key, rawValue] of entries) {
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) continue;
    const override = {
      featured: normalizeBoolean(rawValue.featured, false),
      priority: normalizeNumber(rawValue.priority, 0),
      hidden: normalizeBoolean(
        rawValue.hidden !== undefined ? rawValue.hidden : rawValue.hide,
        false
      ),
      label: normalizeStringOrNull(rawValue.label),
    };
    map.set(key.toLowerCase(), override);
  }

  return map;
}

function compareRepoIdentity(a, b) {
  const ownerOrder = a.owner.localeCompare(b.owner, undefined, { sensitivity: 'base' });
  if (ownerOrder !== 0) return ownerOrder;
  return a.repo.localeCompare(b.repo, undefined, { sensitivity: 'base' });
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function shouldRetryStatus(status) {
  return status === 429 || status >= 500;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffMs(attempt, baseDelayMs, maxDelayMs) {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 100);
  return exponential + jitter;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
  return results;
}

async function fetchWithRetry(url, createRequest, {
  maxAttempts,
  baseDelayMs,
  maxDelayMs,
  retryableStatus = shouldRetryStatus,
}) {
  let retryCount = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let cleanup = null;
    try {
      const built = await createRequest(attempt);
      const request = built && typeof built === 'object' && 'request' in built ? built.request : built;
      cleanup = built && typeof built === 'object' && 'cleanup' in built ? built.cleanup : null;

      const response = await fetch(url, request);
      if (typeof cleanup === 'function') cleanup();

      if (attempt < maxAttempts && retryableStatus(response.status)) {
        retryCount += 1;
        await sleep(computeBackoffMs(attempt, baseDelayMs, maxDelayMs));
        continue;
      }

      return { ok: true, response, retryCount, attempts: attempt };
    } catch (error) {
      if (typeof cleanup === 'function') cleanup();
      if (attempt < maxAttempts) {
        retryCount += 1;
        await sleep(computeBackoffMs(attempt, baseDelayMs, maxDelayMs));
        continue;
      }
      return {
        ok: false,
        error: `Network error for ${url}: ${formatError(error)}`,
        retryCount,
        attempts: attempt,
      };
    }
  }

  return {
    ok: false,
    error: `Network error for ${url}: exhausted retries`,
    retryCount,
    attempts: maxAttempts,
  };
}

async function fetchPaginatedArray(url, headers, runtime) {
  const collected = [];
  let nextUrl = url;

  while (nextUrl) {
    const result = await fetchWithRetry(
      nextUrl,
      () => ({ request: { headers } }),
      {
        maxAttempts: runtime.retryAttempts,
        baseDelayMs: runtime.backoffBaseMs,
        maxDelayMs: runtime.backoffMaxMs,
      }
    );

    runtime.apiRetries += result.retryCount;

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
      };
    }

    const { response } = result;

    if (response.status === 404) return { ok: true, items: [] };

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return {
        ok: false,
        error: `GitHub API ${response.status} for ${nextUrl}${body ? `: ${body.slice(0, 220)}` : ''}`,
      };
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return { ok: false, error: `Expected array response for ${nextUrl}` };
    }

    collected.push(...payload);
    nextUrl = parseNextLink(response.headers.get('link'));
  }

  return { ok: true, items: collected };
}

async function fetchJsonObject(url, headers, runtime) {
  const result = await fetchWithRetry(
    url,
    () => ({ request: { headers } }),
    {
      maxAttempts: runtime.retryAttempts,
      baseDelayMs: runtime.backoffBaseMs,
      maxDelayMs: runtime.backoffMaxMs,
    }
  );

  runtime.apiRetries += result.retryCount;

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
    };
  }

  const { response } = result;

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      ok: false,
      error: `GitHub API ${response.status} for ${url}${body ? `: ${body.slice(0, 220)}` : ''}`,
    };
  }

  const payload = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: `Expected object response for ${url}` };
  }
  return { ok: true, payload };
}

async function fetchWithRetryAndTimeout(url, {
  method,
  headers,
  timeoutMs,
  maxAttempts,
  baseDelayMs,
  maxDelayMs,
}) {
  return fetchWithRetry(
    url,
    () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      return {
        request: {
          method,
          redirect: 'follow',
          signal: controller.signal,
          headers,
        },
        cleanup: () => clearTimeout(timer),
      };
    },
    {
      maxAttempts,
      baseDelayMs,
      maxDelayMs,
    }
  );
}

async function probePageHealth(pageUrl, runtime) {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();

  const probeHeaders = {
    'User-Agent': 'github-pages-health-probe',
  };

  const headResult = await fetchWithRetryAndTimeout(pageUrl, {
    method: 'HEAD',
    headers: probeHeaders,
    timeoutMs: runtime.probeTimeoutMs,
    maxAttempts: runtime.retryAttempts,
    baseDelayMs: runtime.backoffBaseMs,
    maxDelayMs: runtime.backoffMaxMs,
  });

  runtime.probeRetries += headResult.retryCount;

  if (headResult.ok && headResult.response.status < 400) {
    const status = Number.isFinite(headResult.response.status) ? headResult.response.status : null;
    const finalUrl = typeof headResult.response.url === 'string' ? headResult.response.url : '';
    return {
      httpStatus: status,
      reachable: status !== null && status >= 200 && status < 500,
      redirectTarget: finalUrl && finalUrl !== pageUrl ? finalUrl : null,
      lastCheckedAt: checkedAt,
      probeMethod: 'head',
      probeLatencyMs: Date.now() - startedAt,
      lastError: null,
      warning: null,
    };
  }

  let headFailure = null;
  if (headResult.ok) {
    headFailure = `HEAD returned ${headResult.response.status}`;
  } else {
    headFailure = headResult.error;
  }

  const getResult = await fetchWithRetryAndTimeout(pageUrl, {
    method: 'GET',
    headers: probeHeaders,
    timeoutMs: runtime.probeTimeoutMs,
    maxAttempts: runtime.retryAttempts,
    baseDelayMs: runtime.backoffBaseMs,
    maxDelayMs: runtime.backoffMaxMs,
  });

  runtime.probeRetries += getResult.retryCount;

  if (getResult.ok) {
    const status = Number.isFinite(getResult.response.status) ? getResult.response.status : null;
    const finalUrl = typeof getResult.response.url === 'string' ? getResult.response.url : '';
    return {
      httpStatus: status,
      reachable: status !== null && status >= 200 && status < 500,
      redirectTarget: finalUrl && finalUrl !== pageUrl ? finalUrl : null,
      lastCheckedAt: checkedAt,
      probeMethod: 'get',
      probeLatencyMs: Date.now() - startedAt,
      lastError: null,
      warning: headFailure ? `Probe fallback for ${pageUrl}: ${headFailure}` : null,
    };
  }

  return {
    httpStatus: null,
    reachable: false,
    redirectTarget: null,
    lastCheckedAt: checkedAt,
    probeMethod: 'get',
    probeLatencyMs: Date.now() - startedAt,
    lastError: getResult.error || headFailure || 'Probe failed',
    warning: headFailure ? `Probe fallback for ${pageUrl}: ${headFailure}` : null,
  };
}

function writeFallbackEnvelope(outputPath, existingPayload, errors, stats, logger) {
  if (!existingPayload || typeof existingPayload !== 'object' || Array.isArray(existingPayload)) {
    logger.warn(`Unable to annotate fallback metadata in ${outputPath}; existing payload is invalid.`);
    return;
  }

  const previousWarnings = Array.isArray(existingPayload.syncWarnings)
    ? existingPayload.syncWarnings.filter((entry) => typeof entry === 'string')
    : [];

  const syncWarnings = Array.from(new Set([...previousWarnings, ...errors])).slice(0, 200);
  const updated = {
    ...existingPayload,
    syncCoreVersion: SYNC_CORE_VERSION,
    syncStatus: 'fallback',
    syncWarnings,
    stats: {
      ...(existingPayload.stats && typeof existingPayload.stats === 'object' && !Array.isArray(existingPayload.stats)
        ? existingPayload.stats
        : {}),
      ...stats,
      fallbackAt: new Date().toISOString(),
    },
  };

  writeFileSync(outputPath, JSON.stringify(updated, null, 2) + '\n');
}

export async function syncGitHubPagesDirectory({
  owners,
  outputPath,
  strict = false,
  curationPath = null,
  probeTimeoutMs = 8000,
  retryAttempts = DEFAULT_RETRY_ATTEMPTS,
  repoConcurrency = DEFAULT_REPO_CONCURRENCY,
  pagesConcurrency = DEFAULT_PAGES_CONCURRENCY,
  probeConcurrency = DEFAULT_PROBE_CONCURRENCY,
  logger = console,
}) {
  if (!Array.isArray(owners) || owners.length === 0) {
    throw new Error('At least one owner is required.');
  }
  if (!outputPath) {
    throw new Error('outputPath is required.');
  }

  const startedAt = Date.now();
  const warnings = [];
  const errors = [];
  const runtime = {
    retryAttempts: normalizePositiveInt(retryAttempts, DEFAULT_RETRY_ATTEMPTS),
    repoConcurrency: normalizePositiveInt(repoConcurrency, DEFAULT_REPO_CONCURRENCY),
    pagesConcurrency: normalizePositiveInt(pagesConcurrency, DEFAULT_PAGES_CONCURRENCY),
    probeConcurrency: normalizePositiveInt(probeConcurrency, DEFAULT_PROBE_CONCURRENCY),
    probeTimeoutMs: normalizePositiveInt(probeTimeoutMs, 8000),
    backoffBaseMs: DEFAULT_BACKOFF_BASE_MS,
    backoffMaxMs: DEFAULT_BACKOFF_MAX_MS,
    apiRetries: 0,
    probeRetries: 0,
  };

  const headers = createApiHeaders();
  const curationPayload = readJsonIfExists(curationPath);
  const curationMap = normalizeCurationMap(curationPayload);
  const reposByFullName = new Map();

  const discoverStartedAt = Date.now();

  const endpointTasks = owners.flatMap((owner) => {
    const encodedOwner = encodeURIComponent(owner);
    return [
      `${GITHUB_API_BASE}/users/${encodedOwner}/repos?per_page=100&type=owner&sort=updated`,
      `${GITHUB_API_BASE}/orgs/${encodedOwner}/repos?per_page=100&type=public&sort=updated`,
    ];
  });

  const endpointResults = await mapWithConcurrency(
    endpointTasks,
    runtime.repoConcurrency,
    async (endpoint) => fetchPaginatedArray(endpoint, headers, runtime)
  );

  for (const result of endpointResults) {
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }

    for (const repo of result.items) {
      if (!repo || typeof repo !== 'object') continue;
      const fullName = typeof repo.full_name === 'string' ? repo.full_name : null;
      if (!fullName) continue;
      reposByFullName.set(fullName.toLowerCase(), repo);
    }
  }

  if (errors.length > 0) {
    logger.error('\nGitHub Pages sync encountered errors:');
    for (const error of errors) logger.error(`- ${error}`);

    if (strict || !existsSync(outputPath)) {
      return { ok: false, usedFallback: false, errors };
    }

    const fallbackStats = {
      ownersRequested: owners.length,
      reposDiscovered: reposByFullName.size,
      reposWithPages: 0,
      pagesResolved: 0,
      erroredRepos: 0,
      unreachableRepos: 0,
      warningCount: 0,
      apiRetries: runtime.apiRetries,
      probeRetries: runtime.probeRetries,
      retryAttempts: runtime.retryAttempts,
      repoConcurrency: runtime.repoConcurrency,
      pagesConcurrency: runtime.pagesConcurrency,
      probeConcurrency: runtime.probeConcurrency,
      probeTimeoutMs: runtime.probeTimeoutMs,
      discoverDurationMs: Date.now() - discoverStartedAt,
      pagesDurationMs: 0,
      probeDurationMs: 0,
      totalDurationMs: Date.now() - startedAt,
    };

    const existingPayload = readJsonIfExists(outputPath);
    writeFallbackEnvelope(outputPath, existingPayload, errors, fallbackStats, logger);

    logger.warn(`\nKeeping existing data at ${outputPath} (non-strict mode fallback).`);
    return { ok: true, usedFallback: true, errors };
  }

  const reposWithPages = Array.from(reposByFullName.values())
    .filter((repo) => repo?.has_pages === true)
    .sort((a, b) =>
      compareRepoIdentity(
        { owner: a?.owner?.login ?? '', repo: a?.name ?? '' },
        { owner: b?.owner?.login ?? '', repo: b?.name ?? '' }
      )
    );

  const discoverDurationMs = Date.now() - discoverStartedAt;

  const pagesStartedAt = Date.now();

  const pageInfoResults = await mapWithConcurrency(
    reposWithPages,
    runtime.pagesConcurrency,
    async (repo) => {
      const owner = repo?.owner?.login;
      const name = repo?.name;
      if (typeof owner !== 'string' || typeof name !== 'string') {
        return { ok: false, error: 'Repository missing owner/name fields.' };
      }

      const pagesUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pages`;
      const pagesResult = await fetchJsonObject(pagesUrl, headers, runtime);

      if (!pagesResult.ok) {
        return { ok: false, error: pagesResult.error };
      }

      const pages = pagesResult.payload;
      const pageUrl = typeof pages.html_url === 'string' ? pages.html_url : null;
      if (!pageUrl) {
        return { ok: false, error: `Missing html_url in Pages response for ${owner}/${name}` };
      }

      const fullName = `${owner}/${name}`;
      const curation = curationMap.get(fullName.toLowerCase()) ?? {
        featured: false,
        priority: 0,
        hidden: false,
        label: null,
      };

      return {
        ok: true,
        pageInfo: {
          owner,
          repo: name,
          fullName,
          repoUrl:
            typeof repo.html_url === 'string' ? repo.html_url : `https://github.com/${fullName}`,
          pageUrl,
          status: pages.status ?? null,
          buildType: pages.build_type ?? null,
          cname: pages.cname ?? null,
          sourceBranch: pages.source?.branch ?? null,
          sourcePath: pages.source?.path ?? null,
          updatedAt: repo.updated_at ?? null,
          featured: curation.featured,
          priority: curation.priority,
          hidden: curation.hidden,
          label: curation.label,
        },
      };
    }
  );

  const pageInfos = [];

  for (const result of pageInfoResults) {
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    pageInfos.push(result.pageInfo);
  }

  if (errors.length > 0) {
    logger.error('\nGitHub Pages sync encountered errors:');
    for (const error of errors) logger.error(`- ${error}`);

    if (strict || !existsSync(outputPath)) {
      return { ok: false, usedFallback: false, errors };
    }

    const fallbackStats = {
      ownersRequested: owners.length,
      reposDiscovered: reposByFullName.size,
      reposWithPages: reposWithPages.length,
      pagesResolved: 0,
      erroredRepos: 0,
      unreachableRepos: 0,
      warningCount: 0,
      apiRetries: runtime.apiRetries,
      probeRetries: runtime.probeRetries,
      retryAttempts: runtime.retryAttempts,
      repoConcurrency: runtime.repoConcurrency,
      pagesConcurrency: runtime.pagesConcurrency,
      probeConcurrency: runtime.probeConcurrency,
      probeTimeoutMs: runtime.probeTimeoutMs,
      discoverDurationMs,
      pagesDurationMs: Date.now() - pagesStartedAt,
      probeDurationMs: 0,
      totalDurationMs: Date.now() - startedAt,
    };

    const existingPayload = readJsonIfExists(outputPath);
    writeFallbackEnvelope(outputPath, existingPayload, errors, fallbackStats, logger);

    logger.warn(`\nKeeping existing data at ${outputPath} (non-strict mode fallback).`);
    return { ok: true, usedFallback: true, errors };
  }

  const pagesDurationMs = Date.now() - pagesStartedAt;

  const probeStartedAt = Date.now();

  const probeResults = await mapWithConcurrency(
    pageInfos,
    runtime.probeConcurrency,
    async (pageInfo) => {
      const health = await probePageHealth(pageInfo.pageUrl, runtime);
      return { pageInfo, health };
    }
  );

  const normalizedRepos = [];

  for (const { pageInfo, health } of probeResults) {
    if (health.warning) warnings.push(health.warning);

    normalizedRepos.push({
      ...pageInfo,
      httpStatus: health.httpStatus,
      reachable: health.reachable,
      redirectTarget: health.redirectTarget,
      lastCheckedAt: health.lastCheckedAt,
      probeMethod: health.probeMethod,
      probeLatencyMs: health.probeLatencyMs,
      lastError: health.lastError,
    });
  }

  normalizedRepos.sort(compareRepoIdentity);

  const probeDurationMs = Date.now() - probeStartedAt;
  const syncWarnings = Array.from(new Set(warnings)).slice(0, 200);

  const stats = {
    ownersRequested: owners.length,
    reposDiscovered: reposByFullName.size,
    reposWithPages: reposWithPages.length,
    pagesResolved: normalizedRepos.length,
    erroredRepos: normalizedRepos.filter((repo) => repo.status === 'errored').length,
    unreachableRepos: normalizedRepos.filter((repo) => repo.reachable === false).length,
    warningCount: syncWarnings.length,
    apiRetries: runtime.apiRetries,
    probeRetries: runtime.probeRetries,
    retryAttempts: runtime.retryAttempts,
    repoConcurrency: runtime.repoConcurrency,
    pagesConcurrency: runtime.pagesConcurrency,
    probeConcurrency: runtime.probeConcurrency,
    probeTimeoutMs: runtime.probeTimeoutMs,
    discoverDurationMs,
    pagesDurationMs,
    probeDurationMs,
    totalDurationMs: Date.now() - startedAt,
  };

  const output = {
    schemaVersion: GITHUB_PAGES_SCHEMA_VERSION,
    syncCoreVersion: SYNC_CORE_VERSION,
    generatedAt: new Date().toISOString(),
    owners,
    totalRepos: normalizedRepos.length,
    syncStatus: 'ok',
    syncWarnings,
    stats,
    repos: normalizedRepos,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');

  return {
    ok: true,
    usedFallback: false,
    totalRepos: output.totalRepos,
    outputPath,
    errors: [],
  };
}
