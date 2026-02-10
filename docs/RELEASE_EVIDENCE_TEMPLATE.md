# Release Evidence Template

Use one copy of this template per release tag.

## Metadata
- Tag:
- Commit:
- Date:
- Release Owner:
- Environment(s):

## Workflow Evidence
- Release workflow run URL:
- Release workflow run ID:
- CI workflow run URL:
- CI workflow run ID:

## Gates
- Build: pass/fail
- Test (`npm run test:ci`): pass/fail
- Coverage (`npm run test:coverage`): pass/fail
- Search parity smoke (`npm run test:parity`): pass/fail
- Strict readiness (`npm run readiness:semantic:strict`): pass/fail

## Runtime Verification
- `/api/health` status:
- `/api/search` vs `/api/search/fts` parity check result:
- `/api/search/semantic` strict probe:
- `/api/search/hybrid` strict probe:

## Observability
- `semanticPolicyApplied` drift alerts:
- `vectorProfileId` mismatch alerts:
- strict-mode `503` alert status:
- degraded-mode alert status:

## Artifact Evidence
- Container image ref(s):
- Trivy scan summary:
- Release notes URL:

## Rollback Readiness
- Previous stable tag:
- Rollback command verified:
- Rollback owner:

## Sign-off
- Engineering:
- Platform/SRE:
- Product/Release:
