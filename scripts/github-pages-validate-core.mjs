import { readFileSync } from 'node:fs';

const SUPPORTED_SCHEMA_VERSIONS = new Set([
  'github-pages-index.v2',
  'github-pages-index.v2.1',
]);

function isString(value) {
  return typeof value === 'string';
}

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

function isNullableNumber(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isFiniteDateString(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function compareRepoIdentity(a, b) {
  const ownerOrder = a.owner.localeCompare(b.owner, undefined, { sensitivity: 'base' });
  if (ownerOrder !== 0) return ownerOrder;
  return a.repo.localeCompare(b.repo, undefined, { sensitivity: 'base' });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateOptionalNumberField(value, key, errors) {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    errors.push(`${key} must be a finite number >= 0.`);
  }
}

export function validateGitHubPagesIndex({
  inputPath,
  maxAgeHours = 48,
  maxErrored = 25,
  maxUnreachable = 25,
}) {
  const errors = [];
  const warnings = [];
  let payload;

  try {
    payload = JSON.parse(readFileSync(inputPath, 'utf-8'));
  } catch (error) {
    return {
      ok: false,
      errors: [
        `Failed to read/parse ${inputPath}: ${error instanceof Error ? error.message : String(error)}`,
      ],
      warnings,
      summary: null,
    };
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    errors.push('Top-level JSON must be an object.');
  }

  if (!isFiniteDateString(payload?.generatedAt)) {
    errors.push('generatedAt must be a valid ISO date string.');
  }
  if (!Array.isArray(payload?.owners)) {
    errors.push('owners must be an array.');
  }
  if (!Array.isArray(payload?.repos)) {
    errors.push('repos must be an array.');
  }
  if (typeof payload?.totalRepos !== 'number') {
    errors.push('totalRepos must be a number.');
  }

  if (payload?.schemaVersion !== undefined) {
    if (!isString(payload.schemaVersion)) {
      errors.push('schemaVersion must be a string when provided.');
    } else if (!SUPPORTED_SCHEMA_VERSIONS.has(payload.schemaVersion)) {
      warnings.push(
        `schemaVersion ${payload.schemaVersion} is not in supported set (${Array.from(
          SUPPORTED_SCHEMA_VERSIONS
        ).join(', ')}).`
      );
    }
  } else {
    warnings.push('schemaVersion is missing.');
  }

  if (payload?.syncStatus !== undefined) {
    if (!isString(payload.syncStatus)) {
      errors.push('syncStatus must be a string when provided.');
    } else if (!['ok', 'fallback'].includes(payload.syncStatus)) {
      warnings.push(`syncStatus is ${payload.syncStatus} (expected 'ok' or 'fallback').`);
    }
  }

  if (payload?.syncWarnings !== undefined) {
    if (!Array.isArray(payload.syncWarnings)) {
      errors.push('syncWarnings must be an array when provided.');
    } else if (!payload.syncWarnings.every((entry) => typeof entry === 'string')) {
      errors.push('syncWarnings entries must all be strings.');
    }
  }

  if (payload?.stats !== undefined) {
    if (!isObject(payload.stats)) {
      errors.push('stats must be an object when provided.');
    } else {
      const numericKeys = [
        'ownersRequested',
        'reposDiscovered',
        'reposWithPages',
        'pagesResolved',
        'erroredRepos',
        'unreachableRepos',
        'warningCount',
        'apiRetries',
        'probeRetries',
        'retryAttempts',
        'repoConcurrency',
        'pagesConcurrency',
        'probeConcurrency',
        'probeTimeoutMs',
        'discoverDurationMs',
        'pagesDurationMs',
        'probeDurationMs',
        'totalDurationMs',
      ];

      for (const key of numericKeys) {
        validateOptionalNumberField(payload.stats[key], `stats.${key}`, errors);
      }

      if (
        payload.stats.fallbackAt !== undefined &&
        !isFiniteDateString(payload.stats.fallbackAt)
      ) {
        errors.push('stats.fallbackAt must be a valid ISO date string when provided.');
      }
    }
  }

  const repos = Array.isArray(payload?.repos) ? payload.repos : [];

  if (typeof payload?.totalRepos === 'number' && payload.totalRepos !== repos.length) {
    errors.push(`totalRepos mismatch: ${payload.totalRepos} !== repos.length (${repos.length})`);
  }

  const seenFullNames = new Set();

  for (let index = 0; index < repos.length; index += 1) {
    const repo = repos[index];
    const prefix = `repos[${index}]`;

    if (!repo || typeof repo !== 'object' || Array.isArray(repo)) {
      errors.push(`${prefix} must be an object.`);
      continue;
    }

    if (!isString(repo.owner)) errors.push(`${prefix}.owner must be a string.`);
    if (!isString(repo.repo)) errors.push(`${prefix}.repo must be a string.`);
    if (!isString(repo.fullName)) errors.push(`${prefix}.fullName must be a string.`);
    if (!isString(repo.repoUrl) || !repo.repoUrl.startsWith('https://')) {
      errors.push(`${prefix}.repoUrl must be an https URL.`);
    }
    if (!isString(repo.pageUrl) || !repo.pageUrl.startsWith('https://')) {
      errors.push(`${prefix}.pageUrl must be an https URL.`);
    }
    if (!isNullableString(repo.status)) errors.push(`${prefix}.status must be string|null.`);
    if (!isNullableString(repo.buildType)) errors.push(`${prefix}.buildType must be string|null.`);
    if (!isNullableString(repo.cname)) errors.push(`${prefix}.cname must be string|null.`);
    if (!isNullableString(repo.sourceBranch)) errors.push(`${prefix}.sourceBranch must be string|null.`);
    if (!isNullableString(repo.sourcePath)) errors.push(`${prefix}.sourcePath must be string|null.`);
    if (!isNullableString(repo.updatedAt)) errors.push(`${prefix}.updatedAt must be string|null.`);
    if (typeof repo.featured !== 'boolean') errors.push(`${prefix}.featured must be boolean.`);
    if (typeof repo.priority !== 'number' || !Number.isFinite(repo.priority)) {
      errors.push(`${prefix}.priority must be a finite number.`);
    }
    if (typeof repo.hidden !== 'boolean') errors.push(`${prefix}.hidden must be boolean.`);
    if (!isNullableString(repo.label)) errors.push(`${prefix}.label must be string|null.`);
    if (!isNullableNumber(repo.httpStatus)) errors.push(`${prefix}.httpStatus must be number|null.`);
    if (typeof repo.reachable !== 'boolean') errors.push(`${prefix}.reachable must be boolean.`);
    if (!isNullableString(repo.redirectTarget)) errors.push(`${prefix}.redirectTarget must be string|null.`);
    if (!isFiniteDateString(repo.lastCheckedAt)) {
      errors.push(`${prefix}.lastCheckedAt must be a valid ISO date.`);
    }

    if (repo.probeMethod !== undefined) {
      if (!isNullableString(repo.probeMethod)) {
        errors.push(`${prefix}.probeMethod must be string|null when provided.`);
      } else if (repo.probeMethod !== null && !['head', 'get'].includes(repo.probeMethod)) {
        errors.push(`${prefix}.probeMethod must be 'head' or 'get' when present.`);
      }
    }

    if (repo.probeLatencyMs !== undefined) {
      if (!isNullableNumber(repo.probeLatencyMs)) {
        errors.push(`${prefix}.probeLatencyMs must be number|null when provided.`);
      } else if (typeof repo.probeLatencyMs === 'number' && repo.probeLatencyMs < 0) {
        errors.push(`${prefix}.probeLatencyMs must be >= 0.`);
      }
    }

    if (repo.lastError !== undefined && !isNullableString(repo.lastError)) {
      errors.push(`${prefix}.lastError must be string|null when provided.`);
    }

    if (isString(repo.fullName)) {
      const key = repo.fullName.toLowerCase();
      if (seenFullNames.has(key)) errors.push(`Duplicate fullName detected: ${repo.fullName}`);
      seenFullNames.add(key);
    }
  }

  for (let i = 1; i < repos.length; i += 1) {
    const prev = repos[i - 1];
    const current = repos[i];
    if (
      !prev ||
      !current ||
      !isString(prev.owner) ||
      !isString(prev.repo) ||
      !isString(current.owner) ||
      !isString(current.repo)
    ) {
      continue;
    }
    if (compareRepoIdentity(prev, current) > 0) {
      errors.push('repos must be sorted deterministically by owner then repo.');
      break;
    }
  }

  const generatedAtMs = isFiniteDateString(payload?.generatedAt)
    ? Date.parse(payload.generatedAt)
    : null;
  const ageHours = generatedAtMs === null ? null : (Date.now() - generatedAtMs) / (1000 * 60 * 60);
  const stale = ageHours !== null && ageHours > maxAgeHours;
  if (stale) {
    errors.push(
      `Data is stale: generatedAt is ${ageHours.toFixed(2)}h old (max ${maxAgeHours}h).`
    );
  }

  const erroredCount = repos.filter((repo) => repo?.status === 'errored').length;
  if (erroredCount > maxErrored) {
    errors.push(`Errored repos ${erroredCount} exceed threshold ${maxErrored}.`);
  }

  const unreachableCount = repos.filter((repo) => repo?.reachable === false).length;
  if (unreachableCount > maxUnreachable) {
    errors.push(`Unreachable repos ${unreachableCount} exceed threshold ${maxUnreachable}.`);
  }

  const builtCount = repos.filter((repo) => repo?.status === 'built').length;
  const recentlyChangedCount = repos.filter((repo) => {
    if (!isFiniteDateString(repo?.updatedAt)) return false;
    const ageMs = Date.now() - Date.parse(repo.updatedAt);
    return ageMs <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalRepos: repos.length,
      builtCount,
      erroredCount,
      unreachableCount,
      recentlyChangedCount,
      stale,
      ageHours,
      maxAgeHours,
      maxErrored,
      maxUnreachable,
    },
  };
}
