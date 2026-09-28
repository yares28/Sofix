# Sofix contributor instructions

Sofix is a private, single-user **LaLiga fixture-difficulty and Sorare decision board**. The English UI uses premium
white styling and `GW` / `Gameweek` wording. Ratings/recommendations are independent and documented.

Read [PLAN.md](PLAN.md), the [user manual](docs/user_manual.md), [research report](docs/research_report.md),
[calculation guide](docs/how_it_works.md) and current [football](docs/next_features_plan.md) /
[Sorare](docs/sorare_plan.md) plans before changing behavior.

## Architecture

```text
football-data.org ──┐
football-data.co.uk ├─> GitHub Actions/Python ─> Neon normalized rows + read_models ─> Next.js/Vercel/PWA
The Odds API ───────┤
Sorare GraphQL ─────┘

signed-in sorare.com <─> allowlisted Chrome extension <─> Next.js extension routes
```

Production does not run FastAPI continuously. It is the local/typed API fallback. Python publishes `grid`, `system`,
`sorare`, `sorare_references`; Next.js reads with server-only `DATABASE_URL`.

| Area | Where |
|---|---|
| API/schema | `backend/app/main.py`, `api.py`, `schemas.py` |
| Refresh/publish | `backend/app/jobs/refresh.py`, `services/publish.py`, `.github/workflows/refresh.yml` |
| Grid/labels/scales | `backend/app/services/fixture_grid.py` |
| Football model | `backend/app/modeling/dixon_coles.py`, `backend/artifacts/` |
| Odds | `jobs/sync_odds.py`, `sources/the_odds_api.py`, `services/market_odds.py` |
| Sorare | `backend/app/sorare/`, `backend/app/jobs/sorare.py` |
| DB/migrations | `backend/app/models.py`, `backend/migrations/` |
| Web | `frontend/app/`, `frontend/components/`, `frontend/lib/` |
| Extension | `extension/` |

## Commands

From `backend/` (Python 3.11 venv `.venv`):

```powershell
.venv\Scripts\python -m app.jobs.refresh
.venv\Scripts\python -m app.jobs.refresh --skip-migrations
.venv\Scripts\python -m app.jobs.backtest
.venv\Scripts\python -m app.migrate
.venv\Scripts\alembic revision --autogenerate -m "what changed"
.venv\Scripts\python -m pytest -q
.venv\Scripts\ruff check .
.venv\Scripts\ruff format .
.venv\Scripts\mypy
.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

From `frontend/` only:

```powershell
npm run dev
npm test
npm run typecheck
npm run lint
npm run e2e
npm run design
npm run gen:types
```

Extension from root: `node extension/scripts/configure.mjs`; load `extension/` unpacked. Generated `config.js` and
`manifest.json` are ignored and secret-bearing.

## Product/UI rules

- One date-selected week drives all pages; LaLiga and Sorare GW numbers are separate.
- UI says GW/Gameweek, not MD/Matchday. Store UTC, display Madrid; missing kickoff is “Date TBC”.
- Routes: `/`, `/play`, `/fixtures`, `/difficulty`, `/table`, `/cards`, `/players`, `/control`, `/team/[code]`.
- Six lenses: Overall, Attack, Defence, Record, Vs odds, Odds. Backend owns bucket/label/scales.
- Labels: Very favourite, Favourite, Even, Underdog, Big underdog. Tiles do not show bucket numbers.
- Model lenses sum future values; Record/Vs odds/Odds compare per-eligible-game averages.
- Finished fixtures stay for review but leave future totals/scales.
- Current table stops after selected GW; H2H only after both mutual games. Projected table is seeded.
- Cards/Players are current snapshots. Market value is cached, not a listing; projection-if-playing differs from xScore.
- A Sorare game must name the side actually playing (`team`/`teamCrest`) and the opponent. Never label a national-team
  fixture with the player's club or invent match odds outside LaLiga; show player Play/xScore evidence instead.
- Page is fluid to 1600 px; below 1200 ranking/table stack; preserve named container queries.
- Keep semantic controls, focus, reduced motion and text alternatives; lint allows zero warnings.

## Sorare safety

- Public GraphQL is read-only; never add password/login handling.
- Apply remains Check → Draft → explicit Enter. Nothing automatically writes/retries.
- Only identity, entered, check, draft and enter operations; keep allowlists in worker and page bridge.
- Private overlay is account-matched. No write buttons in overlay; it opens Apply in Sofix.
- xScore is heuristic until S4 passes blind comparison. Cash/essence never convert. Reward percentages have documented
  spread/correlation assumptions.

## Data/schema/cache

- `models.py` → autogenerate → review → Neon dev migrate/test → manual production owner migrate. Never `create_all` Neon.
- Unattended jobs use `--skip-migrations` and DML-only app role.
- Replace current rows/read models; append only intentional run/replay history.
- One refresh at a time; ten-minute button cooldown.
- One-hour DB-backed cache + post-publish revalidation. No client polling or DB uptime monitor.
- Schema change: Pydantic → OpenAPI export → `npm run gen:types` → Zod → typecheck. Never hand-edit generated JSON/TS.
- SQLite datetimes are naive UTC; use `services/timeutil.as_utc`.

## Model rules

- Accepted holdout baseline: production RPS 0.1953, closing odds 0.1886, Elo benchmark 0.2050, base 0.2255 on 8,339
  2023/24–2025/26 forecasts. Generated report also prints tuned/spread 0.1947; settle by canonical rerun before release.
- Tune only 2019/20–2022/23. Ship only if matchday-bootstrap RPS CI excludes zero, or calibration improves with no loss.
- Known: 60–70% favourites under-confident, promoted teams slow after week 8, raw CS high (calibrator corrects CS).
- Artifact, refresh, report and baseline text change together.

## Limits

| Service | Contract | Rule |
|---|---|---|
| football-data.org | 10/min, LaLiga + CL | One matches call; backoff; never per-match loop |
| football-data.co.uk | Free CSV, Tue/Fri | Cache history; conditional current; tolerate new-season 404 |
| The Odds API | 500/month; call costs 2 | One ≥6-hour batch; never log key URL/raw error |
| Sorare | Read-only/rate/complexity limits | Batch/reuse; session actions extension-only |
| Neon Free | 0.5 GB, 100 CU-hours/month | Publish/cache; no uptime monitor |
| Third-party art | External ownership | Hot-link; personal use; no LaLiga mark |

Weather/Open-Meteo is removed. Transfermarkt scraping is prohibited.

## Secrets/gotchas

Python/root: `POSTGRES_URL`, owner-only `POSTGRES_MIGRATION_URL`, football/odds/Sorare keys, `SORARE_USER`, `APP_URL`,
`REVALIDATE_SECRET`, `VERCEL_BYPASS_SECRET`, local `REFRESH_TOKEN`. Vercel: `DATABASE_URL`, `GITHUB_TOKEN`, optional
`GITHUB_REPO`, `REVALIDATE_SECRET`, `EXTENSION_TOKEN`, optional `EXTENSION_DIR`, crest flag. Never print/commit values.

Neon production uses `fdr_app` DML-only, verify-full TLS. Destructive SQL/branch actions need explicit approval.
Dev binds `127.0.0.1`; no Docker; port 5432 belongs elsewhere; run npm only from `frontend/`; Windows reload may miss
model/schema edits. Preserve unrelated work. Commits: `<type>: <description>`.

## Yearly rollover

1. Add promoted clubs and source/Sorare aliases to the registry.
2. Refresh and confirm 20 clubs, predictions and LaLiga squad index.
3. Regenerate fixed preseason projection.
4. After season, rerun blind backtest and update only if gates pass.
