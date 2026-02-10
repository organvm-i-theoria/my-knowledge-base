# Release Index

Canonical release chronology and evidence ledger.

Use `docs/RELEASE_EVIDENCE_TEMPLATE.md` for new entries.

## Active Release Line

| Tag | Commit | Release Type | GitHub Actions Run ID | Strict Readiness Gate | Search Parity Smoke | Image Ref | Notes |
|---|---|---|---|---|---|---|---|
| `v1.0.0` | `5993e86c9109a11b9822f59d2ccd55cfc502e43e` | GA | `21846734701` | not present in workflow at tag | not present in workflow at tag | `ghcr.io/4444J99/my-knowledge-base:1.0.0` | https://github.com/4444J99/my-knowledge-base/actions/runs/21846734701; https://github.com/organvm-i-theoria/my-knowledge-base/actions/runs/21846734701 |

## Historical Releases

| Tag | Commit | Release Type | GitHub Actions Run ID | Strict Readiness Gate | Search Parity Smoke | Notes |
|---|---|---|---|---|---|---|
| `v1.0.0-rc.6` | `5993e86c9109a11b9822f59d2ccd55cfc502e43e` | RC | `21846587389` | not present in workflow at tag | not present in workflow at tag | https://github.com/4444J99/my-knowledge-base/actions/runs/21846587389; image=`ghcr.io/4444J99/my-knowledge-base:1.0.0-rc.6`; https://github.com/organvm-i-theoria/my-knowledge-base/actions/runs/21846587389 |
| `v1.0.0-rc.5` | `6746ca974653733165240079496180ba21b84365` | RC | `21846398102` | not present in workflow at tag | not present in workflow at tag | Docker release job failed before publish.; https://github.com/4444J99/my-knowledge-base/actions/runs/21846398102; https://github.com/organvm-i-theoria/my-knowledge-base/actions/runs/21846398102 |
| `v1.0.0-rc.4` | `c1e1fe521da10e753bfc1dc5299d2e2b26e5ff71` | RC | `21846336814` | not present in workflow at tag | not present in workflow at tag | Docker release job failed before publish.; https://github.com/4444J99/my-knowledge-base/actions/runs/21846336814; https://github.com/organvm-i-theoria/my-knowledge-base/actions/runs/21846336814 |
| `v1.0.0-rc.3` | `9b125375c83e4885fb35a7fc026a4e4cf2edd287` | RC | `21846265260` | not present in workflow at tag | not present in workflow at tag | Docker release job failed before publish.; https://github.com/4444J99/my-knowledge-base/actions/runs/21846265260; https://github.com/organvm-i-theoria/my-knowledge-base/actions/runs/21846265260 |
| `v1.0.0-rc.2` | `c170172f9013e50cd923f4d2d39160a580362361` | RC | `21846134706` | not present in workflow at tag | not present in workflow at tag | Test job failed; release jobs skipped.; https://github.com/4444J99/my-knowledge-base/actions/runs/21846134706; https://github.com/organvm-i-theoria/my-knowledge-base/actions/runs/21846134706 |
| `v1.0.0-rc.1` | `d3ec0a721bd6738242b2ff5e972f1f58ed34addf` | RC | `21844896599` | not present in workflow at tag | not present in workflow at tag | Test job failed; release jobs skipped.; https://github.com/4444J99/my-knowledge-base/actions/runs/21844896599; https://github.com/organvm-i-theoria/my-knowledge-base/actions/runs/21844896599 |

## Unreleased Head

| Branch | Commit | Validation Evidence |
|---|---|---|
| `master` | `ab76ba1` | Local gates passed (`lint`, `build`, `test:ci`, `test:coverage`) and local strict/parity probes passed for this update window. |

## Backfill Procedure

1. Find release workflow runs for each tag in GitHub Actions.
2. Copy run ID/URL and image ref into this index.
3. Confirm strict readiness and parity smoke status from run logs.
4. Mark old incident docs as historical and link from corresponding row when applicable.
