## Summary

Describe the change and why it is needed.

## Validation

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run test:ci`
- [ ] `npm run test:parity` (required for search API behavior changes)
- [ ] `npm run test:coverage` (when risk profile requires)

## Contract and Doc Drift Checklist

- [ ] API contract changes are reflected in tests and docs (`docs/SEARCH_API.md`, `docs/API_DOCUMENTATION.md`).
- [ ] Release workflow changes are reflected in runbooks (`docs/OPERATIONS.md`, `docs/DEPLOYMENT.md`).
- [ ] Semantic/hybrid policy or readiness changes include strict-gate impact notes.
- [ ] Monitoring/alerting implications are updated in `docs/MONITORING.md`.
- [ ] Release evidence impact is recorded or referenced in `docs/RELEASE_INDEX.md`.

## Risk

- [ ] No migration impact
- [ ] Migration impact reviewed
- [ ] Rollback path documented

## Notes

Add links to related issues, run IDs, or release notes as needed.
