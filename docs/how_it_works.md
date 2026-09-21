# How FixtureDiff works, number by number

Every figure the board shows, where it came from, and what happened to it on the way. Written so that a
number on a tile can be traced back to a row in a CSV, and so that somebody outside this project can read
the same numbers out of the API and build something else with them.

Companion documents: [architecture.md](architecture.md) (the shape of the system),
[fixture_difficulty.md](fixture_difficulty.md) (the evidence behind the model and its labels),
[data_dictionary.md](data_dictionary.md) (sources and their terms), [next_features_plan.md](next_features_plan.md)
(what is planned and what shipped when). Part 10 of this file is the third-party integration guide.

---

## 0. At a glance

```
football-data.org ──┐                         ┌─> GET /api/fixture-grid ──> Next.js board
football-data.co.uk ─┼─> app.jobs.refresh ──> Neon Postgres ──┘                (frontend/)
The Odds API ────────┘   migrate → sync → odds → predict
```

| Question | Short answer | Detail |
|---|---|---|
| Who plays whom, and when? | football-data.org, one API call per refresh | [1.1](#11-football-dataorg--fixtures-results-and-the-calendar) |
| What happened in past seasons? | football-data.co.uk season CSVs, cached on disk | [1.2](#12-football-datacouk--five-seasons-of-results-shots-and-closing-odds) |
| What do bookmakers think? | The Odds API, one call per 6 hours | [1.3](#13-the-odds-api--live-bookmaker-prices) |
| How strong is each club? | Time-decayed Dixon-Coles fit on the last two years | [3](#3-the-rating-model-in-order-of-operations) |
| Where do win/draw/loss come from? | A Poisson score matrix, then a market blend for games within a week | [3.7](#37-from-goal-rates-to-outcomes-the-score-matrix), [4.1](#41-market-blend-winlossdraw-only-for-games-within-a-week) |
| What is "difficulty 78"? | `100 × (1 − expected points ÷ 3)` | [5.2](#52-difficulty-0100) |
| Why is the same number a different word home and away? | The top label cut is venue-aware | [5.3](#53-labels-and-the-venue-aware-top-cut) |
| Where does "Wins 25% of games rated 21%" come from? | Five seasons of closing odds, banded by price | [6.1](#61-the-record-at-this-price-record--record_price) |
| What is the number on a played tile? | The chance the board gave the result that happened | [6.3](#63-the-post-match-review-review) |
| Can I pull all of this out? | One public GET endpoint, no key, JSON | [10](#10-connecting-to-this-app-from-outside) |

---

## 1. Where the data comes from

Four inputs. Three are external; one is maintained by hand. Nothing is scraped, and every source is used
inside the terms of its free tier.

### 1.1 football-data.org — fixtures, results and the calendar

- **Module:** `backend/app/sources/football_data_org.py`, used by `backend/app/jobs/seed_and_sync.py`.
- **What it gives:** the LaLiga (`PD`) season calendar — fixture id, matchday, kickoff in UTC, both clubs,
  status (`SCHEDULED` / `TIMED` / `IN_PLAY` / `PAUSED` / `FINISHED` / `POSTPONED` / …) and the score when
  a game is done.
- **How it is called:** exactly one request per refresh, for the whole season. Never one call per match.
- **Free-tier limits:** 10 requests/minute with a token; LaLiga and Champions League only. A 429 is retried
  with backoff. Refreshes are at least 10 minutes apart.
- **Stored in:** `fixtures` (one row per match, replaced in place — `schedule_version` increments when a
  kickoff moves), `teams`, `stadiums`, `competitions`, `source_entity_map`.
- **Identity:** clubs are matched to the internal registry by their three-letter `tla`
  (`backend/app/services/team_registry.py`), which also holds each club's colour, stadium and the spellings
  the other two sources use.

### 1.2 football-data.co.uk — five seasons of results, shots and closing odds

- **Module:** `backend/app/sources/football_data_co_uk.py`; parsed by `backend/app/backtest/data.py`.
- **What it gives, per match:** date, both clubs, full-time goals (`FTHG`/`FTAG`), shots on target
  (`HST`/`AST`), red cards (`HR`/`AR`) and bookmaker odds.
- **Which odds:** closing prices, Pinnacle first (`PSCH/PSCD/PSCA`), then the market average
  (`AvgCH/AvgCD/AvgCA`), then their pre-closing equivalents — all three prices always taken from the same
  book so the margin is removed from one coherent set. A separate set of *pre-closing* prices
  (`odds_pre_*`) is kept for backtests, because the closing line is the ceiling a model is measured
  against and must never leak into a method that ships.
- **Caching:** downloaded to `backend/data/raw/` and re-downloaded only for the current season. A 404 on a
  brand-new season means "no rows yet", not an error.
- **Cadence:** the site updates Tuesday ~13:00 and Friday ~17:00 UK, so this history lags the live API by a
  few days. That gap is bridged — see [2.3](#23-step-3-predict).
- **Used for:** fitting the rating model (last two years of it) and counting each club's record at each
  price (five seasons of it).

### 1.3 The Odds API — live bookmaker prices

- **Module:** `backend/app/sources/the_odds_api.py`, job `backend/app/jobs/sync_odds.py`.
- **What it gives:** `h2h` (1X2) and `totals` (over/under 2.5) from ~20 European bookmakers, for fixtures
  in the next round or two.
- **Free-tier limits:** 500 credits/month; `h2h,totals × eu` costs 2 credits per call. The job refuses to
  run if the last fetch was under 6 hours ago (≈4 calls/day ≈ 240 credits/month). The key is sent as a
  query parameter, so request URLs and raw HTTP errors are never logged.
- **Matching:** a bookmaker event is tied to a fixture only when both club codes match *and* the kickoff is
  within 36 hours of the stored one.
- **Stored in:** `market_odds`, one row per fixture, replaced each sync. Fixtures not returned by that sync
  have their odds row deleted — which is why a game loses its prices once it kicks off.

### 1.4 The team registry — maintained by hand

`backend/app/services/team_registry.py` is the single place that knows a club's `tla` ("VIL"), its
football-data.co.uk history name ("Villarreal"), the spellings The Odds API uses, its colour and its
stadium. Promoted clubs are added here each June; the predict job logs any CSV name it cannot resolve.

---

## 2. The pipeline, step by step

One command runs the lot: `python -m app.jobs.refresh` (`backend/app/jobs/refresh.py`). It is triggered by
the GitHub Actions cron, by the Refresh button in the UI (via `backend/app/admin.py`), or by hand.

Each run takes a lock row in `refresh_runs`, so two refreshes can never overlap. Steps 1–3 are isolated: if
one fails, the failure is recorded and the next step still runs, because predictions from slightly stale
fixtures beat no predictions at all. Exit codes: `0` all good, `1` a step or the schema check failed,
`2` another run is active.

### 2.0 Step 0: migrations

`alembic upgrade head` through `backend/app/migrate.py`, using the Neon **owner** role. Unattended runs
(cron, button) pass `--skip-migrations`: they only *check* that the schema is current and stop if it is not,
because they run as the least-privileged `fdr_app` role, which cannot do DDL.

### 2.1 Step 1: sync

`backend/app/jobs/seed_and_sync.py` — one football-data.org call, then for each match:

1. resolve both clubs through the registry (creating `teams` rows on first sight),
2. upsert the `fixtures` row: kickoff, matchday, status, goals,
3. bump `schedule_version` if the kickoff moved.

Output recorded in the run: how many fixtures were seen, created and changed.

### 2.2 Step 2: odds

`backend/app/jobs/sync_odds.py`, skipped entirely when `ODDS_API_KEY` is absent or the last fetch is under
6 hours old. For each priced fixture:

1. **Remove the margin.** For one bookmaker's three prices, implied probabilities `1/price` are normalised
   to sum to 1 (`market_odds.fair_probabilities`). Over/under 2.5 is normalised as its own pair.
2. **Take a consensus.** The median across bookmakers per outcome, then rescaled to sum to 1
   (`market_odds.consensus`). Medians, not means, so one odd book cannot drag the number.
3. **Fit goal rates to the prices.** Nelder-Mead finds the pair of Poisson rates `(λ_home, λ_away)` whose
   implied 1X2 and over-2.5 probabilities best reproduce the consensus, from three starting points, with
   the result rejected if the squared error exceeds `1e-2` (`market_odds.fit_goal_rates`). These are what
   the bookmakers' clean-sheet, "to score", "2+" and "both score" numbers are read off later.
4. Write one `market_odds` row: fair `p_home/p_draw/p_away`, `p_over_2_5`, the fitted `home_goals`/
   `away_goals` rates (note: *rates*, not scored goals), the bookmaker count and `fetched_at`.

Odds are synced **before** predictions so the next gameweek's forecast blends the freshest prices.

### 2.3 Step 3: predict

`backend/app/jobs/predict.py`. In order:

1. **Load history.** Five seasons from the football-data.co.uk cache (`HISTORY_SEASONS = 5`), refreshing
   the current one.
2. **Bridge the CSV lag.** `rating_predictions.merge_recent_results` appends results already synced from
   football-data.org that the CSV has not published yet, matching on clubs and a date within two days so
   nothing is double-counted.
3. **Work out who is promoted.** From *this season's fixtures* rather than the CSV, because at rollover the
   new CSV does not exist yet (`backtest.data.promoted_from_fixtures`).
4. **Sanity-check identities.** Any CSV club the registry cannot resolve, and any club about to be predicted
   with no history that is not a known promotion, is logged as a warning and returned in the run summary.
5. **Fit the model** (Part 3), using the tuned settings in `backend/artifacts/dixon_coles.json`.
6. **Decide which fixtures may use bookmaker prices** (`MarketBlend.applies`): blending on, ≥3 bookmakers,
   kickoff within 7 days, price under 48 hours old.
7. **Build the price-band record** from the same five seasons (`services/odds_record.build_record`).
8. **Predict every upcoming fixture** — status `SCHEDULED`/`TIMED` *and* kickoff in the future — from both
   sides, and replace the `predictions` rows for exactly those fixtures in one transaction.

**What is not touched:** rows for fixtures that have already been played. The delete is scoped to the
fixtures being re-predicted, so the last forecast made before a kickoff survives forever. That is what makes
the post-match review in [6.3](#63-the-post-match-review-review) possible.

### 2.4 Step 4: the grid API

`backend/app/services/fixture_grid.py` assembles the whole board in one query pass and serves it at
`GET /api/fixture-grid`. It:

- lays every fixture of the season into a **teams × matchdays** matrix (`GridTeam.cells[column][n]`, so a
  double gameweek holds two cells and a blank holds none);
- decides each matchday's date window and whether it is finished (a matchday counts as finished once its
  *core* games are done, so one game moved to October cannot hold the board on an old matchday);
- attaches to each cell: the result, the forecast, the review, the bookmakers' prices and the two records;
- computes the **lens cut points** (`lens_scales`) from the games still to come.

### 2.5 Step 5: the board

`frontend/` renders what the API decided. The rule, enforced in review: the browser never re-derives a
number the backend owns — tile colour is `prediction.bucket`, cut points are `lens_scales`. What the browser
*does* compute is aggregation over a window: run totals, rankings, the tables and the simulations
([Part 7](#7-what-the-browser-computes)).

The page is cached for an hour under the `fixture-grid` tag and revalidated the moment a refresh finishes,
because every call wakes the Neon free tier (100 CU-hours/month, suspends on exhaustion).

---

## 3. The rating model, in order of operations

`backend/app/modeling/dixon_coles.py`. A time-decayed Dixon-Coles Poisson goals model. Tuned settings live
in `backend/artifacts/dixon_coles.json`, written by `python -m app.jobs.backtest`:

```json
{ "xi": 0.001, "goals_weight": 0.7, "ridge": 1.0, "promoted_prior": 0.0,
  "window_days": 730, "max_goals": 10, "spread": 1.1 }
```

### 3.1 The training frame

Matches strictly before the cutoff (today, for a live refresh) and no older than `window_days` = 730. About
1,585 matches at the time of writing.

### 3.2 The target: goals blended with shots on target

Goals are noisy; shots on target are steadier but not goals. The fit targets a blend
(`blended_targets`):

```
conversion  = total goals ÷ total shots on target      (over the training window)
target_home = 0.7 × home goals + 0.3 × home SoT × conversion
```

with `goals_weight = 0.7`. Matches without shot data keep their raw goals. The league conversion rate comes
out around 0.33 goals per shot on target.

### 3.3 Time decay

Every match gets weight `exp(−xi × days before cutoff)` with `xi = 0.001`, so a match a year old counts
about 70% as much as one played yesterday. This is the only thing in the model that represents "form".

### 3.4 The fit

Parameters: one `mu` (league scoring level), one `home_adv`, and an `attack` and `defence` rating per club.

```
log λ_home = mu + home_adv + attack[home] − defence[away]
log λ_away = mu             + attack[away] − defence[home]
```

Fitted by minimising a weighted Poisson negative log-likelihood plus an L2 (ridge) penalty that pulls every
rating toward a prior — 0 for established clubs, `promoted_prior` for promoted ones — using L-BFGS-B with an
analytic gradient. The penalty is what keeps a club with four matches played from flying off; it also
stabilises the opening weeks of a season. Failure to converge raises a `RuntimeWarning` rather than silently
returning nonsense.

### 3.5 The spread correction

The ridge penalty has a side effect: it leaves the best and worst clubs closer to average than they really
are. `apply_spread` stretches the fitted ratings around their mean by `spread = 1.1`, then **re-solves
`mu`** so the league's total expected goals stays where the data put it (stretching alone would inflate
them, since `exp` is convex).

Chosen on the tuning seasons by log loss. Blind replay: the miss on the top and bottom decile of clubs falls
from 0.123 to 0.065 points per game — better than the market's 0.060.

### 3.6 The low-score correction (rho)

Real football has more 0–0s and 1–1s than independent Poissons predict. `_fit_rho` fits a single `rho` in
`[−0.25, 0.25]` on the actual integer scorelines, multiplying just four cells of the score matrix:

```
(0,0): 1 − λh·λa·rho      (0,1): 1 + λh·rho
(1,0): 1 + λa·rho         (1,1): 1 − rho
```

### 3.7 From goal rates to outcomes: the score matrix

`score_matrix` builds `P(home scores i, away scores j)` for `i, j` up to `max_goals = 10`: the outer product
of two Poisson pmfs, the four Dixon-Coles multipliers applied, clipped at zero and renormalised. Everything
else is a reduction of that one matrix (`outcome_table`):

| Column | Meaning | How |
|---|---|---|
| `p_h` | home win | sum below the diagonal |
| `p_d` | draw | the trace |
| `p_a` | away win | sum above the diagonal |
| `cs_h` | home club keeps a clean sheet | column `j = 0` |
| `cs_a` | away club keeps a clean sheet | row `i = 0` |
| `p_00` | goalless | the single `(0,0)` cell |
| `lam_h`, `lam_a` | expected goals for each side | the fitted rates themselves |

`p_00` exists so that both-teams-to-score can be read off the same matrix
([6.2](#62-both-teams-to-score-both_score)).

---

## 4. Two corrections on top of the fit

Each has its own artifact file, each was measured before it shipped, and each leaves the rest of the model
alone.

### 4.1 Market blend: win/draw/loss only, for games within a week

`backend/app/services/market_blend.py`, weight in `backend/artifacts/market_blend.json` (`0.35`).

Bookmakers know the team news; over nine seasons their closing prices beat the model by about 0.006 RPS,
and nothing free closes that gap except the prices themselves. So for a fixture that is **within 7 days**,
priced by **≥3 bookmakers**, with a price **under 48 hours old**, the model's probabilities are pooled with
the market's:

```
p ∝ p_model^(1−w) · p_market^w ,  renormalised,  w = 0.35
```

A *log* pool, not an average: if both sides call an outcome unlikely, it stays unlikely.

Measured on the blind replay, next-week games only: RPS −0.0027 (95% CI −0.0034 to −0.0021), at the cost of
tile colours holding from 4–5 weeks out falling from 88% to 81%. The weight is the owner's choice of that
trade-off, not a fit. The Odds lens stays pure market; expected goals, clean sheets and everything derived
from the score matrix stay pure model.

### 4.2 Clean-sheet calibration

`backend/app/services/calibration.py`, fitted values in `backend/artifacts/clean_sheet_calibration.json`
(`a = −0.1542`, `b = 0.9322`, fitted on 22,334 past forecasts through 2026-09-07).

The model's clean-sheet chances ran ~2–4 points high. Refitting the goal model to fix that would move the
well-calibrated win/draw/loss numbers, so the correction is applied afterwards, on the probability itself:

```
p' = sigmoid(a + b · logit(p))
```

fitted by penalised maximum likelihood, pulled toward "change nothing" (worth 200 forecasts), hard-capped
(`|a| ≤ 1`, `b ∈ [0.5, 1.5]`), and skipped entirely below 500 samples. Test seasons: predicted 30.8% → 28.8%
against 26.1% observed; Brier 0.1818 → 0.1803.

Only `p_clean_sheet` is touched. Note the consequence: `both_score`, which comes off the raw matrix, is not
exactly `1 − CS(home) − CS(away) + P(0–0)` using the *shown* clean sheets.

---

## 5. From probabilities to what is on the tile

`backend/app/services/scoring.py`. Everything here is from the perspective of one club, so each fixture
produces two cells that mirror each other.

### 5.1 Expected points

```
xPts = 3 × P(win) + 1 × P(draw)
```

### 5.2 Difficulty 0–100

```
difficulty = 100 × (1 − xPts ÷ 3),  clipped to [0, 100]
```

0 means a certain win, 100 a certain loss. It counts *dropped* points: a draw costs two thirds of a loss,
and winning margins do not matter. The two tiles of one match sum to `100 + 33.3 × P(draw)`, i.e. 107–111
for normal draw chances.

### 5.3 Labels and the venue-aware top cut

| Label | Bucket | Difficulty at home | Difficulty away |
|---|---|---|---|
| Very favourite | 1 | ≤ 36.0 | ≤ 23.4 |
| Favourite | 2 | ≤ 48.6 | ≤ 48.6 |
| Even | 3 | ≤ 61.1 | ≤ 61.1 |
| Underdog | 4 | ≤ 71.3 | ≤ 71.3 |
| Big underdog | 5 | > 71.3 | > 71.3 |

The three lower cuts are quantiles of the 2019/20–2022/23 forecasts (15/20/30/20/15% shares), so no results
went into them. The **top** cut is venue-aware because the same expected points mean different things home
and away: an away side reaches them with more draws and fewer wins. Over nine blind seasons a top-band tile
won 70.4% of the time at home but only 59.3% away; with cuts of 36.0 and 23.4 it wins 72.0% and 72.2%.

**If you consume this data:** never compare a difficulty to one cut set without knowing the venue.

### 5.4 Bucket and colour

`label_bucket` is simply the label's index + 1, so the colour and the word can never disagree. Buckets 4–5
also get a ring on the tile, for colour-blind readability.

---

## 6. The three extra statistics

### 6.1 The record at this price (`record` / `record_price`)

`backend/app/services/odds_record.py`. The question it answers: *when this club has been given this kind of
chance before, did it do better or worse than the league does at the same price?*

1. **Five seasons of closing odds** from the football-data.co.uk cache, margin removed per match, giving
   each club a pre-match win probability for every game it has played. Bookmaker odds are the only record of
   what a club *was* priced at — the app replaces its own forecasts every refresh.
2. **Five price bands** and the league's actual win rate in each. These are recomputed from scratch on
   every refresh, so they drift as seasons roll in and out of the five-season window. Measured over
   2022/23–2026/27 at the time of writing:

   | Band | League wins |
   |---|---|
   | under 20% | 12.4% |
   | 20–35% | 25.3% |
   | 35–50% | 44.5% |
   | 50–65% | 57.4% |
   | 65% or more | 81.6% |

   Across the 20 clubs that is 96 club-band combinations with enough games (≥ 5) to show a record.

3. **Per club per band:** games, wins, raw rate.
4. **The gap, shrunk by sample size** — what the lens colours by:

   ```
   edge = (wins + 8 × league) ÷ (games + 8) − league
   ```

   The `8` is eight games' worth of "no edge", so a club with a handful of games cannot look like a world
   beater. Below `MIN_GAMES = 5` there is no record at all and the field is `null`.

Two flavours ship per cell, differing only in which number picks the band for *this* fixture:

| Field | Banded by | Coverage |
|---|---|---|
| `record` | the win chance the board shows (post-blend) | every fixture |
| `record_price` | the bookmakers' current price | priced fixtures only |

It is description, not forecast: **nothing in it changes a probability**, and whether it predicts anything
has not been tested.

### 6.2 Both teams to score (`both_score`)

- **Ours:** `1 − cs_h − cs_a + p_00` off the score matrix, so the low-score correction is in it. Identical
  from either side. Stored in `Prediction.explanation["both_score"]`, served as `prediction.both_score`.
- **The bookmakers':** the Poisson equivalent of the fitted goal rates,
  `1 − e^(−λf) − e^(−λa) + e^(−λf−λa)` (`market_odds.team_market`), served as `market.both_score`.

Shown, never fitted to.

### 6.3 The post-match review (`review`)

`backend/app/services/postmortem.py`, surfaced by `fixture_grid.cell_review`. Because the pre-kickoff
forecast survives in the database, a played game can be scored against what happened:

| Field | Meaning |
|---|---|
| `outcome_chance` | the probability the forecast gave the result that actually happened |
| `points` | points actually won (3/1/0) |
| `expected_points` | what that forecast expected |
| `surprise` | total probability of results *at least as surprising*, by ranked probability score — 1.0 is utterly ordinary, 0.05 is a one-in-twenty shock |

The tile shows `outcome_chance` as a whole percent in its corner; the tooltip shows all four, printing
`100 − surprise` so that a big number reads as a big surprise, and turning red under 0.2.

Two deliberate design points:

- **The forecast is loaded without filtering on model version** (`historic_predictions`). The point is what
  the board said at the time, so a re-fit must not erase it. A forecast old enough to carry the pre-2026-09-16
  label vocabulary keeps its numbers and is renamed in today's words.
- **None of it counts anywhere.** `lens_scales` skips finished cells, and the browser's `lensValue`/
  `runValue` return `null` for them, so totals, rankings and cut points stay about games still to come.

The research version of this review (performance gap versus shots on target, and verdicts of
"variance"/"evidence") stays out of the app: shots and red cards are not in the database. Over nine seasons
it classified 96.1% of matches as "as forecast", and its verdicts did not predict how clubs did next.

---

## 7. What the browser computes

`frontend/lib/grid.ts` and `frontend/lib/table.ts`. None of it re-derives a backend decision; all of it
aggregates over the gameweek window the user picked.

### 7.1 Lens values and buckets

| Lens | Tile value | Run total |
|---|---|---|
| Overall | `prediction.difficulty` (bucket straight from the API) | expected points, summed |
| Attack | `prediction.xg_for` | expected goals, summed |
| Defence | `prediction.clean_sheet` | expected clean sheets, summed |
| Record | `record.edge` | **average** gap per game |
| Vs odds | `record_price.edge` | **average** gap per game |
| Odds | `market.win` | **average** market points (`3×win + draw`) per priced game |

The averaging rule matters: points and goals add up over a run, but rates and prices do not, and a club with
more games priced must not out-rank one with fewer. Non-overall buckets come from `scaleBucket(value,
lens_scales[lens])`: count how many cut points the value crosses, add 1.

A column (one club, one gameweek) is `0` for a blank week still to come, the sum over a double gameweek, and
`null` when nothing in it can be rated — already played, postponed, or a blank week in the past.

### 7.2 Run stats, swings and picks

- `runStats` returns, per club over the window: total, per-game average, the number of rated fixtures, blank
  weeks, double weeks, home games and the bucket of each tile.
- **Most / fewest points coming** ranks `total ÷ fixtures`, so game counts do not decide it.
- **Softest / hardest schedule** is a *swing*: the window's points per game minus the same club's points per
  game over the whole rest of its season, and only for clubs with at least twice as many remaining games as
  window games. That is what separates "an easy run" from "a strong club".
- **Who to pick** ranks forwards by expected goals, defenders and keepers by expected clean sheets, and
  midfielders by a 65/35 blend of the two. Untested — there is no player data in this project.

### 7.3 The tables

`frontend/lib/table.ts`:

- **Current standings** are computed from the cells' results, with LaLiga tiebreaks: head-to-head points,
  then head-to-head goal difference, but only once *every* game between the tied clubs has been played;
  otherwise overall goal difference, then goals scored. `currentTable(grid, through)` accepts a gameweek
  cutoff, which is how "Table after GW3" works.
- **Predicted table** = points so far plus each remaining fixture's expected points, with the finishing
  chances from **5,000 simulated seasons** using the model's win/draw/loss per fixture, ties split by
  projected (expected-goals) goal difference. The generator is a seeded `mulberry32`, so the same data always
  produces the same percentages — a requirement, not an accident.
  `predictedTable(grid, { through })` stops the projection at a gameweek, which is how the tab walks the
  season forward; `{ simulations: 0 }` skips the Monte Carlo when only projected points are needed.
- **Position by gameweek** (`components/TableProgression.tsx`, `lib/progression.ts`) charts every club's
  position with `@nivo/line`: the real table for each played gameweek, then the projection stopped at each
  future one — so the dashed part of a line is the same table the tab shows, one gameweek at a time. Picking a
  single club also draws a band: the 10th to 90th percentile of where 600 simulated seasons put it that week,
  which is the honest width of "about 7th". The simulation is the same fixture-by-fixture draw the predicted
  table uses, seeded, so the band never moves between visits. The chart is loaded on demand (`next/dynamic`,
  `ssr: false`), so only the Table tab pays for the charting library.
- **The prediction line** (dotted, switched on in the chart's (i) panel) is the third answer the chart gives:
  where the model had each club that week
  *before the season started*. It is a separate fit — the same model trained only on matches played before the
  season's first kickoff, then run over all 380 fixtures — so it contains no hindsight at all. Because the
  history before that cutoff never changes, it is computed once by `python -m app.jobs.opening_projection`,
  written to `backend/artifacts/opening_projection.json` and committed; the API reads the file and serves
  `GridTeam.opening`, one position per gameweek column. Two honest limits: the three promoted clubs come out
  level with each other (no Segunda history, so the ridge prior is all the model has), and it is today's code
  fitted at an old cutoff, not a forecast anybody actually published in August.

---

## 8. A worked example, end to end

**Villarreal v Levante**, GW7, kickoff 2026-09-20 16:30 UTC (fixture id 69). Every number below is from this
repository at that moment and can be recomputed.

**Step 1 — the fit.** 1,585 matches through 2026-09-20, window 730 days, `xi = 0.001`, `goals_weight = 0.7`,
`ridge = 1.0`, `spread = 1.1`. Result: `mu = 0.1099`, `home_adv = 0.2753`, `rho = 0.0053`, and

| Club | attack | defence |
|---|---|---|
| Villarreal | +0.352 | +0.075 |
| Levante | +0.037 | −0.139 |

**Step 2 — goal rates.**

```
λ_home = exp(0.1099 + 0.2753 + 0.352 − (−0.139)) = exp(0.8762) = 2.402
λ_away = exp(0.1099 + 0.037 − 0.075)             = exp(0.0719) = 1.075
```

**Step 3 — the score matrix.** With `rho = 0.0053` and `max_goals = 10`:

```
p_h = 0.6673   p_d = 0.1788   p_a = 0.1539
cs_h = 0.3414  cs_a = 0.0906  p_00 = 0.0305
```

**Step 4 — both teams to score.** `1 − 0.3414 − 0.0906 + 0.0305 = 0.5986` → shown as **60%**.

**Step 5 — the market blend.** Kickoff is hours away and 21 bookmakers priced it, so the blend applies.
Consensus fair prices: home 0.6335, draw 0.1996, away 0.1669. Log pool at `w = 0.35`:

```
model  (0.6673, 0.1788, 0.1539)
market (0.6335, 0.1996, 0.1669)
pooled (0.6557, 0.1859, 0.1584)
```

**Step 6 — Levante's cell.** From the away side, win 0.1584, draw 0.1859, loss 0.6557:

```
xPts       = 3 × 0.158 + 0.186 = 0.661
difficulty = 100 × (1 − 0.661 ÷ 3) = 78.0
label      = away, 78.0 > 71.3 → "Big underdog" → bucket 5
clean sheet= sigmoid(−0.1542 + 0.9322 × logit(0.0906)) = 0.0907   (raw 0.0906)
xG          1.07 for, 2.40 against
```

**Step 7 — the record.** Levante's 15.8% win chance falls in the "under 20%" band, where it has played 11
games and won 1 (9.1%) against a league rate of 12.4%:

```
edge = (1 + 8 × 0.1236) ÷ (11 + 8) − 0.1236 = 0.1047 − 0.1236 = −0.0189  → "−2 pts"
```

Its bookmaker price sits in the same band, so `record_price` is identical here. Villarreal's side reads
differently: rated "65% or more" (10 of 12, +1 pt) but priced "50–65%" (24 of 40, +2 pts).

**Step 8 — the bookmakers' goal markets.** Fitted rates λ = 2.26 home, 1.098 away, from 21 books:

```
Levante clean sheet = e^(−2.26)                                   = 0.1044
Levante to score    = 1 − e^(−1.098)                              = 0.6663
both teams score    = 1 − e^(−2.26) − e^(−1.098) + e^(−3.358)     = 0.5968
market points       = 3 × 0.1669 + 0.1996                         = 0.700
```

**Step 9 — what the tile shows.** A bucket-5 tile reading `VIL (A)`, tooltip: Win 16% · Draw 19% · Loss 66%,
xG 1.07 – 2.40, clean sheet 9%, both score 60%, "Difficulty 78 · Big underdog · 0.7 exp. pts", then
"Wins 9% of games rated 16% / 1 of 11 rated under 20% · league 12% · −2 pts".

**Step 10 — after the whistle.** The forecast row stays. Once the result is in, the cell gains a `review`:
the chance given to what happened, the points won against 0.661 expected, and the surprise percentile — and
drops out of every total and cut point.

---

## 9. How any of this is allowed to change

From `CLAUDE.md`, "Model rules" — the discipline that keeps the numbers honest:

- **Tune on 2019/20–2022/23 only; score once on 2023/24–2025/26.** Current test baseline over 8,339
  forecasts: **RPS 0.1947** against closing odds 0.1886, Elo 0.2050, base rates 0.2255.
- **Blind walk-forward replay over nine seasons** (2017/18–2025/26), each season's settings tuned only on
  earlier ones: RPS **0.1994** versus closing odds 0.1932, Elo 0.2079, venue-only 0.2250 — about 80% of the
  way from a venue-only forecast to the market.
- **A change ships only if** a block-bootstrap confidence interval (by matchday) of the RPS difference
  excludes 0, **or** it fixes calibration without making RPS worse.
- **Candidates are replayed blind before shipping:**
  `python reports\experiments\bench.py --variant spread=1.15 --cache ... --workers 10` prints RPS,
  calibration, within-club ordering, run ranking and tile stability against the baseline, each with an
  interval. `--variant spread=1.0` is its self-test and must come out 0.0000.
- **Judging whether a forecast tells easy games from hard ones**, only forecasts made on the same date may
  be compared: demeaning by a club's season average mixes in forecasts made *after* a game, which already
  contain its result.
- **Known weaknesses, stated on the board itself** (`services/model_notes.py`): promoted clubs are learned
  too slowly (+0.0088 RPS behind the market after week 8, against +0.0057 elsewhere), clean sheets still run
  a little high after the correction, and there is no team news beyond the blended prices.
- **Measured and rejected:** a CUSUM drift detector that re-weighted a club's matches when the model kept
  getting it wrong, and post-match verdicts as a predictor of the next games.

---

## 10. Connecting to this app from outside

### 10.1 The one endpoint that matters

```
GET /api/fixture-grid
```

No authentication, no query parameters, no pagination: it returns the **entire season** — every club, every
gameweek, every fixture, with forecasts, prices, records and reviews attached. About 420 KB of JSON,
gzipped over the wire (`GZipMiddleware`, anything above 1 KB).

There is also `GET /api/health`, which is deliberately database-free (a monitor pointed at it must not keep
Neon awake), and `POST /api/admin/refresh` plus `GET /api/admin/refresh/latest`, which require
`Authorization: Bearer <REFRESH_TOKEN>` and are for the owner's UI, not for third parties.

**Two things to know before you start:**

1. **CORS is locked to `http://localhost:3000`, GET only, no credentials** (`backend/app/main.py`). Browser
   JavaScript on another origin will be blocked. Call it from a server, a script, or add your origin to the
   middleware if you run your own copy.
2. **This is a personal, single-user app on free tiers.** There is no public deployment to point at. A third
   party runs their own copy (`.venv\Scripts\python -m uvicorn app.main:app --port 8000`) against their own
   database and their own API keys.

### 10.2 The response envelope

Every response uses the same wrapper (`ApiResponse` in `backend/app/schemas.py`):

```json
{
  "success": true,
  "data": { "season": "2026/27", "current_matchday": 7, "model_version": "dixon-coles-v1+42f7fe83",
            "lens_scales": { … }, "matchdays": [ … ], "teams": [ … ] },
  "error": null,
  "meta": {
    "last_synced_at": "2026-09-20T15:16:49.069319Z",
    "last_predicted_at": "2026-09-20T15:16:44.263531Z",
    "model_notes": [ { "lens": "defence", "text": "Clean-sheet chances currently run about 4 points high; …" } ]
  }
}
```

| Situation | Status | Body |
|---|---|---|
| Normal | 200 | `success: true`, `data`, `meta` |
| No fixtures loaded yet | 200 | `success: false`, `error: "No fixtures yet."` |
| Database unavailable (e.g. Neon suspended) | 503 | `success: false`, `error: "Fixture data is temporarily unavailable."` |
| Anything unexpected | 500 | `success: false`, `error: "Something went wrong."` |

So **check `success`, not just the status code**.

### 10.3 Field dictionary

**`data`** (`FixtureGrid`)

| Field | Type | Notes |
|---|---|---|
| `season` | string | `"2026/27"` |
| `current_matchday` | int \| null | the first unfinished matchday |
| `model_version` | string \| null | hash of the tuned config + calibration; changes when the model is re-fitted |
| `lens_scales` | object | see below |
| `matchdays` | array | one per gameweek column, in order |
| `teams` | array | one per club, sorted by name |

**`matchdays[i]`** (`GridMatchday`): `number` (the gameweek number — note it may not equal `i`),
`date_from`, `date_to` (ISO-8601 UTC), `finished` (bool).

**`teams[i]`** (`GridTeam`): `code` (3 characters, `^[A-Z0-9]{3}$`), `name`, `color` (`#rrggbb`),
`crest_url` (always `https://crests.football-data.org/…` or null), and `cells`.

**`cells`** is `list[list[GridCell]]`, **index-aligned with `matchdays`**. An empty inner list is a blank
gameweek; two entries is a double.

**`cells[column][n]`** (`GridCell`)

| Field | Type | Notes |
|---|---|---|
| `fixture_id` | int | stable across refreshes; the same id appears on both clubs' rows |
| `opponent_code` | string | the other club's `code` |
| `venue` | `"H"` \| `"A"` | this club's venue |
| `kickoff_utc` | datetime | UTC; the UI renders `Europe/Madrid` |
| `date_confirmed` | bool | false while the provider still says "SCHEDULED" (date not fixed) |
| `rescheduled` | bool | more than 4 days from its matchday's usual dates |
| `status` | `scheduled` \| `live` \| `finished` \| `postponed` | normalised from the provider's vocabulary |
| `result` | object \| null | `goals_for`, `goals_against`, `outcome` (`W`/`D`/`L`) — finished only |
| `review` | object \| null | finished games with a stored forecast — see [6.3](#63-the-post-match-review-review) |
| `prediction` | object \| null | absent for postponed games and for played games the app never forecast |
| `market` | object \| null | `scheduled` fixtures with a live price only |
| `record` | object \| null | banded by our win chance; null below 5 games of history |
| `record_price` | object \| null | banded by the bookmakers' price; `scheduled` only |

**`prediction`** (`CellPrediction`): `difficulty` (0–100, 1 dp), `label` (one of the five words), `bucket`
(1–5, always `label` + 1), `expected_points` (3 dp), `probabilities.{win,draw,loss}` (3 dp),
`clean_sheet` (3 dp, calibrated), `xg_for`, `xg_against` (2 dp), `both_score` (3 dp, may be null on
forecasts made before 2026-09-20).

**`market`** (`CellMarket`): `win`, `draw`, `loss`, `scores`, `scores_2plus`, `clean_sheet`,
`concedes_2plus`, `both_score` (all fair probabilities, margin removed, 4 dp), `expected_points`
(`3×win + draw`), `bookmakers` (count), `fetched_at`.

**`record` / `record_price`** (`CellRecord`): `band` (`"under 20%"`, `"20-35%"`, `"35-50%"`, `"50-65%"`,
`"65% or more"`), `games`, `wins`, `rate` (the club's own), `league` (everyone at the same price), `edge`
(shrunk gap — **not** `rate − league`).

**`review`** (`CellReview`): `outcome_chance`, `points`, `expected_points`, `surprise`.

**`lens_scales.<lens>`** (`LensScale`): `cuts` (exactly 4 numbers) and `higher_is_easier`. Bucket for a
value = 1 + how many cuts it crosses (below the cut when `higher_is_easier`, above it when not). Lenses:
`overall`, `attack`, `defence`, `odds`, `record`, `market_record`.

### 10.4 Rules a consumer has to respect

These are the semantics the UI relies on; ignore them and your numbers will drift from the board's.

1. **A played game's forecast is history, not a fixture.** Finished cells now carry `prediction` and
   `record`. Exclude `status === "finished"` from any total, average or ranking, exactly as
   `lensValue`/`runValue` do.
2. **Rates average, quantities sum.** Expected points, expected goals and expected clean sheets add up over
   a run. Market points, `record.edge` and `record_price.edge` must be averaged per rated game.
3. **A blank gameweek is worth 0 points, not null** — but a blank week in the *past* is null, and so is a
   week whose only game cannot be rated on that lens.
4. **Labels are venue-dependent.** If you re-derive labels from `difficulty`, use the club's `venue`:
   the top cut is 36.0 at home, 23.4 away; the others are 48.6 / 61.1 / 71.3.
5. **`edge` is already shrunk** toward zero by sample size. Do not recompute it as `rate − league` unless
   you want the unshrunk version, and if you do, respect the 5-game floor.
6. **Prices vanish at kickoff.** `market` and `record_price` exist only while a fixture is `scheduled`.
7. **`model_version` changing means the forecasts were re-fitted**, not that the schema changed. Reviews of
   old games deliberately keep the version that produced them.
8. **Everything is rounded on the way out** (see the dictionary). Do not expect `3×win + draw` to equal
   `expected_points` to more than 3 decimals.
9. **`matchdays[i].number` is the gameweek number; `i` is the column.** Always index `cells` by column.

### 10.5 Getting a typed client for free

The API's OpenAPI document is generated from the code and committed:

```bash
python -m app.openapi_export          # writes frontend/lib/openapi.json (no server, no database needed)
```

From it, the frontend generates TypeScript types with `npm run gen:types` (openapi-typescript →
`frontend/lib/api.gen.ts`). Any generator that reads OpenAPI 3.1 will work the same way for other languages.
`frontend/lib/schema.ts` additionally validates the payload at runtime with Zod — a useful reference for the
exact nullability of every field.

With `APP_ENV=dev`, the API also serves Swagger UI at `/docs`, ReDoc at `/redoc` and the raw document at
`/openapi.json`.

### 10.6 Examples

**Shell — a club's next five fixtures:**

```bash
curl -s http://127.0.0.1:8000/api/fixture-grid \
  | jq '.data.teams[] | select(.code=="VIL") | .cells[6:11][][] | {opponent_code, venue, difficulty: .prediction.difficulty, label: .prediction.label}'
```

**Python — flatten the whole board into a DataFrame:**

```python
import pandas as pd, requests

payload = requests.get("http://127.0.0.1:8000/api/fixture-grid", timeout=10).json()
assert payload["success"], payload["error"]
grid = payload["data"]
matchdays = grid["matchdays"]

rows = []
for team in grid["teams"]:
    for column, cells in enumerate(team["cells"]):
        for cell in cells:
            prediction = cell.get("prediction") or {}
            record = cell.get("record") or {}
            rows.append({
                "club": team["code"],
                "gameweek": matchdays[column]["number"],
                "opponent": cell["opponent_code"],
                "venue": cell["venue"],
                "kickoff": cell["kickoff_utc"],
                "status": cell["status"],
                "difficulty": prediction.get("difficulty"),
                "label": prediction.get("label"),
                "expected_points": prediction.get("expected_points"),
                "win": (prediction.get("probabilities") or {}).get("win"),
                "record_edge": record.get("edge"),
            })

board = pd.DataFrame(rows)

# The five kindest runs over the next five gameweeks, played games excluded.
window = board[(board.gameweek.between(7, 11)) & (board.status != "finished")]
print(window.groupby("club").expected_points.agg(["sum", "count"]).sort_values("sum", ascending=False).head())
```

**TypeScript — your own fixture-difficulty score:**

```ts
import type { components } from "./api.gen"; // generated from openapi.json

type Grid = components["schemas"]["FixtureGrid"];
type Cell = components["schemas"]["GridCell"];

const rateable = (cell: Cell) => cell.status !== "finished" && cell.prediction !== null;

export function myFdr(grid: Grid, code: string, from: number, to: number): number | null {
  const team = grid.teams.find((t) => t.code === code);
  if (!team) return null;
  const cells = team.cells.slice(from, to).flat().filter(rateable);
  if (!cells.length) return null;
  // Example: weight the win chance twice as heavily as expected points.
  const score = cells.reduce((total, cell) => {
    const p = cell.prediction!;
    return total + (2 * p.probabilities.win + p.expected_points / 3);
  }, 0);
  return score / cells.length;
}
```

**Reading the model's own artifacts** (if you have the repository rather than just the API): the tuned
settings, the clean-sheet calibration and the blend weight are three small JSON files in
`backend/artifacts/`, and the full backtest write-up is `backend/reports/backtest_laliga.md`.

### 10.7 If you want numbers this API does not expose

The API serves the board's view. Some things live only inside the backend:

| You want | Where it is |
|---|---|
| Raw model probabilities before the market blend | `services/rating_predictions.predict_both_sides`, or set the blend weight to 0 |
| Club attack/defence ratings | `DixonColesModel.ratings()` — not in the payload |
| Per-match shots, red cards, historical odds | `backtest/data.load_history` (the football-data.co.uk frame) |
| Backtest metrics, calibration tables | `python -m app.jobs.backtest`, `reports/experiments/*.py` |
| Post-match verdicts (variance vs evidence) | `services/postmortem.review_rows`, research only |

### 10.8 Operating etiquette

- **Do not poll.** The grid changes only when a refresh runs. Cache it — the frontend caches for an hour and
  revalidates on refresh — and never point an uptime monitor at a database-backed endpoint (that alone
  costs ≈182 CU-hours/month against Neon's 100).
- **Refreshes are rate-limited by design:** at least 10 minutes apart, odds at most every 6 hours, one
  football-data.org call per run.
- **Respect the upstream terms if you redistribute anything:** football-data.org and The Odds API free tiers
  are for personal, non-commercial use; club crests are hot-linked from `crests.football-data.org` under no
  stated licence and must not be downloaded or proxied; Transfermarkt scraping is prohibited; no LaLiga logo
  or wordmark is used anywhere.
- **Secrets stay in `.env`.** Never log a request URL containing The Odds API key.

---

## 11. Glossary

| Term | Meaning |
|---|---|
| **xPts / expected points** | `3 × P(win) + P(draw)` for one club in one match |
| **Difficulty** | `100 × (1 − xPts ÷ 3)`; 0 = certain win, 100 = certain loss |
| **Bucket** | 1–5, the tile colour; always the label's index + 1 |
| **Lens** | Which number the tiles and totals show: Overall, Attack, Defence, Record, Vs odds, Odds |
| **Gap / edge** | A club's win rate at a price minus the league's, shrunk by sample size |
| **Band** | One of the five price groups a fixture falls into |
| **λ (lambda)** | Expected goals for one side in one match |
| **rho** | The Dixon-Coles low-score correction |
| **Spread** | Post-fit stretch of the ratings that undoes some of the ridge shrinkage |
| **RPS** | Ranked probability score — the forecast metric; lower is better |
| **Surprise** | Probability of a result at least as odd as the one that happened, under that forecast |
| **Blind replay** | Walk-forward backtest where each season's settings were tuned only on earlier seasons |
| **Model version** | Hash of the tuned config plus calibration; stamped on every prediction row |

---

## 12. Where to change what

| To change… | Edit | Then |
|---|---|---|
| A model setting | `backend/artifacts/dixon_coles.json` (via `python -m app.jobs.backtest`) | re-run the backtest, refresh, update the baselines in `CLAUDE.md` |
| The blend weight | `backend/artifacts/market_blend.json` (a product choice, not a fit) | refresh |
| Label words or cuts | `backend/app/services/scoring.py` | refresh in the same session — old rows carry the old words |
| The record's bands or shrinkage | `backend/app/services/odds_record.py` | refresh |
| Anything in the payload | `backend/app/schemas.py` | `python -m app.openapi_export`, `npm run gen:types`, then `frontend/lib/schema.ts` |
| A lens | `LensScales` in `schemas.py` first — the frontend's `Lens` type is derived from it | then `LENS_COPY`, `PRICE_OPTIONS`, `lensValue`, `runValue`, `cellBucket` |
| Database shape | `backend/app/models.py` | autogenerate a migration, review it, `python -m app.migrate` |
