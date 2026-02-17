import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { validateGitHubPagesIndex } = await import('../scripts/github-pages-validate-core.mjs');

function writeFixture(payload: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'github-pages-validator-'));
  const filePath = join(dir, 'github-pages.json');
  writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return {
    filePath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function basePayload() {
  return {
    schemaVersion: 'github-pages-index.v2.1',
    syncCoreVersion: '2.1.0',
    generatedAt: new Date().toISOString(),
    owners: ['4444J99'],
    totalRepos: 1,
    syncStatus: 'ok',
    syncWarnings: [],
    stats: {
      ownersRequested: 1,
      reposDiscovered: 1,
      reposWithPages: 1,
      pagesResolved: 1,
      erroredRepos: 0,
      unreachableRepos: 0,
      warningCount: 0,
      apiRetries: 0,
      probeRetries: 0,
      retryAttempts: 4,
      repoConcurrency: 6,
      pagesConcurrency: 8,
      probeConcurrency: 8,
      probeTimeoutMs: 8000,
      discoverDurationMs: 10,
      pagesDurationMs: 10,
      probeDurationMs: 10,
      totalDurationMs: 30,
    },
    repos: [
      {
        owner: '4444J99',
        repo: 'portfolio',
        fullName: '4444J99/portfolio',
        repoUrl: 'https://github.com/4444J99/portfolio',
        pageUrl: 'https://4444j99.github.io/portfolio/',
        status: 'built',
        buildType: 'workflow',
        cname: null,
        sourceBranch: 'main',
        sourcePath: '/',
        updatedAt: new Date().toISOString(),
        featured: true,
        priority: 100,
        hidden: false,
        label: 'Portfolio',
        httpStatus: 200,
        reachable: true,
        redirectTarget: null,
        lastCheckedAt: new Date().toISOString(),
        probeMethod: 'head',
        probeLatencyMs: 40,
        lastError: null,
      },
    ],
  };
}

describe('github pages validator', () => {
  it('passes on a valid v2.1 fixture', () => {
    const fixture = writeFixture(basePayload());
    const result = validateGitHubPagesIndex({ inputPath: fixture.filePath });
    fixture.cleanup();

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails when duplicate fullName exists', () => {
    const payload = basePayload();
    payload.totalRepos = 2;
    payload.repos.push({ ...payload.repos[0], repo: 'portfolio-2' });

    const fixture = writeFixture(payload);
    const result = validateGitHubPagesIndex({ inputPath: fixture.filePath });
    fixture.cleanup();

    expect(result.ok).toBe(false);
    expect(result.errors.some((entry: string) => entry.includes('Duplicate fullName'))).toBe(true);
  });

  it('fails stale generatedAt against strict maxAgeHours', () => {
    const payload = basePayload();
    payload.generatedAt = '2020-01-01T00:00:00.000Z';

    const fixture = writeFixture(payload);
    const result = validateGitHubPagesIndex({ inputPath: fixture.filePath, maxAgeHours: 1 });
    fixture.cleanup();

    expect(result.ok).toBe(false);
    expect(result.errors.some((entry: string) => entry.includes('Data is stale'))).toBe(true);
  });

  it('fails invalid probeMethod when v2.1 telemetry is malformed', () => {
    const payload = basePayload();
    payload.repos[0].probeMethod = 'ping';

    const fixture = writeFixture(payload);
    const result = validateGitHubPagesIndex({ inputPath: fixture.filePath });
    fixture.cleanup();

    expect(result.ok).toBe(false);
    expect(result.errors.some((entry: string) => entry.includes('probeMethod'))).toBe(true);
  });
});
