# Upgrade audit — 2026-09-14

Deep dive across security, backend/data/ops, frontend/UX, and the rating model. Sources:
- three read-only reviews (security, backend architecture, frontend)
- measurements on live data (Neon) and on the three backtest test seasons

Items already in [next_features_plan.md](next_features_plan.md) are only repeated where the audit changes them.

**Priority key:** 🔴 do now · 🟠 before scheduling or deploying · 🟡 next · ⚪ later

---

## 1. Security and compliance

| | Finding | Evidence | Fix |
|---|---|---|---|
| 🔴 | **Next.js 15.5.2 has critical RCE advisories** (CVE-2025-66478 flight protocol; GHSA-p293-qw3h-jr36 unauthenticated RCE on Windows hosts; image optimiser RCE), and **`next dev` listens on `0.0.0.0:3000`** | `frontend/package.json`; netstat; `npm audit` lists 31 Next advisories | `npm i next@15.5.25 --save-exact` (latest 15.x, clears all Next advisories); `next dev -H 127.0.0.1` / `next start -H 127.0.0.1` |
| 🔴 | **Docker Compose runs migrations against Neon production.** `env_file: .env` passes `POSTGRES_MIGRATION_URL`, which wins over the local override | `docker-compose.yml:12-15`, `migrations/env.py:19` | Override `POSTGRES_MIGRATION_URL` in compose (or use a separate `.env.docker`); make `env.py` refuse mismatched hosts |
| 🔴 | **Nothing is committed to git.** No history and no backup of any of this work | `git status`: all untracked | First commit after a secret scan (the audit found no secret values in trackable files); ignore `backend/reports/*.log`, `*.joblib`, `frontend/tsconfig.tsbuildinfo` |
| 🔴 | **Open-Meteo CC BY 4.0 attribution missing** while weather is live in the tooltip | no "Open-Meteo" string in `frontend/` | Footer: "Weather data by Open-Meteo.com" |
| 🟠 | **Starlette 0.47.3** (via `fastapi==0.116.1`) has 6 CVEs (Range DoS, Host/URL validation, form limits) | `pip-audit` | `fastapi==0.141.1` (Starlette 1.6), `uvicorn[standard]==0.52.4`, `pydantic==2.13.5`, `sqlalchemy==2.0.52`, `psycopg[binary]==3.3.5` (resolve together on Python 3.11) |
| 🟠 | **App connects as `neondb_owner`** for everything; local dev writes to production | `.env`, `app/db.py` | Role `fdr_app` with DML only for `POSTGRES_URL`; owner only for migrations; Neon `dev` branch for local work |
| 🟠 | **Planned refresh route would be an unauthenticated trigger** (cross-site "simple" POST to `localhost:3000/api/refresh`) | `next_features_plan.md` §3 | Require `Sec-Fetch-Site: same-origin` + custom header in the route; `hmac.compare_digest`; ≥32-byte token; run refresh as a subprocess, not a thread under `--reload` |
| 🟠 | **Docker hardening:** ports on all interfaces, root users, dev servers in images, `postgres:16` vs Neon 18, default DB password | `Dockerfile`s, compose | `127.0.0.1:` port binds, non-root users, production builds (`next build` standalone, no `--reload`), `${POSTGRES_PASSWORD:?}` |
| 🟡 | `pypdf==6.0.0` (40 DoS CVEs) and pickle loading in `services/model.py`, both in dead code | `requirements.txt`, `rfef.py`, `model.py` | Delete with the dead code (§3) |
| 🟡 | No security headers; public `/docs` and `/openapi.json`; `sslmode=require` doesn't verify the certificate; `vitest 3.2.4` advisories | `next.config.mjs`, `main.py`, `.env` | CSP / `nosniff` / `Referrer-Policy`, `poweredByHeader: false`; disable docs outside dev; `sslmode=verify-full&sslrootcert=system`; `vitest@3.2.7`+ |

Clean: no raw SQL, no `dangerouslySetInnerHTML`, CORS GET-only without credentials, `.env` files git-ignored, no secret values found in trackable files.

---

## 2. Data pipeline reliability

| | Finding | Evidence | Fix |
|---|---|---|---|
| 🟠 | **An unknown club aborts the whole sync.** The registry lacks likely promoted sides (Sporting, Zaragoza, Eibar, Huesca…); the 2027/28 fixtures (published ~June) will stop updates | `team_registry.require_code` raises inside the sync transaction | Create unknown teams with neutral defaults + warning; yearly "add promoted clubs" checklist |
| 🟠 | **Season rollover breaks predict for weeks.** The new season's CSV 404s until matchday 1; promoted teams come out empty | `predict.py:98`, `football_data_co_uk.py:36`, `backtest/data.promoted_teams` | Treat a 404 as "no rows yet", fall back to the cache, derive promoted teams from DB fixtures; rollover test |
| 🟠 | **No automatic refresh** | no scheduler anywhere | GitHub Actions cron running `python -m app.jobs.refresh` directly (non-zero exit → email alert), cached `data/raw`; after the next row |
| 🟠 | **Silent fallbacks:** a missing `POSTGRES_URL` quietly uses SQLite; a missing tuned config quietly uses different model settings; the model version never changes | `config.py:8`, `rating_predictions.load_config` | `APP_ENV`; fail without an explicit DB URL outside dev; fail without `artifacts/dixon_coles.json`; model version = `dixon-coles-v1+<config hash>` |
| 🟠 | **Steps aren't isolated or retried:** a football-data.org outage also skips predict and weather; no payload validation (Champions League knockouts have null team IDs) | `refresh.py`, `football_data_org.py`, `seed_and_sync.py` | Per-step try/except with status and counts; retry 429/5xx with backoff; pydantic payload models |
| 🟠 | **No DB-level concurrency safety:** `fixtures.source_fixture_id` and `weather_snapshots.fixture_id` aren't unique; advisory session locks don't work through Neon's pooler | `models.py`, baseline migration | Unique constraints; lock via a partial unique index on `refresh_runs(status) WHERE status='running'` |
| 🟠 | **Tests could reach Neon:** `app.db` builds an engine from `.env` on import | `db.py:15`, `tests/conftest.py` | Force `POSTGRES_URL=sqlite://` in `conftest.py` before importing `app`, plus a guard |
| 🟡 | History ↔ registry names never cross-checked; a spelling mismatch double-counts matches | `predict.recent_results_frame`, `merge_recent_results` | Validate that every current-season CSV team resolves; warn loudly |
| 🟡 | Wasted writes and stale state: `source_updated_at` rewritten on all 380 fixtures each sync; fixtures dropped from the API stay as ghosts; weather not cleared when a fixture leaves the forecast window; the current-season CSV is re-downloaded every run | `seed_and_sync.py`, `sync_weather.py`, `predict.py` | Update only changed rows; mark missing fixtures; clear stale weather; conditional GET (co.uk updates Tue/Fri) |
| 🟡 | Neon budget: page caching planned as `revalidate: 300` still wakes Neon every 5 minutes while browsing; an uptime monitor on a DB endpoint would burn ~182 CU-h/month (over the 100 limit) | plan §2, `api.py` | Tag-only revalidation from refresh (or ~1 h); keep `/api/health` DB-free; optionally precompute the grid JSON at refresh (1 query per view) |

---

## 3. Codebase hygiene

| | Finding | Fix |
|---|---|---|
| 🟡 | **Dead scaffold code:** `feature_builder.py`, `features.py`, `feature_schema.py`, `model.py`, `poisson.py`, `entity_resolver.py`, `jobs/train.py`, `enrich_fdata_current.py` (also leaks closing odds), `import_manual_csv.py`, `bootstrap.py`, `sources/rfef.py`, `statsbomb_open.py`, `manual_imports.py`, `/api/difficulty` (~240 queries per call, unused) | Delete. Keep `services/elo.py` for the backtest baseline |
| 🟡 | **Unused tables/columns:** `players`, `player_match`, `availability_snapshots`, `context_snapshots`, `feature_snapshots`, `odds_snapshots`, `team_match_stats` (rebuilt every sync, never read), plus several dead columns; `source_entity_map` unique key on the wrong column | One Alembic migration to drop them; fix the key to `(entity_type, source, source_id)`. Remove `scikit-learn`, `joblib`, `pypdf` and the `WEIGHT_*`/`MODEL_PATH` settings |
| 🟡 | **No CI, lint, formatter, type checks or lock files**; Python 3.11 venv vs 3.12 Docker | GitHub Actions: pytest, ruff check/format, mypy (gradual), `npm test`, `tsc`, ESLint; `uv pip compile` lock; `.python-version` |
| 🟡 | **Missing tests:** `refresh.main`, `predict.main`, `sync_weather.main`, `migrate.py`, `grid_meta` on Postgres; no migration-drift check; frontend has 10 unit tests and no Playwright despite your rules | Alembic upgrade + `alembic check` test; Playwright for load, lens, window, sort, pin, error state |
| ⚪ | Type drift between `schemas.py` and `frontend/lib/types.ts`; `meta` untyped; no exception handler (a suspended Neon gives a bare 500) | Typed `GridMeta`; generate TS types from `/openapi.json`; 503 handler returning the envelope |
| ⚪ | Docs describe the old scaffold (scikit-learn, StatsBomb, RFEF) | Update `README.md` and `PLAN.md` after the cleanup |

---

## 4. Rating model (measured on 2023/24–2025/26, 8,339 forecasts)

| | Finding | Numbers | Upgrade |
|---|---|---|---|
| 🟡 | **Too cautious about favourites.** The largest single weakness | Model 60–70% → actual **74%**; 70–80% → **86%**; 80%+ → **93%** | Outcome sharpening (temperature/power on log-odds), ridge below 1.0, more weight on goals vs the shot proxy; tune on 2019–22 and check with bootstrap CIs (plan 5.1–5.4) |
| 🟡 | **Promoted teams are learned too slowly after the first weeks** | Gap to market: promoted matches after week 8 **+0.0111 RPS** vs **+0.0058** for others; early weeks are fine (−0.0010) | Segunda (`SP2`) history with a division offset; promoted-team prior tuned per season stage; faster decay for teams with little top-flight data (plan 5.5) |
| 🟡 | **Expected goals squeezed toward the middle** | Predicted 0.67 → actual 0.79 at the low end; 2.72 → 3.00 at 2.5–3.0; only >3.0 runs high (3.18 → 2.78, n = 69) | Same fix as favourites; cap/shrink λ above ~3 for promoted opponents (live example: Barcelona v Racing 3.92 xG) |
| 🟡 | **Market disagreement is large often enough to matter** | Next-week home-win gap: mean **5.1 pts**, **12.5%** of matches > 10 pts | Blend pre-match odds for horizon 1 (plan 5.6). `fixtures.csv` has Bet365/average/max only (no Pinnacle) and updates Tue/Fri |
| 🟡 | **Clean sheets ~4 pts high** | Backtest calibration table | Logistic recalibration (plan 5.2) |
| ⚪ | Outcome shares are fine | Home 45.0/46.0, draw 25.3/25.9, away 29.8/28.1 (model/actual %) | — |

---

## 5. Frontend, UX and accessibility

| | Finding | Evidence | Fix |
|---|---|---|---|
| 🔴 | **Tile colour and tooltip label disagree on 5 live fixtures.** The frontend recomputes the bucket from a score rounded to 1 decimal (e.g. 48.6 labelled Normal, painted Easy-ish) | `lib/grid.ts:11-25`, `fixture_grid.cell_prediction` | Backend sends `bucket` next to `label` (plus attack/defence cut points in `meta`); delete the duplicated thresholds |
| 🟠 | **Difficulty readable only by colour and mouse hover.** Deuteranopia: buckets 2 vs 4 luminance ratio 1.03; tiles aren't focusable; tooltip mouse-only; screen readers get "GET Home" | `FixtureCell.tsx`, `Tooltip.tsx`, `FixtureBoard.tsx:213` | Bucket number on each tile; tiles as buttons with `aria-label`; tooltip on focus/tap with Esc to close |
| 🟠 | **Contrast failures:** venue text 2.9–3.4:1, white on bucket 1 4.32:1, `--ink-3` 2.3–2.6:1; sort headers not keyboard-operable, no `aria-sort`; search has no focus ring or label | `globals.css`, `FixtureBoard.tsx` | Per-bucket venue colours, darker bucket 1 (`#1f7a4f`), `--ink-3` → `#86868b`; `<button>` in `<th>` + `aria-sort`; `:focus-within`, `aria-label` |
| 🟠 | **Phones:** a single breakpoint at 960 px; at 390 px about 1.7 tiles fit beside the 190 px team column; toolbar wraps into ~5 rows | `globals.css:118,133,162,209` | ≤600 px layout: crest + code only (~64 px column), 52 px tiles, one scrolling control row |
| 🟡 | **Opens on a matchday that's 18/20 finished**; run averages mix in leftover games | `FixtureBoard.tsx:38` | Start at the first matchday that is mostly unplayed; "Show played" toggle |
| 🟡 | **Numbers don't match fantasy planning:** blanks look easier, doubles aren't credited; `expected_points` unused; pins only fade rows; headers scroll away; no URL state or saved pins; no team page | `grid.runStats`, `.board{overflow:hidden}` | Expected-points-sum sort with blank = 0 and ×2 badges; pinned rows float to the top; sticky headers; URL state + localStorage; `/team/[code]` |
| 🟡 | **Too many scales and too much above the grid:** 0–100, 1–5 legend, labels, xG/%; legend says Easy/Hard on attack/defence lenses; grid starts ~500 px down (1000 px on phones) | `FixtureBoard.tsx` | One visible scale; per-lens legend; compact hero + chip insights |
| 🟡 | No `loading.tsx`/`error.tsx`; unvalidated API payload; unguarded indexing; weak stale-data signal | `app/page.tsx` | Skeleton + error boundary; Zod validation (your rules); stale-data pill after 24–36 h; `noUncheckedIndexedAccess` |
| ⚪ | Performance and polish: whole grid serialised into the page; per-keystroke rerenders; segmented thumb pops in after hydration; no reduced-motion; Inter never loaded (Windows shows Segoe UI); 9–11 px text; "· TBC" on most tiles; duplicated colour tokens; `FixtureBoard.tsx` 338 lines | review | Slim payload / per-fixture details; `useDeferredValue` + memoised rows; CSS fallback for selected state; `prefers-reduced-motion`; `next/font` Inter; 11–12 px floor; TBC marked once per column; split components |

Note: one reviewer reported the API as uncompressed. That was its request, which didn't ask for gzip; with `Accept-Encoding: gzip` the grid is 24 KB.

---

## Recommended order

1. **Safety (≈1 h):** Next.js 15.5.25 + localhost binding; compose migration URL; first git commit; Open-Meteo attribution; colour/label bucket bug.
2. **Reliability before scheduling (≈1 day):** unknown-club and rollover handling; fail-loud config; per-step isolation and retries; unique constraints; tests pinned to SQLite; then the scheduled refresh and the refresh button (with the route protections above).
3. **Cleanup (≈½ day):** delete dead code and tables, upgrade FastAPI/Starlette, CI with lint, tests and types.
4. **Model (iterative):** favourite sharpening → promoted teams with SP2 → market blend → clean-sheet calibration, each gated by bootstrap CIs.
5. **UX:** accessibility (non-colour encoding, keyboard/touch, contrast) → mobile layout → fantasy-planning features → loading/error states and polish. Club crests (planned) fit here.
