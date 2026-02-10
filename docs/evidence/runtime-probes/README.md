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

Release workflow uses 1Password-backed GitHub configuration:
- GitHub secret:
  - `OP_SERVICE_ACCOUNT_TOKEN`
- GitHub variables:
  - `OP_STAGING_BASE_URL_REF`
  - `OP_PROD_BASE_URL_REF`
  - `OP_STAGING_AUTH_HEADER_REF` (optional)
  - `OP_PROD_AUTH_HEADER_REF` (optional)
- Reference syntax: `op://<vault>/<item>/<field>`

Promotion should be blocked when a report contains:
- `pass=false`
- non-zero strict `503` counters
- parity failures
- strict policy drift
- missing `vectorProfileId`
