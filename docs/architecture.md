# Architecture

**Publication boundary reviewed 2026-10-29; other sections retain their dated scope.** Production is a scheduled Python publisher plus cached Next.js reader—not a permanent FastAPI
deployment.

```text
Public football/Sorare sources -> GitHub Actions/Python -> Neon rows + read_models
                                                        -> private R2 blocks -> Next.js/Vercel -> browser
Signed-in sorare.com <-> allowlisted Chrome extension <-> Next.js session routes
Local development -> copied R2 blocks or the mock API; server writes -> Neon
```

## Runtime ownership

| Runtime | Owns | Does not do |
|---|---|---|
| GitHub Actions | Python 3.11 refresh, CSV cache, Neon writes, revalidation | Migrations or browser actions |
| Python | Sources, normalization, Dixon-Coles, market fit, Sorare plan/replay, publishing, local FastAPI | Serve production pages continuously |
| Neon | Normalized state, run log, pre-lock replay rows, complete page JSON | Compute forecasts |
| Next.js/Vercel | Server-only reads/validation/cache, refresh dispatch/status, extension API | Run Python or expose DB credentials |
| Chrome extension | Overlay and explicitly allowlisted session operations | Store password/cookies, general proxy, automatic entry |

## Refresh lifecycle

1. Verify Alembic head (`--skip-migrations`); migrations are manual/owner-only.
2. Acquire the partial-unique running lock in `refresh_runs`.
3. Sync fixtures/results and current historical CSV cache.
4. Sync one batched odds call only if the last is ≥6 hours old.
5. Replace predictions for the current model version.
6. Sync Sorare, plan lineups and retain pre-lock forecasts.
7. Replace `grid`, `system`, `sorare` and `sorare_references` read models.
8. Synchronize web blocks to R2, then authenticated `/api/revalidate`; inspect upload results separately from database persistence.

Steps record status/timing and are isolated so an optional-source failure need not blank every page. The run still
fails visibly when a step fails.

## Web/cache boundary

- Production page reads use private R2 blocks, keyed by version/ETag; DATABASE_URL remains server-only for writes.
- Local development uses SOFIX_BLOCKS_DIR; the mock/API fallback is separate from production reads.
- Version discovery and payload caches have different lifetimes; see [PUBLICATION-R2-001](context.md#publication-r2-001).
- Upload, cache invalidation and rendering are separate outcomes. A completed job alone does not establish visible freshness.
- Recovery, same-second sync tolerance and protected block families: [PUBLICATION-SYNC-001](context.md#publication-sync-001).
- Quota selection and missing status diagnosis: [DATABASE-SELECTION-001](context.md#database-selection-001).

## Model boundaries

`modeling/dixon_coles.py` owns fit/matrix; `jobs/predict.py` owns run/calibration/market blend;
`services/fixture_grid.py` owns labels, buckets, six scales and payload. The browser only aggregates published fields.

Sorare public reads run in cloud. The extension uses the signed-in tab for identity, a fixture-level read of every
lineup in the selected GW, a competition-level capacity read for Apply, check, draft and enter. The fixture slug comes
from the published timeline, so a historical/current week does not need a retained optimizer plan. App and page bridge
each maintain an allowlist. Overlay numbers (`/api/ext/overlay`) are returned only to a request carrying the extension
token and are keyed by Sorare slugs. Matching the signed-in account to the published owner is not enforced yet.

## Storage/schema

Normalized tables enable recomputation; `read_models` avoids per-view rebuilds. See [data_dictionary.md](data_dictionary.md).

```text
models.py → autogenerate migration → review → dev-branch test → production owner migrate
```

Actions receives the DML-only app URL, never the owner/direct migration URL.

## Security/privacy

- Secrets stay server-side or in ignored generated extension files.
- Extension hosts are Sorare and the configured Sofix origin. Its permissions are `storage`, `alarms` and `scripting`;
  scripting injects the bridge/content bundle into an already-open Sorare tab when needed.
- Check-in sends public manager, version and Sorare build/revision—not credentials.
- Overlay cache is session-only for 15 minutes; check-in is change-driven or six-hourly.
- Destructive database/branch actions require explicit owner approval.

## Failure behavior

| Failure | Behavior |
|---|---|
| Missing/stale odds | Model remains; Odds may be empty, never zero |
| Missing Sorare key/source error | Football remains; last Sorare state shows freshness/error |
| Revalidation error | Data stored; app catches up within one hour |
| Missing extension/tab | Read-only app works; Apply says what is missing and renders no write button |
| Neon limit reached | Cached data may remain; failed read reports paused state |
