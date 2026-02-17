#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXPECTED = {
  sync: 'd038249851a9f9c3f2a062227f450d8b592154451fe0c0524cb474d53aa4167d',
  validate: 'a70a47fc1ff7ace9bb550a7a8ba380e599eb533051ed3072878cc7f2e2c5c613',
};

function sha256(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

const checks = [
  {
    label: 'sync core',
    filePath: resolve('scripts/github-pages-sync-core.mjs'),
    expected: EXPECTED.sync,
  },
  {
    label: 'validate core',
    filePath: resolve('scripts/github-pages-validate-core.mjs'),
    expected: EXPECTED.validate,
  },
];

let failed = false;

for (const check of checks) {
  const actual = sha256(check.filePath);
  if (actual !== check.expected) {
    failed = true;
    console.error(`GitHub Pages ${check.label} drift detected:`);
    console.error(`- file: ${check.filePath}`);
    console.error(`- expected: ${check.expected}`);
    console.error(`- actual:   ${actual}`);
  }
}

if (failed) {
  console.error('\nUpdate canonical hashes after intentionally releasing a new core version.');
  process.exit(1);
}

console.log('GitHub Pages core drift check passed.');
