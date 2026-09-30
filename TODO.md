# Sofix · what's left

Two lists: what only you can do, and what I do. Updated 2026-09-30.

The phase plan lives in [docs/sorare_plan.md](docs/sorare_plan.md) and the audit in
[docs/research_report.md](docs/research_report.md); this file is only the open ends.

---

## Order of work, by potential visual impact (set 2026-09-30)

Widest change on screen first. Batch 1 is already on `main` and deployed (production `b84c6ba`, 30 Sep), so its row is
"you look at it", not "ship it".

| # | Item | What changes on screen | State |
|---|---|---|---|
| 1 | **T2 · Futbol Fantasy lineups and start %** | FF's % becomes the main % on every tile, Play card and plan (xScore, captain); a new Lineups page; a new home section under "Sorare" | Plan rewritten with your answers (30 Sep); design canvas and the number switch next, aiming at round 8 (Fri 9 Oct). [plans/futbolfantasy.md](plans/futbolfantasy.md) |
| 2 | **T1 · the xScore** | Every tile's score (Giorgi 45 / Oyarzabal 43), "2 games", the bench pair, club vs national | Planning; P0 (diagnose) next. [plans/xscore.md](plans/xscore.md) |
| 3 | **Batch 1, live** (you) | Play's every week, past weeks, early plans to GW36, the overlay fixes; then the second overlay pass | Deployed; waits for your look |
| 4 | **T3 · Pro** | A whole competition type missing from Play's best lineups, plus level and progress | Research first |
| 5 | **T7 · The Audit page** (new idea) | A new page: how right FF, Sorare and Sofix were on starts, the xScore, plan scores, rewards and best lineups | Idea; needs the plan frozen at the lock (row 9) for half of it |
| 6 | **T4 · "Your gameweek" sheet** | The edge-tab panel on every sorare.com page | Design canvas first |
| 7 | **T5 · expected score beside your lineups** | New numbers on sorare.com's lineups and compose pages | Not started |
| 8 | **Old weeks, rebuilt** | GW1–16 (16 of 36 weeks) are "not recorded"; approximate | Optional |
| 9 | **The plan as it stood at the lock** | A second view in kept weeks; the Audit's plan figures need it | Follow-up |
| 10 | **Calibrate reward probabilities** | The "Reward chance" figures | Blocked on data |
| 11 | **Sofix panel on a player page** | A large new panel | Designed, not in the plan |
| 12 | **T6 · Sorare vs Sofix audit** | Nothing directly; produces future entries | Not started |
| 13 | **Small things** | Stray #1–#3 on galleries, the PWA, the review leftovers | Whenever |

No visual impact, but they gate work: **the live Apply acceptance test** (yours, item 1 below) and **Retire SorareExt**.
The Refresh button (yours, item 2) left "small things": the FF plan uses it.

Work order: the FF plan's design canvas and its number switch (steps S1 to S4) start now, aiming at round 8; T1's P0 is
independent. Never ship an xScore model change in the same refresh as the FF switch: a shift in numbers could not be
blamed on either.

---

## Yours

### 1 · The live Apply acceptance test — blocks retiring SorareExt
The one thing no test can stand in for, because it needs your signed-in Sorare tab.

- sorare.com open and signed in, then in Sofix: **Play → Apply plan**.
- Walk it: **Check** → **Save as a draft** → **Enter the competition**. Check writes nothing, a draft is
  reversible, only Enter spends a slot.
- Write down what Sorare said if it refused anything, and what happened if the session had expired.

Until this passes, `SorareExt` stays. There is no data gate here — you can do it today.

### 2 · A Refresh button — you chose it on 30 Sep, and you don't have the key yet
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

### Check the overlay on your own Sorare pages — *first live pass done 2026-09-29*
Your Sofix numbers are drawn on Sorare's own cards (a tile with the score if he starts, plus difficulty or xG), and
an edge tab opens your gameweek's plan. Built from [plans/overlay.md](plans/overlay.md) (O7 to O11); automated proof
is `frontend/e2e/overlay.e2e.ts`.

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

**Plan: [plans/xscore.md](plans/xscore.md), started 2026-09-30.** Findings so far, from the code and a read-only count of
production:

- **There is almost nothing to backtest on yet.** `sorare_forecasts` holds 3 gameweeks, 30 rows, 11 scored, and none of
  its rows has Sorare's starter/substitute odds. The backtest below therefore starts from Sorare's per-game history
  (form only, walk-forward) and adds the comparison with Sorare's projection when about 100 scored players exist. The
  record also lacks the competition, minutes and start/bench split, so P1 adds them (one migration; the FF plan needs none).
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

**The collection** (batch 1, step 6, on `main`) stays: what each source said at the lock, settled by what happened, is
the Audit page's data (T7).

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

### T7 · The Audit page (idea, 2026-09-30)
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
