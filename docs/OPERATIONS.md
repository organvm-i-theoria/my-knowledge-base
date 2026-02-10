# Operations

## Runbooks
- Start services: `npm run web` for the tsx web/runtime server or `npm run start` for the compiled web/runtime server; both run `npm run prepare-db` first to align the schema.
- Validate schema migrations before running analytics/CLI commands: `npm run migrate`.
- Seed the database for local demos: `npm run seed` (or `sqlite3 ./db/knowledge.db < db/seeds/initial.sql`).
- Verify health: `GET /api/health`.

## Schema & Seed Data
- `src/migrations.ts` tracks schema evolution; add new `Migration` entries there and re-run `npm run migrate` so `db/knowledge.db` includes `tags`, `parent_section_id`, and other recently added columns.
- The helper seed file (`db/seeds/initial.sql`) populates tags, relationships, and sample analytics rows that UI flows expect; reapply it after destructive resets.

## Web UI Validation
- Open `http://localhost:3000` (or `:4001` if another server is active) and try the filters sidebar, tag chooser, and score slider to tighten results; confirm the knowledge graph loads and the tag browser responds to searches.
- Edit tags from the modal, confirm they appear in the filter chips, and check the admin dashboard for refreshed counts and health indicators after each change.

## Backups
- After running plain and encrypted backups, surface the resulting metadata (`.json`) and archive it alongside the snapshot so reviewers can trace counts/sizes.
- The backup metadata file (`.json`) records unit/conversation counts plus sizes—retain it alongside each backup for audits.

## Logs
- Use structured logs in `src/logger.ts`.
- Capture stdout/stderr for incident review.
- Audit logs (when enabled) write to `AUDIT_LOG_PATH` or `./logs/audit.log`.

## Incident Quick Triage (10 Minutes)
Use this sequence during active incidents before deeper forensics.

```bash
# 1) Service health
curl -fsS http://localhost:3000/api/health | jq

# 2) Baseline FTS and compatibility endpoint parity
curl -fsS "http://localhost:3000/api/search?q=test&page=1&pageSize=5" | jq '.query,.pagination'
curl -fsS "http://localhost:3000/api/search/fts?q=test&page=1&pageSize=5" | jq '.query,.pagination'

# 3) Strict-path probes (expect 200 in healthy strict-ready runtime; 503 is a hard signal)
curl -is "http://localhost:3000/api/search/semantic?q=readiness+probe&page=1&pageSize=5"
curl -is "http://localhost:3000/api/search/hybrid?q=readiness+probe&page=1&pageSize=5"

# 4) Runtime dependency gate
npm run readiness:semantic:strict
```

Expected signals:
- `/api/health` responds `200` and reports ready dependencies.
- `/api/search` and `/api/search/fts` return aligned query/pagination metadata.
- Strict semantic/hybrid probes do not persistently return `503`.
- `readiness:semantic:strict` exits `0`.

## Remote Runtime Probe Gates
Use these commands to verify staging/prod parity and strict runtime behavior before promotion.

Manual mode required environment variables:
- `STAGING_BASE_URL`
- `PROD_BASE_URL`
- `STAGING_AUTH_HEADER` (optional)
- `PROD_AUTH_HEADER` (optional)

```bash
# Staging: parity + strict probes, emit evidence artifact
npm run probe:staging -- --out "docs/evidence/runtime-probes/staging-$(date +%Y%m%d-%H%M%S).json"

# Production: parity + strict probes, emit evidence artifact
npm run probe:prod -- --out "docs/evidence/runtime-probes/prod-$(date +%Y%m%d-%H%M%S).json"
```

Release workflow (recommended) fetches these values from 1Password:
- GitHub secret:
  - `OP_SERVICE_ACCOUNT_TOKEN`
- GitHub variables:
  - `OP_STAGING_BASE_URL_REF`
  - `OP_PROD_BASE_URL_REF`
  - `OP_STAGING_AUTH_HEADER_REF` (optional)
  - `OP_PROD_AUTH_HEADER_REF` (optional)
- 1Password reference syntax:
  - `op://<vault>/<item>/<field>`
  - Example: `op://kb-release-runtime/kb-prod-runtime-probe/base_url`

Block promotion when any probe report has:
- `pass=false`
- non-zero strict `503` counts (`semantic503` or `hybrid503`)
- parity failures (`/api/search` vs `/api/search/fts`)
- strict policy drift (`policyDrift > 0`)
- missing vector profile metadata (`vectorProfileMissing > 0`)

## CI Reliability Checks
- Run CI-equivalent suites locally: `npm run test:ci`.
- Run repeat stability checks before merging risky test/runtime changes: `npm run test:stability`.
- Tune repetition count when triaging flakes: `STABILITY_RUNS=10 npm run test:stability`.
- Deterministic test provider policy:
- `KB_EMBEDDINGS_PROVIDER` must be `mock` (or unset so setup defaults to `mock`).
- PR workflows run a non-blocking flaky-watch job that repeats known flaky-prone suites.

## Maintenance
- Rebuild embeddings: `npm run generate-embeddings`.
- Incremental export: `npm run export-incremental`.
- Snapshot before large batch operations.

## Intake Organization Workflow
- Run planner (no mutations): `npm run intake:organize:dry`
- Review the latest `intake/reports/organize-*/summary.json` before any apply run.
- Apply organization + dedupe: `npm run intake:organize:apply`
- Validate idempotency after apply: `npm run intake:organize:dry`
- Expected post-apply summary values: `topLevelMoves=0`, `secretMoves=0`, `artifactMoves=0`, `dsStoreDeletes=0`, `dedupeActions=0`.
- Dry-run/apply report bundle includes:
- `summary.json`
- `inventory.jsonl`
- `move-plan.jsonl`
- `artifact-plan.jsonl`
- `dedupe-plan.jsonl`
- `apply-log.jsonl` (apply mode)
- `rollback-manifest.jsonl`
- Apply mode mutates `intake`; only run it after reviewing dry-run outputs and confirming scope.

## Chunking Controls
- Inspect current chunking behavior: `npm run chunking:metrics -- --top 25`
- Persist a metrics snapshot: `npm run chunking:metrics -- --snapshot`
- PDF window controls:
- `CHUNK_PDF_WINDOW_TOKENS` (default 500)
- `CHUNK_PDF_OVERLAP_TOKENS` (default 50)
- `CHUNK_PDF_MIN_TOKENS` (default 800)
- Global guardrails:
- `CHUNK_MIN_TOKENS` (default 160)
- `CHUNK_MAX_PER_DOC` (default 40)
- `CHUNK_LARGE_DOC_THRESHOLD` (default 12; adds `large-document` tag)
- Example tuning run:
- `CHUNK_MIN_TOKENS=200 CHUNK_MAX_PER_DOC=30 npm run chunking:metrics -- --top 25`
- Apply new defaults to existing Apple Notes HTML:
- `npm run reprocess:documents -- --source apple-notes --format html --limit 200 --save --yes`

## Release Hardening Checklist
- Confirm branch and commit target: `git rev-parse --abbrev-ref HEAD` and `git log --oneline -n 1`.
- Run compile gate: `npm run build`.
- Run test gates: `npm run test:ci` and `npm run test:coverage`.
- Run dedicated parity gate: `npm run test:parity`.
- Run production-like startup checks:
- `ENABLE_AUTH=true NODE_ENV=production node dist/web-server.js` should fail fast without `JWT_SECRET`.
- `ENABLE_AUTH=true JWT_SECRET=<secret> NODE_ENV=production node dist/web-server.js` should start cleanly.
- Run API smoke checks against compiled runtime (`npm run start` or `node dist/web-server.js`):
- `GET /api/health`
- `GET /api/search?q=&page=1&pageSize=1` and `GET /api/search?q=&page=2&pageSize=1`
- `GET /api/search/semantic?q=...`
- `GET /api/search/hybrid?q=...`
- `GET /api/search/fts?q=...`
- Publish release notes in `docs/RELEASE_NOTES_<YYYY-MM-DD>.md` with test evidence and residual risks.
- Record release evidence in `docs/RELEASE_INDEX.md` using `docs/RELEASE_EVIDENCE_TEMPLATE.md`.
- Backfill release chronology from GitHub metadata:
- `npm run release-index:backfill`
- Verify alert definitions before promotion:
- `npm run alerts:verify`
- For strict sign-off with evidence artifacts:
- `npm run alerts:verify:strict`

## Rollback Triggers
- Trigger rollback when any condition below is true:
- `5xx` rate for search endpoints exceeds `2%` for `10` consecutive minutes.
- `query.degradedMode=true` appears in more than `30%` of semantic or hybrid requests for `15` consecutive minutes.
- Auth startup failures tied to `JWT_SECRET` configuration block service recovery beyond `10` minutes.
- P95 latency for `/api/search`, `/api/search/semantic`, or `/api/search/hybrid` exceeds `3000ms` for `15` consecutive minutes.

## Rollback Procedure
- Identify the current release commit and previous stable commit:
- `git log --oneline -n 5`
- Roll back with a revert commit:
- `git revert --no-edit <release-commit-sha>`
- Rebuild and run minimum validation:
- `npm run build`
- `npm run test:ci`
- Start runtime and verify:
- `GET /api/health`
- `GET /api/search?q=test&page=1&pageSize=5`
- `GET /api/search/semantic?q=test&page=1&pageSize=5`
- `GET /api/search/hybrid?q=test&page=1&pageSize=5`

## References
- `docs/MONITORING.md`
- `docs/RELEASE_INDEX.md`
- `docs/RELEASE_EVIDENCE_TEMPLATE.md`
- `docs/TROUBLESHOOTING.md`
- `docs/RELEASE_NOTES_2026-02-09.md`
- `src/web-server.ts`
- `scripts/probe-search-runtime.ts`
- `scripts/backfill-release-index.ts`
- `scripts/verify-alerts.ts`
