# Evaluation-to-Growth Remediation Backlog (2026-02-10)

## Status Legend
- `done`: implemented and validated in this pass
- `open`: approved but not yet implemented
- `blocked`: cannot complete without external system access/decision

## Priority Backlog

| ID | Priority | Area | Item | Files | Status | Validation |
|---|---|---|---|---|---|---|
| E2G-P0-001 | P0 | Release Integrity | Resolve and export canonical container image reference once; reuse for scan/release-note pull output | `.github/workflows/release.yml` | done | release workflow syntax + local checks |
| E2G-P0-002 | P0 | Release Integrity | Pin `aquasecurity/trivy-action` to immutable release tag/commit (avoid `@master`) | `.github/workflows/release.yml`, `.github/workflows/ci.yml` | done | workflow references commit-pinned Trivy action |
| E2G-P0-003 | P0 | Runtime Readiness | Enforce strict readiness as explicit pre-promotion gate in release/promotion workflow | `.github/workflows/release.yml`, `docs/DEPLOYMENT.md` | done | dedicated strict readiness job blocks docker-release |
| E2G-P1-001 | P1 | Search Contract | Align `/api/search/fts` query + pagination normalization with `/api/search` | `src/api.ts` | done | `src/api.test.ts` parity tests |
| E2G-P1-002 | P1 | Search Contract | Add parity tests for envelope + empty query + bounds behavior | `src/api.test.ts` | done | `npx vitest run src/api.test.ts` |
| E2G-P1-003 | P1 | Search Contract | Add dedicated CI smoke suite comparing `/api/search` and `/api/search/fts` on identical query corpus | `tests/search-parity-smoke.test.ts`, `.github/workflows/ci.yml`, `.github/workflows/release.yml` | done | parity smoke job and dedicated test suite |
| E2G-P1-004 | P1 | Search Docs | Update parity section to reflect exact contract and legacy alias behavior | `docs/SEARCH_API.md` | done | doc review + link checks |
| E2G-P2-001 | P2 | Documentation Trust | Mark pre-release notes that are no longer current as historical/superseded | `docs/RELEASE_NOTES_2026-02-09.md` | done | manual doc inspection |
| E2G-P2-002 | P2 | Documentation Trust | Add release chronology index for active vs historical releases with run IDs | `docs/RELEASE_INDEX.md` | done | chronology index created with active/historical sections |
| E2G-P2-003 | P2 | Monitoring | Add implementation-status table for each alert rule (`documented`, `implemented`, `verified`) | `docs/MONITORING.md` | done | alert implementation-status table added |
| E2G-P2-004 | P2 | Operability | Add “incident quick triage” block with copy-paste checks and expected outputs | `docs/TROUBLESHOOTING.md`, `docs/OPERATIONS.md` | done | quick triage command blocks added |
| E2G-P3-001 | P3 | Governance | Add doc drift checklist to PR template for API/release/readiness changes | `.github/pull_request_template.md` | done | PR template added with contract/governance checks |
| E2G-P3-002 | P3 | Evidence Hygiene | Add release evidence snapshot template (`tag`, run IDs, readiness, parity) | `docs/RELEASE_EVIDENCE_TEMPLATE.md`, `docs/RELEASE_INDEX.md` | done | release evidence template and index cross-links added |

## Execution Order
1. Close remaining P0 release/readiness gates.
2. Close P1 CI parity automation.
3. Close P2 operator trust and monitoring transparency items.
4. Close P3 governance automation.

## Notes
- This backlog captures remediation items discovered during `docs/EVALUATION_TO_GROWTH_REPORT_2026-02-10.md`.
- Items marked `done` were implemented in this execution pass and should still be re-validated in CI after merge.
