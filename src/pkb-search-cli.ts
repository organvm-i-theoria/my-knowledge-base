#!/usr/bin/env node
/**
 * pkb-search-cli.ts — fast, local search over Markdown notes.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import glob from 'fast-glob';

export interface SearchHit {
  file: string;
  line: number;
  snippet: string;
}

interface SearchOptions {
  terms: string[];
  regex?: string;
  andMode: boolean;
  orMode: boolean;
  jsonMode: boolean;
  root: string;
  ext: string;
  context: number;
  limit: number;
}

export function buildPredicate(options: SearchOptions): (line: string) => boolean {
  if (options.regex) {
    const rx = new RegExp(options.regex, 'i');
    return (line) => rx.test(line);
  }

  const terms = options.terms.map((term) => term.toLowerCase());
  if (options.andMode) {
    return (line) => terms.every((term) => line.toLowerCase().includes(term));
  }
  if (options.orMode) {
    return (line) => terms.some((term) => line.toLowerCase().includes(term));
  }

  const needle = terms.join(' ').trim();
  return (line) => line.toLowerCase().includes(needle);
}

export function searchFile(
  path: string,
  predicate: (line: string) => boolean,
  context: number
): SearchHit[] {
  try {
    const lines = readFileSync(path, 'utf-8').split(/\r?\n/);
    const hits: SearchHit[] = [];

    for (let i = 0; i < lines.length; i += 1) {
      if (!predicate(lines[i])) continue;

      const lineNumber = i + 1;
      const start = Math.max(1, lineNumber - context);
      const end = Math.min(lines.length, lineNumber + context);
      const snippet = Array.from({ length: end - start + 1 }, (_, index) => {
        const current = start + index;
        return `${String(current).padStart(4, '0')}: ${lines[current - 1]}`;
      }).join('\n');

      hits.push({ file: path, line: lineNumber, snippet });
    }

    return hits;
  } catch {
    return [];
  }
}

export function searchFiles(options: SearchOptions): SearchHit[] {
  const exts = options.ext
    .split(',')
    .map((ext) => ext.trim())
    .filter(Boolean)
    .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`));

  const patterns = exts.map((ext) => `**/*${ext}`);
  const files = glob.sync(patterns, {
    cwd: options.root,
    absolute: true,
    dot: false,
  });

  const predicate = buildPredicate(options);
  const results: SearchHit[] = [];

  for (const file of files) {
    const hits = searchFile(file, predicate, options.context);
    for (const hit of hits) {
      results.push(hit);
      if (results.length >= options.limit) {
        return results;
      }
    }
  }

  return results;
}

function printUsage() {
  console.log(`
Usage:
  npm run pkb:search -- "query terms"
  npm run pkb:search -- --re "regex"
  npm run pkb:search -- --and term1 term2
  npm run pkb:search -- --or term1 term2
  npm run pkb:search -- --json "query"

Options:
  --root PATH      Root folder (default: current working directory)
  --ext .md,.txt   Comma-separated extensions to scan (default: .md)
  --context N      Lines of context around hits (default: 1)
  --limit N        Max results (default: 200)
`);
}

function parseArgs(argv: string[]): SearchOptions {
  const options: SearchOptions = {
    terms: [],
    andMode: false,
    orMode: false,
    jsonMode: false,
    root: process.cwd(),
    ext: '.md',
    context: 1,
    limit: 200,
  };

  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift() as string;
    switch (arg) {
      case '--re':
        options.regex = args.shift();
        break;
      case '--and':
        options.andMode = true;
        options.terms.push(...args);
        args.length = 0;
        break;
      case '--or':
        options.orMode = true;
        options.terms.push(...args);
        args.length = 0;
        break;
      case '--json':
        options.jsonMode = true;
        break;
      case '--root':
        options.root = resolve(args.shift() ?? options.root);
        break;
      case '--ext':
        options.ext = args.shift() ?? options.ext;
        break;
      case '--context':
        options.context = Number(args.shift() ?? options.context);
        break;
      case '--limit':
        options.limit = Number(args.shift() ?? options.limit);
        break;
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
      default:
        options.terms.push(arg);
        break;
    }
  }

  if (!options.regex && options.terms.length === 0) {
    printUsage();
    process.exit(1);
  }

  return options;
}

export function main() {
  const options = parseArgs(process.argv.slice(2));
  const results = searchFiles(options);

  if (options.jsonMode) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  for (const result of results) {
    console.log(`\n== ${result.file}:${result.line} ==`);
    console.log(result.snippet);
  }
}

const isDirectRun =
  process.argv[1] && process.argv[1].includes('pkb-search-cli');
if (isDirectRun) {
  main();
}
