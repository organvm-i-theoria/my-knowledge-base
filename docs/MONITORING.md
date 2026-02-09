# Monitoring

## Health Checks
- `/api/health` shows readiness and key availability.

## Metrics to Track
- Search latency (FTS, semantic, hybrid)
- Embedding generation throughput
- Claude token usage and cost
- Error rate and DB lock frequency
- Search degraded-mode rate (`query.degradedMode`) for semantic and hybrid endpoints.
- Search fallback reason distribution (`query.fallbackReason`) for semantic and hybrid endpoints.
- Search policy applied (`query.searchPolicyApplied`) for semantic and hybrid endpoints.
- Active vector profile telemetry (`query.vectorProfileId`) across semantic and hybrid calls.
- Auth startup/configuration failures (especially missing `JWT_SECRET` when auth is enabled).
- Cache effectiveness for `/api/search` and `/api/search/hybrid` (hit/miss ratio).

## Logging
- Structured logs from `src/logger.ts`.

## Alerts
- Trigger alerts on API error spikes and database lock errors.
- Trigger a warning when degraded-mode rate exceeds `15%` for 10 minutes.
- Trigger a critical alert when degraded-mode rate exceeds `30%` for 15 minutes.
- Trigger a critical alert when search endpoint `5xx` exceeds `2%` for 10 minutes.
- Trigger a warning when search P95 latency exceeds `1500ms` for 10 minutes.
- Trigger a critical alert when search P95 latency exceeds `3000ms` for 15 minutes.
- Trigger a critical alert when auth initialization fails in production mode.
- Trigger a critical alert when any strict-policy semantic/hybrid request returns `503` for 5+ minutes.
- Trigger a warning when active vector profile ID differs from current embedding profile ID in readiness checks.

## Post-Release Watch Window
- Minimum active watch window: `60` minutes after deploy.
- During watch window, review:
- `/api/health` every 5 minutes.
- Degraded-mode and fallback-reason rates every 10 minutes.
- Search policy + vector profile fields every 10 minutes.
- Search latency and error rate every 10 minutes.
- Escalate to rollback criteria in `docs/OPERATIONS.md` if critical thresholds are met.

## References
- `docs/OPERATIONS.md`
- `src/web-server.ts`
