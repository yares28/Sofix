# Sofix · what's left

Two lists: what only you can do, and what I do. Updated 2026-09-29.

The phase plan lives in [docs/sorare_plan.md](docs/sorare_plan.md) and the audit in
[docs/research_report.md](docs/research_report.md); this file is only the open ends.

---

## Yours

### 1 · The live Apply acceptance test — blocks retiring SorareExt
The one thing no test can stand in for, because it needs your signed-in Sorare tab.

- sorare.com open and signed in, then in Sofix: **Play → Apply plan**.
- Walk it: **Check** → **Save as a draft** → **Enter the competition**. Check writes nothing, a draft is
  reversible, only Enter spends a slot.
- Write down what Sorare said if it refused anything, and what happened if the session had expired.

Until this passes, `SorareExt` stays. There is no data gate here — you can do it today.

### 2 · A Refresh button — optional, and you don't have the key yet
`GITHUB_TOKEN` is not missing from your `.env`; it never existed. It is a GitHub key you'd **create**,
and its only power is starting this repo's refresh workflow. Refreshes already run on a clock without it —
the key only adds a button that starts one early.

The app walks you through it: **/control → "A Refresh button"**. Two steps, both pre-filled links (create the
key with repository access limited to Sofix, then add it to Vercel as `GITHUB_TOKEN` and redeploy).
Skip it entirely if you don't want the button.

### 3 · Install the PWA
Chrome address bar → install. Not blocking anything.

---

## Mine

### Now · fix what's broken (batch 1, planned 2026-09-29)
From your first live look at the overlay and the issues you listed with it. Each step ships on its own and only
on your go: local checks → push to `main` → one Sorare refresh → you look at it on your pages.

0. This file: every other issue written down in full ("Next, one at a time", below).
1. **CI is red on `main`.** Two Play tests look for GW15 in the week panel, which shows one month at a time; near
   a month's end the week they want sits in the other month. A test fix; the app is right.
2. **Play lists every week again.** Since `e5a7154` (28 Sep) Play lists only the weeks Sorare has opened, so the
   later ones vanished.
3. **Past weeks are kept, and complete.** Today only the last played week has anything, and weeks drop out of the
   list 10 days after they end. Wanted for every played week: the lineups you entered with their score and
   reward, what Sofix's plans expected, and the best lineups in hindsight with what they would have won.
4. **Plans for weeks Sorare hasn't opened yet**, e.g. a LaLiga weekend three weeks out: planned from form with
   the competitions of the last comparable week, and saying so.
5. **The overlay fixes your live test showed** (next entry): the odds row, the #1–#3 ranks, a start % on every
   tile, "No xG", and old weeks' pages showing this week's numbers.
6. **Start collecting Futbol Fantasy's starting %** once a day (nothing on screen yet), so T2 can compare it.

### Check the overlay on your own Sorare pages — *first live pass done 2026-09-29*
Your Sofix numbers are drawn on Sorare's own cards (a tile with the score if he starts, plus difficulty or xG), and
an edge tab opens your gameweek's plan. Built from [plans/overlay.md](plans/overlay.md) (O7 to O11); automated proof
is `frontend/e2e/overlay.e2e.ts`.

**What your first pass showed** (six screenshots: "Select your Forward", "Select your Extra", the compose page, the
Classic All Star lineup, the gameweek sheet, the edge tab):

- **Worked.** Every card got a tile. The best plan's cards got ticks and its captain (Arda Güler) the star. The
  hover panel read "43 if he starts · 54% he starts · Expected goals 0.24 · Win chance 77%" for Oyarzabal.
- **No #1–#3 on "Select your Extra"** (seven cards). The ranking only trusts a real heading element (h1–h4); Sorare's
  "Select your ..." is probably styled text. Batch 1, step 5.
- **No Sofix odds row anywhere.** It looks for Sorare's odds bar only 60 px under the card; on Sorare the bar is the
  third row of the block under the card, about 75 px down. The test page had put it 6 px under the card, which is
  why the tests passed. Batch 1, step 5.
- **The start % only on some tiles** (Espino 26%, Mumin 11%, but none on Rațiu): it was drawn only below 50%. You
  want it on every tile, from Sorare when it has one and the app's otherwise. Batch 1, step 5.
- **"NO ODDS" on Gumbau** (Granada, Segunda) while Sorare showed odds for his game (37 / 29 / 34): the label meant
  "no expected goals", since Understat doesn't cover his league. You chose **"No xG"**. Batch 1, step 5.
- **Old weeks' pages show this week's numbers**, and some cards there have none: the extension never tells the app
  which week a page is about. Batch 1, step 5.

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

### T2 · Which starting % to trust: Futbol Fantasy, Sorare or Sofix
**What you said.** "Get the starting % from Futbol Fantasy
(https://www.futbolfantasy.com/laliga/equipos/barcelona), add a scrape of every team's expected starting % to the
run workflow, and compare it with the app's and Sorare's to find the most accurate. Futbol Fantasy needs time before
we know if it's trustworthy."

**What's known** (checked 29 Sep). Its robots.txt blocks nothing. Each team page (about 2.5 MB of plain HTML) lists
every player with `data-nombre="pedri-gonzalez"` and `data-probabilidad="80%"`, plus injury, suspension and
international flags and "Últ. act." (last update) times. Barcelona: 26 players, e.g. Lamine Yamal 95%, Pedri 80%,
Cubarsí 80%, Raphinha 70%. Its percentages are for **LaLiga's next round only**, not national-team games.

**Collection** is batch 1, step 6: once a day, stored beside Sorare's and Sofix's numbers and frozen at the lock.

**The comparison (this entry).** After several gameweeks, score each source against who actually started (history's
`started`), overall and per competition. The tile then uses the best source for each case (say, Futbol Fantasy for
LaLiga and Sorare for internationals), and the panel names it.

### T3 · Pro in the best plan
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
