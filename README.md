# La Liga Fixture Difficulty MVP

A working scaffold for a **full-data** fixture-difficulty product.

## Stack
- Next.js + TypeScript UI
- FastAPI/Python data + modeling layer
- PostgreSQL
- scikit-learn baseline; Poisson + market ensemble hooks

## Implemented
- database schema for every researched feature family
- football-data.org adapter
- Football-Data.co.uk historical La Liga + odds adapter
- StatsBomb Open Data adapter
- Open-Meteo adapter
- RFEF PDF review helper
- authorized/manual import schemas for injuries, current xG, squads and managers
- internal Elo
- Poisson probabilities
- multinomial logistic training script
- 0–100 difficulty score and Easy / Easy-ish / Normal / Hard-ish / Hard
- Next.js difficulty matrix

## Run
```bash
cp .env.example .env
# add your free football-data.org token (https://www.football-data.org/client/register)

cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
python -m app.jobs.refresh          # fixtures → rating-model predictions → weather
uvicorn app.main:app --reload       # http://localhost:8000/api/fixture-grid

cd ../frontend
npm install
npm run dev                         # http://localhost:3000
```

Database: Neon Postgres project **FDR** (AWS Frankfurt, branch `production`, database `neondb`).
`.env` holds `POSTGRES_URL` (pooled host, used by the app) and `POSTGRES_MIGRATION_URL` (direct host, used by
Alembic). Without them the backend falls back to SQLite at `backend/fixture.db`.

Schema changes go through Alembic (run from `backend/`): edit `app/models.py`, then
`alembic revision --autogenerate -m "what changed"`, review the file in `migrations/versions/`, and apply with
`python -m app.migrate` (the refresh job also applies pending migrations).

Model: `python -m app.jobs.backtest` tunes and scores the Dixon-Coles rating model and writes
`backend/reports/backtest_laliga.md` and `backend/artifacts/dixon_coles.json` (used by `predict`).

## Model definition
From the selected team's perspective:
`EP = 3*P(win) + P(draw)`
`difficulty = 100*(1 - EP/3)`

## Pipeline steps
`app.jobs.refresh` runs these in order; each also runs on its own:

```bash
python -m app.jobs.seed_and_sync   # football-data.org fixtures/results; teams via app/services/team_registry.py
python -m app.jobs.predict         # Dixon-Coles fit on football-data.co.uk history + synced results
python -m app.jobs.sync_weather    # Open-Meteo kickoff weather, next 14 days (context only)
```

`predict` writes **two perspective-specific rows per future fixture**: W/D/L, expected points, difficulty
and label, clean-sheet probability and expected goals for/against.

## Remaining enrichment work
1. recalibrate clean-sheet probabilities (about 4 points high in backtests);
2. Segunda División history for promoted-team priors;
3. UEFA/Copa del Rey fixtures for rest-day context;
4. authorised current xG and player availability data;
5. hosted Postgres + migrations, scheduled refresh.

Do not train five subjective difficulty classes directly. Train W/D/L probabilities, calibrate them,
derive expected points, then map the continuous score into labels.
