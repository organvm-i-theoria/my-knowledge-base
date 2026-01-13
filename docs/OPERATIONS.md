# Operations

## Runbooks
- Start services: `npm run web` for the web server or `npm run start` for compiled output.
- Verify health: `GET /api/health`.

## Backups
- Backup `db/knowledge.db` and `atomized/` on a schedule.
- ChromaDB data lives under `atomized/embeddings/chroma`.
- Set `BACKUP_ENCRYPTION_KEY` to enable encrypted backups (AES-256-GCM).

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
