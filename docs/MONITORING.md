# Monitoring

## Health Checks
- `/api/health` shows readiness and key availability.

## Metrics to Track
- Search latency (FTS, semantic, hybrid)
- Embedding generation throughput
- Claude token usage and cost
- Error rate and DB lock frequency

## Logging
- Structured logs from `src/logger.ts`.

## Alerts
- Trigger alerts on API error spikes and database lock errors.

## References
- `docs/OPERATIONS.md`
- `src/web-server.ts`
