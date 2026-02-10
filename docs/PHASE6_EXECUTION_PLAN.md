# Phase 6 Execution Plan (Parallel Workstreams)

This plan turns Phase 6 into an execution checklist and splits the work into two largely independent workstreams so you can assign them to two AI agents in parallel.

Status markers:
- [ ] Not started
- [~] In progress
- [x] Complete

Already complete (as of 2026-01-27):
- [x] ChunkingStrategy interface and default strategies
- [x] Markdown semantic chunking
- [x] PDF sliding-window chunking
- [x] KnowledgeAtomizer chunk-aware enrichment
- [x] Image detection in Markdown/HTML
- [x] Taxonomy normalization utilities
- [x] Bulk backfill CLI (`npm run smart-tag:backfill`)
- [x] Chunking metrics CLI (`npm run chunking:metrics`)

---

## Workstream A — Chunking, Ingestion, and Metrics

Goal: Improve chunk quality and ingestion robustness, and make chunking outcomes measurable.

This stream should avoid taxonomy/backfill changes where possible.

### A0. Baseline and Safety
- [x] Run baseline metrics: `npm run chunking:metrics`
- [x] Record key numbers in PR/notes:
- [x] documentsWithUnits
- [x] documentsChunkedPct
- [x] avgUnitsPerDocument
- [x] chunk strategies present

Baseline snapshot (2026-02-10):
- `documentsWithUnits`: `3494`
- `documentsChunkedPct`: `66.9%`
- `avgUnitsPerDocument`: `44.43`
- `chunk strategies`: `chunk-strategy-markdown-semantic`, `chunk-strategy-pdf-sliding-window`
- `metrics snapshot`: `atomized/metrics/chunking-2026-02-10.json`

### A1. HTML and Preprocessing Improvements
- [x] Extend HTML heading preprocessing to include `<h3>`
- [x] Convert HTML lists into markdown-like bullets before semantic chunking
- [x] Strip noisy HTML (scripts/styles/nav/footer/iframes) before chunking
- [x] Add tests for HTML heading and list preprocessing edge cases

Suggested files:
- `src/chunking-strategies.ts`
- `src/chunking-strategies.test.ts`

### A2. Chunking Controls and Guardrails
- [x] Add env-configurable chunking parameters:
- [x] `CHUNK_PDF_WINDOW_TOKENS`
- [x] `CHUNK_PDF_OVERLAP_TOKENS`
- [x] `CHUNK_PDF_MIN_TOKENS`
- [x] Add per-format defaults in a single config object (resolved at strategy construction time)
- [x] Add a max-chunks-per-document guardrail
- [x] Add a min-meaningful-content filter for tiny chunks
- [x] Add a document tag like `large-document` when chunkCount exceeds threshold

Suggested files:
- `src/chunking-strategies.ts`
- `src/atomizer.ts`
- `src/types.ts` (only if new metadata needs typing)

### A3. Metrics Expansion
- [x] Extend chunking metrics to show top chunked documents:
- [x] document title
- [x] format
- [x] unit count
- [x] sourceId (if available)
- [x] Add breakdown by `sourceId`
- [x] Add:
- [x] percent of units with `chunk-strategy-*`
- [x] percent of units with `has-image`
- [x] Add optional snapshot output:
- [x] `npm run chunking:metrics -- --snapshot`
- [x] Save to `atomized/metrics/chunking-YYYY-MM-DD.json`

Suggested files:
- `src/database.ts`
- `src/chunking-metrics-cli.ts`
- `src/chunking-metrics.test.ts`

### A4. Watcher Hardening (Phase 5.1 Robustness)
- [x] Add debounce around rapid change events
- [x] Add retry/backoff around parsing and ingestion failures
- [x] Ensure single-file failures do not crash the watch loop
- [x] Add a small watcher smoke test script

Suggested files:
- `src/watch.ts`
- `scripts/` (new smoke test)

---

## Workstream B — Taxonomy, Backfill, and Search Quality

Goal: Tighten taxonomy consistency, make backfills safer and more controllable, and improve retrieval quality.

This stream should avoid deep chunking changes where possible.

### B0. Baseline and Safe Trials
- [x] Run dry-run backfill on a small slice:
- [x] `npm run smart-tag:backfill -- --limit 100 --include-all --yes`
- [x] Run a scoped save:
- [x] `npm run smart-tag:backfill -- --limit 100 --include-all --save --yes`
- [x] Spot-check 10–20 updated units
- [x] Re-run metrics: `npm run chunking:metrics`
- Evidence:
- `docs/evidence/backfill-trials/latest.json`
- `docs/evidence/backfill-trials/spot-check-limit100-20260210.json`

### B1. Taxonomy Auditing and Repair
- [x] Add a taxonomy audit CLI:
- [x] unknown categories
- [x] malformed tags
- [x] top offenders and counts
- [x] Add a taxonomy repair CLI:
- [x] normalize categories/tags/keywords in place
- [x] add `--dry-run` and `--save`
- [x] Add tests for audit and repair helpers

Suggested files:
- `src/taxonomy.ts`
- `src/database.ts`
- `src/*taxonomy*-cli.ts` (new)
- `src/*taxonomy*.test.ts` (new)

### B2. Backfill Robustness and Control
- [x] Add batching controls:
- [x] `--batch-size`
- [x] `--max-batches`
- [x] Add checkpointing/resume:
- [x] `--resume-from-offset`
- [x] Add scoping filters:
- [x] `--source`
- [x] `--format`
- [x] `--max-tags`
- [x] `--min-content-length`
- [x] Add safety rails:
- [x] show a summary before expensive calls
- [x] add `--yes` to bypass confirmation
- [x] Add tests for CLI arg parsing and scoping behavior

Suggested files:
- `src/bulk-tag-backfill-cli.ts`
- `src/database.ts`
- `src/database-backfill.test.ts`

### B3. Retrieval and Ranking Follow-Through
- [x] Add chunk-aware scoring hints:
- [x] small boost for `chunk-strategy-*`
- [x] (optional) boost for `has-image` only when query suggests visuals
- [x] Ensure chunk/page hints appear in snippets when present
- [x] Add search CLI filters:
- [x] `--source`
- [x] `--format`

Suggested files:
- `src/search.ts`
- `src/advanced-search.ts`
- `src/search-hybrid-cli.ts`
- `tests/search-endpoints.test.ts`

---

## Cross-Stream Guardrails

To reduce merge conflicts:
- Workstream A should avoid editing:
- `src/taxonomy.ts`
- `src/smart-tagger.ts`
- Workstream B should avoid editing:
- `src/chunking-strategies.ts`
- `src/atomizer.ts`

Both streams may need `src/database.ts`. If so:
- Keep changes isolated to separate methods
- Prefer additive changes over refactors

---

## Recommended Parallel Assignment

Assign to Agent A (Chunking & Metrics):
1. A1 HTML preprocessing improvements
2. A2 Chunking controls and guardrails
3. A3 Metrics expansion
4. A4 Watcher hardening

Assign to Agent B (Taxonomy & Backfill & Search):
1. B1 Taxonomy audit + repair CLI
2. B2 Backfill robustness + safeguards
3. B3 Retrieval and ranking follow-through

---

## Execution Checklist (Fast Path)

Do these in order within each stream:

Workstream A fast path:
1. A1 HTML improvements + tests
2. A3 metrics expansion + tests
3. A2 chunking controls + tests
4. A4 watcher hardening + smoke test
5. Run: `npm run test`

Workstream B fast path:
1. B2 backfill controls + tests
2. B1 taxonomy audit/repair + tests
3. B3 search follow-through + tests
4. Run: `npm run test`

---

## Definition of Done (Phase 6 Quality Bar)

- [x] `npm run test` passes
- [x] `npm run chunking:metrics` shows sensible distributions
- [x] Backfill can run safely in small, scoped batches
- [x] At least 10–20 spot-checked units look better than before
- [x] Documentation references updated CLIs and workflows
