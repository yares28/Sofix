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
- Routes: `/`, `/play`, `/lineups`, `/fixtures`, `/difficulty`, `/table`, `/audit`, `/cards`, `/players`, `/control`, `/team/[code]`.
  `/audit` is Sofix checked against what happened (backend/app/sorare/audit.py, read model `audit`): the xScore success rate and who
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
| Futbol Fantasy | No API; its robots.txt blocks nothing; unofficial | Read by match before each plan ([plans/futbolfantasy.md](plans/futbolfantasy.md)): the round page of LaLiga, Champions League, Europa League and Copa del Rey, then every LaLiga match and the others with a Spanish club or one of the owner's clubs; two seconds apart, a 240-second budget, stop after three unreadable pages in a row; a match read in the last 25 minutes is not asked for again; clear user agent; a page it cannot read keeps its last reading for 24 hours and then falls back to Sorare's number, never a guess. Each LaLiga club's squad page (`/laliga/equipos/<club>/plantilla`, for where each player plays) is read once a week, 90-second budget. Its chance is the main start % in the forecast, the plans, the Lineups page, the Home's team news and the overlay (FF → Sorare → Sofix). It runs at every refresh, including the half-hourly `near-lock.yml` checks in the last three hours before a lock. The extension also reads `futbolfantasy.com/partidos/<number>` pages live, from the browser, only while a sorare.com page is open with the overlay on: at most one read per match every ten minutes, one page at a time two seconds apart, five minutes' rest after a failure, no credentials, nothing stored after the browser closes. Attribution: every number of its on screen links to its match page; crests and player photos are hot-linked from its static host (personal use) |
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
- **Local first.** `node scripts/check.mjs` plus the changed page's spec before the push, then `--live` after it
  (Shipping above). CI and Vercel are not debuggers and nobody waits for them; `npm run design` only when a preview in
  `docs/sorare/design/` changed.
- **Production Neon is read-only** for agents (`fdr_app` is DML-only). Test on local/dev data; seed deterministically.
  No seeding, truncating, deleting or speculative migrations on production; migrations follow `backend/migrations/`.
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
