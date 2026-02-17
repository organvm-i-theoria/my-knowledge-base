#!/usr/bin/env node

import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

export interface MutableWorkflowUse {
  file: string;
  line: number;
  uses: string;
  reason: string;
}

function isPinnedRef(ref: string): boolean {
  if (/^[0-9a-f]{40}$/i.test(ref)) {
    return true;
  }
  if (/^sha256:[0-9a-f]{64}$/i.test(ref)) {
    return true;
  }
  return false;
}

function evaluateUsesValue(file: string, line: number, usesValue: string): MutableWorkflowUse | null {
  if (usesValue.startsWith('./')) {
    return null;
  }

  const atIndex = usesValue.lastIndexOf('@');
  if (atIndex < 0) {
    return {
      file,
      line,
      uses: usesValue,
      reason: 'missing @ref',
    };
  }

  const ref = usesValue.slice(atIndex + 1);
  if (!ref) {
    return {
      file,
      line,
      uses: usesValue,
      reason: 'empty ref',
    };
  }

  if (ref.includes('${{')) {
    return {
      file,
      line,
      uses: usesValue,
      reason: 'dynamic ref',
    };
  }

  if (isPinnedRef(ref)) {
    return null;
  }

  return {
    file,
    line,
    uses: usesValue,
    reason: `mutable ref (${ref})`,
  };
}

export function findMutableWorkflowUses(workflowsDir = '.github/workflows'): MutableWorkflowUse[] {
  const absoluteDir = resolve(workflowsDir);
  const workflowFiles = readdirSync(absoluteDir)
    .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
    .map((entry) => resolve(absoluteDir, entry))
    .sort((left, right) => left.localeCompare(right));

  const findings: MutableWorkflowUse[] = [];
  for (const file of workflowFiles) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((lineText, index) => {
      const match = lineText.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)\s*(?:#.*)?$/);
      if (!match) {
        return;
      }

      const finding = evaluateUsesValue(file, index + 1, match[1]);
      if (finding) {
        findings.push(finding);
      }
    });
  }

  return findings;
}

function main(): void {
  const findings = findMutableWorkflowUses();
  if (findings.length === 0) {
    console.log('Workflow pin verification passed: all uses: entries are immutable.');
    return;
  }

  console.error('Workflow pin verification failed: mutable uses: references found.');
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} uses "${finding.uses}" (${finding.reason})`,
    );
  }
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
