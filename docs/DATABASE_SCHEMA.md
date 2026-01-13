# Database Schema

## Overview
Primary storage is SQLite at `db/knowledge.db` with FTS5 tables for full-text search. Embeddings persist in ChromaDB under `atomized/embeddings/chroma`.

## Core Tables
- `atomic_units`: core knowledge units
- `units_fts`: FTS5 index of unit content
- `tags`, `unit_tags`: tagging system
- `keywords`, `unit_keywords`: keyword extraction
- `unit_relationships`: relationship graph edges
- `conversations`, `documents`: source metadata

## Indexing & Performance
- FTS5 index powers keyword search.
- WAL mode improves concurrency (configured in `src/database.ts`).

## Migrations
- Use `src/migrations.ts` for schema evolution.
- Run migrations during startup or as a dedicated task before deployment.

## Backup Strategy
- Snapshot `db/knowledge.db` and `atomized/embeddings/chroma` together.

## Encryption at Rest
- SQLite is not encrypted by default; rely on disk-level encryption or encrypted backups.
- Encrypted backups are supported via `BACKUP_ENCRYPTION_KEY` (see `docs/OPERATIONS.md`).

## References
- `src/database.ts`
- `src/migrations.ts`
- `docs/DEPLOYMENT.md`
