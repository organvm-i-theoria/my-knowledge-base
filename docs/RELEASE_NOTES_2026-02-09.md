# Release Notes - 2026-02-09

> Historical pre-release snapshot.  
> Superseded by `v1.0.0-rc.6` and `v1.0.0` release runs (both green), plus strict readiness verification and parity hardening completed on 2026-02-10.

## Summary
Release candidate is based on `063931d` (`fix: complete evaluation-to-growth hardening pass`) on `master`, with targeted second-pass hardening on search pagination cache behavior and fallback metadata consistency already included in that commit.

## Scope
- Auth startup hardening for production secret requirements.
- API contract hardening and helper/type normalization.
- Search endpoint resilience and fallback metadata (`degradedMode`, `fallbackReason`).
- Search cache key correctness for pagination isolation.
- Web-server routing consolidation onto canonical API setup.
- Federation scan-queue DB-close race handling and related robustness.
- Test and documentation updates.

## Key Changes by Surface Area
- `src/auth.ts`: JWT secret handling supports strict production enforcement while retaining controlled insecure default for development/test contexts.
- `src/api.ts`: search handlers now include page-aware cache behavior and consistent fallback metadata in semantic and hybrid responses.
- `src/search-cache.ts`: cache key generation includes page context to prevent cross-page cache contamination.
- `src/web-server.ts`: route behavior is centralized through canonical API setup, reducing drift from duplicate route registration.
- `src/federation/scan-queue.ts`: improved shutdown behavior around DB/queue lifecycle.
- `src/api-utils.ts` and `src/api-types.ts`: extracted request parsing and response typing helpers for clearer API boundaries.

## Validation Results
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run test:ci`: passed (1269 unit + 75 integration tests).
- `npm run test:coverage`: passed.
- Coverage gate status:
- lines `65.47`
- statements `64.94`
- functions `69.34`
- branches `56.11`

## Production-Like Smoke Evidence
Executed against compiled server (`node dist/web-server.js`) on 2026-02-09.

- Auth startup without secret in production mode:
- command intent: `ENABLE_AUTH=true NODE_ENV=production node dist/web-server.js`
- result: startup failed as expected with `JWT_SECRET is required`.
- Auth startup with secret in production mode:
- command intent: `ENABLE_AUTH=true JWT_SECRET=smoke-secret NODE_ENV=production node dist/web-server.js`
- result: startup succeeded.
- Health endpoint:
- `GET /api/health` returned `200`.
- FTS page isolation:
- `GET /api/search?q=&page=1&pageSize=1` and page 2 returned different top result IDs.
- result: page cache isolation confirmed.
- Semantic endpoint:
- `GET /api/search/semantic?q=authentication+patterns&page=1&pageSize=3`
- result: `success=true`, `degradedMode=true`, `fallbackReason=runtime_error`.
- Hybrid endpoint:
- `GET /api/search/hybrid?q=React&page=2&pageSize=2`
- result: `success=true`, `degradedMode=true`, `fallbackReason=runtime_error`.
- Canonical vs legacy search endpoints:
- `GET /api/search?q=React&page=1&pageSize=2` and `GET /api/search/fts?q=React&page=1&limit=2` both returned `success=true` and `count=2`.

## Residual Risks
- Canonical search (`/api/search`) and legacy FTS (`/api/search/fts`) returned non-overlapping result IDs in one smoke sample despite both succeeding.
- Impact: compatibility exists at endpoint availability/shape level, but ranking and retrieval semantics can diverge.
- Mitigation: define and document a single compatibility contract for these routes, then add explicit parity tests if semantic parity is required.
- Semantic and hybrid searches degraded to runtime fallback in current environment.
- Impact: semantic quality unavailable until runtime dependency or embedding path issue is corrected.
- Mitigation: monitor `degradedMode` rate, investigate runtime errors, and verify embedding backend readiness.
- Health payload reported `servicesReady=false`, `hasOpenAI=false`, `hasAnthropic=false`.
- Impact: AI-backed functionality is not fully ready in this runtime profile.
- Mitigation: confirm required provider credentials and startup environment before production rollout.

## Rollback Baseline
- Current release commit: `063931d25d3f8ce6640780bcefbf0d14216da201`
- Rollback strategy: `git revert --no-edit 063931d25d3f8ce6640780bcefbf0d14216da201`
- Minimum post-rollback verification:
- `npm run build`
- `npm run test:ci`
- `GET /api/health`
- `GET /api/search?q=test&page=1&pageSize=5`
