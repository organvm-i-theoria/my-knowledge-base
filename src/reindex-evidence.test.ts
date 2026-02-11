import { describe, expect, it } from 'vitest';
import { evaluateReindexArtifact, evaluateReindexRun } from './reindex-evidence.js';

describe('evaluateReindexRun', () => {
  const thresholds = {
    minChatsIngested: 1,
    minTurnsIngested: 1,
    requireUnbounded: true,
  };

  it('passes for a completed unbounded run above thresholds', () => {
    const result = evaluateReindexRun(
      {
        status: 'completed',
        chatsIngested: 4,
        turnsIngested: 42,
        completedAt: '2026-02-11T10:00:00.000Z',
        metadata: {
          threadsIndexed: 4,
          turnsIndexed: 42,
        },
      },
      thresholds,
    );

    expect(result.pass).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails when run is not completed', () => {
    const result = evaluateReindexRun(
      {
        status: 'running',
        chatsIngested: 1,
        turnsIngested: 1,
        metadata: {},
      },
      thresholds,
    );

    expect(result.pass).toBe(false);
    expect(result.errors.some((error) => error.includes('status must be completed'))).toBe(true);
  });

  it('fails when run appears bounded via metadata limit', () => {
    const result = evaluateReindexRun(
      {
        status: 'completed',
        chatsIngested: 10,
        turnsIngested: 100,
        completedAt: '2026-02-11T10:00:00.000Z',
        metadata: {
          limit: 500,
        },
      },
      thresholds,
    );

    expect(result.pass).toBe(false);
    expect(result.errors.some((error) => error.includes('appears bounded'))).toBe(true);
  });

  it('fails when counts are below thresholds', () => {
    const result = evaluateReindexRun(
      {
        status: 'completed',
        chatsIngested: 0,
        turnsIngested: 0,
        completedAt: '2026-02-11T10:00:00.000Z',
        metadata: {},
      },
      thresholds,
    );

    expect(result.pass).toBe(false);
    expect(result.errors.some((error) => error.includes('chatsIngested'))).toBe(true);
    expect(result.errors.some((error) => error.includes('turnsIngested'))).toBe(true);
  });

  it('evaluates a full reindex evidence artifact', () => {
    const result = evaluateReindexArtifact(
      {
        env: 'prod',
        pass: true,
        runId: 'run-1',
        run: {
          status: 'completed',
          chatsIngested: 2,
          turnsIngested: 20,
          completedAt: '2026-02-11T10:00:00.000Z',
          metadata: {},
        },
        errors: [],
      },
      thresholds,
    );

    expect(result.pass).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails artifact evaluation when artifact pass=false', () => {
    const result = evaluateReindexArtifact(
      {
        env: 'prod',
        pass: false,
        runId: 'run-2',
        run: {
          status: 'completed',
          chatsIngested: 2,
          turnsIngested: 20,
          completedAt: '2026-02-11T10:00:00.000Z',
          metadata: {},
        },
        errors: [],
      },
      thresholds,
    );

    expect(result.pass).toBe(false);
    expect(result.errors.some((error) => error.includes('pass flag'))).toBe(true);
  });
});
