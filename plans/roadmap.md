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
| 0.2 | **waits for one click from you** | Tried again on 2 Oct in your Chrome through the extension. Sorare loads there signed in (your gallery, 21 cards), the Sofix stylesheet is in the page and the extension checks in (version 0.3.0, seen a minute and a half before). But the window my tab group opens is **minimized** (position -32000,-32000, size 160 x 28), so Chrome reports every page in it as hidden and draws nothing, and the overlay draws on animation frames, so it stays blank. Screenshots work for a few frames after a load and then time out; a popup opened from that window is minimized too; `resize_window` answers "resized" and changes nothing. I cannot restore a minimized window with the tools I have. **If you click that Chrome window in the taskbar (its tab is "Sorare ...") and leave it in front, the overlay draws and the checklist below can be read from here in about three minutes.** |
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

### Batch 1 · 2 Oct 2026 · done except the look at 1.4 on Sorare

1.2 and 1.3 were merged as #19; 1.4 came in the next pull request.

| Step | Result | What was seen |
|---|---|---|
| 1.1 P0 | **done** (L5 measured by the backtest, L6 answered by Sorare's own rule: `max`) | Findings in [xscore.md](xscore.md) ("P0 findings"): the page's numbers for Giorgi and Oyarzabal are rebuilt to the decimal from their game history; the "45 against 52" comes from a 75% cliff between two kinds of number (F1), club and country games are pooled (F2), Sorare publishes a projection for each game and the model uses one (F3), and the bench score is one or two appearances (F4). L5 (spread by role) was measured by the backtest (starters 52.1 with a spread of 19.1, substitute appearances 40.9 with 12.2); L6 (which of two games counts) is in Sorare's own rules: `multiGameScoreAggregator` is `max` on all 29 leaderboards of GW19, so the best game counts, as the model assumes. |
| 1.2 | **pass, first live freeze, 2 Oct** | GW19 locked at 14:00 UTC. The page it kept was built at 13:56:06 UTC by refresh #46 (started by the near-lock check at 15:55 Madrid, the one tick of it that ran in the three hours before this lock); refresh #47, which I started at 14:01 UTC, wrote `sorare_plan:football-2-6-oct-2026` at 14:01:50 UTC (read-only `SELECT`): 26,592 bytes, 3 plans, 13 players, `builtAt` before the lock and `frozenAt` after it, the week's name and lock as the page had them. Before the lock I read the live page's weeks the same way and they carried the `gameweek.slug` and `lock` the freeze reads. |
| 1.3 | **pass, frozen at the lock** | Refresh #44: `starts` `{'written': 20, 'frozen': 0, 'noted': 14, 'settled': 0}`: the 14 players of GW19 carry their `model` and their games' `info`. After the lock the GW19 record has 15 players, and a sample (Abdul Mumin) still says `model.at` 13:56:06 UTC, the last run before the lock: refresh #47 did not touch it, as the rule says. Each player carries `model` (`mu`, `start`, `bench`, `pPlay`, `pStart`, `pOn`, `source`, `startSource`, `form`, `projection`) and each game its `info` (team, venue, kickoff, opponent, competition). The week after (7 to 9 Oct) is open with 3 players. |
| 1.4 | pass in tests, the look waits for you | A player with two games gets `fixtures` in the app's answer, a small **×2** off the tile's lower corner, "2 games this week, best score chosen" in the tile's name, and both games in the panel with their kickoff in your clock. Checked: unit tests for the answer and for the panel's lines, the overlay e2e on the fixture page (a one-game tile has neither), the design check (13 previews) and the whole browser suite at desktop and phone width (163 passed). Extension 0.3.1: Reload Sofix in `chrome://extensions`. I could not look at it on Sorare itself (see 0.2). |

### Batch 2 · early finding, 2 Oct 2026

| Step | Result | What was seen |
|---|---|---|
| 2.2 (early) | **the near-lock runs mostly do not happen** | "Refresh near a lock" is written to run every 30 minutes. GitHub started it 6 times in 26 hours (1 Oct 08:21, 15:44, 21:17; 2 Oct 01:20, 04:26, 10:51), none in the three hours before today's 16:00 lock, and the 14:07 scheduled refresh did not run either (scheduled runs on a quiet public repo are delayed or dropped). The page the lock would have seen was the 10:30 one; I started a refresh by hand at 15:25. The 9 Oct check (2.2, C9) would fail the same way. |
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

### Housekeeping · 2 Oct 2026

- Your main folder is on `main` at the latest commit. Your old uncommitted drafts are in `git stash list`, named "2 Oct 2026: old drafts of
  work that is now on main"; an older stash ("T7/T8 build, not requested, unfinished") is untouched. `extension/scripts/configure.mjs` was
  run, so the extension's manifest says 0.3.1; Chrome runs 0.3.1 after you press Reload on Sofix in `chrome://extensions`.
- The remote branch `codex/s7-ux-integration-preview` (26 Sep, 188 commits behind `main`) was deleted at your request, with its local copy.
  No remote branch is unmerged now. `codex/s7-overlay` and `codex/ux2-board` exist only inside Codex's own worktrees.

## To start a run

Work through this file from the first step not marked done in Results, one step at a time, following "How the run works":

1. Look at the calendar first: a dated step due today comes before the next step in order.
2. Use a branch per batch made from `main`, and a git worktree if another session holds the main folder.
3. Push and merge once per batch, check on production and write the Results.
4. Stop only at a **Stop**, or for money, credentials, a destructive action, a migration or a choice that is not settled.
