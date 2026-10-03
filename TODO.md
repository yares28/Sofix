# Sofix · what's left

Two lists: what only you can do, and what I do. Updated 2026-10-03.

The phase plan lives in [docs/sorare_plan.md](docs/sorare_plan.md) and the audit in
[docs/research_report.md](docs/research_report.md); this file is only the open ends.

---

## Order of work

**Moved to [plans/roadmap.md](plans/roadmap.md) (2 Oct 2026).** It merges every plan with steps left into one order, with a
"done when" and a check for each step: T1's xScore plan, the Futbol Fantasy plan's checks, the overlay's live pass, the open
boxes of S4, S6, S7, S8 and S9, T3 to T7, the review's follow-ups and the small things. This file keeps the full text of each
item, what you said and why; the order, the steps and the results live in the roadmap.

---

## To do, from your answers of 3 Oct

Items 4 to 9 of my list of 3 Oct. The three faults the live pass found (items 1 to 3) and your two new model issues (13 and 14) have
plans of their own: [plans/overlay.md](plans/overlay.md) O12 to O14 and [plans/xscore.md](plans/xscore.md) P7 and P8. The order is the
roadmap's batch 9.

### A · The extension updates itself, so you never press Reload again (item 4)
- **The issue.** Every new version waits for you to press Reload on Sofix in `chrome://extensions`. The Chrome tool I use only opens web
  pages: it turns `chrome://extensions` into `https://chrome//extensions`, and Chrome blocks automation on its own pages anyway.
- **The fix.** The extension looks at its own version file in your folder once a minute and reloads itself when the one on disk is newer
  than the one running. After a merge I update your folder (pull, then `node extension/scripts/configure.mjs`) and the new version runs
  within a minute. No new permission, nothing downloaded: Chrome loads it from your folder as it does today.
- **What it needs from you.** One last Reload, for the version that brings it. After that, none.
- **When.** Release 1 (roadmap 9.7).

### B · The big number on a tile follows his chance of starting (item 5, decided 3 Oct)
- **Your rule.** Futbol Fantasy's start % is the main one (else Sorare's, else Sofix's). Under 40%: the big number is his score if he comes
  on from the bench. 40% or more: his score if he starts. The panel keeps both.
- **Why it waits.** Today's "benched" number is not a score (a keeper's is 0.8): it is fixed first, in P7 (item 13). Under 40% the tile
  also shows his chance of coming on, so a keeper at 5% who comes on 2% of the time is not read as a good pick.
- **When.** Release 2, with P7 (roadmap 9.6).

### C · Fresh numbers before a lock: why the near-lock refresh did not run (item 6)
- **The answer.** GitHub did not start it; our check never got the chance. It is set for every 30 minutes, so about 84 runs from its first
  one (1 Oct 06:21 UTC) to 2 Oct 23:56 UTC; GitHub started **9**, 3 to 7½ hours apart, none between 08:51 and 15:24 UTC on 2 Oct, and the
  lock was at 14:00. The regular refresh is late the same way: **every scheduled run since 22 Sep has started late, the night run 2 to 3½
  hours and the daytime runs 2 to 8 hours.** On 2 Oct the 12:07 UTC run, meant for two hours before the lock, started at 17:49, after it.
  GW19's frozen page was fresh only because the 07:17 morning run happened to start at 13:55 and I started one by hand at 13:25.
- **Why GitHub does this.** Its own documentation: scheduled runs are delayed when it is busy, and some are dropped. On a free public
  repository there is no guarantee. Its status page shows an "Actions Job Delays" incident on 1 Oct and nothing on 2 Oct, so this lateness
  is its normal service here, not a one-off.
- **The fix: decided 3 Oct, the first way.** The three free ways were:
  - **Recommended:** the extension asks the app to start a refresh when you open sorare.com in the last three hours before a lock and the
    numbers are over 25 minutes old, and the app does the same when you open Sofix then. That is exactly when you need fresh numbers,
    and it uses the same key as the Refresh button.
  - A free outside clock (for example cron-job.org) that calls the app every 30 minutes before a lock: on time even if you open nothing,
    but it needs an account that only you can create, holding a secret link.
  - Pressing Refresh on /control yourself before you lock.
  The cron minutes also move off the busy :00 and :30 (a small help, not a fix).
- **Until it ships** I start a refresh by hand before round 8's lock (Fri 9 Oct, 16:00 Madrid) and one after it.
- **When.** Release 1 (roadmap 9.8), built as the first way.

### D · Pin GitHub's machine version before 19 Oct (item 7, approved 3 Oct)
- **The issue.** The three workflow files say `ubuntu-latest`, which becomes Ubuntu 26 on 19 Oct, so the refresh could break that day.
- **The fix.** `ubuntu-24.04` in `ci.yml`, `refresh.yml` and `near-lock.yml`. Free.
- **When.** Release 1 (roadmap 9.9), before 19 Oct.

### E · Your Apply result, and one press of Refresh (item 8) — *paused by you on 3 Oct*
- **What Apply is.** On Play, **Apply plan** puts Sofix's lineups into Sorare through your own signed-in tab, in three presses: **Check**
  (Sorare says whether the lineup is allowed; nothing is saved), **Save as a draft** (saved on Sorare as a draft, not entered), **Enter**
  (the only press that enters the competition).
- **What is missing.** On 2 Oct you said you had done it, but not what each press did. One line is enough: did all three work? If one did
  not, which one and what Sorare said, and what happened if your session had run out.
- **Why it matters.** It is the last check of the Apply flow (S6), and the old SorareExt extension can only be retired after it (7.6).
- **Refresh.** Press **Refresh** on /control once: a run starts in GitHub's Actions, the button waits out its 10-minute pause, and the page
  updates when the run ends. That closes the Futbol Fantasy plan's S6. I can press it from your Chrome instead if you prefer.
- **When.** Paused: nothing waits on it except retiring SorareExt (7.6), which is paused with it.

### F · The overlay answers only for your account, and an old extension says "reload" (item 9)
- **The issue.** The extension does not check that the Sorare account signed in on the tab is yours. And if the app's answer changes and the
  extension is older, the tiles could show wrong numbers without saying so.
- **The fix.** The extension reports the nickname and the account id of the signed-in Sorare account and the app answers only when it is
  yours (tested both ways: another account gets nothing, and your own tiles are never blanked by a wrong guess). The extension sends its
  version, and when it is older than the app needs, the tile reads "Reload" instead of numbers. With A, that should almost never show.
- **When.** Release 1 (roadmap 9.10, formerly 7.1 and 7.2).

## Paused

Not buildable now. Each starts again when its data exists, and I ask you first.

- **The xScore's level** (item 10, roadmap 3.4). It says your players play 68% of the time (they play 71.5%) and score 48.1 when they play
  (49.7). A fix (starting points of about 70% and 49) beat today's on the weeks it was tuned on, and it ships only if it also wins on games
  from 1 Oct onward, of which there is almost none. P7 and P8 come first.
- **The Audit page's other figures** (item 11, roadmap 5.2): each needs 100 checked games per source. GW19 gives the first counts from
  Wed 7 Oct, round 8 the first figures from Wed 14 Oct. The page fills what it has by itself.
- **The frozen plan, scored** (item 12, roadmap 5.3 and 5.4): whether "30% reward chance" came true about 30% of the time. It needs the plan
  frozen at GW21's lock to have been played: from Wed 14 Oct.
- **T3 · Pro** (paused by you on 2 Oct; [plans/pro.md](plans/pro.md)).

---

## Yours

### 1 · The live Apply acceptance test — blocks retiring SorareExt
The one thing no test can stand in for, because it needs your signed-in Sorare tab.

- sorare.com open and signed in, then in Sofix: **Play → Apply plan**.
- Walk it: **Check** → **Save as a draft** → **Enter the competition**. Check writes nothing, a draft is
  reversible, only Enter spends a slot.
- Write down what Sorare said if it refused anything, and what happened if the session had expired.

Until this passes, `SorareExt` stays. There is no data gate here — you can do it today.

**Reported done on 2 Oct.** What Check, Draft and Enter did is written down in the roadmap's step 0.1 once you say it (above,
"To do, from your answers of 3 Oct", E).

### 2 · A Refresh button — **done 2 Oct** (the button shows on /control; the roadmap's step 0.1 presses it once)
`GITHUB_TOKEN` is not missing from your `.env`; it never existed. It is a GitHub key you'd **create**,
and its only power is starting this repo's refresh workflow. Refreshes already run on a clock without it —
the key only adds a button that starts one early. The FF plan (step S6) counts on it, so that you can pull
Futbol Fantasy's latest lineups just before a lock.

The app walks you through it: **/control → "A Refresh button"**. Two steps, both pre-filled links (create the
key with repository access limited to Sofix, then add it to Vercel as `GITHUB_TOKEN` and redeploy).

### 3 · Install the PWA
Chrome address bar → install. Not blocking anything.

---

## Mine

### Now · fix what's broken (batch 1, planned 2026-09-29)
From your first live look at the overlay and the issues you listed with it. Each step ships on its own and only
on your go: local checks → push to `main` → one Sorare refresh → you look at it on your pages.

**Status 2026-09-30:** steps 0–6 are pushed (`b84c6ba`), Vercel's production deployment of that commit is READY, and
a refresh has written what they make (early plans `sorare_ahead:*`, the kept week `sorare_week:*`, `start_chances`,
`futbolfantasy`; all updated today). "Local", "Done, local" and "Fixed locally" in the notes below mean "as built, before
it was pushed". What is left is your look at the pages, and the overlay's second live pass.

0. This file: every other issue written down in full ("Next, one at a time", below).
1. **CI is red on `main`.** Two Play tests look for GW15 in the week panel, which shows one month at a time; near
   a month's end the week they want sits in the other month. A test fix; the app is right. *Done, local.*
2. **Play lists every week again.** Since `e5a7154` (28 Sep) Play lists only the weeks Sorare has opened, so the
   later ones vanished. *Done, local.*
3. **Past weeks are kept, and complete.** Wanted for every played week: the lineups you entered with their score and
   reward, what Sofix's plans expected, and the best lineups in hindsight with what they would have won.
   *Built, local:* every week of the season is in the picker (the sync pages Sorare's list back to Game Week 1);
   your entered lineups show their score, rank and rewards for any week, read from Sorare through the extension
   (0.2.2); a finished week is replayed once its scores are final, with its best lineups in hindsight, and written
   to its own row (`sorare_week:<slug>`) so it can be opened for as long as the season lasts. *Not built:*
   - **Weeks played before this** (GW1 to GW16 on 29 Sep) are "not recorded": Sofix has no plans or hindsight for
     them, only what Sorare says you entered and won. Rebuilding them from Sorare's history is possible but
     approximate (see "Old weeks, rebuilt", below); say if you want it.
   - **The plan as it stood at the lock.** A kept week's "expected" is a replay from form as it stood before the
     lock, not the Sorare-informed plan you saw then. Freezing the plan at the last run before the lock, and showing
     it beside what happened, is a follow-up (below).
4. **Plans for weeks Sorare hasn't opened yet**, any LaLiga round to the end of the season (you asked about GW36,
   16 May 2027): planned from form with the competitions of the last comparable week, and saying so. Sorare's own
   game weeks are only created a few weeks ahead (its furthest on 29 Sep is GW24, 20–23 Oct), so the calendar leads.
   *Built, local:* each such round opens as an early plan (one plan, a note saying what it is built from, no Apply);
   its window is the one Sorare will most likely draw, and Sorare's own numbers replace it when the week opens.
   *Limits:* only LaLiga cards are placed (a card at another league or a national team has no game there); the
   competitions are those of the week being planned, which Sorare may change; far-out dates are provisional.
5. **The overlay fixes your live test showed** (next entry): the odds row, the #1–#3 ranks, a start % on every
   tile, "No xG", and old weeks' pages showing this week's numbers. *Built, local:* the odds bar is found up to half a
   card's height down, the list title by its text, the start % on every tile, "No xG"; and a page whose address names a
   Sorare gameweek ("football-25-29-sep-2026") now gets that gameweek's numbers, or none. That last one is a guess about
   Sorare's addresses: the popup's new **Gameweek in the address** row tells you whether they carry it.
6. **Start collecting Futbol Fantasy's starting %** (nothing on screen yet), so T2 can compare it. *Built, local:*
   every run writes down, for each of your players with a game, what Sorare, Sofix (from form alone) and Futbol Fantasy
   say his chance of starting is; the site is asked at most every six hours (every 45 minutes just before a lock);
   numbers freeze at the lock and are settled a day after the week ends. `python -m app.jobs.starts` scores the sources.
   No table or migration: it is one read model, so nothing for the unattended refresh to trip over.

### Check the overlay on your own Sorare pages — *first live pass done 2026-09-29, second 2026-10-03*
Your Sofix numbers are drawn on Sorare's own cards (a tile with the score if he starts, plus difficulty or xG), and
an edge tab opens your gameweek's plan. Built from [plans/overlay.md](plans/overlay.md) (O7 to O11); automated proof
is `frontend/e2e/overlay.e2e.ts`.

**Second pass, 3 Oct (by me, in your Chrome, extension 0.3.1).** On round 8's "Select your Goalkeeper" list everything you asked for
works: a tile on every card with its FF or SF mark, amber and red chances, ticks, stars, #1 to #3, the panel with its chip, Starts /
Benched, "START · FF" and folded sources, "LaLiga only" outside LaLiga, no Spanish, and numbers equal to the database. Three faults, planned
as O12 to O14 (roadmap 9.1 to 9.3): the live Futbol Fantasy read finds no player (a matter of capital letters), the Sofix tab shows the
week being planned instead of the page's, and every Celta game shows "No odds" (Sorare's "Celta de Vigo" never meets the board's "Celta").
The old-week question is answered: Sorare's addresses carry the week. Details in the roadmap's Results (0.2) and in overlay.md.

**What your first pass showed** (six screenshots: "Select your Forward", "Select your Extra", the compose page, the
Classic All Star lineup, the gameweek sheet, the edge tab):

- **Worked.** Every card got a tile. The best plan's cards got ticks and its captain (Arda Güler) the star. The
  hover panel read "43 if he starts · 54% he starts · Expected goals 0.24 · Win chance 77%" for Oyarzabal.
- **No #1–#3 on "Select your Extra"** (seven cards). The ranking only trusts a real heading element (h1–h4); Sorare's
  "Select your ..." is probably styled text. Batch 1, step 5. *Fixed locally: the title is found by its text.*
- **No Sofix odds row anywhere.** It looks for Sorare's odds bar only 60 px under the card; on Sorare the bar is the
  third row of the block under the card, about 75 px down. The test page had put it 6 px under the card, which is
  why the tests passed. Batch 1, step 5. *Fixed locally: it looks half a card down, and the test page now has that block.*
- **The start % only on some tiles** (Espino 26%, Mumin 11%, but none on Rațiu): it was drawn only below 50%. You
  want it on every tile, from Sorare when it has one and the app's otherwise. Batch 1, step 5. *Fixed locally: the
  bottom row of every full tile; the tile is 44 × 50.*
- **"NO ODDS" on Gumbau** (Granada, Segunda) while Sorare showed odds for his game (37 / 29 / 34): the label meant
  "no expected goals", since Understat doesn't cover his league. You chose **"No xG"**. Batch 1, step 5. *Fixed
  locally.*
- **Old weeks' pages show this week's numbers**, and some cards there have none: the extension never tells the app
  which week a page is about. Batch 1, step 5. *Built locally, on a guess:* the extension reads a gameweek out of the
  page's address when it carries one ("football-25-29-sep-2026") and the app answers for that week, from the copy it
  kept, or with nothing. Whether Sorare's addresses carry it is what your pages will say: open an old week's page
  and read the popup's **Gameweek in the address** row. "none named" means they don't, and then the gameweek has to be
  read from the page itself.

To look again after a fix: `node extension/scripts/configure.mjs`, **Reload** Sofix in `chrome://extensions`, then
reload your sorare.com tab. The popup's **Cards recognised here** should read "N of N".

Not built (designed in S7, not in the plan): the big "Sofix panel" on a player page. Not enforced yet: matching the
signed-in Sorare account to the owner (numbers are gated by the extension's token).

### Calibrate reward probabilities and correlated outcomes — *blocked on the same data as T1*
Whether the stated reward odds match what actually happens, and whether picks in one lineup move together.

### Retire SorareExt — *blocked on your item 1*
Only after the live acceptance test passes and the recovery steps are written down.

---

## Next, one at a time (after batch 1)

Each gets its own plan when its turn comes; they are written down in full here so nothing is lost.

### T1 · The xScore: find out why some predictions look wrong, then fix the model
Issue 2 of your list, with two of its edge cases (two games in a week, "doesn't start"). It replaces "Fit and
blind-test the Sorare xScore model".

**Plan: [plans/xscore.md](plans/xscore.md), started 2026-09-30.** *3 Oct: your two new issues are planned there.* **P7, the bench
score:** the panel's "Benched" number is the chance he comes on × a substitute's score (0.8 for a keeper), not the score he gets when he
comes on, which is about 40 (a substitute starts at 35, like a starter). **P8, the opponent:** Soria's "52 if he starts" against Barcelona
is the average of his own last five games; no score depends on the opponent today, and keepers this season scored 33 against Barcelona,
Real Madrid or Atlético and 51 against the rest. Findings so far, from the code and a read-only count of
production:

- **There is almost nothing to backtest on yet.** `sorare_forecasts` holds 3 gameweeks, 30 rows, 11 scored, and none of
  its rows has Sorare's starter/substitute odds. The backtest below therefore starts from Sorare's per-game history
  (form only, walk-forward) and adds the comparison with Sorare's projection when about 100 scored players exist. The
  record also lacked the competition, minutes and start/bench split; P1 now adds them in a read model, so no migration (2 Oct).
- **The big number on a tile is "if he starts", not the expected score.** That alone makes Giorgi 45 / Oyarzabal 43 look
  alike. Question for you (plan §6): should the big number be the expected score instead, or both?
- **Two leads are very likely:** a player with no start in his last five gets Sorare's projection as his start score
  (Giorgi's 45), and Oyarzabal's 54% is the form formula on five mixed club and national games (3 starts in 5 gives
  exactly 54%), not Sorare's odds. Both are to be confirmed in P0.
- **Correction to the edge case below:** plans already count a best-of-two bump for two games; the tile does not, says
  nothing about two games, and the bump reuses one game's numbers.
- **Confirmed from Sorare's help page:** a starter and a substitute who comes on both begin at 35; levels above 0 have
  a guaranteed minimum. Which of two games counts is not on that page ("Best score chosen" is what Sorare's lineup screen
  says) and is checked in P0.
- **P0 done on 2 Oct** (details and numbers in [plans/xscore.md](plans/xscore.md), "P0 findings"). The page's numbers for the two players
  were rebuilt from their game history and match to the decimal. (1) The two "very likely" leads are half right: Giorgi's 45 is **not**
  Sorare's projection (that is 47; his 45 is his own three recent starts pulled towards 51), but Oyarzabal's "% he starts" is the form
  formula (4 starts in 5, 68.6% now), and Sorare gave no starter odds at all (0 of 14 players in the last run). (2) The real reason the
  pair looks wrong: "if he starts" is Sorare's projection for a player who starts 75% of the time or more and his own smoothed starts for
  anyone else, so Oyarzabal shows Sorare's 52 (his four recent starts scored 37.2) and Giorgi his own 45: two different kinds of
  number, a cliff at 75%. (3) Club and country games are pooled: Oyarzabal's eight games for Spain this summer averaged 55, his LaLiga ones
  44. (4) Sorare publishes a projection for each game; the model reads one per week. (5) The bench score rests on one or two substitute
  appearances: one goal in 35 minutes puts Oyarzabal's at 48 and Giorgi's 30.6 at 38. Still open: the spread by role (needs the backtest)
  and which of two games Sorare counts (needs an entered lineup with a two-game player, or a keyed read).

**What you said.** "How does Giorgi have an xS of 45 and Oyarzabal 43? The xS has to have more depth: depending on
the competition a player can have different xGs. Oyarzabal has had a weird start of season, but with Spain he always
does something, and if he starts he can have a very good game. In LaLiga Giorgi rarely starts compared to
Oyarzabal, and often has worse games. We need a deep dive to find the issues and edge cases in the xS algorithm."

**The example** (GW19, an international break):

| Card | Sofix tile | Sorare's own number | Game(s) this gameweek |
|---|---|---|---|
| Giorgi Tsitaishvili, FW | 45, xG 0.31 | 45 | Georgia away at Hungary (Fri 20:45; Hungary 47%, draw 28%, Georgia 25%) and away at Northern Ireland. Sorare: "Best score chosen" |
| Mikel Oyarzabal, FW | 43, xG 0.24, 54% he starts | 43 | Spain v Czechia (Sat 20:45; Spain 77% to win) |

The other cards that week, Sofix / Sorare: Rațiu 47 / 50, Espino 45 / 46, Starfelt 46 / 45, David López 49 / 42,
Mumin 38 / 35, Gumbau 53 / 52, Mittelstädt 63 / 67, Radu 46 / 48, Grimaldo 65 / 52.

**First lead, to verify before anything else.** For Giorgi and Oyarzabal our number *is* Sorare's. The forecast
table marks a player's numbers `source = "sorare"` when they come from Sorare's projection, which suggests that when
Sorare projects a player, the tile's "if he starts" score is Sorare's projection passed straight through. If so, the
question for those players is "is Sorare's projection wrong, and should Sofix overrule it?" Check in
`backend/app/sorare/forecast.py` and `publish.py` (`player_weeks`).

**How Sorare scores**, as you described it (to confirm against Sorare's help centre before building on it):

- A player who plays gets a **decisive score** plus an **all-around (AA) score**. The decisive score starts at 35
  (level 0); each positive decisive action (goal, assist and the like) lifts it a level: 60, 70, 80, 90, 100.
  Negative decisive actions lower it.
- With a positive decisive level, the AA can't take him below that level: a goal means at least 60. At level 0,
  negative AA can take a 35 down to 0.
- The total stays between 0 and 100.
- A sub who comes on starts at 35 + AA, so even a last-minute sub who does nothing scores about 35.
- For a sub, what matters is his **AA per minute** and his **decisive actions per minute**: coming on at 70' leaves
  about 20 minutes to add AA, and a player with a high decisive rate may score and finish on 60 or more.
- When a player has two games in one gameweek, only his **best** score counts ("Best score chosen" on Sorare).

**Edge case · two games in one gameweek.** Sofix uses only one of his games and shows nothing to say there are two.
Wanted: the expected *best* of the two scores (always at least as high as either game alone), "2 games" on the tile,
both games in the panel, and plans that count the week that way.

**Edge case · "Doesn't start" is wrong.** Today it is one blended number from flat assumptions in `forecast.py`
(`PRIOR_SUB_SCORE = 42`; a 30% chance of coming on for an outfielder, 2% for a keeper). Wanted: his own chance of
coming on and, if he does, about 35 + his AA per minute × the minutes he usually gets + the chance of a decisive
action, with the floor rule. Shown as two plain numbers, e.g. "if he comes off the bench ≈38 · 60% he comes on".

**Competition matters.** A player's score, minutes and chance of starting can differ between his club and his
national team, and between league and cup. Keep them apart. Today a national-team game uses his club xG, unscaled.

**What there is to measure with.**
- `sorare_forecasts` (Neon): for every player and gameweek since recording began, what Sofix and Sorare predicted
  before the lock (our score if he plays, our chance he plays, Sorare's projection and play odds) and what he
  actually scored.
- Sorare's per-game history (`sync.py`, HISTORY): score, started, minutes. Not fetched yet: the decisive/AA split
  per game (the field names in Sorare's API are still to be confirmed).

**How.** (1) A backtest first: Sofix vs Sorare's projection vs simple baselines, on every recorded gameweek, with the
error split by club vs national team, starter vs sub, position, one vs two games, and how much history the player
had. (2) Fix what loses, one change at a time. (3) Ship only a change that beats today's numbers on weeks it wasn't
fitted to.

**To ask you when it starts.** Should Sofix overrule Sorare's projection when the backtest says ours is better? How
much should a player's national-team form count for a national-team game?

### Old weeks, rebuilt (follow-up to batch 1, step 3)
Only if you want them: GW1 to GW16 are "not recorded". Each could be rebuilt from Sorare's history: that week's
competitions and the scores that paid (about a hundred calls a week, so a few weeks per run over a couple of days),
your players' scores in it (their history is already fetched for the last ten weeks), and the **cards you own today**,
since which cards you owned then is not recoverable. The results are honest but approximate: "what these cards could
have won", not "what you could have won". Expected results would be a form-only replay, marked as rebuilt.

### The plan as it stood at the lock (follow-up to batch 1, step 3)
At the first run after a week locks, the page still holds the plan Sofix built for it before the lock, with Sorare's
projections. Freeze that as `sorare_plan:<slug>` and show it in the kept week's "Before the lock" view, beside the
replay, so "what Sofix said" and "what it would say from form" are both there. Scoring that frozen plan against the
real scores needs the planner's lineups rebuilt from the saved cards, which is the larger half of the work.

### T2 · Futbol Fantasy's lineups and start % in Sofix
**What you said (29 Sep).** "Get the starting % from Futbol Fantasy
(https://www.futbolfantasy.com/laliga/equipos/barcelona), add a scrape of every team's expected starting % to the
run workflow, and compare it with the app's and Sorare's to find the most accurate."

**What you said (30 Sep).** "The FF odds of starting only affect the next game for that team, and change about a day
after that team played. I want FF's full lineups to show on Sofix, and the players I have will get FF's starting % as
the main %, falling back to Sorare's and then the app's (statistically, Sofix has the least information on injuries and
starting of the three). You'll have to test it on their next LaLiga game. A new lineups page and a new section under
'Sorare' on the home page; I want to decide the styling before implementation using /design. The overlay has to work
the same way."

**Plan: [plans/futbolfantasy.md](plans/futbolfantasy.md), rewritten 2026-09-30 with your answers** (FF everywhere,
including xScore and plans; every match on the page; LaLiga, European and cup games; extra runs before locks, the Refresh
button and live reads in the extension). It lists 40-odd edge cases and the proof on round 8 (Fri 9 – Mon 12 Oct).

**Corrected on 30 Sep.** The earlier note here said FF's percentages were "for LaLiga's next round only". They are for
**each team's next game**, per competition: FF has its own Champions League, Europa League and Copa del Rey sections.
Its "Últ. act." times belong to the fantasy games' market values; a lineup has no time stamp.

**State in production, 2026-09-30** (read-only count): `start_chances` holds 1 gameweek, 15 players, none settled, with
Sofix's number for all 15, **Sorare's for none and Futbol Fantasy's for none.** Futbol Fantasy's none is because that
week is a national-team week, and FF only covers each team's next LaLiga (or European, cup) game. Sorare's none matches
the record above: its starter odds have never been stored; the plan's step S3 logs whether they arrive at all.

**Built on 30 Sep (S1 to S4 of the plan).** Futbol Fantasy is read match by match before each plan; its chance is the start
chance of each of your players in each game (else Sorare's, else Sofix's), and moves the chance he plays, so the expected
score, the plans and the captain follow it; the overlay's tile shows the shown game's own chance. The run's summary says what
was read, who could not be linked, which LaLiga games have no match and how many of your players have Sorare's starter
odds. `start_chances` now records one entry per player, game and source.

**Built on 30 Sep and 1 Oct (S5 to S8).** The Lineups page (`/lineups`): every match FF has published, both elevens as Sorare-style
cards on a pitch with their chance of starting, who else could play under each line (each club's squad page is read once a
week for that), injuries and bans as icons, your cards outlined. The Home's **Team news** under Sorare: your players split by
how likely FF makes them to start, the plan's starters under 70%, and what moved since yesterday (the job keeps a reading every
six hours for two days). Play's cards say "50% starts" with a mark for whose number it is (FF a filled dot, SO a ring, SF a
dashed ring). The overlay's tile and panel were cut down to what matters, with SOURCES behind one button; and while a sorare.com
page is open the extension reads FF's match pages itself, at most every ten minutes per match. What is not proven yet is on
the list in section 9 of the plan: a real read from GitHub's runners and from your browser, round 8's names, card art for
players you do not own.

**The collection** (batch 1, step 6, on `main`) stays: what each source said at the lock, settled by what happened, is
the Audit page's data (T7).

### T2b · Review of the live pages, 2026-10-01 (found in your Chrome on production)
Looked at `/lineups` (all 10 matches), `/`, `/play` (GW19, GW20, LaLiga GW8, 9, 10), `/cards`, `/players`, `/control`,
`/fixtures`, `/difficulty`, `/table` and the sorare.com lineup page with the overlay. Not seen: a phone-width screen
(the browser cannot go below about 500 px; the phone CSS was only read), a match that has kicked off, a failed or old
Futbol Fantasy read, a European or cup round. Per your rule: broken first, then one step at a time, each checked on
production. **Order, goals and checks: [plans/review-fixes.md](plans/review-fixes.md); all four batches (R1–R35) are fixed and
checked on production, 1–2 Oct, except the overlay's R26 which needs the extension reloaded and R32's call-up chip, which no club's squad
list lets appear yet (see the Results).** Corrected 1 Oct: FF only has each
club's next LaLiga game (today round 8), never older rounds, later rounds or national-team weeks; R1, R2 and R4 below are
narrowed accordingly.

**A · Broken or contradicting itself (fix first)**
- **R1 · Play's early plan for round 8 ignores FF, so it contradicts `/lineups`.** Round 8 is the one round FF covers
  (each club's next LaLiga game). All 21 start chances I read on LaLiga GW8 are Sofix's own (SF), taking only four values
  (83, 69, 54, 40%). Miguel Román is in a GW8 lineup at 83% while `/lineups` shows him out until early November at 0%.
  Early plans never get FF (`projected_weeks` in `backend/app/sorare/publish.py`). Fix: give FF's numbers to the early
  plan of the round FF has, and never put an out or suspended player in a plan. GW9 and GW10 are right to have none.
- **R2 · Home "Team news" says FF has "not published a lineup for your players *yet*".** GW19 is national-team games,
  which FF never covers, so "yet" is wrong. Say what is true: "GW19 is national-team games; Futbol Fantasy covers LaLiga
  only; round 8's lineups are on Lineups (n of your players)".
- **R3 · The early plans for GW8, GW9 and GW10 are identical** (3 lineups, 7%, ≈27, the same 24 cards, 418 / 392 / 378
  xScore). They stand on form alone and copy the open week's All Star competitions. Not about FF. **Your decision (1 Oct):**
  plan for the LaLiga competitions Sorare is going to open whenever a week has a full LaLiga round, open or not, and
  replace them with Sorare's own once listed (plan step 1.7).
- **R4 · `/lineups` gives no word when it cannot show the week you came from.** Showing round 8 for every week is right
  (FF has nothing else). What is missing: arriving with `?w=` for a past, national-team or later week shows round 8
  without saying why, and an unknown `?m=99999` silently shows the first match.
- **R5 · `/lineups` never says which Sorare week it feeds.** The header is "Who starts this round? LaLiga · Round 8 ·
  9–12 Oct". It should say "LaLiga round 8 · Sorare: not open yet" (then "Sorare GWnn · locks Fri 16:00" once Sorare
  opens it), with a link to plan that week.
- **R6 · Most photos of players you do not own never load.** On Elche–Celta 10 of 13 FF photo addresses fail (the page
  makes those requests on every view), so about three in four cards are a grey silhouette, next to the owner's full Sorare
  art. This is Q6 of the plan; it is the biggest visual flaw.
- **R7 · Injury text is stale and half Spanish.** "Out until late September" (Antañón) is in the past; "Out until enero
  2027"; "Disponible para la jornada 8", "Baja confirmada para la jornada 8", "Trabajo al margen", "Rotura de lig. cruzado
  anterior", "Roja directa" are FF's Spanish inside an English page. Translate the status words, turn past dates into
  "back from…", keep the diagnosis only if short.
- **R8 · "Called up" (the blue P) appears next to "Squad list not out. Until it is, nobody is assumed out."** Both cannot
  be true. Find out what FF's mark really means before round 8; label or hide it.
- **R9 · Home says "1 lineups".** Play says "1 lineup".
- **R10 · An entered lineup before its lock reads "0 · Still scoring"** with a 0 under every card (Play GW19, locks in 1 d
  3 h). Say "Locks in 1 d 3 h".
- **R11 · Home "Last gameweek: GW17"** while Control says GW18 was the last scored. Check which is right.
- **R12 · Control contradicts itself:** "2× board refreshes a day" under "How it runs" next to "6 runs left before the lock"
  and "4 of 6 on schedule".

**B · Inconsistent names, dates and freshness**
- **R13 · Four ways to say the week.** The bar says "GW8" on Home and the LaLiga pages, "GW19" on Play, "Sorare GW19" on
  Cards and Players; the picker says "LaLiga GW8 / GW9"; the early-plan note says "the competitions of GW19". Always show
  both, "LaLiga round 8 · Sorare GWnn" (or "Sorare not open").
- **R14 · One week, two ranges.** Play's GW8 says "Fri 9–13 Oct"; the picker, Home and Lineups say "9–12 Oct".
- **R15 · Five ways to say how fresh it is:** Control "Updated 9 h ago", Play "synced 9 h ago" and "updated Thu 03:33",
  Lineups "read today 03:33" and "Read 03:33", Home nothing. Use "9 h ago (03:33)" everywhere.
- **R16 · The picker's right column mixes units:** "≈9 · 3 plans", "2 cards play", "88 early plan"; and the gold chips say
  "15 cards", "2 cards", "88 cards" without saying playable.
- **R17 · The blue dot and number on each match tab** ("● 3") has no legend and only a hover title, and it counts your
  alternatives too: Málaga–Espanyol says 3, none of them in the eleven; Elche–Celta says 17 (9 in the eleven, 8 chips).
- **R18 · Names are written three ways:** surname in capitals on pitch cards, full names on alternative chips, and on your
  Sorare cards the name is half hidden under the % pill ("VICTOR CHUST", "IONUT RADU").
- **R19 · Kickoff times carry no time zone** (they are Madrid time; Control says so, the other pages do not).

**C · Usability and pain points**
- **R20 · Your players are the point of the page and are the hardest thing on it.** One match is about 2,200 px tall; your
  players sit in both columns and in the alternatives. Add a strip at the top of each match: "Your 9 here: Radu 95% ·
  Moriba 70% · Román 0% out…", and a "Only my players" switch; the tab count should say "6 likely to start".
- **R21 · Alternatives are full of players who cannot play** (0% out, 0% suspended, 0% doubt) and take two or three rows
  per line. Fold 0–5% into "n more", keep injured ones in the list below.
- **R22 · "Also in the squad, at 0%: Bambo Diaby, …"** gives no reason. Say why or drop it.
- **R23 · The injury list below each team repeats "Knock, but available"** (five for Athletic). Fold those; they are not news.
- **R24 · Nothing links the page to the rest.** A player on `/lineups` does not open his card or his Play row; a Play
  card does not open his match on `/lineups`.
- **R25 · Cards has no "next game, chance to start" column**, and Players shows "Projected —" for many.
- **R26 · The overlay panel on a lineup you entered shows five thumbnails of nine cards** and no FF number (GW19 is national
  teams, so none exists). When there is none, say "FF covers club games only".
- **R27 · A tab switch reloads the whole page (about 120 KB, 0.3 s).** It works; a quicker switch would make it feel
  like one page.
- **R28 · Tiny text.** On the phone the position is 7 px, the line above the name 6 px, names 9 px; on the desktop 8.5 px
  positions and 10.5 px names.

**D · Styling**
- **R29 · Blank gold (Limited) or red (Rare) rectangles for 3 to 10 seconds** while Sorare's art loads, with no name or
  position; Play's lineup rows have the same gaps. Show the name and position over a quiet skeleton, or preload.
- **R30 · Crests are missing on the first paint** (tabs, match header; 2 of 26 failed to load). Reserve the space and
  fall back to the club colour shield.
- **R31 · Two card styles side by side:** your full-art cards and flat silhouettes, and inside one row some real photos and some
  silhouettes (Bigas has one, Revivo does not). One style for everyone: a card in the club's colours with number, name
  and photo when there is one.
- **R32 · The blue "P" badge** reads like a parking sign; the legend explains it only at the foot of the page.
- **R33 · The % colours** (90 dark green, 60–70 light green, 50 yellow, 30 grey) are never explained.
- **R34 · Empty pitch rows** (up to 80 px between lines with no alternatives) make the page longer than it needs to be.
- **R35 · Home "Team news" is a full-width card holding one sentence;** "All Star · Ca…" is cut off in Last gameweek.

**E · Edge cases still to see** (none could be reached today): a match that has kicked off (score, "frozen"), the page
when FF fails or is over a day old, round 9 replacing round 8 (Q2), a European or cup match and the competition tabs, a
postponed game, a phone-width screen.

**Checked and fine:** `/lineups` shows all ten matches with elevens, chances, crests, injury list and your outlined
cards; Oyarzabal 90% and Take Kubo 40% match the plan's notes; no broken image on the owner's cards; no console error
or sideways scroll at desktop width; Control reads "All good" with the extension at v0.3.0; the sorare.com overlay opens
and shows GW19's xScore, reward chance and essence; the page refuses to load inside a frame.

### T3 · Pro in the best plan
**Paused by you on 2 Oct 2026.** Researched the same day: [plans/pro.md](plans/pro.md) (the rules, what the API shows, the gap table and
three questions for you), which wait until you say to go on.
**What you said.** "The app doesn't compute all game modes. It never gives me the Pro option when best lineups are
calculated per competition. Find detailed info on Pro and plan its integration into the best plan. Pro has future
levels, so it has to take into account whether it's even possible to reach the next step and fight for the upgraded
reward or not."

**Why Pro never shows today.** The sync lists only Classic gameweeks (`eventType: CLASSIC`, FIXTURES in
`backend/app/sorare/sync.py`) and keeps only Limited and Rare tracks (`_tracks`), so a Pro competition never reaches
the planner.

**Lead (unconfirmed).** Sorare's help centre, readable through its Zendesk API, describes Pro in "steps" with
"targets" and a "King's Step". Read it in full first: how steps work, the score a step needs, what each step pays,
which cards are allowed, how many lineups, and how Pro sits beside the Classic competitions of the same gameweek.

**Wanted.** Your current Pro level and progress, read from your signed-in Sorare through the extension. The planner
values a Pro lineup by the chance of reaching the next step times its reward, against what the same cards would win
elsewhere, and says plainly when the next step is out of reach.

### T4 · The "Your gameweek" sheet on sorare.com
**What you said.** "The 'Your gameweek XX' sheet is still not optimised and styled. Use /design before implementing
the design; maybe it doesn't need to be this big."

**Today** (`extension/drawer.js`, opened from the vertical "Sofix" tab on the right edge): a full-height 340 px
panel. "YOUR GAMEWEEK 19", then "427 xScore · All Star", five card pictures, "Reward chance 4%", "Essence expected
≈11", "Cards used 9 of 89", a large empty area, a green "Open Apply in Sofix" button and "Entering still takes three
presses in the app." It shows only the best plan's first lineup.

**Process.** A design canvas first, with a few options (its size, and what it shows: every lineup of the plan? what
is already entered?), you choose, then it is built.

### T5 · The expected score where you look at your lineups
**What you said.** "Maybe add somewhere where I can see the expected score": in the lineups, where you see all of
them, near the actual score; and the lineup's total on Sorare.

**Wanted.** (1) On sorare.com's page listing your lineups: Sofix's expected score beside each lineup's actual score.
(2) While you compose a lineup on sorare.com: its expected total, captain included, updating as you swap cards. Both
read what Sorare shows and add Sofix's numbers; nothing is written to Sorare.

### T6 · Sorare and Sofix hand in hand
**What you said.** "Sorare and Sofix have to go hand in hand: see everything that happens in Sorare in Sofix so we can
plan for it."

**First step.** An audit table: what Sorare shows you against what Sofix syncs. Gaps known today: game modes other
than Classic (Pro, T3); Super Rare and Unique competitions (filtered out); gameweeks beyond the ones Sorare has opened
(batch 1, steps 2–4); your entered lineups' scores, ranks and rewards (batch 1, step 3); levels and progress. Each
gap then becomes its own entry here.

### T7 · The Audit page (idea, 2026-09-30)
**Started 2 Oct 2026, at your request: `/audit` is built** ([plans/roadmap.md](plans/roadmap.md), batch 5 results). It leads with the one
xScore figure ([docs/xscore_success_rate.md](docs/xscore_success_rate.md): 66% of the time it picks the better of two players, a coin
flip is 50) and gives "who starts" per source (figure 1, without the splits by competition, position and team and without the big
misses), with what has been written down per gameweek (the first part of 13). Left: the rest of 2, 8, 9, 11, 12 and 13, and everything
that needs the plan frozen at the lock (3 to 7, 10, 14).

**What you said.** "A new page idea, called 'Audit'. It will get the % of correct start guesses from all 3 sources and
compare them; the score prediction difference for xScore in Sofix, to know how precise it is; the difference in plan
team score, to see how precise the team building is; the % of plans that correctly guessed the reward, and the % of
times it properly guessed the best lineup; and more that you'll have to think about."

**What it would show.** Each figure per gameweek and for the season, with how many cases stand behind it; under a
floor it says "too few to tell" instead of a number.

Your five:

1. **Who starts, three sources.** FF, Sorare and Sofix side by side:
   - how often each was right: said 50% or more and he started, or less and he didn't;
   - how far off each was (Brier score);
   - whether their % mean what they say: of the players each put at 80%, how many started.

   Split by competition, position and team. The big misses are listed: said 80% or more and he didn't start, said 20% or
   less and he did. FF's own season predictability per team sits beside ours.
2. **xScore precision.** Expected against actual score per player:
   - the average miss, and whether it runs high or low;
   - split by position, by role (started, came on, didn't play), by competition and by which source gave the %;
   - how often the actual landed inside the range shown.
3. **Plan team score.** The plan's expected lineup total against what the lineup scored: high or low, inside the
   range or not.
4. **Rewards guessed.** How often the reward the plan expected was reached, and whether "reward chance 30%" came true
   about 30% of the time.
5. **Best lineup guessed.** How often the plan's lineup was the best possible in hindsight, and how many of its five
   cards were. Also the points left on the table: the hindsight best minus the plan.

More:

6. **Captain.** How often the captain was the lineup's top scorer, and what the choice cost in points.
7. **You against the plan.** The lineups you entered against Sofix's plan, in points and rewards.
8. **Sorare's projection against Sofix's xScore**, on the same players and games.
9. **Two-game weeks.** How the best-of-two estimate did.
10. **Early plans.** How far a plan made weeks ahead was from the final plan and from what happened.
11. **FF's doubles.** When FF showed two names for one place, how often the first one started.
12. **The football board.** The model's season so far: its RPS against the 0.1947 baseline and the bookmakers, and its
    clean-sheet calls.
13. **Coverage and freshness.** For your players:
    - the share with an FF % and the share with Sorare odds;
    - FF names not linked, and FF reads that failed;
    - how old the FF number was at the lock.
14. **Money.** Essence and cash expected against won.

**What it needs first.** Already recorded:

- what each source said at the lock (`start_chances`);
- the forecasts and actual scores (`sorare_forecasts`);
- the kept weeks (`sorare_week:*`);
- your entered lineups with their scores and rewards (the extension reads them, batch 1 step 3).

Missing: the plan as it stood at the lock (the entry above). Figures 3 to 7 and 10 need it. So the page can open with
1, 2, 8, 9 and 11 to 13, and add the rest once each lock freezes the plan. It replaces the "is Futbol Fantasy
trustworthy?" comparison of T2's first draft.

**Where.** A new page, `/audit`, designed on a canvas first like the others.

### Small things the review before the first push left open
Found by an independent read of the batch-1 commits (2026-09-30); the ones that could cost you a page or a wrong
number were fixed (the Futbol Fantasy time budget, the page written last, a week made final only when complete,
early plans that belong to another season, the hindsight label, the no-plan wording). What is left is small:

- **A postponed game is its own early round** (LaLiga MD3 with one game left in December), and it takes one of the four
  six-hour refresh slots meant for the nearest rounds. Harmless; ordering those slots by date would fix it.
- **A fourth open Sorare week gets no plan.** Sofix plans the next three Sorare gameweeks; an early plan skips any
  round inside a week Sorare has opened. Play now says so and still shows your lineups. Rare: Sorare opens about three.
- **The overlay may rank any gallery of four or more cards** that sits under a short text starting "Select your". It only
  reads, at most twice a second, so the cost is nil; it would show as a stray #1 to #3.
