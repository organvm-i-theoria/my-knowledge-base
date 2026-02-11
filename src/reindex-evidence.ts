import type { UniverseIngestRun } from '@knowledge-base/contracts';

export interface ReindexEvidenceThresholds {
  minChatsIngested: number;
  minTurnsIngested: number;
  requireUnbounded: boolean;
}

export interface ReindexEvidenceEvaluation {
  pass: boolean;
  errors: string[];
}

export interface ReindexEvidenceArtifact {
  env?: string;
  baseUrl?: string;
  startedAt?: string;
  completedAt?: string;
  runId?: string;
  pollAttempts?: number;
  elapsedMs?: number;
  thresholds?: {
    minChatsIngested?: number;
    minTurnsIngested?: number;
    requireUnbounded?: boolean;
  };
  run?: Partial<UniverseIngestRun>;
  pass?: boolean;
  errors?: string[];
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
}

export function evaluateReindexRun(
  run: Partial<UniverseIngestRun> | null | undefined,
  thresholds: ReindexEvidenceThresholds,
): ReindexEvidenceEvaluation {
  const errors: string[] = [];

  if (!run) {
    return {
      pass: false,
      errors: ['Reindex run payload is missing'],
    };
  }

  if (run.status !== 'completed') {
    errors.push(`Reindex status must be completed (received: ${String(run.status)})`);
  }

  if (!run.completedAt) {
    errors.push('Reindex run is missing completedAt timestamp');
  }

  const chatsIngested = asNumber(run.chatsIngested);
  const turnsIngested = asNumber(run.turnsIngested);

  if (!Number.isFinite(chatsIngested)) {
    errors.push('Reindex run missing numeric chatsIngested');
  } else if (chatsIngested < thresholds.minChatsIngested) {
    errors.push(
      `Reindex chatsIngested ${chatsIngested} is below threshold ${thresholds.minChatsIngested}`,
    );
  }

  if (!Number.isFinite(turnsIngested)) {
    errors.push('Reindex run missing numeric turnsIngested');
  } else if (turnsIngested < thresholds.minTurnsIngested) {
    errors.push(
      `Reindex turnsIngested ${turnsIngested} is below threshold ${thresholds.minTurnsIngested}`,
    );
  }

  const metadata = (run.metadata || {}) as Record<string, unknown>;
  if (typeof metadata.error === 'string' && metadata.error.trim().length > 0) {
    errors.push(`Reindex metadata includes error: ${metadata.error}`);
  }

  if (thresholds.requireUnbounded) {
    const possibleLimit = metadata.limit ?? metadata.maxItems ?? metadata.maxUnits;
    if (possibleLimit !== undefined && possibleLimit !== null) {
      const limitValue = asNumber(possibleLimit);
      if (Number.isFinite(limitValue) && limitValue > 0) {
        errors.push(`Reindex appears bounded (metadata limit=${limitValue})`);
      }
    }
  }

  return {
    pass: errors.length === 0,
    errors,
  };
}

export function evaluateReindexArtifact(
  artifact: ReindexEvidenceArtifact | null | undefined,
  thresholds: ReindexEvidenceThresholds,
): ReindexEvidenceEvaluation {
  const errors: string[] = [];
  if (!artifact) {
    return {
      pass: false,
      errors: ['Reindex evidence artifact is missing'],
    };
  }

  if (artifact.pass !== true) {
    errors.push(`Reindex evidence artifact pass flag must be true (received: ${String(artifact.pass)})`);
  }

  errors.push(...evaluateReindexRun(artifact.run, thresholds).errors);

  if (Array.isArray(artifact.errors) && artifact.errors.length > 0) {
    errors.push(`Reindex evidence artifact contains ${artifact.errors.length} embedded error(s)`);
  }

  return {
    pass: errors.length === 0,
    errors,
  };
}
