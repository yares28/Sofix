# Architecture

**Current 2026-09-28.** Production is a scheduled Python publisher plus cached Next.js reader—not a permanent FastAPI
deployment.

```text
 football-data.org ─┐
 football-data.co.uk├─> GitHub Actions / Python refresh ─> Neon normalized tables + read_models
 The Odds API ──────┤       schema→sync→odds→predict              │
 Sorare GraphQL ────┘       →Sorare→publish→revalidate            v
                                                        Next.js/Vercel → PWA/browser
                                                               │
 signed-in sorare.com tab <─ allowlisted Chrome extension <────┘
```

## Runtime ownership

| Runtime | Owns | Does not do |
|---|---|---|
| GitHub Actions | Python 3.11 refresh, CSV cache, Neon writes, revalidation | Migrations or browser actions |
| Python | Sources, normalization, Dixon-Coles, market fit, Sorare plan/replay, publishing, local FastAPI | Serve production pages continuously |
| Neon | Normalized state, run log, pre-lock replay rows, complete page JSON | Compute forecasts |
| Next.js/Vercel | Server-only reads/validation/cache, refresh dispatch/status, extension API | Run Python or expose DB credentials |
| Chrome extension | Overlay and six allowlisted session operations | Store password/cookies, general proxy, automatic entry |

## Refresh lifecycle

1. Verify Alembic head (`--skip-migrations`); migrations are manual/owner-only.
2. Acquire the partial-unique running lock in `refresh_runs`.
3. Sync fixtures/results and current historical CSV cache.
4. Sync one batched odds call only if the last is ≥6 hours old.
5. Replace predictions for the current model version.
6. Sync Sorare, plan lineups and retain pre-lock forecasts.
7. Replace `grid`, `system`, `sorare` and `sorare_references` read models.
8. Authenticated `/api/revalidate`; otherwise one-hour cache expiry catches up.

Steps record status/timing and are isolated so an optional-source failure need not blank every page. The run still
fails visibly when a step fails.

## Web/cache boundary

- `DATABASE_URL` is server-only Neon HTTP. Without it, local pages call `API_BASE_URL` (default `127.0.0.1:8000`).
- Named one-hour tags cover football, system and Sorare models; failures are not cached.
- Refresh status is dynamic/no-store because it combines GitHub workflow and DB run state.
- There is no client polling of DB-backed pages. Neon free-limit suspension has a specific owner-facing state.

## Model boundaries

`modeling/dixon_coles.py` owns fit/matrix; `jobs/predict.py` owns run/calibration/market blend;
`services/fixture_grid.py` owns labels, buckets, six scales and payload. The browser only aggregates published fields.

Sorare public reads run in cloud. The extension uses the signed-in tab for identity, a fixture-level read of every
lineup in the selected GW, a competition-level capacity read for Apply, check, draft and enter. The fixture slug comes
from the published timeline, so a historical/current week does not need a retained optimizer plan. App and page bridge
each maintain an allowlist. Overlay payload is returned only when signed-in/public manager matches the published owner.

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
