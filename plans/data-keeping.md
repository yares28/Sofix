# Plan · Keep what Sofix reads (8 Oct 2026)

## Context

On 7 Oct the owner asked what Sofix saves from its sources. It reads everything and keeps its own copy, but several things
exist only as a rolling 70-day window, a browser cache or a file GitHub may delete. He wants them kept for good:

| His item | Why | Today |
|---|---|---|
| 1. Your entered lineups | compare his lineups with Sofix's on the Audit | read live through the extension, never stored |
| 2. Essence you won | compare his return with Sofix's | browser `localStorage` only (`sofix:won:v1:<slug>`) |
| 3. Your players' game history | "this should be in" | re-read every refresh, never stored; 10 of his 84 players (outside LaLiga) not in the daily store |
| 4. Bookmaker odds (teams) | "won X of Y times at these odds" | feature exists (`services/odds_record.py`) on football-data.co.uk CSVs held only in GitHub's Actions cache; The Odds API row deleted at kick-off |
| 5. Every player's past games | keep them; show them on each player's page | one JSON read model, last 70 days, rewritten daily |
| 6. Sorare's projections | Sofix's xScore vs Sorare's projection vs the real score | both kept per week in `score_record:<slug>`; real score fetched elsewhere |

Upgrades he picked on 8 Oct: **U1** audit all ~620 players (the Audit fills ~8× faster, one source of real scores instead
of four), **U2** match forecasts kept at kick-off (Sofix vs the bookmakers), **U3** Futbol Fantasy's predicted eleven kept and
checked, **U4** full stats per game (the stat sheet builds itself), **U6** injury history, **U7** last season seeded, **U8**
your season on Recap and Cards, **U9** health of each dataset on Control. Not picked: price history, weekly backup.

His rules: save a week **a day after it is final**; if a source is unavailable, paid or gone, the app keeps working on what
it stored (**save what we read: an outage stops new data, never loses old data**); each player's data lives on his page.

This file is the whole plan (approved 8 Oct 2026). "Next up" in [roadmap.md](roadmap.md) and TODO.md "Forgotten" only point
here; each shipped step writes its result under "Results" at the end.

## The one schema step (owner, once)

One Alembic migration with four tables, so production is migrated by hand once (AGENTS.md: owner migrates production first,
code pushed second; a pending migration stops the refresh, `jobs/refresh.py:109-119`). Template:
`backend/migrations/versions/fd89c678d11e_sorare_forecasts_kept_per_gameweek.py` (head). Add the tables to
`tests/test_migrate.py::test_upgrade_to_head_builds_the_schema`; the drift test must pass.

- **`player_games`**: one row per player per game, key `(player, game_id)`, index `(player, date)`.
  - What happened: `date`, `competition`, `home`, `away`, `status`, `score`, `played`, `started`, `mins`, `yellow`, `red`
    (null = not read), `stats` (JSON, non-zero `detailedScore` stats, U4), `read_at`.
  - What was said, frozen at the gameweek's lock (item 6, U1, U3): `ff_start`, `sorare_start`, `sofix_start`, `ff_xi`
    (in Futbol Fantasy's eleven), `sofix_x` (xScore), `sorare_x` (projection), `said_at`.
- **`match_odds`** (item 4): one row per LaLiga match per source, key `(season, date, home, away, source)`, `fixture_id`
  nullable (past seasons have no `Fixture` rows); `hg`, `ag`, closing and pre-match home/draw/away prices (fair odds for
  The Odds API's margin-free probabilities), `over_2_5`, `which` (PSCH, AvgCH, … or `the-odds-api`), `read_at`.
- **`match_forecasts`** (U2): one row per fixture, frozen at kick-off: model version, `p_home/p_draw/p_away`, xG, `frozen_at`.
- **`player_absences`** (U6): one row per spell: player (FF id and slug when linked), `kind` (out, doubt, suspended),
  `cause`, `first_seen`, `last_seen`, `back`.

Size: ~35k game rows a season (tens of MB with stats), ~4.2k odds rows, ~380 forecasts: well inside Neon's 0.5 GB.
Production step: the owner runs `python -m app.migrate` (uses `POSTGRES_MIGRATION_URL`) or approves me running it.

## Steps

### 1 · Every player's games, kept for good (items 3, 5; U4)
- `backend/app/sorare/sync.py`: `HISTORY` / `HISTORY_CARDS` get paging (`pageInfo`, `after`) and `anyGame` home/away
  names; keep `detailedScore` whole for `stats` (with `points` if `sheets_from_games` needs it); add `_yellows` next to
  `_sent_off` (a second yellow arrives as `red_card` only, so it never counts toward five).
- `league_history()` fetches only new games: from (his newest stored game − 3 days, for late corrections and PENDING →
  FINAL) to now + 8 days; a player never stored starts at the season's start (`snapshot["gameweeks"][0]["start"]`).
  Upserts; saves every 50 players.
- `backend/app/jobs/league_history.py` reads the `market` slugs **plus** `collection[].player` (his 84 players, 98 cards),
  about 700 players.
- The refresh upserts its fresh read of his players (`snapshot["history"]`), so they are current between daily runs. Row
  upserts touch only their own columns, so the two jobs never overwrite each other.
- `jobs/sorare.py::cached_league` builds the same `{slug: {"games": rows}}` from the table (last 70 days), so
  `publish.player_weeks`, the forecast and everything downstream stay unchanged. `sorare_league_history` stops being
  written (dropped one release later).
- **Bans** (`publish._banned`, `forecast.own_start`, and the plan's own-form fallback `_split`, closing TODO "Forgotten" R):
  a red card, or the fifth LaLiga yellow of the season, in his last LaLiga game before this one bans this one. Confirm
  LaLiga's current rule in RFEF's disciplinary code before shipping and cite it in the comment.

### 2 · What each source said, for every player (item 6; U1, U3 data)
At each refresh until the gameweek locks, write per player per game: the three start % (the market rows'
`sources`), whether he is in Futbol Fantasy's eleven (`lineups` rows vs alternatives), Sofix's xScore and Sorare's projection
(`publish.score_record`, lines 1308-1350). After the lock they are frozen (the `record.save` pattern,
`backend/app/sorare/record.py:128-182`). `start_chances` and `score_record:*` keep running until step 3 has switched over.

### 3 · The Audit reads the table (U1, U3; item 6)
- "Who starts?" and the xScore figures come from `player_games` for all ~620 players: about eight times the cases a week,
  so the 100-case threshold is reached in days instead of weeks.
- xScore: Sofix vs Sorare vs the real score, side by side (mean miss, how often each was closer).
- New **"Futbol Fantasy's eleven"**: how many of its predicted starters started, per week and per club; same for the eleven
  Sofix and Sorare imply (the Lineups reorder, `lib/lineups.ts::byChance`).
- Retire the separate settle paths (`versus.settle`, `starts.settle`, `record.rows`, `missions.settle`) once the figures
  match on the overlap; fewer Sorare calls per run.

### 4 · Each player's page (item 5's page; U4, U6)
`frontend/app/players/[slug]/page.tsx`, `components/players/PlayerView.tsx`, new `frontend/lib/playerGames.ts` (`cache()`,
SQL through `lib/db.ts::database()`, revalidated with the `sorare` tag):
- **This season**: one line per game, newest first: date, competition, home v away, started / came on / did not play,
  minutes, score (band colours), yellow and red, and where recorded Sofix's xScore and Sorare's projection next to the real
  score. Summary on top: games, starts, average, yellows ("one away from a ban" at four), each forecast's average miss.
- **Stat sheet, "Compared with others" and "Last N starts"** built from `player_games.stats` by a daily read model (the
  logic of `backend/app/sorare/sheets.py::sheets_from_games`), replacing the hand-run `stat_sheets.json` import (also read
  by `lib/missionLog.ts`, `lib/missionsToday.ts`).
- **Injuries**: record spells each refresh from Futbol Fantasy's absent lists (extend `last_seen`, close when he is back);
  show a timeline on his page. Using it in the start % is a later step, only if a backtest shows it helps.
- Design: existing `pd-card` look, 11/10 px floor; page spec, 1440/390 look, `web-design-guidelines` on the new sections.

### 5 · Last season too (U7)
One-off `python -m app.jobs.seed_player_games` from the local export (`backend/data/raw/sorare_games.jsonl`, 449 LaLiga
games, 15 Aug 2025 → 20 Sep 2026, with stats), run from the PC with his explicit OK (a production write). Upserts only;
the daily job's rows win where both exist.

### 6 · Your week, saved a day after it is final (items 1, 2; U8)
- A week is saved once it ended more than 24 hours ago (`publish.SETTLE`) and every lineup has its rank: lineups are fixed
  at the lock, but scores and rewards are final only then.
- The app already reads finished weeks through the extension (`lib/entered.ts::runWeekLineups`, `readWeekLineups`,
  `weekWon`); no extension release.
- New same-origin route `POST /api/my-week` (zod body; `REFRESH_HEADER` + `isSameOriginRequest`, as `/api/refresh`) writes
  read model `my_week:<slug>` once: each lineup's competition, cards (card slug, player, rarity, score, captain), score,
  rank, cash, essence, card, XP. `GET /api/my-week` lists finished weeks not saved yet; Home checks once a day and reads
  those (the `RewardsAudit` loop moved into a shared helper); Home, Play and the Audit also post any final week they read.
- Audit: Rewards' "You" reads saved weeks first (browser cache becomes the fallback); a week-by-week comparison of your
  lineups with Sofix's plan as it stood at the lock (`sorare_plan:<slug>`, never read until now), scored with
  `player_games` (the roadmap's "frozen plans scored").
- **Your season** (U8): essence and cash per week on Recap; per card on Cards ("this card earned you …").

### 7 · Odds and match forecasts kept per match (item 4; U2)
- `jobs/predict.py::predict_upcoming`: after `load_history` (`backtest/data.py:88-116`), upsert every match with odds into
  `match_odds` (all cached seasons on the first run), names via `team_registry.by_history_name`, `which` = price source.
- `jobs/sync_odds.py`: before a kicked-off fixture's `MarketOdds` row is deleted (lines 99-119), copy it as `the-odds-api`,
  only if fetched before kick-off.
- `odds_record.build_record` takes CSV matches first and `match_odds` for anything the CSVs lack; with both sources gone it
  keeps working on stored rows and says "odds up to <date>".
- **Match forecasts**: the predict job upserts each fixture's forecast into `match_forecasts` until kick-off, then never
  again. Audit view: Sofix vs the bookmakers' price (closing from `match_odds`) vs the result (live RPS, the
  "too few to tell" rule under 100 matches).

### 8 · Health on Control (U9)
One line per kept dataset under "Last refreshes": games (players, newest game, last read), odds (newest match and which
source fed it, a warning when a source has stopped), forecasts, absences, your weeks (newest saved). Data: one small
`data_health` read model written by the jobs.

## Shipping

Migration (owner) → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Each step: `node scripts/check.mjs`, the page spec and a 1440/390
look on localhost when visible, commit, push to `main`, `check.mjs --live`, then the owner checks before the next. Docs in
the same commit: `docs/user_manual.md`, `docs/how_it_works.md` (the tables, who writes what), roadmap Results.

## Verification

- **1**: dispatch `league-history.yml`; SQL: ~700 players, season-long rows, yellows and stats present, no duplicates; a
  second run fetches only new games; a red card and a five-yellow case ban only the next LaLiga game; Sofix numbers unchanged.
- **2–3**: after a lock, every player's said-columns are filled and frozen; the Audit's case counts jump to ~620 a week and
  agree with the old figures on his players.
- **4**: `/players/<slug>` for a LaLiga regular, a Chelsea/Mainz card of his and a goalkeeper, at 1440 and 390 px; the stat
  sheet matches the old export on overlapping games.
- **5**: 2025/26 rows present; the stat sheet shows two seasons.
- **6**: open Home with his Chrome; `my_week:<slug>` rows appear for finished weeks; Audit and Recap show them.
- **7**: `match_odds` 2016/17 → today; the board's odds record unchanged; with the CSV folder emptied locally, it still builds
  from the table; `match_forecasts` rows frozen at kick-off.
- **8**: Control shows each dataset; stopping a source locally shows the warning.

## Results

- **9 Oct 2026 - production migration and seed completed:** after explicit owner approval, applied exactly
  `3ce433a96bed` on the confirmed production branch and verified all four tables. The approved one-off seed ran with
  the DML-only app role: 29,094 rows for 1,020 players, including 24,990 rows in 2025/26 and 4,104 in 2026/27;
  542 stat sheets rebuilt. SELECT confirmed those counts, dates 15 Aug 2025 to 20 Sep 2026 and no invented frozen
  statements. No configuration files or unrelated data were changed. Rebased on the concurrent missions repair,
  preserving its daily ledger and imports; two failing-first integration regressions now pass (19 focused tests).
  `node scripts/check.mjs` passed every backend/frontend check. Fresh real-data player previews at 1440/390 px
  returned 200 with no horizontal overflow or text below the floor. The full browser suite passed all 197 tests
  (desktop and phone). The deployment check follows the push. Steps 6-8 remain; no further migration is needed for them.

- **9 Oct 2026 - migration execution blocked by automatic approval review:** the owner asked me to handle it while
  away. I prepared an in-memory, non-echoing credential path to the confirmed production branch, checked default
  privileges for the DML-only app role, and reran all eight migration tests (including drift), which passed. The
  automatic approval reviewer rejected the migration/seed command because it requires an explicit migration approval
  and did not accept "figure it out" as that approval. The command never started; no production write or configuration
  change ran. Explicit approval for `3ce433a96bed` is pending; the separate seed approval remains valid. Step 6's code
  paths have been read but its implementation has not started.

- **9 Oct 2026 - production seed approved, not run:** the owner explicitly approved step 5's one-off seed after the
  single migration. SELECT on Neon's named production branch confirmed revision `fd89c678d11e` and all four new
  tables absent. The local frontend target agrees on the schema; local backend/root migration settings instead point
  at another host that fails DNS, so they must not be used unchanged. No database writes, configuration changes,
  migration, seed or push ran. The reviewed migration `3ce433a96bed` still needs separate owner approval; the seed
  approval persists and does not need asking again. Steps 6-8 remain.

- **9 Oct 2026 - step 5 built locally:** `app.jobs.seed_player_games` validates the complete local export before
  connecting and defaults to a count-only dry run. With explicitly approved `--write`, it fills missing actuals and
  statement-only rows, preserves all existing daily readings regardless of import time, leaves frozen forecasts alone,
  and rebuilds `player_sheets`. Truncated/invalid lines fail before any write; old export projections are never treated
  as pre-lock statements. Six new tests failed first, then passed; all 14 focused seed/game/sheet tests passed.
  `node scripts/check.mjs` passed ruff format/check, mypy, the full pytest suite, OpenAPI export, generated types,
  eslint, typecheck and Vitest. The real export dry run found 449 games, 1,020 players and 29,094 player-game rows,
  15 Aug 2025 to 20 Sep 2026 (380 matches in 2025/26, 69 in 2026/27), without opening a database. A disposable
  in-memory SQLite import kept 24,990 rows from 2025/26 and 4,104 from 2026/27, produced 542 sheets exactly matching
  the export, and preserved row counts and read timestamps on repeat import. No page code changed; step 4's page
  specs and desktop/mobile proof remain the page verification. Manual, calculation guide and roadmap updated.
  No production seed, migration, push or post-push live check ran. Step 5's production write awaits explicit owner
  approval after the single migration; steps 6-8 remain.

- **8 Oct 2026 - step 4 built locally:** player pages now read permanent games and absence spells through cached,
  parameterized queries (with local API equivalents). This season shows real sides, competition, appearances, minutes,
  score bands, cards and saved forecasts; its summary checks forecast misses on known starts and treats unread cards as
  a lower bound. The daily job publishes `player_sheets` from complete saved starts, replacing the manual JSON runtime
  imports on player pages and both mission consumers. The Sorare read retains actual position, playing side, venue and
  decisive level alongside action stats. Fresh FF reports extend one continuous absence spell, including out-to-doubt
  changes, preserve profile/shirt identity when a row disappears, attach later Sorare links and close only on explicit
  availability; failed, empty and delayed readings cannot invent a return. This history does not change start chances.
  Tests failed first, then focused backend tests (27) and UI/mission logic tests (24) passed. The final
  `node scripts/check.mjs` passed ruff format/check, mypy, the full pytest suite, OpenAPI export, generated types, eslint,
  typecheck and Vitest. The full browser run passed 192 of 193 tests; its remaining failure was a selector expecting one
  FF link when two spells had two links. That selector was fixed. A new accessibility check then found invalid definition
  list markup, also fixed; the final player spec passed all five tests, and all 13 mobile tests passed. Earlier gate runs
  found import ordering and an optional collection type, fixed before the passing gate. A disposable in-memory SQLite
  copy of the real 449-game export produced 542 sheets, all exactly matching the export on overlap. Existing published
  read models were copied with SELECT only for the preview; no production data was written. Foyth, Soria, the owner's
  Chelsea and Mainz cards, and Starfelt's real FF report were inspected at 1440/390 px with real cards/crests, screenshots,
  no sideways overflow and no text below the floor. Web interface guidelines review and real-page axe check passed.
  The abroad pages honestly show no current-season games in this local copy; a single attempted Sorare batch was
  unavailable without a locally configured key, so fresh outside-LaLiga history was not verified live. Docs updated.
  No production migration, seed, table-dependent push or live deployment check has run. Owner page check comes next;
  steps 5-8 remain, with production migration and step 5's production seed still requiring the owner's approval.

- **8 Oct 2026 - step 3 built locally:** the published Audit and local API now join every player's stored games to frozen week metadata. Start counts and the Sofix/Sorare score comparison agree with legacy figures on the tested overlap without double counting; unknown results stay pending and new weeks wait until end + 24 hours. FF's eleven and the same-formation Sorare/Sofix elevens have week/club counts, with ties and absences respected and rates withheld under 100 checked starters. Week metadata is now guarded at lock too. The refresh stops the separate start, projection, versus and mission settle paths; missions use kept stats, with no inferred DNP for missing rows. Tests failed first for the table switch, metadata guard, legacy-only completion, FF positions and API fallback, then passed. Focused backend integration (126 tests), UI logic (21 tests), Audit/mobile Playwright specs (25 tests) passed. The final `node scripts/check.mjs` passed ruff format/check, mypy, the full pytest suite, OpenAPI export, generated types, eslint, typecheck and Vitest. Earlier runs exposed lint issues, two tests still reading the retired start record, and a test renderer type issue; all were fixed before the passing gate. Real-data localhost previews of `/audit`, `/audit/starts` and `/audit/versus` were inspected at 1440 and 390 px, with screenshots, no sideways overflow and no text below the floor; web-design-guidelines review completed. The real published data has no new eleven rows yet, so its honest empty state was inspected; populated evidence and thresholds are tested with fixtures. Docs updated in this commit. No table-dependent push, production migration, seed or live verification has run. Owner page check comes next, then step 4.

- **8 Oct 2026 - step 2 built locally:** every planned player/game keeps FF, Sorare and Sofix start chances, the existing score comparison's two numbers, and FF's eleven membership. Source readings update only before lock, preserve missing sources and actual columns, reject delayed older writes, and never reconstruct an after-lock statement. Sorare's next-game odds are not copied to a second game. The legacy records continue until step 3. Four focused tests failed first, then passed; refresh integration is checked too. `node scripts/check.mjs` passed ruff format/check, mypy, the full pytest suite and OpenAPI export after a payload type annotation fixed the first run's mypy failure. Deployment/live verification remain pending the single production migration.

- **8 Oct 2026 - step 1 built locally:** paged season-first reads and incremental corrections persist every market/collection player's games, teams, yellows and non-zero stats. Owner refreshes upsert actuals without touching frozen statements or losing older/newer reads; the 70-day form window retains season yellow totals. Red/five-yellow fallback bans cover only the next LaLiga game, including a double week (RFEF code of 3 March 2026, articles 119–121). Focused tests failed first, then passed; `node scripts/check.mjs` passed ruff format/check, mypy, the full pytest suite and OpenAPI export (first run found an import-order issue, fixed before the passing rerun). No production migration, seed, daily dispatch or table-dependent push has run. Continuing the remaining steps locally with the one schema migration.

- **8 Oct 2026 — plan registered:** `bb029ca` committed this plan with its roadmap and TODO pointers; confirmed on `origin/main`.
- **8 Oct 2026 — prerequisite CI repair, shipped `b1f2642`:** the session-start check found all 11 production pages answering 200 and the last refresh successful, but frontend CI failed its runtime dependency audit. The same audit failed locally; Next.js and its matching lint config were updated from 15.5.25 to 15.5.27. The runtime audit now reports no vulnerabilities; `node scripts/check.mjs` passed API generation, eslint, typecheck and Vitest. After the push, `--live` passed: Vercel deployed, all 11 pages answered 200, frontend CI succeeded, backend CI was running, e2e was queued and the last refresh succeeded. The main folder had local changes and was left untouched.
- **8 Oct 2026 — schema prepared, not pushed:** migration `3ce433a96bed` adds the four tables without changing or seeding existing data. The schema tests failed first (the four tables were missing), then all eight migration tests passed, including model/migration drift, duplicate keys, nullable unknown values, odds without fixture rows and separate absence spells. `node scripts/check.mjs` passed ruff format/check, mypy, the full pytest suite and OpenAPI export. PostgreSQL offline SQL generation passed (four table additions, no dropped tables); no Neon dev or production migration was run. The calculation guide documents the schema; the user manual stays unchanged because no page or user behavior changed. Production migration and steps 1–8 remain pending.
