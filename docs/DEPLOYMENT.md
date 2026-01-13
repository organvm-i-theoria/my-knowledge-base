# Deployment

## Prerequisites
- Node.js 18+
- `.env` with `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`

## Build & Run
```bash
npm install
npm run build
npm run start
```

## Docker
- `Dockerfile` and `docker-compose.yml` are available.
- Mount `db/`, `raw/`, and `atomized/` as persistent volumes.

## Ports
- Default HTTP: `3000` (set `PORT` to override)

## Security Settings
- `CORS_ORIGINS` (comma-separated) and `CORS_METHODS` control CORS policy.
- `ENFORCE_HTTPS=true` redirects HTTP to HTTPS behind a proxy.
- `AUDIT_LOG_ENABLED=true` writes audit events to `AUDIT_LOG_PATH`.
- `BACKUP_ENCRYPTION_KEY` enables encrypted backups (32-byte base64 or hex).

## Data Directories
- `db/`: SQLite database
- `atomized/`: generated outputs
- `raw/`: source exports

## References
- `Dockerfile`
- `docker-compose.yml`
- `docs/OPERATIONS.md`
