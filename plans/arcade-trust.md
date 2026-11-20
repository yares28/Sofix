# Arcade you can trust: honest chances, the Arcade audit, and every fix from the 20 Nov review (plan, 20 Nov 2026; not started)

One plan for everything raised on 20 Nov 2026: the review of the four Arcade tabs, the 42% lineup that cannot be true, what a missing
start % must mean in every case, the learning Arcade was meant to do since 29 Oct, the Arcade audit, Surest by step, and the
main app's words and layout. It replaces the open phases of [arcade-player-choice.md](arcade-player-choice.md) (B to F), which were never
built; that file keeps its design notes. Owner rules in AGENTS.md and contracts in [docs/context.md](../docs/context.md) bind every step.

## 0 · Your words (20 Nov 2026)

1. "Red all the tabs in arcade page and find inconsistencies with the main app and issues the data and ui has."
2. On the 10-day-old board: "Its half right, don't stop at surface level man, its 10 day old because there was a national break."
3. On lineups planned on cards with no start %: "Yes, this is bad, find issues like this."
4. On "Play next" above advice to Hold: "Heading has to be concise and small."
5. "Plan the rest of the issues."
6. On the chain's Sat 28 Nov step 4 lineup at 42%: "Is it true? Looking at it I am not sure it can."
7. "The surest has to let me choose a step and it tells me for that step the surest lineups I can put."
8. "First we need to decide what is the best for the issue of 4."
9. Edge cases: "For LaLiga there are FF, SO and SF but other leagues only have SO and SF. So we need to see if we can get Sofix starting %
   for next games and history for other games. What about injuries? What about players that play but from the bench? ETC… We need to
   think for all the edge cases for this."
10. "I told you once to have the Arcade get all the info to train the algorithm of choosing the players, lineup, step chance, success
    rate of the lineups, etc… Where is that info? From weeks ago, what did we learn?"
11. "Did you add the Arcade audit?" Then: "Put everything we talked about in a plan (even the audit), EVERYTHING."
12. On the rule for missing start %: "You need to put the one with the best accuracy at the top and each time fallback to the second,
    third, etc."

From 29 Oct ([arcade-player-choice.md](arcade-player-choice.md)): "make xScore trustworthy and let the algorithm learn from real
results", with an Arcade audit page (in hindsight, how often each step could have been hit, which teams got there, strategies compared,
loopholes found, simulated with the cards you own, learning after every lineup), fast re-planning, real elevens in every plan, upgrades.

## 1 · How it was checked (20 Nov 2026)

- Local dev server (`npm run dev`, blocks copied 20 Nov 20:35), `/arcade` at 1440 px and 390 px. Claude in Chrome was not connected,
  so the in-app browser showed the board your Chrome last copied to the dev server (`/api/dev/chrome-copy`, read **10 Nov 18:47 UTC**).
  Your 28 Nov screenshot came from your Chrome.
- Code: `app/arcade/page.tsx`, `components/arcade/*`, `lib/arcade.ts`, `lib/arcadePlan.ts`, `lib/arcadeClimb.ts`, `lib/arcadeFdr.ts`,
  `lib/arcadeLaLiga.ts`, `backend/app/sorare/forecast.py`.
- Data: the copied board, extras (projections, past scores, Sorare status) and start % reads; `player_games:<slug>` blocks (5,346
  players) for every measurement in §3. All numbers below are from those files; nothing was written anywhere.
- Not checked: your live board after 10 Nov (only your screenshot), pack odds (the copy does not carry them), the extension's dock.

## 2 · Everything found

### 2.1 Wrong numbers (broken)

1. **Missing numbers score higher than real ones** (§3, fixed in step 1). Beyond each player's next game Arcade has no real start % or
   forecast: Sofix's numbers (`loadArcadeLaLiga`) are one row per player for his next kick-off; Sorare's projections cover the next days
   (on 10 Nov, 4 Nations League games and 0 of 377 club games to 6 Jan). Every later game is scored on the average of his past scores
   (`outlookOf`: `score = xscore ?? projection ?? form`) and counted as a sure start (`start ?? 1` in `predicted`, `baseScore`,
   `moments`, `simulate`; `likely` keeps unknowns in every pool). The spread leaves out the risk of not starting, so these lineups also
   look steadier than they are. A game with no information beats one with real information: on 20 Nov Play next proposed Tue 24 Nov
   (Champions League), 5 of 5 cards with no start %, xS 57-71, over that night's games with known start %. The chain to 6 Jan, Batch,
   Teams to build around, Pick teams, cut losses, the Players sort, Surest and the extension's dock (same engine, `lib/arcadeEngine.ts`)
   all inherit it. ARCADE-CLIMB-001 states the assumption ("Unknown start chance counts as one"); step 1 changes that contract.
2. **The 42% lineup** (Sat 28 Nov 16:00, step 4, 400 pts; your screenshot): Hillel Konaté 64, Jake Bidwell 71, Federico Valverde 62,
   Kylian Mbappé 71, Jeremiaha Maluze 80 as captain.

   | Card | Sorare's status | Real record | Where the number comes from |
   |---|---|---|---|
   | Jake Bidwell | NOT_PLAYING, tier DNP | 0 minutes in his last 10 club games | 71 = average of 2 old games |
   | Jeremiaha Maluze (captain) | NOT_PLAYING, tier DNP | last start 19 Sep, 2 starts in 9 | 80 = average of 2 games |
   | Hillel Konaté | STARTER | started his last 3 (64, 68, 78) | 64 |
   | Federico Valverde | STARTER | 13 starts in 15 | 62 |
   | Kylian Mbappé | STARTER | 14 starts in 15 | 71 |

   Both NOT_PLAYING cards counted as sure starters, one as captain. Without them the other three average about 197 of 400: the honest
   chance is about 0%. Sorare's status is already in Arcade's extras and is not used by the score.
3. **Kick-offs not set yet are planned at 01:00.** 40 games (all of LaLiga's 6 Dec round, among others) come from Sorare at 00:00 UTC, a
   placeholder. The chain planned "Sun 6 Dec 01:00 · Step 4"; Batch made one 40-game window. AGENTS.md: a missing kick-off is "Date TBC".
4. **Finished games count as a card's next game.** `gamesOf` keeps games already played: 52 in the 10 Nov copy; the Players day filter
   offered 12, 13 and 14 Nov; a card's badges, start % and FDR can point at them.
5. **The move's heading contradicts its advice:** "Play next" above a bar advising Hold (Play 46%, Hold 54%).
6. **A stale copy freezes what changes.** The board's age (10 Nov) is expected after the national break, but the copy also froze Sorare's
   game list (placeholder kick-offs, finished games), projections and start % reads, and the page says nothing about which parts are old
   (the "as read" line was removed on 10 Nov because it said nothing to act on).

### 2.2 Not the main app's words or pictures

1. Clubs by Sorare's long names ("RCD Espanyol de Barcelona", "Real Club Deportivo de La Coruña", "D. Alavés", "Real Racing Club de
   Santander", "Manchester City FC"); the main app says Espanyol, Deportivo, Alavés, Racing Santander, Man City. Leagues are already
   renamed (`leagueLabel`); clubs are not.
2. "xScore" on Players (filters, sort, badge label), "xS" everywhere else (top bar, Cards, overlay; your 11 Nov rule).
3. "English League" in collection missions ("Collect English players in English League", "Big 5 English League").
4. Two letters instead of a crest for 23 European clubs (Napoli, Galatasaray, Milan, Bodø/Glimt, Fenerbahçe, Viking, Sabah, Como,
   Kairat, Plzeň, Lech Poznań…), on Players and Batch. The rule allows a coloured shield as the stand-in, never initials.
5. FDR colour and number disagree across leagues: bands are per league, so Nice v PSG at 29 is "Favourite" while Man City at 30 and
   Athletic at 35 are "Very favourite". On mixed-league screens (Players, Pick teams, Batch) colour and number contradict.
6. xG with two decimals on Batch (1.48), one on Teams to build around (1.5 xG).
7. Pack names in two forms ("Platinum Pack", "England Platinum" against "Gold · LaLiga").

### 2.3 Layout and behaviour

1. Players: 12 dropdown filters in three rows (spreadsheet look); default sort by name puts 0% / 0 xS / xD 0.00 cards on page 1.
2. Missions & packs: gems and essence shown a second time (the hero has them); L5-L40 buttons shown with no mission; before odds are
   read a 7-row table of dashes and "Within your wallet"; "How odds are calculated" is a formula, not plain words.
3. Teams to build around: "3 best likely starters" over four cards (the total adds the top three).
4. Batch: the window rail scrolls sideways and also has pages ("1 / 8"); "All dates" does not reset the game page.
5. Play now: about a minute on "Planning the climb…" with nothing in the shape of the move.
6. Surest is a second chain (each step waits for a window 15 points better than Fastest); the ladder's step tap shows the five
   likeliest lineups within 7 days only. You want: choose a step, see its surest lineups.
7. Phone (390 px): no horizontal overflow, no text under 10 px on any tab. Nothing to fix.

### 2.4 Small code faults seen on the way

1. `ArcadeView` `refresh` sets the elevens twice.
2. `outlookOf` falls back to `laliga[card.player]`, a key that never exists (rows are keyed `player:kickoff`).
3. `ArcadeMissions` repeats the canonical decisive stat list three times and recomputes each pick's history in `card`.
4. `ArcadeLive` mixes `now` with `Date.now()` in "plays …".

## 3 · What the data already shows (published game history, 30 Oct to 20 Nov 2026)

From `player_games` (pre-kick-off `sofix_x`, `sorare_x`, `ff_start`; after the game `played`, `started`, `mins`, `score`), every
player in the seven Arcade leagues, not only your cards.

| League | Rows | Starts | Typical miss if he starts: Sofix | Sorare |
|---|---|---|---|---|
| LaLiga | 1,255 | 440 | 17.1 | 17.3 |
| Premier League | 1,210 | 440 | 17.9 | 18.0 |
| Bundesliga | 1,142 | 396 | 16.9 | 17.3 |
| Ligue 1 | 1,114 | 396 | 17.8 | 18.1 |
| Champions League | 1,154 | 396 | 18.3 | 19.2 |
| Europa League | 1,190 | 396 | 16.5 | 16.5 |
| Conference League | 1,137 | 396 | 18.0 | 18.3 |
| Nations League | 1,280 | 55 | none published | 21.4 |

- **Start record** (share of starts in his previous 10 games, 5,403 games): honest. 90-99% → 88% started, 80-89% → 73%, 70-79% → 69%,
  60-69% → 59%, 50-59% → 44%, 40-49% → 42%, 30-39% → 32%, 20-29% → 32%, 10-19% → 19%, 0-9% → 3%. Error score (Brier) 0.142 against
  0.624 for "everyone starts". A little optimistic at the top (80-89% → 73%).
- **Futbol Fantasy on LaLiga** beats the record: 0.118 against 0.179 (2,022 games); their average 0.136. A real % always comes first.
- **Bench:** of players who did not start, 5-30% came on depending on their record; a substitute averaged 38-41 points against 49-52 for
  a starter. Arcade counts a non-starter as 0.
- **Coverage:** `ff_start` only on LaLiga (1,015 of 1,255; Champions 43, Europa 11). `sofix_x` and `sorare_x` on 97%+ of rows in the
  seven leagues; none of Sofix's for the Nations League. A pre-kick-off Sofix **start %** is not in the block for any league.
- **Injuries:** FF absences on 27 players (LaLiga only, with cause and return date); Sorare's `injured` and `back` for every card in
  Arcade's extras.

**What the 29 Oct learning plan delivered:** phase A only (official elevens in Arcade, [arcade-start-refresh.md](arcade-start-refresh.md)).
B (freeze every source before each Arcade game), C (hindsight audit and strategy replay), D (learned blend and calibration), E (re-plan
triggers) and F (upgrades) were never built. Arcade's entered lineups and results live only in the browser; nothing in `backend/` knows
Arcade; saved entered weeks (`entered_week:*`) hold Classic and Pro only. **No chance Arcade has printed has ever been checked against
what happened.** That is how the 42% went unseen.

**The model already exists:** `_split` in `backend/app/sorare/forecast.py` gives, per player and game, the chance to start, the chance
to come on, the score in each case, and suspensions, from Sorare's odds or his last five league games (cups excluded: your 7 Oct rule).
Arcade gets it only for each player's next game.

## 4 · The fix for missing start % (step 1)

**Your rule (20 Nov 2026): "put the one with the best accuracy at the top and each time fallback to the second, third, etc."** For each
competition and each number (start chance, come-on chance, score if he starts), the sources are ranked by their measured accuracy; a
card uses the best one that has a number for that game, then the second, and so on, down to his record. Nothing is ever 100% by default.

**Where the ranking comes from.** The Audit already measures every start source by competition (read model `audit`,
`starts.live.<source>.byCompetition`: settled games and error score); the score sources are measured on the same games from
`player_games` (`sofix_x`, `sorare_x`, his last five starts). The refresh re-ranks them each run and publishes the order with the
numbers, so the ranking follows the evidence as it grows. A source with fewer than 100 settled games in a competition is ranked by its
figure over all competitions, marked "too few here" (the Audit's floor of 100). Head-to-head on the same games comes with step 7, which
freezes every source for every game; until then start sources are measured on the games each one covered (Sorare's % is read only near
kick-off, so its games are easier).

**Start chance, ranked today** (error score, lower is better; settled games in brackets; 20 Nov 2026):

| Competition | 1st | 2nd | 3rd | 4th |
|---|---|---|---|---|
| LaLiga | Sorare 0.107 (1,066) | FF 0.118 (2,036) | Sofix 0.145 (2,497) | record 0.146 |
| Premier League | Sorare 0.107 (all; 15 here) | Sofix 0.113 (1,211) | record 0.115 | |
| Bundesliga | Sorare 0.107 (all; 77 here) | Sofix 0.130 (1,077) | record 0.133 | |
| Ligue 1 | Sorare 0.107 (all; 38 here) | Sofix 0.137 (1,045) | record 0.147 | |
| Champions League | Sorare 0.107 (all; 62 here) | Sofix 0.151 (1,411) | record 0.156 | FF 0.179 (157) |
| Europa League | Sorare 0.107 (all; 1 here) | Sofix 0.164 (1,279) | record 0.197 | FF 0.203 (68) |
| Conference League | Sofix 0.163 (1,180) | record 0.227 | | |
| Nations League | Sorare 0.107 (all; 44 here) | record 0.287 | Sofix 0.312 (126) | |

The record (his share of starts in his last 10 games) is measured on 30 Oct to 20 Nov; the other three are the Audit's live figures.
Finding: on LaLiga Sorare's % measures better than FF's, while the main app's order is FF → Sorare → Sofix. Step 7's same-game
comparison settles it; if Sorare still wins there, the main app's order changes too, with your yes.

**Score if he starts, ranked today** (typical miss in points on the same starts, 30 Oct to 20 Nov):

| Competition | 1st | 2nd | 3rd |
|---|---|---|---|
| LaLiga | Sorare 17.1 | Sofix 17.2 | his last five starts 19.1 (420 starts; first two a tie) |
| Premier League | Sofix 18.3 | Sorare 18.4 | last five 18.8 (401) |
| Bundesliga | Sofix 17.3 | Sorare 17.8 | last five 19.1 (344) |
| Ligue 1 | Sofix 17.6 | Sorare 18.1 | last five 19.3 (349) |
| Champions League | Sofix 18.8 | Sorare 19.4 | last five 21.5 (291) |
| Europa League | Sorare 16.7 | Sofix 17.4 | last five 18.2 (209) |
| Conference League | ranked by all competitions (37 here): Sofix, Sorare, last five | | |
| Nations League | Sorare | last five | (no Sofix number there) |

**Coming off the bench** (chance and score): Sorare's "plays" odds where published, else Sofix's `_split` from his record; ranked the
same way once step 7 has the frozen numbers (today only the record is measured: 5-30% come on, about 40 points).

**What each source covers:** FF only LaLiga's next game (and some European ones); Sorare's % from the day before the game week and its
projection for the next days; Sofix's numbers for the next one or two games; the record and the last five for every game. So a card's
next game usually uses the 1st source, and games further away fall through to the record.

**What gets built:** the refresh publishes, for every Arcade player and every game to the set's end, Sofix's start chance, come-on
chance and both scores (`_split`), plus the ranking above, in one small block (`arcade_outlook`, under the 1.6 MB piece size) read once
per change; the page applies the ranking with the Sorare and FF numbers it already has. Rejected: plan only games with a real start %
(the chain would end after a day or two); keep 100% with a penalty (a made-up number).

**How a card is scored:** start chance × start score + come-on chance × bench score, each × bonuses; the simulation draws start, came
on or out, then the score; the spread includes both risks. Source of each part shown on the card ("FF 80%", "Sorare 70%", "Sofix 62%
from his record").

| Case | What happens |
|---|---|
| Any game, any league | The ranked sources above, best first, falling through to the record; never 100% |
| A source says nothing for this game | Skipped, never read as 0; the next one in the ranking is used |
| Two sources tie within 0.005 | The one covering more settled games ranks first |
| Champions, Europa, Conference League | Start chance from league games (rotation, your 7 Oct rule); his European record shown apart when it differs |
| Nations League and friendlies | Sorare's % and projection only; none means a dash and out of the pool |
| Comes off the bench | Counted with his come-on chance and bench score (about 40), not 0 |
| Long out (Bidwell, Maluze: NOT_PLAYING, 0 starts in 10) | Near 0%, out of the pool, never captain |
| Injured | Sorare's `injured` (all leagues) and FF's absences (LaLiga): 0% until his return date; after it, his record, marked "back from injury" |
| Suspended | 0% for that game (`banned`) |
| Doubtful (FF "doubt", Sorare "in doubt") | The source's own %, never rounded up |
| Short record (under 5 games), new signing | Pulled toward his position's average in that league, marked "short record" |
| Transferred during the set | Record from his new club's games only; the card follows Sorare's current club |
| Goalkeeper | Starts or nothing: no come-on chance unless his record has one |
| Official eleven out | 100% / bench / 0%, as now, over everything else |
| Kick-off not set yet | "Date TBC" (step 2); counted on its day only |
| Postponed or cancelled | Dropped when Sorare or the board drops it; a lineup in it says "postponed" |
| Two games for one card in a window | Used once, in the likelier game |
| Captain | Only a card with a real %, or a record of 80% or more, while one is in the lineup |
| A move built mostly on records | Says "early plan: start % arrive the day before" and is planned again when they do |
| Board copy older than 6 hours | Numbers from the server (fresh); board, lives and lineups marked "as of" the copy |
| Not known against zero | Not known is a dash and out of the pool; a known 0% is 0% |

**Done when:** on your live board no Play next, chain step, Surest list, Batch team or dock lineup is chosen on cards with neither a
real % nor a record; the 28 Nov lineup shows about 0%; a test pins that an unknown-start card never outranks the same card at a known
80%, and that a substitute scores his bench share, not 0; ARCADE-CLIMB-001 and manual §10b say the new rule; the dock shows the same.

## 5 · Wrong numbers, the rest (steps 2-4)

- **Step 2 · Date TBC.** A game at 00:00 UTC with no board fixture at that time is "Date TBC": no settle time, no window, counted on its
  day only; a board fixture's real kick-off wins when they match by clubs. Done when the chain and Batch show no 01:00. Test.
- **Step 3 · Finished games.** Drop games more than 2 hours past kick-off everywhere a "next game" is taken (Players, PlayerCard,
  Missions, Teams to build around, Batch). Test.
- **Step 4 · Stale copy.** When the board copy is older than 6 hours, the page reads the game list from Sofix's boards where it can and
  says in one dot line which parts are as of the copy (board, lives, lineups), only when it matters.

## 6 · The move and Surest (steps 5-6)

- **Step 5 · Heading (your words: concise and small).** The heading is the verdict itself, one or two words in the small heading size:
  "Play now", "Hold for Tue 21:00", "Nothing to play".
- **Step 6 · Surest by step.** Surest becomes a step choice (Step 1-6, default the step you are on) showing the five surest lineups for
  that step from every window to the set's end, highest chance first, each with day and time, chance, cards and "Edit in Pick teams";
  cards held by a lineup still running are left out. The ladder's step tap opens the same view: one place. Built after step 1 so its
  chances are honest. Done when choosing Step 6 lists five lineups across the set; spec covers the step switch and Edit in Pick teams.

## 7 · Learning from real results (steps 7-9)

- **Step 7 · Freeze every source before each Arcade game** (phase B of 29 Oct). The refresh and the near-lock runs write, for every
  Arcade player with a game in the next 48 hours, Sofix's start chance, come-on chance and score for **that game**, Sorare's projection
  and %, and FF's %, into `player_games` with `said_at`, refused once the game has kicked off (FORECAST-PRELOCK-001). Start % read in your
  browser is sent with the same rule by `/api/arcade/chances`. No migration (columns exist). Test: a reading at kick-off is refused.
- **Step 8 · Keep every Arcade lineup.** Each entered lineup (cards, step, target, captain, the chance Sofix printed, the time), its
  result (score, cleared or missed, life spent) and the board's steps and lives are saved through one route write per change
  (`arcade_log:<set>`, read by jobs from the games mirror, not Neon reads per view).
- **Step 9 · Check the printed chance.** After 50 settled lineups, Play now shows one line: "of lineups given 40-50%, 11 of 26 cleared",
  bands of 10 points, "too few to tell" under 100 per band (AUDIT-EVIDENCE-001). Then, per league, start chances are calibrated against
  who started (isotonic, as `a + b` corrections only when FORECAST-RAW-001's gates pass), the record's optimism at 80-89% included.
- Later, from the 29 Oct plan: one blended score per league and position learned online (ridge on starts, half-life 6 weeks),
  thin records shrunk toward peers, spread and teammate correlation measured per league (0.09 today, LaLiga only), and a per-league
  trust line on the card ("Sofix beats Sorare by 0.9 here"); a league whose blend does not beat form falls back to form and says so.

## 8 · The Arcade audit (steps 10-12; a view of Arcade: Play now · Missions & packs · Players · Batch · Audit)

**Question it answers in five seconds:** "How much could this set have paid with my cards, and what would have got me there?"

**Data.** Your commons for the set (public read, as `sync.py` does), every game of the set's leagues with each player's real score and
start (`player_games`), the numbers frozen before kick-off (step 7), the board's steps and lives, your entered lineups and results
(step 8). Worked out by a Python job (`app/jobs/arcade_audit.py`, after each refresh's score step) and published as a block; the page
only draws it (AGENTS.md "Pages"). **What can run now on Divination (since 30 Oct):** hindsight with real scores and starts, and a
replay judged on `sofix_x` / `sorare_x` / `ff_start`; Sorare's start % before kick-off outside LaLiga exists only from step 7 on.

- **Step 10 · Hindsight.** For each kick-off window, the best five you owned by real scores (captain included) and its total.
  Replaying the board with perfect knowledge: how many times each step could have been cleared, how many tops (€1,000 each), the
  windows that did it, and which clubs and players made those lineups (crests and cards, counted), beside what you actually did.
- **Step 11 · Strategies, replayed honestly.** Each decides with only the pre-kick-off numbers and is scored with what happened, from
  step 1 with 4 lives, over the same windows: the current plan (`climbWindows`); favourites only (difficulty bands 1-2); steady climb
  (play only at 60%+); rushed climb (one lineup every window); batch per kick-off; daily best; weekly best saved for the hard step;
  insurance stacks (2-4 lineups on hard steps); wait for the eleven; hard-step hoarding (top 10 cards kept for steps 5-6); and the new
  start rule of step 1 against the old one. Results per strategy: tops, cash, steps cleared, lives spent, median days to the top, each
  with a bootstrap band; under 100 windows says "too few to tell". A strategy replaces the shipped one only after winning on held-out
  windows of a whole set.
- **Step 12 · Loopholes and post-mortems.** Yes/no with evidence: does a cancelled insurance lineup cost a life (`remainingLineupsCount`
  before and after); can a lineup be edited until its first kick-off (`updatable`); how often a second window the same day was there
  after a clear; captaining by certainty against by score; did club and edition bonuses change the best five; which kick-off slots
  (13:00, 16:15, 18:30, 21:00, European nights) clear most per step. After every settled lineup, one line on Play now until the next:
  which card missed and why (did not start, came on late, started and under-scored, captain).
- **Design** (DESIGN.md): one hero fact ("This set could have paid €3,000 · you reached step 4"), then a climb chart per strategy on
  one axis (steps against days), the clubs that got there as crests with counts, details folded. Real cards and crests, tabular numbers,
  too-few-to-tell where small, 1:1 skeleton, phone keeps hero → evidence → detail.

## 9 · The main app's words and pictures (step 13)

All of §2.2: clubs by Sofix's names (the board fixture's name where matched, else Sorare's); "xS" everywhere; "Premier League" in
mission names; crests for the 23 European clubs (the board's crest, else the coloured shield); FDR colour from the number with the same
cut-offs in every league; xG with one decimal; pack names in one form ("Platinum · All leagues", "Platinum · England", "Gold · LaLiga").
Done when a search of Arcade's screens finds none of the old forms; Arcade spec passes.

## 10 · Layout (step 14)

All of §2.3: Players gets search, position, league and a "More" sheet for the rest, sorted by xS of the next game by default; Missions &
packs loses the second wallet, shows L5-L40 only with a mission, shows one line and Read odds before odds are read, and says how odds
are worked out in plain words; Teams to build around shows as many cards as it counts; Batch moves through windows by pages only, and
"All dates" resets the game page; Play now gets a 1:1 skeleton of the move and the ladder, and the minute of planning is measured and
cut (the worker's inputs settle 1.5 s; find what takes the rest). The four small code faults of §2.4 go in the same step.
Done when each is checked at 1440 px and 390 px on your board in Chrome, and `web-design-guidelines` passes on the changed files.

## 11 · Order of work (depth first; each ships on its own)

| Step | Delivers | Proof |
|---|---|---|
| 1 | Ranked sources with fallbacks for start, bench and score, everywhere (§4), dock included | Tests of §4; the 28 Nov lineup ≈ 0%; your board in Chrome |
| 2 | Date TBC | Test; chain and Batch with no 01:00 |
| 3 | Finished games dropped | Test; day filter from today |
| 4 | Stale copy marked | Copy older than 6 h shows the dot line |
| 5 | The move's heading | Spec; look 1440/390 |
| 6 | Surest by step | Spec; Step 6 lists five lineups to the set's end |
| 7 | Freeze sources before each game | Test: a reading at kick-off refused |
| 8 | Keep every Arcade lineup | Route test; a real lineup saved and settled |
| 9 | Printed chance checked | Line shows after 50 lineups; too few to tell below |
| 10 | Audit: hindsight | Job test on a fixed fixture; published block; page spec, look |
| 11 | Audit: strategy replay | Job tests; bands; too few to tell |
| 12 | Audit: loopholes, post-mortems | Each yes/no with its evidence |
| 13 | Main app's words and pictures | Spec; search of the old forms |
| 14 | Layout and small faults | Look 1440/390; `web-design-guidelines` |

Each step: `node scripts/check.mjs`, the Arcade spec, the doc line it needs (manual §10b, ARCADE-CLIMB-001), committed locally; pushed
only when you ask, batched.

## 12 · Decisions and limits

- **Decided (you, 20 Nov):** step 1 ranks every source by measured accuracy per competition and falls back down the list (§4).
- **Waiting for you later:** if step 7's same-game comparison confirms Sorare's % beats FF's on LaLiga, whether the main app's order changes too.
- **Free limits:** the new block is one read per change (R2), not per view; the audit job runs in GitHub Actions after the score step and
  reads the games mirror, not Neon; the lineup log is one route write per change (Vercel CPU budget, AGENTS.md "Limits").
- **Small samples:** one set is about 60-100 windows; every audit and calibration figure says "too few to tell" under 100.
- **Nothing is entered on Sorare** by any step (Check → Draft → Enter stays yours).
