# FixtureDiff

Personal **LaLiga fixture difficulty board**: every team's run of games, rated by a backtested rating model and
shown in a premium white grid. LaLiga has no official FDR, so difficulty comes from our own Dixon-Coles model.

- Product and model reference: [PLAN.md](PLAN.md)
- What's next, phase by phase: [docs/next_features_plan.md](docs/next_features_plan.md)
- Working rules for Claude Code (limits, gotchas): [CLAUDE.md](CLAUDE.md)

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 + React 19 + TypeScript (`frontend/`) |
| API | FastAPI (`backend/app/main.py`, `api.py`) |
| Data + model | Python 3.11 jobs (pandas, numpy, scipy) in `backend/app/jobs/` |
| Database | Neon Postgres (SQLAlchemy 2 + Alembic); SQLite fallback for local runs |
| Quality | pytest, ruff, mypy, ESLint, vitest; GitHub Actions CI |

## How it works

```
football-data.org ──┐                                        ┌─> GET /api/fixture-grid ──> Next.js board
football-data.co.uk ─┼─> python -m app.jobs.refresh ─> Neon ──┘
Open-Meteo ─────────┘    migrate → sync → predict → weather
```

1. **Sync** (`app.jobs.seed_and_sync`): fixtures, kickoff times and results from football-data.org; clubs resolved
   through `app/services/team_registry.py`.
2. **Predict** (`app.jobs.predict`): fits the Dixon-Coles model on football-data.co.uk history plus newly synced
   results, then writes one prediction per team per upcoming fixture (W/D/L, expected points, difficulty 0–100 and
   label, clean-sheet chance, expected goals).
3. **Weather** (`app.jobs.sync_weather`): Open-Meteo kickoff forecasts for the next 14 days (tooltip context only).

Difficulty for a team in a fixture: `EP = 3·P(win) + P(draw)`, `difficulty = 100 · (1 − EP/3)`, bucketed into
Easy / Easy-ish / Normal / Hard-ish / Hard with backtested thresholds. Model results:
[backend/reports/backtest_laliga.md](backend/reports/backtest_laliga.md).

## Run locally

```bash
cp .env.example .env    # add the football-data.org token and Neon URLs (see comments in the file)

cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements-dev.lock   # exact versions; or: uv pip sync requirements-dev.lock
python -m app.jobs.refresh             # migrations, fixtures, predictions, weather
uvicorn app.main:app --port 8000       # http://127.0.0.1:8000/api/fixture-grid

cd ../frontend
npm ci
npm run dev                            # http://127.0.0.1:3000
```

## Everyday commands

| Task | Command (backend from `backend/`, frontend from `frontend/`) |
|---|---|
| Refresh data | `python -m app.jobs.refresh` |
| Backtest / retune the model | `python -m app.jobs.backtest` (writes `reports/` and `artifacts/dixon_coles.json`) |
| Schema change | edit `app/models.py` → `alembic revision --autogenerate -m "..."` → review → `python -m app.migrate` |
| Backend checks | `pytest -q`, `ruff check .`, `ruff format --check .`, `mypy` |
| Frontend checks | `npm run lint`, `npm run typecheck`, `npm test` |

## Data sources and credits

Fixtures and results: [football-data.org](https://www.football-data.org). Match history and odds:
[football-data.co.uk](https://www.football-data.co.uk). Weather: [Open-Meteo](https://open-meteo.com) (CC BY 4.0).
Free-tier limits and how the code respects them are listed in [CLAUDE.md](CLAUDE.md).
