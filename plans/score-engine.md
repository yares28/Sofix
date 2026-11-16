# Plan · the score engine: options 3 and 4 merged (26 Oct 2026)

**What you asked (26 Oct).** One algorithm that uses everything known and likely about a game (positions, minutes, every stat Sorare
counts, decisive actions, all-around points, the opponent's style per position, penalty and set-piece takers, bookmakers' prices) and
gives a Sorare score as close to the real one as possible, ±7 if it can be done. Two rules from you: the number prices in the chance of a
decisive action (Lamine with a 90% chance is played even on a blank night), and Sofix never leans on Sorare's own projection (it can
disappear, and Sofix is meant to beat it). Option 1 (two numbers), 2 (a range), 5 (blend with Sorare) and 6 (judge by lineups) were
turned down.

This plan finishes [xscore.md](xscore.md) P9 (parts 1 to 16) as one engine instead of separate lines. It replaces the keeper and outfield
lines of 4 Oct (P9 X3/X4) only once it beats them on weeks it has never seen.

## 1 · How Sorare adds up a score

Every start's score is its decisive level plus its all-around points, with a floor from level 1 up: checked on all 10,516 starts of
the games export, each one rebuilt within 0.15 points (`backend/reports/experiments/score_limits.py`, 26 Oct).

```text
score = min(100, max(floor, level points + all-around))
level = goals + assists + penalties won that were scored + clearances off the line + last-man tackles + penalty saves
        + keeper's clean sheet − red cards − own goals − penalties conceded − errors leading to a goal   (kept between −3 and +5)
level points: −3 → 0, −2 → 5, −1 → 15, 0 → 35, 1 → 60, 2 → 70, 3 → 80, 4 → 90, 5 → 100
floor = level points from level 1 up, else 0
all-around = Σ over his stats (count × points for his position)   (scoring version 7; a keeper's goal conceded −5)
```

*Example:* Sivera at Athletic on 19 Sep: a clean sheet and a penalty save make level 2 (70), plus 14.8 all-around, 84.8.

The level was rebuilt from the stats on all 38,850 appearances of the export on 28 Oct (E4): exact for every one but 8 keepers taken
off with a clean sheet. A penalty won counts for the level only when it is scored (`assist_penalty_won`); one that is missed
(`penalty_won`) is a 3-point all-around stat.

So if the engine predicts the counts of every stat and every decisive action, Sorare's own formula gives the score. Nothing is guessed at
the end.

## 2 · What the data allows (measured 26 Oct, 478 LaLiga games since Aug 2025, 10,516 starts)

| A number that… | GK | DEF | MID | FWD |
|---|---|---|---|---|
| knows his whole-season average in advance (cheats) | 14.9 / 29% | 14.0 / 32% | 11.1 / 42% | 13.0 / 30% |
| knows his whole-season median in advance (cheats) | 14.6 / 34% | 13.8 / 35% | 10.8 / 46% | 12.3 / 42% |
| knows the level exactly, his average all-around | 8.1 / 50% | 10.8 / 40% | 7.5 / 56% | 5.6 / 70% |
| knows the all-around exactly, his average level | 9.9 / 50% | 5.8 / 80% | 6.1 / 74% | 10.3 / 36% |
| Sofix's shipped number, weeks it never saw (9–21 Oct) | too few | 15.5 / 30% | 12.6 / 30% | 13.7 / 27% |

Typical miss in points / share within ±7. The last row is the S4 held-out check ([sorare_plan.md](../docs/sorare_plan.md) S4).

What it says:

1. **Knowing who he is is not enough.** Even his whole season seen in advance lands within ±7 only 29–46% of the time. Today's number is
   already about there. Every further point has to come from *this game*: the opponent, his minutes, his role, the scoreline.
2. **Defenders and midfielders are an all-around problem.** Knowing their all-around exactly puts 74–80% within ±7. That part is
   stats (tackles, duels, passes, goals conceded), and stats repeat, so it is where the engine gains most.
3. **Forwards and keepers are a decisive problem.** For them the level matters most (70% within ±7 for a forward when it is known). The
   engine cannot call the coin, but it can price it: goal share, penalties, set pieces, the match's goals.
4. **The opponent moves stats a lot.** Against each club, against the players' own usual rates: keepers make 49% more saves against Real
   Madrid and 38% fewer against Getafe; forwards land 23% fewer shots on target against Getafe and 20% more against Oviedo; midfielders win
   28% fewer tackles against Real Madrid and 18% more against Málaga. These are raw and must be shrunk (§3 step 4), but they are real.
5. **Some movement follows the result.** A defender's all-around falls 6.4 a goal conceded and a keeper's 4.4: the engine simulates the
   scoreline so these move together, not apart.

**The honest limit.** The expected score (your rule: price in the decisive chance) cannot sit within 7 of both outcomes when the chance is
in the middle. *Example:* a forward at 50% for a goal or assist, 50 without, 75 with: the expected 62.5 is 12.5 from either. That miss is
the coin, not the model. So the engine is judged on its typical miss, its share within ±7 **and** whether its chances are honest (§5), and
the goal is the best of each, not a promise of ±7.

## 3 · The engine

Each game is played 5,000 times on the computer (the refresh's Python job, never the web page). In each run, steps 1 to 6 happen in
order and the same run's scoreline drives every player of that game, so a keeper and his defenders, a striker and the other keeper, move
together.

### Step 1 · The match

```text
λ_home, λ_away = football model's expected goals, moved by the bookmakers' who-wins and over/under prices, then by team news
scoreline ~ Dixon–Coles(λ_home, λ_away)          (as the board's difficulty already uses)
shots on target for each side ~ from λ and the club's shot rates (football-data.co.uk history)
```

Team news: each missing starter's share of his side's goals, shots, chances and defensive actions moves λ before the draw (P9 part 13).

*Example:* Barcelona without Raphinha: their λ drops by his share of their goals and chances, so the other keeper gets a better
chance of a clean sheet.

### Step 2 · Who plays and for how long

```text
starts ~ his start chance (official eleven an hour before kick-off when out; else Futbol Fantasy, then Sorare's start odds, then Sofix's own)
minutes if he starts ~ his own record of being taken off (by role; a European game three days before, if the data shows it matters)
comes on ~ his chance of coming on × minutes as a substitute
red card ~ his rate per 90, which cuts his minutes in that run
```

Start chances stay a source of who plays (news, not a score guess). Your rule on Sorare's projection is about the score: the engine
never reads it.

*Example:* a winger subbed at 65' in most games plays 65 minutes in most runs, so he makes fewer duels and has less time for a goal
than a full 90.

### Step 3 · His rates (who he is)

For every one of the 50 stats Sorare counts, his rate per 90 minutes, pulled towards the average of his **role tonight** while he has few
minutes:

```text
rate(player, stat) = (his count + k_stat × role rate) / (his minutes / 90 + k_stat)        recent games weigh more
role = his line in tonight's formation (from the official eleven or Futbol Fantasy): keeper, centre-back, full-back, holding midfielder,
       attacking midfielder, winger, striker; a role change takes the new role's rates for the stats the role decides
```

`k_stat` is fitted per stat: big for rare stats (a last-man tackle), small for frequent ones (passes).

*Example:* a 19-year-old full-back with 200 minutes gets mostly a full-back's average tackles; a regular with 3,000 minutes is mostly
his own record.

### Step 4 · The opponent's style, per position and stat

```text
style(club, position, stat) = what players in that position made against this club ÷ what those same players usually make
                              shrunk towards 1 while there are few games, recent games weighing more
expected count = rate × minutes / 90 × style(opponent, his position, stat) × home or away × game state
game state = how the expected scoreline moves the stat (for example passes and tackles for a side expected to lead; fitted, not assumed)
```

Using the players' own usual rates removes "Real Madrid's opponents are weak": only the club's effect is left.

*Example:* a midfielder who usually wins 3.0 tackles: opposing midfielders won 18% more against Málaga than they usually do (raw), so
against Málaga he expects a little more than 3.0 once shrunk; against Real Madrid (−28% raw), fewer.

### Step 5 · Decisive actions

```text
team goals of this run (from step 1) → each goal to a scorer: penalty goals to the taker, others by his share of the side's
                                       shots on target and chances while he is on the pitch (shrunk to his role's share)
each goal → an assist or not, to a passer by his share of the side's assists, chances created and set pieces taken
clean sheet (keeper's decisive action, a defender's +10 at 60 minutes) → from the run's scoreline and his minutes
penalty save → the opponent's penalties of the run × the keeper's save rate
rarer ones (penalty won, clearance off the line, last-man tackle) → his rate per 90, shrunk to his role's
negative ones (red card, own goal, penalty conceded, error leading to a goal) → his rate per 90, shrunk to his role's
bookmakers' anytime-scorer price, if The Odds API's free plan has it for LaLiga → his goal share is pulled towards it
```

*Example (numbers for illustration):* if Barcelona are expected to score 2.4 goals and Lamine takes a quarter of their shots on target,
their corners and many of their assists, a goal or an assist lands on him in most runs: his chance is high and it is priced into his
number even on a night he blanks.

### Step 6 · All-around stats and the score

```text
each stat's count ~ a count drawn around its expected value (step 4), with the spread each stat really has
goals conceded, saves (= opponent shots on target − goals), clean sheet at 60 → from the run's scoreline, not drawn apart
all-around = Σ count × points for his position (the table read from the points Sorare actually gave)
score = Sorare's formula (§1)
```

*Example:* a keeper's run where Real Madrid score twice: −10 for the goals, but more shots on target, so more saves (+2 each, +2 more
inside the box): about what the data says, a keeper at Real Madrid loses less than the goals alone suggest.

### Step 7 · What comes out, per player and game

```text
xScore = average of his 5,000 scores (0 in the runs where he does not play)  → the plans, the reward chances
score if he starts = average of the runs where he starts                      → the big number on a tile (decision 1, unchanged)
chance of a decisive action, of a negative one                                → beside it, as today
the reasons: the steps that moved him most, in points (shaped like "opponent −4 · penalty taker +3")
```

Two games in a week: both games are simulated and each run keeps his better score (Sorare's "Best score chosen"; xscore.md L6 still to
confirm on real lineups). The planner takes the same runs, so linked scores come from the real scoreline instead of today's correlation
table (`links.py`).

### Step 8 · Correcting itself

Every Monday each stat and each chance is checked against what happened, by band ("said 30%, happened 25%"). Where one leans, a
correction per position is fitted on recent weeks, from 100 cases (P9 X8, which already does this for start chances). The model's rates
and styles are refitted each week on every game so far, so nothing is fixed at the start of the season.

## 4 · Everything it uses

| Input | Have it | Where |
|---|---|---|
| Every stat's count and points, per player and game; minutes; started; set pieces and penalties taken | yes, 2025/26 on | `export_games` (Sorare's public API, 2 free questions a game) |
| Decisive actions by kind (goals, assists, penalties won, clearances off the line, last-man tackles, penalty saves, red cards, own goals, penalties conceded, errors) | yes | the same stats |
| Official elevens with each player's line in the formation | yes, an hour before kick-off | the same export, `xi` |
| Expected goals per side; who-wins and over/under prices | yes | football model, The Odds API (already read), football-data.co.uk history |
| Shots and shots on target per side, per match | yes | football-data.co.uk |
| Start chances | yes | Futbol Fantasy, Sorare's start odds, Sofix's own (corrected) |
| Team news (who is missing) | yes | Futbol Fantasy |
| Anytime-scorer prices | **unknown** | The Odds API, if the free plan has them for LaLiga: 1 credit to check, about 10 a round after |
| Sorare's projection | not used | only the yardstick on the Audit |

Not inputs: card XP, level, season and captain bonuses multiply a card's score in a lineup, not the player's score; the planner already
applies them.

## 5 · How it is judged

- **Rulers, per position:** the typical miss, the share within ±3, ±7 and ±15, the squared miss; whether the chance of a decisive action
  is honest (of the games said 40%, about 40% had one), the chance of a negative one too; each stat against its count; the all-around
  part within ±7 on its own.
- **To beat:** the shipped number (P9 X3/X4) and Sorare's projection, on weeks the engine never saw, each difference with a 95% interval
  that leaves zero (the repo's bar, AGENTS.md "Model rules"). Also shown: the "his whole season in advance" line of §2, the mark of a
  number that really uses the game.
- **Where:** walk-forward on 2025/26 and 2026/27 to 30 Sep for building; the weeks from 1 Oct, untouched, for the decision (S4's split).
  The Audit page shows every ruler, "too few to tell" under 100 cases.
- **A step that does not help ends with no weight.** Nothing stays because it sounds right.

## 6 · Edge cases

| Case | What the engine does |
|---|---|
| New signing, youth player, few minutes | his role's rates (step 3); his own record takes over as minutes grow |
| Plays out of position tonight | tonight's role from the eleven or Futbol Fantasy; Sorare's position still sets the points table |
| Substitute | starts at 35 like a starter (Sorare's rule), minutes from his bench record, same steps |
| Taken off before 60 | no defender's clean-sheet +10 in that run; fewer counts of everything |
| Red card during a run | his minutes end there; level −1 |
| Keeper replaced at half-time | the clean sheet and goals conceded only while he is on |
| Penalty taker out | the next taker in his side's record inherits (P9 part 15) |
| Two games in a week | both simulated, the better counts per run |
| Game outside LaLiga (CL, EL, other leagues) | that competition's football model where Sofix has one (CL, EL, PL, Bundesliga, Ligue 1); style factors only where there are games, else 1 |
| National-team game | no club opponent style; his rates and the national game's odds Sorare shows; never his club's numbers |
| No game, postponed, date TBC | no number, as today |
| Score above 100 or below 0, level floor | Sorare's formula (§1) |
| Sorare changes its scoring table | counts are kept apart from points; points are read from the latest games, so the table follows by itself |
| Promoted club with no history | its style starts at 1 and moves as it plays; its λ from the football model's promoted-club handling |
| Missing over/under price or Futbol Fantasy reading | the football model alone; Sorare's or Sofix's start chance, as today |

## 7 · The phases, one at a time (LaLiga first; other leagues later, your call of 26 Oct)

Rules for every phase:

- **Depth first.** A phase ships before the next starts, each in its own refresh, with its doc line and its held-out table here.
- **New files only.** `modeling/dixon_coles.py`, `sorare/keeper.py` and `sorare/outfield.py` are frozen by hash for the validated
  European, Conference and league models (`app/research/conference_recorder.py`). The engine lives in a new package,
  `backend/app/sorare/engine/`, and is switched on in `scores.py`, which is not frozen.
- **The bar.** Built and tuned on the walk-forward to 30 Sep 2026, every week predicted from the weeks before it. It ships when, per
  position, the typical miss and the squared miss are lower than the shipped number's with a 95% interval under zero (whole gameweeks
  resampled), its chances are honest by band, and the held-out weeks from 1 Oct point the same way. As they grow, the held-out table is
  rerun and kept here. That is how the keeper and outfield lines shipped on 4 Oct.
- **Heavy work stays in the Python job.** The page receives the same fields as today, plus the reasons. No Neon reads are added.
- **Tests first** for each rule. Made-up games where the right answer is known, as in `tests/test_keeper.py`.

### E0 · Independence and the ruler (built 26 Oct 2026)

What you get: Sofix's LaLiga number no longer reads Sorare's projection, every LaLiga game's stats are kept by a scheduled job, and
one command prints the rulers of §5 for any number on the held-out weeks.

1. **Sorare's projection out of Sofix's LaLiga number.**
   - `scores.py` gives the shipped lines no projection, so each runs as its version fitted without one. Measured on 9–21 Oct:
     the typical miss moves by 0.0 to 0.1 points (GK 13.39 → 13.40, DEF 15.49 → 15.61, MID 12.62 → 12.62, FWD 13.70 → 13.74).
   - In `forecast.py`, a rotation player's number with a game score of Sofix's own blends from his own form, not from the projection.
   - Still on the projection, until their own phase:
     - a game the lines cannot tell (a LaLiga game with no football-model numbers, rare) and other leagues' fallbacks, until E5 and
       "Later";
     - the Play page's Sorare plan, which is Sorare's number on purpose.
   - Sorare's number stays in the payload as `sorare`, the yardstick.
   - *Tests* (`tests/test_own_number.py`): every position's line gives the same number with a projection of 20, 80 or none; a
     rotation player's number does not move with it; the Sorare plan still does.
2. **Every LaLiga game, kept daily.**
   - `.github/workflows/games-export.yml` runs `export_games` every morning (05:47 UTC, before the 07:17 refresh). It keeps its file
     in its own GitHub cache (`backend/.cache/sorare_games.jsonl`), with no Neon access.
   - The played games are listed beside the file (`sorare_games_list.json`), so a run asks only for the newest page or two. Games are
     read newest first, to a 25-minute budget. A cold cache fills in a few runs; after that a run takes a minute or two.
   - It runs on its own because the refresh already uses most of its 25 minutes. The refresh restores the file from E1 on, when the
     engine first reads it.
   - **From 2023/24.** Sorare keeps per-player LaLiga stats from 2023/24 on (checked 26 Oct, read only: a January game of each season
     from 2018/19 to 2022/23 has no player scores; January 2024 and 2025 have them all). The local export is being filled back to
     2023/24 (about 760 more games, read once, free), so rates and styles have about twice the history. The walk-forward then starts
     in 2023/24.
   - *Tests* (`tests/test_export_games.py`): the list stops at the first page holding a known game; a kept list that does not reach
     the start day is read again to it; the budget stops between games, newest first, and the next run goes on.
3. **The ruler.** `python -m app.jobs.engine_check --holdout 2026-10-01 [--fixtures-from <gameweeks>]` scores every number on the
   same starts, per position: the typical and the squared miss, ±3/±7/±10/±15, the lean, the decisive chance band by band, and the
   difference from the shipped number with a 95% interval. Each phase adds its number to it. *Tests:* `tests/test_engine_check.py`.

**Before table** (the shipped number as production now runs it, no projection, against Sorare's projection; 9–21 Oct, three
gameweeks, the export of 26 Oct; typical miss / squared miss / lean / within ±7):

| | GK (40) | DEF (161) | MID (120) | FWD (119) |
|---|---|---|---|---|
| shipped | 13.40 / 16.44 / −1.7 / 28% | 15.60 / 20.22 / −0.1 / 29% | 12.56 / 15.87 / +0.1 / 32% | 13.75 / 16.83 / −0.9 / 26% |
| Sorare's projection | 14.01 / 17.15 / +0.3 / 28% | 15.10 / 19.84 / −1.8 / 30% | 12.77 / 16.13 / −3.1 / 34% | 13.86 / 17.49 / −4.5 / 33% |

Without Sorare's number, Sofix is level with it on the typical miss in every position: no interval leaves zero over three
gameweeks. Sofix leans much less (Sorare's projection sits 3 to 4.5 points under what midfielders and forwards scored). The decisive
chance is roughly honest where there are cases: forwards said 26% → 24% happened (54 starts), 34% → 42% (40).

*Done when:* pushed, `--live` all clear, the first scheduled or dispatched export run kept its file, and this table is here.

### E1 · The all-around part, stat by stat

What you get: a defender's and a midfielder's number built from the stats they really make (tackles, duels, passes, goals conceded),
not from one average.

1. **Roles from the eleven.** Each player's line in the official eleven (or Futbol Fantasy's lineup before it is out): keeper,
   centre-back, full-back, holding or central midfielder, wide or attacking midfielder, striker. Sorare lists each line from right to
   left (Real Madrid on 25 Oct: Valverde, Konaté, Huijsen, Cucurella), so the ends of a back four are the full-backs. This order is
   checked on every game of the export before it is used; if it does not hold, roles fall back to his Sorare position.
2. **Rates.** For each of the 50 stats, his rate per 90 minutes, shrunk to his role's rate. Recent games weigh more. `k` and the
   recency weight are fitted per stat on the walk-forward.
3. **All-around if he starts:** Σ rate × his usual minutes as a starter ÷ 90 × points for his position. The points are read from the
   latest games, so a scoring change follows by itself.
4. **The score if he starts** = 35 + the all-around above + the decisive part of the shipped line (its chance of a decisive action ×
   its gap), until E4 replaces that part.

*Check:* the all-around within ±7 and its typical miss against "his last five all-around" and against the shipped number's implied
all-around; then the whole score against the shipped number. Defenders and midfielders are expected to gain most (§2: 74–80% within
±7 when the all-around is known exactly).

**Built 28 Oct 2026** (`backend/app/sorare/engine/roles.py`, `allround.py`; tests `tests/test_engine_allround.py`):

- **Roles.** The line order holds: of the 218 players with ten starts in a back four, 193 are always at an end or always in the
  middle, and 103 of the 111 at an end keep the same side. Roles: GK, CB, FB (the ends of a back four or five, wing-backs behind a
  back three), CM, AM (wide midfielders, wingers of a front three, the line behind the strikers), ST.
- **Rates.** All 50 stats, shrunk to the role by `k` ninetieths, each forgetting at its own pace (`tau`), both fitted per stat on
  2023/24 and 2024/25 only (Poisson deviance; grids of 5 and 12). Frequent stats keep little pull (passes k 1, missed passes 0.25),
  rare ones are mostly their role's (an error leading to a goal or an own goal k 1,024). The export now covers 2023/24 on (1,238
  games), and the football model's forecasts were joined back to 2023/24 (`engine/data.py`, six clubs of those seasons added to
  `gamedata.CLUB`).
- **The points** are read from the games as they come; version 7 rebuilds every appearance's all-around to the point.
- **Goals conceded and the clean sheet at 60** come from the match (his side's expected goals against × his minutes; the clean-sheet
  chance × his chance of playing 60), the rest from his rates × his usual minutes as a starter.
- **The score if he starts** = his all-around + the shipped line's chance of a decisive action × (score − all-around of earlier starts
  with one) + the rest × (the same without).

**Result.** The all-around part is closer than the shipped line's for defenders on the build window (2025/26 to 30 Sep, every week from
the games before it: −0.15 [−0.25, −0.04]) and for every outfield position on the held-out weeks; his last five all-around are the
worst of the three everywhere. But the whole score is only level with the shipped number (defenders −0.04 [−0.15, +0.06], forwards
worse, +0.30), so **E1 is not switched on.** Tables under E4.

### E2 · The opponent's style, home or away, and the game state

What you get: the same player's number moves with who he plays. More tackles against one club, fewer shots on target against another.

1. **Style table.** For each club, each opposing role and each stat: what players in that role made against the club ÷ what the same
   players usually make. Shrunk towards 1 with a weight fitted per stat. Recent games weigh more, and this season's games more than
   last season's. Promoted clubs start at 1.
2. **Home or away** per role and stat.
3. **Game state.** The expected goals of both sides (football model and bookmakers' over/under) move each stat by a fitted amount.
   Nothing is assumed: a stat that does not move keeps no weight.
4. **The reasons.** Each player's number names the two parts that moved it most, in points, as the panel already shows them.

*Check:* the same rulers, E1 against E1 + E2. Ships per position only where it helps.

**Built 28 Oct 2026** (`engine/style.py`; tests `tests/test_engine_style_decisive.py`):

- Each start's counts are set against his own rates for his minutes before the game is added; the sums by opposing club and role
  are the style, by home or away and role the venue. Each pulls towards 1 by `m` games' worth, fitted per stat on 2023/24-2024/25
  (passes, losses of the ball, saves: 10 games; tackles and shots on target: 100; most rare stats never move off 1).
- The game state is measured against **his side's usual** expected goals (his rates already hold its usual game; against the
  league's 1.35 the coefficients would count a strong side twice). Fitted per position and stat; for example a forward's goals
  ×e^0.37 per goal his side is expected to score above its usual, a defender's clearances fall when his side is expected to score more.
- The deviance of every stat falls with each part (accurate passes 57,964 → 50,553 with the clubs → 49,828 with the venue → 49,278 with
  the game state, on the tuning seasons).
- Not built: the reasons in points (E2.4). They belong with the number that ships; none did.

**Result.** The all-around part gains again (build window: midfielders −0.19 [−0.31, −0.07], forwards −0.12 [−0.19, −0.04], defenders
−0.18 [−0.30, −0.07]), but no position's whole score clears the bar (the squared miss's interval crosses zero everywhere), so **E2 is
not switched on.**

### E3 · Minutes, starts and the official eleven

What you get: a player usually taken off at the hour, or about to be benched, is priced as such.

1. **Minutes if he starts:** his own record of minutes when starting, by role, shrunk to his role's. A European game three days before
   is tried as a factor and kept only if it helps.
2. **Coming on:** his chance of coming on and his minutes when he does. The score of a substitute starts at 35, as Sorare's rule says.
3. **The official eleven.** The near-lock checks (`near-lock.yml`, every 30 minutes in the last three hours before a lock) read the
   eleven from Sorare's game an hour before kick-off. Then a starter is certain, and a benched player has only his chance of coming on.
4. **Red cards:** his rate per 90 cuts his minutes.

*Check:* minutes within 15 of what he played, by band; the all-around ruler again.

**Built 28 Oct 2026** (`allround.Book.minutes`, the minutes settings fitted in `engine/walk.py`):

- Minutes as a starter and the chance of playing 60: his own record, forgetting over 90 days, pulled towards his role's by one start
  (fitted on the tuning seasons from 4 × 4 choices). Within 15 minutes of what he played: 83% on the build window, 79% held out
  (typical miss 8.7 and 9.5 minutes).
- Tonight's role from the official eleven: the walk uses it, and `e4 before the eleven` in the tables is the same number with his
  usual role, as the refresh knows it today.
- Red cards: already inside his minutes record (a start ended by one is a short start); a separate cut would count them twice.
- A European game three days before: not tried, the export holds LaLiga games only.
- Not built: reading Sorare's eleven in the near-lock runs (E3.3). The near-lock runs only start the refresh today; nothing reads an
  eleven before kick-off. It is needed only once a number that uses the eleven ships (see E4).

**Result.** Midfielders' whole score is closer on the typical miss (−0.16 [−0.28, −0.04]) but not on the squared miss (−3.87 [−7.66,
+0.07]); no other position passes. **E3 is not switched on.**

### E4 · Decisive actions

What you get: the chance of a goal, an assist, a clean sheet or a penalty save, priced from the match and his role, and honest by
band.

1. **The match's goals.** Each side's expected goals from the football model, moved by the bookmakers' who-wins and over/under
   prices (P9 part 12, as the shipped lines do), then by team news (P9 part 13: the missing starters' share of their side's goals,
   shots and chances).
2. **Goals to players:** penalty goals to the taker (`pen` in the export; the next taker inherits when he is out). Other goals go by his
   share of his side's shots on target and chances while he is on, and by his Understat expected goals where the name matches (O11).
   Shrunk to his role's share.
3. **Assists:** by his share of his side's assists, chances created and set pieces taken (`setp`, `corners`).
4. **Clean sheet** (a keeper's decisive action, a defender's +10 at 60 minutes) from the match and his minutes. **Penalty save** from
   the opponent's expected penalties × his save rate.
5. **Rarer actions** (penalty won, clearance off the line, last-man tackle) and **negative ones** (red card, own goal, penalty
   conceded, error leading to a goal): his rate per 90, shrunk to his role's.
6. **Scorer prices** from The Odds API, only if one check (1 credit) shows the free plan has them for LaLiga. Then his goal share is
   pulled towards them, with a weight that is fitted, not assumed.

*Check:* each chance honest by band (said 30%, about 30% happened), overall and for each kind; the level reached (15, 35, 60, 70+)
expected against happened; the whole score's rulers.

**Built 28 Oct 2026** (`engine/decisive.py`, `engine/walk.py`; settings in `backend/artifacts/score_engine.json`, written by
`python -m app.jobs.engine_check --tune`, fitted on 2023/24-2024/25 only; item X8 of multi-competition-review.md):

- Each kind's expected count = his rate (shrunk to his role's) × his minutes × E2's factor; the positive kinds and the negative ones are
  Poisson counts and a keeper's clean sheet a coin, so the level's whole distribution follows, with each kind's chance, the chance of
  a decisive action (level 1+) and of a negative one, and the expected score by Sorare's formula with its floor.
- The football model's clean-sheet chance is corrected on its log-odds (0.03 + 1.19 × logit: it is a little under-confident), and the
  positive counts by a factor per position that makes the chance honest on the tuning seasons (GK 0.92, DEF 0.90, MID 0.86, FWD 0.94).
- Penalty goals go to the taker through his own goal rate (takers score more), not by a separate share; the next taker does not yet
  inherit, and the side's goals are not moved by team news (E4.1's P9 part 13): both left for E5's simulation.
- Not used: Understat expected goals (not in the export) and scorer prices (needs the 1-credit check of §8, still your call).

**Its chances are honest**, overall and kind by kind (build window): forwards' goal said 25% → 26% (762 starts), 34% → 40% (268);
midfielders' goal 14% → 12% (438); keepers' clean sheet 25% → 23% (220), 35% → 31% (195); penalty saves 2% → 2%; the chance of any
decisive action GK 28% → 27%, DEF 11% → 12%, MID 14% → 15%, FWD 29% → 30%.

**Result.** On the build window E4 clears the bar for **defenders** (typical miss −0.14 [−0.26, −0.02], squared −4.76 [−9.12, −0.43])
and **midfielders** (−0.13 [−0.24, −0.02], −4.90 [−8.33, −1.18]); keepers and forwards are level. Held out from 1 Oct (three
gameweeks), defenders point the same way (−0.04, −6.24) and midfielders do not (+0.20, +5.52). Both passes need tonight's role from the
official eleven: with his usual role (`e4 before the eleven`, what the refresh knows) the defenders' squared miss no longer clears
zero (−4.03 [−8.55, +0.49]). **So E4 is not switched on yet:** for defenders it waits for E3.3 (the near-lock runs reading Sorare's
eleven, then scoring the starters with E4); for midfielders the held-out weeks are rerun as they grow.

**Since then (16 Nov):** the live LaLiga number is Sofix v1 (12 Nov, [sofix-v1.md](sofix-v1.md)), and the owner's bar is the count of
starts within ±7 (more than 2,765 of 6,754, aiming above 50%; [xscore-research-handover.md](../docs/xscore-research-handover.md)).
The tables above compare with the lines Sofix v1 replaced. E1-E4 give an expected score, which lands within ±7 on 25-41% of starts
(build window), below Sofix v1's 38% overall, so none is a candidate for the tile's number under that bar. What E4 adds is honest
per-kind chances (X8): a goal, an assist, a clean sheet, a penalty save, each checked band by band. They are the input the handover's
decisive tests (37-39) use, ready for that research.

**Build window** (2025/26 to 30 Sep 2026; the shipped lines refitted each week on the weeks before, no projection; typical / squared
miss / lean / within ±7; difference in typical and squared miss from the shipped number with a 95% interval, whole weeks resampled):

| | GK (738) | DEF (3,513) | MID (2,467) | FWD (2,489) |
|---|---|---|---|---|
| shipped | 15.49 / 19.03 / −0.1 / 25% | 14.50 / 18.29 / +0.1 / 30% | 11.67 / 15.25 / −0.1 / 40% | 13.79 / 16.59 / +0.1 / 26% |
| E1 | +0.12 [−0.12, +0.36] · +4.7 [−3.6, +13.8] | −0.04 [−0.15, +0.06] · −1.1 [−5.2, +2.8] | +0.02 [−0.08, +0.13] · +0.1 [−3.5, +3.7] | +0.30 [+0.20, +0.40] · +4.0 [+0.8, +7.2] |
| E2 | +0.03 [−0.12, +0.17] · −4.0 [−9.3, +1.4] | −0.08 [−0.20, +0.05] · −3.4 [−8.1, +1.3] | −0.10 [−0.21, +0.01] · −2.9 [−6.7, +1.1] | +0.11 [+0.03, +0.21] · +1.6 [−1.2, +4.8] |
| E3 | +0.03 [−0.12, +0.17] · −4.0 [−9.3, +1.3] | −0.09 [−0.22, +0.03] · −4.4 [−9.0, +0.2] | −0.16 [−0.28, −0.04] · −3.9 [−7.7, +0.1] | +0.10 [+0.01, +0.19] · +0.9 [−2.1, +3.9] |
| E4 | +0.05 [−0.09, +0.20] · −5.2 [−10.8, +0.4] | **−0.14 [−0.26, −0.02] · −4.8 [−9.1, −0.4]** | **−0.13 [−0.24, −0.02] · −4.9 [−8.3, −1.2]** | −0.02 [−0.15, +0.09] · +2.7 [−1.4, +6.9] |
| E4 before the eleven | +0.05 [−0.09, +0.20] · −5.2 [−10.8, +0.4] | −0.13 [−0.25, −0.00] · −4.0 [−8.6, +0.5] | −0.10 [−0.21, +0.00] · −4.4 [−7.9, −0.7] | −0.04 [−0.16, +0.08] · +2.5 [−1.3, +6.4] |

The all-around part alone (typical miss minus the shipped line's implied all-around): E1 GK +0.14, DEF −0.15, MID −0.09, FWD −0.03;
E3 GK −0.12, DEF −0.20, MID −0.24, FWD −0.15 (DEF, MID and FWD with intervals under zero).

**Held out** (1 to 21 Oct 2026, three gameweeks; the shipped lines' files as production runs them):

| | GK (40) | DEF (161) | MID (120) | FWD (119) |
|---|---|---|---|---|
| shipped | 13.40 / 16.44 / −1.7 / 28% | 15.61 / 20.25 / −0.2 / 29% | 12.52 / 15.91 / +0.2 / 36% | 13.79 / 16.89 / −1.1 / 25% |
| E1 | −0.06 · +0.4 | +0.04 · −0.6 | +0.13 · +3.7 | +0.18 · −2.2 |
| E2 | −0.29 · −6.5 | +0.02 · −8.9 | +0.35 · +9.9 | −0.00 · −4.2 |
| E3 | −0.27 · −6.2 | −0.05 · −10.8 | +0.37 · +11.1 | +0.03 · −2.2 |
| E4 | −0.28 · −6.5 | −0.04 · −6.2 | +0.20 · +5.5 | +0.17 · +3.8 |

(Typical and squared miss minus the shipped number's; three weeks give intervals too wide to read, so only the direction counts here.)
All-around alone, held out: E3 DEF −0.27 [−0.74, −0.00], MID −0.30 [−0.41, −0.02], FWD −0.17 [−0.21, −0.10].

Rerun: `python -m app.jobs.engine_check --engine` (held out) and `--engine --holdout 2025-08-01 --until 2026-10-01 --refit` (build).

### E5 · The match simulation

What you get: one engine for every LaLiga player. The tile's number, the decisive chance, the reasons, the plans and their reward
chances all come from the same 5,000 simulated games.

1. **One scoreline per run** for each game (Dixon–Coles on step E4.1's expected goals). Every player of that game is scored from that
   same run: steps E1 to E4 drawn as counts, goals conceded, saves (opponent shots on target − goals) and clean sheets from the
   scoreline, then Sorare's formula (§1).
2. **Two games in a week:** each run keeps his better score.
3. **The planner** takes the same runs, in place of the correlation table of `links.py`. A keeper and his defenders, or a striker and
   the other keeper, then move together for real.
4. **It replaces the shipped lines** in `scores.py` for LaLiga games once it clears the bar for that position. A game it cannot tell
   keeps today's number.
5. **Speed:** 5,000 runs × about 10 games × 40 players × 50 stats, vectorised in numpy, inside the refresh's Sorare step (measured
   before shipping; the runs drop to 2,000 if the step would grow by more than a minute).

*Check:* every ruler of §5, against the shipped lines and Sorare's projection; then the reward chances of the plans, honest by band.

### E6 · Correcting itself every Monday

What you get: a chance or a stat that starts to lean is put right from the weeks that follow, in its own logged step.

Each stat and each chance is checked by band against what happened. From 100 cases, a correction per position is fitted on recent
weeks (P9 X8, which does this for start chances today). Each one is logged, and the next weeks show whether it held.

### E7 · The Audit shows the engine

What you get: the Audit's league figures lead with the engine's rulers: within ±7, the decisive chance honest, the all-around within
±7, closer than Sorare's projection. Today's number is beside them, "too few to tell" under 100.

A design canvas comes first, built from screenshots of today's Audit page (the owner's rule for a canvas). The page then follows it
at 1440 and 390 px.

### Later · other leagues

After LaLiga, the same engine for the Premier League, Bundesliga, Ligue 1, Champions League and Europa League, each with its own
frozen held-out check (their xScore models were validated that way). The FDR plan for every league is in
[fdr-tuning.md](fdr-tuning.md).

## 8 · Your calls

1. Spend 1 Odds API credit (one run of the odds job) to see whether the free plan has anytime-scorer prices for LaLiga? E4 was built
   without them (28 Oct); they would pull each player's goal chance towards the market's.
2. Build E3.3 now (the near-lock runs read Sorare's official eleven and score the named starters with E4), so E4 can ship for
   defenders, or first wait for more held-out weeks?
