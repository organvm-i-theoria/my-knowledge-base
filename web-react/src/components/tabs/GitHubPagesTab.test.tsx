import { beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const fixture = {
  schemaVersion: 'github-pages-index.v2.1',
  syncCoreVersion: '2.1.0',
  generatedAt: '2026-02-17T00:00:00.000Z',
  owners: ['4444J99', 'organvm-i-theoria'],
  totalRepos: 3,
  syncStatus: 'ok',
  syncWarnings: [],
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
      updatedAt: '2026-02-16T00:00:00.000Z',
      featured: true,
      priority: 100,
      hidden: false,
      label: 'Portfolio',
      httpStatus: 200,
      reachable: true,
      redirectTarget: null,
      lastCheckedAt: '2026-02-17T00:00:00.000Z',
      probeMethod: 'head',
      probeLatencyMs: 32,
      lastError: null,
    },
    {
      owner: 'organvm-i-theoria',
      repo: 'my-knowledge-base',
      fullName: 'organvm-i-theoria/my-knowledge-base',
      repoUrl: 'https://github.com/organvm-i-theoria/my-knowledge-base',
      pageUrl: 'https://organvm-i-theoria.github.io/my-knowledge-base/',
      status: 'errored',
      buildType: 'workflow',
      cname: null,
      sourceBranch: 'master',
      sourcePath: '/',
      updatedAt: '2026-02-15T00:00:00.000Z',
      featured: true,
      priority: 95,
      hidden: false,
      label: 'Knowledge Base',
      httpStatus: 200,
      reachable: true,
      redirectTarget: null,
      lastCheckedAt: '2026-02-17T00:00:00.000Z',
      probeMethod: 'get',
      probeLatencyMs: 48,
      lastError: null,
    },
    {
      owner: 'organvm-i-theoria',
      repo: 'hidden-repo',
      fullName: 'organvm-i-theoria/hidden-repo',
      repoUrl: 'https://github.com/organvm-i-theoria/hidden-repo',
      pageUrl: 'https://organvm-i-theoria.github.io/hidden-repo/',
      status: 'built',
      buildType: 'legacy',
      cname: null,
      sourceBranch: 'main',
      sourcePath: '/',
      updatedAt: '2026-02-14T00:00:00.000Z',
      featured: false,
      priority: 0,
      hidden: true,
      label: null,
      httpStatus: 200,
      reachable: true,
      redirectTarget: null,
      lastCheckedAt: '2026-02-17T00:00:00.000Z',
      probeMethod: 'head',
      probeLatencyMs: 25,
      lastError: null,
    },
  ],
};

vi.mock('../../data/github-pages.json', () => ({
  default: fixture,
}));

let GitHubPagesTab: typeof import('./GitHubPagesTab').GitHubPagesTab;

beforeAll(async () => {
  ({ GitHubPagesTab } = await import('./GitHubPagesTab'));
});

describe('GitHubPagesTab', () => {
  it('renders health summary, diagnostics, and featured section', () => {
    const html = renderToStaticMarkup(<GitHubPagesTab />);

    expect(html).toContain('GitHub Pages Directory');
    expect(html).toContain('System Pages Health');
    expect(html).toContain('Why this matters');
    expect(html).toContain('Actionable diagnostics (1)');
    expect(html).toContain('Featured');
    expect(html).toContain('Portfolio');
    expect(html).toContain('Knowledge Base');
  });

  it('renders search and owner filter controls', () => {
    const html = renderToStaticMarkup(<GitHubPagesTab />);

    expect(html).toContain('placeholder="Filter by owner, repo, URL, or curated label"');
    expect(html).toContain('All owners');
    expect(html).toContain('4444J99');
    expect(html).toContain('organvm-i-theoria');
    expect(html).toContain('Show hidden');
  });

  it('shows telemetry badges for probe metadata', () => {
    const html = renderToStaticMarkup(<GitHubPagesTab />);

    expect(html).toContain('probe: head');
    expect(html).toContain('latency: 32ms');
    expect(html).toContain('status: errored');
  });
});
