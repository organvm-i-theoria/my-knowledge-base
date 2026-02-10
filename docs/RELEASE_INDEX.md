# Release Index

Canonical release chronology and evidence ledger.

Use `docs/RELEASE_EVIDENCE_TEMPLATE.md` for new entries.

## Active Release Line

| Tag | Commit | Release Type | GitHub Actions Run ID | Strict Readiness Gate | Search Parity Smoke | Image Ref | Notes |
|---|---|---|---|---|---|---|---|
| `v1.0.0` | `5993e86c9109a11b9822f59d2ccd55cfc502e43e` | GA | pending backfill | pending backfill | pending backfill | pending backfill | Last tagged GA release in repo history. |

## Historical Releases

| Tag | Commit | Release Type | GitHub Actions Run ID | Strict Readiness Gate | Search Parity Smoke | Notes |
|---|---|---|---|---|---|---|
| `v1.0.0-rc.6` | `5993e86c9109a11b9822f59d2ccd55cfc502e43e` | RC | pending backfill | pending backfill | pending backfill | Same commit as `v1.0.0`. |
| `v1.0.0-rc.5` | `6746ca974653733165240079496180ba21b84365` | RC | pending backfill | pending backfill | pending backfill | Build context hardening phase. |
| `v1.0.0-rc.4` | `c1e1fe521da10e753bfc1dc5299d2e2b26e5ff71` | RC | pending backfill | pending backfill | pending backfill | Docker builder dependency hardening phase. |
| `v1.0.0-rc.3` | `9b125375c83e4885fb35a7fc026a4e4cf2edd287` | RC | pending backfill | pending backfill | pending backfill | Gemini export hardening phase. |
| `v1.0.0-rc.2` | `c170172f9013e50cd923f4d2d39160a580362361` | RC | pending backfill | pending backfill | pending backfill | Reindex/migration parity hardening phase. |
| `v1.0.0-rc.1` | `d3ec0a721bd6738242b2ff5e972f1f58ed34addf` | RC | pending backfill | pending backfill | pending backfill | Semantic readiness hardening baseline. |

## Unreleased Head

| Branch | Commit | Validation Evidence |
|---|---|---|
| `master` | `f243d90` | Local gates passed (`lint`, `build`, `test:ci`, `test:coverage`) prior to this index update. |

## Backfill Procedure

1. Find release workflow runs for each tag in GitHub Actions.
2. Copy run ID/URL and image ref into this index.
3. Confirm strict readiness and parity smoke status from run logs.
4. Mark old incident docs as historical and link from corresponding row when applicable.
