# Sofix

Sofix is a private, single-user LaLiga fixture-difficulty and Sorare decision board. It combines an independently
backtested football model, bookmaker prices, the owner's Sorare collection and explicit lineup actions in a premium
white, installable web app.

Start here:

- [Illustrated user manual](docs/user_manual.md) — every page, control and extension action.
- [Whole-app research and audit](docs/research_report.md) — current implementation, evidence and every material
  inconsistency found during the 2026-09-27 review.
- [How the numbers work](docs/how_it_works.md) — refresh pipeline, model, six lenses, Sorare planner and API contract.
- [Architecture](docs/architecture.md), [data dictionary](docs/data_dictionary.md),
  [fixture-model research](docs/fixture_difficulty.md) and the [generated backtest](backend/reports/backtest_laliga.md).
- [Current execution plan](docs/next_features_plan.md) and [Sorare plan/history](docs/sorare_plan.md).

## Product surface

| Route | Purpose |
|---|---|
| `/` | One-screen LaLiga and Sorare gameweek briefing |
| `/play` | Optimized Sorare plans, reward chances, replay and Apply |
| `/fixtures` | Selected LaLiga gameweek fixture list |
| `/difficulty` | Six difficulty lenses, overview rankings and full grid |
| `/table` | Current table at the selected GW and seeded final projection |
| `/cards` | Current synced Sorare collection |
| `/players` | Cached LaLiga player/market index and squad-upgrade comparison |
| `/team/[code]` | One club's schedule, form and difficulty context |
| `/control` | Refresh health, schedule, limits, installation and extension setup |

The Chrome extension adds Sofix forecasts and the published plan to signed-in `sorare.com` pages, and lets the app
show the owner's real lineups under the Sorare gameweek where they were entered. It never receives a Sorare password
or session cookie. Lineup changes remain a deliberate **Check → Draft → Enter** flow.

## Production architecture

```text
football-data.org ──┐
football-data.co.uk ├─> GitHub Actions refresh ─> Neon/read_models ─> Next.js on Vercel ─> PWA
The Odds API ───────┤
Sorare GraphQL ─────┘

signed-in sorare.com tab <─> Chrome extension <─> Next.js extension endpoints
```

Production does not need a continuously running Python server. FastAPI is the local-development and typed-API
fallback. The Python job publishes complete page models to Neon and revalidates the app's one-hour caches.

## Repository map

| Area | Location |
|---|---|
| Refresh, sources and prediction | `backend/app/jobs/`, `backend/app/sources/`, `backend/app/modeling/` |
| Published models | `backend/app/services/publish.py`, `backend/app/sorare/publish.py` |
| Database/migrations | `backend/app/models.py`, `backend/migrations/` |
| Web app | `frontend/app/`, `frontend/components/`, `frontend/lib/` |
| Chrome extension | `extension/` |
| Tests | `backend/tests/`, `frontend/**/*.test.ts`, `frontend/e2e/` |
| Manual/research | `docs/`, `backend/reports/` |

## Run locally

Requirements: Python 3.11, Node.js/npm, and Chrome for browser tests. Copy `.env.example` to `.env`; never commit
real values. Without `DATABASE_URL`, Next.js falls back to local FastAPI.

```powershell
cd backend
py -3.11 -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.lock
.venv\Scripts\python -m app.migrate
.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. Dev servers stay on `127.0.0.1`.

## Verification

```powershell
# backend/
.venv\Scripts\python -m pytest -q
.venv\Scripts\ruff check .
.venv\Scripts\mypy

# frontend/ only
npm run lint
npm run typecheck
npm test
npm run e2e
npm run design
```

CI also checks migration/generated-type drift and dependency audits. See [AGENTS.md](AGENTS.md) for the contributor
contract.

## Data and attribution

- Fixtures/results/crests: football-data.org.
- Historical results, shots and closing odds: football-data.co.uk.
- Current bookmaker prices: The Odds API.
- Cards, rules, scores, projections and public market values: Sorare public GraphQL.
- Sofix ratings/recommendations are independent, not official LaLiga, bookmaker or Sorare ratings.
- Third-party art remains owned by its source and is hot-linked rather than redistributed.
- Personal, non-commercial use only. No Transfermarkt scraping, LaLiga logo or wordmark.
