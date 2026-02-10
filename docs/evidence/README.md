# Evidence Artifacts

This directory is the canonical location for release/runtime evidence used by closure and promotion gates.

## Layout

- `alert-verification/latest.json`
  - Required by `npm run alerts:verify:strict`.
- `runtime-probes/`
  - Expected outputs from `npm run probe:staging` and `npm run probe:prod`.
- `backfill-trials/`
  - Runtime backfill trial summaries and spot-check samples for Phase 6 B0.
- `release-evidence/`
  - Per-tag signed release evidence JSON (for example `v1.0.1.json`).

## Notes

- Runtime probe and release evidence files are environment-specific and must be generated per release cycle.
- Repo-local placeholders can exist, but promotion decisions must use target-environment artifacts.
