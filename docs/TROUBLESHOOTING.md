# Troubleshooting Guide

Common issues and solutions for the Knowledge Base system.

---

## API Key Issues

### Missing API Keys

**Symptom:** Error messages about missing keys, or features not working.

```
Error: OPENAI_API_KEY is not set
Error: ANTHROPIC_API_KEY is not set
```

**Solution:**
```bash
# Check if keys are set
echo $OPENAI_API_KEY
echo $ANTHROPIC_API_KEY

# Set in .env file
cat > .env << 'EOF'
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
EOF

# Or export directly
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```

### Invalid API Key Format

**Symptom:** 401 Unauthorized errors.

```bash
# OpenAI keys start with "sk-"
# Anthropic keys start with "sk-ant-"

# Verify key works
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY" | head -20
```

### Rate Limit Exceeded

**Symptom:** 429 Too Many Requests errors.

**Solution:**
```bash
# Reduce parallelism
npm run extract-insights all --save --parallel 1

# Add delays between requests (modify batch-processor.ts)
# Or upgrade API tier with provider
```

---

## Database Issues

### SQLite Database Locked

**Symptom:**
```
Error: SQLITE_BUSY: database is locked
```

**Causes:**
- Multiple processes writing simultaneously
- Long-running transaction blocking writes
- Crashed process holding lock

**Solutions:**
```bash
# Check for processes using the database
lsof db/knowledge.db

# Kill stuck processes
pkill -f "node.*knowledge"

# Restart cleanly
npm run start

# If persistent, check WAL files
ls -la db/
# Should see: knowledge.db, knowledge.db-wal, knowledge.db-shm

# Force WAL checkpoint (use with caution)
sqlite3 db/knowledge.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

### Database Corruption

**Symptom:**
```
Error: database disk image is malformed
Error: SQLITE_CORRUPT
```

**Solution:**
```bash
# Check database integrity
sqlite3 db/knowledge.db "PRAGMA integrity_check;"

# If corrupted, attempt recovery
sqlite3 db/knowledge.db ".dump" > backup.sql
rm db/knowledge.db
sqlite3 db/knowledge.db < backup.sql

# Or restore from backup
cp backups/knowledge-latest.db db/knowledge.db
```

### Migration Failures

**Symptom:**
```
Error: Migration failed
Error: table already exists
```

**Solution:**
```bash
# Check current schema
sqlite3 db/knowledge.db ".schema"

# Run migrations manually
npm run migrate

# If stuck, reset and re-import
# WARNING: This deletes all data
rm db/knowledge.db
npm run migrate
npm run export-incremental
```

### FTS Index Out of Sync

**Symptom:** Search returns no results or stale results.

**Solution:**
```bash
# Rebuild FTS index
sqlite3 db/knowledge.db "INSERT INTO units_fts(units_fts) VALUES('rebuild');"

# Verify index
sqlite3 db/knowledge.db "SELECT count(*) FROM units_fts;"
```

---

## ChromaDB / Embeddings Issues

### ChromaDB Connection Failed

**Symptom:**
```
Error: Failed to connect to ChromaDB
Error: ECONNREFUSED 127.0.0.1:8000
```

**Solutions:**
```bash
# Check if using local embedded mode (default)
ls -la atomized/embeddings/chroma/

# If using external ChromaDB, verify it's running
curl http://localhost:8000/api/v1/heartbeat

# Start ChromaDB container
docker-compose --profile with-chroma up -d chroma

# Set correct host/port
export CHROMA_HOST=localhost
export CHROMA_PORT=8000
```

### Embeddings Not Generated

**Symptom:** Semantic search returns empty or error.

```bash
# Check embedding coverage
npm run search:semantic "test"
# If "embeddings unavailable", generate them

# Generate embeddings
npm run generate-embeddings -- --yes

# Verify embeddings exist
ls -la atomized/embeddings/chroma/
```

### Embedding Dimension Mismatch

**Symptom:**
```
Error: Embedding dimension mismatch
```

**Solution:**
```bash
# Delete ChromaDB data and regenerate
rm -rf atomized/embeddings/chroma/
npm run generate-embeddings -- --yes
```

### ChromaDB Directory Permission Issues

**Symptom:**
```
Error: Permission denied: atomized/embeddings/chroma
```

**Solution:**
```bash
# Fix permissions
mkdir -p atomized/embeddings/chroma
chmod 755 atomized/embeddings/chroma

# In Docker, ensure volume ownership
docker exec -u root knowledge-base chown -R nodejs:nodejs /app/atomized
```

---

## Export / Scraping Failures

### Browser Not Found (Playwright)

**Symptom:**
```
Error: browserType.launch: Executable doesn't exist
```

**Solution:**
```bash
# Install Playwright browsers
npx playwright install chromium

# Or install all browsers
npx playwright install
```

### Login Required / Session Expired

**Symptom:** Export hangs at login screen or returns empty.

**Solution:**
```bash
# Run in headed mode to manually log in
npm run export:dev -- --headed

# Clear stored session and re-authenticate
rm -rf .playwright-session/
npm run export:dev
```

### Rate Limited by Source

**Symptom:** Export stops mid-way with 429 errors.

**Solution:**
```bash
# Reduce export speed
npm run export:dev -- --delay=5000

# Export in smaller batches
npm run export:dev -- --limit=50
```

### Empty Export Results

**Symptom:** Export completes but no data.

**Solutions:**
```bash
# Check raw directory
ls -la raw/claude/

# Verify source has conversations
# Manually check claude.ai or gemini.google.com

# Try incremental export
npm run export:dev -- --incremental

# Check for JavaScript errors in browser
npm run export:dev -- --headed --devtools
```

---

## Search Issues

### Search Returns No Results

**Symptom:** Queries return empty arrays.

**Diagnosis:**
```bash
# Check database has units
sqlite3 db/knowledge.db "SELECT count(*) FROM atomic_units;"

# Check FTS index
sqlite3 db/knowledge.db "SELECT count(*) FROM units_fts;"

# Try direct SQL search
sqlite3 db/knowledge.db "SELECT title FROM atomic_units LIMIT 5;"
```

**Solutions:**
```bash
# Rebuild FTS index
sqlite3 db/knowledge.db "INSERT INTO units_fts(units_fts) VALUES('rebuild');"

# Re-index content
npm run export-incremental
```

### Semantic Search Returns Wrong Results

**Symptom:** Results don't match query semantically.

**Solutions:**
```bash
# Verify embeddings are up to date
npm run generate-embeddings -- --yes

# Adjust hybrid search weights
npm run search:hybrid "query" -- --semantic-weight=0.8 --fts-weight=0.2

# Check embedding model version consistency
# (embeddings from different models won't compare well)
```

### Search Is Slow

**Symptom:** Queries take >5 seconds.

**Solutions:**
```bash
# Check database size
ls -lh db/knowledge.db

# Optimize SQLite
sqlite3 db/knowledge.db "VACUUM;"
sqlite3 db/knowledge.db "ANALYZE;"

# For semantic search, ensure ChromaDB is indexed
# Reduce result count
npm run search "query" -- --limit=10
```

---

## Memory / Performance Issues

### Out of Memory (OOM)

**Symptom:**
```
FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory
```

**Solutions:**
```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" npm run start

# Process in smaller batches
npm run generate-embeddings -- --limit=500 --yes
npm run extract-insights all --save --parallel 1

# Check for memory leaks
node --inspect dist/web-server.js
# Use Chrome DevTools to profile
```

### High CPU Usage

**Symptom:** Process consuming 100% CPU.

**Solutions:**
```bash
# Reduce parallel operations
npm run smart-tag --parallel 1

# Check for infinite loops (common in atomization)
npm run dev -- --inspect

# Limit embedding batch size
npm run generate-embeddings -- --batch-size=50
```

### Slow Startup

**Symptom:** Server takes >30s to start.

**Solutions:**
```bash
# Skip embedding preload
SKIP_EMBEDDING_PRELOAD=true npm run start

# Check database optimization
sqlite3 db/knowledge.db "PRAGMA optimize;"

# Ensure WAL mode is enabled
sqlite3 db/knowledge.db "PRAGMA journal_mode;"
# Should output: wal
```

---

## Web Server Issues

### Port Already in Use

**Symptom:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:**
```bash
# Find process using port
lsof -i :3000

# Kill it
kill -9 <PID>

# Or use different port
PORT=3001 npm run start
```

### CORS Errors

**Symptom:** Browser console shows CORS blocked.

**Solution:**
```bash
# Set allowed origins
CORS_ORIGINS=http://localhost:5173,http://localhost:3001 npm run start

# For development, allow all (not recommended for production)
CORS_ORIGINS=* npm run start
```

### WebSocket Connection Failed

**Symptom:** Real-time updates not working.

**Solution:**
```bash
# Check WebSocket endpoint
curl http://localhost:3000/api/ws/status

# Verify proxy passes WebSocket
# In nginx:
# proxy_set_header Upgrade $http_upgrade;
# proxy_set_header Connection "upgrade";
```

---

## Docker Issues

### Container Exits Immediately

**Symptom:** Container starts and stops.

**Diagnosis:**
```bash
docker logs knowledge-base
docker inspect knowledge-base --format='{{.State.ExitCode}}'
```

**Solutions:**
```bash
# Check for missing env vars
docker run --rm knowledge-base env | grep -E "(OPENAI|ANTHROPIC)"

# Run interactively to debug
docker run -it knowledge-base sh
```

### Volume Permission Denied

**Symptom:**
```
Error: EACCES: permission denied
```

**Solution:**
```bash
# Fix host directory permissions
sudo chown -R 1001:1001 ./db ./atomized

# Or run container as root (not recommended)
docker run --user root ...
```

### Health Check Failing

**Symptom:** Container marked unhealthy.

**Diagnosis:**
```bash
docker inspect knowledge-base --format='{{.State.Health.Status}}'
docker inspect knowledge-base --format='{{json .State.Health.Log}}' | jq
```

**Solution:**
```bash
# Increase start period for slow startup
# In docker-compose.yml:
healthcheck:
  start_period: 60s
```

---

## Quick Diagnostic Commands

```bash
# System status
curl http://localhost:3000/api/health
curl http://localhost:3000/api/stats

# Database check
sqlite3 db/knowledge.db "PRAGMA integrity_check;"
sqlite3 db/knowledge.db "SELECT count(*) FROM atomic_units;"

# ChromaDB check
ls -la atomized/embeddings/chroma/

# Process check
ps aux | grep node
lsof -i :3000

# Logs
tail -f logs/audit.log
docker logs -f knowledge-base 2>&1 | tail -100

# Memory usage
node -e "console.log(process.memoryUsage())"
```

---

## Getting Help

If issues persist:

1. Check logs: `npm run start 2>&1 | tee debug.log`
2. Run with debug mode: `DEBUG=* npm run start`
3. Review recent changes: `git log --oneline -10`
4. Check GitHub issues for similar problems
5. Provide: error message, Node version, OS, reproduction steps

---

## References

- `src/database.ts` - Database configuration and WAL mode
- `src/embeddings-service.ts` - OpenAI embedding logic
- `src/vector-database.ts` - ChromaDB integration
- `docs/DEPLOYMENT.md` - Production configuration
- `docs/OPERATIONS.md` - Operational procedures
