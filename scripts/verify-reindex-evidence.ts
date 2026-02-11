#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import {
  evaluateReindexArtifact,
  type ReindexEvidenceArtifact,
  type ReindexEvidenceThresholds,
} from '../src/reindex-evidence.js';

interface ParsedArgs {
  ref?: string;
  out?: string;
  minChats: number;
  minTurns: number;
  requireUnbounded: boolean;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

function parseArgs(argv: string[]): ParsedArgs {
  const getValue = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    if (index < 0) return undefined;
    return argv[index + 1];
  };

  const minChats = Number.parseInt(getValue('--min-chats') || '1', 10);
  const minTurns = Number.parseInt(getValue('--min-turns') || '1', 10);

  return {
    ref: getValue('--ref'),
    out: getValue('--out'),
    minChats: Number.isFinite(minChats) && minChats >= 0 ? minChats : 1,
    minTurns: Number.isFinite(minTurns) && minTurns >= 0 ? minTurns : 1,
    requireUnbounded: parseBoolean(getValue('--require-unbounded'), true),
  };
}

function printUsage(): void {
  console.log(`Usage: tsx scripts/verify-reindex-evidence.ts [options]

Options:
  --ref <path-or-url>               Required reindex evidence reference
  --out <path>                      Optional path to write normalized JSON copy
  --min-chats <n>                   Minimum chatsIngested threshold (default: 1)
  --min-turns <n>                   Minimum turnsIngested threshold (default: 1)
  --require-unbounded <true|false>  Require evidence to be unbounded (default: true)
  --help                            Show help
`);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function loadEvidence(ref: string): Promise<ReindexEvidenceArtifact> {
  if (isHttpUrl(ref)) {
    const response = await fetch(ref, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      throw new Error(`Failed to fetch reindex evidence URL: status=${response.status}`);
    }
    return (await response.json()) as ReindexEvidenceArtifact;
  }
  const absolute = resolve(ref);
  return JSON.parse(readFileSync(absolute, 'utf8')) as ReindexEvidenceArtifact;
}

function writeJson(path: string, value: unknown): string {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return absolute;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  const args = parseArgs(argv);
  if (!args.ref) {
    throw new Error('--ref is required');
  }

  const thresholds: ReindexEvidenceThresholds = {
    minChatsIngested: args.minChats,
    minTurnsIngested: args.minTurns,
    requireUnbounded: args.requireUnbounded,
  };

  const artifact = await loadEvidence(args.ref);
  const evaluation = evaluateReindexArtifact(artifact, thresholds);

  let normalizedOut: string | undefined;
  if (args.out) {
    normalizedOut = writeJson(args.out, artifact);
  }

  console.log('\nReindex Evidence Verification');
  console.log('----------------------------');
  console.log(`ref=${args.ref}`);
  console.log(`pass=${evaluation.pass}`);
  console.log(`minChats=${thresholds.minChatsIngested}`);
  console.log(`minTurns=${thresholds.minTurnsIngested}`);
  console.log(`requireUnbounded=${thresholds.requireUnbounded}`);
  if (normalizedOut) {
    console.log(`normalizedOut=${normalizedOut}`);
  }
  if (evaluation.errors.length > 0) {
    console.log('\nErrors:');
    for (const error of evaluation.errors) {
      console.log(`- ${error}`);
    }
  }

  if (!evaluation.pass) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Reindex evidence verification failed:', error);
  process.exit(1);
});
