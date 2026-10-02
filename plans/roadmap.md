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
- **3.2b · A week-level backtest** (added 2 Oct from 3.3's findings). The first backtest scores single games, which cannot test
  "the best of two". Add rows per player and Sorare gameweek: the plan's expected score for the week against the best score he
  made in it. It needs each game's gameweek (Sorare's own, from `so5Fixtures`, not Monday to Sunday), so the export gains it.
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

### Batch 0 · 2 Oct 2026 · done except the two steps that need you

Merged as #19 together with batch 1's backend steps; refresh #44 run by hand on `main` (5 min 16 s). Checked in your Chrome.

| Step | Result | What was seen |
|---|---|---|
| 0.1 | **waits for you** | The Refresh button is on /control (the key is in Vercel). Pressing it once and what Check, Draft and Enter said are still to be written down. |
| 0.2 | **waits for you** | The tab my Chrome tools get is a zero-size window that reports itself hidden: nothing draws there and screenshots time out, so the overlay on Sorare's pages cannot be seen from here. The checklist is below. |
| 0.3 | pass | Refresh #44 log: no warning, `futbolfantasy` `matches` 10, `read` 10, `failed` absent (refresh #42: `read` 30 and 52 failed pages, two HTTP 404). The Sorare step took 243 s against 449 s, the run 5 min 16 s against 8 min 18 s. The cause was larger than the 404s: the Copa del Rey page's sidebar was read as its matches. |
| 0.4 | pass | Play's lineup sheet on production: 7 cards, 7 silhouettes behind the art. The e2e test holds the art back 3 s and sees the silhouette, then the picture over it. |
| 0.5 | pass | Section 9 of the Futbol Fantasy plan has its results (C1–C21), from refresh #42's log and read-only `SELECT`s. |
| 0.6 | pass | TODO.md, the xScore, overlay and Futbol Fantasy plans and the Sorare tracker point here; S9's "one Sorare GW across two LaLiga rounds" is ticked. |

**For you, 0.2 (about five minutes, signed in on sorare.com with the extension reloaded):** open a lineup or "Select your …" page of a
gameweek with your players. (1) Each card has a tile with a number; hover one: the panel shows the plan chip, Starts / Benched, the
chance with its source mark (FF, SO or SF) and the sources folded. (2) A player outside LaLiga says "LaLiga only" on the Futbol
Fantasy row, and no Spanish word is anywhere. (3) The panel of a card in a lineup shows every card of it, or "+N". (4) On a "Select
your …" list the cards are ranked #1 to #3. (5) The popup's "Cards recognised here" reads "N of N", and on an old week's page "Gameweek
in the address" says a week or "none named". Send a screenshot of anything that is wrong.

### Batch 1 · 2 Oct 2026 · done except the first freeze and the look at 1.4 on Sorare

1.2 and 1.3 were merged as #19; 1.4 came in the next pull request.

| Step | Result | What was seen |
|---|---|---|
| 1.1 P0 | done except L5 and L6 | Findings in [xscore.md](xscore.md) ("P0 findings"): the page's numbers for Giorgi and Oyarzabal are rebuilt to the decimal from their game history; the "45 against 52" comes from a 75% cliff between two kinds of number (F1), club and country games are pooled (F2), Sorare publishes a projection for each game and the model uses one (F3), and the bench score is one or two appearances (F4). L5 (spread by role) waits for the backtest; L6 (which of two games counts) needs a keyed read or an entered lineup with a two-game player. |
| 1.2 | code live, first freeze due | Refresh #44 ran with it (no week had locked yet, so `frozenPlans` is absent, as the test says it should be). GW19 locks today at 16:00 Madrid; the first run after that writes `sorare_plan:football-2-6-oct-2026`. |
| 1.3 | pass | Refresh #44: `starts` `{'written': 20, 'frozen': 0, 'noted': 14, 'settled': 0}`: the 14 players of GW19 carry their `model` and their games' `info`. |
| 1.4 | pass in tests, the look waits for you | A player with two games gets `fixtures` in the app's answer, a small **×2** off the tile's lower corner, "2 games this week, best score chosen" in the tile's name, and both games in the panel with their kickoff in your clock. Checked: unit tests for the answer and for the panel's lines, the overlay e2e on the fixture page (a one-game tile has neither), the design check (13 previews) and the whole browser suite at desktop and phone width (163 passed). Extension 0.3.1: Reload Sofix in `chrome://extensions`. I could not look at it on Sorare itself (see 0.2). |

### Batch 2 · early finding, 2 Oct 2026

| Step | Result | What was seen |
|---|---|---|
| 2.2 (early) | **the near-lock runs mostly do not happen** | "Refresh near a lock" is written to run every 30 minutes. GitHub started it 6 times in 26 hours (1 Oct 08:21, 15:44, 21:17; 2 Oct 01:20, 04:26, 10:51), none in the three hours before today's 16:00 lock, and the 14:07 scheduled refresh did not run either (scheduled runs on a quiet public repo are delayed or dropped). The page the lock would have seen was the 10:30 one; I started a refresh by hand at 15:25. The 9 Oct check (2.2, C9) would fail the same way. |
| 2.2b | **waits for your choice** | Free ways to get a refresh in the last hours: (a) press Refresh on /control before you lock (works today); (b) **recommended:** the extension asks the app to start the refresh when you open sorare.com within three hours of a lock and the page is older than 25 minutes: the one moment you need fresh numbers, using the same key the Refresh button uses; (c) accept the scheduled runs as they come. (b) is a small change to the extension and one route in the app. |

### Batch 3 · 2 Oct 2026 · in progress

| Step | Result | What was seen |
|---|---|---|
| 3.1 | done | The export, the backtest and the command that prints its report are written test first (38 tests on made-up histories; a player built to start for his country and come off the bench for his club shows the error today's model makes). The first export, asking about twice a second, was refused by Sorare's keyless limit after 14 players and then left every player after them out for want of waiting; it now asks once a second, waits out a refusal and asks the same question again, and stops if it is still refused after three waits. Sorare's limit is on the address, not the account, and it let through about 30 players in 14 minutes. The whole history is in: 84 players, 4,647 games, none failed. Numbers: [xscore.md](xscore.md), "Results of P2 and P3". Headline: today's form formula is closer than his last five by squared error (-39.5 [-53.0, -27.4] over 62 weeks) and no closer by typical miss, orders players no better, and says 2.9 points too little in every slice but national games. |
| 3.3 | done | Ranked by the squared error today's model would gain against the best simple baseline: the only loss is regular starters (24.9 against 24.8 for always 45); rare starters, the bench, national games and every position are not the problem. The level is: both the chance of playing (said 68%, was 71.5%) and the score when he plays (said 48.1, was 49.7) are low. The new order of 3.4 is in xscore.md: the level first, a week-level backtest second (a tool for two-game weeks), the rest wait for Track B. |

### Batch 4 · 2 Oct 2026 · research done, at the Stop

| Step | Result | What was seen |
|---|---|---|
| 4.1 | done | [pro.md](pro.md). Sorare's help centre is readable through its public Zendesk API (`sorare.zendesk.com/api/v2/help_center/...`), so no sorare.com page was scraped (sorare.com answered 429 to a browser while the history export was running, and its help pages are rendered by script). Pro is Hot Streaks: Anytime Entry, 4 lives and tries per step, a Step Clock of one league matchday, a Rare Reward Bonus, and cards shared with Arena. The "King's Step", the step count and each step's target and reward are not in the help centre; they are `CareerProStep` fields (`target`, `rewardConfigs`, `state`) for the signed-in owner. |
| 4.2 | done | The gap table is in pro.md: build Pro and its level, later for Super Rare and Unique, skip Rooms and Arcade, check Arena's automatic substitutes against the planner. |
| 4.3 | **Stop, waits for you** | Three questions at the end of pro.md: the scope (recommended: show and value first, plan with it second, Apply for Pro only if you want it), which rarities you play in Pro, and whether Play needs a new look. |

### Batch 5

_(none yet)_

### Batch 6

_(none yet)_

### Batch 7 · 2 Oct 2026 · one step so far

| Step | Result | What was seen |
|---|---|---|
| 7.3 | pass in tests, production check after the merge | `lib/cards.ts` now steps at 20/35/50/60/75 on the score as the hexagon draws it (rounded), six colours instead of eight, so a 76 to 79 is cyan on the board as it is on Sorare (it was green). `lib/overlayCore.test.ts` holds the band of every whole score from 0 to 100 equal to the overlay's `scoreLevel`, so the two cannot drift. Checked: 573 unit tests, typecheck, lint, the My cards browser tests. |

### Batch 8 · 2 Oct 2026 · one step so far

| Step | Result | What was seen |
|---|---|---|
| 8.4 | answered: not possible | Futbol Fantasy's round page sends no `ETag` and no `Last-Modified`, and `Cache-Control: no-cache, private` with `max-age=0` (two `HEAD` requests, four seconds apart). Nothing to ask conditionally; the reads stay as throttled as they are. Recorded as Q4 in [futbolfantasy.md](futbolfantasy.md). |

## To start a run

Work through this file from the first step not marked done in Results, one step at a time, following "How the run works":

1. Look at the calendar first: a dated step due today comes before the next step in order.
2. Use a branch per batch made from `main`, and a git worktree if another session holds the main folder.
3. Push and merge once per batch, check on production and write the Results.
4. Stop only at a **Stop**, or for money, credentials, a destructive action, a migration or a choice that is not settled.
