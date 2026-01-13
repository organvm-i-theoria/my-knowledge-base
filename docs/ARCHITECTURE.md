# Architecture

## System Overview
A Node.js + TypeScript service that ingests sources, atomizes them into knowledge units, stores them in SQLite, and layers semantic search and Claude-powered intelligence.

## Core Modules
- Ingestion: `src/sources/`, `src/export.ts`
- Atomization: `src/atomizer.ts`, `src/document-atomizer.ts`
- Storage: `src/database.ts`, `db/knowledge.db`
- Search: `src/search.ts`, `src/semantic-search.ts`, `src/hybrid-search.ts`
- Intelligence: `src/insight-extractor.ts`, `src/smart-tagger.ts`, `src/relationship-detector.ts`, `src/conversation-summarizer.ts`
- API: `src/api.ts`, `src/api-intelligence.ts`

## Data Flow
1. Sources ingest data into `raw/` via `src/export.ts`.
2. Atomizers create atomic units with tags and keywords.
3. Units persist in SQLite; embeddings persist in ChromaDB.
4. Search and intelligence services query the stored units.

## Key Directories
- `raw/`: source exports
- `atomized/`: derived outputs
- `db/`: SQLite database
- `web/`: static UI assets

## Extensibility
- Add sources under `src/sources/` implementing the interface in `src/sources/interface.ts`.
- Add analyzers as new modules and wire into CLI and API.

## Security Model
- Optional auth middleware in `src/api.ts` when `ENABLE_AUTH=true`.
- CORS configured via `CORS_ORIGINS`/`CORS_METHODS` in `src/web-server.ts`.
- HTTPS redirect available via `ENFORCE_HTTPS=true`.
- Audit logs for write operations when `AUDIT_LOG_ENABLED=true` (see `src/audit-log.ts`).

## References
- `README.md`
- `CLAUDE.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/API_DOCUMENTATION.md`
