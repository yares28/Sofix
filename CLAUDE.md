# FixtureDiff

Personal, single-user **LaLiga fixture difficulty board**. English UI, premium white "Apple-style" design.
The FPL "Fixtures & Results / FDR" screen was only the UI reference: this is LaLiga, which has no official
FDR, so difficulty comes from our own backtested rating model.

Plan and status: [docs/next_features_plan.md](docs/next_features_plan.md) (work phase by phase, tick tasks there).
Evidence for open issues: [docs/upgrade_audit.md](docs/upgrade_audit.md). Model results: [backend/reports/backtest_laliga.md](backend/reports/backtest_laliga.md).

## Architecture

```
football-data.org ──┐                        ┌─> /api/fixture-grid ──> Next.js board (frontend/)
football-data.co.uk ─┼─> app.jobs.refresh ─> Neon Postgres ──┘
Open-Meteo ─────────┘   migrate → sync → predict → weather
```

| Area | Where |
|---|---|
| API | `backend/app/main.py`, `api.py`, `schemas.py` (FastAPI, `ApiResponse` envelope) |
| Grid payload | `backend/app/services/fixture_grid.py` (buckets come from labels; lens scales are computed here) |
| Rating model | `backend/app/modeling/dixon_coles.py`; tuned settings in `backend/artifacts/dixon_coles.json` |
| Predictions | `backend/app/jobs/predict.py`, `services/rating_predictions.py` (replace rows per model version) |
| Sync / weather | `backend/app/jobs/seed_and_sync.py`, `jobs/sync_weather.py`, `sources/*` |
| Teams | `backend/app/services/team_registry.py` (football-data.org `tla` ↔ football-data.co.uk name, colour, stadium) |
| Backtest | `backend/app/backtest/*`, `backend/app/jobs/backtest.py` |
| DB / migrations | `backend/app/models.py`, `backend/migrations/` (Alembic), `backend/app/migrate.py`, `app/db.py` |
| Frontend | `frontend/app/page.tsx` (server fetch), `components/FixtureBoard.tsx`, `lib/grid.ts`, `lib/types.ts` |

## Commands

Backend (from `backend/`, venv at `backend/.venv`):

```bash
.venv\Scripts\python -m app.jobs.refresh      # migrations, fixtures, predictions, weather
.venv\Scripts\python -m app.jobs.backtest     # tune + score the model; writes reports/ and artifacts/
.venv\Scripts\python -m app.migrate           # apply migrations
.venv\Scripts\alembic revision --autogenerate -m "what changed"
.venv\Scripts\python -m pytest -q
.venv\Scripts\ruff check . ; .venv\Scripts\ruff format .
.venv\Scripts\mypy                            # typed core modules listed in pyproject.toml
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

Frontend (from `frontend/` only):

```bash
npm run dev          # binds 127.0.0.1:3000
npm test             # vitest
npm run typecheck
npm run lint         # eslint (next + jsx-a11y), zero warnings
```

## Conventions

- English UI copy ("Matchday", "Date TBC"); kickoff times stored UTC, shown in `Europe/Madrid`.
- Frontend must not re-derive what the backend decides: tile colour = `prediction.bucket`, lens cut points = `lens_scales`.
- Schema changes: edit `models.py` → autogenerate a migration → review it → apply. Never `create_all` against Neon.
- Jobs replace rows (predictions per model version, weather per fixture); never append history.
- Tests: pytest with in-memory SQLite and mocked HTTP; vitest for `lib/`. Keep both green before committing.
- CI (`.github/workflows/ci.yml`) runs ruff, mypy, pytest (incl. migration drift), pip-audit, eslint, tsc, vitest
  and `npm audit --omit=dev`. Run the same locally before committing; it only executes once the repo is pushed to GitHub.
- Commits: `<type>: <description>` (feat, fix, refactor, docs, test, chore, perf, ci).
- Python 3.11 (`backend/.python-version`). Dependencies: edit direct pins in `requirements*.txt`, then regenerate
  `requirements*.lock` with `uv pip compile ... --python-version 3.11` and `uv pip sync` the venv; run `uvx pip-audit -r requirements.lock`.

## Model rules

- Current test baseline (2023/24–2025/26, 8,339 forecasts): **RPS 0.1953** (closing odds 0.1886, Elo 0.2050, base rates 0.2255).
- Tune only on 2019/20–2022/23; score once on the test seasons. A change ships only if a bootstrap CI
  (by matchday) of the RPS difference excludes 0, or it fixes calibration without making RPS worse.
- Known weaknesses: favourites under-confident (60–70% predicted → 74% actual), promoted teams learned too slowly
  after week 8, clean-sheet probabilities ~4 pts high.
- When the tuned config changes, update `artifacts/dixon_coles.json`, re-run refresh, and update the numbers above.

## Free-tier limits (personal, non-commercial use)

| Service | Limit | Rule for the code |
|---|---|---|
| football-data.org | **10 requests/min** with token; LaLiga (`PD`) + Champions League only, no Europa/Conference | One matches call per refresh; ≥ 10-min cooldown between refreshes; retry 429 with backoff; never loop per match |
| football-data.co.uk | Free CSVs; results and `fixtures.csv` (Bet365/avg/max odds, no Pinnacle) updated Tue ~13:00 / Fri ~17:00 UK | Disk cache in `backend/data/raw/`; re-download only the current season; a 404 for a brand-new season means "no rows yet" |
| Open-Meteo | Non-commercial: **600/min, 5,000/hour, 10,000/day, 300,000/month**; **CC BY 4.0 attribution required** | ≤ 1 call per stadium per refresh; keep the footer attribution |
| Neon Free | **0.5 GB/project, 100 CU-hours/month**, up to 2 CU, scale to zero after 5 min idle, 10 branches, 6 h history, 5 GB egress. **Hitting any limit suspends compute until next month** | Cache the grid and revalidate only after a refresh; never point uptime monitors at DB-backed endpoints (≈182 CU-h/month); keep `/api/health` DB-free |
| Club crests (planned) | No licence stated; club trademarks | Personal use only, behind `SHOW_CLUB_CRESTS`; allowlist `crests.football-data.org`; no bulk download |
| StatsBomb Open Data | LaLiga only to 2020/21, Barcelona matches only | Research only; not in the pipeline |

Transfermarkt Terms prohibit scraping. No LaLiga logo or wordmark.

## Environment and secrets

- Root `.env` (git-ignored): `FOOTBALL_DATA_ORG_TOKEN`, `POSTGRES_URL` (Neon **pooled** host, role **`fdr_app`**),
  `POSTGRES_MIGRATION_URL` (Neon **direct** host, role `neondb_owner`).
- `fdr_app` was created with SQL (so it is not in `neon_superuser`): DML on all tables + sequences, default
  privileges for tables the owner creates later, no DDL. Migrations must keep using the owner URL.
- Neon TLS: `app/db.py` forces `sslmode=verify-full` with the certifi CA bundle for `*.neon.tech` hosts.
- Branches: `production` (the app) and `dev` (test migrations here first; roles are per branch, so `dev` has
  only the owner role).
- Never print, log or commit secret values. Refer to keys by name only.
- Neon project **FDR** (AWS Frankfurt, Postgres 18, branch `production`, database `neondb`). Manage it through the
  claude.ai **Neon connector**; the old user-scope `Neon` MCP entry with an API key is stale.
- Destructive SQL or Neon actions (drop, delete, reset, branch deletion) need explicit approval first.

## Gotchas

- Dev servers bind to **127.0.0.1** only; never expose 3000/8000 on the network.
- Docker must never receive Neon URLs (compose overrides both DB URLs; `migrate.ensure_same_database` guards migrations).
- SQLite returns naive datetimes stored as UTC: always go through `app/services/timeutil.as_utc`.
- `uvicorn --reload` on Windows sometimes misses changes: restart the API after schema/model edits.
- Port 5432 on this machine is another project's Postgres; don't use it.
- `C:\Users\Yaya` has its own `package.json`: run npm **only** with `frontend/` as the working directory.
- PowerShell here-strings don't pipe into `git commit -F -`; write the message to a file. PowerShell runs in
  constrained language mode, so use Python for scripts that need .NET methods.
- Tests must never reach Neon (in-memory SQLite, `dependency_overrides` for the API).

## Yearly rollover (June, when next season's fixtures appear)

1. Add promoted clubs to `team_registry.py` (check football-data.org `tla` codes and football-data.co.uk spellings).
2. Run refresh; confirm all 20 teams resolve and predictions exist.
3. After the season ends, re-run the backtest and update the model baseline above.
