# Sofix — execution plan

One plan for everything that's next:
- the requested features: club crests, refresh button, Neon, `CLAUDE.md` guardrails, model optimisation
- every finding from the deep-dive audit

Evidence and measurements for each audit item are in [upgrade_audit.md](upgrade_audit.md). Limits were checked on 2026-09-14.

**Status key:** ✅ done · ⬜ to do. **Size:** S ≤ 1 h · M ≈ half a day · L ≈ a day or more.

---

## Decisions (answered 2026-09-14)

| Topic | Decision | Consequence |
|---|---|---|
| Use | **Personal, non-commercial**, single user (the owner) | Open-Meteo free tier allowed (attribution required); crests on by default |
| Refresh button | Only the owner uses it | Server-side token + same-origin checks; no accounts; 10-min cooldown protects free API tiers |
| Database | **Neon Postgres** (not Convex) | Python batch jobs + SQL fit Postgres; Convex would mean a rewrite |
| Neon region | AWS Frankfurt | Irrelevant for one user; can't be changed later without a new project |

## Phase overview

| Phase | Theme | Depends on | Size |
|---|---|---|---|
| 0 | Safety fixes (critical issues) | — | S–M |
| 1 | Guardrails: `CLAUDE.md` | 0 | S |
| 2 | Cleanup, dependency upgrades, CI | 0 | L |
| 3 | Data pipeline reliability | 2 | L |
| 4 | Refresh button, scheduled refresh, caching | 3 | L |
| 5 | Frontend: correctness, accessibility, mobile, crests, planning features | 0 (5.1 needs a backend change) | L |
| 6 | Model optimisation | 2 (CI) — runs offline in parallel with 4–5 | L, iterative |
| 7 | Later / polish | — | — |

Work order: **0 → 1 → 2 → 3 → 4**, with **5** and **6** interleaved once 2 is done.

---

## Phase 0 — Safety fixes ✅ (done 2026-09-14, commit bcec78b)

| ID | Task | Files | Done when |
|---|---|---|---|
| 0.1 | ✅ Upgrade Next.js to **15.5.25** (clears CVE-2025-66478, the Windows RCE and the image-optimiser RCE); bind dev/start to **127.0.0.1**; optionally `react`/`react-dom` 19.1.9 | `frontend/package.json` | `npm audit --omit=dev` shows no Next advisories; `netstat` shows `127.0.0.1:3000` only; app works |
| 0.2 | ✅ _(superseded: Docker removed 2026-09-14; the migration guard stays)_ Stop Docker Compose reaching Neon production: override `POSTGRES_MIGRATION_URL` (or a separate `.env.docker`); `migrations/env.py` refuses when migration and app hosts differ | `docker-compose.yml`, `backend/migrations/env.py` | Compose config shows no Neon host; mismatched hosts raise before any DDL |
| 0.3 | ✅ **First git commit:** secret scan (e.g. `gitleaks detect --no-git`); extend `.gitignore` (`backend/reports/*.log`, `*.joblib`, `frontend/tsconfig.tsbuildinfo`, `.claude/`); redact the Neon project id from docs | `.gitignore`, `docs/*`, `README.md` | Clean scan; commit on a `main` branch |
| 0.4 | ✅ **Colour/label mismatch:** backend sends `bucket` (1–5) next to `label`, and attack/defence cut points in `meta`; frontend renders from them; delete duplicated thresholds | `services/fixture_grid.py`, `schemas.py`, `frontend/lib/grid.ts` | The 5 known mismatches (e.g. 48.6 "Normal") render with matching colour; test added |
| 0.5 | ✅ **Open-Meteo attribution** (CC BY 4.0) in the page footer | `frontend/components/FixtureBoard.tsx` | "Weather data by Open-Meteo.com" visible with a link |

---

## Phase 1 — `CLAUDE.md` guardrails

| ID | Task | Done when |
|---|---|---|
| 1.1 | ✅ Repo-root `CLAUDE.md` with the content below | File exists; reviewed against this plan |

**Project facts**
- LaLiga fixture difficulty app; English UI; white Apple-style design; FPL was only the UI reference
- Stack: FastAPI + SQLAlchemy + Alembic (`backend/`), Next.js 15 (`frontend/`), Neon Postgres project FDR (branch `production`)
- Commands:
  - `python -m app.jobs.refresh`
  - `python -m app.jobs.backtest`
  - `python -m app.migrate`
  - `alembic revision --autogenerate`
  - `pytest`
  - `npm test`
  - `npm run typecheck`
- Model baseline to beat: test RPS **0.1953** (closing odds 0.1886, Elo 0.2050). Changes ship only with a bootstrap confidence interval that excludes 0.

**Free-tier limits and rules**

| Service | Free limit | Rule |
|---|---|---|
| football-data.org | **10 requests/min**; LaLiga + Champions League only | One matches call per refresh; ≥ 10-min cooldown; retry 429 with backoff; never loop per match |
| football-data.co.uk | Free CSVs; results + `fixtures.csv` (Bet365/avg/max odds, no Pinnacle) updated Tue ~13:00 / Fri ~17:00 UK | Disk cache; conditional re-download of the current season only; a 404 for a new season means "no rows yet" |
| Open-Meteo | Non-commercial: **600/min, 5,000/h, 10,000/day, 300,000/month**; **CC BY 4.0 attribution** | ≤ 1 call per stadium per refresh; attribution always visible |
| Neon Free | **0.5 GB/project, 100 CU-h/month**, up to 2 CU, scale to zero after 5 min, 10 branches, 6 h history, 5 GB egress. **Hitting any limit suspends compute until next month** | Cache the grid; revalidate only after refresh; replace rows instead of appending; never point uptime monitors at DB-backed endpoints (≈182 CU-h/month); keep `/api/health` DB-free |
| Club crests | No licence stated; club trademarks | Personal use only, behind `SHOW_CLUB_CRESTS`; allowlist `crests.football-data.org`; no bulk download |
| StatsBomb Open Data | LaLiga to 2020/21, Barcelona only | Research only |

**Gotchas**
- Dev servers bind to `127.0.0.1` only.
- No Docker: the app runs directly on this machine against Neon.
- SQLite returns naive datetimes: use `app/services/timeutil.as_utc`.
- Port 5432 on this machine is another project's Postgres.
- `C:\Users\Yaya` has its own `package.json`: run npm only from `frontend/`.
- Tests must use SQLite, never Neon.
- Secrets only in `.env`; never print them.
- **Yearly rollover checklist (June):** add promoted clubs to `team_registry.py`; check football-data.org `tla` codes; re-run the backtest after the season ends.

---

## Phase 2 — Cleanup, dependency upgrades, CI

| ID | Task | Files | Done when |
|---|---|---|---|
| 2.1 | ✅ **Delete dead scaffold code:** `feature_builder.py`, `features.py`, `feature_schema.py`, `model.py`, `poisson.py`, `entity_resolver.py`, `jobs/train.py`, `enrich_fdata_current.py`, `import_manual_csv.py`, `bootstrap.py`, `sources/rfef.py`, `statsbomb_open.py`, `manual_imports.py`, unused helpers in `football_data_co_uk.py`/`football_data_org.py`, `/api/difficulty` + `SofixicultyOut` | `backend/app/*` | Imports from `main`, `refresh`, `backtest` still resolve; tests pass; `elo.py` kept for the backtest |
| 2.2 | ✅ **Drop unused tables/columns** in one migration: `players`, `player_match`, `availability_snapshots`, `context_snapshots`, `feature_snapshots`, `odds_snapshots`, `team_match_stats` (and its rebuild in sync), dead columns, duplicate `ix_predictions_fixture_id`; fix `source_entity_map` unique key → `(entity_type, source, source_id)` | `models.py`, new migration, `seed_and_sync.py` | Tested on a Neon `dev` branch first, then applied to `production` |
| 2.3 | ✅ **Backend dependency upgrades:** `fastapi==0.141.1` (Starlette 1.6), `uvicorn[standard]==0.52.4`, `pydantic==2.13.5`, `pydantic-settings==2.15.0`, `sqlalchemy==2.0.52`, `psycopg[binary]==3.3.5`; remove `scikit-learn`, `joblib`, `pypdf`; drop `MODEL_PATH`/`WEIGHT_*` settings and `.env.example` lines | `requirements*.txt`, `config.py`, `.env.example` | `pip-audit` clean; tests pass |
| 2.4 | ✅ **Lock files and Python version:** `uv pip compile` lock; `.python-version` + `requires-python`; one version everywhere | `backend/` | Reproducible install; versions match |
| 2.5 | ✅ **Frontend tooling:** ESLint (`next/core-web-vitals` + `jsx-a11y`), `lint` script, `vitest` ≥ 3.2.7, `noUncheckedIndexedAccess`, remove `allowJs`, `postcss` override | `frontend/*` | `npm run lint`, `npm test`, `tsc` clean |
| 2.6 | ✅ **CI (GitHub Actions):** pytest + ruff check/format + (gradual) mypy + migration-drift test (`alembic upgrade head` on SQLite, then `alembic check`) + `npm test`/lint/typecheck | `.github/workflows/ci.yml` | Green on push |
| 2.7 | ✅ **Least-privilege Neon:** role `fdr_app` (DML only) for `POSTGRES_URL`; `neondb_owner` only for migrations; create `dev` branch for local work; `sslmode=verify-full&sslrootcert=system` | Neon, `.env` | App runs as `fdr_app`; DDL as the app role fails |
| 2.8 | ✅ _(superseded: Docker setup removed 2026-09-14 because the app runs locally against Neon)_ **Docker hardening:** `127.0.0.1:` port binds, non-root users, production builds (Next standalone, no `--reload`), `postgres:18`, `${POSTGRES_PASSWORD:?}` | `Dockerfile`s, compose | `docker compose up` serves prod builds on localhost only |
| 2.9 | ✅ _(APP_ENV, 503/500 envelopes, typed GridMeta, CSP and security headers)_ **API and web hardening:** docs/OpenAPI disabled outside dev; typed `GridMeta`; exception handler → 503 envelope; Next security headers (CSP allowing `crests.football-data.org`, `nosniff`, `Referrer-Policy`), `poweredByHeader: false`; server-only `API_BASE_URL` | `main.py`, `schemas.py`, `next.config.mjs`, `page.tsx` | Headers present; suspended DB → 503 JSON |
| 2.10 | ✅ _(README, PLAN, architecture, data dictionary and source manifest describe the current system)_ **Docs refresh:** README/PLAN describe the current system, not the scaffold | `README.md`, `PLAN.md` | No references to removed modules |

---

## Phase 3 — Data pipeline reliability

| ID | Task | Files | Done when |
|---|---|---|---|
| 3.1 | ✅ _(unknown clubs created with neutral defaults and reported; sync continues)_ **Unknown clubs don't abort the sync:** create with neutral defaults (grey, no stadium, API short name as history name), log a warning, record in run result | `seed_and_sync.py`, `team_registry.py` | Test: payload with an unregistered club syncs everything else |
| 3.2 | ✅ _(seasons follow the calendar; newest-season CSV 404 skipped, promoted clubs read from fixtures)_ **Season rollover:** 404 on the newest season's CSV = no rows; fall back to cache on download errors; promoted teams from DB fixtures vs last season; backtest season constants derived from data | `football_data_co_uk.py`, `predict.py`, `backtest/data.py`, `jobs/backtest.py` | Test: synthetic 2027/28 with fixtures but no CSV predicts successfully |
| 3.3 | ✅ _(tuned config required, model version = dixon-coles-v1+config hash, database target logged, APP_ENV=prod refuses SQLite)_ **Fail loudly on config:** `APP_ENV`; outside dev require explicit `POSTGRES_URL` and `artifacts/dixon_coles.json`; log DB host (not the password) at start; model version = `dixon-coles-v1+<config hash>`; commit the artifact | `config.py`, `rating_predictions.py`, `refresh.py` | Missing secret or artifact → non-zero exit |
| 3.4 | ✅ _(pydantic payloads, 429/5xx retries, isolated refresh steps with exit codes)_ **Step isolation and retries:** each step try/except with status + counts; overall non-zero exit if any step failed; retry 429/5xx/timeouts with backoff (read reset header); pydantic models for the football-data.org payload (null team IDs tolerated) | `refresh.py`, `sources/football_data_org.py`, `seed_and_sync.py` | Test: API outage still runs predict + weather and exits 1 |
| 3.5 | ✅ _(refresh_runs history + partial unique index lock (works through the Neon pooler), stale locks released; unique fixture and weather keys from 2.2)_ **Concurrency safety:** unique `fixtures.source_fixture_id` and `weather_snapshots.fixture_id`; `refresh_runs` table with a partial unique index `WHERE status='running'` (pooler-safe lock); stale-lock release after 15 min | `models.py`, migration | Test: second concurrent run is refused |
| 3.6 | ✅ _(conftest forces in-memory SQLite before app imports; guard test)_ **Tests never touch Neon:** `tests/conftest.py` sets `POSTGRES_URL=sqlite://` before importing `app`, plus a guard | `tests/conftest.py` | Guard test fails if the URL isn't SQLite |
| 3.7 | ✅ _(predict reports unresolved history names and teams without history)_ **Name cross-check:** every current-season CSV team resolves via the registry; every upcoming team has history or is promoted; warn loudly | `predict.py` | Test with a misspelt CSV team |
| 3.8 | ✅ _(change-only fixture writes, conditional CSV GET, stale weather cleared, last sync from run history)_ **Stop wasted writes and stale state:** update only changed fixtures (`last_seen_at` separate from `source_updated_at`); mark fixtures missing from the payload; clear weather that is no longer forecastable; conditional GET for the current CSV | `seed_and_sync.py`, `sync_weather.py`, `football_data_co_uk.py` | Second identical sync writes ~0 rows |
| 3.9 | ✅ _(tests/test_rollover_and_freshness.py (11 tests))_ **Missing tests:** `refresh.main`, `predict.main`, `sync_weather.main` (mock HTTP), `migrate.py`, `grid_meta` | `tests/` | Backend coverage ≥ 80% on live modules |
| 3.10 | ✅ _(shared logging_config; no print calls; alembic keeps the app logging when run from code)_ **Logging:** replace `print` with `logging` (JSON-ish lines); `fileConfig(..., disable_existing_loggers=False)`; pass migration URL via `config.attributes` (URL-encoded passwords) | `app/*`, `migrations/env.py`, `migrate.py` | Logs survive the migration step |

---

## Phase 4 — Refresh button, scheduled refresh, caching

### 4a. Scheduled refresh
| ID | Task | Done when |
|---|---|---|
| 4.1 | ✅ _(workflow written (4 crons, app role, --skip-migrations, exit 2 tolerated); runs once the repo is on GitHub with POSTGRES_URL and FOOTBALL_DATA_ORG_TOKEN secrets)_ GitHub Actions cron running `python -m app.jobs.refresh` directly: 09:00 and 23:30 Madrid, plus Tue/Fri evenings after football-data.co.uk updates; secrets in repo settings; cache `backend/data/raw`; migrations run as a separate manual/deploy step, never unattended | Failed run emails the owner; data fresh twice a day |

### 4b. Refresh button (single user)
| ID | Task | Done when |
|---|---|---|
| 4.2 | ✅ _(admin endpoints with token, cooldown, lock, subprocess hand-off via --run-id, dead-process detection; 18 tests)_ **Backend:** `POST /api/admin/refresh` → 202 + run id; 409 while a run is active; 429 + `retry_after` within the **10-min cooldown**; `GET /api/admin/refresh/latest`; token checked with `hmac.compare_digest`; refuse to start if `REFRESH_TOKEN` < 32 bytes; job started as a **subprocess** (`python -m app.jobs.refresh --trigger button`), not a thread | Tests: token required, cooldown, lock, failed run keeps old predictions |
| 4.3 | ✅ _(same-origin + custom header proxy; revalidates the grid tag once per finished run)_ **Route handler** `frontend/app/api/refresh/route.ts`: adds the token server-side; rejects unless `Sec-Fetch-Site: same-origin` (or matching `Origin`) and a custom header is present; after success calls `revalidateTag("fixture-grid")` | Cross-site POST rejected; token never in browser bundle |
| 4.4 | ✅ _(RefreshButton with step labels, cooldown and failure states; vitest for the state logic, Playwright deferred to the Phase 5 E2E suite)_ **`RefreshButton`** next to "Updated x ago": idle → running (step label) → done (`router.refresh()`) / cooldown ("Available in 7 min") / failed (reason, old data stays); polls every 2 s | Playwright test for the happy path and cooldown |
| 4.5 | ✅ _(sync records football-data.org lastUpdated, predict records history_through; stale pill after 36 h)_ `refresh_runs` records trigger, per-step counts, source freshness (latest CSV date, API `lastUpdated`); UI **stale-data pill** when last sync > 36 h | Pill appears with old data |

### 4c. Caching (Neon budget)
| ID | Task | Done when |
|---|---|---|
| 4.6 | ✅ _(unstable_cache with tag fixture-grid, 1 h; 3 page loads = 1 API call)_ `page.tsx`: `next: { tags: ["fixture-grid"], revalidate: 3600 }`, revalidated by the refresh flow (not every 5 min) | Browsing for 30 min wakes Neon at most once |
| 4.7 | ⬜ _(skipped for now: with 4.6 the grid query runs at most once an hour)_ Optional: precompute the grid JSON at the end of refresh into a one-row table; endpoint reads 1 row | 1 query per uncached view |

---

## Phase 5 — Frontend

### 5a. Correctness and accessibility
| ID | Task | Done when |
|---|---|---|
| 5.1 | ✅ _(tiles use API buckets; legend per lens (Easy/Hard, More xG/Less xG, Clean sheet likely/Unlikely); hidden in Fixtures view)_ Render buckets from the backend (see 0.4); per-lens legend ("More xG ← → Less xG"); legend hidden in Fixtures view | Colour, label and legend always agree |
| 5.2 | ✅ _(rings on buckets 4-5; the corner bucket number was removed on 2026-09-15 at the owner's request, difficulty remains in the tooltip and spoken label)_ **Non-colour encoding:** bucket number on each tile; heavier border on buckets 4–5 | Readable in a deuteranopia simulation |
| 5.3 | ✅ _(tiles are buttons with spoken labels incl. team; tooltip on keyboard focus and tap, Esc/outside tap closes; arrow-key navigation; sort buttons in th with aria-sort; row headers, caption, labelled pins; Playwright flow in 5.18)_ **Keyboard, touch and screen readers:** tiles as `<button>` with `aria-label` ("MD6 v Getafe, home, difficulty 49, Easy-ish"); tooltip on focus/tap, closes on Esc or outside tap; sort buttons inside `<th>` with `aria-sort`; `aria-hidden` arrows; search label + focus ring; table caption; pin buttons labelled | axe/`jsx-a11y` clean; full keyboard flow in Playwright |
| 5.4 | ✅ _(tile sub-text tokens without opacity, bucket 1 #1f7a4f, ink-3 decorative only, dimmed rows 0.55; lib/contrast.test.ts checks tokens from globals.css)_ **Contrast:** per-bucket venue colours (no opacity), bucket 1 → `#1f7a4f`, `--ink-3` → `#86868b` (decorative only), dimmed rows ≥ 3:1 | All text ≥ 4.5:1 (≥ 3:1 large) |
| 5.5 | ✅ _(global prefers-reduced-motion; segmented selection styled from aria-pressed before hydration)_ `prefers-reduced-motion`; segmented control selected state styled in CSS before hydration | No pop-in; motion off when requested |

### 5b. Mobile
| ID | Task | Done when |
|---|---|---|
| 5.6 | ✅ _(crest-only team column, 52 px tiles, 5 matchdays at 390 px, two-row toolbar with scrolling controls, headers pinned inside the grid's own scroll, swipeable insights)_ ≤ 600 px layout: crest + code team column (~64 px), 52 px tiles, 16 px page padding, full-width search, horizon + lens in one scrolling row (or bottom sheet); sticky table headers (`overflow: clip` on `.board`) | 5 matchdays visible at 390 px; toolbar ≤ 2 rows |

### 5c. Club crests
| ID | Task | Done when |
|---|---|---|
| 5.7 | ✅ _(teams.crest_url migration applied to production; 20/20 teams have a URL; host allowlisted in services/crests.py and on the grid payload)_ Store football-data.org `crest` URL (`Team.crest_url`, migration); allowlist `https://crests.football-data.org/` before exposing; add `crest_url` to `GridTeam` | All 20 teams have a URL |
| 5.8 | ✅ _(Crest component: image on white disc (team column, insights, tooltip), badge fallback on error or NEXT_PUBLIC_SHOW_CLUB_CRESTS=false; decorative alt since the name is always adjacent or in the button label)_ `Crest` renders `<img>` (28×28, lazy, `alt="{team} crest"`, `referrerPolicy="no-referrer"`) on a white circle with a hairline ring; falls back to the colour badge on error or when `NEXT_PUBLIC_SHOW_CLUB_CRESTS=false`; used in team column, insight cards, tooltip header | Crests render; flag off shows badges |

### 5d. Planning features
| ID | Task | Done when |
|---|---|---|
| 5.9 | ✅ _(openingColumn: first matchday with under half its games done (opened on MD6, not MD5); Show played toggle)_ Open on the first mostly unplayed matchday; "Show played" toggle | Board no longer opens on a nearly finished matchday |
| 5.10 | ✅ _(run totals (exp. pts / xG / exp. CS) with blanks = 0 and doubles summed; column sort sums doubles; blank/double badges)_ Fantasy-aware run metrics: sum of expected points with blank = 0 and doubles counted; game-count / ×2 badges; column sort sums doubles | Blank weeks no longer look easy |
| 5.11 | ✅ _(pins float to the top with a divider; view, lens, h, from, pins, played in the URL (server-rendered); pins in localStorage)_ Pinned teams float to the top with a divider; state in URL (`?lens=&h=&from=&pins=`) and pins in `localStorage` | Reload keeps the view |
| 5.12 | ✅ _(/team/[code]: season strip, points-per-game trend, home/away split; 404 for unknown codes)_ Team page `/team/[code]`: full-season strip, expected-points trend, home/away split | Linked from the team name |
| 5.13 | ✅ _(compact header; best targets, blanks & doubles, rotation pair (respects lens and pins), click to pin; first grid row visible at 900 px height)_ Compact hero + insight chips so the grid starts near the top; insights become actionable ("Best targets next N", "Blanks & doubles", "Rotation pair") and respect lens/pins | Grid visible without scrolling on a laptop |

### 5e. Robustness, performance, tests
| ID | Task | Done when |
|---|---|---|
| 5.14 | ✅ _(loading skeleton, error.tsx with retry, not-found; Zod validation tied to types (malformed payload -> error state, tested); server-side console.error logging; no backend commands shown)_ `loading.tsx` skeleton, `error.tsx` with retry; Zod validation of the API payload; server-side error logging; no backend commands shown to users | Malformed payload shows the error state |
| 5.15 | ✅ _(app.openapi_export + openapi-typescript -> lib/api.gen.ts; types.ts aliases; bucket literal and LensScales model; CI drift checks on both files)_ Generate `lib/types.ts` from `/openapi.json` (`openapi-typescript`); CI checks drift | Types regenerate cleanly |
| 5.16 | ✅ _(useDeferredValue search, memoised TeamRow, rAF tooltip; keystroke echo <=13 ms and rows <=73 ms in dev; payload slimming skipped on purpose (on-demand details would wake Neon per hover; grid is 24 KB gzipped and cached))_ Performance: slim grid payload (tooltip details on demand), `useDeferredValue` for search, memoised rows, stable bucket lookup, rAF-throttled tooltip | Search typing stays smooth |
| 5.17 | ✅ _(Inter via next/font, 11 px type floor tokens, single colour source, TBC once per column, model notes from API meta, board split into toolbar/row/hooks, favicon + metadata)_ Polish: load Inter via `next/font`, 11–12 px text floor and a type scale, TBC marked once per column, single colour-token source, model notes served from API `meta`, split `FixtureBoard.tsx`, favicon/metadata | Visual review against the "premium" brief |
| 5.18 | ✅ _(12 Playwright tests (incl. axe WCAG 2.1 AA and phone layout) against e2e/mock-api.mjs with a recorded grid; local runs use installed Chrome, CI e2e job installs Chromium; found and fixed a 200-for-404, a phone column overflow and badge contrast)_ **Playwright E2E** (your rules): first load, lens/horizon change, window stepping, keyboard sort, pin, refresh button, error state; deterministic test data (no `Math.random`) | Runs in CI |

### 5f. Owner feedback (2026-09-15)
| ID | Task | Done when |
|---|---|---|
| 5.19 | ✅ _(tiles without the corner number)_ Remove the 1–5 number from tiles | No number on tiles |
| 5.20 | ✅ _(GW7 / Gameweek 7 in all visible and spoken copy)_ Fantasy wording: GW instead of MD | No MD/Matchday in the UI |
| 5.21 | ✅ _(third view: match cards with win/draw/loss bar, xG, clean sheets, expected points, difficulty, weather, one-line takeaway; steps between GWs)_ **Next GW** view with detailed match info | Every match of the gameweek has a forecast card |
| 5.23 | ✅ _(Next is now the first horizon option inside the Difficulty board; old ?view=next links still work)_ Move Next GW into the horizon control as "Next" | Horizon: Next / Next 3 / Next 5 / Next 8 / All |
| 5.24 | ✅ _(one gameweek, grouped by day, scores for played games, GW selector across the whole season)_ Fixtures tab shows only the selected gameweek's fixtures | No grid in Fixtures |
| 5.25 | ✅ _(Current: LaLiga tiebreaks, zones, form; Predicted: points + expected points from remaining fixtures, title/top-4/relegation from 5,000 seeded simulations)_ Table tab with a predicted table | Current and predicted tables, shareable via ?view=table&t=predicted |
| 5.22 | ✅ _(Forwards by xG, Midfielders by 65/35 xG/clean-sheet blend, Defenders & keepers by expected clean sheets; fixture strip per club; click to pin)_ Top cards: clubs to pick from, by position | Cards answer "whose forwards / midfielders / defenders" |
| 5.26 | ✅ _(three equal columns: kindest + toughest run, next gameweek with win/draw/win bars, who to pick; every club ranked by expected points with a number column and fixture chips beside a 20-row table whose rows line up; default horizon Next 5; the grid now sits under the cards)_ Bento overview as the Difficulty tab's main page | Overview shows the relevant info first, grid and fixtures below |
| 5.27 | ✅ _(The Odds API, free plan, one call throttled to 6 h; fair W/D/L from the median of bookmakers, goal rates fitted to 1X2 + over/under 2.5 give clean sheet, to score, 2+ and concede 2+; market_odds table; shown beside each GW for Next / Next 3 by lens)_ Bookmaker odds in the Expected points card | Next and Next 3 show odds per GW; attack = scoring odds, defence = clean sheet and conceding odds |
| 5.28 | ✅ _(?gw= in the URL, selector with arrows and a list in the header, "Back to GW n"; old ?from= links still work)_ App-wide gameweek selector | Overview cards, grid, fixtures and the current table (after that GW) all follow it |
| 5.29 | ✅ _(DifficultyGrid + FixturesList under the bento; ?board=grid dropped)_ Full fixture grid and fixtures on the Difficulty page instead of a link | No separate grid view |

---

## Phase 6 — Model optimisation

**Rules**
- Tune on 2019/20–2022/23 only; score once on 2023/24–2025/26.
- Ship only if the **95% bootstrap CI** (by matchday) of the RPS difference excludes 0, or calibration is fixed without making RPS worse.
- Save every run in `backend/reports/experiments/`.

**Measured weaknesses to target** (from the audit)
- **Favourites too cautious:** 60–70% predicted → 74% actual; 70–80% → 86%; 80%+ → 93%.
- **Promoted teams after week 8:** gap to market +0.0111 RPS vs +0.0058 for other matches.
- **Market disagreement:** > 10 pts on 12.5% of next-week matches.
- **Clean sheets:** about 4 pts high.

| ID | Experiment | Targets | Data |
|---|---|---|---|
| 6.1 | ✅ _(`reports/experiments/bench.py`: replays one candidate through the blind nine-season harness and prints RPS, per-season and per-horizon tables, decile calibration, clean sheets, within-club ordering, run ranking and tile stability, each with an interval; `--variant spread=1.0` self-test comes out 0.0000)_ Evaluation upgrade | Tells real gains from noise | — |
| 6.2 | ✅ _(`spread` in DixonColesConfig: ratings stretched around their mean after the fit, mu re-solved to keep league goals; 1.10 chosen on the tuning seasons by log loss. Extreme-decile miss 0.123 → 0.065 pts/game, test-season RPS 0.1953 → 0.1947. Loosening the ridge instead was measurably worse: +0.0005 RPS and −0.007 run correlation)_ Outcome sharpening | Favourite underconfidence, λ compression | — |
| 6.3 | ✅ _(`app/services/calibration.py`, fitted by the backtest job to `artifacts/clean_sheet_calibration.json`, capped and shrunk toward identity; test seasons 30.8% → 28.8% predicted against 26.1% observed, Brier 0.1818 → 0.1803; W/D/L untouched)_ Clean-sheet recalibration | Defence lens | — |
| 6.4 | ⬜ **Promoted teams:** Segunda (`SP2`) history with a division offset; stage-dependent promoted prior; faster decay for teams with little top-flight data; shrink λ > 3 against promoted opponents | Later-season promoted gap; 3.9 xG outliers | football-data.co.uk SP2 |
| 6.5 | ✅ _(`app/services/market_blend.py`: log pool of model and fair market W/D/L for fixtures within 7 days with a fresh price from ≥ 3 bookmakers, weight 0.35 in `artifacts/market_blend.json`; research used pre-closing CSV prices only. Next-week RPS −0.0027 (−0.0034 to −0.0021); tiles holding their colour from 4–5 weeks out 88% → 81%, which is the trade-off the weight buys)_ Market blend (next gameweek) | 12.5% big disagreements | football-data.co.uk |
| 6.6 | ⬜ Finer search: xi, window 1–3 seasons, shrunk team-specific home advantage (ridge and spread are done; `bench.py` takes any config field) | Flat surface, safely | — |
| 6.7 | ⬜ Congestion: rest days from Champions League fixtures (football-data.org free; within 10 req/min) | Rotation after Europe | football-data.org CL |
| 6.8 | ⬜ Chance quality: total shots + research-only Understat xG test | Value of real xG | Understat (research) |
| 6.9 | ⬜ Model family check (negative binomial, bivariate Poisson, DC+Elo ensemble) — only if 6.2–6.8 plateau | — | — |

Winning changes update `artifacts/dixon_coles.json`, bump the model version (3.3), and refresh the baseline numbers in `CLAUDE.md`.

## Phase 6d — Saying it in plain words, and keeping the past on the board (2026-09-20)

| ID | Change | Why |
|---|---|---|
| 6d.1 | ✅ _(`grid.recordCopy` / `bandWords`, `CellTooltip`, `LENS_COPY`, ranking titles "Wins vs its rating" / "Wins vs its odds", column "Gap")_ The record lenses say what they mean | "Edge over its price" meant nothing without the jargon |
| 6d.2 | ✅ _(`RunCard.views` + the arrow; `.run-compact` deleted)_ Four run cards folded into two | Half the space, one layout |
| 6d.3 | ✅ _(`fixture_grid.historic_predictions` / `cell_review`, `CellReview`, `.cell-mark`, `playedValue`, the "Already played" divider)_ A played game keeps its forecast and says how it did | The board could never be checked against what happened |
| 6d.4 | ✅ _(`outcome_table` column `p_00`, `explanation["both_score"]`, `market_odds.team_market`, `PRICE_OPTIONS`, BTS column, match cards)_ Both teams to score, ours and the bookmakers' | Asked for; free from the score matrix |
| 6d.5 | ✅ _(one `<colgroup>` skeleton, `# Club P Pts To play xPts xGD 1st Top 4 Down`, `predictedTable({ through })`, `TableProgression.tsx`)_ The Table tab rebuilt | The layout jumped between modes, `+Exp` was dead weight, and there was no way to walk the season |
| 6d.6 | ✅ _(`@nivo/line`, `lib/progression.ts`, club chips + presets, focus band from 600 simulated seasons, crests at the line ends)_ The position chart rebuilt | Hand-rolled SVG could not be filtered, and 20 grey lines said nothing |
| 6d.7 | ✅ _(`services/opening_projection.py`, `jobs/opening_projection.py`, `artifacts/opening_projection.json`, `GridTeam.opening`, the dotted August line and its toggle)_ The pre-season projection, to compare the season against | "Played and projected" could not answer "is this better than we thought in August?" |
| 6d.8 | ⬜ The played tile's number is only the chance we gave the result; the points swing and the surprise stay in the tooltip | One number fits on a tile |

## Phase 6c — Labels that mean the same thing everywhere (2026-09-16)

| ID | Change | Why |
|---|---|---|
| 6c.1 | ✅ _(`scoring.THRESHOLDS`: top cut 36.0 home / 23.4 away; words Very favourite / Favourite / Even / Underdog / Big underdog)_ Venue-aware labels | A top-band tile won 70.4% at home and 59.3% away; now 72.0% / 72.2% |
| 6c.2 | ✅ _(`services/odds_record.py`, five seasons of closing odds; `GridCell.record` / `record_price`; lenses Record and Vs odds; tooltip line)_ A club's record at its price | Replaces the weather in the tooltip |
| 6c.3 | ✅ _(sync job, source, `weather_snapshots` table (migration `66529b836e07`), `CellWeather`, match-card line, footer attribution)_ Weather removed | Owner's call |
| 6c.4 | ⬜ Yearly backtest proposes a home and an away top cut, and the Part 2 label tables are re-run with them | `propose_thresholds` still returns one set |

## Phase 6b — Learning from its own mistakes

Reviewing each finished game, telling an unlucky result from a rating that is actually wrong, and re-fitting as
games arrive. Proved in `bench.py` under the blind protocol before any of it reaches the board.

| ID | Experiment | Targets | Data |
|---|---|---|---|
| 6b.1 | ⬜ **Post-match review:** surprise (the match's RPS and where it sits in the forecast's own distribution), performance gap (goals and shots on target against λ), red cards; each finished game filed as variance, evidence or a data problem, with a one-line explanation | "Easy game lost" answered honestly | football-data.co.uk (HR/AR, HST/AST) |
| 6b.2 | ⬜ **Drift detection:** CUSUM on each club's weighted goal residuals, attack and defence apart, thresholds set so false alarms stay near one per club-season; an alarm speeds that club's learning for a few matches (`fit_dixon_coles(..., club_weights=)`) | Promoted clubs, mid-season shifts | — |
| 6b.3 | ⬜ **Recalibration on a schedule:** spread and the clean-sheet correction re-fitted from finished matches each run; label cut points re-estimated and reported, never silently applied | Keeps the corrections honest as seasons pass | — |
| 6b.4 | ⬜ **Keep what we predicted:** append-only `prediction_history` and `match_reviews` tables, written by the predict job and a review step in the refresh | Production can learn at all | Neon |

---

## Phase 7 — Later / polish

- ⬜ Upgrade vitest 3 → 5 (dev-only advisory GHSA-82fw-gwwq-j7x9 in `@vitest/mocker`; runtime `npm audit --omit=dev` is clean)
- ⬜ Dark mode (the brief was white-first)
- ⬜ Spanish translation
- ⬜ Injuries/suspensions from an authorised source
- ⬜ Weather as a total-goals adjustment (only if backtested)
- ⬜ Deployment target (only if the app leaves the local machine): keep scale-to-zero cold starts under the page's 8 s fetch timeout

---

## Completed

- ✅ **Neon project** (2026-09-14):
  - `FDR`, AWS eu-central-1, Postgres 18, branch `production`, database `neondb`
  - Alembic baseline `5c4cbb29092d`
  - engine settings `pool_recycle=300`, `prepare_threshold=None`
  - first refresh 14 s (380 fixtures, 660 predictions, 9 MB)
  - gzip grid 24 KB
- ✅ Rating model + rolling-origin backtest; Dixon-Coles predictions in production; backtested label thresholds
- ✅ Grid API, Open-Meteo weather sync, `jobs/refresh.py`
- ✅ Prototype design ported to `frontend/` on real data
- ✅ Two code reviews' high/medium fixes (row pile-up, current matchday, kickoff comparison, statuses, gzip, Docker networking)
