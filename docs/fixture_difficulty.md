# Fixture difficulty: how it is calculated, and how it did on nine past seasons

Written 2026-09-15, updated 2026-09-16. Part 1 explains, step by step, how every club's fixture difficulty is
produced. Part 2 replays nine finished LaLiga seasons, forecasting each game only from what was known before it, and
compares the forecasts with what happened. **Part 3 records what changed as a result** - what was fixed, what was
built and rejected, and what "keeps learning" actually amounts to. Part 1 describes the pipeline as it stands after
those changes. Backtest numbers come from
[`backend/reports/experiments/difficulty_backtest.py`](../backend/reports/experiments/difficulty_backtest.py) and
[`bench.py`](../backend/reports/experiments/bench.py); the raw replay output is in the appendix.

## Summary

**How it works.** Every refresh fits a goals model (Dixon-Coles) to the last two years of LaLiga results: each club
gets an attack and a defence rating, plus one league-wide home advantage. For a fixture, the ratings give both
clubs' expected goals, which become a grid of scoreline probabilities and then win / draw / loss chances from each
club's side. **Difficulty = 100 × (1 − expected points ÷ 3)** with expected points = 3 × P(win) + P(draw). In words:
the share of the three points the club is expected to drop. It equals 100 × P(loss) + 66.7 × P(draw). Five labels
(cut at 37.4 / 48.6 / 61.1 / 71.3) colour the tiles, and the cards add up expected points over the chosen gameweeks.

**How it did, without knowing the results.** Every Monday of 2017/18 to 2025/26 (374 Mondays, 3,420 matches), the
model was fitted only on matches already played and forecast every remaining game of the season. The settings it used
for each season were chosen from earlier seasons only ("blind" settings).

| Question | Answer from the backtest |
|---|---|
| Are the match forecasts good? | RPS 0.1994. That is 80% of the way from a venue-only forecast (0.2250) to the bookmakers' closing odds (0.1932), and better than the old Elo (0.2079) in every season |
| Did the production settings benefit from hindsight? | No. Production minus blind RPS on the seasons where production had hindsight (2017/18–2022/23) = −0.0002 (95% CI −0.0010 to +0.0006) |
| Do the labels mean what they say? | Top-band fixtures: 2.26 points per game (69% wins). Middle: 1.36. Bottom: 0.56 (13% wins). In the right order in all 9 seasons (measured on the old single scale, see 1.6) |
| Can it tell a club's easy games from its hard ones? | Yes. Of a club's games in the next 8 weeks on any Monday, the kinder half brought 1.70 points per game and the tougher half 1.03 (+0.67; closing odds +0.72). From pre-season forecasts alone, a club's kindest third of the season brought 1.80 and its toughest third 0.92 |
| Does it rank clubs' next five games? | Rank correlation 0.53 with the points actually taken (closing odds 0.59, Elo 0.50, club strength alone 0.50) |
| Are labels stable as games get closer? | 86.5% of games keep the same label from 7–8 weeks out to their own week; 99.8% stay within one label |

**What the backtest turned up**

1. **The "Kindest run" card mostly shows the strongest club.** Difficulty rates the match-up (your club and the
   opponent), not just the opponent. On Next 5, the kindest run belonged to one of the three best-rated clubs on all 290 Mondays,
   and to the single best-rated club 76% of the time. A "schedule swing" (a run compared with the club's own usual
   level) does carry real information, if the card is meant to spotlight soft schedules.
2. **Fixtures matter most for the next few games; club strength dominates long runs.** Compared with club strength
   alone, the fixtures add +0.15 rank correlation for the next game, +0.03 for the next five and +0.02 for the next
   eight. All are significant, but small beyond a few games.
3. **Within one club's schedule, simple ratings get most of the way; across clubs they don't.** Ordering a club's
   own next games, the model scores a within-club correlation of 0.349. An FPL-style opponent-form rating reaches 0.314
   (difference +0.034, CI +0.022 to +0.047), and venue alone 0.223. Comparing clubs over five games, the model gets
   0.53 against 0.16 for the opponent-only rating.
4. **Known weaknesses confirmed and sized:**
   - clean-sheet chances run 2 points high over nine seasons (about 4 in 2023/24–2025/26);
   - the most one-sided games are rated too cautiously (top decile: 2.24 expected points, 2.38 taken);
   - forecasts for promoted clubs lag the market more after week 8 (+0.0088 RPS behind the closing odds, against
     +0.0057 for other games).

**What was done about it** (Part 3). The run cards were split in two, so one pair answers "who has the most points
coming" and the other "whose schedule is soft for them". The ratings are stretched to undo the ridge's shrinkage,
which fixes the extremes (top-and-bottom decile miss 0.123 → 0.065 points per game) and takes the test seasons from
RPS 0.1953 to 0.1947. Clean-sheet chances are corrected before they are shown (30.8% → 28.8% predicted against 26.1%
observed). Fixtures within a week carry a 35% tint of the bookmakers' prices, worth −0.0027 RPS on those games at
the cost of some tile stability. A post-match review explains every surprising result, and a mechanism to make the
model react faster to clubs it keeps misjudging was built, measured and rejected: it makes the board worse.

---

# Part 1. How the difficulty is calculated

## 1.1 The pipeline

```
football-data.co.uk results + shots on target (current season and 3 before; only the last 730 days count)
  + football-data.org results the CSV doesn't have yet (goals only)
        │
        ▼
Dixon-Coles fit: attack and defence per club, league home advantage, low-score correction      app/modeling/dixon_coles.py
        │        on matches played before today (UTC date), every refresh                      app/jobs/predict.py
        ▼
expected goals λ_home, λ_away  →  probability grid of scorelines 0–10 × 0–10
        │
        ▼
P(win), P(draw), P(loss), P(clean sheet), expected goals, from each club's side                app/services/rating_predictions.py
        │
        ▼
expected points EP = 3·P(win) + P(draw)  →  difficulty = 100·(1 − EP/3)  →  label             app/services/scoring.py
        │
        ▼
grid payload: label → bucket 1–5 (tile colour), lens cut points                               app/services/fixture_grid.py
        │
        ▼
board: tiles, run totals, ranking, kindest/toughest run, picks, predicted table                frontend/lib/grid.ts, table.ts
```

## 1.2 Inputs

| Input | Source | Used for |
|---|---|---|
| Final scores | football-data.co.uk season CSVs (`FTHG`, `FTAG`) | the ratings |
| Shots on target | same CSVs (`HST`, `AST`) | a less noisy stand-in for goals (30% of the fitting target) |
| Results not yet in the CSV | football-data.org, synced by the refresh | the ratings (goals only; the CSV updates Tuesday and Friday) |
| Who is promoted | this season's fixtures minus last season's CSV clubs | the rating prior (same as everyone else in production) |
| Club identity | `services/team_registry.py` (football-data.org code ↔ CSV name) | joining the two sources |

Not used by the difficulty: injuries, line-ups, European fixtures, rest days, manager changes, weather, betting odds.
Odds feed only the separate Odds lens.

## 1.3 The rating model (Dixon-Coles)

Each match's expected goals come from four kinds of numbers:

```
log λ_home = μ + γ + attack[home] − defence[away]
log λ_away = μ     + attack[away] − defence[home]
```

| Symbol | Meaning | Today's fit (2026-09-15) |
|---|---|---|
| μ | goals of an average club away to an average club, on the log scale | +0.101 (e^μ = 1.11 goals) |
| γ | home advantage, the same for every club | +0.284 (×1.33 goals at home) |
| attack[c] | how much more than average club c scores: e^attack is the multiplier | Real Madrid +0.544 (×1.72) |
| defence[c] | how much less than average club c concedes: e^−defence is the multiplier | Real Madrid +0.325 (×0.72) |
| ρ | Dixon-Coles correction for 0-0, 1-0, 0-1 and 1-1 | +0.014 |

**One step after the fit.** The ridge below pulls every club toward the prior, which leaves the best and worst
closer to average than they are. So the fitted attack and defence are stretched around their mean by `spread`
(1.10 today) and μ is re-solved to keep the league's expected goals where they were. It is a correction to the
shrinkage, not new information: see 3.2 for how it was chosen and what it is worth.

Every club with a game in the window gets its own pair of ratings: 26 clubs today (this season's 20 plus clubs
relegated in the last two years), so 55 numbers, re-estimated at every refresh.

**How they are fitted.** A weighted Poisson likelihood with a ridge penalty, maximised with L-BFGS-B:

```
minimise  Σ_matches w · [ λ_home − y_home · log λ_home  +  λ_away − y_away · log λ_away ]
          + ridge · Σ_clubs [ (attack − prior)² + (defence − prior)² ]
```

| Setting (`artifacts/dixon_coles.json`) | Production | What it does |
|---|---|---|
| `window_days` | 730 | only matches from the last two years count |
| `xi` | 0.001 per day | match weight w = e^(−xi × age): 1.00 today, 0.91 at 3 months, 0.83 at 6 months, 0.69 at 1 year, 0.48 at 2 years (half-life 693 days). This is how form enters |
| `goals_weight` | 0.7 | target y = 0.7 × goals + 0.3 × shots on target × league conversion rate (goals per shot on target in the window, currently 0.318). A club with 1 goal from 6 shots on target counts as 0.7 + 0.3 × 6 × 0.318 = 1.27 |
| `ridge` | 1.0 | pulls ratings toward the prior; matters most for clubs with few matches in the window |
| `promoted_prior` | 0.0 | prior rating of promoted clubs. At 0.0 it is the same as everyone's, so a promoted club with no top-flight games in the window starts as an average club |
| `max_goals` | 10 | size of the scoreline grid |

`xi`, `goals_weight`, `ridge` and `promoted_prior` were chosen by the existing backtest (`app/jobs/backtest.py`)
from a 60-setting grid, by RPS on 2019/20–2022/23; `window_days` and `max_goals` are fixed. After the goal rates, ρ is
fitted separately on the real (whole-number) scorelines, within ±0.25.

**Reading a rating.** +0.10 attack ≈ 10% more goals than an average club; +0.10 defence ≈ 10% fewer conceded.
Overall = attack + defence (used for sorting in reports, not in the difficulty).

## 1.4 From expected goals to win, draw, loss

The probability of each scoreline (i home goals, j away goals) is two independent Poisson counts with the Dixon-Coles
adjustment on the four low scores, renormalised over 0–10 goals each:

```
P(i, j) ∝ Poisson(i; λ_home) · Poisson(j; λ_away) · τ(i, j)
τ(0,0) = 1 − λ_home·λ_away·ρ    τ(0,1) = 1 + λ_home·ρ    τ(1,0) = 1 + λ_away·ρ    τ(1,1) = 1 − ρ    otherwise 1

P(home win) = Σ P(i > j)    P(draw) = Σ P(i = j)    P(away win) = Σ P(i < j)
P(home clean sheet) = Σ_i P(i, 0)          expected goals shown on tiles ("xG") = λ
```

"xG" on the board is the model's expected goals from ratings, not shot-quality xG from event data.

## 1.5 The difficulty score

From the club's own side (home club: win = P(home win); away club: win = P(away win)):

```
expected points  EP = 3 · P(win) + P(draw)                         0 … 3
difficulty       D  = 100 · (1 − EP / 3)                           0 (certain win) … 100 (certain loss)
                    = 100 · P(loss) + 66.7 · P(draw)
```

Properties worth knowing:

- **It counts dropped points.** A draw costs two thirds of a loss. Winning margins and goals don't matter.
- **The two tiles of one match are mirrors.** D_home + D_away = 100 + 33.3 × P(draw), so 107–111 for normal draw
  chances. One club's Very favourite is the other's Big underdog.
- **It rates the match-up, not just the opponent.** Your club's ratings are in it too. Barcelona away at a strong
  club can still be a Favourite; a weak club at home to a good side can be an Underdog. FPL's official FDR rates only
  the opponent.
- **Venue alone moves a label or two.** With LaLiga's usual split (45% home wins, 27% draws, 28% away wins) two
  average clubs score about 46 at home (Favourite) and 63 away (Underdog). Over the backtest, home tiles averaged 46.9
  and away tiles 61.7 — which is why the top cut had to become venue-aware (1.6). Under the old single scale, home
  tiles were 23.6% top-band and 5.4% bottom; away tiles 5.5% and 23.7%.

## 1.6 Labels, buckets and colours

| Label | Bucket | Difficulty at home | Difficulty away |
|---|---|---|---|
| Very favourite | 1 | ≤ 36.0 | ≤ 23.4 |
| Favourite | 2 | up to 48.6 | up to 48.6 |
| Even | 3 | 48.6 – 61.1 | 48.6 – 61.1 |
| Underdog | 4 | 61.1 – 71.3 | 61.1 – 71.3 |
| Big underdog | 5 | > 71.3 | > 71.3 |

- **Why the top cut depends on the venue** (changed 2026-09-16). The labels used to be Easy / Easy-ish / Normal /
  Hard-ish / Hard with one set of cuts (37.4 / 48.6 / 61.1 / 71.3). Over nine blind seasons a top-band tile then won
  **70.4%** of the time at home but only **59.3%** away: the same colour made two promises, because an away club
  reaches the same expected points with more draws and fewer wins. With the top cut at 36.0 home and 23.4 away it
  wins **72.0%** and **72.2%**, on 11.7% of tiles. On the live board 26 tiles changed colour; away tiles in the top
  band fell from 23 to 3, and a home Clásico at 36.4 now reads Favourite rather than Easy. The probabilities
  themselves did not move — only the word and the colour on top of them.
- **Where the other cuts come from.** 48.6 / 61.1 / 71.3 still split the forecasts of 2019/20–2022/23 into
  20/30/20/15% of fixtures; they are quantiles of forecast scores, so no results went into them. The venue gap is
  smaller and changes sign in those bands, so they stay shared.
- **The replay tables in Part 2 use the old single scale.** They study the score, not the board; re-running them
  with venue-aware cuts is a follow-up, as is teaching the yearly backtest to propose a home and an away top cut.
- **How the label reaches the tile.** The backend stores the label and sends `bucket` = label position (1–5); the
  tile colour comes only from that bucket, so colour and label always agree. Buckets 4–5 get a ring.
- **The tooltip** shows win / draw / loss, expected goals for and against, clean-sheet chance, difficulty (rounded),
  label and expected points, then the club's **record at this price** (below). Only games still to be played carry
  a forecast; finished and postponed games don't. The weather line was removed on 2026-09-16, with the Open-Meteo
  sync behind it.
- **The record at this price.** How often the club has won when it was priced like this, from five seasons of
  bookmaker closing odds — the only record of what a club *was* priced at — in five bands (under 20%, 20–35%,
  35–50%, 50–65%, 65% or more), against what the whole league won in the same band (12.5 / 24.9 / 43.8 / 58.7 /
  78.8% over 2021–26). The tooltip shows the counts, e.g. "Won 15 of 60 rated like this (25%) · league 25% · level";
  a second line appears when the fixture has a live price, banded by the bookmakers' number instead of ours. Fewer
  than 5 games at that price shows no record. It is description: nothing in it changes a probability.

## 1.7 Lenses

**Record** and **Vs odds** (added 2026-09-16) colour a tile by the club's *edge*: its win rate at this price minus the
league's, shrunk toward zero by sample size (`(wins + 8 × league) / (games + 8) − league`). Green means the club
has historically beaten its billing, red that it has fallen short. Record bands by the win chance the board shows,
so every fixture is rated; Vs odds bands by the bookmakers' current price, so only priced fixtures are. Both run
totals are the average edge per game (edges don't add up), shown as signed points ("+6 pts") under the header "Gap".

The tooltip (reworded 2026-09-20) leads with the sentence the owner asked for — "Wins 38% of games at odds 2.60
(38%)" for the market band, "Wins 25% of games rated 21%" for ours — and puts the counts and the band underneath
("24 of 63 priced 35–50% · league 44% · −6 pts"). The price in the headline is *this* fixture's; the rate is the
club's over the whole band, which is why the band is always shown with it.

**Both teams to score** (added 2026-09-20) comes from the same score matrix as everything else:
`1 − P(home 0) − P(away 0) + P(0–0)`, i.e. `1 − cs_a − cs_h + p_00` on `outcome_table`, so the low-score
correction is in it. The bookmakers' version is the Poisson equivalent of the fitted goal rates. It is shown, never
fitted to: no probability on the board depends on it.

The Defence lens and the defenders column of "Who to pick" read the clean-sheet chance, which is corrected after
the fit (3.3) because the raw model runs high. Overall, Attack and Odds are untouched by that correction.

| Lens | Tile value | Colour cut | Run total |
|---|---|---|---|
| Overall | difficulty | the fixed label cut points above | expected points |
| Attack | expected goals for (λ) | 15/20/30/20/15% of all forecasts on the board (`fixture_grid.quantile_scale`), recomputed each refresh | expected goals |
| Defence | clean-sheet chance | same relative cut | expected clean sheets |
| Odds | bookmakers' win chance | same relative cut, over priced games | market points (3 × win + draw) per priced game |

Odds lens prices are fair probabilities: The Odds API prices, margin removed proportionally, median across
bookmakers. Clean sheet, "to score" and "2+" come from Poisson goal rates fitted to the 1X2 and over/under 2.5 prices
(`services/market_odds.py`). The Attack and Defence colours are relative: a bucket-1 tile means "among the best 15%
on the board right now", not a fixed number.

## 1.8 From tiles to cards

All in `frontend/lib/grid.ts` and `lib/table.ts`. None of it recomputes difficulty; it adds up what the API sent.

- **Run totals** (grid row total, the Expected points ranking card): sum of the lens's run value over the selected
  gameweek columns. A gameweek still to come where the club has no game counts 0; a double gameweek counts both
  games. The Odds lens uses the average per priced game instead.
- **Kindest and toughest run** (`kindestAndToughest`): the clubs with the highest and lowest expected points *per rated
  game* over the window, from the Overall lens.
- **Who to pick** (`positionPicks`): forwards by summed expected goals; defenders and keepers by summed clean-sheet
  chances; midfielders by 0.65 × z(expected goals) + 0.35 × z(clean sheets).
- **Row average bar:** average tile value over the window (difficulty on the Overall lens), coloured with the
  lens's cut points.
- **Predicted table** (`predictedTable`): points so far + summed expected points of every remaining game.
  Title / top-4 / relegation chances come from 5,000 seeded simulations of the win / draw / loss probabilities.
- **Next GW cards** (`matchOutlook`): a club is the favourite when its win chance is at least 10 points above the
  other side's.

## 1.9 When the numbers change

- **Refresh times.** The scheduled refresh (`.github/workflows/refresh.yml`) runs daily at 07:17 and 22:43 UTC,
  Tuesday 13:23 and Friday 17:23 UTC (after football-data.co.uk updates). The refresh button can run it too, at most
  once every 10 minutes.
- **What the predict step does.** It reloads the CSVs, merges newer results, refits at today's UTC date and replaces
  every open fixture's prediction. The model version is `dixon-coles-v1+<settings hash>`.
- **Games played on the day** only enter the ratings at the next day's refresh, because the fit uses matches dated
  before today.
- **Bookmaker prices move the next seven days of tiles.** Those fixtures carry a 35% tint of the market (3.4), and
  the odds sync runs at most every six hours, so a tile inside that window can change colour without any new result.
  Everything further out only moves when results do.
- **Caching.** The board page is cached for an hour and revalidated when a refresh ends.

## 1.10 Worked example (today's model)

Fitted on 2026-09-15 with the production settings: 757 matches in the 730-day window, results through 2026-09-07.

| Fixture | Club | Venue | Attack | Defence | xG for | xG against | Win | Draw | Loss | Exp. points | Difficulty | Label | Clean sheet |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Real Madrid v Getafe | Real Madrid | H | +0.544 | +0.325 | 1.94 | 0.54 | 70.9% | 19.5% | 9.5% | 2.32 | 22.6 | Very favourite | 58.2% |
| Real Madrid v Getafe | Getafe | A | −0.389 | +0.266 | 0.54 | 1.94 | 9.5% | 19.5% | 70.9% | 0.48 | 84.0 | Big underdog | 14.4% |
| Getafe v Real Madrid | Getafe | H | −0.389 | +0.266 | 0.72 | 1.46 | 18.6% | 26.4% | 55.1% | 0.82 | 72.6 | Hard | 23.2% |
| Getafe v Real Madrid | Real Madrid | A | +0.544 | +0.325 | 1.46 | 0.72 | 55.1% | 26.4% | 18.6% | 1.92 | 36.2 | Easy | 48.7% |
| Celta v Villarreal | Celta | H | +0.062 | +0.074 | 1.43 | 1.45 | 37.4% | 24.5% | 38.0% | 1.37 | 54.4 | Normal | 23.5% |
| Celta v Villarreal | Villarreal | A | +0.343 | +0.086 | 1.45 | 1.43 | 38.0% | 24.5% | 37.4% | 1.39 | 53.8 | Normal | 23.8% |

Real Madrid at home, by hand (ratings shown are after the ×1.10 spread of 3.2):

```
log λ_RMA = 0.101 + 0.284 + 0.544 − 0.266 = 0.663  →  λ = 1.94
log λ_GET = 0.101 − 0.389 − 0.325          = −0.613 →  λ = 0.54
scoreline grid → win 70.9%, draw 19.5%, loss 9.5%
EP = 3 × 0.709 + 0.195 = 2.32   →   difficulty = 100 × (1 − 2.32/3) = 22.6 (≈ 100 × 0.095 + 66.7 × 0.195)   →   Easy
Getafe's tile for the same match: 84.0; 22.6 + 84.0 = 106.6 = 100 + 33.3 × 0.195
```

Swapping venues moves Real Madrid from 22.6 to 36.2 (still Easy) and Getafe from Hard (84.0) to Hard (72.6). The
clean-sheet column already has the correction of 3.3 applied; everything else is the model's own.

If either fixture were inside the next seven days and priced, the win/draw/loss row - and with it the difficulty -
would also carry a 35% tint of the bookmakers' view (3.4).

## 1.11 What the difficulty does not know

- **Match context:** injuries, suspensions, rotation around European games or cups, new managers, motivation.
- **Transfers:** a squad changed over the summer is rated from last season's results until new games come in.
- **Promoted clubs:** those without top-flight games in the last two years start as average clubs (production prior
  0.0) and are learned from their games.
- **Home advantage:** one league-wide value; no club-specific home strength.
- **Chance quality:** shots on target stand in for it, weighted 30%.
- **Team news, except for a week:** fixtures within seven days carry a 35% tint of the bookmakers' prices (3.4),
  which do know about injuries and rest. Everything further out is the model alone.

---

# Part 2. Backtest on past seasons, without knowing the results

## 2.1 Design

**Data.** football-data.co.uk LaLiga CSVs 2016/17–2025/26 (3,800 matches, all with shots on target and Pinnacle
closing odds), read from the local cache. 2016/17 is history only: there is nothing earlier to forecast it from.
**Test seasons: 2017/18 to 2025/26, 3,420 matches.**

**The replay.** Same loop as `app.backtest.walkforward`:
- every Monday from each season's first match to its last (374 Mondays), fit the model only on matches dated
  before that Monday;
- forecast every remaining match of the season, once per Monday (75,480 forecasts per method);
- turn each forecast into the two tiles the board would show, and only then look at the result. The tiles use the
  production code: the model from `dixon_coles.py` and lens colours from `fixture_grid.quantile_scale`. The difficulty
  and labels are vectorised, and checked against `scoring.py` on 5,000 forecasts before any table is written.

**Two sets of settings.**

| Variant | Settings | Label cut points | Seasons it is truly blind for |
|---|---|---|---|
| **Blind** (headline) | picked from the production grid (60 settings) by RPS on up to four *earlier* seasons; 2017/18 has none, so the code defaults | quantiles of earlier seasons' forecast scores; 2017/18 from its own pre-season forecasts | all 9 |
| Production | `artifacts/dixon_coles.json` (tuned on 2019/20–2022/23) | 37.4 / 48.6 / 61.1 / 71.3 | 2023/24–2025/26 only. For 2019/20–2022/23 it saw those results; for 2017/18–2018/19 it saw *later* seasons |

What the blind variant chose:

| Season | Tuned on | xi | goals_weight | ridge | promoted_prior | Cut points |
|---|---|---|---|---|---|---|
| 2017/18 | nothing earlier: code defaults | 0.002 | 0.7 | 2.0 | −0.2 | 34.8 / 47.3 / 61.9 / 72.8 |
| 2018/19 | 2017/18 | 0.002 | 1.0 | 4.0 | +0.0 | 34.3 / 47.9 / 61.0 / 73.6 |
| 2019/20 | 2017/18–2018/19 | 0.001 | 1.0 | 4.0 | −0.2 | 35.5 / 47.1 / 61.8 / 72.4 |
| 2020/21 | 2017/18–2019/20 | 0.001 | 1.0 | 4.0 | +0.0 | 36.9 / 48.0 / 61.1 / 71.5 |
| 2021/22 | 2017/18–2020/21 | 0.001 | 1.0 | 4.0 | −0.2 | 36.2 / 47.7 / 61.6 / 72.1 |
| 2022/23 | 2018/19–2021/22 | 0.000 | 0.7 | 4.0 | −0.2 | 38.1 / 48.5 / 61.1 / 70.6 |
| 2023/24 | 2019/20–2022/23 | 0.001 | 0.7 | 1.0 | +0.0 | 37.4 / 48.6 / 61.1 / 71.3 |
| 2024/25 | 2020/21–2023/24 | 0.001 | 0.7 | 1.0 | +0.0 | 36.9 / 48.4 / 61.3 / 71.6 |
| 2025/26 | 2021/22–2024/25 | 0.001 | 0.7 | 1.0 | −0.2 | 36.4 / 48.2 / 61.4 / 72.0 |

2023/24's blind choice is exactly the production setting and cut points (same tuning seasons), which checks the
tuning code. Earlier seasons preferred goals only and a stronger ridge; the setting surface is flat, so these
differences cost little (section 2.2).

**Reference methods**, forecasting the same games from the same Mondays:

| Method | What it knows |
|---|---|
| Closing odds (ceiling) | Pinnacle closing prices, margin removed. Set minutes before kick-off with team news, so no forecaster at the Monday could have them |
| Elo (old scaffold) | the project's original Elo (K 24, home 65, goal-margin multiplier) with a hand-set map to win/draw/loss |
| Form of both clubs | the club's points per game at its venue minus the opponent's at its venue (last 19 games there, within ~13 months, shrunk toward 1.1) |
| Opponent form (FPL-style) | only the opponent's points per game at the venue it plays: how a simple FDR rates fixtures |
| Club rating only | the club's own rating from the blind fit that Monday, ignoring who it plays |
| Venue only | league home/draw/away frequencies of the previous two years: knows nothing about clubs |

**Leakage checks made on the harness.**
1. Training rows are filtered to `date < Monday` twice (walk-forward loop and `fit_dixon_coles`). A game played on
   the Monday itself is forecast, never trained on. The shots-on-target conversion rate comes from the training
   window.
2. Forecast functions receive the target games but read only club names. The closing-odds ceiling reads its prices,
   by design.
3. Promoted clubs come from each season's club list, which is known before a ball is kicked.
4. Blind settings use earlier seasons' results only; cut points use forecast scores, never results.
5. Table-form references use results before the Monday only.
6. **Scramble test.** At five Mondays (including two during the 2020 suspension), every result from that Monday on
   was replaced by random scores and the season re-run. The production, blind, Elo and venue-only forecasts and the
   table-form inputs came out bit-identical.
7. **Remaining hindsight, small:**
   - postponed games are placed at the date they were actually played;
   - the 60-setting grid was designed by someone who knew LaLiga, although it was never tuned on a test season's
     results in the blind variant;
   - 2017/18 uses the code defaults, and git history starts after they were set, so there's no way to check whether
     they were chosen by looking at data.

**Reproduction check.** On 2023/24–2025/26 the harness gives exactly the published report
(`reports/backtest_laliga.md`):
- RPS 0.1953 / 0.1886 / 0.2050 / 0.2255 for model, closing odds, Elo and base rates, on the same 8,339 forecasts;
- identical label counts (2,717 / 3,284 / 4,746 / 3,335 / 2,596).

A run from scratch and a run from cached forecasts produce identical tables. No model fit failed to converge.

**How to read the numbers.**
- **Forecasts within 8 weeks.** Most tables pool every forecast made within 8 weeks of the game, the horizon the
  settings are tuned for, so each game counts up to 8 times.
- **Confidence intervals** resample whole blocks so that repetition doesn't inflate certainty: match weeks for RPS,
  club-seasons for within-club numbers, two-month blocks of Mondays for run rankings.
- **RPS** (ranked probability score): 0 is a perfect forecast; lower is better.
- **Production rows** in all-9-season tables include the four seasons production was tuned on; the blind rows are the
  clean ones.

## 2.2 Match forecasts

Every forecast within 8 weeks, all 9 seasons:

| Method | Forecasts | RPS | Log loss | Accuracy |
|---|---|---|---|---|
| **Dixon-Coles, blind settings** | 25,102 | **0.1994** | 0.9897 | 52.0% |
| Dixon-Coles, production settings | 25,102 | 0.1993 | 0.9894 | 52.1% |
| Closing odds (ceiling) | 25,102 | 0.1932 | 0.9698 | 53.9% |
| Elo (old scaffold) | 25,102 | 0.2079 | 1.0214 | 51.3% |
| Venue only | 25,102 | 0.2250 | 1.0668 | 45.8% |

RPS by season:

| Method | 17/18 | 18/19 | 19/20 | 20/21 | 21/22 | 22/23 | 23/24 | 24/25 | 25/26 | All 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| Dixon-Coles, blind | 0.2015 | 0.2038 | 0.1976 | 0.1982 | 0.2016 | 0.2058 | 0.1860 | 0.1987 | 0.2014 | 0.1994 |
| Dixon-Coles, production | 0.2019 | 0.2027 | 0.1971 | 0.1977 | 0.2015 | 0.2065 | 0.1860 | 0.1987 | 0.2014 | 0.1993 |
| Closing odds (ceiling) | 0.1956 | 0.1978 | 0.1927 | 0.1887 | 0.1955 | 0.2022 | 0.1809 | 0.1886 | 0.1965 | 0.1932 |
| Elo (old scaffold) | 0.2115 | 0.2112 | 0.2100 | 0.2032 | 0.2063 | 0.2141 | 0.1966 | 0.2075 | 0.2110 | 0.2079 |
| Venue only | 0.2294 | 0.2219 | 0.2220 | 0.2262 | 0.2230 | 0.2257 | 0.2222 | 0.2305 | 0.2240 | 0.2250 |

Differences with 95% intervals (negative = first method better):

| Comparison | Seasons | RPS difference | 95% CI |
|---|---|---|---|
| Blind − Elo | all 9 | −0.0085 | −0.0104 to −0.0066 |
| Blind − venue only | all 9 | −0.0256 | −0.0293 to −0.0219 |
| Blind − closing odds | all 9 | +0.0062 | +0.0042 to +0.0083 |
| Production − blind | 2017/18–2022/23 (production had hindsight) | −0.0002 | −0.0010 to +0.0006 |
| Production − blind | 2019/20–2022/23 (production's tuning seasons) | −0.0001 | −0.0011 to +0.0009 |
| Production − Elo | 2023/24–2025/26 | −0.0097 | −0.0126 to −0.0066 |
| Production − closing odds | 2023/24–2025/26 | +0.0067 | +0.0035 to +0.0098 |

- **Every season:** the model beats Elo and venue-only, and trails the closing odds.
- **Share of the market's skill:** it covers 75–88% of the distance from venue-only to the closing odds (section 2.11).
- **Hindsight didn't help:** even on the seasons it was tuned on, production is indistinguishable from the blind
  settings. (From 2023/24 the two are nearly or exactly the same, so those seasons are left out of that test.)
- **Last forecast only:** counting just the forecast made in each game's own week gives the same picture (RPS: blind
  0.1990, closing odds 0.1932, Elo 0.2075).

## 2.3 Labels against results

Blind settings and cut points, all 9 seasons, every club's forecast within 8 weeks:

| Label | Forecasts | Share | Exp. pts/game | Actual pts/game | Exp. win | Actual win | Draw | Loss | Goals for | Goals against | Clean sheets |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Easy | 7,297 | 14.5% | 2.15 | **2.26** | 64.8% | 69.4% | 18.2% | 12.4% | 2.09 | 0.83 | 44.5% |
| Easy-ish | 10,016 | 20.0% | 1.72 | **1.76** | 48.4% | 48.7% | 29.6% | 21.8% | 1.50 | 1.00 | 35.2% |
| Normal | 15,387 | 30.6% | 1.36 | **1.36** | 35.7% | 35.4% | 29.9% | 34.8% | 1.21 | 1.20 | 28.6% |
| Hard-ish | 10,214 | 20.3% | 1.01 | **0.94** | 24.7% | 21.4% | 29.7% | 48.9% | 1.00 | 1.50 | 20.0% |
| Hard | 7,290 | 14.5% | 0.64 | **0.56** | 14.2% | 12.6% | 18.0% | 69.4% | 0.82 | 2.08 | 11.4% |

With production settings and cut points on the three seasons that are blind for them (2023/24–2025/26), actual
points per game run Easy 2.32, Easy-ish 1.70, Normal 1.35, Hard-ish 0.95, Hard 0.53. Shares were 16 / 20 / 28 / 20 / 16%.

Actual points per game by label in each season (blind; share of forecasts in brackets):

| Season | Easy | Easy-ish | Normal | Hard-ish | Hard | Falls at every step |
|---|---|---|---|---|---|---|
| 2017/18 | 2.30 (14%) | 1.82 (20%) | 1.37 (33%) | 0.93 (18%) | 0.51 (15%) | yes |
| 2018/19 | 2.31 (10%) | 1.72 (25%) | 1.34 (29%) | 0.97 (26%) | 0.50 (10%) | yes |
| 2019/20 | 2.32 (13%) | 1.78 (19%) | 1.36 (35%) | 0.97 (20%) | 0.47 (13%) | yes |
| 2020/21 | 2.20 (14%) | 1.79 (20%) | 1.38 (31%) | 0.88 (20%) | 0.57 (15%) | yes |
| 2021/22 | 2.15 (15%) | 1.75 (19%) | 1.35 (30%) | 0.97 (20%) | 0.63 (16%) | yes |
| 2022/23 | 2.15 (16%) | 1.81 (18%) | 1.36 (31%) | 0.90 (18%) | 0.71 (16%) | yes |
| 2023/24 | 2.38 (16%) | 1.81 (20%) | 1.35 (28%) | 0.81 (21%) | 0.44 (15%) | yes |
| 2024/25 | 2.34 (16%) | 1.68 (20%) | 1.36 (28%) | 1.01 (20%) | 0.51 (16%) | yes |
| 2025/26 | 2.26 (16%) | 1.66 (19%) | 1.36 (31%) | 1.00 (19%) | 0.62 (15%) | yes |

- **The labels hold up:** pooled, each step down the scale costs 0.38–0.50 points per game, and the order holds in
  every season (the smallest single step: Hard-ish to Hard in 2022/23, 0.19).
- **The middle is exact:** Normal games were forecast at 1.36 points per game and brought 1.36.
- **The extremes are cautious:** Easy games bring 0.11 more points per game than forecast, Hard games 0.08 fewer.
  The model is too cautious about the most one-sided games in both directions.
- **The cut points travel well:** blind cut points never moved more than ~3 points from production's, and label
  shares stayed near 15/20/30/20/15 (widest: 2018/19 at 10/25/29/26/10).

## 2.4 Calibration

Expected against actual points per game, by decile of the forecast (within 8 weeks):

| Decile | Blind: expected | Blind: actual | Closing odds: expected | Closing odds: actual |
|---|---|---|---|---|
| 1 (toughest) | 0.56 | 0.45 | 0.47 | 0.42 |
| 2 | 0.85 | 0.82 | 0.77 | 0.77 |
| 3 | 1.02 | 0.96 | 0.96 | 0.89 |
| 4 | 1.16 | 1.08 | 1.12 | 1.00 |
| 5 | 1.29 | 1.26 | 1.27 | 1.19 |
| 6 | 1.42 | 1.42 | 1.42 | 1.47 |
| 7 | 1.55 | 1.64 | 1.58 | 1.68 |
| 8 | 1.71 | 1.73 | 1.76 | 1.83 |
| 9 | 1.90 | 1.94 | 1.98 | 2.01 |
| 10 (kindest) | 2.24 | 2.38 | 2.35 | 2.42 |

- **Where the model misses:** the top and bottom deciles, which are too close to the middle (2.24 against 2.38, 0.56
  against 0.45). The closing odds spread further and miss less.
- **Win chances:**
  - 20–30% forecasts won 22.1% of the time;
  - 60–70% forecasts won 71.1%;
  - 70–80% forecasts won 77.6%.
- **The market shows the same mid-range pattern** (22.2%, 70.6%, 79.3%). So over nine seasons the favourite
  under-confidence is milder than the 2023/24–2025/26 audit figure ("60–70% → 74%") and sits mostly in the extremes.

## 2.5 A club's easy games against its hard games

**Question.** For the same club, does the forecast separate the games it will do well in from the ones it won't?

**Method.**
- **Every Monday,** take the club's games in the next 8 weeks (about 7) as forecast that Monday.
- **Remove that group's averages** (forecast and result), so the club's own strength drops out.
- **Correlate forecast with result,** pooled over all Mondays, and compare points per game in the kinder and tougher
  half of each group.

**Why within one Monday.** All forecasts in a group were made with the same information. Comparing each game with the
club's *season* average forecast would mix in forecasts made after the game, which already reflect its result. That
pulls the numbers down for any method that learns from results (the model, Elo, form) and flatters fixed ratings.

| Method | Within-club correlation | Kinder half (pts/game) | Tougher half | Kinder − tougher |
|---|---|---|---|---|
| **Dixon-Coles, blind** | **0.349** | 1.70 | 1.03 | **+0.67** |
| Dixon-Coles, production | 0.350 | 1.70 | 1.03 | +0.68 |
| Closing odds (ceiling) | 0.366 | 1.73 | 1.00 | +0.72 |
| Elo (old scaffold) | 0.341 | 1.69 | 1.04 | +0.65 |
| Form of both clubs | 0.311 | 1.69 | 1.05 | +0.64 |
| Opponent form (FPL-style) | 0.314 | 1.67 | 1.06 | +0.62 |
| Venue only | 0.223 | 1.62 | 1.11 | +0.51 |

(50,204 forecasts per method.) Differences in within-club correlation, with 95% CIs from resampling the 180
club-seasons:

| Comparison | Difference | 95% CI |
|---|---|---|
| Blind − closing odds | −0.017 | −0.028 to −0.007 |
| Blind − Elo | +0.008 | +0.002 to +0.014 |
| Blind − form of both clubs | +0.037 | +0.025 to +0.050 |
| Blind − opponent form (FPL-style) | +0.034 | +0.022 to +0.047 |
| Blind − venue only | +0.126 | +0.105 to +0.146 |

**Over a whole season, from pre-season forecasts only.** The Monday before round 1, each club's 38 games split into
thirds. Closing odds are left out because they are set during the season.

| Method | Within-club correlation | Kindest third (pts/game) | Middle third | Toughest third | Kindest − toughest |
|---|---|---|---|---|---|
| **Dixon-Coles, blind** | **0.320** | 1.80 | 1.35 | 0.92 | **+0.88** |
| Dixon-Coles, production | 0.326 | 1.80 | 1.36 | 0.90 | +0.90 |
| Elo (old scaffold) | 0.312 | 1.81 | 1.34 | 0.93 | +0.88 |
| Form of both clubs | 0.286 | 1.80 | 1.29 | 0.98 | +0.82 |
| Opponent form (FPL-style) | 0.289 | 1.73 | 1.38 | 0.97 | +0.76 |
| Venue only | 0.205 | 1.63 | 1.35 | 1.10 | +0.53 |

- **A club's next eight weeks split clearly.** The kinder half of its games brings 0.67 points per game more than the
  tougher half, about 2.3 points over three or four games. Before a season starts, the forecast already separates a
  club's kindest and toughest thirds by 0.88 points per game, about 11 points over 13 games.
- **Venue explains most of it:** venue alone gives +0.51 of the +0.67.
- **Simple ratings get close, but the model is better.** It beats the FPL-style opponent rating (+0.034) and the
  both-clubs form rating (+0.037), and edges Elo (+0.008); every interval excludes 0.
- **The closing odds are better still** (+0.72), and this comparison understates them: the closing price of a later
  game in the window already reflects the earlier results.
- **Per lens**, same Monday comparisons (blind settings):

  | Lens | Within-club correlation | Kinder half | Tougher half |
  |---|---|---|---|
  | Overall: expected points → points | 0.349 | 1.70 pts | 1.03 pts |
  | Attack: expected goals → goals scored | 0.257 | 1.51 goals | 1.07 goals |
  | Defence: clean-sheet chance → clean sheets | 0.211 | 35.3% | 20.8% |

## 2.6 Runs across clubs: the ranking and the Kindest / Toughest cards

**Method.** At every Monday with new results, take each club's next N games and add up the forecast (for the
model: expected points, as the ranking card does). Rank the clubs by that total and correlate with the points they
actually took (Spearman), averaged over Mondays.

| Method | Next 1 | Next 3 | Next 5 | Next 8 |
|---|---|---|---|---|
| **Dixon-Coles, blind** | **0.418** | **0.469** | **0.528** | **0.581** |
| Dixon-Coles, production | 0.416 | 0.472 | 0.530 | 0.583 |
| Closing odds (ceiling) | 0.453 | 0.521 | 0.591 | 0.657 |
| Elo (old scaffold) | 0.409 | 0.450 | 0.501 | 0.556 |
| Form of both clubs | 0.371 | 0.433 | 0.485 | 0.546 |
| Opponent form (FPL-style) | 0.287 | 0.181 | 0.158 | 0.155 |
| Club rating only (ignores fixtures) | 0.265 | 0.419 | 0.497 | 0.562 |
| Venue only | 0.187 | 0.112 | 0.100 | 0.094 |

(317, 306, 290 and 268 Mondays.) Differences, with 95% CIs from resampling two-month blocks of Mondays:

| Comparison | Next 1 | Next 3 | Next 5 | Next 8 |
|---|---|---|---|---|
| Closing odds − model | +0.035 (+0.021 to +0.050) | +0.051 (+0.036 to +0.068) | +0.063 (+0.044 to +0.083) | +0.077 (+0.054 to +0.100) |
| Model − Elo | +0.009 (−0.005 to +0.022) | +0.019 (+0.006 to +0.033) | +0.027 (+0.013 to +0.042) | +0.025 (+0.009 to +0.041) |
| Model − form of both clubs | +0.047 (+0.025 to +0.067) | +0.037 (+0.016 to +0.056) | +0.043 (+0.020 to +0.064) | +0.035 (+0.012 to +0.056) |
| Model − club rating only | +0.153 (+0.134 to +0.171) | +0.050 (+0.035 to +0.065) | +0.031 (+0.015 to +0.046) | +0.019 (+0.005 to +0.031) |

- **The model beats every table heuristic** and, beyond a single game, Elo.
- **An opponent-only FDR is nearly useless for comparing clubs** (0.16 over five games): it can't see that a big
  club's hard run is still worth more than a small club's easy one.
- **The fixture information fades with run length.** For the next game it is worth +0.15 over club strength; over
  eight games only +0.02. Over long runs, schedules even out and club strength does most of the ranking.
- **The market's lead grows with run length partly by hindsight.** Each later game's closing price is set after the
  earlier games in the run were played.

**The Kindest and Toughest run cards.** Points per game actually taken by the club each method put at the top and
bottom (Next 5):

| Method | Kindest run | Toughest run | Kindest outscored toughest | Five kindest | Five toughest |
|---|---|---|---|---|---|
| Dixon-Coles, blind | 2.25 | 0.80 | 96% | 1.94 | 1.00 |
| Closing odds (ceiling) | 2.31 | 0.72 | 96% | 1.97 | 0.93 |
| Elo (old scaffold) | 2.24 | 0.92 | 91% | 1.93 | 1.02 |
| Opponent form (FPL-style) | 1.63 | 1.11 | 66% | 1.52 | 1.23 |
| Club rating only | 2.28 | 0.92 | 96% | 1.91 | 1.04 |

So the cards "work", but mainly because they point at the best and worst clubs (blind board, ratings from the same
fit):

| Run | Kindest run = best-rated club | Kindest run = a top-3 club | Toughest run = worst-rated club |
|---|---|---|---|
| Next 1 | 43% | 261 of 317 Mondays (82%) | 18% |
| Next 3 | 69% | 305 of 306 | 45% |
| Next 5 | 76% | 290 of 290 | 59% |
| Next 8 | 80% | 268 of 268 | 66% |

**Schedule swing** is what a fantasy manager usually means by "a kind run": the run against the club's own usual
level. Swing = run total − N × the club's average expected points over its remaining games. It is compared with the
same swing in real points (Spearman; clubs with at least 2N games left):

| Method | Next 1 | Next 3 | Next 5 | Next 8 |
|---|---|---|---|---|
| Dixon-Coles, blind | 0.315 | 0.213 | 0.185 | 0.155 |
| Closing odds (ceiling) | 0.340 | 0.268 | 0.285 | 0.287 |
| Elo (old scaffold) | 0.308 | 0.203 | 0.169 | 0.133 |
| Form of both clubs | 0.285 | 0.187 | 0.165 | 0.139 |
| Opponent form (FPL-style) | 0.288 | 0.177 | 0.153 | 0.139 |
| Venue only | 0.184 | 0.114 | 0.097 | 0.069 |

The club with the kindest forecast swing then took, compared with its own average over the rest of the season
(blind): +0.70 points per game over the next game, +0.26 over 3, +0.19 over 5, +0.12 over 8. The toughest swing:
−0.83, −0.30, −0.20, −0.19. The signal is real but modest over five games: about one point for the club picked.
The closing odds keep more swing skill at long horizons only because a price set minutes before a game eight weeks
away already knows those eight weeks.

**Attack and Defence totals over the same runs** (blind, Spearman):

| Lens total | Next 1 | Next 3 | Next 5 | Next 8 |
|---|---|---|---|---|
| Expected goals → goals scored | 0.321 | 0.431 | 0.498 | 0.561 |
| Expected clean sheets → clean sheets | 0.239 | 0.255 | 0.307 | 0.349 |

Clean sheets are much harder to rank than goals, which matters for the "Who to pick" defenders column.

## 2.7 Attack and Defence lenses

Tile colours cut as the board cuts them: 15/20/30/20/15% of every forecast on the board that Monday. Games within
8 weeks, blind settings:

| Bucket | Attack: share | Expected goals | Goals scored | Defence: share | Clean-sheet chance | Clean sheets kept |
|---|---|---|---|---|---|---|
| 1 (greenest) | 14.9% | 2.11 | 2.10 | 14.9% | 47.5% | 45.9% |
| 2 | 19.6% | 1.53 | 1.52 | 19.8% | 38.1% | 34.4% |
| 3 | 30.7% | 1.21 | 1.20 | 30.7% | 30.1% | 28.4% |
| 4 | 19.8% | 0.97 | 1.01 | 19.6% | 21.9% | 19.4% |
| 5 | 15.0% | 0.75 | 0.79 | 15.0% | 12.9% | 11.8% |

- **Attack colours are accurate** across buckets. Expected goals are well calibrated from 0.5 to 3.0 goals; above
  3.0 they run high (3.26 forecast, 2.68 scored, 257 forecasts). Those are almost all Barcelona or Real Madrid at
  home (97% of them; 37% against promoted clubs).
- **Defence colours are in the right order but the percentages run high:** on average 30.1% forecast against 28.0%
  kept over nine seasons (1.1–3.7 points high by bucket). In the three most recent seasons the gap is about 4 points
  (`reports/backtest_laliga.md`, section 7). The ranking of games is unaffected; the percentages in the tooltip are
  optimistic.

## 2.8 How far ahead, and how stable

RPS by week ahead (week 1 = the 7 days after the Monday):

| Method | Wk 1 | Wk 2 | Wk 3 | Wk 4 | Wk 5 | Wk 6 | Wk 7 | Wk 8 |
|---|---|---|---|---|---|---|---|---|
| Dixon-Coles, blind | 0.1990 | 0.1985 | 0.1994 | 0.1994 | 0.1997 | 0.2001 | 0.1995 | 0.1995 |
| Closing odds (ceiling) | 0.1932 | 0.1928 | 0.1934 | 0.1933 | 0.1933 | 0.1933 | 0.1929 | 0.1929 |
| Elo (old scaffold) | 0.2075 | 0.2074 | 0.2079 | 0.2082 | 0.2083 | 0.2082 | 0.2079 | 0.2080 |

How much a game's production label changes between an early forecast and the forecast in its own week:

| Forecast made | Games | Same label | Within one label | Mean change in difficulty |
|---|---|---|---|---|
| 7–13 days before | 6,696 | 94.5% | 99.9% | 0.7 |
| 14–20 days before | 6,512 | 92.0% | 99.9% | 1.1 |
| 28–34 days before | 6,222 | 88.5% | 99.7% | 1.5 |
| 49–55 days before | 5,632 | 86.5% | 99.8% | 1.9 |
| 84–90 days before | 4,826 | 82.1% | 99.8% | 2.4 |
| 133–139 days before | 3,780 | 75.3% | 99.5% | 3.2 |

- **Accuracy doesn't depend on how far ahead the game is**, up to eight weeks.
- **Labels move slowly.** A tile two months out almost never jumps more than one colour. Its difficulty moves 1.9
  points on average by the week of the game, so the labels that do change belong to games close to a cut point.

## 2.9 Promoted clubs

Match RPS (within 8 weeks) and the gap to the closing odds:

| Matches | Mondays | Forecasts | Model RPS | Closing odds RPS | Gap to odds |
|---|---|---|---|---|---|
| Involve a promoted club | weeks 1–8 of the season | 1,518 | 0.2020 | 0.1962 | +0.0058 |
| Involve a promoted club | after week 8 | 5,628 | 0.1963 | 0.1875 | **+0.0088** |
| No promoted club | weeks 1–8 | 3,785 | 0.1995 | 0.1947 | +0.0048 |
| No promoted club | after week 8 | 14,171 | 0.2003 | 0.1946 | +0.0057 |

- **The model lags the market most for promoted clubs later in the season:** the market learns them faster.
- **The error in points is small:** promoted clubs took 1.05 points per game against 1.09 expected after week 8,
  and 1.09 against 1.08 early on.

## 2.10 Whole season: the predicted table

Final points projected as points so far + summed expected points of every remaining game, against the real final
table (mean over the 9 seasons):

| When | Method | Mean absolute error (points) | Rank correlation |
|---|---|---|---|
| Pre-season | Dixon-Coles, blind | 7.9 | 0.695 |
| Pre-season | Dixon-Coles, production | 7.7 | 0.690 |
| Pre-season | Elo (old scaffold) | 9.2 | 0.684 |
| Pre-season | Last season's points (promoted: relegated clubs' average) | 8.7 | 0.687 |
| Half-way | Dixon-Coles, blind | 4.5 | 0.866 |
| Half-way | Dixon-Coles, production | 4.4 | 0.876 |
| Half-way | Elo (old scaffold) | 5.1 | 0.856 |
| Half-way | Points per game so far × 38 | 5.8 | 0.853 |

- **Pre-season** projections are off by about 8 points per club, only slightly better than last season's table.
  Summers change squads, and the model doesn't see transfers.
- **By half-way** the error almost halves, and the model clearly beats extrapolating points per game.

## 2.11 Season by season (blind settings)

Within-club numbers use the same-Monday comparison of section 2.5.

| Season | RPS | Closing odds RPS | Venue-only → odds gap closed | Within-club correlation | Kinder − tougher half | Next-5 rank corr. | Next-5, club rating only | Easy pts/game | Hard pts/game |
|---|---|---|---|---|---|---|---|---|---|
| 2017/18 | 0.2015 | 0.1956 | 83% | 0.374 | +0.83 | 0.481 | 0.440 | 2.30 | 0.51 |
| 2018/19 | 0.2038 | 0.1978 | 75% | 0.314 | +0.60 | 0.460 | 0.408 | 2.31 | 0.50 |
| 2019/20 | 0.1976 | 0.1927 | 83% | 0.369 | +0.69 | 0.545 | 0.551 | 2.32 | 0.47 |
| 2020/21 | 0.1982 | 0.1887 | 75% | 0.308 | +0.59 | 0.547 | 0.495 | 2.20 | 0.57 |
| 2021/22 | 0.2016 | 0.1955 | 78% | 0.335 | +0.61 | 0.525 | 0.510 | 2.15 | 0.63 |
| 2022/23 | 0.2058 | 0.2022 | 85% | 0.332 | +0.66 | 0.542 | 0.505 | 2.15 | 0.71 |
| 2023/24 | 0.1860 | 0.1809 | 88% | 0.406 | +0.71 | 0.658 | 0.628 | 2.38 | 0.44 |
| 2024/25 | 0.1987 | 0.1886 | 76% | 0.351 | +0.65 | 0.527 | 0.514 | 2.34 | 0.51 |
| 2025/26 | 0.2014 | 0.1965 | 82% | 0.349 | +0.71 | 0.462 | 0.417 | 2.26 | 0.62 |

League parameters fitted each Monday (averaged over the season), next to what happened:

| Season | Home advantage | Home goals boost | ρ | Home wins | Draws | Goals per match |
|---|---|---|---|---|---|---|
| 2017/18 | +0.267 | +30.6% | +0.001 | 47.1% | 22.6% | 2.69 |
| 2018/19 | +0.260 | +29.7% | +0.009 | 44.2% | 28.9% | 2.59 |
| 2019/20 | +0.304 | +35.5% | −0.046 | 45.8% | 27.6% | 2.48 |
| 2020/21 | +0.269 | +30.9% | −0.093 | 41.6% | 28.7% | 2.51 |
| 2021/22 | +0.230 | +25.9% | −0.099 | 43.4% | 29.2% | 2.50 |
| 2022/23 | +0.233 | +26.3% | −0.047 | 47.9% | 23.4% | 2.51 |
| 2023/24 | +0.281 | +32.4% | −0.009 | 43.9% | 28.2% | 2.64 |
| 2024/25 | +0.286 | +33.1% | −0.019 | 44.5% | 25.5% | 2.62 |
| 2025/26 | +0.254 | +28.9% | +0.006 | 48.9% | 24.5% | 2.69 |

- **The difficulty behaved the same way in every season,** including the two seasons with empty stadiums (spring
  2020 and 2020/21). The fitted home advantage reacted with a lag: 2021/22 and 2022/23 still carried the
  crowd-less games in their two-year window.
- **ρ turned clearly negative in the fits covering 2019/20–2021/22,** the lowest-scoring, most draw-heavy stretch:
  more 0-0 and 1-1 results than independent goals would give. It is fitted over the two-year window, so it follows
  the league with a lag too.
- **Fixtures added over club strength on Next 5 in 8 of 9 seasons** (2019/20 is the exception).

## 2.12 One board from the past

The production model's Next 5 ranking as it would have looked on Monday 2026-02-02, and what happened (rank
correlation 0.49):

| Rank | Club | Next 5: opponent (venue) difficulty | Exp. points | Points taken | Actual rank |
|---|---|---|---|---|---|
| 1 | Barcelona | Mallorca (H) 17, Girona (A) 28, Levante (H) 13, Villarreal (H) 27, Ath Bilbao (A) 41 | 11.2 | 12 | 1 |
| 2 | Real Madrid | Valencia (A) 31, Sociedad (H) 24, Osasuna (A) 34, Getafe (H) 21, Celta (A) 41 | 10.5 | 9 | 4 |
| 3 | Ath Madrid | Betis (H) 33, Vallecano (A) 41, Espanol (H) 25, Oviedo (A) 27, Sociedad (H) 30 | 10.3 | 9 | 4 |
| 4 | Villarreal | Espanol (H) 30, Getafe (A) 45, Levante (A) 42, Valencia (H) 28, Barcelona (A) 78 | 8.3 | 9 | 4 |
| 5 | Ath Bilbao | Levante (H) 35, Oviedo (A) 40, Elche (H) 40, Vallecano (A) 54, Barcelona (H) 67 | 7.9 | 10 | 3 |
| 6 | Betis | Ath Madrid (A) 75, Mallorca (A) 51, Vallecano (H) 37, Sevilla (H) 37, Getafe (A) 50 | 7.5 | 8 | 9 |
| 7 | Celta | Osasuna (H) 39, Espanol (A) 53, Mallorca (H) 38, Girona (A) 53, Real Madrid (H) 67 | 7.5 | 7 | 11 |
| 8 | Alaves | Getafe (H) 46, Sevilla (A) 63, Girona (H) 46, Levante (A) 58, Valencia (A) 59 | 6.8 | 2 | 18 |
| 9 | Sevilla | Mallorca (A) 59, Girona (H) 43, Alaves (H) 47, Getafe (A) 58, Betis (A) 71 | 6.7 | 6 | 13 |
| 10 | Sociedad | Elche (H) 44, Real Madrid (A) 82, Oviedo (H) 30, Mallorca (A) 57, Ath Madrid (A) 78 | 6.3 | 7 | 11 |
| 11 | Vallecano | Ath Madrid (H) 69, Betis (A) 71, Ath Bilbao (H) 57, Oviedo (H) 35, Sevilla (A) 63 | 6.2 | 9 | 4 |
| 12 | Elche | Sociedad (A) 65, Osasuna (H) 45, Ath Bilbao (A) 69, Espanol (H) 44, Villarreal (A) 76 | 6.0 | 2 | 18 |
| 13 | Osasuna | Celta (A) 69, Elche (A) 63, Real Madrid (H) 73, Valencia (A) 58, Mallorca (H) 45 | 5.7 | 8 | 9 |
| 14 | Espanol | Villarreal (A) 77, Celta (H) 56, Ath Madrid (A) 82, Elche (A) 65, Oviedo (H) 35 | 5.6 | 3 | 15 |
| 15 | Valencia | Real Madrid (H) 76, Levante (A) 62, Villarreal (A) 78, Osasuna (H) 51, Alaves (H) 51 | 5.4 | 9 | 4 |
| 16 | Mallorca | Sevilla (H) 50, Barcelona (A) 88, Betis (H) 58, Celta (A) 71, Sociedad (H) 54 | 5.4 | 3 | 15 |
| 17 | Girona | Sevilla (A) 65, Barcelona (H) 78, Alaves (A) 63, Celta (H) 56, Levante (A) 60 | 5.3 | 6 | 13 |
| 18 | Getafe | Alaves (A) 65, Villarreal (H) 65, Sevilla (H) 53, Real Madrid (A) 85, Betis (H) 60 | 5.2 | 12 | 1 |
| 19 | Levante | Ath Bilbao (A) 73, Valencia (H) 47, Villarreal (H) 66, Barcelona (A) 91, Alaves (H) 51 | 5.1 | 3 | 15 |
| 20 | Oviedo | Ath Bilbao (H) 70, Sociedad (A) 78, Ath Madrid (H) 81, Vallecano (A) 75, Espanol (A) 74 | 3.7 | 2 | 18 |

A typical Monday:
- **The top of the board held:** Barcelona's run of mostly Easy tiles brought 12 points out of 15.
- **The middle was noisy:** Getafe, 18th on the board, took 12 points; Alaves, 8th, took 2.
- **Over five games,** luck can still move a club a long way from its forecast.

## 2.13 Limitations

- **Sample:** one league and nine seasons. The first season (2017/18) had one season of history instead of two,
  because the cache starts in 2016/17.
- **Repeated forecasts:** pooled tables count each game up to 8 times. The confidence intervals resample whole
  blocks to account for that; forecast counts shouldn't be read as independent evidence.
- **Gameweeks:** runs use each club's next N games; the board uses gameweek columns. They are the same in LaLiga
  except for postponed games.
- **Data differences from production:**
  - production also fits on football-data.org results the CSV doesn't have yet, without shots on target; the
    backtest had shots for every game;
  - production's Odds lens uses earlier prices than the closing odds used here as the ceiling.
- **Table-form references** are simple constructions (19 games per venue, shrunk toward 1.1 points per game). They
  were not tuned, but other reasonable versions could score a little differently.
- **Not tested:** the midfielder 65/35 blend in "Who to pick" (no player data), whether a club's record at
  a price predicts its next games (it is shown as description only), and both-teams-to-score, which is read off the
  fitted score matrix and never scored against results.

## 2.14 What this means

Written before anything was changed. Part 3 records what was done with each of these.

1. **Decide what the Kindest / Toughest run card should answer.** It ranks expected points per game, which is mostly
   club strength: on Next 5 it named one of the three best-rated clubs on every Monday for nine seasons.
   - *If it should spotlight a soft schedule,* rank by schedule swing: expected points over the window minus the
     club's average per remaining game × games. That signal is real (+0.19 points per game for the pick over five
     games) and can be computed from the grid the frontend already has.
   - *If it should mean "most points coming",* keep the ranking and word the card that way.
2. **Read Next 8 and All mostly as a strength table.** Over eight games the fixtures add only +0.02 rank correlation
   beyond club strength, so schedule information at that range shows up in the swing far more than in the totals.
3. **Model work in `docs/next_features_plan.md` phase 6 is aimed at the right gaps:**
   - the biggest is information the market has: closing odds lead by 0.02 within-club correlation and 0.06 rank
     correlation on Next 5 (6.5, blend pre-match odds for the next gameweek);
   - then the extreme deciles (6.2, sharpening);
   - clean-sheet percentages 2–4 points high (6.3);
   - promoted clubs after week 8 (6.4).
4. **Keep the label cut points.** Blind re-estimates stayed within ~3 points, labels kept their order in every season
   and shares stayed near target.
5. **Soften one audit claim.** "Favourites under-confident (60–70% → 74%)" came from 2023/24–2025/26. Over nine
   seasons that bin is 71%, and the closing odds show the same, so the issue is mainly the extreme deciles.

## 2.15 Reproduce

From `backend/`, using only the cached CSVs in `data/raw/football-data-co-uk/` (about 2 minutes with 10 workers):

```powershell
.venv\Scripts\python reports\experiments\difficulty_backtest.py --out $env:TEMP\difficulty_tables.md --cache $env:TEMP\difficulty_state.pkl --workers 10
```

`--cache` stores the forecasts (about 55 MB), so later runs only redo the tables. The output is the appendix below.

---

# Part 3. What the backtest changed (2026-09-16)

Part 2 found four things wrong and one thing missing. Four have been acted on, one was built, tested and
rejected. Every number below comes from the same blind replay, through
[`reports/experiments/bench.py`](../backend/reports/experiments/bench.py), which pushes one candidate change
through the nine seasons and prints the difference with a 95% interval. Its self-test (`--variant spread=1.0`,
a change that changes nothing) comes out at exactly 0.0000, so what follows is the change and nothing else.

## 3.1 The run cards answer two different questions now

The old Kindest / Toughest run cards ranked expected points per game, which on Next 5 named a top-three club on
all 290 Mondays tested. That is worth knowing, but it is not what "kind run" means. There are two pairs now:

- **Most / fewest points coming** - the old ranking, honestly named.
- **Softest / hardest schedule** - the window against the club's *own* level: its expected points per game over
  the window minus its expected points per game over everything it has left from the same gameweek. A club needs
  at least twice the window remaining to be rated, as in the backtest.

On the board today the separation is immediate: Barcelona has the most points coming, while the softest schedule
belongs to Celta (+0.3 a game above its usual) and the hardest to Real Madrid (-0.3 below its own). The backtest
says the swing pick is worth about +0.70, +0.26, +0.19 and +0.12 points per game over the next 1, 3, 5 and 8
games compared with the club's own average: real, and modest.

## 3.2 The ratings are stretched, because the ridge shrank them too far

Part 2's calibration showed the extremes too cautious: the kindest tenth of fixtures forecast 2.24 points and
returned 2.38; the toughest forecast 0.56 and returned 0.45. The cause is the ridge penalty, which pulls every
club toward the prior and leaves the best and worst closer to average than they really are.

The fix is a `spread` setting: after the fit, stretch attack and defence around their mean and re-solve mu so the
league's expected goals are unchanged. It is chosen on the tuning seasons by **log loss**, because RPS mostly
scores which side is favoured and barely separates the candidates:

| spread | RPS (tuning seasons) | log loss |
|---|---|---|
| 1.00 | 0.2007 | 0.9974 |
| 1.05 | 0.2005 | 0.9969 |
| **1.10** | **0.2005** | **0.9967** |
| 1.15 | 0.2005 | 0.9968 |
| 1.20 | 0.2006 | 0.9971 |
| 1.25 | 0.2007 | 0.9977 |

The tuning seasons picked 1.10 knowing nothing about the other five, and the nine-season log-loss curve bottoms
out in the same place. On the blind replay the top-and-bottom-decile miss falls from **0.123 to 0.065 points per
game** - the closing odds' own figure is 0.060 - while RPS goes from 0.1994 to 0.1990 (test seasons 0.1953 to
**0.1947**) and the board's ordering is untouched (within-club -0.001, 95% -0.002 to +0.000).

**The obvious alternative is worse.** Loosening the ridge instead reaches similar calibration and damages
everything else: `ridge=0.5` costs +0.0005 RPS and -0.004 within-club correlation (95% -0.006 to -0.001), with
every run length down 0.005 to 0.007. The ridge is doing real work holding clubs with few matches steady; the
spread undoes its side effect without undoing the ridge.

## 3.3 Clean-sheet chances are corrected before they are shown

Clean sheets ran about 2 points high over nine seasons and 4 points high on 2023/24-2025/26. Refitting the goal
model to fix that would move win/draw/loss, which is well calibrated, so the correction is applied afterwards:

    p' = sigmoid(a + b * logit(p))

fitted on the tuning seasons only (22,334 forecasts, a = -0.154, b = 0.932), capped and shrunk toward doing
nothing so a thin or odd sample cannot produce a wild correction. On the test seasons the average predicted
clean-sheet chance moves from 30.8% to **28.8%** against 26.1% observed, and the Brier score from 0.1818 to
**0.1803**. About half the bias goes; the rest is there because the tuning seasons were less biased than the test
seasons. Win, draw and loss - and so the difficulty score - are untouched.

## 3.4 The next gameweek carries bookmaker prices

The market was always the ceiling, and the only free way to close part of that gap is to use the prices. For
fixtures **within seven days** with a price from at least three bookmakers, fetched in the last 48 hours, the
model's win/draw/loss is pooled with the market's:

    p is proportional to p_model^(1-w) * p_market^w

Research used pre-closing prices only (`PSH` / `AvgH` / `B365H`); the closing line stays the ceiling and never
reaches a shipped method. The gain rises with the weight, and so does the cost, because bookmakers move their
prices as kickoff nears and the tiles move with them:

| weight | next-week RPS gain | tiles holding their colour from 4-5 weeks out |
|---|---|---|
| none | - | 88.0% |
| 0.25 | -0.0021 | 83.8% |
| **0.35** | **-0.0027 (-0.0034 to -0.0021)** | **80.9%** |
| 0.50 | -0.0036 | 77.2% |
| 0.80 | -0.0047 | 68.8% |
| 1.00 (pure market) | -0.0050 | - |

There is no accuracy-optimal weight: on next-week games the pre-closing price alone (RPS 0.1941) beats the model
(0.1990) and gets 85% of the way to the closing line (0.1932). So the weight is a decision about how much the
board may shift under a planner's feet, and it is set to **0.35** in `artifacts/market_blend.json` - a moderate
tint, about one tile in five changing colour in its final week instead of one in eight. Within-club ordering
improves slightly as well (+0.001, 95% +0.001 to +0.002). The Odds lens stays the pure-market view.

## 3.5 Reading a finished match: what actually happened

**On the board (added 2026-09-20).** A played tile keeps the forecast it carried before kickoff and shows three of
these numbers: the chance the forecast gave the result that happened, the points won against the expected points,
and `surprise_percentile` (the tile prints `100 − surprise`, so a big number means a shock and a red one means the
forecast put under a fifth of its probability on results that odd). The row comes from `fixture_grid`
`historic_predictions` — the newest prediction row per fixture side, **not** filtered by model version, because the
point is what the board said at the time; a forecast old enough to carry the pre-2026-09-16 label words keeps its
numbers and is renamed in today's vocabulary. Performance gap and the verdicts stay research-only: shots on target
and red cards are not in the database.


[`app/services/postmortem.py`](../backend/app/services/postmortem.py) reads every finished match against the
forecast that preceded it, using two numbers:

- **Surprise** - how unlikely the result was under that same forecast, as a share of its own distribution. Exact,
  not simulated: with three outcomes you score each one and add up the probability of those at least as
  surprising as what happened. Below 20% counts as surprising.
- **Performance gap** - the club's shots on target valued at the league's conversion rate (0.330 goals per shot
  on target) against the goals the model expected. Goals are noisy; shots are less so.

Each club-match is filed as *as forecast*, *variance* (surprising, but the club played as forecast, or a red card
changed the game), *evidence* (surprising, and the shots agree the club was off), or *data* (no shot counts).
Over nine seasons: 96.1% as forecast, 2.4% variance, 1.4% evidence. It reads like this:

| club | opponent | forecast | what the review says |
|---|---|---|---|
| Celta | Oviedo | 2.26 xPts | 0-3, but the play matched the forecast (2.0 from shots against 2.1 expected) - finishing and keeping, not the rating |
| Oviedo | Celta | 0.55 xPts | 3-0, and played better than forecast (1.7 from shots against 0.7 expected) - a sign the rating is off |
| Real Madrid | Getafe | 2.37 xPts | 0-1 with a red card: the match stopped being the one that was forecast |

**But the labels describe; they do not predict.** Of the kind fixtures (top third of forecasts) that were lost,
the clubs filed as *evidence* took 1.89 points per game over the next four weeks and those filed as *variance*
took 1.63 - that is 0.27 **more** for the group the review called a rating problem, plus or minus 0.32 at 95%.
Whatever the review sees in a match, it is not a head start on the next one.

## 3.6 What did not work: reacting faster to clubs we keep getting wrong

The obvious next step was to act on that. Run a CUSUM on each club's goal residuals, attack and defence apart, and
when the model keeps missing a club in the same direction, weight its recent matches up in the next fit so the
ratings move toward what they are seeing. It is built
([`app/services/drift.py`](../backend/app/services/drift.py), with `fit_dixon_coles(..., match_weights=)`),
tested, and **it does not ship**, because it does not work:

| response | RPS difference | within-club correlation |
|---|---|---|
| gentle (boost 1.5, threshold 3.0) | +0.0001 (-0.0001 to +0.0002) | -0.000 |
| default (boost 2.0, threshold 2.0) | +0.0002 (-0.0002 to +0.0005) | -0.001 |
| strong (boost 3.0, threshold 4.0) | **+0.0005 (+0.0001 to +0.0008)** | **-0.003 (-0.005 to -0.001)** |

Every setting is neutral or worse, and the harder the model reacts the worse it gets. Probing the test directly
shows why: at the default threshold it fires on **42% of club-weeks**, about 15 alarms per club-season, so it is
not finding rare shifts - it is flagging ordinary noise. What little signal survives is far too small to justify
moving a rating: over the next four weeks, clubs alarmed for scoring above expectation beat expectation by 0.063
goals a game against 0.037 for clubs with no alarm. Promoted clubs, the group this was meant to help, alarm *less*
often than the rest (34.6% against 43.4%) - their prior already leaves them loose.

It is the same lesson as the ridge in 3.2 from the other direction: the model's apparent slowness is mostly the
shrinkage that keeps it honest, and speeding it up costs more than it returns.

## 3.7 What "keeps learning" means here

Two of the three corrections above are **fitted from past results and re-fitted whenever the backtest is re-run**:
the rating spread (3.2) and the clean-sheet correction (3.3) both come out of `python -m app.jobs.backtest`, which
walks forward through the tuning seasons and writes `artifacts/`. Run it after a season and it re-estimates both
from everything played up to then; the model version hashes them, so the next refresh replaces the prediction rows
instead of mixing old numbers with new. The label cut points are re-estimated at the same time but deliberately
**not** applied: blind re-estimates have stayed within about 1.2 points, and silently recolouring the board would
cost more trust than the accuracy is worth. They are reported so that a real drift would be noticed.

What is missing is production memory. Predictions are replaced every refresh, so the app keeps no record of what
it said before a game, which is why the post-mortem in 3.5 runs on the research history. Storing each pre-match
forecast (an append-only table, about 1,500 rows a season) is what the loop would need to run on the board's own
forecasts rather than on replays: worth doing when there is a reason to show a review in the UI, and not before,
given 3.6.

## 3.8 Reproduce any of this

From `backend/`, using only the cached CSVs:

```powershell
# the nine-season replay behind Part 2 (about 2 minutes with 10 workers)
.venv\Scripts\python reports\experiments\difficulty_backtest.py --out $env:TEMP\fdr_tables.md --cache $env:TEMP\fdr_state.pkl --workers 10
# one candidate change against it, with intervals (about 20 seconds once the cache exists)
.venv\Scripts\python reports\experiments\bench.py --variant spread=1.15 --cache $env:TEMP\fdr_state.pkl --workers 10
# the post-match review of 3.5
.venv\Scripts\python reports\experiments\review.py --cache $env:TEMP\fdr_state.pkl --out $env:TEMP\review.md
```

---

# Appendix: raw tables from the script

<details>
<summary>All result tables as generated (click to expand)</summary>

# Fixture difficulty backtest: result tables

Generated by `reports/experiments/difficulty_backtest.py`.

### 0. Setup and reproduction check

- Matches loaded: 3800 (2016/17 to 2025/26). Test seasons 2017/18 to 2025/26: 3420 matches, 3420 with closing odds.
- Cutoffs (Mondays): 374; with at least one new result since the previous Monday: 317.
- Forecasts per method: 75480 (every remaining match at every cutoff), 25102 within 8 weeks.
- Model fits that did not converge: 0.

The harness reproduces `app.jobs.backtest` on 2023/24 to 2025/26 (within 8 weeks, matches with closing odds):

| method | forecasts | rps | published rps |
|---|---|---|---|
| Dixon-Coles, production settings | 8339 | 0.1947 | 0.1953 |
| Closing odds (ceiling) | 8339 | 0.1886 | 0.1886 |
| Elo (old scaffold) | 8339 | 0.2050 | 0.2050 |
| Venue only | 8339 | 0.2255 | 0.2255 |

| label | forecasts | actual_ppg | published_forecasts | published_ppg |
|---|---|---|---|---|
| Easy | 2957 | 2.29 | 2717 | 2.32 |
| Easy-ish | 3110 | 1.70 | 3284 | 1.70 |
| Normal | 4524 | 1.35 | 4746 | 1.35 |
| Hard-ish | 3231 | 0.98 | 3335 | 0.95 |
| Hard | 2856 | 0.54 | 2596 | 0.53 |

### 1. Blind settings and fitted league parameters

Settings the blind variant used for each season (production: xi 0.001, goals_weight 0.7, ridge 1.0, promoted_prior 0.0, cut points 37.4 / 48.6 / 61.1 / 71.3):

| season | tuned on | xi | goals_weight | ridge | promoted_prior | label cut points |
|---|---|---|---|---|---|---|
| 2017/18 | nothing earlier: code defaults | 0.002 | 0.7 | 2.0 | -0.2 | 34.8 / 47.3 / 61.9 / 72.8 |
| 2018/19 | 2017/18 | 0.002 | 1.0 | 4.0 | +0.0 | 34.3 / 47.9 / 61.0 / 73.6 |
| 2019/20 | 2017/18, 2018/19 | 0.001 | 1.0 | 4.0 | -0.2 | 35.5 / 47.1 / 61.8 / 72.4 |
| 2020/21 | 2017/18, 2018/19, 2019/20 | 0.001 | 1.0 | 4.0 | +0.0 | 36.9 / 48.0 / 61.1 / 71.5 |
| 2021/22 | 2017/18, 2018/19, 2019/20, 2020/21 | 0.001 | 1.0 | 4.0 | -0.2 | 36.2 / 47.7 / 61.6 / 72.1 |
| 2022/23 | 2018/19, 2019/20, 2020/21, 2021/22 | 0.000 | 0.7 | 4.0 | -0.2 | 38.1 / 48.5 / 61.1 / 70.6 |
| 2023/24 | 2019/20, 2020/21, 2021/22, 2022/23 | 0.001 | 0.7 | 1.0 | +0.0 | 37.4 / 48.6 / 61.1 / 71.3 |
| 2024/25 | 2020/21, 2021/22, 2022/23, 2023/24 | 0.001 | 0.7 | 1.0 | +0.0 | 36.9 / 48.4 / 61.3 / 71.6 |
| 2025/26 | 2021/22, 2022/23, 2023/24, 2024/25 | 0.001 | 0.7 | 1.0 | -0.2 | 36.4 / 48.2 / 61.4 / 72.0 |

League parameters fitted each Monday (blind settings), averaged over the season, with what happened:

| season | home advantage (mean fit) | range over the season | home goals boost | rho | home wins | draws | goals per match |
|---|---|---|---|---|---|---|---|
| 2017/18 | +0.267 | +0.245 to +0.305 | +30.6% | +0.001 | 47.1% | 22.6% | 2.69 |
| 2018/19 | +0.260 | +0.229 to +0.291 | +29.7% | +0.009 | 44.2% | 28.9% | 2.59 |
| 2019/20 | +0.304 | +0.267 to +0.327 | +35.5% | -0.046 | 45.8% | 27.6% | 2.48 |
| 2020/21 | +0.269 | +0.233 to +0.298 | +30.9% | -0.093 | 41.6% | 28.7% | 2.51 |
| 2021/22 | +0.230 | +0.204 to +0.253 | +25.9% | -0.099 | 43.4% | 29.2% | 2.50 |
| 2022/23 | +0.233 | +0.202 to +0.282 | +26.3% | -0.047 | 47.9% | 23.4% | 2.51 |
| 2023/24 | +0.281 | +0.262 to +0.294 | +32.4% | -0.009 | 43.9% | 28.2% | 2.64 |
| 2024/25 | +0.286 | +0.252 to +0.310 | +33.1% | -0.019 | 44.5% | 25.5% | 2.62 |
| 2025/26 | +0.254 | +0.230 to +0.276 | +28.9% | +0.006 | 48.9% | 24.5% | 2.69 |

### 2. Match forecasts

Every forecast within 8 weeks, all 9 seasons (each match forecast once per week ahead):

| method | forecasts | rps | log_loss | accuracy |
|---|---|---|---|---|
| Dixon-Coles, blind settings | 25102 | 0.1994 | 0.9897 | 52.0% |
| Dixon-Coles, production settings | 25102 | 0.1990 | 0.9885 | 52.0% |
| Closing odds (ceiling) | 25102 | 0.1932 | 0.9698 | 53.9% |
| Elo (old scaffold) | 25102 | 0.2079 | 1.0214 | 51.3% |
| Venue only | 25102 | 0.2250 | 1.0668 | 45.8% |

RPS by season (lower is better):

| method | 2017/18 | 2018/19 | 2019/20 | 2020/21 | 2021/22 | 2022/23 | 2023/24 | 2024/25 | 2025/26 | all 9 | 2023/24–2025/26 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Dixon-Coles, blind settings | 0.2015 | 0.2038 | 0.1976 | 0.1982 | 0.2016 | 0.2058 | 0.1860 | 0.1987 | 0.2014 | 0.1994 | 0.1953 |
| Dixon-Coles, production settings | 0.2018 | 0.2031 | 0.1964 | 0.1970 | 0.2016 | 0.2069 | 0.1847 | 0.1980 | 0.2014 | 0.1990 | 0.1947 |
| Closing odds (ceiling) | 0.1956 | 0.1978 | 0.1927 | 0.1887 | 0.1955 | 0.2022 | 0.1809 | 0.1886 | 0.1965 | 0.1932 | 0.1886 |
| Elo (old scaffold) | 0.2115 | 0.2112 | 0.2100 | 0.2032 | 0.2063 | 0.2141 | 0.1966 | 0.2075 | 0.2110 | 0.2079 | 0.2050 |
| Venue only | 0.2294 | 0.2219 | 0.2220 | 0.2262 | 0.2230 | 0.2257 | 0.2222 | 0.2305 | 0.2240 | 0.2250 | 0.2255 |

Only the last forecast before each match (the week it is played):

| method | forecasts | rps | log_loss | accuracy |
|---|---|---|---|---|
| Dixon-Coles, blind settings | 3420 | 0.1990 | 0.9899 | 52.0% |
| Dixon-Coles, production settings | 3420 | 0.1987 | 0.9887 | 51.9% |
| Closing odds (ceiling) | 3420 | 0.1932 | 0.9711 | 53.8% |
| Elo (old scaffold) | 3420 | 0.2075 | 1.0206 | 51.5% |
| Venue only | 3420 | 0.2255 | 1.0696 | 45.3% |

Differences in RPS with 95% intervals from resampling match weeks (negative = first method better):

| comparison | seasons | forecasts | match weeks | RPS difference | 95% low | 95% high |
|---|---|---|---|---|---|---|
| Dixon-Coles, blind settings − Elo (old scaffold) | all 9 | 25102 | 317 | -0.0085 | -0.0104 | -0.0066 |
| Dixon-Coles, blind settings − Venue only | all 9 | 25102 | 317 | -0.0256 | -0.0293 | -0.0219 |
| Dixon-Coles, blind settings − Closing odds (ceiling) | all 9 | 25102 | 317 | +0.0062 | +0.0042 | +0.0083 |
| Dixon-Coles, production settings − Dixon-Coles, blind settings | 2017/18–2022/23 | 16763 | 207 | -0.0003 | -0.0012 | +0.0007 |
| Dixon-Coles, production settings − Dixon-Coles, blind settings | 2019/20–2022/23 | 11167 | 137 | -0.0003 | -0.0015 | +0.0009 |
| Dixon-Coles, production settings − Elo (old scaffold) | 2023/24–2025/26 | 8339 | 110 | -0.0103 | -0.0135 | -0.0069 |
| Dixon-Coles, production settings − Closing odds (ceiling) | 2023/24–2025/26 | 8339 | 110 | +0.0061 | +0.0029 | +0.0092 |

### 3. Difficulty labels against what happened

Blind settings and cut points, all 9 seasons. Every club's forecast within 8 weeks counts once per week ahead:

| label | forecasts | share | expected_ppg | actual_ppg | expected_win | actual_win | draw | loss | goals_for | goals_against | clean_sheets |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Easy | 7297 | 14.5% | 2.15 | 2.26 | 64.8% | 69.4% | 18.2% | 12.4% | 2.09 | 0.83 | 44.5% |
| Easy-ish | 10016 | 20.0% | 1.72 | 1.76 | 48.4% | 48.7% | 29.6% | 21.8% | 1.50 | 1.00 | 35.2% |
| Normal | 15387 | 30.6% | 1.36 | 1.36 | 35.7% | 35.4% | 29.9% | 34.8% | 1.21 | 1.20 | 28.6% |
| Hard-ish | 10214 | 20.3% | 1.01 | 0.94 | 24.7% | 21.4% | 29.7% | 48.9% | 1.00 | 1.50 | 20.0% |
| Hard | 7290 | 14.5% | 0.64 | 0.56 | 14.2% | 12.6% | 18.0% | 69.4% | 0.82 | 2.08 | 11.4% |

Production settings and cut points, 2023/24 to 2025/26 (blind for production):

| label | forecasts | share | expected_ppg | actual_ppg | expected_win | actual_win | draw | loss | goals_for | goals_against | clean_sheets |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Easy | 2957 | 17.7% | 2.16 | 2.29 | 65.4% | 70.4% | 17.5% | 12.1% | 2.14 | 0.87 | 41.5% |
| Easy-ish | 3110 | 18.6% | 1.70 | 1.70 | 47.6% | 46.2% | 31.0% | 22.7% | 1.40 | 1.02 | 34.3% |
| Normal | 4524 | 27.1% | 1.36 | 1.35 | 35.7% | 35.1% | 29.7% | 35.1% | 1.27 | 1.27 | 25.9% |
| Hard-ish | 3231 | 19.4% | 1.03 | 0.98 | 25.1% | 22.2% | 31.3% | 46.5% | 1.01 | 1.41 | 19.3% |
| Hard | 2856 | 17.1% | 0.62 | 0.54 | 14.0% | 12.3% | 16.9% | 70.8% | 0.87 | 2.14 | 9.5% |

Actual points per game by label in each season (blind; share of forecasts in brackets):

| season | Easy | Easy-ish | Normal | Hard-ish | Hard | falls at every step |
|---|---|---|---|---|---|---|
| 2017/18 | 2.30 (14%) | 1.82 (20%) | 1.37 (33%) | 0.93 (18%) | 0.51 (15%) | yes |
| 2018/19 | 2.31 (10%) | 1.72 (25%) | 1.34 (29%) | 0.97 (26%) | 0.50 (10%) | yes |
| 2019/20 | 2.32 (13%) | 1.78 (19%) | 1.36 (35%) | 0.97 (20%) | 0.47 (13%) | yes |
| 2020/21 | 2.20 (14%) | 1.79 (20%) | 1.38 (31%) | 0.88 (20%) | 0.57 (15%) | yes |
| 2021/22 | 2.15 (15%) | 1.75 (19%) | 1.35 (30%) | 0.97 (20%) | 0.63 (16%) | yes |
| 2022/23 | 2.15 (16%) | 1.81 (18%) | 1.36 (31%) | 0.90 (18%) | 0.71 (16%) | yes |
| 2023/24 | 2.38 (16%) | 1.81 (20%) | 1.35 (28%) | 0.81 (21%) | 0.44 (15%) | yes |
| 2024/25 | 2.34 (16%) | 1.68 (20%) | 1.36 (28%) | 1.01 (20%) | 0.51 (16%) | yes |
| 2025/26 | 2.26 (16%) | 1.66 (19%) | 1.36 (31%) | 1.00 (19%) | 0.62 (15%) | yes |

Labels by venue (blind, all 9 seasons):

| venue | Easy | Easy-ish | Normal | Hard-ish | Hard | mean difficulty |
|---|---|---|---|---|---|---|
| A | 5.5% | 10.8% | 30.5% | 29.6% | 23.7% | 61.7 |
| H | 23.6% | 29.1% | 30.8% | 11.1% | 5.4% | 46.9 |

### 4. Calibration

Expected points per game against actual points per game, by decile of the forecast (within 8 weeks):

| expected-points decile | Dixon-Coles, blind settings: predicted | Dixon-Coles, blind settings: actual | Closing odds (ceiling): predicted | Closing odds (ceiling): actual |
|---|---|---|---|---|
| 1 | 0.56 | 0.45 | 0.47 | 0.42 |
| 2 | 0.85 | 0.82 | 0.77 | 0.77 |
| 3 | 1.02 | 0.96 | 0.96 | 0.89 |
| 4 | 1.16 | 1.08 | 1.12 | 1.00 |
| 5 | 1.29 | 1.26 | 1.27 | 1.19 |
| 6 | 1.42 | 1.42 | 1.42 | 1.47 |
| 7 | 1.55 | 1.64 | 1.58 | 1.68 |
| 8 | 1.71 | 1.73 | 1.76 | 1.83 |
| 9 | 1.90 | 1.94 | 1.98 | 2.01 |
| 10 | 2.24 | 2.38 | 2.35 | 2.42 |

Win chance as forecast against how often the club won:

| predicted win chance | Dixon-Coles, blind settings: forecasts | Dixon-Coles, blind settings: predicted | Dixon-Coles, blind settings: actual | Closing odds (ceiling): forecasts | Closing odds (ceiling): predicted | Closing odds (ceiling): actual |
|---|---|---|---|---|---|---|
| 0–10% | 1415 | 7.8% | 8.9% | 2367 | 7.3% | 7.9% |
| 10–20% | 6169 | 15.8% | 13.5% | 7740 | 15.5% | 14.8% |
| 20–30% | 10921 | 25.2% | 22.1% | 10214 | 25.2% | 22.2% |
| 30–40% | 11650 | 34.9% | 34.0% | 10027 | 34.9% | 33.2% |
| 40–50% | 9303 | 44.7% | 45.5% | 7766 | 44.7% | 47.7% |
| 50–60% | 5959 | 54.7% | 56.6% | 5910 | 54.9% | 55.0% |
| 60–70% | 2994 | 64.3% | 71.1% | 3337 | 65.0% | 70.6% |
| 70–80% | 1450 | 74.5% | 77.6% | 2004 | 74.4% | 79.3% |
| 80–90% | 339 | 82.9% | 82.0% | 820 | 83.7% | 78.3% |
| 90–100% | 4 | 91.0% | 100.0% | 19 | 91.8% | 100.0% |

### 5. Telling a club's easy games from its hard ones

Every Monday, among each club's games in the next 8 weeks as forecast that Monday, so all forecasts in a
comparison share the same information and the club's own strength drops out: correlation of forecast and result after
removing each Monday's averages, and points per game in the kinder and tougher half of those games (an odd count
leaves its middle game out).

| method | forecasts | within-club correlation | kinder half | tougher half | kinder − tougher |
|---|---|---|---|---|---|
| Dixon-Coles, blind settings | 50204 | 0.349 | 1.70 | 1.03 | +0.67 |
| Dixon-Coles, production settings | 50204 | 0.349 | 1.71 | 1.03 | +0.68 |
| Closing odds (ceiling) | 50204 | 0.366 | 1.73 | 1.00 | +0.72 |
| Elo (old scaffold) | 50204 | 0.341 | 1.69 | 1.04 | +0.65 |
| Form of both clubs | 50204 | 0.311 | 1.69 | 1.05 | +0.64 |
| Opponent form (FPL-style) | 50204 | 0.314 | 1.67 | 1.06 | +0.62 |
| Venue only | 50204 | 0.223 | 1.62 | 1.11 | +0.51 |

Closing odds are set just before each game, after the earlier games in the window were played, so they learn from
results inside the comparison; that biases their numbers down, not up.

Differences in within-club correlation, 95% intervals from resampling club-seasons:

| comparison | club-seasons | difference | 95% low | 95% high |
|---|---|---|---|---|
| Dixon-Coles, blind settings − Closing odds (ceiling) | 180 | -0.017 | -0.028 | -0.007 |
| Dixon-Coles, blind settings − Elo (old scaffold) | 180 | +0.008 | +0.002 | +0.014 |
| Dixon-Coles, blind settings − Form of both clubs | 180 | +0.037 | +0.025 | +0.050 |
| Dixon-Coles, blind settings − Opponent form (FPL-style) | 180 | +0.034 | +0.022 | +0.047 |
| Dixon-Coles, blind settings − Venue only | 180 | +0.126 | +0.105 | +0.146 |

A whole season from the pre-season forecasts only (the Monday before round 1, each club's games in thirds; closing
odds left out because they are set during the season):

| method | games | within-club correlation | kindest third | middle third | toughest third | kindest − toughest |
|---|---|---|---|---|---|---|
| Dixon-Coles, blind settings | 6840 | 0.320 | 1.80 | 1.35 | 0.92 | +0.88 |
| Dixon-Coles, production settings | 6840 | 0.326 | 1.81 | 1.35 | 0.90 | +0.91 |
| Elo (old scaffold) | 6840 | 0.312 | 1.81 | 1.34 | 0.93 | +0.88 |
| Form of both clubs | 6840 | 0.286 | 1.80 | 1.29 | 0.98 | +0.82 |
| Opponent form (FPL-style) | 6840 | 0.289 | 1.73 | 1.38 | 0.97 | +0.76 |
| Venue only | 6840 | 0.205 | 1.63 | 1.35 | 1.10 | +0.53 |

Per lens (blind settings, Mondays as in the first table; results in goals / clean-sheet rate / points):

| lens | forecasts | within-club correlation | kinder half | tougher half | kinder − tougher |
|---|---|---|---|---|---|
| Overall: expected points → points | 50204 | 0.349 | 1.702 | 1.030 | +0.672 |
| Attack: expected goals → goals scored | 50204 | 0.257 | 1.514 | 1.074 | +0.441 |
| Defence: clean-sheet chance → clean sheets | 50204 | 0.211 | 0.353 | 0.208 | +0.145 |

### 6. Ranking runs of fixtures across clubs

At every Monday with new results (next 1: 317, next 3: 306, next 5: 290, next 8: 268 cutoffs), each club's next N games.
Rank correlation (Spearman) between the run total and the points the club actually took, averaged over cutoffs:

| method | next 1 | next 3 | next 5 | next 8 |
|---|---|---|---|---|
| Dixon-Coles, blind settings | 0.418 | 0.469 | 0.528 | 0.581 |
| Dixon-Coles, production settings | 0.415 | 0.471 | 0.529 | 0.583 |
| Closing odds (ceiling) | 0.453 | 0.521 | 0.591 | 0.657 |
| Elo (old scaffold) | 0.409 | 0.450 | 0.501 | 0.556 |
| Form of both clubs | 0.371 | 0.433 | 0.485 | 0.546 |
| Opponent form (FPL-style) | 0.287 | 0.181 | 0.158 | 0.155 |
| Club rating only | 0.265 | 0.419 | 0.497 | 0.562 |
| Venue only | 0.187 | 0.112 | 0.100 | 0.094 |

Differences in mean rank correlation, 95% intervals from resampling two-month blocks of cutoffs:

| run | comparison | difference | 95% low | 95% high |
|---|---|---|---|---|
| next 1 | Closing odds (ceiling) − Dixon-Coles, blind settings | +0.035 | +0.021 | +0.050 |
| next 1 | Dixon-Coles, blind settings − Elo (old scaffold) | +0.009 | -0.005 | +0.022 |
| next 1 | Dixon-Coles, blind settings − Form of both clubs | +0.047 | +0.025 | +0.067 |
| next 1 | Dixon-Coles, blind settings − Club rating only | +0.153 | +0.134 | +0.171 |
| next 3 | Closing odds (ceiling) − Dixon-Coles, blind settings | +0.051 | +0.036 | +0.068 |
| next 3 | Dixon-Coles, blind settings − Elo (old scaffold) | +0.019 | +0.006 | +0.033 |
| next 3 | Dixon-Coles, blind settings − Form of both clubs | +0.037 | +0.016 | +0.056 |
| next 3 | Dixon-Coles, blind settings − Club rating only | +0.050 | +0.035 | +0.065 |
| next 5 | Closing odds (ceiling) − Dixon-Coles, blind settings | +0.063 | +0.044 | +0.083 |
| next 5 | Dixon-Coles, blind settings − Elo (old scaffold) | +0.027 | +0.013 | +0.042 |
| next 5 | Dixon-Coles, blind settings − Form of both clubs | +0.043 | +0.020 | +0.064 |
| next 5 | Dixon-Coles, blind settings − Club rating only | +0.031 | +0.015 | +0.046 |
| next 8 | Closing odds (ceiling) − Dixon-Coles, blind settings | +0.077 | +0.054 | +0.100 |
| next 8 | Dixon-Coles, blind settings − Elo (old scaffold) | +0.025 | +0.009 | +0.041 |
| next 8 | Dixon-Coles, blind settings − Form of both clubs | +0.035 | +0.012 | +0.056 |
| next 8 | Dixon-Coles, blind settings − Club rating only | +0.019 | +0.005 | +0.031 |

Points per game actually taken by the kindest and toughest run (and the five kindest / five toughest) on the board:

| run | method | kindest | toughest | kindest outscored toughest | five kindest | five toughest |
|---|---|---|---|---|---|---|
| next 1 | Dixon-Coles, blind settings | 2.41 | 0.46 | 77% | 2.08 | 0.70 |
| next 1 | Dixon-Coles, production settings | 2.38 | 0.47 | 77% | 2.09 | 0.69 |
| next 1 | Closing odds (ceiling) | 2.40 | 0.49 | 77% | 2.14 | 0.65 |
| next 1 | Elo (old scaffold) | 2.35 | 0.53 | 74% | 2.07 | 0.73 |
| next 1 | Form of both clubs | 2.41 | 0.47 | 74% | 2.03 | 0.78 |
| next 1 | Opponent form (FPL-style) | 1.93 | 0.53 | 69% | 1.85 | 0.88 |
| next 1 | Club rating only | 2.28 | 0.97 | 58% | 1.92 | 1.02 |
| next 1 | Venue only | 1.61 | 1.17 | 45% | 1.63 | 1.14 |
| next 3 | Dixon-Coles, blind settings | 2.30 | 0.76 | 91% | 1.96 | 0.95 |
| next 3 | Dixon-Coles, production settings | 2.27 | 0.81 | 90% | 1.95 | 0.94 |
| next 3 | Closing odds (ceiling) | 2.30 | 0.67 | 93% | 2.00 | 0.87 |
| next 3 | Elo (old scaffold) | 2.25 | 0.85 | 89% | 1.95 | 0.96 |
| next 3 | Form of both clubs | 2.24 | 0.85 | 88% | 1.91 | 0.98 |
| next 3 | Opponent form (FPL-style) | 1.71 | 1.06 | 65% | 1.57 | 1.17 |
| next 3 | Club rating only | 2.28 | 0.92 | 90% | 1.91 | 1.03 |
| next 3 | Venue only | 1.44 | 1.30 | 52% | 1.46 | 1.30 |
| next 5 | Dixon-Coles, blind settings | 2.25 | 0.80 | 96% | 1.94 | 1.00 |
| next 5 | Dixon-Coles, production settings | 2.26 | 0.84 | 96% | 1.93 | 0.99 |
| next 5 | Closing odds (ceiling) | 2.31 | 0.72 | 96% | 1.97 | 0.93 |
| next 5 | Elo (old scaffold) | 2.24 | 0.92 | 91% | 1.93 | 1.02 |
| next 5 | Form of both clubs | 2.22 | 0.90 | 92% | 1.90 | 1.03 |
| next 5 | Opponent form (FPL-style) | 1.63 | 1.11 | 66% | 1.52 | 1.23 |
| next 5 | Club rating only | 2.28 | 0.92 | 96% | 1.91 | 1.04 |
| next 5 | Venue only | 1.49 | 1.29 | 57% | 1.43 | 1.31 |
| next 8 | Dixon-Coles, blind settings | 2.24 | 0.85 | 97% | 1.92 | 1.01 |
| next 8 | Dixon-Coles, production settings | 2.23 | 0.86 | 97% | 1.91 | 1.00 |
| next 8 | Closing odds (ceiling) | 2.32 | 0.76 | 98% | 1.96 | 0.95 |
| next 8 | Elo (old scaffold) | 2.26 | 1.00 | 96% | 1.92 | 1.05 |
| next 8 | Form of both clubs | 2.20 | 0.98 | 97% | 1.91 | 1.05 |
| next 8 | Opponent form (FPL-style) | 1.55 | 1.17 | 66% | 1.48 | 1.24 |
| next 8 | Club rating only | 2.27 | 0.91 | 98% | 1.91 | 1.04 |
| next 8 | Venue only | 1.50 | 1.34 | 56% | 1.47 | 1.31 |

Is the kindest run just the strongest club? (blind board, club rating from the same fit):

| run | kindest run = best-rated club | kindest run = a top-3 club | toughest run = worst-rated club |
|---|---|---|---|
| next 1 | 43% | 82% | 18% |
| next 3 | 69% | 100% | 45% |
| next 5 | 76% | 100% | 59% |
| next 8 | 80% | 100% | 66% |

Schedule swing: is a club's next run kinder than the rest of its own season? Rank correlation of forecast swing
(run total − N × the club's average remaining game) with the same swing in real points:

| method | next 1 | next 3 | next 5 | next 8 |
|---|---|---|---|---|
| Dixon-Coles, blind settings | 0.315 | 0.213 | 0.185 | 0.155 |
| Dixon-Coles, production settings | 0.316 | 0.207 | 0.185 | 0.152 |
| Closing odds (ceiling) | 0.340 | 0.268 | 0.285 | 0.287 |
| Elo (old scaffold) | 0.308 | 0.203 | 0.169 | 0.133 |
| Form of both clubs | 0.285 | 0.187 | 0.165 | 0.139 |
| Opponent form (FPL-style) | 0.288 | 0.177 | 0.153 | 0.139 |
| Venue only | 0.184 | 0.114 | 0.097 | 0.069 |

What the club with the kindest (toughest) forecast swing then took, in points per game against its own average over
the rest of the season:

| run | method | kindest swing: real points per game vs usual | toughest swing: real points per game vs usual |
|---|---|---|---|
| next 1 | Dixon-Coles, blind settings | +0.70 | -0.83 |
| next 1 | Dixon-Coles, production settings | +0.65 | -0.83 |
| next 1 | Closing odds (ceiling) | +0.59 | -0.86 |
| next 1 | Elo (old scaffold) | +0.60 | -0.80 |
| next 1 | Form of both clubs | +0.48 | -0.76 |
| next 1 | Opponent form (FPL-style) | +0.53 | -0.80 |
| next 1 | Venue only | +0.16 | -0.23 |
| next 3 | Dixon-Coles, blind settings | +0.26 | -0.30 |
| next 3 | Dixon-Coles, production settings | +0.26 | -0.32 |
| next 3 | Closing odds (ceiling) | +0.35 | -0.39 |
| next 3 | Elo (old scaffold) | +0.23 | -0.31 |
| next 3 | Form of both clubs | +0.30 | -0.22 |
| next 3 | Opponent form (FPL-style) | +0.23 | -0.24 |
| next 3 | Venue only | +0.04 | -0.14 |
| next 5 | Dixon-Coles, blind settings | +0.19 | -0.20 |
| next 5 | Dixon-Coles, production settings | +0.17 | -0.18 |
| next 5 | Closing odds (ceiling) | +0.25 | -0.26 |
| next 5 | Elo (old scaffold) | +0.15 | -0.19 |
| next 5 | Form of both clubs | +0.18 | -0.18 |
| next 5 | Opponent form (FPL-style) | +0.19 | -0.19 |
| next 5 | Venue only | +0.05 | -0.11 |
| next 8 | Dixon-Coles, blind settings | +0.12 | -0.19 |
| next 8 | Dixon-Coles, production settings | +0.13 | -0.19 |
| next 8 | Closing odds (ceiling) | +0.13 | -0.23 |
| next 8 | Elo (old scaffold) | +0.09 | -0.17 |
| next 8 | Form of both clubs | +0.10 | -0.15 |
| next 8 | Opponent form (FPL-style) | +0.09 | -0.13 |
| next 8 | Venue only | -0.01 | -0.05 |

Attack and defence lens totals against goals and clean sheets over the same runs (rank correlation):

| method | xG → goals, next 1 | exp. CS → CS, next 1 | xG → goals, next 3 | exp. CS → CS, next 3 | xG → goals, next 5 | exp. CS → CS, next 5 | xG → goals, next 8 | exp. CS → CS, next 8 |
|---|---|---|---|---|---|---|---|---|
| Dixon-Coles, blind settings | 0.321 | 0.239 | 0.431 | 0.255 | 0.498 | 0.307 | 0.561 | 0.349 |
| Dixon-Coles, production settings | 0.324 | 0.240 | 0.429 | 0.261 | 0.497 | 0.314 | 0.562 | 0.358 |

### 7. Attack and defence lenses

Tile colours on the Attack (expected goals) and Defence (clean-sheet chance) lenses, cut as the board cuts them
(15/20/30/20/15% of every forecast on the board at that Monday; bucket 1 = greenest), for games within 8 weeks:

| bucket | attack_share | expected_goals | goals | defence_share | clean_sheet_chance | clean_sheets |
|---|---|---|---|---|---|---|
| 1 | 14.9% | 2.11 | 2.10 | 14.9% | 47.5% | 45.9% |
| 2 | 19.6% | 1.53 | 1.52 | 19.8% | 38.1% | 34.4% |
| 3 | 30.7% | 1.21 | 1.20 | 30.7% | 30.1% | 28.4% |
| 4 | 19.8% | 0.97 | 1.01 | 19.6% | 21.9% | 19.4% |
| 5 | 15.0% | 0.75 | 0.79 | 15.0% | 12.9% | 11.8% |

Expected goals (a tile on the Attack lens) against goals scored, blind settings, within 8 weeks:

| expected goals | forecasts | predicted | actual |
|---|---|---|---|
| [0.0, 0.5) | 95 | 0.47 | 0.19 |
| [0.5, 0.75) | 3254 | 0.67 | 0.73 |
| [0.75, 1.0) | 10799 | 0.89 | 0.93 |
| [1.0, 1.25) | 13430 | 1.12 | 1.12 |
| [1.25, 1.5) | 9792 | 1.37 | 1.36 |
| [1.5, 2.0) | 9094 | 1.70 | 1.73 |
| [2.0, 2.5) | 2656 | 2.20 | 2.10 |
| [2.5, 3.0) | 827 | 2.72 | 2.83 |
| [3.0, inf) | 257 | 3.26 | 2.68 |

Clean-sheet chance (Defence lens) by quintile against clean sheets kept:

| clean-sheet chance | forecasts | predicted | actual |
|---|---|---|---|
| (0.018, 0.202] | 10041 | 14.4% | 13.1% |
| (0.202, 0.271] | 10041 | 23.8% | 21.0% |
| (0.271, 0.33] | 10040 | 30.1% | 28.9% |
| (0.33, 0.399] | 10041 | 36.3% | 33.9% |
| (0.399, 0.667] | 10041 | 45.9% | 43.0% |

Per club-match averages:

| method | expected_goals | goals | clean_sheet_chance | clean_sheets |
|---|---|---|---|---|
| Dixon-Coles, blind settings | 1.288 | 1.296 | 30.1% | 28.0% |
| Dixon-Coles, production settings | 1.284 | 1.296 | 30.6% | 28.0% |
| Venue only | 1.305 | 1.296 | 28.4% | 28.0% |

### 8. How far ahead

RPS by week ahead (week 1 = the 7 days after the Monday cutoff):

| method | week 1 | week 2 | week 3 | week 4 | week 5 | week 6 | week 7 | week 8 |
|---|---|---|---|---|---|---|---|---|
| Dixon-Coles, blind settings | 0.1990 | 0.1985 | 0.1994 | 0.1994 | 0.1997 | 0.2001 | 0.1995 | 0.1995 |
| Dixon-Coles, production settings | 0.1987 | 0.1980 | 0.1990 | 0.1991 | 0.1993 | 0.1998 | 0.1991 | 0.1992 |
| Closing odds (ceiling) | 0.1932 | 0.1928 | 0.1934 | 0.1933 | 0.1933 | 0.1933 | 0.1929 | 0.1929 |
| Elo (old scaffold) | 0.2075 | 0.2074 | 0.2079 | 0.2082 | 0.2083 | 0.2082 | 0.2079 | 0.2080 |
| Venue only | 0.2255 | 0.2253 | 0.2253 | 0.2252 | 0.2251 | 0.2245 | 0.2243 | 0.2246 |

How much a game's production label changes between an early forecast and the one in its own week:

| forecast made | games | same label as in its own week | within one label | mean change in difficulty |
|---|---|---|---|---|
| 7–13 days before | 6696 | 94.2% | 99.9% | 0.8 |
| 14–20 days before | 6512 | 91.0% | 99.8% | 1.2 |
| 28–34 days before | 6222 | 88.2% | 99.7% | 1.6 |
| 49–55 days before | 5632 | 85.2% | 99.8% | 2.0 |
| 84–90 days before | 4826 | 81.4% | 99.6% | 2.6 |
| 133–139 days before | 3780 | 75.4% | 99.1% | 3.4 |

### 9. Promoted clubs

Match RPS (within 8 weeks) with and without a promoted club, early and later in the season:

| involves | stage | Closing odds (ceiling) | Dixon-Coles, blind settings | forecasts | gap to closing odds |
|---|---|---|---|---|---|
| a promoted club plays | cutoffs after week 8 | 0.1875 | 0.1963 | 5628 | +0.0088 |
| a promoted club plays | cutoffs in weeks 1–8 | 0.1962 | 0.2020 | 1518 | +0.0058 |
| no promoted club | cutoffs after week 8 | 0.1946 | 0.2003 | 14171 | +0.0057 |
| no promoted club | cutoffs in weeks 1–8 | 0.1947 | 0.1995 | 3785 | +0.0048 |

Points per game expected and taken, by club:

| club | stage | forecasts | expected_ppg | actual_ppg | actual − expected |
|---|---|---|---|---|---|
| other club | cutoffs after week 8 | 33671 | 1.42 | 1.43 | +0.01 |
| other club | cutoffs in weeks 1–8 | 8998 | 1.42 | 1.41 | -0.01 |
| promoted club | cutoffs after week 8 | 5927 | 1.09 | 1.05 | -0.04 |
| promoted club | cutoffs in weeks 1–8 | 1608 | 1.08 | 1.09 | +0.01 |

### 10. Whole-season view (the predicted table)

Final points projected as points so far + the sum of expected points over every remaining game, against the real
final table (mean over the 9 seasons; pre-season = the Monday before round 1, half-way = the first Monday after half
the matches were played):

| stage | method | mean absolute error (points) | rank correlation |
|---|---|---|---|
| pre-season | Dixon-Coles, blind settings | 7.9 | 0.695 |
| pre-season | Dixon-Coles, production settings | 7.5 | 0.692 |
| pre-season | Elo (old scaffold) | 9.2 | 0.684 |
| pre-season | Last season's points (promoted: relegated clubs' average) | 8.7 | 0.687 |
| half-way | Dixon-Coles, blind settings | 4.5 | 0.866 |
| half-way | Dixon-Coles, production settings | 4.4 | 0.877 |
| half-way | Elo (old scaffold) | 5.1 | 0.856 |
| half-way | Points per game so far × 38 | 5.8 | 0.853 |

### 11. One board from the past

The production model's Next 5 as it would have looked on Monday 2026-02-02 (2025/26), and what happened
(rank correlation 0.49):

| board rank | club | next 5: opponent (venue) difficulty | labels | expected points | points taken | actual rank |
|---|---|---|---|---|---|---|
| 1 | Barcelona | Mallorca (H) 14, Girona (A) 24, Levante (H) 10, Villarreal (H) 25, Ath Bilbao (A) 39 | Easy, Easy, Easy, Easy, Easy-ish | 11.6 | 12 | 1 |
| 2 | Real Madrid | Valencia (A) 28, Sociedad (H) 22, Osasuna (A) 32, Getafe (H) 19, Celta (A) 38 | Easy, Easy, Easy, Easy, Easy-ish | 10.8 | 9 | 4 |
| 3 | Ath Madrid | Betis (H) 31, Vallecano (A) 39, Espanol (H) 24, Oviedo (A) 25, Sociedad (H) 29 | Easy, Easy-ish, Easy, Easy, Easy | 10.6 | 9 | 4 |
| 4 | Villarreal | Espanol (H) 28, Getafe (A) 43, Levante (A) 40, Valencia (H) 27, Barcelona (A) 80 | Easy, Easy-ish, Easy-ish, Easy, Hard | 8.5 | 9 | 4 |
| 5 | Ath Bilbao | Levante (H) 34, Oviedo (A) 38, Elche (H) 39, Vallecano (A) 53, Barcelona (H) 69 | Easy, Easy-ish, Easy-ish, Normal, Hard-ish | 8.0 | 10 | 3 |
| 6 | Betis | Ath Madrid (A) 76, Mallorca (A) 50, Vallecano (H) 36, Sevilla (H) 36, Getafe (A) 49 | Hard, Normal, Easy, Easy, Easy-ish | 7.6 | 8 | 9 |
| 7 | Celta | Osasuna (H) 39, Espanol (A) 52, Mallorca (H) 37, Girona (A) 52, Real Madrid (H) 69 | Easy-ish, Normal, Easy, Normal, Hard-ish | 7.5 | 7 | 11 |
| 8 | Alaves | Getafe (H) 47, Sevilla (A) 63, Girona (H) 46, Levante (A) 58, Valencia (A) 59 | Easy-ish, Hard-ish, Easy-ish, Normal, Normal | 6.8 | 2 | 18 |
| 9 | Sevilla | Mallorca (A) 59, Girona (H) 43, Alaves (H) 47, Getafe (A) 57, Betis (A) 72 | Normal, Easy-ish, Easy-ish, Normal, Hard | 6.7 | 6 | 13 |
| 10 | Sociedad | Elche (H) 44, Real Madrid (A) 84, Oviedo (H) 29, Mallorca (A) 56, Ath Madrid (A) 79 | Easy-ish, Hard, Easy, Normal, Hard | 6.2 | 7 | 11 |
| 11 | Vallecano | Ath Madrid (H) 70, Betis (A) 72, Ath Bilbao (H) 57, Oviedo (H) 34, Sevilla (A) 63 | Hard-ish, Hard, Normal, Easy, Hard-ish | 6.1 | 9 | 4 |
| 12 | Elche | Sociedad (A) 65, Osasuna (H) 45, Ath Bilbao (A) 69, Espanol (H) 44, Villarreal (A) 77 | Hard-ish, Easy-ish, Hard-ish, Easy-ish, Hard | 6.0 | 2 | 18 |
| 13 | Osasuna | Celta (A) 70, Elche (A) 63, Real Madrid (H) 76, Valencia (A) 58, Mallorca (H) 45 | Hard-ish, Hard-ish, Hard, Normal, Easy-ish | 5.7 | 8 | 9 |
| 14 | Espanol | Villarreal (A) 78, Celta (H) 57, Ath Madrid (A) 83, Elche (A) 65, Oviedo (H) 34 | Hard, Normal, Hard, Hard-ish, Easy | 5.5 | 3 | 15 |
| 15 | Valencia | Real Madrid (H) 79, Levante (A) 61, Villarreal (A) 80, Osasuna (H) 52, Alaves (H) 52 | Hard, Hard-ish, Hard, Normal, Normal | 5.3 | 9 | 4 |
| 16 | Mallorca | Sevilla (H) 51, Barcelona (A) 90, Betis (H) 59, Celta (A) 71, Sociedad (H) 54 | Normal, Hard, Normal, Hard, Normal | 5.2 | 3 | 15 |
| 17 | Girona | Sevilla (A) 65, Barcelona (H) 81, Alaves (A) 64, Celta (H) 57, Levante (A) 60 | Hard-ish, Hard, Hard-ish, Normal, Normal | 5.2 | 6 | 13 |
| 18 | Getafe | Alaves (A) 65, Villarreal (H) 66, Sevilla (H) 53, Real Madrid (A) 87, Betis (H) 61 | Hard-ish, Hard-ish, Normal, Hard, Hard-ish | 5.0 | 12 | 1 |
| 19 | Levante | Ath Bilbao (A) 74, Valencia (H) 48, Villarreal (H) 68, Barcelona (A) 92, Alaves (H) 52 | Hard, Easy-ish, Hard-ish, Hard, Normal | 5.0 | 3 | 15 |
| 20 | Oviedo | Ath Bilbao (H) 72, Sociedad (A) 79, Ath Madrid (H) 83, Vallecano (A) 76, Espanol (A) 75 | Hard, Hard, Hard, Hard, Hard | 3.5 | 2 | 18 |

### 12. Worked example (today's model)

Fitted on 2026-09-15 with the production settings, on football-data.co.uk results through 2026-09-07
(757 matches in the 730-day window):
mu = +0.101 (e^mu = 1.11 goals for an average away side), home advantage = +0.284
(x1.33), rho = +0.014.

| fixture | club | venue | attack | defence | xG for | xG against | win | draw | loss | exp. points | difficulty | label | clean sheet |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Real Madrid v Getafe | Real Madrid | H | +0.544 | +0.325 | 1.94 | 0.54 | 70.9% | 19.5% | 9.5% | 2.32 | 22.6 | Easy | 58.2% |
| Real Madrid v Getafe | Getafe | A | -0.389 | +0.266 | 0.54 | 1.94 | 9.5% | 19.5% | 70.9% | 0.48 | 84.0 | Hard | 14.4% |
| Getafe v Real Madrid | Getafe | H | -0.389 | +0.266 | 0.72 | 1.46 | 18.6% | 26.4% | 55.1% | 0.82 | 72.6 | Hard | 23.2% |
| Getafe v Real Madrid | Real Madrid | A | +0.544 | +0.325 | 1.46 | 0.72 | 55.1% | 26.4% | 18.6% | 1.92 | 36.2 | Easy | 48.7% |
| Celta v Villarreal | Celta | H | +0.062 | +0.074 | 1.43 | 1.45 | 37.4% | 24.5% | 38.0% | 1.37 | 54.4 | Normal | 23.5% |
| Celta v Villarreal | Villarreal | A | +0.343 | +0.086 | 1.45 | 1.43 | 38.0% | 24.5% | 37.4% | 1.39 | 53.8 | Normal | 23.8% |

### 13. Season by season (blind settings)

RPS within 8 weeks; "gap closed" = how much of the distance from a venue-only forecast to the closing odds the
model covers; within-club numbers compare each Monday's games in the next 8 weeks (section 5); Easy / Hard =
points per game with the season's blind cut points.

| season | RPS | closing odds RPS | venue-only → odds gap closed | within-club correlation | kinder − tougher half (ppg) | next-5 rank correlation | next-5, club rating only | Easy ppg | Hard ppg |
|---|---|---|---|---|---|---|---|---|---|
| 2017/18 | 0.2015 | 0.1956 | 83% | 0.374 | +0.83 | 0.481 | 0.440 | 2.30 | 0.51 |
| 2018/19 | 0.2038 | 0.1978 | 75% | 0.314 | +0.60 | 0.460 | 0.408 | 2.31 | 0.50 |
| 2019/20 | 0.1976 | 0.1927 | 83% | 0.369 | +0.69 | 0.545 | 0.551 | 2.32 | 0.47 |
| 2020/21 | 0.1982 | 0.1887 | 75% | 0.308 | +0.59 | 0.547 | 0.495 | 2.20 | 0.57 |
| 2021/22 | 0.2016 | 0.1955 | 78% | 0.335 | +0.61 | 0.525 | 0.510 | 2.15 | 0.63 |
| 2022/23 | 0.2058 | 0.2022 | 85% | 0.332 | +0.66 | 0.542 | 0.505 | 2.15 | 0.71 |
| 2023/24 | 0.1860 | 0.1809 | 88% | 0.406 | +0.71 | 0.658 | 0.628 | 2.38 | 0.44 |
| 2024/25 | 0.1987 | 0.1886 | 76% | 0.351 | +0.65 | 0.527 | 0.514 | 2.34 | 0.51 |
| 2025/26 | 0.2014 | 0.1965 | 82% | 0.349 | +0.71 | 0.462 | 0.417 | 2.26 | 0.62 |

</details>
