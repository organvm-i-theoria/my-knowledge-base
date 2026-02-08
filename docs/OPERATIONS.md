# Operations

## Runbooks
- Start services: `npm run web` for the web UI or `npm run start` for the compiled API server; both now run `npm run prepare-db` first to align the schema.
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

## References
- `docs/MONITORING.md`
- `docs/TROUBLESHOOTING.md`
- `src/web-server.ts`
