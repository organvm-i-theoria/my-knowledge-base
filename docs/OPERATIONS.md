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

## References
- `docs/MONITORING.md`
- `docs/TROUBLESHOOTING.md`
- `src/web-server.ts`
