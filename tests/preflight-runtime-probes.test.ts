import { describe, expect, it } from 'vitest';
import { runRuntimeProbePreflight } from '../scripts/preflight-runtime-probes.js';

describe('runtime probe preflight', () => {
  it('passes with required 1Password refs and concrete reindex evidence reference', () => {
    const result = runRuntimeProbePreflight({
      env: {
        OP_SERVICE_ACCOUNT_TOKEN: 'token',
        OP_STAGING_BASE_URL_REF: 'op://kb-release-runtime/kb-staging-runtime-probe/base_url',
        OP_PROD_BASE_URL_REF: 'op://kb-release-runtime/kb-prod-runtime-probe/base_url',
        REINDEX_EVIDENCE_REF: 'docs/evidence/reindex-runs/prod-20260217.json',
      } as NodeJS.ProcessEnv,
    });

    expect(result.context).toBe('release');
    expect(result.pass).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails when required variables are missing', () => {
    const result = runRuntimeProbePreflight({
      env: {} as NodeJS.ProcessEnv,
    });

    expect(result.pass).toBe(false);
    expect(result.errors.some((error) => error.includes('OP_SERVICE_ACCOUNT_TOKEN'))).toBe(true);
    expect(result.errors.some((error) => error.includes('OP_STAGING_BASE_URL_REF'))).toBe(true);
    expect(result.errors.some((error) => error.includes('OP_PROD_BASE_URL_REF'))).toBe(true);
    expect(result.errors.some((error) => error.includes('REINDEX_EVIDENCE_REF'))).toBe(true);
  });

  it('passes in dispatch context without REINDEX_EVIDENCE_REF', () => {
    const result = runRuntimeProbePreflight({
      context: 'dispatch',
      strict: true,
      env: {
        OP_SERVICE_ACCOUNT_TOKEN: 'token',
        OP_STAGING_BASE_URL_REF: 'op://kb-release-runtime/kb-staging-runtime-probe/base_url',
        OP_PROD_BASE_URL_REF: 'op://kb-release-runtime/kb-prod-runtime-probe/base_url',
      } as NodeJS.ProcessEnv,
    });

    expect(result.context).toBe('dispatch');
    expect(result.pass).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('fails on malformed 1Password references', () => {
    const result = runRuntimeProbePreflight({
      env: {
        OP_SERVICE_ACCOUNT_TOKEN: 'token',
        OP_STAGING_BASE_URL_REF: 'https://example.com/staging',
        OP_PROD_BASE_URL_REF: 'op://kb-release-runtime',
        REINDEX_EVIDENCE_REF: 'docs/evidence/reindex-runs/prod-20260217.json',
      } as NodeJS.ProcessEnv,
    });

    expect(result.pass).toBe(false);
    expect(
      result.errors.filter((error) => error.includes('Invalid 1Password reference format')).length,
    ).toBe(2);
  });

  it('fails when reindex evidence is pending or missing', () => {
    const result = runRuntimeProbePreflight({
      env: {
        OP_SERVICE_ACCOUNT_TOKEN: 'token',
        OP_STAGING_BASE_URL_REF: 'op://kb-release-runtime/kb-staging-runtime-probe/base_url',
        OP_PROD_BASE_URL_REF: 'op://kb-release-runtime/kb-prod-runtime-probe/base_url',
        REINDEX_EVIDENCE_REF: 'pending: will upload after run',
      } as NodeJS.ProcessEnv,
    });

    expect(result.pass).toBe(false);
    expect(result.errors.some((error) => error.includes('must not be pending'))).toBe(true);
  });

  it('strict mode fails on warnings', () => {
    const result = runRuntimeProbePreflight({
      strict: true,
      env: {
        OP_SERVICE_ACCOUNT_TOKEN: 'token',
        OP_STAGING_BASE_URL_REF: 'op://kb-release-runtime/kb-staging-runtime-probe/base_url',
        OP_PROD_BASE_URL_REF: 'op://kb-release-runtime/kb-prod-runtime-probe/base_url',
        REINDEX_EVIDENCE_REF: 'op://kb-release-runtime/reindex/latest',
      } as NodeJS.ProcessEnv,
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.pass).toBe(false);
  });
});
