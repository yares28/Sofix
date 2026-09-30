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
- Overlay numbers are gated by the extension token; matching the signed-in Sorare account to the owner is not enforced
  yet. No write buttons in overlay; it opens Apply in Sofix.
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

- Accepted holdout baseline: production RPS **0.1947**, closing odds 0.1886, Elo benchmark 0.2050, base 0.2255 on
  8,339 2023/24–2025/26 forecasts. Settled by a canonical rerun on 2026-09-28, which reproduced the tuned config
  byte for byte. 0.1953 is the same model **without** the shipped rating spread — the blind-settings figure for that
  window — and is not the production baseline.
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
| Understat | No API, no key; unofficial | One request per league per refresh, only leagues the owner has players in; clear user agent; a failure leaves xG out, never an old number |
| Futbol Fantasy | No API; its robots.txt blocks nothing; unofficial | Read by match before each plan ([plans/futbolfantasy.md](plans/futbolfantasy.md)): the round page of LaLiga, Champions League, Europa League and Copa del Rey, then every LaLiga match and the others with a Spanish club or one of the owner's clubs; two seconds apart, a 240-second budget, stop after three unreadable pages in a row; a match read in the last 25 minutes is not asked for again; clear user agent; a page it cannot read keeps its last reading for 24 hours and then falls back to Sorare's number, never a guess. Its chance is the main start % in the forecast, the plans and the overlay (FF → Sorare → Sofix). It runs at every refresh, including the half-hourly `near-lock.yml` checks in the last three hours before a lock; the extension's own live reads and the pages that show its lineups are not built yet and join this row when they are. Attribution: every number of its on screen links to its match page |
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

## Engineering operating rules (free-first)

The general contract is the global `~/.claude/rules/engineering-os.md`; if it is missing, these are the rules that bind
this repo. Precedence: this file, then the global rules.

- **€0 incremental spend.** Never upgrade Neon/Vercel/GitHub/Odds API/Firecrawl/Context7/Figma, buy credits, enable
  pay-as-you-go, raise a cap or attach a payment method. Quota/402/429 → back off, use cache or the local fallback, report
  only what it blocks. Limits table above is the current contract.
- **Local first.** Run affected pytest/vitest → `npm run typecheck` → `npm run lint` → build → browser
  (`npm run e2e`, `npm run design`) before pushing; batch, push once, then read CI. CI/Vercel are not debuggers; one
  coherent preview, no redeploy per edit. No polling GitHub; use local git for local code.
- **Production Neon is read-only** for agents (`fdr_app` is DML-only). Test on local/dev data; seed deterministically.
  No seeding, truncating, deleting or speculative migrations on production; migrations follow `backend/migrations/`.
- **Tests:** test-first for behavior changes (rules, regressions, contracts), no coverage-padding. Bug fix = failing
  regression test first. Report pre-existing failures separately; never claim "all pass" if any fail.
- **Browser proof for UI:** desktop + mobile screenshots of the affected state, semantic selectors, no horizontal
  overflow. Authenticated Sorare flows use the extension test path only; never print or commit tokens/cookies.
- **Paid/side-effecting APIs** (Odds API 500/month, Sorare, any AI inference): fixtures/mocks; one batched real call at most.
- **Subagents/tools sparingly:** main context for small work; Context7 1–3 queries, Firecrawl ~3–5 pages, Figma only for
  a real source-of-truth frame. Reuse results within a task.
- **Final report:** Implemented / Verified / Notes, stating exactly which checks ran and which were unavailable.

## Yearly rollover

1. Add promoted clubs and source/Sorare aliases to the registry.
2. Refresh and confirm 20 clubs, predictions and LaLiga squad index.
3. Regenerate fixed preseason projection.
4. After season, rerun blind backtest and update only if gates pass.
