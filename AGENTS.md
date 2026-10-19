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
.venv\Scripts\python -m app.jobs.lineup_backtest --pools 600   # judge a way of picking lineups; see docs/backtesting.md
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

From the root, before and after every push (see Shipping):

```powershell
node scripts/check.mjs          # local checks for what changed; fixes formatting and generated files
node scripts/check.mjs --live   # production after a push: Vercel deploy, every page 200, CI and refresh state
```

## Shipping (one owner, one computer)

Sofix has one user and one developer. Changes go straight to `main`: the local checks are the gate, CI is a safety net
nobody waits for, and the owner is the reviewer. A small task should take minutes, not three CI cycles.

1. **Where:** work on `main` in the main folder. A second session running at the same time uses its own worktree and
   ships with `git pull --rebase origin main` then `git push origin HEAD:main`. Never change the main folder's branch.
   No pull requests, no merges in GitHub's UI, no per-step branches, no docs-only pushes.
2. **Check:** `node scripts/check.mjs` (one to three minutes). It runs the backend steps (ruff format, ruff check, mypy,
   pytest, OpenAPI export) and/or the frontend steps (generated types, eslint, tsc, vitest) for what changed since
   `origin/main`, rewrites formatting and generated files itself, and prints one line per step. A behavior change also
   needs its own test first (a bug fix: the failing regression test).
3. **UI change (any visible change):** run the changed page's spec (`npx playwright test e2e/<page>.e2e.ts`, add
   `e2e/mobile.e2e.ts` when the layout moved), then open the page on the local dev server, which reads the real read
   models (`npm run dev`, or the browser pane's `web` preview), at 1440 px and 390 px: screenshot both and check them
   against the design bar in CLAUDE.md (one hero, real cards and crests, text floor, no horizontal overflow). A new or
   restyled screen also gets the `web-design-guidelines` pass on its files. The full browser suite runs locally only when
   shared code moved (the app shell, nav, `lib/weeks.ts`, the e2e mock); otherwise CI runs it after the push.
4. **Ship:** commit (`<type>: <description>`, with the doc line the change needs in the same commit) and
   `git push origin main`. Vercel deploys in one to two minutes. A push that touches `backend/app/**` or
   `backend/artifacts/**` also starts the refresh (`refresh.yml`), which republishes the read models: never dispatch it by
   hand for that.
5. **Confirm and hand over:** `node scripts/check.mjs --live /<changed page> ...` waits for the deploy, opens every page
   on production (anything but 200 fails), prints CI's and the refresh's state without waiting for them, makes sure the
   main folder's dev server answers on localhost:3000 (it starts it if not), and prints the changed pages' links on
   localhost and production. The reply that reports a change ends with those links, so the owner tests it at once. When
   the task is about published data, check the read model with one SELECT after the refresh; otherwise move on.
   (localhost:3000 serves the main folder with hot reload: a session in a worktree runs `git pull --ff-only` there after
   its push, when `git status` is clean, so localhost shows the change too.)
6. **Session start:** `node scripts/check.mjs --live` once (Claude Code runs it from a session-start hook). A red CI, a
   failed refresh or a broken page on `main` is fixed first. The next work is "Next up" in [plans/roadmap.md](plans/roadmap.md).
7. **Broken production:** when a push breaks a page (not 200, or the owner says so), `git revert <commit>` and push that
   first, so the app is back in about two minutes; then find the cause and ship the fix as a new commit.

Hold the push only when the owner says so; for a schema change until he has migrated production (the migration goes
first, the code second); and for an extension release until `node extension/scripts/configure.mjs` has rebuilt his
folder, after which he presses Reload once.

Not done here: pull requests, waiting for CI or for a refresh, review subagents, screenshots of production (the
`--live` check covers it), Chrome round trips to GitHub.

## Product/UI rules

- One date-selected week drives all pages; LaLiga and Sorare GW numbers are separate.
- UI says GW/Gameweek, not MD/Matchday. Store UTC, display Madrid; missing kickoff is “Date TBC”.
- Routes: `/`, `/play`, `/lineups`, `/scores`, `/fixtures`, `/difficulty`, `/table`, `/audit`, `/cards`, `/players`, `/control`, `/team/[code]`.
  `/audit` is Sofix checked against what happened (backend/app/sorare/audit.py, read model `audit`): how often Sofix's and Sorare's numbers land within 7 points, and who
  starts per source; the job decides what is shown and the page says "too few to tell" under 100 cases.
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

## Pages

A click renders the whole page on the server, per request, and the old page stays until all of it has arrived: on 14 Oct
2026 that was 0.4-1.5 s on production with nothing shown, because pages read one thing after another and read far more than
they show. So, in every page:

- Start every read in one `Promise.all` at the top; a read that needs another's result starts as soon as it has it, together
  with the others. Never `await` a read in a loop.
- Read only what the page shows: today's missions come from `loadMissionLogDay`, not the whole history; a Neon query a view
  makes goes through `cache()`.
- Links between pages live in the bars (`NavLinks`, `LensBar`, `TabBar`); their `LinkPending` lights the tapped one at once.
  Do not add `loading.tsx` for that: React holds the page back up to 300 ms after a loading screen (Play arrived 540 ms later).
- Check a change by clicking to the page on `next build && next start`, not only by reloading it.

## Sorare safety

- Public GraphQL is read-only; never add password/login handling.
- Apply remains Check → Draft → explicit Enter. Nothing automatically writes/retries.
- Only identity, entered, check, draft and enter operations; keep allowlists in worker and page bridge.
- Overlay numbers are gated by the extension token; matching the signed-in Sorare account to the owner is not enforced
  yet. No write buttons in overlay; it opens Apply in Sofix.
- xScore is heuristic until S4 passes blind comparison. Cash/essence never convert. Reward percentages have documented
  spread/correlation assumptions.

## Data/schema/cache

- `models.py` → autogenerate → review → Neon dev migrate/test → manual owner migrate on **every** production project
  (Sofix, FDR, Sofix B: "Neon projects" below; a project left behind blocks the automatic move). Never `create_all` Neon.
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
| Sorare | Read-only/rate/complexity limits | Batch/reuse; session actions extension-only. `python scripts/sorare_deprecated.py` lists the deprecated fields our queries ask for (run it before adding a query, and when Sorare emails) |
| Understat | No API, no key; unofficial | One request per league per refresh, only leagues the owner has players in; clear user agent; a failure leaves xG out, never an old number |
| Futbol Fantasy | No API; its robots.txt blocks nothing; unofficial | Read by match before each plan ([plans/futbolfantasy.md](plans/futbolfantasy.md)): the round page of LaLiga, Champions League, Europa League and Copa del Rey, then every LaLiga match and the others with a Spanish club or one of the owner's clubs; two seconds apart, a 240-second budget, stop after three unreadable pages in a row; a match read in the last 25 minutes is not asked for again; clear user agent; a page it cannot read keeps its last reading for 24 hours and then falls back to Sorare's number, never a guess. Each LaLiga club's squad page (`/laliga/equipos/<club>/plantilla`, for where each player plays) is read once a week, 90-second budget. Its chance is the main start % in the forecast, the plans, the Lineups page, the Home's team news and the overlay (FF → Sorare → Sofix). It runs at every refresh, including the half-hourly `near-lock.yml` checks in the last three hours before a lock. The extension also reads `futbolfantasy.com/partidos/<number>` pages live, from the browser, only while a sorare.com page is open with the overlay on: at most one read per match every ten minutes, one page at a time two seconds apart, five minutes' rest after a failure, no credentials, nothing stored after the browser closes. Attribution: every number of its on screen links to its match page; crests and player photos are hot-linked from its static host (personal use) |
| Neon Free | 0.5 GB, 100 CU-hours/month, 5 GB sent per month (then the database is suspended until the 1st) | Publish/cache; no uptime monitor. Every byte Neon sends counts: the app reads a payload once per change (`readModelAt`, `frontend/lib/db.ts`), and Next will not cache an item over 2 MB, so a payload near 1.6 MB is read in pieces. The jobs read only the parts they use: JSON paths of a payload, the games of the players asked about, a game's decisive stats for players not yours, only the name and value of each of your games' stats, only your players out of the score records (the refresh's Sorare step went from ~25 MB to ~7 MB, then ~4 MB, 14 Oct 2026) |
| Third-party art | External ownership | Hot-link; personal use; no LaLiga mark |

Weather/Open-Meteo is removed. Transfermarkt scraping is prohibited.

## Secrets/gotchas

Python/root: `POSTGRES_URL`, owner-only `POSTGRES_MIGRATION_URL`, football/odds/Sorare keys, `SORARE_USER`, `APP_URL`,
`REVALIDATE_SECRET`, `VERCEL_BYPASS_SECRET`, local `REFRESH_TOKEN`. GitHub also: `POSTGRES_URL_SPARE` (space-separated
URLs of the other Neon projects) and `NEON_API_KEY`. Vercel: `DATABASE_URL`, `DATABASE_URL_SPARE`, `GITHUB_TOKEN`, optional
`GITHUB_REPO`, `REVALIDATE_SECRET`, `EXTENSION_TOKEN`, optional `EXTENSION_DIR`, crest flag. Never print/commit values.

Neon production uses `fdr_app` DML-only, verify-full TLS. Destructive SQL/branch actions need explicit approval.

### Neon projects (one account, all on the free plan; state of 14 Oct 2026)

Free projects take turns as production, automatically (owner's ask, 14 Oct 2026). Each sends 5 GB a month, then Neon
refuses every query with HTTP 402 "exceeded the quota" until the 1st.

| Project | Id | Endpoint (in its URL) | Where its URL lives |
|---|---|---|---|
| **Sofix** | `odd-darkness-24982497` | `ep-cold-cloud-b9akf8sh` (`c-7`) | GitHub `POSTGRES_URL`, Vercel `DATABASE_URL`; owner login in `.env.sofix-neon` |
| **FDR** | `sparkling-bonus-46807220` | `ep-jolly-sun-b1a0xc1l` (`c-5`) | first URL of GitHub `POSTGRES_URL_SPARE` / Vercel `DATABASE_URL_SPARE` |
| **Sofix B** | `square-poetry-39931505` | `ep-morning-paper-baxx0rh5` (`c-8`) | second URL of the same two spare settings; owner and app login in `.env.sofix-b-neon` |
| **Sofix C** | `spring-brook-75590503` | `ep-mute-wind-bao6tz8d` (`c-8`) | third URL of the spare settings (19 Oct 2026); owner and app login in `.env.sofix-c-neon` |
| **Trakzi** | `orange-waterfall-16223480` | | Another app of the owner's: never touch it from this repo |

**Rules for every session** (the first look is `node scripts/check.mjs --live`: its "Neon" lines say which project is live,
which are out of quota, and what each has sent this month):
- Never point anything at one project by hand: code reads through `database()` (`frontend/lib/db.ts`), jobs get
  `POSTGRES_URL` from the "Pick the live Neon project" step. A project answering 402 is normal, not a bug to fix.
- New page reads go through `readModel`/`readModelAt`, never `SELECT payload` in a loader or a polled route; anything
  that runs on focus, visibility or a timer must be throttled to minutes. Watch the dev server's `[neon] ... MB` lines.
- One real-data dev server at a time. Load scripts, Playwright against real data or perf loops run on mock data.
- `read_models` keys `neon_live` and `neon_status` belong to the switch: never delete or reuse them.
- Never delete, reset or upgrade a project, create one, or change the spare settings without the owner.

All are eu-central-1, Postgres 18, same tables, app login `fdr_app` (rows only). Never delete one without the owner.
The spare settings hold one or more URLs separated by spaces; `.env.neon-spares` (git-ignored) has both current values.
GitHub also needs `NEON_API_KEY` (an organization key) for the move.

- **Which one is live:** the one whose `read_models` was written last. The app (`frontend/lib/db.ts`) and the jobs
  (`backend/app/jobs/neon_switch.py`, first step of the refresh, league-history and score-checks workflows) use the same
  rule, so nothing stores the choice. A query refused for quota goes to the next project at once.
- **The move:** the refresh runs `neon_switch --move`. When the live project has sent 4 GB this month it copies every table
  to the answering project that has sent least (refuses if `alembic_version` differs), marks it written last (`read_models`
  key `neon_live`) and the run carries on there. On the 1st all reset.
- **Adding a project:** create it (same region), apply the migrations with its owner login, create `fdr_app` with the
  same grants as FDR (`SELECT, INSERT, UPDATE, DELETE` on tables, `SELECT, USAGE` on sequences, matching default
  privileges), append its `fdr_app` URL to both spare settings. The next move fills it.
- **Migrations:** apply them to every project, or the move refuses.
- **Local:** `frontend/.env.local` has `DATABASE_URL` (Sofix) and `DATABASE_URL_SPARE` (FDR, Sofix B, Sofix C).
- **Check usage:** `node scripts/check.mjs --live` prints what the last refresh read from Neon's API (`read_models` key
  `neon_status` in the live project; FAIL with a note when `NEON_API_KEY` gave nothing, which means no move can happen),
  or Neon's `describe_project` (`data_transfer_bytes`; it lags by hours).

**What burned Sofix (7.16 GB in 12-14 Oct 2026), measured on 14 Oct:** about 0.3 GB came from the jobs; almost all the
rest came from localhost.
1. `npm run dev` skips Next's cache whenever the browser sends `Cache-Control: no-cache`, which every
   `fetch(..., { cache: "no-store" })` and every hard reload does, and `lib/cache.ts` turns it off in dev on purpose. So each
   such request downloaded its payloads again: `/api/my-week` pulled the 0.83 MB `sorare` payload plus 0.1 MB of weeks.
2. `EnteredLineups` asked again on every `visibilitychange`, and the desktop app's browser pane flips visibility about
   once a second, so one open Home or Play tab called `/api/my-week` every second: about 1 MB a second, ~3 GB an hour.
3. 28 of the 42 refreshes (~28 MB each) were started by pushes, and league-history read the whole `player_games`
   table (23 MB) every day.

Fixed the same day: payloads in dev are kept on disk by key and write time (`keptInDev` in `lib/db.ts`, under
`node_modules/.cache/sofix-neon`), so a no-cache request, a deleted `.next` or a new `NEXT_DIST_DIR` no longer downloads
them again; saved weeks go through `readModelAt`; `EnteredLineups` re-asks only after a minute away; the two extension
routes read one field of `sorare` instead of all of it; a push starts a refresh only if none started in the last
3 hours; league-history reads a light index (`player_games.known`). The dev server logs every Neon read over 50 kB
(`[neon] ... MB`), so a new leak shows in the terminal at once. Per day now: ~0.15-0.2 GB of jobs plus page views.

History: FDR was production 14 Sep to 12 Oct; Sofix took over 12 Oct from a copy
(`backend/data/raw/neon-backup-2026-10-12/`, git-ignored); on 14 Oct Sofix ran out, FDR (still answering at 5.23 GB)
became live, and Sofix B was made and filled from FDR as the next one.

Dev binds `127.0.0.1`; no Docker; port 5432 belongs elsewhere; run npm only from `frontend/`; Windows reload may miss
model/schema edits. Preserve unrelated work. Commits: `<type>: <description>`.

## Engineering operating rules (free-first)

### Preserve the owner's workflow (required in every session)

- Before implementation, record the requested outcome, coverage and user actions in the task's plan. Read that contract
  when resuming; an implementation limitation does not change the requirement.
- Do not substitute manual page visits, extra tabs, repeated clicks, reduced coverage or another source for an automatic
  feature without first explaining the evidence and alternatives and getting the owner's agreement to that change.
- Prove a source limitation using its official documentation and a representative read-only request. A null response
  from one query is evidence about that query, not proof the data is unavailable. Keep a credential-free reproduction.
- Write acceptance tests for the requested workflow before fixing it. Cover a cold start, the selected GW's coverage,
  navigation/tab closure, expiry, missing versus zero and source identity where applicable. Test fixtures must not
  silently assume away the failure being fixed.
- A unit test, mock browser test, HTTP 200 or one successful player is not whole-feature proof. Before shipping, state
  what was verified on real data, what remains unverified, and whether the requested acceptance criteria were met.
  Do not ship a known workflow substitution as a completed fix; discuss unresolved product tradeoffs with the owner.
- Preserve these rules and the task's evidence in the repository, not only chat memory. The standing direct-to-main
  shipping permission does not authorize changing the requested user experience.

The general contract is the global `~/.claude/rules/engineering-os.md`; if it is missing, these are the rules that bind
this repo. Precedence: this file, then the global rules.

- **€0 incremental spend.** Never upgrade Neon/Vercel/GitHub/Odds API/Firecrawl/Context7/Figma, buy credits, enable
  pay-as-you-go, raise a cap or attach a payment method. Quota/402/429 → back off, use cache or the local fallback, report
  only what it blocks. Limits table above is the current contract.
- **Free comes first, tricks allowed** (owner, 12 Oct 2026; this overrides the global rule against getting around a
  free tier). When a free allowance runs out, use whatever keeps the app free and running (another free project or
  resource, a second free service, a workaround) without stopping to ask. Try what the provider's free plan itself
  allows first, and never lose the owner's data doing it.
- **Local first.** `node scripts/check.mjs` plus the changed page's spec before the push, then `--live` after it
  (Shipping above). CI and Vercel are not debuggers and nobody waits for them; `npm run design` only when a preview in
  `docs/sorare/design/` changed.
- **Production Neon is read-only** for agents (`fdr_app` is DML-only). Test on local/dev data; seed deterministically.
  No seeding, truncating, deleting or speculative migrations on production; migrations follow `backend/migrations/`.
  The one exception is the automatic move between Neon projects (`neon_switch.py`), which copies every table; never
  run it, delete a project or edit the spare settings by hand without the owner ("Neon projects").
- **Tests:** test-first for behavior changes (rules, regressions, contracts), no coverage-padding. Bug fix = failing
  regression test first. Report pre-existing failures separately; never claim "all pass" if any fail.
- **Browser proof for UI:** desktop + mobile screenshots of the affected state on the local dev server (real data),
  semantic selectors, no horizontal overflow. Authenticated Sorare flows use the extension test path only; never print
  or commit tokens/cookies.
- **Paid/side-effecting APIs** (Odds API 500/month, Sorare, any AI inference): fixtures/mocks; one batched real call at most.
- **Subagents/tools sparingly:** main context for the work, no review subagents (read your own diff before the commit);
  Context7 1–3 queries, Firecrawl ~3–5 pages, Figma only for a real source-of-truth frame. Reuse results within a task.
- **Final report:** Implemented / Verified / Notes, stating exactly which checks ran and which were unavailable.

## Yearly rollover

1. Add promoted clubs and source/Sorare aliases to the registry.
2. Refresh and confirm 20 clubs, predictions and LaLiga squad index.
3. Regenerate fixed preseason projection.
4. After season, rerun blind backtest and update only if gates pass.
