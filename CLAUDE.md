# Sofix

Personal, single-user **LaLiga fixture difficulty board**. English UI, premium white "Apple-style" design.
The FPL "Fixtures & Results / FDR" screen was only the UI reference: this is LaLiga, which has no official
FDR, so difficulty comes from our own backtested rating model.

How every number is built, and how to read it from outside: [docs/how_it_works.md](docs/how_it_works.md).
Plan and status: [docs/next_features_plan.md](docs/next_features_plan.md) (work phase by phase, tick tasks there).
Evidence for open issues: [docs/upgrade_audit.md](docs/upgrade_audit.md). Model results: [backend/reports/backtest_laliga.md](backend/reports/backtest_laliga.md).
How difficulty is built, and how it did on nine past seasons: [docs/fixture_difficulty.md](docs/fixture_difficulty.md).
Sorare merge (phases S0–S9, decisions, findings): [docs/sorare_plan.md](docs/sorare_plan.md). Each phase is
"A · think & show" (findings + an HTML design preview in `docs/sorare/design/`, owner approves) then "B · build".

## Design language (owner-approved, use it for every new page)

Follow [docs/sorare/design/DESIGN.md](docs/sorare/design/DESIGN.md); the reference implementation is
`docs/sorare/design/S0-competitions.html`. In short:
- Build previews on real data, and run `npm run design` before showing one: it opens every preview in a
  browser and fails on a missing hero, explainer prose, preview scaffolding (PC/Phone toggles), grey boxes
  where real card art belongs, missing motion or a reduced-motion escape, sideways scrolling on a phone,
  and anything axe calls unreadable. A page waives a rule in its own `<meta name="design-check">`, with
  the reason visible in the file.
- Order the page: decision first (hero with one ≥ 48 px number), then a summary strip, then every option,
  then secondary things folded away.
- Few words.
- Each colour has one job: green = chance/reward, gold/red foil = Limited/Rare instead of labels,
  FDR colours = difficulty, text always ink.
- Cash and essence are shown side by side, never converted.
- Calm motion (count-ups, ring fills, sliding knobs) that switches off under reduced motion.
- The sorare.com overlay is the one exception: it copies SorareInside's look (S7).

## Architecture

```
football-data.org ──┐   GitHub Actions (refresh.yml, cron + Refresh button)
football-data.co.uk ─┼─> app.jobs.refresh: sync → odds → predict → publish ──> Neon (read_models)
The Odds API ────────┘                                    │                          │
                                           POST /api/revalidate          Next.js on Vercel reads Neon
                                                          └──────────────> (frontend/, locked to the owner)
Chrome extension (extension/) ── sorare.com session in the page ── check-ins ──> /api/ext/checkin
Sorare public GraphQL ── app.jobs.sorare (read-only, SORARE_API_KEY) ──> read_models: sorare, sorare_references
```

Production runs no Python server: the job publishes each page's finished data into `read_models` and the app
reads it (`lib/db.ts`). FastAPI (`backend/app/main.py`) is only for local development without `DATABASE_URL`.

| Area | Where |
|---|---|
| API (local dev only) | `backend/app/main.py`, `api.py`, `schemas.py` (FastAPI, `ApiResponse` envelope) |
| Publish | `backend/app/services/publish.py`: the `publish` step writes `read_models` keys `grid` (same envelope as `/api/fixture-grid`) and `system` (Odds credits, database size); the `sorare` step writes `sorare` (the whole Play page) and `sorare_references` (past cut-offs, kept between runs); after the run the job pings the app's `/api/revalidate` (`APP_URL`, `REVALIDATE_SECRET`, `VERCEL_BYPASS_SECRET`), which revalidates the tags `fixture-grid`, `system` and `sorare` |
| Grid payload | `backend/app/services/fixture_grid.py` (buckets come from labels; lens scales are computed here) |
| Rating model | `backend/app/modeling/dixon_coles.py`; tuned settings in `backend/artifacts/dixon_coles.json` |
| Predictions | `backend/app/jobs/predict.py`, `services/rating_predictions.py` (replace rows per model version); labels in `services/scoring.py` (venue-aware top cut); the record at each price in `services/odds_record.py` and both-teams-to-score, both stored in `Prediction.explanation`; played games reviewed with `services/postmortem.py` and served as `GridCell.review` |
| Sync | `backend/app/jobs/seed_and_sync.py`, `sources/*` |
| Odds | `backend/app/jobs/sync_odds.py` (throttled 6 h), `sources/the_odds_api.py`, `services/market_odds.py` (margin removal, goal rates fitted to the prices → clean sheet / scoring / conceding), `market_odds` table; `GridCell.market` |
| Teams | `backend/app/services/team_registry.py` (football-data.org `tla` ↔ football-data.co.uk name, colour, stadium) |
| Backtest | `backend/app/backtest/*`, `backend/app/jobs/backtest.py` |
| DB / migrations | `backend/app/models.py`, `backend/migrations/` (Alembic), `backend/app/migrate.py`, `app/db.py` |
| Refresh button | `frontend/app/api/refresh/route.ts` starts `refresh.yml` through the GitHub API (`lib/github.ts`, `GITHUB_TOKEN`; hidden without it) and reports GitHub's run status plus the step from `refresh_runs`; `components/RefreshButton.tsx`, `lib/refresh.ts`. `backend/app/admin.py` is the old local-only path |
| Scheduled refresh | `.github/workflows/refresh.yml` (cron, app role, `--skip-migrations`, `trigger` input: `cli`/`button`); `frontend/lib/schedule.ts` mirrors the crons (a test fails if they drift) |
| Control Center | Page `/control` (`app/control/page.tsx`), opened by `components/StatusPill.tsx` (heartbeat link in the nav). `ControlCenter.tsx`: status (good / 1 step left / stale / failed / database paused), 24-hour dial, last runs, connection chain, free-limit gauges, the Sorare panel (`components/control/SorarePanel.tsx`: who built the gameweek, the runs left before it locks, five clocks; logic in `lib/sorareStatus.ts`, tested), then `components/control/`: `ExtensionSetup` (the Chrome step, acted out; `EXTENSION_DIR` gives the folder to copy), `RefreshSetup` (pre-filled GitHub key link while `GITHUB_TOKEN` is missing), `GetTheApp` (Chrome's install prompt, a QR code from `lib/qr.ts`), `HowItRuns` (map; a column on phones). The page pings the extension (`lib/extension.ts`) so setup updates live. Logic in `lib/control.ts`, data in `lib/system.ts` (cached, tag `system`); styles in `app/control-center.css` |
| Installable app | `app/manifest.webmanifest/route.ts`, linked in `app/layout.tsx` with `crossorigin="use-credentials"` (Vercel's login guards the manifest too; `app/manifest.ts` would omit the attribute in production); `app/app-icon/[variant]/route.tsx` + `app/apple-icon.tsx` (stripe icons from `lib/appIcon.tsx`); the layout's inline script keeps Chrome's install prompt for the Install button (`lib/install.ts`) |
| Extension | `extension/` (MV3, plain JS, fixed ID `lfgchmhjigjodjfchagphfpkcicochlk` from the manifest key): `bridge.js` (sorare.com page world; keeps Sorare's GraphQL address/headers in memory only and runs only the handful of operations named in it), `content.js` (the two-way relay), `background.js` (check-ins when something changes or every 6 h, `ping` for the app, and Apply's steps, each named by the app and run in a sorare.com tab), popup; `node extension/scripts/configure.mjs` writes `manifest.json` + `config.js` from `.env` (both git-ignored); app side `app/api/ext/checkin/route.ts` |
| Home | `frontend/app/page.tsx` at `/`: gameweek head with one hero number (days to kickoff, games played while it's on, shocks once played), the S0 gameweek timeline (`components/home/GameweekTimeline.tsx`, links to `/?gw=N`, knob placed by fixed widths), and the bento: Fixtures, Difficulty (a mosaic of every club's next five games), Table tiles, plus the Sorare row: `components/home/SorareTiles.tsx` (Play, Last gameweek, My cards) once the Sorare job has published, `SorareRow.tsx` (waiting tiles) before. Logic in `lib/home.ts` (pure, tested), title/relegation chances cached per grid in `lib/homeData.ts`; styles in `app/home.css`. Old `/?view=…` board links redirect (`legacyBoardUrl`) |
| Play | `frontend/app/play/page.tsx` at `/play`: your whole Sorare gameweek. Server-rendered from one cached read (`lib/playData.ts`, `unstable_cache`, tag `sorare`); all state is in the address (`?gw=`, `?plan=`, `?after=1`). `components/play/`: `PlayView.tsx` (head with the freshness chip, the alert when the data is behind, plan switch, plan hero, folds; the gameweek is the top bar's picker, not a second control), `Lineup.tsx` (a lineup and its sheet), `LineupSheet.tsx` and `ApplySheet.tsx` (the client components — `<dialog>`s), `bits.tsx`, `SorareImage.tsx` (Sorare's two asset hosts only — card art and club badges on `assets.sorare.com`, national-team flags on `frontend-assets.sorare.com`, both in the CSP — `unoptimized`). Display helpers and the payload types in `lib/play.ts`, Apply's half of the extension bridge in `lib/apply.ts` (both pure, tested); styles in `app/play.css` |
| Sorare data | `backend/app/sorare/`: `client.py` (read-only GraphQL, APIKEY header, throttled), `sync.py` (what is fetched), `forecast.py` (each player's chance of playing and score), `rules.py` + `model.py` (competitions read from Sorare's own rules), `planner.py` (lineup search, substitutions, reward chances, whole-gameweek plans), `publish.py` (the page's payload, `PAYLOAD_VERSION`; each week's `playing.players` carry the card art, the chance of playing and the expected score, which is all the board has in a week LaLiga is away), `record.py` (writes each gameweek's projections to `sorare_forecasts` before Sorare drops them). Job: `app/jobs/sorare.py`, also a step in `refresh` |
| Navigation | `components/NavLinks.tsx` (top bar, PC) and `components/TabBar.tsx` (phones, fixed at the bottom, rendered outside the top bar); both follow `usePathname()`. `components/WeekPicker.tsx` is the app's one gameweek control, in the top bar on every page (`lib/weeks.ts`, tested) |
| Frontend | Board pages `/fixtures`, `/difficulty`, `/table`: `frontend/app/(board)/*/page.tsx` → `board-route.tsx` (cached server fetch, tag `fixture-grid`), `components/FixtureBoard.tsx`, `Overview.tsx`, `DifficultyGrid.tsx`, `AwayWeek.tsx`, `LeagueTable.tsx` + `TableProgression.tsx` (nivo chart, `lib/progression.ts`), `lib/grid.ts`, `lib/types.ts` |

## Commands

Backend (from `backend/`, venv at `backend/.venv`):

```bash
.venv\Scripts\python -m app.jobs.refresh      # migrations, fixtures, odds, predictions
.venv\Scripts\python -m app.jobs.refresh --skip-migrations   # as schedule/button run it: schema check only
.venv\Scripts\python -m app.jobs.sorare      # only the Sorare step (--dry-run builds it without writing)
.venv\Scripts\python -m app.jobs.backtest     # tune + score the model; writes reports/ and artifacts/
.venv\Scripts\python -m app.jobs.opening_projection   # once a season: the pre-season table the chart's August line draws
# blind 9-season replay behind docs/fixture_difficulty.md (~2 min, cached CSVs only; --cache reuses forecasts)
.venv\Scripts\python reports\experiments\difficulty_backtest.py --out $env:TEMP\fdr_tables.md --cache $env:TEMP\fdr_state.pkl --workers 10
# score one candidate change against that replay, with 95% intervals (~20 s once the cache exists)
.venv\Scripts\python reports\experiments\bench.py --variant spread=1.15 --cache $env:TEMP\fdr_state.pkl --workers 10
# post-match review: surprise, performance gap and a verdict per finished match (docs/fixture_difficulty.md 3.5)
.venv\Scripts\python reports\experiments\review.py --cache $env:TEMP\fdr_state.pkl --out $env:TEMP\review.md
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
npm run e2e          # Playwright against e2e/mock-api.mjs (ports 3100/8765, installed Chrome locally)
npm run design       # every docs/sorare/design/*.html against the design bar (CI runs it too)
npm run gen:types    # after python -m app.openapi_export
```

## Conventions

- English UI copy with fantasy wording: "GW7" / "Gameweek 7" (never "MD"/"Matchday" in the UI; the API field is
  still `matchday`), "Date TBC"; kickoff times stored UTC, shown in `Europe/Madrid`.
- Tiles show colour, opponent and venue only (the owner didn't want a bucket number); difficulty stays in the
  tooltip, the spoken label and the ring on buckets 4–5.
- Label words: **Very favourite / Favourite / Even / Underdog / Big underdog** (`scoring.LABELS`). The top cut is
  venue-aware (36.0 home, 23.4 away) so the top colour wins ~72% of the time at either venue; the other three cuts
  are shared. Never compare a difficulty to one cut set without the venue.
- The board's tab is its path (`VIEW_PATH`: `/fixtures`, `/difficulty`, `/table`); every other setting stays in the query
  string. Switching tabs in the page doesn't navigate: `useViewState` rewrites the path with
  `history.replaceState(null, …)` (null, so Next's `usePathname` follows; passing Next's own state skips the sync).
- One app-wide **week** (`?w=`, the picker in the top bar) drives every page. LaLiga counts 38 rounds and Sorare
  its own game weeks, and the numbers differ (LaLiga's GW7 is Sorare's GW17), so a week is what they share:
  `lib/weeks.ts` merges them on half-open `[from, to)` windows and each page resolves what the week holds — the
  board its round, Play its gameweek. `weekContext(grid, sorare, now, asked)` also reads the older per-page `?gw=`
  so an old link keeps the bar and the page agreeing. Both systems are written "GW"; whichever the page is not
  counting in is named ("Sorare GW17", "LaLiga GW7").
- **The week you pick is the week you get.** No page ever quietly swaps it for one it prefers: picking a week is
  always written to the address (even the week the app is already on, because each page's "nothing asked for" is
  its own — the board opens on the next LaLiga round), the top bar's links carry it (`lib/navWeek.ts`) and the
  board's own `replaceState` keeps it (`hooks/useViewState.ts`). A page with nothing for that week says so:
  Play says Sorare hasn't opened it, and the board shows `components/AwayWeek.tsx` — the games the owner's own
  Sorare players play that week (card art, opponent, competition, kickoff) on Fixtures, the same players by
  chance of playing and expected score on Difficulty, and the standings unchanged on Table. Our model only rates
  LaLiga, so nothing outside it is given a difficulty.
- The week still reaches the board as its own gameweek (`?gw=`, `state.gw`): `board-route.tsx` writes it only when
  a week was asked for, because picking a gameweek by hand (`state.gw !== null`) also stops the projection there
  ("Projected table after GW7"); left alone the table shows every result and the full-season projection. The board's
  state follows a newly served gameweek (`hooks/useViewState.ts`), and the picker reads `window.location.search`,
  not `useSearchParams()`, so a week change keeps the lens, horizon and pins the board wrote with `replaceState`.
- Played games keep the forecast they carried before kickoff (`GridCell.prediction` on a finished cell, from
  `fixture_grid.historic_predictions`, which ignores the model version on purpose) plus `GridCell.review`: the chance
  the board gave the result, the points won against the expected points, and `surprise` from `services/postmortem.py`
  (1 = utterly ordinary; the tile shows `100 - surprise` so a high number means a shock). The tile's top-right number
  is the chance we gave the result. None of it counts anywhere: `lensValue`/`runValue` return null for a finished
  cell and `lens_scales` skips them, so totals, rankings and cut points stay about the games still to come.
- Difficulty tab: a bento overview (`components/Overview.tsx`, three equal columns): most/fewest points coming and
  softest/hardest schedule (swing against the club's own level),
  the GW's matches, who to pick (forwards: xG, defenders/keepers: expected clean sheets, midfielders: 65/35 blend),
  every club ranked over the window (xPts number column, no bars) beside the table with rows aligned (34 px); then the
  full grid and the GW's fixtures underneath. Two run cards, not four: each holds its points view and the matching
  schedule swing behind an arrow (`RunCard.views`). The ranking card: Next shows the GW's prices in columns (W/D/L,
  scores/2+/BTS, CS/concede 2+) plus the market's chance as a bar, and the clubs that already played sit under an
  "Already played" divider still showing the expected points of that game (`playedValue`); Next 3/5/8 show one tile
  per GW with the price picked in the Price menu (`PRICE_OPTIONS`). Odds are fair prices (1 / backend probability).
- Lenses: Overall / Attack / Defence (our model), **Record** and **Vs odds**, and Odds (bookmakers: tiles = market
  win chance cut by `lens_scales.odds`, totals = market points (3×win+draw) per priced game, so clubs that already
  played or have more games priced aren't favoured). The grid follows the same lens.
- Record / Vs odds: how often the club has won at this price over five seasons of closing odds, minus what the league
  gets at the same price (`edge`, shrunk by sample size, null below 5 games). Record bands by the win chance the board
  shows (every fixture); Vs odds by the bookmakers' current price (priced fixtures only). Both totals are an average
  edge per game, never a sum, and read as a "Gap" in signed points. The tooltip leads with the sentence
  ("Wins 38% of games at odds 2.60 (38%)") and puts the counts and the band under it, because the rate covers the
  whole band, not that exact price (`grid.recordCopy`). Description only: nothing in it moves a probability.
- Both teams to score: ours from the Dixon-Coles score matrix (`outcome_table` column `p_00`, stored in
  `Prediction.explanation["both_score"]`, served as `CellPrediction.both_score`), the bookmakers' from the fitted
  goal rates (`market_odds.team_market`, `CellMarket.both_score`). It shows in the Price menu, the attack lens'
  columns (BTS), the tooltip and the match cards.
- The page is fluid up to `--page-max` (1600 px) and centred beyond it; below 1200 px the ranking and table cards go
  full width; card internals size by named container queries (`ladder`, `gwcard`).
- Tabs: Fixtures (the selected GW's fixture list), Difficulty (overview + grid; horizon "Next" = match cards for one GW), Table
  (current standings with LaLiga tiebreaks, and a predicted table in `lib/table.ts`: expected points plus seeded
  simulations; keep it seeded so the same data always shows the same percentages). Both modes share one 10-column
  skeleton and a `<colgroup>` so nothing shifts when the toggle flips: Current is `# Club P W D L Goals GD Pts Form`,
  Predicted is `# Club P Pts To play xPts xGD 1st Top 4 Down`. `predictedTable(grid, { through })` stops the
  projection at a gameweek, and `components/TableProgression.tsx` charts every club's position (solid while played,
  dashed while projected).
- The position chart: `@nivo/line` inside `components/TableProgression.tsx`, loaded with `next/dynamic` and
  `ssr: false` so only the Table tab pays for the charting library. Numbers come from `lib/progression.ts`
  (`seasonProgression`): played gameweeks from `currentTable(grid, i)`, future ones from
  `predictedTable(grid, { through: i })` so a line can never disagree with the table, and a 10th–90th percentile
  band from 600 simulated seasons. Three presets (Europe / Relegation / All) and a Clubs button holding every
  club as a checkbox: picking by hand always switches the view to All and reads the picks against the whole
  league, the rest fading behind them; one club picked is the focus, with its band and a sentence saying where
  it is heading. The zone shading and the pre-season line are checkboxes behind the (i) button in the chart's
  bottom-right corner, which also carries the key (the heading has no description line). Crests sit at the end
  of each line and are pushed apart when they collide. Whole thing ≈100 ms, memoised per grid.
- The prediction line (dotted, "Prediction" checkbox in the (i) panel): `GridTeam.opening`, the position the **pre-season** model had each
  club after every gameweek. Built once per season by `python -m app.jobs.opening_projection` — the model
  fitted only on matches before the season's first kickoff, run over all 380 fixtures — and committed as
  `backend/artifacts/opening_projection.json`; the API reads the file and serves null when it is missing or
  from another season. It never changes during a season, so the refresh does not recompute it; re-run it at the
  yearly rollover (and `--check` tells you when it is stale). Promoted clubs come out level with each other:
  the model has no Segunda history for them.
- Frontend must not re-derive what the backend decides: tile colour = `prediction.bucket`, lens cut points = `lens_scales`.
- API types are generated: change `backend/app/schemas.py`, run `python -m app.openapi_export` (backend) and
  `npm run gen:types` (frontend), then update `frontend/lib/schema.ts` (Zod) until `npm run typecheck` passes.
  Never hand-edit `lib/openapi.json` or `lib/api.gen.ts`; CI fails when either is stale.
- Schema changes: edit `models.py` → autogenerate a migration → review it → apply. Never `create_all` against Neon.
- **Apply is the only thing in Sofix that writes to Sorare, and it never writes by itself.** The job's key is
  read-only, so entering a lineup goes through the owner's own sorare.com session in Chrome: the app names a
  step, the extension runs it in a sorare.com tab (`extension/background.js` holds the only list of steps,
  `bridge.js` the only list of operations). **check** writes nothing, **draft** saves a lineup that is not
  entered, **enter** is the one that spends a slot — three presses, never chained. Sorare's own errors are shown
  as they come back, because a disagreement with our rules is a bug here. Without Chrome, the extension or a
  sorare.com tab the sheet says so and offers nothing that writes. `mySo5Lineups`, and a `canCompose` that means
  anything, need that session too: what is already entered can only be read in the browser, never by the job.
- Jobs replace rows (predictions per model version, odds per fixture); never append history. The one exception
  is `sorare_forecasts`: Sorare serves a player's *next* fixture projection only, so each run overwrites the
  row while the gameweek is open and freezes it at the lock, leaving a record of what every plan was built on
  (`app/sorare/record.py`). A gameweek nobody recorded before its lock stays a gap on purpose.
- Refreshes: one at a time (`refresh_runs` partial unique index) and ≥ 10 min apart for the button (`COOLDOWN`).
  Unattended runs (schedule, button) use `--skip-migrations`; after a schema change run `python -m app.migrate` by hand.
- The grid page is cached (1 h, tag `fixture-grid`; the Control Center's data under tag `system`) to spare Neon. The
  refresh job revalidates both through `POST /api/revalidate` when a run ends, and the refresh route does too when
  it sees a finished GitHub run. Don't switch pages back to `no-store` or add client-side polling of DB-backed
  endpoints. The extension checks in only on change or every 6 h (`EXTENSION_CHECKIN_MS`) for the same reason.
- Deploys: every push to `main` builds on Vercel (project `sofix`, root `frontend/`). Deployment Protection
  (Vercel Authentication, **all deployments**) locks the app to the owner's Vercel login; jobs and the extension
  get through with the bypass secret (`x-vercel-protection-bypass`). The repo `yares28/Sofix` is **public**:
  never commit secrets, personal data beyond what Sorare already shows publicly, or `.env*`.
- Tests: pytest with in-memory SQLite and mocked HTTP; vitest for `lib/`. Keep both green before committing.
- CI (`.github/workflows/ci.yml`) runs ruff, mypy, pytest (incl. migration drift), pip-audit, eslint, tsc, vitest
  and `npm audit --omit=dev` on every push to GitHub. Run the same locally before committing. Python in Actions
  comes from `astral-sh/setup-uv` with `activate-environment: true` (the runner has no system 3.11).
- Commits: `<type>: <description>` (feat, fix, refactor, docs, test, chore, perf, ci).
- Python 3.11 (`backend/.python-version`). Dependencies: edit direct pins in `requirements*.txt`, then regenerate
  `requirements*.lock` with `uv pip compile ... --python-version 3.11` and `uv pip sync` the venv; run `uvx pip-audit -r requirements.lock`.

## Model rules

- Current test baseline (2023/24–2025/26, 8,339 forecasts): **RPS 0.1947** (closing odds 0.1886, Elo 0.2050, base rates 0.2255).
- Tune only on 2019/20–2022/23; score once on the test seasons. A change ships only if a bootstrap CI
  (by matchday) of the RPS difference excludes 0, or it fixes calibration without making RPS worse.
- Candidate changes are replayed blind over nine seasons before shipping:
  `reports\experiments\bench.py --variant <key=value,…>` prints RPS, calibration, within-club ordering, run
  ranking and tile stability against the blind baseline, each with an interval. `--variant spread=1.0` is its
  self-test and must come out 0.0000.
- Blind replay (2017/18–2025/26, each season's settings tuned only on earlier seasons): **RPS 0.1994** vs closing
  odds 0.1932, Elo 0.2079, venue-only 0.2250 — about 80% of the way from a venue-only forecast to the market.
  Tuning on later seasons bought nothing measurable, so the settings are not over-fitted.
- Three corrections sit on top of the fitted model, each with its own artifact:
  - **Rating spread** (`spread` in `dixon_coles.json`, 1.10): the ridge leaves the best and worst clubs too close
    to average, so the ratings are stretched around their mean and mu is re-solved to keep league goals. Chosen on
    the tuning seasons by log loss (RPS barely separates them). Blind replay: the top/bottom decile miss falls from
    0.123 to 0.065 points per game, better than the market's 0.060.
  - **Clean-sheet correction** (`clean_sheet_calibration.json`): `p' = sigmoid(a + b·logit(p))` fitted on the tuning
    seasons, capped and shrunk toward doing nothing. Test seasons: predicted 30.8% → 28.8% against 26.1% observed,
    Brier 0.1818 → 0.1803. Win/draw/loss are untouched.
  - **Market blend** (`market_blend.json`, weight 0.35): bookmaker prices are pooled into win/draw/loss for
    fixtures within 7 days that have a fresh price from ≥ 3 bookmakers. Blind replay, next-week games: RPS
    −0.0027 (−0.0034 to −0.0021), at the cost of tile colours holding from 4–5 weeks out falling 88% → 81%.
    The weight is the owner's choice of that trade-off, not a fit; the Odds lens stays pure market.
- Label cuts: the yearly backtest still proposes one cut set (`jobs/backtest.py:propose_thresholds`); with
  venue-aware labels, re-check the home and away top cuts by hand (docs/fixture_difficulty.md 1.6) until it proposes both.
- Known weaknesses: promoted teams learned too slowly after week 8 (+0.0088 RPS behind the market, against +0.0057
  elsewhere), clean sheets still ~2.7 pts high on the test seasons after the correction, and no team news at all
  beyond the blended prices.
- Judging whether a forecast tells a club's easy games from its hard ones: compare only forecasts made on the
  same date. Demeaning by a club's season average mixes in forecasts made after a game, which already contain
  its result, and penalises any model that learns from results.
- When the tuned config changes, re-run `python -m app.jobs.backtest` (it rewrites `artifacts/dixon_coles.json` and
  `artifacts/clean_sheet_calibration.json`), re-run refresh, and update the numbers above.
  `artifacts/market_blend.json` is a product setting, not a fit: change it by hand.

## Free-tier limits (personal, non-commercial use)

| Service | Limit | Rule for the code |
|---|---|---|
| football-data.org | **10 requests/min** with token; LaLiga (`PD`) + Champions League only, no Europa/Conference | One matches call per refresh; ≥ 10-min cooldown between refreshes; retry 429 with backoff; never loop per match |
| football-data.co.uk | Free CSVs; results and `fixtures.csv` (Bet365/avg/max odds, no Pinnacle) updated Tue ~13:00 / Fri ~17:00 UK | Disk cache in `backend/data/raw/`; re-download only the current season; a 404 for a brand-new season means "no rows yet". The predict job reads five seasons (the record at each price counts them; the model fits two years) |
| The Odds API | Free Starter plan: **500 credits/month**; `h2h,totals` × `eu` = 2 credits per call | One call per sync, skipped when the last fetch is < 6 h old (≤ 4 calls/day ≈ 240 credits/month); never per-event markets; key only in `.env` / Actions secret, sent as a query parameter, so never log request URLs or raw httpx errors |
| Neon Free | **0.5 GB/project, 100 CU-hours/month**, up to 2 CU, scale to zero after 5 min idle, 10 branches, 6 h history, 5 GB egress. **Hitting any limit suspends compute until next month** | Cache the grid and revalidate only after a refresh; never point uptime monitors at DB-backed endpoints (≈182 CU-h/month); keep `/api/health` DB-free |
| Club crests | No licence stated; club trademarks | Personal use only; `NEXT_PUBLIC_SHOW_CLUB_CRESTS=false` (in `frontend/.env.local`) shows colour badges instead; URLs allowlisted to `https://crests.football-data.org/` in `services/crests.py` and again in `Crest.tsx`; hot-linked (`unoptimized`, `no-referrer`), never downloaded or proxied |
| Sorare API | Public GraphQL, free; the API key only raises the rate limit (read-only, no OAuth). Rate limits are per key and unpublished | One run is 135–180 calls in ~1–3 min: the client pauses 0.35 s between calls, past cut-offs are cached in `read_models` (`sorare_references`) and a finished gameweek's replay is kept. Never write to Sorare from the job; `SORARE_USER` and the key live in `.env` / Actions secrets |
| StatsBomb Open Data | LaLiga only to 2020/21, Barcelona matches only | Research only; not in the pipeline |
| Vercel Hobby | Personal, non-commercial; 100 deployments/day; functions default 10 s | Only reads published data and small writes; heavy work stays in GitHub Actions |
| GitHub Actions | Free on standard runners for public repos (private: 2,000 min/month); scheduled workflows in public repos are disabled after 60 days without commits | Keep jobs short; one refresh at a time (`concurrency: refresh`) |

Transfermarkt Terms prohibit scraping. No LaLiga logo or wordmark.

## Environment and secrets

- Root `.env` (git-ignored): `FOOTBALL_DATA_ORG_TOKEN`, `POSTGRES_URL` (Neon **pooled** host, role **`fdr_app`**),
  `POSTGRES_MIGRATION_URL` (Neon **direct** host, role `neondb_owner`), `REFRESH_TOKEN` (≥ 32 bytes, local admin path),
  optional `ODDS_API_KEY`, optional `SORARE_API_KEY` + `SORARE_USER` (the manager the Play page plans for;
  without the key the Sorare step is skipped, like the odds step), and for the cloud: `APP_URL`,
  `REVALIDATE_SECRET`, `EXTENSION_TOKEN` (both ≥ 32), `VERCEL_BYPASS_SECRET`.
- `frontend/.env.local` (git-ignored, local dev): `DATABASE_URL` (the app-role URL with a plain `postgresql://`
  scheme; without it the app asks FastAPI), `REVALIDATE_SECRET`, `EXTENSION_TOKEN`, optional `GITHUB_TOKEN`, `EXTENSION_DIR`.
- Vercel production env (project `sofix`): `DATABASE_URL`, `REVALIDATE_SECRET`, `EXTENSION_TOKEN`, `GITHUB_REPO`,
  `EXTENSION_DIR` (the local extension folder the Control Center offers to copy; not a secret, kept out of the public repo),
  and `GITHUB_TOKEN` (fine-grained, Sofix only, Actions read/write) for the Refresh button.
- GitHub Actions secrets: `POSTGRES_URL` (app role), `FOOTBALL_DATA_ORG_TOKEN`, `ODDS_API_KEY`, `APP_URL`,
  `REVALIDATE_SECRET`, `VERCEL_BYPASS_SECRET`, `SORARE_API_KEY` (the Sorare step; the manager is the
  repository variable `SORARE_USER`, not a secret).
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
- No Docker: the app runs directly on this machine against Neon. Don't re-add container files unless a deployment
  target needs them. `migrate.ensure_same_database` refuses to migrate a database other than the app's.
- SQLite returns naive datetimes stored as UTC: always go through `app/services/timeutil.as_utc`.
- `uvicorn --reload` on Windows sometimes misses changes: restart the API after schema/model edits.
- Port 5432 on this machine is another project's Postgres; don't use it.
- `C:\Users\Yaya` has its own `package.json`: run npm **only** with `frontend/` as the working directory.
- PowerShell here-strings don't pipe into `git commit -F -`; write the message to a file. PowerShell runs in
  constrained language mode, so use Python for scripts that need .NET methods.
- Tests must never reach Neon (in-memory SQLite, `dependency_overrides` for the API).
- The nav has `backdrop-filter`, which makes it the containing block for `position: fixed` children: an overlay
  rendered inside it is trapped in the 52 px bar (the first Control Center sheet opened off-screen). Put overlays
  outside the nav (a portal or their own page).
- `vercel link` **overwrites `frontend/.env.local`** with a pulled copy; the Vercel link lives at the repo root
  (`.vercel/`, git-ignored) so run Vercel CLI commands from the root.
- The extension loads unpacked from `extension/` (Chrome blocks store-less installs otherwise). After changing its
  code or `.env`, run `node extension/scripts/configure.mjs`, then reload it in `chrome://extensions`.

## Yearly rollover (June, when next season's fixtures appear)

0. After the new season's fixtures are synced and every promoted club resolves, run
   `python -m app.jobs.opening_projection` and commit `backend/artifacts/opening_projection.json` (the chart's
   August line). `--check` fails while it is stale.
1. Add promoted clubs to `team_registry.py` (check football-data.org `tla` codes, football-data.co.uk spellings, and
   any The Odds API spelling the odds step logs as unmatched → `odds_names`).
2. Run refresh; confirm all 20 teams resolve and predictions exist.
3. After the season ends, re-run the backtest and update the model baseline above.
