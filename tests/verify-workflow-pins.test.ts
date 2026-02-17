import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it } from 'vitest';
import { findMutableWorkflowUses } from '../scripts/verify-workflow-pins.js';

describe('findMutableWorkflowUses', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns no findings for pinned refs and local reusable workflows', () => {
    const root = mkdtempSync(join(tmpdir(), 'workflow-pins-pass-'));
    tempDirs.push(root);
    const workflowsDir = join(root, '.github', 'workflows');
    mkdirSync(workflowsDir, { recursive: true });

    writeFileSync(
      join(workflowsDir, 'ci.yml'),
      [
        'jobs:',
        '  lint:',
        '    steps:',
        '      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd',
        '      - uses: ./github/actions/setup',
      ].join('\n'),
      'utf8',
    );

    const findings = findMutableWorkflowUses(workflowsDir);
    expect(findings).toEqual([]);
  });

  it('reports mutable refs and missing refs', () => {
    const root = mkdtempSync(join(tmpdir(), 'workflow-pins-fail-'));
    tempDirs.push(root);
    const workflowsDir = join(root, '.github', 'workflows');
    mkdirSync(workflowsDir, { recursive: true });

    writeFileSync(
      join(workflowsDir, 'release.yml'),
      [
        'jobs:',
        '  release:',
        '    steps:',
        '      - uses: actions/checkout@v6',
        '      - uses: docker/build-push-action',
      ].join('\n'),
      'utf8',
    );

    const findings = findMutableWorkflowUses(workflowsDir);
    expect(findings.length).toBe(2);
    expect(findings.some((finding) => finding.uses.includes('@v6'))).toBe(true);
    expect(findings.some((finding) => finding.reason === 'missing @ref')).toBe(true);
  });
});
