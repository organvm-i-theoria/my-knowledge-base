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

## Alert Implementation Status
Use this table as the source of truth for alert lifecycle state.

| Alert Rule | Severity | Documented | Implemented | Verified | Owner | Verification Method | Last Verified |
|---|---|---|---|---|---|---|---|
| API error spike (`5xx` > 2% for 10m) | critical | yes | pending (external monitoring) | no | Platform/SRE | synthetic fault + dashboard threshold validation | pending |
| Database lock error spike (`SQLITE_BUSY`) | warning | yes | pending (external monitoring) | no | Platform/SRE | repeated write-lock simulation + alert trigger check | pending |
| Degraded mode rate > 15% for 10m | warning | yes | pending (external monitoring) | no | Search Platform | query telemetry aggregation on `query.degradedMode` | pending |
| Degraded mode rate > 30% for 15m | critical | yes | pending (external monitoring) | no | Search Platform | same as warning, critical threshold profile | pending |
| Search latency P95 > 1500ms for 10m | warning | yes | pending (external monitoring) | no | Platform/SRE | latency histogram monitor with windowed threshold | pending |
| Search latency P95 > 3000ms for 15m | critical | yes | pending (external monitoring) | no | Platform/SRE | latency histogram monitor with critical threshold | pending |
| Auth initialization failure in prod | critical | yes | pending (external monitoring) | no | Identity/Platform | startup-failure log event monitor for missing `JWT_SECRET` | pending |
| Strict semantic/hybrid `503` spike (`strict` policy) | critical | yes | pending (external monitoring) | no | Search Platform | aggregate `SEMANTIC_SEARCH_UNAVAILABLE` / `HYBRID_SEARCH_UNAVAILABLE` response codes | pending |
| Vector profile mismatch (`query.vectorProfileId` drift) | warning | yes | pending (external monitoring) | no | Search Platform | compare runtime profile telemetry against readiness profile output | pending |
| `semanticPolicyApplied` policy drift from expected strict mode | warning | yes | pending (external monitoring) | no | Search Platform | monitor `query.searchPolicyApplied` and detect unexpected degrade in prod | pending |

Status values:
- `Documented`: rule exists in this document.
- `Implemented`: alert rule exists in monitoring system config.
- `Verified`: alert has been test-fired and validated end to end.

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
- `docs/RELEASE_INDEX.md`
- `src/web-server.ts`
