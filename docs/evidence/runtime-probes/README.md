# Runtime Probe Evidence

Store parity + strict probe outputs here.

Expected commands:

```bash
npm run probe:staging -- --out "docs/evidence/runtime-probes/staging-$(date +%Y%m%d-%H%M%S).json"
npm run probe:prod -- --out "docs/evidence/runtime-probes/prod-$(date +%Y%m%d-%H%M%S).json"
```

Required environment variables for non-local probes:
- `STAGING_BASE_URL`
- `PROD_BASE_URL`
- `STAGING_AUTH_HEADER` (optional, if staging requires auth)
- `PROD_AUTH_HEADER` (optional, if prod requires auth)

Promotion should be blocked when a report contains:
- `pass=false`
- non-zero strict `503` counters
- parity failures
- strict policy drift
- missing `vectorProfileId`
