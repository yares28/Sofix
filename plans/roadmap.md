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

## Where things stand (2 Oct)

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

1. **The big number on a card's tile** (needed by step 3.5; it is a design choice, not model work). Today it is the score *if he
   starts*, with his chance beside it. That is why Giorgi's 45 and Oyarzabal's 43 look alike.
   - Recommended: the **expected score** big (his chance × his score), and "45 if he starts · 38 if he comes on" when you
     hover.
   - Or keep it as it is, or show both.
2. **Sorare's projection or ours** (step 3.6): decided with the numbers in front of you, once about 100 of your players have
   been scored with both. Nothing to answer now.
3. **How much a player's national-team games count for a national-team game** (step 3.4): the backtest decides, unless you
   have a strong view.
4. **Read all LaLiga players' history** (about 500 free reads of Sorare's API, step 3.2), not only yours: only if the first
   results are too uncertain to tell changes apart.
5. **Rebuild GW1 to GW16** (approximate: it uses the cards you own today, not the ones you owned then).
   - Recommended: no. The Audit starts from the weeks Sofix recorded.
6. **The Sofix panel on a Sorare player page** (designed in S7, never built): put it on the sorare.com canvas (step 6.1) as an
   option, or drop it.
7. **Retire the old SorareExt** (step 7.6): only on your go.
8. **Every design canvas is a Stop.** You choose before anything new is built: Pro on Play if it needs a new look, the Audit
   page, and the sorare.com sheet and numbers.

## How the run works

- **One step at a time**, in the order below, broken things first:
  1. Read the code the step names.
  2. Write the test that fails first, make the smallest change and run that test.
  3. Run the full checks:
     - backend: `pytest -q`, `ruff check .`, `mypy`
     - frontend: `npm test`, `npm run typecheck`, `npm run lint`, `npm run e2e`, `npm run design`
- **The calendar comes first on its day.** A dated step in batch 2 that is due today is done before the next step in order.
- **Commits and merges:**
  - Commit each step. Use one branch per batch, made from `main`.
  - If another session has uncommitted changes in the main folder, work in a git worktree.
  - Push once per batch. Open and merge the PR in your Chrome.
  - Run the refresh by hand when the backend changed, and wait for Vercel.
- **Check every step on production:**
  - desktop in your Chrome
  - phone width with the mobile e2e project and `npm run design`
  - Open each changed page and read its status code. Next's data cache survives a deploy, so a new build can be handed an old
    payload (see #17).
  - Write the result under Results: date, pass or fail, what was seen.
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
| By Fri 9 Oct, 16:00 (GW21, round 8, locks) | Batch 1 live: the plan frozen at the lock, and the richer record |
| Thu 8 – Fri 9 Oct, once clubs publish their squad lists | 2.1 · the call-up chip, live |
| Fri 9 Oct, the three hours before the lock | 2.2 · near-lock runs; 2.3 · five numbers by eye |
| Fri 9 – Mon 12 Oct, during the games | 2.4 · a match that has kicked off |
| Sat 10 – Tue 13 Oct | 2.5 · round 9 replaces round 8 |
| Tue 13 Oct, evening | 2.6 · the starts settled; the first frozen plan beside its real scores |
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
- **3.3 · Phase P3: rank the errors.**
  - Rank which slice is worst: national-team games, rare starters, two-game weeks, the bench.
  - Re-order 3.4 by what the ranking shows, and write it into xscore.md.
- **3.4 · Phase P4: one fix per refresh.** Each one only ships if it beats today's numbers on the weeks held out (from 1 Oct
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

---

## Results

### Batch 0

- **0.6 · partly done, 2 Oct.**
  - TODO.md's order now points here.
  - [xscore.md](xscore.md), [overlay.md](overlay.md) and [docs/sorare_plan.md](../docs/sorare_plan.md) say which step each of
    their open items became, and S9's "one Sorare GW across two LaLiga rounds" is ticked.
  - Left: the same pointer in [futbolfantasy.md](futbolfantasy.md), which another session was editing when this was written.
- **Seen on /control, 2 Oct:** the Refresh button is there (step 0.1's first half).

### Batch 1

_(none yet)_

### Batch 2

_(none yet)_

### Batch 3

_(none yet)_

### Batch 4

_(none yet)_

### Batch 5

_(none yet)_

### Batch 6

_(none yet)_

### Batch 7

_(none yet)_

### Batch 8

_(none yet)_

## To start a run

Work through this file from the first step not marked done in Results, one step at a time, following "How the run works":

1. Look at the calendar first: a dated step due today comes before the next step in order.
2. Use a branch per batch made from `main`, and a git worktree if another session holds the main folder.
3. Push and merge once per batch, check on production and write the Results.
4. Stop only at a **Stop**, or for money, credentials, a destructive action, a migration or a choice that is not settled.
