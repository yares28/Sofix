# Plan · Everything still to do, in one order (from 2 Oct 2026)

This file merges every plan that still has steps left into one order:

- [plans/xscore.md](xscore.md): T1, the xScore, all of it.
- [plans/futbolfantasy.md](futbolfantasy.md): section 9's checks and section 7's questions.
- [plans/overlay.md](overlay.md): the live pass on your pages and what S7 left open.
- [docs/sorare_plan.md](../docs/sorare_plan.md): the open boxes of S4, S6, S7, S8 and S9.
- [TODO.md](../TODO.md): T3 to T7, the plan frozen at the lock, the calibration, SorareExt and the small things.
- The 1 Oct review's follow-ups ([plans/review-fixes.md](review-fixes.md)).

Those files keep the detail: what you said, the research and the designs. This file gives each step an order, a "done when"
and a check, so a session can work through it alone and stop only where you have to choose.

## Next up (the one queue: read this first, update it in the same commit when an item ships)

Work from the top. Each line points to its full text; "you" items wait for the owner.

0. **Found 7 Oct in past sessions** (TODO.md "Forgotten"): **G**, the grey countdown on Play (your call). R, the form
   fallback's red-card ban, is fixed by data-keeping step 1. L, the daily league history, is done (Results).
1. **9.7 · The extension updates itself** (TODO.md A): no more Reload by hand after the release that brings it (one last Reload).
2. **9.8 · A refresh near a lock that does not wait for GitHub** (TODO.md C): the extension and the app start it in the last three hours.
3. **9.6 · The tile's big number follows his start chance** (TODO.md B): under 40% the "comes on" score, with his chance of coming on.
4. **9.10 · The overlay answers only for your account; an old extension says "Reload"** (TODO.md F).
5. **Play deep dive, what is left** (TODO.md "Play deep dive"): the frozen plans scored against the real cut-offs, the 439 KB `market`
   split out of the `sorare` read model, N5.
6. **10.6 rest · choosing the starters for the reward** (Batch 10), then **10.7 rest · the official-eleven check** an hour before kick-off.
7. **10.9 · The next five gameweeks and points per euro**, then **10.10 · parts 6, 7, 9 and 10 of P9**.
8. **Later · 9.11 · an outside clock for the refresh** (TODO.md C, "Future feature"): needs a free cron-job.org account from you.

Waiting for data, not work: the Audit's Sorare vs Sofix figures (about 100 settled starts, from about 11 to 14 Oct) and 10.8, the
self-correcting numbers (100 cases per band). Paused by you: 0.1 (your Apply result, TODO.md E), batch 4 (Pro). Yours: the live Apply
acceptance test (TODO.md "Yours" 1), installing the PWA (3).
Owner check still open for data keeping: open Recap in signed-in Chrome to archive your first final weeks, then see them on Rewards.

## Where things stand (7 Oct)

- **The Play deep fix is on production** (PRs #62 to #64, [TODO.md](../TODO.md) "Play deep dive"): Sofix's and Sorare's plans side by
  side, your essence order, XP apart, Rooms only when they pay, and the Sorare vs Sofix record on the Audit (figures from about 11-14 Oct).
  Still open there: the frozen plans scored, the `market` split, the cut-off spread.
- **Missions:** today's picks, a log of every mission day scored on the Audit (10.7), and Sorare's mission day followed.
- **Lineups** shows Sofix's and Sorare's start chance for every LaLiga player, not only yours.
- **9.9 is done:** the three workflows run on `ubuntu-24.04` (7 Oct), ahead of the 19 Oct switch.

## Where things stood (3 Oct)

- **The live pass on your Sorare pages (0.2) is done** (Results): the overlay works, with three faults, fixed in release 0.3.2 (batch 9, merged
  3 Oct: the live Futbol Fantasy read, the Sofix tab's week, Celta's name) together with a real "comes on" score. **You reloaded the extension
  (v0.3.2 on Control) and the live look passed on 4 Oct** (Results, batch 9).
- **Your answers of 3 Oct:** the tile's big number follows his start chance (decision 1, step 9.6, after 9.4 which is done); "why didn't the
  near-lock refresh run?" is answered (Results, 2.2) and its fix is chosen (the extension and the app start it, step 9.8); pinning
  `ubuntu-24.04` is approved (9.9); the bench score is done (9.4) and the opponent is researched and **waits for your call** (9.5, [xscore.md](xscore.md)
  P8). The xScore's level fix, the Audit's other figures and the frozen plan scored are **paused by you** until data exists (steps 3.4, 5.2, 5.3 and
  5.4), and so is the Apply result (0.1). Pro stays paused.
- **The new xScore is planned** (your four requests of 3 Oct, evening; batch 10, [xscore.md](xscore.md) P9): the score added up the way
  Sorare adds it, the chance of a decisive action with a score with and without one, then his range and where this game puts him, from
  sixteen parts: form that knows the opponent, the app's difficulty, starting or coming on, his share of his side's attack, what the
  opponent gives his position, shots, minutes, Sorare's projection and grade, cards, the rest, his stat sheet, the bookmakers' goal
  markets, team news for both sides, chances not just goals, penalty and set-piece takers, and his role tonight. The planner picks lineups
  and captains on the real spread with linked scores; daily missions get their best cards, re-ranked when the official elevens are out;
  the chances correct themselves each Monday; the next five gameweeks go on the Players and Cards pages. Every number is written down and
  scored, and the Audit page shows a catalogue of twelve groups of figures with a decision scorecard. It takes in 9.5 (the opponent for
  keepers) and answers decision 4. **Started on your go (3 Oct, night):** the data is read (449 games, 29,094 player rows) and today's
  formula is scored on every LaLiga player (10.1 and 10.2a, Results); Futbol Fantasy's chance for every player is now kept at each lock
  (10.2b), which is the one input that cannot be read again afterwards. The goalkeepers' number built from their game is built too (10.3).

### As of 2 Oct

- **On production and checked:**
  - Futbol Fantasy's lineups and start % (T2, S1 to S8)
  - the 1 Oct review (R1 to R35)
  - the overlay (O1 to O11)
  - batch 1 of 29 Sep
- **Yours, done:**
  - The Refresh button: it shows on /control, so the GitHub key is in Vercel.
  - The extension reloaded and the Apply test, as you said on 2 Oct. The Apply result is written down in step 0.1.
- **In another session now:** "Don't call a removed Futbol Fantasy match a failed read", from the two HTTP 404s in refresh #42's log.

Two moves against the order you saw on 2 Oct (T1, T3, T7, T4/T5, then the small follow-ups):

- **The small follow-ups come first.** They are quick and they close checks that are still open.
- **Recording comes before everything else.** This is T1's first two phases and the plan frozen at the lock. What is not
  recorded at a lock is lost for good, and round 8 (locks Fri 9 Oct) is the first round planned with Futbol Fantasy's numbers,
  so it is the one the Audit page most needs.

## Your decisions

Collected here so the run stops less. My recommendation comes first in each.

1. **The big number on a card's tile.** *Decided 3 Oct:* it follows his chance of starting, Futbol Fantasy's when it has one, else
   Sorare's, else Sofix's. Under 40%: his score if he comes on from the bench; 40% or more: his score if he starts. Step 9.6, after
   9.4 (today's "benched" number is not a score yet).
2. **Sorare's projection or ours** (step 3.6): decided with the numbers in front of you. No longer a wait for 100 recorded players:
   Sorare keeps its past projections and grades (checked 3 Oct), so batch 10 measures it on two seasons. Until then (recommended):
   once the new xScore ships for a position, its number stays the big one and Sorare's sits beside it, instead of replacing it about
   two days before the lock as today. Say if you would rather keep today's switch.
3. **How much a player's national-team games count for a national-team game** (step 3.4): the backtest decides, unless you
   have a strong view.
4. **Read all LaLiga players' history** (about 500 free reads of Sorare's API, step 3.2), not only yours: only if the first
   results are too uncertain to tell changes apart. *Answered by your request of 3 Oct:* yes, because the new xScore needs what every
   position scores against each club (step 10.1). Two free questions per game return all its players (checked), so about 900 questions.
5. **Rebuild GW1 to GW16** (approximate: it uses the cards you own today, not the ones you owned then).
   - Recommended: no. The Audit starts from the weeks Sofix recorded.
6. **The Sofix panel on a Sorare player page** (designed in S7, never built): put it on the sorare.com canvas (step 6.1) as an
   option, or drop it.
7. **Retire the old SorareExt** (step 7.6): only on your go.
8. **Every design canvas is a Stop.** You choose before anything new is built: Pro on Play if it needs a new look, the Audit
   page, and the sorare.com sheet and numbers.
9. **A refresh near a lock that does not depend on GitHub’s clock** (step 9.8, TODO.md "C"). *Decided 3 Oct, option 1:* the extension and the
   app start a refresh when you open them in the last three hours before a lock and the numbers are over 25 minutes old.
10. **Pin `ubuntu-24.04` in the three workflows:** *yes, 3 Oct* (step 9.9, before 19 Oct).

## How the run works

- **One step at a time**, in the order below, broken things first:
  1. Read the code the step names.
  2. Write the test that fails first, make the smallest change and run that test.
  3. Run `node scripts/check.mjs`, plus the changed page's browser spec and a desktop and phone look for a visible change
     (AGENTS.md "Shipping").
- **The calendar comes first on its day.** A dated step in batch 2 that is due today is done before the next step in order.
- **Ship each step straight to `main`** (since 7 Oct; AGENTS.md "Shipping"): commit, push, `node scripts/check.mjs --live /<page>`,
  and give the owner the localhost and production links. No pull requests, no waiting for CI; a backend push starts the refresh
  itself. Write the result under Results (date, pass or fail, what was seen) and move the item off "Next up".
- **Production Neon is read-only** (`SELECT` only). A schema change is a **Stop**: you apply the migration (AGENTS.md: "manual
  production owner migrate"). A read model is used instead whenever it is enough.
- **Spend nothing.** No paid service, no new dependency without a reason, and Sorare's and Futbol Fantasy's reads stay inside
  their limits and throttles.
- **One change to the numbers per refresh.** A model change ships only if it clears the bar (AGENTS.md "Model rules"), never
  in the same refresh as another change to the numbers, so a shift can be blamed on one thing.
- **On sorare.com, read only.** Never press Sorare's buttons. Apply stays Check → Draft → Enter, pressed by you.
- **Keep the docs true:** update [docs/user_manual.md](../docs/user_manual.md), [docs/how_it_works.md](../docs/how_it_works.md)
  and the source plan of the step.
- **Stop and ask** only at a **Stop**, or for money, credentials, a destructive action, a migration or a choice that is not
  settled.

## Calendar

Fixed dates. These steps run on their day, between the others.

| When | Step |
|---|---|
| Tue 6 Oct, 14:00 UTC (GW20 locks) | The week being planned becomes GW21: your gallery's tiles appear, and the Sofix tab shows GW21's plan even before 9.2 |
| Wed 7 Oct, after 14:00 UTC | The Audit's first real rows: GW19 is settled, so Sofix's column goes from "Waiting for results" to counts (about 21 checked games, still under the 100 that gives a figure) and the live check's pairs begin |
| By Fri 9 Oct, 16:00 (GW21, round 8, locks) | Batch 1 live: the plan frozen at the lock, and the richer record |
| Thu 8 – Fri 9 Oct, once clubs publish their squad lists | 2.1 · the call-up chip, live |
| Fri 9 Oct, the three hours before the lock | 2.2 · near-lock runs; 2.3 · five numbers by eye |
| Fri 9 – Mon 12 Oct, during the games | 2.4 · a match that has kicked off |
| Sat 10 – Tue 13 Oct | 2.5 · round 9 replaces round 8 |
| Wed 14 Oct, after 14:00 UTC (a day after GW21 ends) | 2.6 · the starts settled; the first frozen plan beside its real scores; the Audit's Futbol Fantasy column shows its first checked games (round 8: up to 75 of your players), so the first figures can appear |
| Wed 14 – Thu 15 Oct | 2.7 · European games and the competition tabs |

---

## Batch 0 · Close what is open (now)

### 0.1 · Your part, written down

- **Apply.**
  - You tell me what happened at Check, Draft and Enter: anything Sorare refused, and what happened if a session had expired.
  - It is written into S6 of [docs/sorare_plan.md](../docs/sorare_plan.md) and into TODO.md.
  - If it passed, S6's last box is ticked and SorareExt's retirement is no longer blocked (7.6).
- **The Refresh button.** Press it once: a "Scheduled refresh" run starts in Actions, the button waits out its 10-minute
  cooldown, and the page updates when the run ends. This is the Futbol Fantasy plan's S6 "done when".
- **Done when** both are in Results.

### 0.2 · The overlay on your own Sorare pages

The extension is reloaded, so these can be read now. All of this happens in your Chrome on sorare.com, reading only:

- **R26:** the sheet shows every card or "+N"; the Futbol Fantasy row says "LaLiga only" outside LaLiga; no Spanish.
- **C18:** tiles with their mark (FF, SO or SF) and the amber or red row; the panel with the plan chip, Starts / Benched, the
  chance with "START · FF", and SOURCES folded; nothing over Sorare's own chips.
- **C19:** the panel says "FF live N min ago". The request rate is covered by the unit tests.
- **The old-week question:** on an old week's page, the popup's "Gameweek in the address" row says whether Sorare's addresses
  carry the week. If it says "none named", reading the week from the page itself becomes a step in batch 7.
- **Ranks:** #1 to #3 on a "Select your …" list.
- **G1 on the overlay:** five round-8 players show the same chance and source as on Lineups and Play.
- **Open from O6:** what Sorare's gold percentage on the compose card is, and whether the left band carries a badge.
- **Done when** each is pass or fail in Results. A failure becomes the next step of this batch.

### 0.3 · A removed Futbol Fantasy match is not a failed read

- The other session's change is merged.
- The next refresh's log names a removed match as removed, not as a failure, and `futbolfantasy.failed` stays empty.

### 0.4 · Play's lineup sheet while the card art loads (the rest of R29)

- **Where:** `frontend/components/play/Lineup.tsx`, `SheetCard`.
- **Change:** the card's picture area shows a quiet silhouette in the card's rarity until the art arrives, as Lineups does. The
  name is already printed under the card.
- **Test first:** an e2e with the art held back 3 s: the placeholder is visible, then the art alone.

### 0.5 · Write down the Futbol Fantasy checks that are already shown

- In [plans/futbolfantasy.md](futbolfantasy.md) section 9, under Results:
  - C8 and C14: Futbol Fantasy and its squad pages answer GitHub's runners.
  - C10: what is stored (read-only `SELECT`).
  - C15: the Lineups page.
  - C20: runs take 376–578 s against a 15-minute limit.
- Mark as overtaken:
  - C16: every card is Sorare art now.
  - C21: the alternatives come from Futbol Fantasy's own slots now.
- Bring section 3's status rows up to date: S4, S6 and S7 are on `main`.

### 0.6 · One order, in one place

- TODO.md and [docs/sorare_plan.md](../docs/sorare_plan.md) point here.
- In S9, tick "one Sorare GW across two LaLiga rounds" (done 28 Sep).
- Once the other session has finished with it, `plans/futbolfantasy.md` gets the same pointer.

## Batch 1 · Record before round 8 locks (by Fri 9 Oct, 16:00)

### 1.1 · T1, phase P0: why Giorgi 45 and Oyarzabal 43

- **What:** test leads L1 to L6 of [xscore.md](xscore.md) section 2:
  - whether a rare starter's "if he starts" is Sorare's projection passed straight through
  - the 54% that comes from his last five games, not from Sorare
  - two games treated as one
  - the club xG used for a national-team game
  - one spread for everyone
  - whether "best score chosen" means the best of the two games
- **Also settle:**
  - the names of Sorare's fields for the decisive and all-around scores
  - whether "started" and minutes are reliable for national-team games
- **How:** a local run, read-only, with the backend's own Sorare access. No change to the numbers.
- **Done when** each lead is marked confirmed or refuted, with its numbers, in xscore.md and TODO.md.

### 1.2 · The plan as it stood at the lock

- **Where:** the job's publish step, `backend/app/sorare/publish.py`.
- **Change:** the first run after a lock copies the plan as it stood into `sorare_plan:<slug>`. It holds:
  - the lineups, captains, expected totals and reward chances
  - each card's chance, source, score if he starts and score if he comes on
- It is a read model, so no migration.
- **Test first:**
  - a run after the lock writes it once and never overwrites it
  - a run before the lock writes nothing
- **Done when** the first lock after the merge has its row (`SELECT`), and GW21 is frozen at its lock on 9 Oct.

### 1.3 · T1, phase P1: record what the backtest will need

- **What, per player and game:**
  - Sorare's starter odds on their own
  - Sofix's chance he starts, chance he comes on, score if he starts and score if he comes on
  - each game's competition and opponent
  - once settled: started, minutes and each game's score
- **Changed from xscore.md:** this goes in a read model, like `start_chances`, instead of new columns in `sorare_forecasts`.
  It then needs no migration and starts recording before round 8. Columns follow only if phase P2 needs SQL over them, and
  that would be a **Stop**.
- **Done when** a run's record has these fields for every planned player, and a settled week has the actual figures.

### 1.4 · "2 games" on the tile, and both games in the panel

- Display only; no change to the numbers.
- **Where:** `frontend/lib/overlay.ts` and the extension's tile and panel.
- **Done when** the overlay e2e, the design check and the phone width pass, and a two-game player shows "2 games" with both
  kickoffs.

## Batch 2 · Round 8, live (dated; see the calendar)

Each result goes into Results here and into section 9 of [futbolfantasy.md](futbolfantasy.md). A failure becomes a fix step at
the head of the batch then under way.

- **2.1 · The call-up chip, live (R32).**
  - Once a club's squad list is out, its players called up by their country show the two letters, with the country named on hover.
  - Note where the page keeps the squad list and in what markup (Q5).
- **2.2 · Near-lock runs (C9).**
  - "Refresh near a lock" starts a refresh about every 30 minutes in the last 3 hours before GW21's lock.
  - Each run is followed by a "Scheduled refresh" run.
- **2.3 · Five numbers by eye (C5 to C7).**
  - For five of your players, the chance on Play, on Lineups and on the overlay equals Futbol Fantasy's at the read time.
  - Take one player Futbol Fantasy has out: he is in no lineup (C6).
- **2.4 · A match that has kicked off.**
  - Its game stops using Futbol Fantasy (C11).
  - Note what Futbol Fantasy's page shows after kickoff (Q1).
  - On Lineups the match shows its score and is marked as frozen.
- **2.5 · Round 9 replaces round 8 (Q2).** When Futbol Fantasy moves on, Lineups, its tabs and the Home tile move with it, and an
  address for a round-8 match says it is no longer on the site.
- **2.6 · Settled (C12).**
  - `python -m app.jobs.starts` shows settled rows for all three sources, with at least 30 for Futbol Fantasy.
  - GW21's frozen plan (1.2) can be put beside its real scores.
- **2.7 · European games (C13).**
  - A Europa League match is read and its players' game uses Futbol Fantasy.
  - Lineups shows its competition tabs.
  - Q3 (the cup's addresses) waits until the Copa del Rey reaches the LaLiga clubs.
- **2.8 · When they happen:** a Futbol Fantasy read that fails or is over a day old, and a postponed game. Each state reads as
  the manual says.

## Batch 3 · T1, the xScore model

- **3.1 · Phase P2: the backtest.**
  - Build `backend/app/sorare/backtest.py`, reusing `app/backtest/metrics.py`.
  - Export your players' game history for 2025/26 and this season: about 80 free reads, kept in a git-ignored file.
  - Tests first, with made-up histories.
  - Output: section 3 of [xscore.md](xscore.md), slice by slice, for today's model. Nothing on screen changes.
- **3.2 · The wider export:** only if decision 4 says yes.
- **3.2b · A week-level backtest** (added 2 Oct from 3.3's findings; **built and run 2 Oct**, see Results). The first backtest
  scores single games, which cannot test "the best of two". Rows per player and Sorare gameweek: the plan's expected score for the
  week against the best score he made in it. It needs each game's gameweek (Sorare's own, from `so5Fixtures`, not Monday to
  Sunday), so the export keeps their windows.
- **3.3 · Phase P3: rank the errors.**
  - Rank which slice is worst: national-team games, rare starters, two-game weeks, the bench.
  - Re-order 3.4 by what the ranking shows, and write it into xscore.md.
- **3.4 · Phase P4: one fix per refresh.** **Paused by you on 3 Oct:** the level fix (P4-1) waits until games from 1 Oct exist to test
  it on; your two new issues, the bench score and the opponent, go first as 9.4 and 9.5. Each one only ships if it beats today's numbers on the weeks held out (from 1 Oct
  2026), and "no change" is an acceptable result. Each goes through a failing test, then the change, then the tuning weeks,
  then the held-out weeks. The candidates, before re-ordering:
  1. Chances and scores kept apart by competition (club, national team), shrunk towards the position's norm: "with Spain he
     always does something".
  2. "If he starts" for a rare starter stops being Sorare's projection by default.
  3. **Off the bench, done properly:**
     - his own chance of coming on
     - if he comes on: 35 plus his all-around points per minute × the minutes he usually gets, with the floor rule
     - shown as "≈38 if he comes off the bench · 60% he comes on"
     - this replaces the flat 42 and the 30% / 2% guesses in `forecast.py`
  4. Two games: the expected best of the two, worked out per game.
  5. A national-team game's xG is not borrowed from his club: either a scaled number or "No xG".
  6. A spread by role, if it changes the reward chances enough to matter.
- **3.5 · What you see.**
  - Decision 1.
  - The pair "if he starts / if he comes on", and the competition beside the chance ("for Spain").
  - The panel names where each number came from.
  - The manual, how_it_works.md and S4 get the new baseline.
- **3.6 · Phase P6: Sorare's projection against ours,** slice by slice, once about 100 of your players are scored. Then
  decision 2.

## Batch 4 · T3, Pro in the best plan

**Paused by you on 2 Oct 2026.** 4.1 and 4.2 are done ([pro.md](pro.md)); 4.3 to 4.7 wait until you say to go on, and a run skips this
batch. Nothing in the other batches depends on it.

- **4.1 · Research (read-only).**
  - **From Sorare's help centre:** how Pro works:
    - the steps, the targets and the King's Step
    - the score a step needs and what it pays
    - which cards are allowed and how many lineups
    - how Pro sits beside the Classic competitions of the same gameweek
  - **From Sorare's API:** where a Pro competition, your level and your progress are found.
- **4.2 · What Sorare has that Sofix doesn't** (T6's first step). One table:
  - game modes (Pro)
  - Super Rare and Unique competitions (filtered out today)
  - levels and progress
  - anything else seen

  Each gap gets one line: build it, skip it, or later.
- **4.3 · Stop:** you read 4.1 and 4.2 and choose the scope.
- **4.4 · Pro reaches the planner.**
  - **Where:** `backend/app/sorare/sync.py`, `FIXTURES` and `_tracks`.
  - Pro gameweeks and competitions are read, tested on recorded answers.
- **4.5 · Your Pro level and progress,** read from your signed-in Sorare through the extension, read-only, as your entered
  lineups are.
- **4.6 · The planner values a Pro lineup:**
  - the chance of reaching the next step × what that step pays, against what the same cards win elsewhere
  - it says so plainly when the next step is out of reach
- **4.7 · Play shows Pro.** A canvas first if it needs a new look (**Stop**), then built and checked on production.

## Batch 5 · T7, the Audit page

**Started on 2 Oct, at your request.** You asked for the page, the xScore's success rate and who starts per source directly, so 5.1's
canvas Stop was not taken: the page follows the Control Center's look. What is built and what is left is in the Results.

**Paused by you on 3 Oct:** the rest of 5.2 and all of 5.3 and 5.4. They need settled games (GW19 from Wed 7 Oct, round 8 from Wed
14 Oct) and the plan frozen at GW21's lock to have been played. The page fills its existing figures by itself meanwhile. **The xScore's
figures move to batch 10 (10.2, your request of 3 Oct, evening):** every number the new xScore gives, for every LaLiga player, scored
after each gameweek, so they do not wait for your players' games alone.

- **5.1 · Design canvas for `/audit` (Stop).**
  - Each figure per gameweek and for the season, with how many cases stand behind it.
  - Under a floor it says "too few to tell" instead of a number.
- **5.2 · The figures that need nothing new.** Each is built test-first, with fixtures:
  - 1 · who starts, per source: right or wrong, how far off, whether 80% means 80%, split by competition, position and team,
    and the big misses
  - 2 · xScore precision
  - 8 · Sorare's projection against Sofix's
  - 9 · two-game weeks
  - 11 · Futbol Fantasy's doubles
  - 12 · the football board: its RPS against the 0.1947 baseline and the bookmakers, and clean sheets
  - 13 · coverage and freshness
- **5.3 · The frozen plan, scored.**
  - The frozen plan's lineups (1.2) are rebuilt from their saved cards and scored. This is the larger half of TODO's entry.
  - A kept week shows "Before the lock" beside the replay.
- **5.4 · The figures that need 5.3:**
  - 3 · plan team score
  - 4 · rewards guessed: whether "reward chance 30%" came true about 30% of the time, and whether picks in one lineup move
    together. This is the calibration the research report and S8 ask for.
  - 5 · best lineup guessed
  - 6 · captain
  - 7 · you against the plan
  - 10 · early plans
  - 14 · money

## Batch 6 · T4 and T5 on sorare.com

- **6.1 · One design canvas (Stop).** It covers:
  - "Your gameweek" sheet: its size, and what it lists (every lineup of the plan? what is already entered?)
  - Sofix's expected score beside each lineup on Sorare's lineups page
  - the expected total, captain included, while you compose a lineup
  - the player-page panel (decision 6)
- **6.2 · The sheet (T4),** built as chosen.
- **6.3 · Expected score on Sorare's lineups page (T5).** Reads what Sorare shows and adds Sofix's number; nothing is written to
  Sorare.
- **6.4 · The total while composing (T5),** updating as you swap cards.
- **6.5 · The player panel,** if chosen.
- **6.6 · Your pages, live:** the lineup, compose, gallery and player pages, signed out, and the switch off, each with a
  fixture e2e.

## Batch 7 · Hardening, then SorareExt

- **7.1 · Account matching.**
  - `whoami` reports both the nickname and the slug.
  - The overlay answers only for the owner's account.
  - Test both ways: a wrong account gets nothing, and your own overlay is never blanked by a wrong guess.
- **7.2 · Version agreement.** An extension older than the app's payload says "reload" instead of drawing wrong numbers.
- **7.3 · The board's `scoreColour()` steps match Sorare's** (they differed when measured on 29 Sep).
- **7.4 · A security and contract e2e for the extension:** what it may read and write, and the origins it refuses.
- **7.5 · Recovery written down** for:
  - Apply refused
  - a session expired
  - the extension disconnected
- **7.6 · Retire SorareExt (Stop, your go).**
  - Only after 0.1 passed and 7.1 to 7.5 are done.
  - With a note on how to bring it back.
- **Not a step:** check Sorare's and the image hosts' terms again before any use that is not private.

## Batch 8 · Small things

- **8.1 · A postponed game's early round** takes one of the refresh slots meant for the nearest rounds: order the slots by date.
- **8.2 · A fourth open Sorare week** gets no plan: plan it, or keep the note. Sorare opens about three at a time.
- **8.3 · The overlay may rank a stray gallery** of four or more cards under any "Select your" text: tighten what counts.
- **8.4 · Futbol Fantasy conditional requests (Q4).** If the site answers 304 to ETag or Last-Modified, read less.
- **8.5 · The weight of the card pictures.**
  - About 400 KB each, and Sorare serves no smaller size.
  - Only if the phone feels slow: list the options and their cost first.
- **8.6 · GW1 to GW16 rebuilt,** only if decision 5 says yes.
- **Yours, optional:** install the app (Chrome's address bar → install).

## Batch 9 · From the live pass and your answers of 3 Oct

Broken things first, then the model. Release 1 is one extension version (0.3.2) and one app deploy, so one last Reload by you; it
should be live before round 8 locks (Fri 9 Oct, 16:00 Madrid). Releases 2 and 3 change numbers, so each is one refresh on its own.

**State, 3 Oct evening:** 9.1, 9.2, 9.3 and 9.4 are merged (PR #30, extension 0.3.2; the live look waits for your Reload); 9.5 is researched and
waits for your call; 9.6 to 9.10 are the owner's TODO.md items B, A, C, D and F, not started. The bench score turned out to need no model change
(release 2 of the plan above was folded into release 1), so release 2 is now only the tile's rule (9.6).

**Release 1 · the extension and the app**

- **9.1 · Live Futbol Fantasy reads find nobody** (your item 1). Plan: [overlay.md](overlay.md) O12. The reader ignores capitals.
  *Done when* the panel says "FF live N min ago" on round 8's compose page (C19).
- **9.2 · The Sofix tab follows the week in the address** (item 2). Plan: overlay.md O13. *Done when* GW21's compose page shows "Your
  gameweek 21" with its cards or "+N" (the rest of R26).
- **9.3 · Celta's name** (item 3). Plan: overlay.md O14. *Done when* the Elche v Celta keepers show a difficulty on production.
- **9.7 · The extension updates itself** (item 4; TODO.md "A"). The worker reads its own `manifest.json` every minute (an alarm, no new
  permission) and calls `chrome.runtime.reload()` when the version on disk is newer than the one running. After a merge I pull your
  main folder and run `node extension/scripts/configure.mjs`. *Test first:* `lib/extensionBackground.test.ts`, a newer version on disk
  reloads once and an equal or older one never does. *Done when* a version bump reaches your Chrome without your Reload (from 0.3.3).
- **9.8 · A refresh near a lock that does not wait for GitHub's clock** (item 6; TODO.md "C"; decision 9). Decided 3 Oct: option 1, the extension and the app start it when you open them in the last three hours before a lock.
- **9.9 · Pin `ubuntu-24.04`** (*done 7 Oct*) in `ci.yml`, `refresh.yml` and `near-lock.yml` (item 7, approved). *Done when* CI and one refresh run on
  it, before 19 Oct.
- **9.10 · Your account only, and "reload" for an old extension** (item 9; TODO.md "F"): steps 7.1 and 7.2, moved here so they ship
  in the same version.
- **9.11 · An outside clock for the refresh** (future feature, added 7 Oct; TODO.md "C"): a free cron-job.org job calls the app's refresh
  route on the timetable, so the numbers stay fresh even on days nothing is opened. Needs your free account first. *Done when* a week of
  runs started on time is seen on the Audit's freshness.

**Release 2 · the bench score** (one refresh)

- **9.4 · The score if he comes on from the bench** (your item 13). Plan: [xscore.md](xscore.md) P7: two scores, "if he starts" and "if
  he comes on", each with its chance; the backtest on the games he started and the games he came on, separately. *Done when* P7's
  "done when" is met.
- **9.6 · The tile's big number follows his start chance** (decision 1, item 5): under 40% the "comes on" score, from 40% the "starts"
  score, with his chance of coming on beside it under 40%. Display only, with 9.4.

**Release 3 · the opponent** (one refresh per position that clears the bar)

- **9.5 · The game in the score, keepers first** (your item 14). Plan: xscore.md P8. **Moved into batch 10 on 3 Oct:** your answer was the
  fuller model, and keepers are its first position (10.2).

**Paused by you on 3 Oct:** step 0.1 (your Apply result, and one press of Refresh; TODO.md "E"). Neither blocks batch 9.

## Batch 10 · The new xScore: the score added up the way Sorare adds it

Your four requests of 3 Oct, evening. Plan: [xscore.md](xscore.md) P9; TODO.md "G". **Started on your go of 3 Oct (night):** 10.1 and the
first part of 10.2 are done (Results). Each step that changes numbers is one refresh on its own and ships only if it clears the bar on
the held-out weeks (P9 "The bar").

- **10.1 · The data. Done 4 Oct** (Results). Two free questions per LaLiga game (`Game.playerGameScores`; one question is over Sorare's keyless limit), a third
  light one if the penalties and set pieces taken need it. The first: every player's score, decisive level and all-around points,
  started, minutes, Sorare's projection and grade, the teams and the result; the second: each score's 53 stats; the official elevens from
  `homeFormation` and `awayFormation`. For 2025/26 and 2026/27, about 900 to 1,350 questions two seconds apart, into a git-ignored file;
  each game joined to the football model's forecast from the Monday before, to football-data.co.uk's shots and to its over/under 2.5
  prices. Whether The Odds API's free plan has scorer prices for LaLiga is left for one read from the odds job (1 credit; the key lives only
  in GitHub's secrets), with part 12. *Test first:* made-up games for the reader and the joins. *Done when* every LaLiga game has its
  players, its stats, its forecast and its prices, and the counts are in P9.
- **10.2 · Tracking first** (P9 "Tracking"). Before each lock, every number Sofix gives for every LaLiga player is written down in a read
  model; a day after the gameweek ends each is scored; the Audit page shows the twelve groups of P9's tracking catalogue, headline figures
  first, each as "right N of M" or a miss in points, "too few to tell" under 100, with today's formula beside it from the two-season replay,
  and the decision scorecard. *Test first:* made-up predictions and results for each figure, including the band test of a chance and the
  "too few" floor. *Done when* the Audit shows today's formula on every figure, so each later step reads as a before and an after. In
  three parts:
  - **10.2a · today's formula replayed on every LaLiga player, and against Sorare's projection. Done 4 Oct** (Results; no change on screen).
  - **10.2b · what must be written down while it is still said: built 4 Oct** (Results; [xscore.md](xscore.md) P9 progress): Futbol Fantasy's
    start chance for every player of every match, kept at the lock and before the kick-off, in one read model (`ff_chances`), no migration.
    Everything else is read again afterwards from Sorare's games export and recomputed.
  - **10.2c · the Audit shows the league figures and the catalogue's first groups,** beside today's formula (the look needs 10.5's canvas).
- **10.3 · Keepers** (P8's groundwork). The chance of a clean sheet (their decisive action) and of a penalty save, the score with and
  without one, from parts 1 to 5, 8, 11, 12 and 13 of P9, each weighted on 2025/26; then the range. *Done when* the table against today's
  formula, the keepers' average and Sorare's projection is in P9 and, if it clears the bar, one refresh ships it.
  **Built 4 Oct** (Results; [xscore.md](xscore.md) P9 progress, X3): the table is in P9 (it clears the bar on the walk-forward) and the
  model is in `app/sorare/keeper.py`, on production since refresh #73 (4 Oct).
- **10.4 · Defenders, then midfielders and forwards.** The same with goals and assists as the decisive actions, and parts 14, 15 and 16; one
  refresh per position.
  **Done 4 Oct, on production** ([xscore.md](xscore.md) P9 progress, X4): all three clear the bar on the walk-forward and ship in one refresh (one shared
  callback); the goal-and-assist split and parts 14 to 16 wait for 10.5.
- **10.5 · On screen.** A design canvas first (decision 8, a **Stop**): the panel's chance of a decisive action with the score with and
  without one, the range and the reasons in points; each player's stat sheet and next five gameweeks on the Players page; the daily
  missions; the Audit's catalogue and scorecard. The tile keeps one big number (decision 1). *Done when* it is on production at desktop
  and phone width, and the manual and how_it_works.md describe the new score.
  **Canvas settled 4 Oct** (three rounds with you; [xscore.md](xscore.md) X5). **10.5a, the panel: built 4 Oct** (extension 0.3.3, the picture of his game and at most two reasons in
  points, the number and the chance larger). **10.5b, the Players page, built 4 Oct** (X5b). **10.5c, the Missions page, built 4 Oct** (X5c, extension 0.3.4; the official-eleven check is still 10.7). **10.2c, the Audit's league figures and new look, built 4 Oct** (X5d). The lineup, captain and missions figures wait for played weeks.
- **10.6 · Lineups and the captain on the real spread** (P9). The planner simulates each match once and scores every player from it, so
  linked scores (a keeper and his defenders, teammates up front) are counted; lineups are picked for the reward and the captain for his
  ceiling where that earns more. Its own refresh: the reward chances change. *Test first:* a keeper and a defender of the same side move
  together in the simulation; the captain choice on a made-up week. *Done when* the Audit's lineup figures show the chances honest.
  **Done 4 Oct, on production** (Results; [xscore.md](xscore.md) X6): linked scores and the captain for the ceiling; choosing the starters for the reward is next.
- **10.7 · Daily missions** (P9 "Daily missions"). The extension reads the missions running (`DecisivePlayerPickerTask`: DECISIVE or SCORE,
  the actions that count, how many picks, which cards) from your signed-in Sorare tab, read only. Sofix ranks your cards for each: the
  chance of a listed decisive action times the XP of his scarcity, or the chance he beats the average by the amount asked; a card goes to
  one mission at a time. From about an hour before each kick-off the extension checks the official eleven and flags a benched pick.
  *Test first:* two missions sharing cards, each card placed once; a pick dropped from the eleven is flagged. *Done when* each mission
  shows its best cards on production and the Audit counts how many suggested cards completed it.
  **6 Oct, part 1 (extension 0.3.6):** the page showed Sunday's Rare list as Tuesday's (Sorare had 1 mission, Sofix 3): a list now counts only
  if loaded since the 9:00 CET reset, never borrowed from another rarity; the page loads today's missions itself through the extension
  (`SofixMissions`, `currentUser.tasks(periodicity: DAILY)`, read only; your picks and Sorare's verdict come with it) and has a Load button;
  without today's list it shows none (missions are daily; the Load button never opens a tab); SCORE missions are listed, not ranked. **Part 2 (6 Oct):** the pick log (`missions_log:YYYY-MM`: the Decisive Picker every day, loaded missions too, every card of yours that day with its chance, frozen at kick-off; written at the extension's check-in, a load and each refresh), settled by the refresh a day after each game (`app/sorare/missions.py`), and Audit · Missions: a mission day is a success when Sofix's picks hold as many achievers as your cards allowed (the owner's rule).
  **Repair, 9 Oct:** extension 0.3.9 verifies complete task-group imports; a separate active-GW card/game pool and rolling evidence feed suggestions/scouting. Every unloaded date is an explicit Decisive Picker baseline. History retains imported picks even without a forecast, supports separate revisioned corrections/restoration, and reconciles dated archives. See [missions-repair.md](missions-repair.md) for evidence, limits and verification.

- **10.8 · Self-correcting numbers** (P9). Every Monday each chance is checked in its bands and, where it leans, corrected per position in
  its own refresh, once 100 cases stand behind it; Futbol Fantasy stays the first start source, only its lean is corrected. *Done when*
  the first correction is logged on the Audit page with whether the following weeks agreed.
- **10.9 · The next five gameweeks** (P9). Each player's xScore for each of his next five gameweeks and their sum, on the Players page,
  and the expected points per euro beside each card's price on the Cards page. *Done when* both are on production and the Audit tracks
  the forecasts by distance.
- **10.10 · Parts 6, 7, 9 and 10 of P9,** one at a time: shots, minutes, cards and errors, then two games, club or national team and a
  European game three days before.

---

## Results

- **9 Oct - data keeping step 8:** Control shows five dated dataset rows from one published health record, including known
  source failures and retained counts. All eight implementation steps are complete; migration and seed already ran.
  The owner Chrome archive check and accumulating 100 paired Audit cases remain. [Verification](data-keeping.md#results).

- **9 Oct - data keeping step 7:** permanent odds with CSV-first recovery, pre-kick-off match forecasts and paired live RPS on Audit, hidden below 100 matches. Real cached 2016/17–2026/27 prices reproduced the odds record exactly after simulated cache loss. See [data-keeping Results](data-keeping.md#results).

- **9 Oct - data keeping step 6:** final owner weeks are kept once, a day after their end, and reused on Recap, Play,
  Cards and Rewards without Chrome. Audit scores every plan kept at lock with its saved rules and actual games;
  unknown outcomes stay pending. Card figures are explicitly whole-lineup rewards. Owner Chrome check next;
  [data-keeping Results](data-keeping.md#results) records local, browser and deployment verification. Steps 7-8 remain.

- **9 Oct - data keeping steps 1-5:** the owner-approved single migration `3ce433a96bed` and historical seed completed
  on production (29,094 player-game rows, 1,020 players, 542 sheets). Local gate and real-data desktop/phone player
  inspection pass; integration with the concurrent daily missions repair is covered by failing-first regressions.
  [Data-keeping Results](data-keeping.md#results) records the browser and deployment checks. Next is step 6.

- **8 Oct - data keeping step 3 built locally:** Audit and mission results read the common game store; legacy overlap figures match without duplicate cases. FF/Sorare/Sofix predicted elevens are checked by week and club, with the 100-case floor. Local gate, Audit/mobile specs and real-data desktop/phone inspection pass ([details](data-keeping.md#results)). Owner Audit check next; deployment awaits the one migration.

- **8 Oct — data keeping step 2 built locally:** source statements for every player/game, FF's predicted eleven and the two score numbers update before lock and freeze afterwards. Missing sources retain their saved readings; legacy records continue for the Audit transition. Test-first cases and refresh wiring checked ([details](data-keeping.md#results)); deployment awaits the same single migration.

- **8 Oct — data keeping step 1 built locally:** permanent paged/incremental player games, teams, stats and season yellows; owner refresh and daily job share actual-only upserts. Red/five-yellow fallback bans leave a double week's second game available. Test-first regressions and the full local gate pass. One schema migration remains the deployment prerequisite; work continues locally ([details](data-keeping.md#results)).

- **8 Oct — data keeping schema prepared:** [plans/data-keeping.md](data-keeping.md), migration `3ce433a96bed` adds the four history tables; production migration awaits the owner before any schema-dependent code is pushed. Steps 1–8 remain in Next up.

### L · every LaLiga player's past games, read daily · 7 Oct 2026 · done

`69171db`: the League history workflow (05:30 Madrid, or by hand) replaced the 40 players a refresh. First run by hand: 618 of
618 players read in 6 min 40 s, 598 with their cards, 19 red cards found. After the next refresh every LaLiga player Futbol
Fantasy links has a Sofix % (0 without one, 71 before), including the seven you named (Vinícius, Renato Veiga, Sergi Cardona,
Sergio Gómez, Xavi Espart, Yoel Lago, Zaid Romero), and the three players with a red card in their last LaLiga game (Huijsen,
Orri, Redondo) are at 0%, the same three Futbol Fantasy lists as suspended. Control shows "Every player's past games: 618 of
618 read …" (checked at 1440 and 375 px).

### Batch 0 · 2 Oct 2026 · done except 0.1, which needs you (0.2 done 3 Oct)

Merged as #19 together with batch 1's backend steps; refresh #44 run by hand on `main` (5 min 16 s). Checked in your Chrome.

| Step | Result | What was seen |
|---|---|---|
| 0.1 | **paused by you, 3 Oct** | The Refresh button is on /control (the key is in Vercel). Pressing it once and what Check, Draft and Enter said are still to be written down. |
| 0.2 | **done 3 Oct: passes, with three faults** (batch 9) | Run by me in your Chrome after you reloaded the extension (Control: v0.3.1, online) and restored the window. Round 8's compose page ("Select your Goalkeeper", 12 cards), the Lineups page, an old week's page and your gallery; details in [overlay.md](overlay.md), "Second live pass". **R26:** "LaLiga only" on the FF row for a player outside LaLiga, no Spanish word anywhere: pass; the tab's "every card or +N" could not be seen, because the tab shows GW20, which has no plan (fault O13). **C18:** pass. **C19:** **fail**, the live FF read finds no player (fault O12). **Old week:** Sorare's addresses carry the week on its Lineups, board and compose pages, and an old week's page draws the kept numbers grey: no batch-7 step needed. **Ranks:** #1 to #3 on "Select your Goalkeeper": pass. **G1:** seven keepers on the overlay equal the database to the decimal (score, chance, source), and the Lineups page's three players of yours equal it too: pass. **O6:** Sorare's gold "+11%" is the card's bonus (XP 4 + season 5 + collection 2, its own tooltip); no badge on the left band. Also found: every Celta game shows "No odds" (fault O14). Not seen: the ×2 badge (no large card of a two-game player on any page that opens today); by design, your gallery has no tiles until GW20 locks on Tue 6 Oct. |
| 0.3 | pass | Refresh #44 log: no warning, `futbolfantasy` `matches` 10, `read` 10, `failed` absent (refresh #42: `read` 30 and 52 failed pages, two HTTP 404). The Sorare step took 243 s against 449 s, the run 5 min 16 s against 8 min 18 s. The cause was larger than the 404s: the Copa del Rey page's sidebar was read as its matches. |
| 0.4 | pass | Play's lineup sheet on production: 7 cards, 7 silhouettes behind the art. The e2e test holds the art back 3 s and sees the silhouette, then the picture over it. |
| 0.5 | pass | Section 9 of the Futbol Fantasy plan has its results (C1–C21), from refresh #42's log and read-only `SELECT`s. |
| 0.6 | pass | TODO.md, the xScore, overlay and Futbol Fantasy plans and the Sorare tracker point here; S9's "one Sorare GW across two LaLiga rounds" is ticked. |

**0.2 needed nothing more from you** once the window was in front: I read the page and the panels from your Chrome. The popup itself
cannot be opened by the tools (they open web pages only), so its two rows were answered from the page: every card on the list was
recognised, and the week came from the address.

### Batch 1 · 2 Oct 2026 · done (1.4 looked at on Sorare on 3 Oct)

1.2 and 1.3 were merged as #19; 1.4 came in the next pull request.

| Step | Result | What was seen |
|---|---|---|
| 1.1 P0 | **done** (L5 measured by the backtest, L6 answered by Sorare's own rule: `max`) | Findings in [xscore.md](xscore.md) ("P0 findings"): the page's numbers for Giorgi and Oyarzabal are rebuilt to the decimal from their game history; the "45 against 52" comes from a 75% cliff between two kinds of number (F1), club and country games are pooled (F2), Sorare publishes a projection for each game and the model uses one (F3), and the bench score is one or two appearances (F4). L5 (spread by role) was measured by the backtest (starters 52.1 with a spread of 19.1, substitute appearances 40.9 with 12.2); L6 (which of two games counts) is in Sorare's own rules: `multiGameScoreAggregator` is `max` on all 29 leaderboards of GW19, so the best game counts, as the model assumes. |
| 1.2 | **pass, first live freeze, 2 Oct** | GW19 locked at 14:00 UTC. The page it kept was built at 13:56:06 UTC by refresh #46 (corrected 3 Oct: it was the daily 07:17 UTC scheduled refresh, which GitHub started 6 h 38 min late, at 13:55 UTC, not the near-lock check, which never ran in those three hours; see 2.2 below); refresh #47, which I started at 14:01 UTC, wrote `sorare_plan:football-2-6-oct-2026` at 14:01:50 UTC (read-only `SELECT`): 26,592 bytes, 3 plans, 13 players, `builtAt` before the lock and `frozenAt` after it, the week's name and lock as the page had them. Before the lock I read the live page's weeks the same way and they carried the `gameweek.slug` and `lock` the freeze reads. |
| 1.3 | **pass, frozen at the lock** | Refresh #44: `starts` `{'written': 20, 'frozen': 0, 'noted': 14, 'settled': 0}`: the 14 players of GW19 carry their `model` and their games' `info`. After the lock the GW19 record has 15 players, and a sample (Abdul Mumin) still says `model.at` 13:56:06 UTC, the last run before the lock: refresh #47 did not touch it, as the rule says. Each player carries `model` (`mu`, `start`, `bench`, `pPlay`, `pStart`, `pOn`, `source`, `startSource`, `form`, `projection`) and each game its `info` (team, venue, kickoff, opponent, competition). The week after (7 to 9 Oct) is open with 3 players. |
| 1.4 | pass in tests, the look waits for you | A player with two games gets `fixtures` in the app's answer, a small **×2** off the tile's lower corner, "2 games this week, best score chosen" in the tile's name, and both games in the panel with their kickoff in your clock. Checked: unit tests for the answer and for the panel's lines, the overlay e2e on the fixture page (a one-game tile has neither), the design check (13 previews) and the whole browser suite at desktop and phone width (163 passed). Extension 0.3.1: Reload Sofix in `chrome://extensions`. On Sorare (3 Oct, extension 0.3.1): its words, "2 games this week, best score chosen", on three tiles of an old week's page; the badge itself is drawn only on large cards, and no large card of a two-game player is on any page that opens today, so its look is the e2e's. |

### Batch 2 · early finding, 2 Oct 2026

| Step | Result | What was seen |
|---|---|---|
| 2.2 (early) | **the near-lock runs mostly do not happen** | "Refresh near a lock" is written to run every 30 minutes. GitHub started it 6 times in 26 hours (1 Oct 08:21, 15:44, 21:17; 2 Oct 01:20, 04:26, 10:51), none in the three hours before today's 16:00 lock, and the 14:07 scheduled refresh did not run either (scheduled runs on a quiet public repo are delayed or dropped). The page the lock would have seen was the 10:30 one; I started a refresh by hand at 15:25. The 9 Oct check (2.2, C9) would fail the same way. |
| 2.2 (why, 3 Oct) | **GitHub did not start it; our check is not at fault** | You asked why it did not run at this lock. From GitHub's public record of the runs (read-only): "Refresh near a lock" is set for every 30 minutes, about 84 runs between its first one (1 Oct 06:21 UTC) and 2 Oct 23:56 UTC; GitHub started **9**, 3 to 7½ hours apart, and none between 08:51 and 15:24 UTC on 2 Oct, while the lock was at 14:00. None of the 9 fell inside a three-hour window, so each correctly did nothing. The regular refresh is no better: **every scheduled run since the first cloud run on 22 Sep started late, every day, the night run 2 to 3½ hours late and the daytime ones 2 to 8 hours late**, and none was lost. On 2 Oct the 12:07 UTC run meant to come "two hours before the lock" started at 17:49, after it; the 07:17 morning run started at 13:55, by luck five minutes before the lock, and with my run at 13:25 it is why GW19's frozen page was fresh. GitHub's documentation says scheduled runs are delayed at busy times and some are dropped; its status page logged "Actions Job Delays" on 1 Oct (14:47 to 17:56 UTC) and nothing on 2 Oct, so this is its normal service for a free public repository, with no guarantee. Anything that must happen before a lock cannot rely on GitHub's clock: step 9.8, decision 9. Until it ships I start a refresh by hand before round 8's lock and one after it. |
| 2.2b | **waits for your choice** | Free ways to get a refresh in the last hours: (a) press Refresh on /control before you lock (works today); (b) **recommended:** the extension asks the app to start the refresh when you open sorare.com within three hours of a lock and the page is older than 25 minutes: the one moment you need fresh numbers, using the same key the Refresh button uses; (c) accept the scheduled runs as they come. (b) is a small change to the extension and one route in the app. |

### Batch 3 · 2 Oct 2026 · in progress

| Step | Result | What was seen |
|---|---|---|
| 3.1 | done | The export, the backtest and the command that prints its report are written test first (38 tests on made-up histories; a player built to start for his country and come off the bench for his club shows the error today's model makes). The first export, asking about twice a second, was refused by Sorare's keyless limit after 14 players and then left every player after them out for want of waiting; it now asks once a second, waits out a refusal and asks the same question again, and stops if it is still refused after three waits. Sorare's limit is on the address, not the account, and it let through about 30 players in 14 minutes. The whole history is in: 84 players, 4,647 games, none failed. Numbers: [xscore.md](xscore.md), "Results of P2 and P3". Headline (by Sorare's own gameweeks, 116 of them): today's form formula is closer than his last five by squared error (-36.4 [-47.4, -26.0]) and slightly further by typical miss (+0.23 [+0.02, +0.44]), orders players no better, and says 2.9 points too little in every slice but national games. |
| 3.2b | done | The export now keeps Sorare's gameweek windows (686 of them, two keyless questions) and the backtest groups games by them, so a second game no longer sees the first and "games in the week" means what Sorare means. `walk_gameweeks` scores a gameweek's expected score against the best of his games in it. **Finding: two games in one gameweek are rare, 22 of 4,592 player-gameweeks (0.5%)**: Sorare opens a gameweek on a Tuesday and a Friday, so a Sunday game and the Tuesday one after are two gameweeks. The first run, by Monday weeks, had counted half the games as double. On the 22 the best-of-two rule says 10.7 too much (squared miss 30.4 against 28.1 for "one game"); too few to act on. Two-game weeks drop to a low priority. |
| 3.3 | done | Ranked by the squared error today's model would gain against the best simple baseline: the only loss is regular starters (24.8 against 24.7 for always 45); rare starters, the bench, national games and every position are not the problem. The level is: both the chance of playing (said 68%, was 71.5%) and the score when he plays (said 48.1, was 49.7) are low. **Tried on the tuning weeks: priors at the players' own level (about 70% and 49) beat today's by squared error (-7.1 [-11.3, -2.4] over 115 gameweeks) and lighter smoothing does not.** The new order of 3.4 is in xscore.md: the level first; two games last; the rest wait for Track B. Nothing ships before the held-out weeks have weeks in them. |

### Batch 4 · 2 Oct 2026 · research done, then paused by you

| Step | Result | What was seen |
|---|---|---|
| 4.1 | done | [pro.md](pro.md). Sorare's help centre is readable through its public Zendesk API (`sorare.zendesk.com/api/v2/help_center/...`), so no sorare.com page was scraped (sorare.com answered 429 to a browser while the history export was running, and its help pages are rendered by script). Pro is Hot Streaks: Anytime Entry, 4 lives and tries per step, a Step Clock of one league matchday, a Rare Reward Bonus, and cards shared with Arena. The "King's Step", the step count and each step's target and reward are not in the help centre; they are `CareerProStep` fields (`target`, `rewardConfigs`, `state`) for the signed-in owner. |
| 4.2 | done | The gap table is in pro.md: build Pro and its level, later for Super Rare and Unique, skip Rooms and Arcade, check Arena's automatic substitutes against the planner. |
| 4.3 | **paused by you, 2 Oct** | The three questions at the end of pro.md (the scope, which rarities you play in Pro, whether Play needs a new look) are not asked until you say to go on. 4.4 to 4.7 follow them. |

### Batch 5 · 2 Oct 2026 · started, at your request: the page, the one xScore figure and who starts per source

| Step | Result | What was seen |
|---|---|---|
| 5.1 | skipped at your request | You asked for the page and its first figures directly, so there was no canvas Stop. It follows the Control Center's look (its widgets, tokens and states) and the design checklist: one hero figure, aligned evidence, honest empty states, text never under 11 px on a desktop or 10 px on a phone. |
| 5.2 · 2, xScore precision | **the one figure is built** | **66.0%: of every pair of your players in one position and gameweek, the xScore rated the better one higher** (64.6% to 67.2%; 39,961 pairs in 99 Sorare gameweeks, your 84 players, 3 Aug 2025 to 1 Oct 2026). A coin flip is 50% and his last five games' average is 66.1%, so it is finding 3 of the backtest in one number. By position: goalkeepers 69%, defenders 66%, midfielders 64%, forwards 68%. Typical miss 19.5 points, runs 3 low. Explained, with a worked example and what it does not say, in [docs/xscore_success_rate.md](../docs/xscore_success_rate.md), which the page links. It is a replay of the form formula alone, so the page's second line, the live check, counts the same pairs on what was written before each lock; it shows a figure from 100 pairs, and one LaLiga round gives several hundred. Not built: the splits by role, competition and source of the chance. |
| 5.2 · 1, who starts | **built, without the splits and the big misses** | Futbol Fantasy, Sorare and Sofix side by side, each scored on the games it had a number for once they are settled: how often it was right, the error score, and how many of the players it put at 80% or more started. A source under 100 checked games says "Too few to tell" with how far along it is, "Waiting for results" or "Nothing yet" with the reason; it never shows a made-up figure. Sofix replayed on the past: right on 72.0% of 4,615 games (always saying he starts: 56.1%; error score 0.188 against 0.246 for saying the same every time; it says 51% on average and 56% started; where it said 80% or more, 87% started). **Today's record:** 24 games written down by Sofix in the two gameweeks recorded (international-break weeks: Nations League, Segunda División and Argentina, so 15 and 3 players), none settled. Sorare gave no start chance for any of your players (0 of 14 in GW19, 0 of 3 in GW20). Futbol Fantasy has none: it covers LaLiga only. **Round 8's Futbol Fantasy lineups name 75 of your players**, so Futbol Fantasy and Sofix should reach 100 checked games within about two LaLiga rounds; decision 4 (every LaLiga player) is not needed for this. |
| 5.2 · 13, coverage and freshness | first part | "Written down so far": for each gameweek, the games written down before its lock, how many have been checked and how many each source gave. Not built: how old Futbol Fantasy's number was at the lock, names not linked, reads that failed. |
| 5.2 · 8, 9, 11, 12 | not built | Sorare's projection against Sofix's needs 100 scored players with both; two-game weeks are 0.5% of the total; Futbol Fantasy's doubles and the football board's RPS are separate figures. |
| 5.3, 5.4 | not built | They need the plan frozen at the lock: GW19's is kept, and GW21's is frozen at the lock on 9 Oct. |
| Production | **checked** | Merged as PR #26; CI #109 was green (backend 1 min 12 s, frontend 43 s, 173 end-to-end tests). The new route needed the OpenAPI document and the generated types regenerated, which `app.openapi_export --check` would have caught in CI. Vercel deployed it; refresh #64 (started by hand, 19:03 UTC) wrote the `audit` read model (1,965 bytes, nothing failed). On https://sofix-yares.vercel.app/audit: the 66%, the three sources' states, the replay bands and the two recorded gameweeks as in the database; the stylesheet applied (the figure at 148 px, three source columns), "Audit" marked in the top bar, no sideways scroll, nothing under 11 px, no console error. Not seen: the page painted in your Chrome (the tab I drive is hidden, so its screenshots time out); the painted desktop and phone captures are from the local end-to-end run on the same payload (docs/images/audit.png). |
| Next | dated | Wed 7 Oct after 14:00 UTC: GW19 settles, so Sofix's column gets its first counts. Wed 14 Oct after 14:00 UTC: round 8 settles, so the first figures can appear. |

### Batch 6

_(none yet)_

### Batch 7 · 2 Oct 2026 · started

| Step | Result | What was seen |
|---|---|---|
| (found) | **for your decision** | Refresh #48's annotations say `ubuntu-latest` becomes Ubuntu 26 from **19 Oct 2026**, and that `actions/checkout@v4`, `actions/cache@v4` and `astral-sh/setup-uv@v6` are already forced onto Node 24. All three workflows (`ci.yml`, `refresh.yml`, `near-lock.yml`) use `ubuntu-latest`, so the refresh could change under us on that day. Pinning `ubuntu-24.04` keeps today's image and costs nothing; I have not changed it, because it is production configuration. |
| 7.4 | done | `lib/extensionBackground.test.ts` runs the worker as it is and now also covers what a web page may ask it. Only the app's own address (or a local development server over plain http) gets an answer, and no other address does: not a look-alike (`sofix.example.evil.example`), not plain http for the https app, not https on localhost, not sorare.com's own pages, not a bad URL, not a missing one. The app names a step, never a query: five steps, each turned into one fixed Sorare question (`SofixMyLineups`, `SofixFixtureLineups`, `SofixPreviewLineup`, `SofixSaveDraft`, `SofixConfirmLineups`); a step that is not in the table gets no answer and asks Sorare nothing, including names an object has by itself (`__proto__`, `constructor`, `toString`). No other address can start the two steps that write. A draft is always saved as a draft, and an input is cut to what a lineup can hold (12 slots, 8 lineups). Proved by breaking the worker twice (every address accepted: 2 tests fail; `in` instead of `Object.hasOwn`: 1 fails) and restoring it. Not done: a test in a real Chrome with the extension loaded. |
| 7.5 | done | The manual's "Reading freshness and errors" table (section 13) now has a row for each way Apply can stop, in the words the app uses ("sorare.com isn't open", "The tab needs a reload", "You're signed out of Sorare", "Sorare didn't answer", "That didn't go through", Sorare's own refusal in red) and for the extension gone ("not seen lately", SIGN IN or OFFLINE): what happened and what to do. Each says whether anything was saved: nothing was. Read from `lib/apply.ts` (`cannot`) and `lib/control.ts` (`chainOf`), not from memory. |
| 7.3 | pass, on production | `lib/cards.ts` now steps at 20/35/50/60/75 on the score as the hexagon draws it (rounded), six colours instead of eight, so a 76 to 79 is cyan on the board as it is on Sorare (it was green). `lib/overlayCore.test.ts` holds the band of every whole score from 0 to 100 equal to the overlay's `scoreLevel`, so the two cannot drift. Checked: 573 unit tests, typecheck, lint, the My cards browser tests, CI (#22). On production (2 Oct 16:02, 90 seconds after the merge): /cards draws 293 hexagons, every one in the colour of its band by the new rule (0 mismatches; 147 yellow, 101 lime, 21 green, 18 orange, 6 red; the page was drawing the old colours for 44 of them a minute earlier). No hexagon of yours is above 75, so the cyan band is checked by the unit tests only. |

### Batch 8 · 2 Oct 2026 · started

| Step | Result | What was seen |
|---|---|---|
| 8.1 | pass | `early.choose` counted "the next four rounds" by round number, so a postponed game (its old, low number, played later) took one of the six-hour slots from a round a week off. It now counts by date. A test with a round 5 played on 20 December fails before the change and passes after. Refresh #48 (after the merge, commit 325c45c) ran clean: no warning in the log, `planned` empty (every early plan was fresh), the Sorare step 154 s. No page changes until a round is postponed. |
| 8.2 | kept as a note | Sorare opens about three weeks at a time; a fourth open week gets no plan, by design, until one closes. Nothing to build unless you want a fourth planned. |
| 8.3 | waits for the live look | The rank on a pick list starts from any short text beginning "Select your". Tightening it to Sorare's real slot names needs the real headings, which nobody has read off a live page yet (S7 lists them as unchecked). Step 0.2 asks you whether #1 to #3 show on a "Select your …" list; if one does not, the exact heading text is what is wanted. |
| 8.4 | answered: not possible | Futbol Fantasy's round page sends no `ETag` and no `Last-Modified`, and `Cache-Control: no-cache, private` with `max-age=0` (two `HEAD` requests, four seconds apart). Nothing to ask conditionally; the reads stay as throttled as they are. Recorded as Q4 in [futbolfantasy.md](futbolfantasy.md). |

### Batch 9 · 3 Oct 2026 · release 0.3.2 merged; the live look waits for your Reload

PR #30, merged 3 Oct: CI #117 green (frontend 36 s, backend 55 s, 175 browser tests), Vercel deployed, refresh #53 started by hand on the merge commit
(`success`, about five minutes). Each new test was seen to fail for the right reason before the change (the reader returned `{}`, Celta's key did not match,
the plan was asked without a week); the two new browser tests fail on the old drawer.

| Step | Result | What was seen |
|---|---|---|
| 9.1 live FF reads | **done, seen live 4 Oct** | `ffPlayersOf` ignores case; the test uses text copied from the real page. Checked by hand on the real page of match 22493 before the change: 0 of 45 players; after, 45, and Oblak (player 1826) reads 0.95 as the app says. **Live, after your Reload (Control: v0.3.2), round 8's compose page, 01:27 Madrid:** the panel says "FF live just now (01:27)", and ten of the 11 tiles take their start chance from Futbol Fantasy ("He starts 95% of the time (FF)": 95, 95, 95, 95, 95, 95, 20, 5, 5, 70%); the eleventh is Sofix's (11%). |
| 9.2 the tab's week | **done, seen live 4 Oct** | The tab asks for the week the address names; the worker keeps one plan per week; the app answers "Sofix holds nothing on this gameweek." in words for a week it does not hold (the tab used to read that silence as "not reachable"). **Live:** the Sofix tab says "YOUR GAMEWEEK 21 · 2734 xScore · 9 lineups · reward chance 88% · essence expected ≈568 · cards used 66 of 98". |
| 9.3 Celta | **done, seen live 4 Oct** | One alias, and a test holding all 20 LaLiga club names Sorare uses. **Live:** all 11 tiles of round 8's goalkeepers show a difficulty (48, 91, 43, 53, 55, 28, 78, 55, 55, 53, 68) and none says "No odds". |
| 9.4 the "comes on" score | **done, seen live 4 Oct** | Refresh #53 wrote `on` for all 84 GW21 players (read-only `SELECT`): Soria 42.0, Oblak 42.0, Altay 40.3, beside the old `bench` (0.8, 0.8, 7.0), which stays for older payloads. The backtest ([xscore.md](xscore.md) P7): no candidate was clearly closer than today's substitute score on 712 appearances, so the number is unchanged; the panel's tab is "Comes on". **Live:** on a goalkeeper with a 20% chance of starting the panel's two tabs are "Starts" (42 if he starts, 20% START · FF) and "Comes on" (42 if he comes on, 1% COMES ON). |
| 9.5 the opponent, keepers | **researched; waits for your call** | 637 starts by 20 keepers. The strongest sides lower a keeper's score by 4 to 6 points; today's number is 4.0 too high against them; a better number (the keepers' average plus 35% of the game's effect plus his own level) is closer than today's by 31 points squared [-49, -14] over all starts, but it flattens keepers (Oblak 62 → 51, Dituro 35 → 49). Ship, wait, or leave as it is: [xscore.md](xscore.md) P8, "Results, keepers". Research script: `backend/reports/experiments/keeper_opponent.py`. |

**Done 4 Oct 2026:** you pressed Reload (Control says v0.3.2), and the four checks that were left were made on round 8's compose page in your Chrome, read only
(no Sorare button pressed): the panel says "FF live just now" (C19), the Sofix tab says "Your gameweek 21" (R26), every tile shows a difficulty instead of "No odds",
and the panel's second tab reads "Comes on" with a score of 42.

### Batch 10 · 4 Oct 2026 · 10.1 to 10.4 done (10.2c waits for 10.5) (the plan is merged; PR #34)

Your "push everything, make the app up to date, then start with the plan" of 3 Oct night. Before it: PR #34 (the ten upgrades) and PR #35
(your two unpushed lineups commits, with the one test their redesign broke: the visible "Read N min ago" line became an info icon's card)
were merged, your main folder was fast-forwarded to `main`, and production serves the new Lineups.

| Step | Result | What was seen |
|---|---|---|
| 10.1 the data | **done** | `app.jobs.export_games` (resumable, two keyless questions a game, pages of 35: 50 is over the limit) read **449 played LaLiga games since 1 Aug 2025, 29,094 player rows, 9,878 starts, 28,958 with Sorare's projection and grade, in about an hour, none failed**; `app.sorare.gamedata` joined each to the football model's forecast, football-data.co.uk's shots, cards and over/under prices and both official elevens: 449 of 449 each, no club unmatched. Findings (P9 progress): scoring version 7 in both seasons and the new all-around column in force (95 of 96 stats exact; a keeper's goal conceded is −5, not the picture's −3); an upcoming game lists its players but carries no projection; over/under is already in the odds read; a keeper almost never comes on (4 of 902). 19 tests. |
| 10.2a today's formula on every LaLiga player | **done** | `app.jobs.league_replay` → `backend/data/audit/replay_league.json` (numbers only). The tile's "if he starts" is within ±7 on **30%** of 9,878 starts (miss 14.5), "if he comes on" within ±7 on **60%** of 4,264 appearances (miss 7.9); Sorare's own projection is within ±7 on 33%, today's number is nearer in 45% of games, and the two are as good as each other (P6 answered on history). The league pair figure is 76% but counts unused players, so it is not the owner's 66%. P8 rerun on 829 starts by 33 keepers: the same conclusions, firmer. 7 tests. |
| 10.2b Futbol Fantasy's chances for every player | **done and checked on production (refreshes #70 and #71, 3 Oct night)** | `app/sorare/ff_chances.py`, and the Sorare step writes it beside the Lineups page. Read-only `SELECT`s after refresh #70 (run by hand on the merged code): `ff_chances` holds **10 matches, 36.8 KB**, each side 22 to 28 players with their chance and 2 to 6 absentees; the run's summary says `chances: written 10`, nothing failed. First version: `atLock` was empty, because round 8 belongs to GW21, not yet the planned week; now each match takes the gameweek its kick-off falls in (from every gameweek of the season in the snapshot), so the reading at the lock is kept from the first run. **Refresh #71** (by hand on the fix, 23:19 to 23:24 UTC): all 10 matches have `gw` = GW21 (`football-9-13-oct-2026`) and an `atLock` reading of 23 to 28 players a home side, `chances: written 10`, nothing failed; each refresh until the lock (Fri 9 Oct 14:00 UTC) replaces it, then it is frozen. 10 tests (both readings, the freezing at the lock and at the kick-off, a later gameweek, none, and that a failure here still publishes the page). |
| 10.3 keepers | **done and checked on production (PR #39, refresh #73 by hand, 4 Oct 12:15 to 12:20 UTC)** | `app/sorare/keeper.py`, fitted and tested by `python -m app.jobs.keeper_fit` (→ `artifacts/keeper_score.json`, `backend/data/audit/keeper_walk_forward.json`). Walk-forward over **738 keeper starts**, 43 gameweeks: the new number's squared miss is **29.4 below today's [−44.6, −13.3]** (typical miss 15.45 against 16.26), it puts the better of two keepers first **54.2%** of the time [51.6, 56.9] against today's **50.1%** (a coin flip) and Sorare's projection's 54.1%, and lands within ±7 on 25.7% (today 25.3%: a start swings between 75 and 35 on the luck of the game). Its chance of a decisive action is honest (said 26.9%, happened 27.0%) and its range holds 79.3% of scores. A keeper's own form and what keepers scored against that club added nothing over the game (P8 confirmed); the football model's raw clean-sheet chance ran 5 points high for keepers (29.7% said, 24.5% happened) and is corrected. 2026/27 alone (138 starts) points the same way but its interval includes zero; the held-out weeks hold no keeper start yet. 35 tests; 849 in all. **Production** (read-only `SELECT`s after the refresh, which succeeded, nothing under `failed`): round 8's keepers now read Soria at Barcelona **45.3** (52 before), Oblak 49.7 (62), Dituro 49.1 (35), Radu and Altay 48.7, Agirrezabala 47.7, Courtois 49.0, Ryan 49.8: the spread of 35 to 62 is now 45 to 50, the Barcelona game lowest of the regular starters; GW20's Oblak (a Scotland game) is untouched at 55.0, so the fallback for a game outside LaLiga works. |
| 10.4 defenders, midfielders, forwards | **done and checked on production (PR #41, refresh #74 by hand, 4 Oct 13:07 to 13:12 UTC; nothing failed)** | `app/sorare/outfield.py`, `scores.py`, `python -m app.jobs.outfield_fit`. Walk-forward over 8,452 starts: squared miss **−42.7 [−53.2, −31.8]** (DEF), **−27.2 [−36.7, −18.0]** (MID), **−30.2 [−39.6, −21.7]** (FWD) against today's; better of two **59.2% / 60.9% / 59.4%** against 54.2% / 57.2% / 55.5%; within ±7 about the same (a forward's 25.2% against 26.6%). 11 tests; 860 in all. **Production** (read-only `SELECT`s): round 8's starts now run 32 to 72 for defenders, 38 to 60 for forwards and 41 to 60 for midfielders (Güler at home to Villarreal 60.4, Mojica at Barcelona 32.3, the lowest); a player whose game is outside LaLiga keeps the old number. |
| 10.6 linked scores and the captain | **done and checked on production (PR #42, refresh #76 by hand, 4 Oct 14:18 to 14:22 UTC; nothing failed, the Sorare step 200 s against 176 s the run before)** | `app/sorare/links.py`, `planner.simulate` and `planner._captain`. Measured on every start: keeper and his defenders **+0.29**, keeper against the other side's forwards **−0.26**, defender and defender +0.16, forward and forward +0.10 (both seasons agree). On 738 lineups of a keeper, two of his defenders and the other side's forward, the real variance of the total miss was 1,469; the independent simulation said 1,306, the linked one 1,458. The captain is the starter (of the best three) that gives the best chance of a reward. 12 tests; 866 in all. **Production:** GW21 carries a plan with a LaLiga lineup at a 37% chance of a reward. |
| 10.5a the panel on Sorare | **done and checked on production (PR #43, refresh #64 by hand, 4 Oct 16:50 to 16:57 UTC; nothing failed).** 74 of your players carry `shape` and 75 `onShape` in the `sorare` read model. Soria for Barcelona: 5.7% chance of a clean sheet or a penalty saved, 75 with one and 44 without, lands between 28 and 62, "Barcelona −4" (the canvas had −8, a placeholder). Extension 0.3.3 waits for your Reload; 34 overlay browser tests green. |
| 10.5b the Players page | **done and checked on production (PR #44, Vercel deploy 4 Oct ~17:40 UTC; no refresh needed, the stat sheets ship with the app).** `/players/david-soria-solis` shows 45 if he starts, 95% to start, the picture (75 · 6% and 44 · 94%, lands between 28 and 62), the sheet with its picker, the dots, his 14 clean sheets of 45 and his next games. The search links to it. |
| 10.5c the Missions page | **built and live (PR #45, Vercel deploy 4 Oct); waits for your Reload of extension 0.3.4 to see data.** `/missions` answers 200 and, with no missions read yet, says to open Sorare's Missions page once with the extension on. Checked on Sorare's real Missions page (read only, 4 Oct): three pickers on the Limited tab (Decisive Picker 200 XP, Interception 2+ and Assist, 50 All-Star Essence each), their fields are what `core.collectMissions` keeps. The ranking is tested on made-up weeks; its first real mission list comes after your Reload. |
| 10.2c the Audit's league figures | **done and live (PR #46, Vercel deploy 4 Oct).** `/audit` leads with the new xScore per position against the old number (GK 54 vs 50, DEF 59 vs 54, MID 61 vs 57, FWD 59 vs 55), week by week (52% to 69%), how close (31% within 7 points; Sorare's projection 33%, the old number 30%), the goalkeepers' chances (27.0% said, 27.0% happened) and who starts, as charts. |
| 10.2c | not started | The Audit shows the league figures and the catalogue's first groups; waits for 10.5's canvas. |

### Housekeeping · 2 Oct 2026

- Your main folder is on `main` at the latest commit. Your old uncommitted drafts are in `git stash list`, named "2 Oct 2026: old drafts of
  work that is now on main"; an older stash ("T7/T8 build, not requested, unfinished") is untouched. `extension/scripts/configure.mjs` was
  run, so the extension's manifest says 0.3.1; Chrome runs 0.3.1 after you press Reload on Sofix in `chrome://extensions`.
- The remote branch `codex/s7-ux-integration-preview` (26 Sep, 188 commits behind `main`) was deleted at your request, with its local copy.
  No remote branch is unmerged now. `codex/s7-overlay` and `codex/ux2-board` exist only inside Codex's own worktrees.

## To start a run

Work through "Next up" from the top, one step at a time, following "How the run works":

1. Look at the calendar first: a dated step due today comes before the next step in order.
2. Ship each step to `main` as AGENTS.md "Shipping" says, write the Results and update "Next up".
3. Stop only at a **Stop**, or for money, credentials, a destructive action, a migration or a choice that is not settled.
