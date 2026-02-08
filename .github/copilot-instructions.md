# GitHub Copilot Instructions

## Project snapshot
- Knowledge Base System is a multi-phase TypeScript/Node.js platform that exports Claude.app conversations, atomizes them into SQLite, generates embeddings in ChromaDB, and layers Claude-powered intelligence plus web APIs (see `README.md`).
- Guardrails live in `AGENTS.md`; architecture, pipelines, and command details live in `CLAUDE.md`, `CLI_REFERENCE.md`, and the phase docs under `docs/`.

## Source map & assets of record
- `src/` — core services (`core/`, `phase2/`, `phase3/`, `features/`, `api/`, `middleware/`).
- `scripts/` — operational helpers (`migrate.ts`, `seed-db.ts`, `backup.ts`, `sync-cloud.sh`, smoke/verification scripts).
- Data surfaces: `intake/` (raw exports), `raw/` (staged files), `atomized/` (chunked knowledge units), `db/` (SQLite + Chroma artifacts), `backups/` (encrypted bundles). Treat these as read-only unless a task explicitly says otherwise.
- Documentation: `README.md`, `COMPREHENSIVE_IMPLEMENTATION_SUMMARY.md`, `DEVELOPMENT_ROADMAP.md`, `PHASE*.md`, and API references in `docs/`.

## Day-one workflow for any feature
1. `npm install` (once per environment) and keep Node 18+.
2. Sync the database with `npm run prepare-db` (`migrate` + `seed`) before running services, tests, or scripts.
3. Use existing npm scripts for entrypoints: `npm run dev` for the backend, `npm run web` for the React preview, `npm run build && npm run start` for compiled smoke tests.
4. When touching ingestion/export flows, reference `src/export*.ts`, `watch` scripts, and the data directories above; never delete historical data files.

## Feature-specific command map
- **Ingestion & atomization:** `npm run ingest:all`, `npm run watch`, `npm run watch:semantic`, `npm run chunking:metrics`, `npm run reprocess:documents`.
- **Semantic + Claude intelligence:** `npm run generate-embeddings`, `npm run extract-insights`, `npm run smart-tag`, `npm run smart-tag:backfill`, `npm run find-relationships`, `npm run summarize`.
- **Search & APIs:** `npm run search`, `npm run search:semantic`, `npm run search:hybrid`, `npm run pkb:search`, plus the Express endpoints under `src/api/`.
- **Data safety & ops:** `npm run backup` (honor `BACKUP_ENCRYPT=true` when required), `npm run sync` for remote storage, and `npm run redact:*` workflows before sharing data.
- **Front-end:** `npm run web` for the SSR React host and `npm run build:react` for bundling `web-react/`.

## Testing & validation expectations
- Default test suite: `npm run test`. Use `npm run test -- --watch` only for tight loops.
- Coverage and regression: `npm run test:coverage`, `npm run benchmark`, and `npm run watch:smoke` when altering ingestion/watchers.
- Semantic verification: `tsx scripts/verify-semantic-search.ts` for retrieval adjustments; keep deterministic fixtures under `tests/`.
- If a change spans DB schema or migrations, rerun `npm run prepare-db` and document any manual steps in the relevant phase summary.

## Documentation & status updates
- Record behavioral changes in the closest summary doc (`COMPREHENSIVE_IMPLEMENTATION_SUMMARY.md`, `PHASE*-SUMMARY.md`, or `PROGRESS_SUMMARY.md`).
- New or updated commands belong in `CLI_REFERENCE.md`; roadmap movement goes in `DEVELOPMENT_ROADMAP.md`.
- When adding skills/content, mirror the structure described in `PLAN.md` / `PARALLEL_WORKSTREAMS.md` and keep each skill self-contained with `SKILL.md` metadata.

## Guardrails & coding conventions
- Use ESM imports, 2-space indentation, semicolons, and keep services modular (follow the patterns in `src/phase3/*`).
- Do not hard-code secrets; rely on `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and documented env vars. Provide graceful fallbacks for network/API failures.
- Preserve deterministic helpers (`hashToVector`, caching layers, retry utilities) to keep prompts cost-capped.
- Favor existing abstractions (e.g., `chromadb` client, `insight-extractor` service) over net-new patterns; extend via dependency injection when possible.
- Large files in `intake/`, `raw/`, `atomized/`, or `db/` should not be rewritten in-place—add new migrations or export revisions instead.

## When uncertain
- Check `CLAUDE.md` for architecture, `docs/SEARCH_API.md` & `docs/CLAUDE_INTELLIGENCE_API.md` for contracts, and `CLI_REFERENCE.md` for how scripts are expected to behave.
- If scope is ambiguous or data migrations might invalidate historical exports, pause and document open questions in the relevant `PHASE*.md` before coding.
