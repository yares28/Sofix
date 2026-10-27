# Multi-competition review: issues and fixes (23 Oct 2026, checked against the code and decided 27 Oct 2026)

A review of everything shipped from the multi-competition plan: Premier League, Bundesliga, Ligue 1, Champions League,
Europa League and Conference League, next to LaLiga. Each item is the issue, then the fix, what it costs against the app's
free limits, what it must not break, and how we know it is done. The original plan (`multi-competition-expansion.md`) lived in
the old Codex folder `.codex/worktrees/7e4a`, which no longer exists (27 Oct); this file is the working list.

**Owner's decisions, 27 Oct.** All of it is done in this session, in the order below (no roadmap entry). All six suggested
additions are accepted (now B7, B5, B4, D6/C3, C1, B2). No waiting months for "proof": no league's forecast is proven; a change
ships when the check on past games says it is better. Futbol Fantasy's Premier League pages: no. Club colours: from the real
crests. Odds on the All board: yes, within the limits (they are: B4). Sorare's own number stays out of Sofix (X4, his rule of
26 Oct). X1 is rebuilt as running success rates per competition, club and player, with nothing kept per player for long.

**Three things changed since 23 Oct and touch many items:**

- **The All board** (26 Oct, [difficulty-all.md](difficulty-all.md)): Difficulty has an icon picker and an "All" board that
  joins each club's domestic and European games by reviewed UEFA ↔ domestic identities
  ([all_competitions.py](../backend/app/services/all_competitions.py), blocks `grid:ALL` and `grid:ALL:teams:0..5`).
- **The score engine** (26 Oct, [score-engine.md](score-engine.md)), in plain words: today Sofix guesses a player's score in one
  step, from his past scores and how hard the opponent is. The engine instead predicts each thing Sorare counts (passes,
  tackles, shots, saves, goals, assists, clean sheets, the decisive actions) and adds them up with Sorare's own formula. LaLiga
  first, in phases E0–E7; E0 shipped 26 Oct. Phase 2 items here are built so the engine reuses them (each says how).
- **Pages read Cloudflare R2, not Neon** (26 Oct, [neon-write-mostly.md](neon-write-mostly.md) §4), and pages are moving to
  Vercel's CDN ([cacheable-pages.md](cacheable-pages.md), 27 Oct, in progress in another session).

---

## How data moves today (27 Oct), and what each item may touch

```text
sources (football-data.org/.co.uk, The Odds API, Sorare, Futbol Fantasy, Understat)
   │  GitHub Actions jobs (refresh.yml ~13 a day, score-checks.yml 5–27 a day, league-history.yml daily)
   ▼
Neon (live project, chosen automatically)  ── put() ──►  R2 bucket sofix-pages: blocks/<key>.json = {updatedAt, payload}
   ▲  jobs read their inputs:                              ▲  every job's last step (publish_to_r2) copies what put() missed,
   │  - page blocks through kept_blocks.rows               │  deletes blocks Neon no longer holds, publishes player_games:<slug>
   │    (R2 first, Neon only if R2 misses)                 │  (one per player, ~5,250) and refresh_runs; then /api/revalidate
   │  - game history through the games mirror              ▼
   │    (SQLite copy in GitHub's cache; Neon sends      Next.js on Vercel: pages read R2 only, one HEAD/ETag per block,
   │     only fingerprints and changed rows)            payload cached under that version (lib/r2.ts, readModelAt)
```

What this means for every item below:

1. **A changed block costs; an unchanged one is free.** `put` ([publish.py:34-48](../backend/app/services/publish.py)) skips a
   payload equal to the stored one. A changed block costs a Neon write, an R2 write, a new ETag (pages download it again from R2
   and rebuild: Vercel CPU) and a re-read by any job that reads it.
2. **Jobs never read a page block with `db.get(ReadModel, …)`**; they use `kept_blocks.rows`/`kept_blocks.read`
   ([kept_blocks.py:80-110](../backend/app/services/kept_blocks.py)): R2 first, kept in GitHub's cache.
3. **Any change to a `player_games` row changes that player's fingerprint** (md5 over every column,
   [games_mirror.py:23-28](../backend/app/sorare/games_mirror.py)): the next job re-fetches his changed rows from Neon, and
   `publish_to_r2` re-uploads his `player_games:<slug>` block if its content changed ([player_blocks.py:86-101](../backend/app/services/player_blocks.py)).
4. **Pages never read Neon.** A new page read goes through `readModel`/`readModelAt` (R2). A block near 1.6 MB is split (Next
   will not cache an item over 2 MB). A client component gets only the fields it draws.
5. **No schema change.** A migration must be applied by the owner to all five Neon projects first (AGENTS.md). Every item here
   needs none; new data goes in blocks.
6. **Read-model keys are never renamed or reused.** `neon_live` and `neon_status` belong to the project switch.

## The app's limits: measured on 27 Oct, and a month ahead

Sources: `node scripts/check.mjs --live`, the `neon_status` and `refresh_runs` blocks on R2 (27 Oct 13:30), the local block
copy (`frontend/.blocks`, 26 Oct), GitHub's public run list (20–27 Oct). Every item states its cost in a **Cost** line.

| Limit (free plan) | Measured 27 Oct | A month ahead, today | A month ahead, after this plan | Items |
|---|---|---|---|---|
| **Vercel Hobby**, whole account: 4 h Fluid Active CPU, resets 1 Nov | 3 h 56 m used (27 Oct, usage page): **about 4 minutes left** | **Will run out before 1 Nov** at 6–23 min a day; a push adds a deploy and its ~30-call screenshot sweep | Pushes held until 1 Nov (see "Pushing"); page items after cacheable-pages | all page items |
| **Cloudflare R2** writes: 1 M a month | Not shown by any tool; estimated from block times: one refresh re-uploads ~1,700 player blocks, so **~22,000 a day, ~760,000 a month** with the rest | **Close to the 1 M limit** | ~150,000 a month after L1 | L1 (saves), B3 (saves), X1 |
| R2 reads 10 M a month; storage 10 GB | ~8,500 blocks, ~81 MB | fine | fine | – |
| **Neon** per project: 5 GB sent a month (switch at 4 GB) | One refresh ~26 MB (Sorare step 20.1, of which "games saved" 6.8 and "early plans" 5.1, Audit 3.5; boards 2.0; publish 2.6). Sofix D live at 98 MB; the others out until 1 Nov | ~340 MB a day from refreshes: ~10 GB a month of ~20 GB usable across 5 projects; Sofix D lasts to 1 Nov | ~230 MB a day after L1 and B3 | L1, B3 (save) |
| Neon storage 0.5 GB | 111 MB (refresh 180) | fine | +~1 MB (X1 totals) | X1 |
| **The Odds API**: 500 credits a month | 370 left on 27 Oct (130 used) | ~150 a month | ~340 with X3 | X3 |
| **GitHub Actions** (public repo): free; cache 10 GB; refresh timeout 25 min | Refreshes 10–14 min (runs 177–180) | fine | under 10 min (C1) | C1 |
| **Sorare API**: 200 requests a minute, 30,000 complexity a query | Projections of all 5,007 covered players read each refresh | fine | one more field in an existing query (X1) | X1, D5 |
| football-data.org 10 a minute; Futbol Fantasy 240 s a refresh; Cloudflare clock (one of 5 free timers) | in use | fine | unchanged | – |

**How the month stays inside every limit:** L1 first (R2 and Neon), B3 next (Neon, R2, Vercel), and no push until Vercel's
reset on 1 Nov. After those, no item adds a per-view server render, a per-run block rewrite, a Neon read or a per-player write.
Two numbers are estimates and are checked first: R2 writes a month (Cloudflare dashboard → R2 → Metrics, which only the owner's
login shows) and Neon bytes by job (`python -m app.services.neon_ledger --day <day>`; the owner runs it, or allows this session
one read-only query).

## Pushing (Vercel)

Every push to `main` deploys on Vercel today (`frontend/vercel.json` has no `ignoreCommand` yet; cacheable-pages P0 adds it),
and each deploy triggers Vercel's screenshot sweep (~30 function calls). With about 4 minutes of CPU left until 1 Nov, one push
could pause every app on the account. So:

- Until 1 Nov: build and test each item locally (`node scripts/check.mjs`, specs, the 1440 + 390 px look on the local dev
  server, which reads the local block copy and costs Vercel nothing), commit locally, **push nothing**.
- On 1 Nov (or once `ignoreCommand` has shipped and the owner's usage page shows room): push the backend items in one push, then
  the frontend items in as few pushes as possible; `check.mjs --live` with only the changed pages, never `--all-pages`.

---

## What must not break (applies to every item)

Each item's tests prove the points that apply to it; `node scripts/check.mjs` runs them all before every push.

1. **Frozen files stay byte-identical:** `modeling/dixon_coles.py`, `sorare/keeper.py`, `sorare/outfield.py` and the frozen
   `research/` files are hashed on their bytes ([conference_recorder.py:189](../backend/app/research/conference_recorder.py),
   [european_validation.py:36-46](../backend/app/research/european_validation.py)). New code goes in new files or unfrozen ones.
   Proof: the recorder and validation tests pass.
2. **Every competition's model still loads** (the loader silently turns a competition off if its artifact misses a check,
   [foreign_scores.py:58-82](../backend/app/sorare/foreign_scores.py)). Proof: a test that `foreign_scores.load(code)` is not
   None for PL, BL1, FL1, CL, EL, CONF.
3. **The owner's own records do not change:** the score record, `start_chances` and his players' `player_games` statement
   columns keep today's path ([player_games.py:221-278](../backend/app/sorare/player_games.py)). Proof: Audit, Play and Recap
   specs pass unchanged on the e2e mock.
4. **A finished game shows only the forecast saved before kickoff** ([european_fdr.py:165-169](../backend/app/services/european_fdr.py),
   [league_fdr.py:283-290](../backend/app/services/league_fdr.py)).
5. **Old links keep working:** `?league=`, `?lens=`, `?w=`, `?gw=`, team pages, player bookmarks, and cacheable-pages' path form.
6. **Pages stay cacheable:** no new `new Date()`, `connection()`, `headers()` or query reads on the server in a page item
   ([cacheable-pages.md](cacheable-pages.md) design 3).
7. **Missing stays missing:** a dash, "no odds" or "waiting", never a zero or an invented number.
8. **Mixed and double weeks, national-team sides and the Conference's note** keep today's behaviour unless an item changes them
   on purpose and says so.
9. **Shared code moved** (app shell, nav, `lib/weeks.ts`, the e2e mock): the full browser suite runs locally. The e2e mock is
   time-dependent: take weeks from `seasonWeeks`.
10. **Another session may be editing the same files** (27 Oct: `scripts/check.mjs`, `RefreshButton.tsx`, `cacheable-pages.md`).
    Re-read a file before editing it; never undo someone else's change.

---

## In one minute

- **What works well:** all six new competitions update by themselves, every club and every current player is covered,
  and the player scores were tested properly before going live.
- **How good the player score (xScore) is:** about **5% more accurate than a player's recent games alone** in every new
  competition (3.7% in the Conference). When choosing between two players it picks the better one **57–60%** of the time
  (a coin flip is 50%, recent games alone 53–56%).
- **How much opponent difficulty adds:** **1.3–2.5%** extra accuracy, about **a third of the gain** (Bundesliga: half).
- **The biggest gaps:** players of European clubs from leagues Sofix does not model (Serie A, Scotland, Belgium…) lose Sofix's
  xScore in almost every European week (B5); outside the owner's players nobody checks Sofix or Sorare on real games (X1).
- **Found:** 5 open bugs plus a costly upload loop (L1), a refresh that got slower, and features the plan asked for that were
  never built. B6 is already fixed.

## What a "decisive action" is

Sorare gives a big score jump for a decisive action. Positive ones: a goal, an assist, a penalty won, a clearance off the
line, a last-man tackle, a penalty saved, and a goalkeeper's clean sheet. Negative ones cost points: a red card, an own goal,
an error that leads to a goal, a penalty conceded. Sofix predicts the chance of *any* positive one (a "decisive score" of 60
or more, `DECISIVE = 60.0` in [outfield.py](../backend/app/sorare/outfield.py)) as a single number. Item X8 changes that.

## The numbers behind this review

Held-out test on the 2025/26 season, which none of the models were trained on (23 Oct figures, not re-run).

| | Better than recent games | Extra from opponent difficulty | Share of the gain from difficulty | Picks the better of two | Within 7 points of the real score |
|---|---|---|---|---|---|
| Premier League | 5.0% | 1.7% | 33% | 59% (recent games 55%) | 28% |
| Bundesliga | 4.6% | 2.2% | 47% | 60% (56%) | 27% |
| Ligue 1 | 4.6% | 1.3% | 28% | 58% (55%) | 27% |
| Champions League | 5.9% | 2.5% | 40% | 60% (54%) | 27% |
| Europa League | 4.9% | 1.7% | 33% | 57% (53%) | 27% |
| Conference | 3.7% | not measured | – | not measured | – |
| LaLiga (for comparison) | – | – | – | 54–61% by position | 31% (Sorare's own number: 33%) |

LaLiga lineups built with Sofix scored 2.5% more than lineups built with Sorare's number, 35% more than random ones, and
reached 71% of the best possible score. Only 27–31% of guesses land within 7 points for anyone: a player either has a decisive
action (around 74 points) or not (around 40). "Picks the better of two" is a research measure only: the owner took it off the
Audit on 12 Oct ([user_manual.md:606](../docs/user_manual.md)).

---

## Order

| Step | Items | Needs first | Why |
|---|---|---|---|
| 1 | **L1** | – | R2 is near its monthly write limit and Neon pays ~7 MB a refresh for nothing |
| 2 | **B3 + B7** | L1 | Saves Neon, R2 and Vercel; B7 uses B3's check time |
| 3 | B1 + D3, B2, B4 | – | Small; notes and lenses |
| 4 | B5 | – | Affects most European players every European week |
| 5 | C2, C3, C1 | B3 | C2 before any refit; C3 before X3; C1 reuses B3's "unchanged" test |
| 6 | X1 + D7 | B5 (per-game source), L1 | Every check reads its success rates |
| 7 | X9, X10, X2, X6, X7, X11 | C2 | Model work, each checked on past games |
| 8 | X3 | C3 | Odds names map through C3's files |
| 9 | D1, D2, D4, D5, D6 | after cacheable-pages P1 for board pages | Page work |
| – | X4, X5's Futbol Fantasy part, X8 | – | Dropped or part of the engine (see each) |

Nothing is pushed before 1 Nov ("Pushing").

---

## Phase 1 · Bugs (fix first)

### L1 · Every refresh re-uploads ~1,700 unchanged player histories (found 27 Oct)
- **Issue:** each saved game is stamped with the time it was read (`read_at = at` on every save,
  [player_games.py:36-38](../backend/app/sorare/player_games.py)), even when nothing in it changed. That one changed field:
  - changes the player's fingerprint, so the jobs' game-history copy re-fetches his rows from Neon (the "games saved" part of
    the Sorare step: 6.8 MB of the 26 MB a refresh costs, refresh 180);
  - changes his R2 block, which carries every game's `read_at` ([player_blocks.py:31-48,79-83](../backend/app/services/player_blocks.py)),
    so it is uploaded again: 1,682 player blocks carry the last refresh's time in the 26 Oct copy. At ~13 refreshes a day that
    is ~22,000 R2 writes a day, most of R2's free million a month.
- **Checked:** the read time must stay in Neon: it orders who is re-read next and marks who was ever read
  ([sync.py:665](../backend/app/sorare/sync.py), [sync.py:964](../backend/app/sorare/sync.py), `read_times`, which reads Neon
  directly). The only page that shows it shows the **day** ("last read 26 Oct", [PlayerHistory.tsx:16,36](../frontend/components/players/PlayerHistory.tsx)).
- **Fix:** keep `read_at` in Neon exactly as today; make both copies see it only to the day:
  1. the player block stores each game's `read_at` as its day (`2026-10-27`), so a block changes at most once a day unless a
     game really changed;
  2. the mirror's fingerprints use `read_at` truncated to the day (the rest of the row as today), so a re-read row is
     re-fetched at most once a day.
  The first run after the change re-fetches the whole history once (~28 MB, the mirror's own cold-start figure), on a live
  project with room (Sofix D: 98 MB of 4 GB).
- **Cost:** saves ~6 MB of Neon a refresh (~2 GB a month) and ~20,000 R2 writes a day; one-off 28 MB.
- **Must not break:** the re-read order (Neon's `read_at` untouched); the player page's "last read" line (same day shown);
  every other column still re-fetched and re-uploaded the moment it changes (test: a changed score uploads at once, a re-read
  with nothing new does not, a re-read on a new day does).
- **Done when:** two refreshes with no new games upload no player block and re-fetch no game row (test on the mirror and on
  `player_blocks.publish` with a fake R2); the next real refresh's "games saved" part is under 1 MB.
- **Result (27 Oct, local):** built as above. The mirror's fingerprints hash `row(…, date_trunc('day', read_at), …)`; the player
  block keeps `read_at` and an absence's `last_seen` as their Madrid day (the page shows only the day), its `updatedAt` that
  day's midnight. Tests: a same-day re-read gives byte-equal blocks, a score change or a new day changes them; every column is
  in the fingerprint and the read time only to the day. Found while building: `read_times`, `known` and the missions' "read
  after kickoff" test read the jobs' copy, not Neon, so their read time can now be up to a day behind for a re-read with
  nothing new; that only reorders same-day re-reads (a real change is fetched with its time). Not yet measured on a real
  refresh (pushes held to 1 Nov); the first run after the push re-fetches the whole history once.

### B1 · The Conference board says "Validated model"
- **Issue:** the European boards' notes say "Validated model" for every European competition, including the Conference.
- **Checked:** [FixtureBoard.tsx:163](../frontend/components/FixtureBoard.tsx) prints "Validated model {version}" for every
  European board; [board-route.tsx:74](../frontend/app/(board)/board-route.tsx) writes its own status line per competition,
  re-deriving what the backend publishes in `model_notes` ([european_fdr.py:216-224](../backend/app/services/european_fdr.py)).
- **Fix:** the page shows the backend's line instead of writing its own. Drop "Validated" from the footnote. Ship with D3.
- **Cost:** none (each board changes once).
- **Must not break:** source credits (UEFA, Sorare); the Conference's note.
- **Done when:** a test on the Conference board finds no "Validated"; CL/EL unchanged; the All board's note unchanged.
- **Result (27 Oct, local, with D3):** the backend's notes are the page's: `european_fdr.CONFERENCE_NOTE` ("Early estimates: the
  Conference has few past games to learn from.") is the Conference board's only `model_notes` entry and its player block's
  `note`; CL, EL and the three leagues publish none. `boardNote(meta)` draws it once on the board and the club page, the
  player pages draw the block's; the picker's, the board line's and the club and player pages' own texts are gone, and the
  European credit reads "Fixtures, results and crests: UEFA. Player outcomes: Sorare." The All board's note is unchanged.
  `european.e2e.ts` checks CONF shows exactly that note and no "Validated", CL shows no note; backend tests check the notes.

### B2 · Conference ties are ranked wrongly at the end of the league phase
- **Issue:** UEFA breaks final ties with the opponents' results. The code only does that once every club has played **8**
  league-phase games ([table.ts:77](../frontend/lib/table.ts): `cells.flat().length === 8`, `through >= 7`). Conference clubs play
  **6**, so from December tied clubs can sit in the wrong place, including around 8th and 24th. The zones
  ([table.ts:155](../frontend/lib/table.ts)) already match the Conference's format.
- **Fix:** derive both numbers from the league-phase grid itself (`leaguePhaseGrid`, [competitions.ts](../frontend/lib/competitions.ts)).
  **(Was A6:)** add a six-round Conference table with a tie to the e2e mock ([mock-api.mjs](../frontend/e2e/mock-api.mjs)).
- **Cost:** none.
- **Must not break:** CL/EL tables; the mock's other boards (shared code: full browser suite).
- **Done when:** a unit test with a finished six-round tie sorts by the opponents' results, an unfinished one keeps shared
  places, the browser spec shows it, and CL/EL tests are unchanged.
- **Result (27 Oct, local):** `currentTable` takes the round count from the league-phase grid (`grid.matchdays.length` after
  `leaguePhaseGrid`) for both the games each club has played and `through`. Unit test (`european.test.ts`): a six-round tie,
  equal on everything of their own, is broken by the opponents' results when finished and stays shared before. The mock has a
  `conference-finished` mode (all six rounds past and played, one decided game); `european.e2e.ts` shows the order on
  /table. CL/EL unit and browser tests unchanged and passing.

### B3 · Every refresh rewrites all six new boards, even when nothing changed
- **Issue:** each upcoming game and each board is stamped with the run's time, so the six boards and the All board are written
  again on every refresh.
- **Checked:**
  - `forecast_at = now` on upcoming games ([league_fdr.py:283](../backend/app/services/league_fdr.py)); board meta
    `last_synced_at=now, last_predicted_at=now` ([league_fdr.py:334-335](../backend/app/services/league_fdr.py),
    [european_fdr.py:214-215](../backend/app/services/european_fdr.py)); seen in the 26 Oct blocks.
  - The six boards are 1.8 MB (PL 507 kB, BL1 411, FL1 410, EL 175, CL 175, CONF 136) and the All board 2.4 MB in six pieces:
    **~4.2 MB written to Neon and R2 each refresh**, and every board page rebuilds.
  - The board jobs read their previous board from Neon (`db.get`, [jobs/league_fdr.py:50](../backend/app/jobs/league_fdr.py),
    [jobs/european_fdr.py:25](../backend/app/jobs/european_fdr.py)): **2.0 MB of Neon a refresh** (refresh 180: 0.57 + 0.46 +
    0.46 + 0.55).
  - **Hidden dependency:** the Sorare step uses a European board only if its `last_predicted_at` is under 6 hours old
    ([sorare.py:368-370](../backend/app/jobs/sorare.py)). Keeping the old time without changing this would switch CL/EL/CONF
    xScores off 6 hours after the last real change.
  - The freshness pill reads `meta.last_synced_at ?? last_predicted_at` ([SiteNav.tsx:35](../frontend/components/SiteNav.tsx)).
- **Fix:**
  1. Keep the old `forecast_at` on a game whose numbers did not change (pre-kickoff freezing needs only `forecast_at < kickoff`).
  2. `last_predicted_at` = when a number last changed; `last_synced_at` = when the fixtures last changed.
  3. One new tiny block, `board_checks` ({competition: time}, ~200 bytes), written every run: the only thing that changes every run.
  4. The Sorare step's freshness test and the pill read `board_checks`, in the same commit.
  5. The board jobs read their previous board through `kept_blocks.rows`.
  6. `grid:ALL` and its pieces come out byte-equal when their inputs are unchanged.
- **Cost:** saves ~4.2 MB of writes, 7 R2 writes and 2.0 MB of Neon a refresh, and the page rebuilds; adds one 200-byte block a run.
- **Must not break:** pre-kickoff forecasts; CL/EL/CONF xScores; the pill; the All board's missing-block handling.
- **Done when:** two refreshes with no new results leave all six boards' and `grid:ALL*`'s write times unchanged; the boards'
  `neonMB` is near zero; CL/EL xScores still run 7 hours after the last board change when the board was checked an hour ago;
  the pill shows "fresh" for a checked, unchanged board.
- **Result (27 Oct, local):** `services/board_checks.py`: `settle` runs at the end of both board builders and keeps a game's
  old forecast and time while every number is within 0.0005 (the European fit weighs games by age to the second, so it drifts
  ~1e-5 an hour; ridge makes that a real, tiny move), then recomputes the lens scales; `last_predicted_at` stays unless a
  number moved, `last_synced_at` unless anything else did. Jobs read the previous board with `kept_blocks.read` and call
  `record` after `put`. `foreign_inputs` takes the check time from `board_checks`, else the board's own; the pill
  (`lib/control.ts` `syncedAt`) the same, through `loadSystem`, which reads the 200-byte block with the others. The All board
  needs nothing: it already depends on `now` only by the day. Tests: same inputs two hours later give byte-equal boards with
  the old times; a 1e-5 wobble keeps the old forecast, a 0.01 move refreshes only that game and `last_predicted_at`; a moved
  kickoff refreshes `last_synced_at`; CL xScores run with a 7-hour-old board checked an hour ago, not with one checked 7
  hours ago; the pill is fresh for a checked unchanged board. B7 moved after B5 (its tag lives on B5's per-game source).

### B4 · Two lenses never show anything on six of seven competitions
- **Issue:** the new boards have no bookmaker prices, so "Odds" and "Vs odds" stay blank, and the European boards have no
  "Record". The buttons are still shown, and the domestic note credits "Odds: The Odds API" on boards with no odds.
- **Checked:** lens lists in [BoardToolbar.tsx:14](../frontend/components/BoardToolbar.tsx),
  [ExpectedPointsCard.tsx:37](../frontend/components/ExpectedPointsCard.tsx), [grid.ts:457](../frontend/lib/grid.ts); the credit
  at [FixtureBoard.tsx:164-165](../frontend/components/FixtureBoard.tsx).
- **Fix (was A3):** each board publishes its `lenses` (the ones with data); the three lists read it. On the All board the Odds
  lens shows when any game has prices, the others marked "no odds" (owner, 27 Oct). A bookmarked `?lens=odds` on a board
  without odds opens Overall. The source line per board is corrected. An older block without `lenses` means "all six".
- **Cost:** a few bytes a board (the All board stays inside its six 0.4–0.5 MB pieces); schema chain Pydantic → OpenAPI →
  `npm run gen:types` → Zod.
- **Must not break:** LaLiga keeps all six lenses; old `?lens=` links; the e2e mock (shared code: full suite).
- **Done when:** each board shows only lenses that colour something; All shows Odds with "no odds" games; a cold link with a
  hidden lens opens Overall; a block without `lenses` still renders; no false credit.
- **Result (27 Oct, local):** `FixtureGrid.lenses` is filled from the cells by a validator (the model's three always; Odds,
  Record and Vs odds only where a game still to play has a price, a record or a record at its price), so every builder and
  the All board get it without new code; an older block is filled the same way when a job reads it, and the page treats a
  missing field as all six. Real 26 Oct blocks give LaLiga all six, PL and BL1 four (with Record), CL three. The toolbar, the
  Expected points card and the URL reader (`parseViewState`'s new `lenses`) use `lensesOf(grid)`; the domestic credit names
  The Odds API and "the record at each price" only when the board has them; an Odds tile with no price says "No odds".
  Tests: backend (lenses of a foreign board; a block without the field is refilled), `grid.test.ts` (a bookmarked lens the
  board lacks falls back, an older block keeps all six), `difficulty-all.e2e.ts` (PL shows four lenses and opens Overall from
  `?lens=odds`, CL three, the All board's Odds lens with "No odds" games, no false credit).

### B5 · A European game loses Sofix's xScore when the same week has a game Sofix does not model
- **Corrected 27 Oct:** this is about the xScore. Cups are not the case: Sorare does not score them, and none of the 39,000
  games in the saved histories is a cup game (26 Oct copy). The real case is a game in a league Sofix has no model for. The saved
  histories hold Serie A (229 games), Nations League (222), Segunda (127), Scottish Premiership (70), Croatia, Argentina,
  K League, Belgium, 2. Bundesliga and Eredivisie games. So a player of Inter, Celtic or Club Brugge with a Champions League game
  and a league game in one Sorare week loses Sofix's number for **both** games and shows Sorare's number (or his recent average)
  instead (`score_source`, [forecast.py:241-309](../backend/app/sorare/forecast.py)). That is most European clubs: only 31 of
  108 come from the four leagues Sofix models (`DOMESTIC` joins).
- **Checked:** the rule is in both scorers ([scores.py:70-71](../backend/app/sorare/scores.py),
  [foreign_scores.py:166-168](../backend/app/sorare/foreign_scores.py)). The same whole-week loss also happens when a covered game
  is missing from its board ([foreign_scores.py:175-176](../backend/app/sorare/foreign_scores.py)), when the European board is
  stale (B3, B7) or when the European history read is incomplete ([foreign_scores.py:183-184](../backend/app/sorare/foreign_scores.py)).
- **Fix:** score each game on its own, in the one place both scorers route through: a covered game gets Sofix's xScore; a game
  Sofix does not model gets Sorare's number when Sorare's projection is for that game (it covers his next game only,
  [record.py](../backend/app/sorare/record.py)), else his recent average, as that game gets today. **(Was A2:)** each game carries its
  own source (Sofix, Sorare, average) in the forecast and in the pre-lock record ([publish.py:1735](../backend/app/sorare/publish.py)),
  never stored as `sofix` unless it is. This replaces the Conference release's "no partial mixed-week totals" (owner, 27 Oct).
- **Cost:** none (inside the refresh; a short source tag per game).
- **Must not break:** a one-competition week scores exactly as today; double-week rules; national-team games keep their side and
  no invented odds; the owner's records (rule 3).
- **Done when:** a test week with a CL game and a Serie A game gives the CL game Sofix's xScore and the Serie A game Sorare's
  number; a week with only unmodelled games scores as today; the record stores each game's source.
- **Result (27 Oct, local):** `foreign_scores.scores_for` scores each game on its own (`one`): a covered game gets Sofix's
  picture, any other None; `Made.outcomes` holds None for those, and is empty only when no game is told (a LaLiga-only week
  still goes to the LaLiga scorer whole, exactly as before). The refresh now always routes through it, even with no foreign
  model on, so a LaLiga game next to an unmodelled one keeps Sofix's number. `forecast` fills a None game with Sorare's
  number when his projection is for it (the first game), else his own-form score, and publishes `game_sources`; the
  pre-lock record stores `sofix` only for Sofix's games and each game's `scoreSource`. The player's `by` stays "sofix"
  when Sofix worked out at least one game (its per-game sources say the rest; the pages' types stay unchanged). Tests:
  CL + Serie A (Sofix, None), only Serie A (as before), a wrong opponent loses only its game, the forecast's sources
  ("sofix", "form") and ("sorare", "sofix"), and the record's per-game sources. 1,426 backend tests pass.

### B6 · One test fails on this computer — fixed
- **Checked 27 Oct:** the full backend suite passes here (1,416 tests). Do **not** renormalize line endings by hand: the frozen
  files are hashed on their working-copy bytes.

### B7 · A stale European board silently turns its players' xScores into Sorare's numbers (was A1)
- **Issue:** when a European board has not been checked for 6 hours, its players get Sorare's or average numbers and nothing
  on screen says so.
- **Fix:** such a player's card and Play row say "Waiting for the board" next to the number they show (DESIGN.md principle 5);
  Control lists the stale board. Uses B3's `board_checks`.
- **Cost:** one field per affected game in blocks that are written anyway.
- **Must not break:** fresh weeks look exactly as today; 1:1 skeletons; text floor.
- **Done when:** a test with a 7-hour-old CL check shows "Waiting for the board" on that player and the board on Control; desktop
  and phone looks checked.

---

## Phase 2 · Player score (xScore): match LaLiga, then beat it

**Rules:** "What must not break" 1 and 2 (new files only; every artifact still loads). A change ships when the check on past
games says it is better (owner, 27 Oct: no waiting for months). For CL and EL that check is run the same way as on 23 Oct
([fdr-tuning.md](fdr-tuning.md) §4 F7). Heavy work stays in the Python jobs. Each item says what the score engine reuses.

| What LaLiga's score uses | New competitions today | Item |
|---|---|---|
| Bookmakers' prices, 35% mixed in for games within 7 days | none | X3 |
| The bookmakers' "how many goals" line | none | X3 |
| A corrected clean-sheet chance | none (all six boards say "uncalibrated") | X2 |
| Futbol Fantasy's start chance | none outside LaLiga, CL, EL (no PL: owner, 27 Oct) | X5 |
| A "comes on as a substitute" score | none | X9 |
| Checked against Sorare on real games | only for the owner's players | X1 |

### X1 · Success rates of Sofix and Sorare for every covered player, by competition, club and player (rebuilt 27 Oct)
- **Issue:** outside the owner's players nobody knows whether Sofix or Sorare is right more often, in which competition, for
  which club or which player.
- **Why something must be written down:** Sorare and Futbol Fantasy replace their numbers once a game is played; Sorare serves
  a projection for a player's next game only ([record.py](../backend/app/sorare/record.py): "the moment a gameweek is played the
  numbers its plans were built on are unrecoverable"). A success rate needs what each said before kickoff. What does **not**
  need keeping is each player's number after his game is settled.
- **Checked:** for the owner's players this exists (columns in `player_games`, [models.py:208-214](../backend/app/models.py); the
  Audit's "Who starts" by competition). Sorare's projection for all 5,007 covered players is read in each refresh
  ([foreign_coverage.py:101](../backend/app/sorare/foreign_coverage.py)); **Sorare's start chance is not** (the squad query
  keeps average, projection and price). Whether Sofix has a start chance for players he does not own was not established.
- **Fix (the lean version, owner's idea):**
  1. **Before the lock:** one small block per open gameweek and competition, `forecast_log:<gw>:<comp>`: for each covered player
     not his, the game, Sofix's xScore, Sorare's number and each source's start chance (~50–100 kB each). Written by the refresh;
     `put` skips it when no number moved; frozen at the lock.
  2. **After the games:** the score-checks job settles each entry (did he start, what he scored, from the game history the jobs
     already hold) into running totals, then **deletes that gameweek's log**. Nothing per player per game is kept after that.
  3. **The totals:** one block per competition, `success_rates:<comp>`, holding, for each source (Sofix, Sorare, and Futbol
     Fantasy where it reads): starts called right, the average start-chance error, xScores within 7 points, the average miss,
     and the number of cases, per competition, per club and per player (~100 kB per competition). Written once a day.
  4. **Start chances:** Sorare's is added as one more field of the squad query that already runs (no new requests; first
     `python scripts/sorare_deprecated.py`, and stay under 30,000 complexity). If Sofix has no start chance for a player he
     does not own, only Sorare's and Futbol Fantasy's are counted until X5.
  5. The owner's players stay on today's path (rule 3); their games also count in the totals.
- **Cost:** Neon: writes only (~0.5 MB a gameweek, then deleted; ~1 MB of totals), no reads. R2: ~7 writes per refresh while a
  week is open plus 7 a day for the totals (~3,000 a month). Sorare: none new. No `player_games` writes, so no mirror churn.
- **Must not break:** the owner's Audit figures (rule 3); `player_games` and the mirror untouched.
- **Done when:** the Audit (D7) shows each source's success rates per competition, club and player for every covered player;
  a gameweek's log is gone after settling; a test settles a made-up week into the right totals and deletes its log.

### X2 · Europe overrates away sides keeping a clean sheet
- **Issue:** in the Champions League Sofix says away sides keep a clean sheet **22%** of the time; it really happens **18.5%**;
  Europa League **24%** against **19%** (23 Oct figures). LaLiga's chance is corrected (`clean_sheet_calibration.json`); the new
  competitions' are not ([european_fdr.py:224](../backend/app/services/european_fdr.py), [league_fdr.py:339](../backend/app/services/league_fdr.py)).
- **Fix:** fit the same correction per competition on the training seasons, check it on 2025/26, ship if better. One place, so
  the Defence lens and the xScore use the same chance. The engine reuses it: its Step 1 needs a clean-sheet chance per game.
- **Cost:** a one-off fit; each board changes once.
- **Done when:** predicted and real clean-sheet rates are within 2 points home and away in each competition, keeper and defender
  accuracy is not worse, "uncalibrated" goes, every artifact loads.

### X3 · Bookmaker prices for the Premier League, Bundesliga and Ligue 1
- **Issue:** these boards have no odds, so the xScore misses the bookmakers, and two lenses are empty.
- **Checked:** LaLiga's sync runs at most every 6 hours, 2 credits a call ([sync_odds.py:5-7,33](../backend/app/jobs/sync_odds.py));
  130 credits used by 27 Oct. Its prices live in `market_odds`, keyed to LaLiga's `fixtures.id` ([models.py:103](../backend/app/models.py)),
  and each sync deletes every row it did not write ([sync_odds.py:121-123](../backend/app/jobs/sync_odds.py)); the new boards
  have no `fixtures` rows.
- **Fix:** one read per league per day with a game in the next week (at most 186 credits a month). Each league's prices go in
  its own block (`odds:<code>`), never in `market_odds`. Names map through C3's files. The cap is enforced in code from
  `x-requests-remaining`, LaLiga first. Confirm sport keys with The Odds API's free sports list first. Prices mix into the
  xScore as LaLiga's do once the check on football-data.co.uk's closing prices shows it helps.
- **Cost:** ~340 credits a month in total; one small block a day per league; boards stay under 1.6 MB.
- **Must not break:** LaLiga's rows and 6-hour sync (a test runs both); the key never in a log.
- **Done when:** the three boards' Odds lenses colour games, the month stays under 450 credits, LaLiga's rows are untouched.

### X4 · Sorare's own number in Sofix's xScore — dropped
- **Why not (owner's question, 27 Oct):** your rule of 26 Oct ([score-engine.md](score-engine.md)): "Sofix never leans on Sorare's
  own projection (it can disappear, and Sofix is meant to beat it)", and blending with Sorare was turned down. Taking it out of
  LaLiga cost 0.0–0.1 points of accuracy, and Sorare's number sits 3–4.5 points under what midfielders and forwards scored. Using
  it would also make Sofix and Sorare agree by construction, so X1's comparison could not tell which is better.
- **Fix:** none. Sorare's number stays the yardstick (X1).

### X5 · Check and correct the chance that a player starts
- **Issue:** outside LaLiga the start chance comes from Sorare's odds or past games, never checked for players he does not own.
- **Fix:** from X1's totals, correct each source's start chance in bands per competition, as `start_fixes.py` does for his
  players. No Futbol Fantasy Premier League pages (owner, 27 Oct).
- **Cost:** none new.
- **Done when:** in each competition, players given about 70% start about 70% of the time (within 5 points), on the Audit.

### X6 · European scores ignore a player's league form
- **Issue:** a European game only counts the player's previous European games (`own_before`,
  [foreign_scores.py:180-190](../backend/app/sorare/foreign_scores.py)).
- **Fix:** add his recent league games as a second, separately weighted record; ship if the 2025/26 check improves. New files
  only. The engine reuses it: its Step 3 ("his rates") reads every game he played.
- **Cost:** none at run time (the games are in the mirror).
- **Done when:** the check is recorded here; switched on if better.

### X7 · Check the chance of a decisive action everywhere
- **Fix:** the same check per competition and position (predicted against real, in bands) from X1's settled entries, with the
  engine's ruler code ([score-engine.md](score-engine.md) §5). A band off by more than 5 points gets a correction like X2.
- **Cost:** none new (computed while settling X1).
- **Done when:** the Audit shows it per competition.

### X8 · Predict each kind of decisive action — part of the score engine
- **Checked:** this is the engine's Step 5 and Step 7 ([score-engine.md](score-engine.md) §3). Not built separately.

### X9 · No "comes on as a substitute" score outside LaLiga
- **Checked:** no artifact has a `subs` key ([foreign_scores.py:89](../backend/app/sorare/foreign_scores.py)); even with one it is
  used only in a one-game week ([foreign_scores.py:177-178](../backend/app/sorare/foreign_scores.py)), while LaLiga's is used every
  week ([scores.py:55](../backend/app/sorare/scores.py)).
- **Fix:** fit the shape per competition from games already collected, in a **separate** file per competition, and use it in
  double weeks too.
- **Cost:** a one-off fit; a few kB.
- **Done when:** a bench player in each competition shows a "comes on" score, single and double week.

### X10 · The explanation can read oddly
- **Issue:** the clean-sheet chance and the goals against map to "Opponent", the side's goals to "Attack"
  ([outfield.py:37-45](../backend/app/sorare/outfield.py)), so an easier opponent can show as a minus under "Opponent".
- **Fix:** merge the match inputs into one "Opponent" reason in `scores.py` ([scores.py:35-39](../backend/app/sorare/scores.py)),
  never in `outfield.py`.
- **Cost:** none.
- **Done when:** an easier opponent never shows as a minus in a test; reasons still add up.
- **Result (27 Oct, local):** `scores._named` sums "Opponent" and "Attack" (the clean-sheet chance, goals against and his
  side's goals) into one reason named after the opponent; the foreign scorer applies it to its games too. `outfield.py` is
  untouched. Test on the shipped lines, defenders, midfielders and forwards: an easy game's opponent reason is a plus, a hard
  one's a minus, "Attack" is gone, and the reasons add up to the frozen line's own.

### X11 · The Conference's opponent difficulty is barely better than averages
- **Issue:** its match prediction is only 1.5% better than average results; Sofix's favourite wins only 49% of the time.
- **Fix:** add the league results of Conference clubs' home countries as extra strength information. Check it on every
  completed past Conference game, the way it was released on 23 Oct; ship if it is better (owner, 27 Oct: no waiting).
  The frozen recorder candidate stays as it is (rule 1); the new model is a new candidate in new files.
- **Cost:** not known yet: which free source has those leagues' results (football-data.co.uk has some countries) is checked
  first; one cached file a season per country, never a paid source.
- **Done when:** the check is recorded here and the model ships if better.

---

## Phase 3 · Boards, tables and pages

Every item ships with its page spec and the 1440 + 390 px look (AGENTS.md "Shipping" 3), a restyled screen with the
`web-design-guidelines` pass, and "What must not break" 5–7. Board-page items start after [cacheable-pages.md](cacheable-pages.md)
P1 and follow its week path and client clock.

### D1 · League tables mark too little
- **Issue:** PL, Bundesliga and Ligue 1 tables show only "Top four", relegation and the relegation play-off
  ([table.ts:154-162](../frontend/lib/table.ts)).
- **Fix:** each league's places this season from its official rules, the source in a code comment (as at [table.ts:153](../frontend/lib/table.ts));
  a cup-dependent place gets a short marker.
- **Cost:** none (browser-side).
- **Done when:** every European place and the relegation places show, with sources in code.

### D2 · One club, two separate pages
- **Checked:** the All board joins a club's games across competitions (`DOMESTIC`); the club page loads one competition
  ([team/[code]/page.tsx:17,24](../frontend/app/team/[code]/page.tsx)).
- **Fix:** an "All competitions" view on the club page from the All board's piece that holds the club (one ~0.5 MB block via
  `readModelAt`; the client gets only that club's games). A club with no Sofix league shows its European games only.
- **Cost:** one cached R2 block read per club-page build; a few kB to the browser.
- **Done when:** a club with a league and a European game in one week shows both at 1440 and 390 px.

### D3 · Too many notes, and jargon
- **Checked:** notes in [CompetitionPicker.tsx:37](../frontend/components/CompetitionPicker.tsx),
  [board-route.tsx:74](../frontend/app/(board)/board-route.tsx), [FixtureBoard.tsx:163-166](../frontend/components/FixtureBoard.tsx),
  [team/[code]/page.tsx:56](../frontend/app/team/[code]/page.tsx) and `model_notes` ([european_fdr.py:216-224](../backend/app/services/european_fdr.py),
  [league_fdr.py:336-340](../backend/app/services/league_fdr.py)).
- **Fix:** one short plain line only where it matters ("Early estimates" on the Conference), from the backend, once per page;
  the rest goes. Source credits stay. Ship with B1.
- **Cost:** none.
- **Done when:** at most one note per board and club page, no technical words; a test counts them.
- **Result (27 Oct, local):** shipped with B1 (see its result): one note, the Conference's, on its board, club and player pages;
  `european.e2e.ts` counts it (exactly one on CONF, none on CL).

### D4 · The new boards look plain
- **Checked:** the icon strip is on Difficulty only ([DifficultyHero.tsx:20](../frontend/components/DifficultyHero.tsx)); the
  `<select>` elsewhere ([board-route.tsx:73,98,122,138](../frontend/app/(board)/board-route.tsx), [season/page.tsx:39](../frontend/app/(board)/season/page.tsx),
  [players/page.tsx:39](../frontend/app/players/page.tsx)); the designed week view `LaLigaView` is LaLiga only
  ([board-route.tsx:110-131](../frontend/app/(board)/board-route.tsx)).
- **Fix:** the icon strip on every page with a picker; each club's colour taken once from its real crest when the club is added
  (owner, 27 Oct), stored with the club, grey while missing; `LaLigaView` for every league.
- **Cost:** the colour is computed in the job when a club first appears (a few bytes a club); no new page reads.
- **Done when:** 1440 and 390 px checked against the design bar; no layout shift.

### D5 · Official line-ups for the other competitions
- **Checked:** a game the job tied to Sorare's game is read in any competition ([actualLineupsData.ts:34-38](../frontend/lib/actualLineupsData.ts));
  only untied games need the index ([actualLineupsData.ts:7](../frontend/lib/actualLineupsData.ts)).
- **Fix:** add `premier-league-gb-eng`, `bundesliga-de`, `ligue-1-fr`, `uefa-europa-conference-league` to the index map.
- **Cost:** at most one Sorare request per competition per hour, only when Lineups is opened.
- **Done when:** official elevens show for a game in each, including one with no job tie.

### D6 · No season-start prediction for the new leagues
- **Fix:** freeze one for each league at the start of next season; save today's as "made in October", dated. **(Was A4:)** add the
  new competitions to AGENTS.md "Yearly rollover" (promoted clubs and spellings via C3's files, the European club list and joins,
  these predictions).
- **Cost:** a few kB of artifacts.
- **Done when:** each league's table can show its frozen prediction with its date; the rollover list names every competition.

### D7 · The Audit's success rates for every competition, club and player
- **Fix:** the Audit shows X1's totals: per competition, then per club and per player, each source side by side, with the number
  of cases. A club's or player's rate shows its count ("right 7 of 9") so a small sample is visible, never a padded rate.
  Better-of-two stays off. The page receives only what it draws; lists over 12 are paginated.
- **Cost:** one small block per competition read from R2.
- **Done when:** the Audit shows each competition's, club's and player's rates; the owner's current figures unchanged.

### Later, by the owner's choice
Qualifying rounds, the Bundesliga relegation play-off and domestic cups are research only (Sorare does not score cups).

---

## Phase 4 · How it is built

### C1 · The refresh got slower
- **Checked:** runs 177–180 took 10–14 minutes (limit 25, [refresh.yml:79](../.github/workflows/refresh.yml)). `near-lock.yml`
  starts the **full** refresh ([near_lock.py:26,86](../.github/scripts/near_lock.py)) half-hourly in the last three hours before a lock.
- **Fix:** **(was A5:)** `check.mjs --live` prints the last refresh's and near-lock runs' durations (from `refresh_runs` on R2; re-read
  `scripts/check.mjs` first, another session edits it). Then boards and xScores run only when their inputs changed (B3's test),
  and the near-lock dispatch becomes a quick run: start chances, the score record and the owner's plans.
- **Cost:** saves GitHub minutes, Neon writes and page rebuilds near every lock.
- **Must not break:** the lock-time freeze; Futbol Fantasy's pre-lock reads; the refresh lock; the clock.
- **Done when:** `--live` shows durations; a normal refresh under 10 minutes, a near-lock run under 4, over a week.
- **Result (27 Oct, local; the timing half is open):** `check.mjs --live` prints the last eight runs' minutes and the latest
  run's kind and three slowest steps from `refresh_runs` on R2 (on 27 Oct: 10.4–14.4 min; sorare 587 s, predict 47 s,
  publish 23 s). The near-lock dispatch now asks for a quick run (`quick: true` → `refresh --quick`): no sync, odds,
  predict or board steps (~90 s), and the Sorare step keeps each domestic foreign squad index (PL, BL1, FL1) of the same week
  read in the last six hours instead of reading those 56 squads again (the European ones are stored without their games, so
  they are read as before). The lock-time freeze, Futbol Fantasy's reads, the refresh lock and the
  clock are untouched (the same step, the same run row). Boards: B3 already makes an unchanged board free to publish; their
  fitting is ~26 s a run, so skipping it on unchanged inputs was left out. **Not met yet:** the Sorare step alone is ~8–10
  minutes (its sync ~5 min, its writes ~3 min, Futbol Fantasy ~1.5 min), so neither target holds until those shrink; the
  durations line shows it once the change runs. Tests: the quick step list, the reuse rule, the dispatch's input.

### C2 · The live app depends on research code
- **Checked:** 8 live files import from `research/` (the European modules and `foreign_*`); the domestic path imports nothing.
- **Fix:** **copy**, do not move, the functions the live app uses; `research/` stays byte-identical (rule 1).
- **Cost:** none at run time.
- **Done when:** nothing outside `research/` imports from it; recorder and validation tests pass; boards byte-equal before and after.

### C3 · Rules written into the code
- **Checked:** Bundesliga exclusions inline ([league_fdr.py:203-212](../backend/app/services/league_fdr.py)), Ligue 1's in
  `FL1_ADMIN`, club spellings for several leagues in `HISTORY_ALIASES` ([league_fdr.py:41](../backend/app/services/league_fdr.py)).
- **Fix:** one small data file per league: excluded games with their official source, club spellings (football-data.org,
  football-data.co.uk, The Odds API).
- **Cost:** none at run time.
- **Done when:** next season's exclusion or a promoted club is one line; boards byte-equal before and after.

### C4 · The database budget
- **Fix:** L1 and B3 here; the rest under [neon-write-mostly.md](neon-write-mostly.md).
- **Done when:** under 100 MB a day for a week, as that plan measures it.

---

## Docs that disagree with the code (update in the commit that touches them)

- [PLAN.md](../PLAN.md) "European main-stage extension": "Conference ... remains disabled": released provisional on 23 Oct.
- [user_manual.md:46-47](../docs/user_manual.md): "Conference FDR and xScore ... remain unavailable": contradicts its line 1118.
- [PLAN.md](../PLAN.md) "Current scope" lists LaLiga-only pages.
- AGENTS.md "Yearly rollover" covers LaLiga only (D6).
- [conference-release.md](conference-release.md) "no partial mixed-week totals": replaced by B5 (owner, 27 Oct).

## What is already good (keep it)

- Every club and every current player in six new competitions, updated automatically with the computer off.
- The player scores were tested on a season they never saw, and every position improved in PL, Bundesliga, Ligue 1, CL and EL.
- Incomplete source data keeps the last good board; "missing" and "zero" stay different.
- The selected week follows the calendar date across competitions, never a round number.
- No paid service, no database change; every item above keeps both true.
