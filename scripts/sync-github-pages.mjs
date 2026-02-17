#!/usr/bin/env node

import { resolve } from 'node:path';
import { DEFAULT_OWNERS, syncGitHubPagesDirectory } from './github-pages-sync-core.mjs';

const DEFAULT_OUTPUT = 'web-react/src/data/github-pages.json';
const DEFAULT_CURATION = 'web-react/src/data/github-pages-curation.json';
const args = process.argv.slice(2);

function parseOption(name, fallback = null) {
  const prefix = `--${name}=`;
  const eq = args.find((entry) => entry.startsWith(prefix));
  if (eq) return eq.slice(prefix.length) || fallback;

  const index = args.indexOf(`--${name}`);
  if (index >= 0) return args[index + 1] ?? fallback;
  return fallback;
}

function parseOwners(raw) {
  if (!raw) return null;
  const owners = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return owners.length > 0 ? owners : null;
}

async function main() {
  const strict = args.includes('--strict');
  const owners = parseOwners(parseOption('owners', null)) ?? DEFAULT_OWNERS;
  const outputPath = resolve(parseOption('output', DEFAULT_OUTPUT));
  const curationPath = resolve(parseOption('curation', DEFAULT_CURATION));
  const probeTimeoutMs = Number.parseInt(parseOption('probe-timeout-ms', '8000'), 10) || 8000;
  const retryAttempts = Number.parseInt(parseOption('retry-attempts', '4'), 10) || 4;
  const repoConcurrency = Number.parseInt(parseOption('repo-concurrency', '6'), 10) || 6;
  const pagesConcurrency = Number.parseInt(parseOption('pages-concurrency', '8'), 10) || 8;
  const probeConcurrency = Number.parseInt(parseOption('probe-concurrency', '8'), 10) || 8;

  const result = await syncGitHubPagesDirectory({
    owners,
    outputPath,
    curationPath,
    strict,
    probeTimeoutMs,
    retryAttempts,
    repoConcurrency,
    pagesConcurrency,
    probeConcurrency,
    logger: console,
  });

  if (!result.ok) process.exit(1);
  if (result.usedFallback) process.exit(0);

  console.log(`Synced ${result.totalRepos} GitHub Pages repositories.`);
  console.log(`Wrote ${result.outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
