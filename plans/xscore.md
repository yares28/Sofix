# Plan · the xScore: why some predictions look wrong, then the fix (T1)

Written 2026-09-30. Entry in [TODO.md](../TODO.md) (T1); the sibling plan is [futbolfantasy.md](futbolfantasy.md),
which makes Futbol Fantasy the main source of the "will he start?" number (your decision, 30 Sep). S4 in
[docs/sorare_plan.md](../docs/sorare_plan.md) is this plan's checklist.

**Scheduled in [roadmap.md](roadmap.md) (2 Oct 2026):** P0 and P1 in its batch 1, before round 8 locks; P2 to P6 in batch 3;
P7 and P8, your two issues of 3 Oct, in batch 9; P9, the new xScore you asked for on 3 Oct, in batch 10.
One change from this file: P1's record goes in a read model, like `start_chances`, so it needs no migration and starts before the
lock. This file keeps the detail; the order and the results are in the roadmap.

**What you said.** Giorgi Tsitaishvili shows 45 and Oyarzabal 43 in an international week; Oyarzabal has had a weird
club start but with Spain "he always does something", Giorgi rarely starts in LaLiga and often has worse games. "We
need a deep dive to find the issues and edge cases."

**Why it matters on screen.** Every number on every tile and every plan comes out of one function,
`backend/app/sorare/forecast.py`. A fix here moves all of them, so nothing is changed without a measurement that says
it is better.

---

## 1 · What is known

### How Sorare scores (confirmed 2026-09-30 from Sorare's help page, "How does scoring work in Sorare Football?")

- Player score = decisive score + all-around score, 0 to 100.
- Decisive score starts at level 0, **35 points for a starter and 35 for a substitute who comes on**. Each positive
  decisive action raises the level (two goals and an assist, minus a red card, is level 2 = 70); each negative one
  lowers it.
- Above level 0 the score has a guaranteed minimum whatever the all-around score says; at or below level 0 a negative
  all-around score can pull it lower.
- The all-around and decisive tables are **images** on that page (not machine-readable); the level-to-points steps
  (60, 70, 80, 90, 100) are as you described them.
- "If a player has two matches in a week, only one match will be counted." The page does not say *which*; Sorare's own
  lineup screen says "Best score chosen". Our hindsight code assumes the best (`player_weeks`: `max(played)`), so this is
  to be confirmed from data (P0) before the two-game work relies on it.

### Sorare's scoring tables (read 3 Oct 2026)

The same help page ("How does scoring work in Sorare Football?", article 4402904001809, updated 5 Aug 2026) has three
pictures. They were downloaded through its public help-centre API and read; nothing on sorare.com was scraped.

- **The levels.** Level −3 is 0 points, −2 is 5, −1 is 15, **0 is 35**, 1 is 60, 2 is 70, 3 is 80, 4 is 90, 5 is 100. Only the
  levels from 1 up are guaranteed: there, a negative all-around score cannot pull him below the level. At 0 and below it can.
  The text says it in words: "Players start at level 0 (35 points for a starter and 35 points for a substitute who comes on
  during the match)."
- **The decisive actions.** Up a level: goal, assist, penalty won, clearance off the line, **clean sheet (goalkeepers only)**,
  penalty save, last-man tackle. Down a level: red card, own goal, penalty conceded, error leading to a goal.
- **The all-around table** gives points per action, by position, in two columns, "current" and "new". The changes this
  season are in the new column. The ones that matter here:

  | Action | Goalkeeper | Defender | Midfielder | Forward |
  |---|---|---|---|---|
  | Goal conceded | **−5 in the real scores** (the picture says −3; was 0) | **−4** (was −2) | −2 | 0 |
  | Clean sheet, 60 minutes or more | (it is a decisive action instead) | +10 | 0 | 0 |
  | Save / save inside the box / diving save / diving catch | +2 / **+2** (was +1) / +3 / +3.5 | | | |
  | Shot on target, big chance created | +3, +3 | +3, +3 | +3, +3 | +3, +3 |
  | Yellow card, error leading to a shot | −3, −5 | −3, −5 | −3, −3 | −3, −3 |

  **Settled 4 Oct 2026 (P9 X1), from the points Sorare actually gave:** scoring version 7 is on all 14,142 appearances of 2025/26 and
  2026/27 alike, and **95 of the 96 stats with a value in the picture give exactly the new column's points per unit** (each checked on
  every game it was made in). The one exception is a keeper's goal conceded, which costs **−5** (687 cases, in both seasons), not the
  −3 of the picture. So the new column is in force and is the table the stat sheet counts by, with −5 for a keeper's goal conceded
  (the stored points per stat are kept beside every count, so the table is never assumed). First sign, 3 Oct: Sivera's 13 accurate
  passes at Athletic on 19 Sep counted 1.3, the new column's 0.1 each for a keeper.

**What it means for a goalkeeper.** A clean sheet puts him at level 1, so at least 60, and the saves come on top. Without one
he stays at 35 and loses 3 for every goal, which saves only partly make up. So his score depends mostly on the goals his side
lets in, and that depends mostly on the opponent. **Measured** on the 52 league starts your LaLiga keepers made this season
(scores from the history export, results from the database, read-only): a clean sheet **75.6** on average, one goal conceded
**45.1**, two **43.9**, three **33.8**, four or more **33.4** (with one 60, a penalty save). Against Barcelona, Real Madrid or
Atlético they averaged **33.4** (7 games), against everyone else **50.8** (45 games).

**What it means for a substitute.** He starts at the same 35 as a starter and adds what he does in his minutes. **Measured** on
your 84 players since August 2025 (every substitute appearance): defenders 39.4 (194 appearances, 22 minutes on average),
midfielders 41.8 (272), forwards 41.0 (244); 8 to 13% reach 60 or more (a decisive action in the minutes he gets) and 24 to 37%
end under 35 (a negative all-around score). By minutes on the pitch: under 15, 37.9; 15 to 30, 39.8; 30 to 45, 46.1; more, 46.3.
A goalkeeper almost never comes on (2 appearances off the bench against 380 starts).

### How the numbers are made today (`forecast.py`, read 2026-09-30)

| Quantity | How |
|---|---|
| Score if he plays, `mu` | Sorare's projection when it has one, else his last five games' mean pulled towards 45 |
| Chance he plays, `p_play` | Sorare's starter + substitute odds when it has them, else his last five games' play rate |
| Chance he starts / comes on | Sorare's odds when it has them, else his last five games (form) |
| Score if he starts, `start` | Sorare's projection when he has **no start in his last five**, or when his share of starts is 75% or more and Sorare has a projection; otherwise his own starts, smoothed towards 51 |
| Score if he comes on, `bench` | chance of coming on if benched × his substitute scores, smoothed towards 42 (measured: 41.9 in about 22 minutes over 87 appearances) |
| Two games in the week | chance of playing at least one; `mu += 0.56 × 17.6 × plays² ÷ p_any` (a best-of-two bump); one value of `mu` for both games |
| Spread | 17.6 for every player (`planner.SCORE_SD`) |
| Expected score | `p_play × mu`; plans use it, the tile shows `start` and `p_start`, not this |
| The opponent | **Not used** (checked 3 Oct 2026). The difficulty, clean sheet and win chance in the panel come from the board and are only shown beside the score; no number in this table depends on them, so a keeper facing Barcelona gets the same score as against anyone else. P8 is the fix. |
| The panel's "Benched" number | `bench` above: the chance he comes on *if he does not start* × his substitute score. It is an expectation that includes not playing, not a score Sorare can give: on round 8's plan the middle value is 0.8 for a keeper, 11.4 for a defender, 12.6 for a midfielder and 17.1 for a forward, while a player who comes on scores about 40. P7 is the fix. |

Two things in that table matter for your example before any model work:

- **The big number on a tile is "if he starts", not the expected score.** A player who seldom starts and one who always
  does can show the same figure; the percentage beside it is what tells them apart. That is by design (O9/O10) but it is
  exactly what makes "Giorgi 45, Oyarzabal 43" look wrong. See question 1.
- **The form is five games in any competition.** Club and national-team games are pooled (`history` carries each
  game's competition; `forecast.py` does not use it, and `NATIONAL` is defined there but read nowhere else).

### What there is to measure with (read-only counts, 2026-09-30)

| Source | Holds | Enough? |
|---|---|---|
| `sorare_forecasts` (Neon) | 3 gameweeks, 30 rows, **11 scored**, 12 with two or more games, **0 with Sorare's playing-status odds** | No. Too few to test anything; it grows by about a dozen to a few dozen rows a week. |
| Sorare's per-game history (`sync.history`) | per game: score, played, started, minutes, status, competition; 70 days back, 40 games at most, your players only; **not kept** between runs | Yes for a form-only backtest, if exported and kept (P2). Does not hold what Sorare projected at the time. |
| Decisive / all-around split | not fetched; the API's field names are not confirmed | Unknown (P0). |

What `sorare_forecasts` does **not** record, and so cannot be tested later: Sorare's starter odds on their own (only
starter + substitute), the start/bench split, each game's competition, minutes, and which of two games scored. P1 adds
them, because every week not recorded is lost for good (Sorare only serves the next fixture's projection).

## 2 · Leads to check first (P0)

Each is a hypothesis with a cheap test, run on your two examples.

| # | Lead | Test |
|---|---|---|
| L1 | Giorgi's 45 **is** Sorare's projection because he has no start in his last five, so `start = mu = projection`. A rarely-starting player's "if he starts" is then Sorare's "if he plays" number, not a starter's score. | Build his `PlayerWeek` from his history and Sorare's projection, run `forecast()`. |
| L2 | Oyarzabal's "54% he starts" is the form formula, not Sorare's odds: 3 starts in his last 5 games gives (3 + 0.8) ÷ 7 = 54%. With Spain he nearly always starts, but the five games are mostly club games, and Sorare's odds are missing (0 of 30 rows). | Count his starts by competition; read Sorare's odds for him by hand. |
| L3 | A two-game week is treated as two copies of the **next** game. Sorare's projection is for the next fixture only; the bump reuses one `mu` and one `plays` for both; the tile's `start` has no bump and nothing says "2 games". (The TODO's "uses only one of his games" is half right: plans do count a best-of-two, the tile does not.) | Run `forecast()` for a two-game player with `games` 1 and 2; look at `mu`, `start`. |
| L4 | For a national-team game the tile's xG is his club xG, unscaled (your note). Not an xScore fault, but the same kind of "wrong competition" error. | Read `overlay` for a national-team game. |
| L5 | A flat 17.6 spread overstates the variance of a starter and understates a substitute's. It changes reward odds, not the expected score. | Spread of scores by role in the history. |
| L6 | "Best score chosen" really is the max of the two games. | For players with two games in a week, compare the lineup's card score (the extension reads it) with both game scores. |

*Done when:* each is marked confirmed or refuted in TODO.md, with the numbers. This is also the answer to the TODO's
"first lead": whether the tile is Sorare's projection passed straight through, and for whom.

### P0 findings, 2 Oct 2026

**Method.** The numbers are the page's own (`read_models`, `sorare_forecasts`, read-only `SELECT`s) for GW19 (`football-2-6-oct-2026`:
Georgia's two Nations League games for Giorgi, Spain–Czechia for Oyarzabal). Their game history was read from Sorare (read-only,
small queries: the local `.env` holds no Sorare key, so the keyless limits of depth 7 and complexity 500 apply), and `forecast()` was run on
that history with Sorare's projection (47 and 52). **The rebuilt numbers equal the page's to the decimal**: Giorgi `mu` 52.82, `start`
45.0, `p_start` 54.3%, expected score 49.3; Oyarzabal `mu` 52.0, `start` 52.0, `p_start` 68.6%, expected 46.1. Nothing on the page is an
arithmetic slip; the questions are about what the arithmetic assumes.

| # | Verdict | What the numbers say |
|---|---|---|
| L1 | **Refuted as worded, and a different problem found** (F1) | Giorgi's 45 is not Sorare's projection (47): it is his own three recent starts (50.4 for Georgia, 35.2 and 37.2 for Rayo) pulled towards 51. |
| L2 | **Confirmed** | `p_start` is the form formula on his last five games of any competition: 4 starts of 5 gives (4 + 0.8) ÷ 7 = 68.6% (it was 3 of 5, 54%, on 30 Sep, before his 29 Sep start). Sorare gave no starter odds: 0 of 14 players in refresh #42, `plays_odds` empty in all 30 rows of `sorare_forecasts`. |
| L3 | **Confirmed**, and worse (F3) | Giorgi has two games; the expected score counts the best-of-two (47 → 52.82, ×93.4% = 49.3) but the tile's "if he starts" 45.0 does not, and nothing says "2 games". |
| L4 | **Confirmed, by design** | `xgFor` (`frontend/lib/overlay.ts`): a national-team game shows his club rate as it is, unscaled, on purpose (O11). Not an xScore matter; what to show instead is plan step P4.5. |
| L5 | **Measured** (2 Oct, P2) | Over your 84 players: starters score 52.1 with a spread of 19.1 (17.6 within one player, the model's number), substitute appearances 40.9 with 12.2 (8.9 within one player). The flat 17.6 is right for starters and about twice too wide for the bench. See "Results of P2 and P3". |
| L6 | **Answered** (2 Oct) | Sorare says it in each competition's rules: `engineConfiguration.multiGameScoreAggregator` is `max` on all 29 leaderboards of GW19 (one keyless question, depth 7, complexity under 500), so a player with two games in a gameweek counts his **best** score, which is what the model assumes. The refresh job already asks for the field (`sync.LEADERBOARD`) and ignores it: a competition with another rule would be planned wrongly without a word. A guard (keep the value, warn when it is not `max`) is a small follow-up. |

**Their last five games before the lock** (the model's whole view of them):

| | 28–29 Sep | 25–26 Sep | 19–20 Sep | 15–17 Sep | 12–13 Sep |
|---|---|---|---|---|---|
| Giorgi (Rayo, Georgia) | Georgia start, 90', **50.4** | Georgia: did not play | LaLiga sub, 19', **30.6** | LaLiga start, 76', **35.2** | LaLiga start, 90', **37.2** |
| Oyarzabal (Real Sociedad, Spain) | Spain start, 90', **36.3** | Spain sub, 35', **60.0** (a goal) | LaLiga start, 61', **41.6** | Europa League start, 73', **32.2** | LaLiga start, 79', **38.7** |

Behind them: Oyarzabal's eight Global Cup games for Spain (June–July) averaged **55.0**, against about 44 in his 2026/27 LaLiga games;
he started 6 of his 7 LaLiga games this season, Giorgi 2 of 7 (3 not used at all).

**What it shows.**

- **F1 · A cliff, not a rule.** `start` ("if he starts") is Sorare's projection for a *regular starter* (his start share, `p_start ÷
  (p_start + p_on)`, 75% or more, and a projection) and his own smoothed starts for anyone else. Oyarzabal's share is 77.4%, so his tile is
  Sorare's 52, while his four recent starts averaged 37.2 (form alone says 41.8). Giorgi's share is 73.1%, so his tile is his own 45.0, with
  Sorare's 47 beside it unused. A hair's difference in share switches which kind of number a tile shows, and "45 against 52" compares
  two different kinds. This is the plain reason the pair looked wrong.
- **F2 · Club and country are pooled.** Both players' last five mix club and national games, so the start chance, the sub chance and
  the score are averages of two roles: Oyarzabal's Spain games score 55 on average and his LaLiga starts 44; Giorgi's only recent
  Georgia start scored 50.4 against 35–37 for Rayo. This week is all national-team games, so the tile answers a question about Spain with
  an average about Real Sociedad. It is the "competition matters" point of your note, now with numbers; P4 step 1 is the fix.
- **F3 · Sorare publishes a projection for each game.** Oyarzabal: 52 for 3 Oct (grade F, reliability 100%) and 50.0 for the second Spain
  game on 6 Oct; Giorgi: 47 for both games (grade E, reliability 100%). The model reads one number per week
  (`nextClassicFixtureProjectedScore`, the next game) and uses it for both games. A week with two games can use both, and the
  reliability can feed the spread (P6).
- **F4 · The bench number is one or two appearances.** A substitute scores 35 plus his all-around points (Giorgi, 19 minutes: −4.4,
  so 30.6; Oyarzabal, 35 minutes: a goal puts the decisive level at 60 and the all-around −1.5 cannot pull him under it, so 60.0: the
  floor rule, confirmed). The model's substitute score is `(his sub scores + 2 × 42) ÷ (n + 2)`: Giorgi's one sub (30.6) makes it 38.2
  and Oyarzabal's one (60.0, a goal) makes it 48, then times the chance of coming on (40% and 53%) gives the "15.3" and "25.6" under "if he
  doesn't start". A single goal moves a player's bench score by about seven points (48 instead of 41 for a 38 in its place). This is the bench-score issue in numbers; P4 step 3.
- **F5 · The chance of starting is always our own or Futbol Fantasy's.** Sorare's starter odds are absent in practice (see L2), so for
  any game outside Futbol Fantasy's reach the number is the form formula.

**Sorare's field names** (from its published schema, `https://api.sorare.com/graphql/schema`): on a `PlayerGameScore`:
`allAroundScore`, `decisiveScore { stat points totalScore }` (the level: 35, 60, …), `positiveDecisiveStats` and `negativeDecisiveStats`
(`stat statValue points`), `allAroundStats`, `detailedScore`, `projectedScore` and `projection { score grade reliabilityBasisPoints }`; on its
stats `gameStarted` and `minsPlayed`, which were right in all four games checked, national-team games included (90, 35, 90 and 19
minutes). A score is exactly decisive level + all-around, with the floor above level 0: 35 + 1.3 = 36.3, 35 + 15.4 = 50.4,
35 − 4.4 = 30.6, and 60 (not 58.5).

## 3 · How to measure

Two tracks, because the data for the two questions is different.

**Track A · form-only walk-forward (possible now).** For every player-game in the history, rebuild what Sofix would have
said knowing only the games before it, through the **production code path** (`player_weeks` → `forecast`), and compare
with what he scored (did-not-play = 0, as in `p_play × mu`). It says whether a change to the form model helps. It cannot
say anything about Sorare's projection, which is not in the history.

**Track B · recorded forecasts (accumulating).** `sorare_forecasts` compares what Sofix and Sorare said before the
lock with the score, the only place Sorare's projection can be tested. Today 11 scored rows; evaluate it when it has
about 100 scored players with a projection, and not before.

**Data for Track A.** A one-off, throttled export of each of your players' game history for the whole of 2025/26 and the
season so far (about 80 calls, written to a local git-ignored file, within Sorare's read limits; the job's 70-day
window is too short). All LaLiga players (about 500 calls) only if the intervals come out too wide: your decision, not a default.

**Split, declared now.** Tune on 2025/26 and on 2026/27 up to the end of September 2026. Hold out every gameweek from
1 October 2026 on, untouched until a candidate is ready; it grows by itself. (This is S4's "declare train/test split".)

**Baselines.** Always 45; last-five mean; last-five mean by competition (club or national); today's `forecast()` without
Sorare's numbers.

**What is scored.** Expected-score error (MAE and RMSE of `p_play × mu` against the score); availability separately
(Brier of "plays" and "starts"); score-given-started and score-given-substitute; calibration of "plays".
**Sliced by** club vs national, starter vs substitute vs did-not-play, position, one vs two games, and how many games of
history he had.

**What decides a plan.** Ordering matters more than level: within a position and gameweek, the rank correlation of
expected vs actual score, and whether the top five by expected score held the best actual total. A change that lowers
MAE but reorders worse is not a win.

**The bar** (the repo's own, AGENTS.md "Model rules"): ship only if the difference, resampled by whole gameweeks, has a
95% interval that excludes zero on the held-out weeks, or calibration improves with no loss. A fitted number that does
not clear it is not shipped, and "no change" is an acceptable result.

## 4 · Phases

### P0 · Diagnose the two examples (about a day)

Run L1–L6 and write the findings in TODO.md. Needs Sorare access for your account (`SORARE_USER` and the API key in the
local `.env`; the cloud session this plan was written in has neither, so this part runs on your machine or a session
that has them). Also settle the open unknowns: the API's field names for decisive and all-around scores; whether
`gameStarted` and `minsPlayed` are reliable for national-team games.

### P1 · Record more, and one visible quick win (about a day; no migration after all)

- **Built 2 Oct 2026, in a read model instead of new columns** (roadmap 1.3): the record of what each source said
  (`start_chances`) now also holds, per player, the model's numbers (`model`: Sorare's projection and starter odds alone, our
  `pStart`/`pOn`/`start`/`bench`, which source's number was used, how much form he had) and, per game, `info` (competition,
  opponent, home or away, kickoff); once settled, each game also has `score`, `mins`, `played` and `comp`. It follows the
  rule of the chances (replaced while the week is open, frozen at its lock) and starts recording with the next run. Columns on
  `sorare_forecasts` (what this paragraph first asked for, with a migration you would apply first) only follow if P2 needs
  SQL over them; that would be a Stop. See [docs/how_it_works.md](../docs/how_it_works.md) section 10.
- **"2 games" on the tile, and both games in the hover panel.** Display only; no model change. This is the one item in
  this plan that can ship before the backtest, because it only says what the data already holds. Overlay e2e, design
  check, desktop and mobile screenshots. **Built 2 Oct 2026** (roadmap 1.4, extension 0.3.1): a small **×2** off the tile's
  corner and both games, with their kickoffs, in the panel.

### P2 · The backtest harness (two to three days)

`backend/app/sorare/backtest.py` and a read-only job, reusing `backend/app/backtest/metrics.py`; an export script for
the history; tests first with synthetic histories (a player built to start in national games and not in club games must
show the error the current model makes). Output: the tables in section 3, by slice, for today's model. No behaviour change.

- **Tools built 2 Oct 2026** (roadmap 3.1); the numbers follow once the export is whole.
  - `app/jobs/export_history.py` reads every game of your players back to August 2025 from Sorare's public API into
    `backend/data/raw/sorare_history.json` (git-ignored). Without a key Sorare refuses a client that asks too fast, so it asks
    once a second, waits out a refusal and asks the same question again, and a run still refused after three waits stops where it
    is; started again it goes on from the players already kept.
  - `app/sorare/backtest.py` walks forward through that file: each game is predicted by the production forecast from the games
    before the gameweek it is in (so the second game of a week does not see the first), against three simple baselines (a flat 45,
    his last five, his last five of the same kind), with a game he did not play counting as zero. It gives error by model and by
    slice (club or national, what he did, how much history, position, how often he had started, one game or two in the week),
    order within a position and week, and a bootstrap over weeks for "is today's model closer", **by absolute and by squared
    error**. The first run on real games showed why both: a score is zero or about sixty, so the number that misses least on a
    typical game is the median, and an expected score is an average. Today's model came out further than "his last five" by
    absolute error and closer by squared error, so which of the two decides the bar matters (see the results below).
  - `app/jobs/xscore_backtest.py` prints the report: games from `--holdout` (1 Oct 2026 by default) are reported apart and are
    not looked at while tuning.

  ```
  python -m app.jobs.export_history        # once, a few minutes to an hour, read only
  python -m app.jobs.xscore_backtest --out ../backtest-report.md
  ```

### Results of P2 and P3 (2 Oct 2026)

**What was run.** Your 84 players' games from 1 Aug 2025 to 2 Oct 2026: 4,647 games, 4,615 of them scored (4,614 before 1 October,
in 116 Sorare gameweeks, and 1 after). Each game is predicted from the games before its gameweek and set against what he scored,
zero if he did not play. The held-out period (from 1 Oct 2026) holds that one game so far and has not been looked at. The weeks
are Sorare's own gameweeks (the file keeps their windows). The first run grouped games by Monday-to-Sunday weeks instead; its
numbers were nearly the same, but it counted half of the games as being in a two-game week, which was an artefact.

**What it can and cannot say.** It tests the form formula on its own. Sorare's projection and starter odds and Futbol Fantasy's
chances are not in the history, so how the page does *with* them waits for the recorded weeks (Track B). The players are yours, so
mostly regulars: 42% of the games are by a regular starter.

| model | games | typical miss (MAE) | squared miss (RMSE) | level (bias) |
|---|---|---|---|---|
| always 45 | 4,614 | 23.3 | 28.9 | +9.5 |
| his last five | 4,614 | 19.3 | 25.2 | +0.2 |
| his last five of the same kind | 4,614 | 19.2 | 25.2 | +0.2 |
| today's form formula | 4,614 | 19.5 | **24.5** | **-2.9** |

1. **Today's formula is closer than his last five where it counts.** By squared error the difference is -36.4 [-47.4, -26.0]
   over 116 gameweeks, an interval under zero; by typical miss it is slightly further (+0.23 [+0.02, +0.44]). Both are shown
   because a score is 0 or about 50: the number that misses least on a typical game is the median, while an expected score is an
   average, and squared error is the one that rewards an average that is right.
2. **Its level is too low.** It says 32.6 on average and they scored 35.5 (-2.9): -1.4 to -3.6 in every slice but national-team
   games, goalkeepers -2.6. Both halves are low: the chance of playing is said 68% and was 71.5%, and the score when he plays is
   said 48.1 and was 49.7. The two priors that pull a short record down (a 60% chance of playing and 45 points, each worth two
   games) are too low for these players; the priors for a start (51) and a substitute appearance (42) are right: starts averaged
   52.1 and appearances off the bench 40.9.
3. **It orders players no better than his last five.** The order within a position and a gameweek, which is what a plan chooses by,
   is 0.43 for all three. Before Sorare's own numbers the formula levels better but does not rank better.
4. **Where it loses** to the best simple baseline: only for regular starters (1,921 games), 24.8 against 24.7 for always 45. It is the
   closest everywhere else: rare starters 21.8 against 22.5 (level -1.4), rotation 26.0 against 26.4, and every position. (The
   first game of each player's file has nothing before it for any model, so it is not ranked.)
5. **National-team games** (109 games): 26.2 against 26.5, level +0.6. Nothing yet says club and national form must be kept apart,
   and 109 games is few.
6. **L5, the spread of scores:** starters score 52.1 on average with a spread of 19.1 (17.6 within one player, which is the model's
   flat number; defenders 20.3, midfielders 17.3, forwards 18.8, goalkeepers 19.1). Substitutes score 40.9 with a spread of 12.2
   (8.9 within one player). The flat 17.6 is right for starters and about twice too wide for an appearance off the bench.
7. **Two games in a gameweek are rare** (roadmap 3.2b, scored per gameweek against the best of his games, which is Sorare's own
   rule): 22 of 4,592 player-gameweeks, 0.5%. Sorare opens a gameweek on a Tuesday and a Friday, so a Sunday game and the
   Tuesday one after are two gameweeks; it takes an international break or a postponed game to put two in one. On those 22 the
   formula says too much: 10.7 points above what he made (squared miss 30.4, against 28.1 when told he has one game). Over all
   116 gameweeks the two are no different (+0.65 [-0.96, +2.21]), because the other 99.5% have one game. Too few cases to change
   anything; the number to watch is the 22, which grows with every break.
8. **The one figure (2 Oct, [xscore_success_rate.md](../docs/xscore_success_rate.md), the Audit page).** Of every pair of your players in
   one position and gameweek who scored differently, the xScore rated the better one higher in **66.0%** (64.6% to 67.2%; 39,961
   pairs, 99 gameweeks); a coin flip is 50% and his last five games' average is 66.1%. So finding 3 in one number: it levels
   better than a plain average and does not choose better. By position: goalkeepers 69%, defenders 66%, midfielders 64%, forwards 68%.

**P3: the order of P4 after the data.**

1. **The level (new).** The priors of the chance of playing (about 70%) and of the score (near 49) at these players' own levels.
   Tried on the tuning weeks, below: closer by squared error, and lighter smoothing is not (it only helps the typical miss). Then
   once on the held-out weeks. It is the only error found in every slice. Whether the priors are wrong for LaLiga or only for your
   better-than-average players is what decision 4's wider export would show.
2. **Two games: not a priority** (roadmap 3.2b, built). The week-level backtest on Sorare's own gameweeks finds 22 such
   player-gameweeks in 4,592 and the formula overshooting them (finding 7). Look again after the next international break.
3. **The spread by role (L5):** worth a trial only if it moves the reward chances; try it on one real plan.
4. **Chances and scores kept apart by competition, off the bench, and "if he starts" for a rare starter:** nothing in this data
   asks for them (rare starters and substitutes are among the formula's good slices). They wait for Track B, where Sorare's
   projection enters (P0's F1 and F3 are about it).
5. **A national-team game's xG:** unchanged; it is not an xScore matter.

**P4-1 tried on the tuning weeks only** (2 Oct, 4,530 games, 115 gameweeks; the held-out weeks were not scored). Two ways to take
out the level bias, each run through the same walk-forward:

| change to the form formula | level (bias) | squared miss (RMSE) | typical miss (MAE) |
|---|---|---|---|
| today (priors 60% and 45 points, each worth two games) | -2.77 | 24.41 | 19.45 |
| lighter smoothing, each prior worth one game | -1.63 | 24.47 | 19.19 |
| lighter still, half a game | -0.87 | 24.68 | 19.15 |
| priors at these players' own level (72% and 49.7 points) | +0.17 | **24.26** | 19.43 |
| only the chance of playing at 72% | -1.07 | 24.29 | 19.41 |

Priors at their level are closer than today's by squared error: -7.1 [-11.3, -2.4] over 115 gameweeks (an interval under zero),
and no different by typical miss. Lighter smoothing removes the bias but not the squared error (it is no closer: +2.9 [-1.2, +7.1]);
only the typical miss gets better (-0.26 [-0.34, -0.17]). Most of the gain is the chance of playing alone. So the candidate is **the prior chance of playing at
about 70%, and the score prior near 49**, not lighter smoothing. It is a fitted number, so it ships only if it clears the
held-out weeks, and the wider export (decision 4) would say whether 70% is right for LaLiga or only for your players.

Nothing ships from this: every change needs the held-out weeks, which start on 1 Oct 2026 and grow by themselves.

### P3 · Rank the errors

From P2's slices: which error is biggest (for example national-team games, rarely-starting players, two-game weeks)
and therefore which change comes first. The candidates below are my guess at the order, to be reordered by the data.

### P4 · Fix, one change at a time

Each is: a failing test for the behaviour → the change → the backtest on the tuning weeks → the held-out weeks → ship
only if it clears the bar. One change per refresh, so a shift in numbers can be blamed on something.

1. **Competition-aware availability and score.** Chance of starting, coming on and the score, per (player, competition
   class), shrunk towards the position's norm because a national team plays few games. Replaces "five games of anything".
   Answers "with Spain he always does something".
2. **"If he starts" for a rare starter** stops being Sorare's projection by default (L1).
3. **Doesn't start, done properly.** His own chance of coming on; if he does, 35 + his all-around per minute × the minutes
   he usually gets, with the floor rule above level 0; shown as two plain numbers ("if he comes off the bench ≈38 · 60%
   he comes on"). Replaces the flat 42 and the 30% / 2% priors in `forecast.py`.
4. **Two games.** The expected best of two scores, with the chance of playing each (and how far they move together,
   measured, not assumed), one value per game instead of one `mu` for both.
5. **National-team xG** not borrowed from the club (L4): a scaled number or "No xG", your choice.
6. **Spread by role** (L5), if it changes reward odds enough to matter.

### P5 · What you will see change

Already listed in P1 ("2 games"), then with P4: the bench pair on the tile, the competition named beside the start chance
("for Spain"), the panel naming where each number came from, and plans and captains shifting where they should. The
design sheet (`docs/sorare/design/`) and the overlay e2e are checked for each; desktop and mobile screenshots per
AGENTS.md. Manual, `docs/how_it_works.md` and S4 updated with the numbers, including the new baseline.

### P6 · Sorare's projection (the question you asked)

When Track B has about 100 scored players: is Sofix's number better than Sorare's projection, in which slices? Only
then does "should Sofix overrule Sorare's projection" have an answer, and the answer may differ by slice (for example
ours for club games, Sorare's for internationals). It is your product decision, made with the numbers in front of you.

**Sooner than that (3 Oct):** Sorare keeps, on every past game, the projection and grade it gave before kick-off (all 22 starters of
Athletic–Alavés, 19 Sep, checked), so P9's data (X1) holds it for every LaLiga player and game, and this comparison can be made on two
seasons of history instead of waiting for Track B.

### P7 · The score if he comes on from the bench (your issue of 3 Oct; roadmap 9.4)

**What you said.** "The benched xScore is wrong ... all players that enter from the bench have Decisive score at 35. How it
works now: the benched xScore is always very low, it makes no sense. Backtest it when the player actually starts and when he
doesn't, so there are 2 options of xScore: when he starts and when he doesn't."

**What is wrong.** The panel's "Benched" number is not a score. It is the chance he comes on if he is benched multiplied by what
a substitute scores, so it mixes "will he play?" into "how much?". A keeper comes on about 2% of the time, so his number is 0.8;
an outfield player comes on about 30% of the time, so his is 11 to 17. Sorare cannot give either: a player who comes on starts at
35, and a player who does not play gets nothing. Measured on your players, someone who comes on scores about 40 (section 1).
P0's F4 adds a second fault: the substitute score leans on one or two appearances, so one goal moves it by about seven points.

**The fix, in words.** Two scores, each "if it happens", and two chances:

- **If he starts:** his score when he starts (P8 adds the opponent).
- **If he comes on:** his score when he comes off the bench: 35 plus what he usually adds in the minutes he usually gets, with the
  chance of a decisive action in those minutes (60 or more), never multiplied by the chance of coming on.
- **Starts N%** (Futbol Fantasy's first, then Sorare's, then Sofix's) and **comes on N%** (of the games he does not start).
- The expected score the plans use stays the same sum: chance he starts × score if he starts + chance he comes on × score if he comes
  on. The plans' maths does not change; only what the page shows does, and the "comes on" score gets better.

**How "if he comes on" is made: three candidates, the backtest picks.**

1. Today's substitute score on its own (his appearances off the bench pulled towards 42, each prior worth two appearances), no
   longer multiplied by the chance.
2. 35 + his all-around points per minute × the minutes he usually plays off the bench + the chance of a decisive action in those
   minutes × the jump to 60. This needs the split of each score into decisive and all-around, so the export first reads
   `decisiveScore { totalScore }` and `allAroundScore` for each game (field names confirmed in P0; one more field in the same
   keyless reads, about an hour for 84 players at Sorare's keyless limit).
3. The position's norm by expected minutes (the table in section 1: 38 under 15 minutes, 46 from 30 minutes).

**The backtest you asked for: two separate checks, then the whole.**

1. **Games he started:** "if he starts" as it stood before each game against what he scored. Today's formula, his last five starts
   and the position's norm.
2. **Games he came on:** "if he comes on" against what he scored. Candidates 1 to 3. About 700 appearances in the export.
3. **Everything together:** the expected score against what he scored (zero when he did not play), and the pair figure (66%), so
   that nothing gets worse where the plans choose.

Walk-forward over the 4,615 games as in P2, intervals from resampling whole gameweeks, the held-out weeks from 1 Oct untouched until
the end.

**What you will see.** The panel's two tabs read "52 if he starts" and "39 if he comes on" with their chances. The tile's big number
follows your rule of 3 Oct (decision 1 in the roadmap): Futbol Fantasy's start chance under 40% shows the "comes on" score, 40% or
more the "starts" score. Under 40% the tile also shows his chance of coming on, so a keeper at 5% who comes on 2% of the time reads
"36 · on 2%" and is not taken for a good pick.

**Results (3 Oct 2026, `python -m app.jobs.xscore_backtest --conditional`; tests in `backend/tests/test_xscore_conditional.py`).** Each number
is set against what he scored in games of its own role, walk-forward, from the games before each week's lock; the pool for a position's norm is
every player's games of that role before it. Tuning weeks only: the held-out weeks hold one game so far. (Candidate 2, with the decisive and
all-around split, was not run: it needs the export to read them first, and the results below say there is little left for it to find.)

*If he comes on* (712 appearances off the bench, 99 gameweeks):

| candidate | typical miss (MAE) | squared miss (RMSE) | level (bias) |
|---|---|---|---|
| today's substitute score | 8.5 | 12.3 | +0.4 |
| position's norm | 8.4 | 12.4 | -0.3 |
| his own appearances shrunk to the norm | 8.3 | 12.2 | -0.2 |
| norm by minutes played | 8.5 | 12.6 | -0.7 |

No candidate is clearly closer than today's (each interval over weeks contains zero, by both measures). **So the number does not change: "if
he comes on" is today's substitute score (43.5 for a player with 40 and 50 off the bench, 42 for one who never came on).** What was wrong
was the display, and it is fixed in 0.3.2: the panel's second tab shows this score ("Comes on") instead of the chance times it.

*If he starts* (2,589 games he started, 107 gameweeks):

| candidate | typical miss (MAE) | squared miss (RMSE) | level (bias) |
|---|---|---|---|
| today's `start` (last five games, pulled towards 51) | 15.8 | 19.6 | -0.5 |
| his last five starts | 16.4 | 20.5 | +0.0 |
| position's norm | 15.7 | 19.2 | -0.0 |
| his own starts shrunk to the norm (three games' worth) | **15.4** | **19.0** | +0.1 |

His own starts shrunk to the norm are closer than today's by both measures (squared miss -25.0 [-34.4, -16.2], typical miss -0.39 [-0.61,
-0.17]); the position's norm alone is closer by squared miss (-16.0 [-24.7, -7.1]) and no different by typical miss; his last five starts are
further. That is a model change to "if he starts", fitted on no game it is scored on, but the held-out weeks (from 1 Oct) hold one game, so it
is **held back** like the level fix (roadmap 3.4) until they hold enough.

**Done when:** the three checks are in a table here (done, above); the forecast keeps `bench` for the old payloads and adds the score if he comes on
(defaults applied after the cache read, the lesson of the 500 on /lineups); Play, Lineups and the overlay show the pair; unit tests,
the overlay e2e, `npm run design` and the phone width pass; the manual, `docs/how_it_works.md` and S4 say how the two numbers are made;
one refresh carries this change and nothing else.

### P8 · The opponent in the score (your issue of 3 Oct: Soria against Barcelona; roadmap 9.5)

**What you asked.** Soria shows "52 if he starts" for Barcelona at home to Getafe, with a difficulty of 89, a 9% clean sheet and a 7%
win. Keepers who faced Barcelona this season scored 42, 60 (a decisive action; 29 without it), 20, 23, 24, 36, 73 and 18. How can
his be 52? How are the scores made? Is it only averages?

**Where his 52 comes from.** Only from his own last five games, all starts: 81.5 at home to Málaga (a clean sheet), 51.2 at Betis,
51.0 to Deportivo, 44.7 to Celta, 34.6 at Osasuna. Their average is 52.6, pulled a little towards 51 (what a typical starter scores):
52.1. Barcelona is not part of the sum. The difficulty, the clean sheet and the win chance on the panel come from the board and are
only shown next to the score. So yes: today it is an average of his recent games, nothing else. When Sorare publishes its projection,
about two days before the lock, a regular starter's "if he starts" becomes Sorare's number instead (F1); how Sorare makes it is not
public.

**Why that is wrong for a keeper.** Sorare's rules (section 1): a clean sheet is a decisive action worth at least 60, and each goal
conceded costs 3 (the picture; the real scores give −5, settled 4 Oct). His two clean sheets this season (84.5 and 81.5) carry his average. Against Barcelona a clean sheet is a 3% chance
by the bookmakers (Barcelona scores in 97% of their prices) and 9% by Sofix's board, and Barcelona has scored 31 in 7 league games. Your
list of keepers against Barcelona averages 37 (middle value 30); the three in the export match yours to the point: Agirrezabala 60
(16 Sep), Ryan 20.5 (13 Sep), Dituro 18.2 (23 Aug). A rough sum with this season's keeper scores by goals conceded gives him about
**38 with the bookmakers' prices and 42 with Sofix's**: around 40, not 52.

**The fix: the game goes into the score, position by position, keepers first** (the biggest effect: 33 against 51).

- **Goalkeepers:** chance of a clean sheet × his score with one + the rest × his score without one, the second falling with the
  goals his side is expected to let in (−5 a goal, partly made up by saves). The chance of a clean sheet and the goals expected are
  the board's own for a LaLiga game (the panel's CS and the difficulty page), Sorare's odds for another game, and nothing when there
  are none (then today's number, as now).
- **Defenders:** the same with +10 for a clean sheet of 60 minutes and −4 a goal conceded, plus his own decisive rate.
- **Midfielders and forwards:** their goals, assists and penalties won follow the goals their side is expected to score. His
  decisive rate scaled by this game's expected goals against his usual games (the same expected goals the tile's xG uses).
- **The simplest candidate first:** one adjustment per position for how hard the game is against his usual opponents. It is only
  worth more parts if they beat it.

**What it needs.** Each past game's opponent and its prices before kickoff. The history export has neither. LaLiga results are in the
database's `fixtures` table and Sofix's own pre-match numbers in `predictions` (clean sheet, expected goals for and against); the
export gets each game's two teams in the same reads, so a game outside LaLiga can be matched to Sorare's odds where they were kept.

**The bar.** Fitted on 2025/26 only; tested on 2026/27 up to 1 Oct (games this change has never seen), then on the held-out weeks.
It ships only if the squared error and the pair figure improve with an interval clear of zero; keepers can ship before defenders.
One change per refresh, never with P7.

**What you will see.** Soria against Barcelona would read about 40 if he starts, and the panel says why in one line ("clean sheet
9% against Barcelona"). The same keeper at home to a weak attack would read higher than today.

**Results, keepers (3 Oct 2026).** `python backend/reports/experiments/keeper_opponent.py --history backend/data/raw/sorare_history.json --history <the other keepers' file>`.
Each goalkeeper game of the history export (league games he started) is joined, by date and club, to the production model's forecast from the Monday
before it (Dixon-Coles on football-data.co.uk, the settings in `artifacts/dixon_coles.json`: the chance of a clean sheet and the goals his side is
expected to concede). A keeper-season counts only when his current club played on the date of every one of his league games that season (a club he
left would not). First the 8 keepers you own that qualify (269 starts), then 12 more first-choice keepers read for the purpose (one question every two seconds,
waiting out Sorare's refusals, about 25 minutes): **637 starts by 20 keepers** (533 in 2025/26, 104 in 2026/27).

- *What a start scores, by goals conceded:* 0 → **74.8** (165 starts), 1 → 44.5 (234), 2 → 40.5 (150), 3 → 33.7 (58), 4 or more → 29.6 (30). A clean
  sheet is worth about 30 points; each goal after the first costs 4 to 5. A keeper's score is mostly the number of goals his side lets in.
- *Against the three strongest sides* (92 starts): Barcelona 44.0 scored (32 starts; today's number said 49.7, the number built from the game 40.6),
  Real Madrid 46.1 (30; 49.4; 42.9), Atlético 47.0 (30; 49.9; 46.1); everyone else 50.4 (545; 49.6; 52.5). On those 92, today's number is **4.0 too
  high** on average (the game's number 2.5 too low). With 13 Barcelona starts it had looked like 12 too high (37.9): the effect is real but a third of that.
- *Is any number closer than today's?* Over all 637 starts, each keeper's own games left out of everything that was fitted (levels, weight): the table
  gives the squared miss minus today's, with its 95% interval over weeks (below zero with an interval under zero is closer).

  | number | typical miss | squared miss (RMSE) | level (bias) | squared miss minus today's |
  |---|---|---|---|---|
  | today's "if he starts" (last five starts, pulled to 51) | 16.3 | 19.85 | -0.1 | |
  | the keepers' average (49.7), the same for everyone | 15.8 | 19.26 | +0.0 | -23.1 [-42.6, -4.0] |
  | the game's number (chance of each number of goals conceded × what a start scored then) | 16.1 | 19.44 | +1.4 | -16.2 [-39.7, +8.0] |
  | the average plus 35% of the game's effect (the weight the other keepers support: 0.28 to 0.45) | 15.8 | 19.20 | +0.5 | -25.4 [-45.8, -5.6] |
  | the same plus his own level, from his earlier starts pulled to zero (20 games' worth) | 15.7 | 19.05 | +0.3 | **-31.2 [-49.2, -13.5]** |

  On the 92 starts against the strongest sides the last two are 1.6 and 1.2 too high on average (today's 4.0) and closer than today's by 31 [-89, +28]
  and 27 [-81, +26]: the same direction, too few games for the interval to leave zero. On the other 545 they are closer by 24 [-45, -2] and 32 [-51, -13].
  Scored on 2026/27 alone after fitting on 2025/26 (104 starts) none of the numbers is clearly
  different (RMSE 19.9 to 20.0 for all). The held-out weeks (from 1 Oct) hold no start yet.
- *What it says.* (1) **A keeper's recent form says almost nothing about his next start**: the plain average of all keepers beats today's formula, which
  hangs 5 games' noise (a standard deviation of 19 a game) on each keeper. (2) The game's effect is real (the strongest sides, 4 to 6 points lower than
  the rest) but about **a third** of what Sorare's rules say it should be (clean sheets are rarer, but a keeper who faces more shots also makes more saves).
  (3) A keeper's own level is a little real (20 games' worth of pull) and is worth about 6 more points of squared miss.
- *Round 8 with the proposed number* (the average + 35% of the game's effect, without his own level), from Sofix's own numbers for each game: Soria at
  Barcelona (Getafe expected to concede 2.38, clean sheet 9%) **47** against 52 today; Luíz Júnior at Real Madrid 47 (42); Agirrezabala 48 (51);
  Altay and Radu 49 (44 and 42); Dituro 50 (35); Ryan 50 (56); Courtois 51 (48); Oblak 51 (62). The spread of keepers on the page shrinks from 35–62 to 47–51.

**Not shipped, and why.** The plan's bar is met on the tuning games (squared miss clearly below today's, and the bias on the strongest sides fixed), but
it is a large change to a number you read every week: it flattens your keepers (Oblak 62 → 51, Dituro 35 → 49), so the lineups would be chosen on who
plays and against whom, and almost not on form. The held-out weeks cannot test it for another week or two, and 2026/27 alone does not tell the
numbers apart. Whether Sorare's own projection (which replaces a regular starter's number once it is published, about two days before a lock) already
knows the opponent is P6's question, and the number you see now for Soria is the formula alone. **Your call**, with these numbers in front of you:
(a) ship it for keepers (one refresh); (b) wait for the held-out weeks; (c) leave keepers as they are.

**Folded into P9 (3 Oct, evening).** Your answer was a fuller model rather than (a), (b) or (c): keepers are P9's first position, and these
results are where it starts.

**Done when:** the table of P8's backtest is here; each position that cleared the bar ships in its own refresh; the panel names the
opponent's effect; the manual and `docs/how_it_works.md` say the score now depends on the game.

### P9 · The new xScore: the score added up the way Sorare adds it (your requests of 3 Oct; roadmap batch 10)

**What you asked.** First: mix in form that knows the opponent (Elo-style: a good game against a weak side, or when his side was the
favourite, is a small boost; against a strong side or as the underdog, a big one), the app's difficulty, his average when he starts and
when he does not, what keepers (or any position) score against that opponent, and more; the xScore should be a range, and everything
together should say whether he lands in its low or its high part. Then, the same evening, "it feels very black and white": add Sorare's
gameweek grade, a score if he makes a decisive action and one if he does not with the chance that he makes one, and any other part that
makes it finer but still accurate. Then a third time: keep every number on the Audit page with how often it was right and in how many
games (the chance of a decisive action, the expected all-around points, the share of scores within 7 points of the xScore, and so on);
show each player's average points for every stat, as in Sorare's tables, and use them to predict better; and say who is best for each
daily mission, a card never in two missions at once. Then a fourth time: all ten upgrades proposed that night (bookmakers' goal markets,
team news for both sides, chances not just goals, penalty and set-piece takers, lineups on the real spread with linked scores, official
lineups for daily missions, self-correcting numbers, the next five gameweeks, a decision scorecard, his role tonight), and as many
tracked statistics as possible.

**The idea.** A Sorare score is a decisive level plus all-around points: 35 with no decisive action, 60 with one, 70 with two (a level of
60 or more is also a floor), and 15 or less after a red card, an own goal, a penalty conceded or an error that leads to a goal. Sivera at
Athletic on 19 Sep: a clean sheet and a penalty save make level 70, plus 14.8 all-around, 84.8. So Sofix works out, for each player and
game:

1. **The chance of a decisive action**, and the smaller chance of a negative one.
2. **His score with one and his score without**: the level plus his all-around points, which move with the game too (−5 a goal conceded
   for a keeper, +2 a save, and so on).
3. **The whole spread**, from a few thousand simulated games: the xScore (the big number, as decision 1 says), his range (where he
   lands 8 times in 10) and the chance he beats his usual score.

On the panel: "decisive 28% → about 66 · none 72% → about 39 · xScore 47 · range 30–70", with the parts that moved him most, in points
("Barcelona away −8 · form +2"). No three-word label: the chances say how far he leans towards the top or the bottom.

**What goes in.** Each part's weight is fitted per position on 2025/26. A part that does not help ends with a weight near zero: nothing
stays because it sounds right.

| Part | What it does | Feeds |
|---|---|---|
| 1 · Form that knows the opponent | After each game his level moves by a share of *what he did minus what was expected of him in that game*. Against a weak side, or as the favourite, a good game moves him little; against a strong side, or as the underdog, a lot; a bad game at Barcelona barely drops him. Kept apart for his all-around points and for his decisive actions, and for starts and appearances off the bench. P8 found a keeper's raw form is mostly luck, so expect a small share for keepers. | both scores, the chance |
| 2 · The game (the app's difficulty) | The football model's numbers behind the difficulty: his side's expected goals (an attacker's goals and assists), the chance of a clean sheet (a keeper's decisive action, a defender's +10 at 60 minutes), the goals expected against (−5 for a keeper, −4 for a defender, −2 for a midfielder, each), the win chance, home or away. | the chance, the score without |
| 3 · Starting or coming on | A substitute who comes on also starts at 35, with fewer minutes for the rest. "If he starts" and "if he comes on" each get their own chance and scores; the big number follows the start chance (decision 1). | everything |
| 4 · His share of his side's attack | His goals and assists against his side's: a striker who scores a third of his side's goals gets a third of tonight's expected goals. Pulled to his position's share while he has few games. | the chance |
| 5 · What the opponent gives his position | Per club and position: how players there did against it, minus what was expected of them (keepers at Barcelona, forwards against Getafe). Recent games count more; it counts for little until there are many (a club gives about 38 keeper starts a season). | the score without |
| 6 · Shots against and for | A keeper facing many shots on target makes more saves (+2 each, +2 more inside the box): part of why a strong side costs a keeper less than the goals alone say (P8). From football-data.co.uk's match statistics (shots and shots on target), already cached. | the score without |
| 7 · Minutes | A starter often taken off near the hour earns fewer all-around points, has less time for a decisive action and can miss a defender's 60-minute clean sheet. | both |
| 8 · Sorare's projection and its grade (A to F) | Sorare keeps, for every past game, the projection and the grade it gave before kick-off (checked 3 Oct: all 22 starters of Athletic–Alavés). The grade ranks the projection within the position: keepers 55 → A and 46 → C, defenders 55 → B, forwards 45 to 49 → D. Both become parts with a fitted weight, tested on two seasons instead of waiting for 100 recorded players (P6). | the xScore |
| 9 · Cards and errors | His rate of red cards, own goals, penalties conceded and errors leading to a goal makes the negative chance; yellow cards and fouls cost all-around points. | the negative chance, the score without |
| 10 · The rest, one at a time | Two games in a week (best of two, game by game, P4-4); club or national team (P4-1); a European game three days before. | as each says |
| 11 · His stat sheet | His all-around points built stat by stat: how many of each stat he makes per game (saves, saves inside the box, tackles won, interceptions, passes, duels won, shots on target …) times today's points for his position, each moved by the game (a keeper's saves by the shots the opponent takes, a defender's tackles and interceptions by how much of the ball the opponent keeps). Tried against one all-around level; the closer one stays. | the score without |
| 12 · Bookmakers' goal markets | The over/under line of each match turns, with the who-wins prices, into each side's expected goals and the chance of a clean sheet (today the football model blends only the who-wins prices, at 35%, for games within 7 days). The line is already read and kept for every upcoming game (`p_over_2_5` in the odds table, from the same 2-credit read as the who-wins prices), so this part costs no credits; its history comes from football-data.co.uk. Anytime-scorer prices once per round, if The Odds API's free plan has them for LaLiga (not yet checked: the key lives only in GitHub's secrets, so the first check is one read from the odds job, 1 credit). | the chance, the score without |
| 13 · Team news for both sides | The starters each side is missing (Futbol Fantasy's lineups and absences), each weighted by what he brings (his share of his side's shots, goals, assists, minutes and defensive actions, from X1), move each side's attack and defence before the scoreline chances are worked out: a keeper facing Barcelona without its striker gets a better chance of a clean sheet. | everything that follows the game |
| 14 · Chances, not just goals | His decisive chance from the stats that come before goals and assists: shots on target, big chances created and missed, penalty-area entries, attempted assists. Goals are rare and mostly luck; chances repeat. Pulled to his position's rates while he has few games. | the chance |
| 15 · Penalty and set-piece takers | Sorare's game stats count penalties, set pieces, corners and free kicks taken (`penaltyTaken`, `setPieceTaken`, `cornerTaken`, `attFreekickTotal`; checked in its schema on 3 Oct). The taker gets his side's expected penalties (a penalty is about three goals in four) and a set-piece taker his share of the assists; when he is out, the next taker inherits. | the chance |
| 16 · His role tonight | From Futbol Fantasy's formation: a full-back used as a wing-back, a midfielder as a No. 10, a stand-in in a starter's role, a player back from injury on fewer minutes. His expected stats, minutes and share of the attack follow the role. | both scores, minutes |

**The data (X1).** Two free questions per LaLiga game, because one asks for more than Sorare allows without a key (checked: 879 against a
limit of 500). The first: every player's score, decisive level and all-around points, whether he started, his minutes, Sorare's projection
and grade, the two teams and the result. The second: each score broken into its 53 stats (goals, assists, clean sheet, saves, saves inside
the box, goals conceded, passes, duels, cards …). Checked on Athletic 0–0 Alavés: 57 players, 22 of them starters. The penalties and set
pieces taken (part 15) come from the same game stats, in a third light question per game if the limit asks for it, and the official
elevens from each game's `homeFormation` and `awayFormation`. 2025/26 and 2026/27 so far is about 450 games, so about 900 to 1,350
questions two seconds apart: about an hour with the waits, free, in a local git-ignored file like the history export. Each game is joined to
the football model's forecast from the Monday before (P8's join), to football-data.co.uk's shots, and to the over/under 2.5 prices those
files hold for both seasons, so part 12 can be tested on history. In production the refresh reads only the new games (about 20 to 30
questions a week) and keeps the levels and
tables in a read model: no migration. The Odds API's over/under market is already part of each odds read (2 credits: who-wins and over/under
together), so it adds nothing; only anytime-scorer prices would cost more, about 10 credits a read for a round's ten games, from the 488 that
are free this month.

With every LaLiga player, one round gives about 220 starts to test on, not only your players' games, so the held-out weeks can decide
within a round or two.

**The bar.** Walk-forward by Sorare gameweek, as P2. Fit on 2025/26, check on 2026/27 up to 1 Oct, then on the held-out weeks from 1 Oct.
Baselines: today's formula, the position's plain average (it beat today's for keepers, P8) and Sorare's projection alone. A part stays
only if the squared miss falls with an interval under zero and the pair figure (the Audit's 66%) does not fall; parts 12 to 16 are added
one at a time like the others. The chance of a decisive action must be honest (of the games where it says 30%, about 30% have one; scored
like the start chances), and the range must hold about 8 starts in 10. The Audit shows each ("too few to tell" under 100).

**His stat sheet.** For every player, each all-around stat of Sorare's table (the 53 of the second question, grouped as Sorare groups
them: general, defensive, possession, passing, attacking, goalkeeping) with how many he makes per game and the points they earn him, beside
his decisive actions per game (goals, assists, penalties won, clean sheets, penalty saves …) and the set pieces he takes. Counts are kept as
counts and turned into points with today's table (the new column of Sorare's picture, section 1), so last season's games count by this
season's rules; each score's `scoringVersion` says which table Sorare used. It feeds part 11, and it is shown on the Players page (his
whole sheet, over his last five games and the season, with what is expected in his next game) and, its top lines, in the overlay's panel.

**Lineups and the captain, on the real spread.** Today the planner gives every player the same spread (17.6, `planner.SCORE_SD`) and
treats each as if no one else's game mattered. With P9 it simulates each match once (a scoreline from the football model, with parts 12
and 13) and scores every player in it from that same match: a keeper and his defenders share the clean sheet, teammates share their side's
goals, and a striker's goal is the other keeper's goal conceded. A few thousand simulated gameweeks give each plan its true chance of each
reward and its expected essence (TODO.md's "reward probabilities and correlated outcomes"). The planner then:

- picks lineups for the reward, not only the average;
- puts a keeper with his defenders, or teammates up front together, when a reward needs a high total, and spreads them when a safe total
  is enough;
- picks the captain for his ceiling (the chance of a big score) where that earns more than his average.

**Daily missions.** Sorare's help (read 3 Oct): pick up to 3 players with a game that day; when they make a positive decisive action you
earn XP, as much as the card's scarcity gives; picks can change until kick-off, and the mission resets at 9:00 CET. In Sorare's API a
mission is a `DecisivePlayerPickerTask`: its mode is DECISIVE (the decisive actions that count are listed) or SCORE (beat an average, for
example his last 15 games, by a number of points), with how many cards can be picked and which. Sofix ranks your cards for each mission
that is running:

- DECISIVE: the chance of one of the listed actions in his game that day (from P9's chance of a decisive action), times the XP his
  scarcity earns;
- SCORE: the chance he beats that average by that much, from P9's spread.

A card is never suggested for two missions running at the same time: the cards are shared out across the missions for the most expected
reward, each card in one place and each mission with its number of picks. The extension reads the missions from your signed-in Sorare tab,
read only; you make the picks on Sorare.

**Official elevens.** Picks can change until kick-off. From about an hour before each kick-off the extension checks Sorare's game for the
official eleven (`homeFormation` and `awayFormation`, with `startingLineupAvailable`; checked in Sorare's schema on 3 Oct), re-ranks the
cards and flags a pick who is on the bench, with the best card still free beside him.

**Self-correcting numbers.** The tracking feeds back. Every Monday each chance (a decisive action of each kind, a clean sheet, a start by
each source, coming on, the range) is checked against what happened in its bands; where the share that happened is off (said 30%,
happened 25%), a correction per position is fitted on the recent weeks and applied in its own refresh. A correction needs 100 cases behind
it, each one is logged, and the Audit page shows it with whether the following weeks agreed. Futbol Fantasy stays the first source for the
start chance (decision 1): only its lean is corrected.

**The next five gameweeks.** For each player, the xScore of each of his next five gameweeks (his fixtures, the football model's numbers
for each, his start chance fading towards his usual share further out) and their sum: which cards carry the coming weeks, which to keep,
buy or sell. On the Cards page, beside each card's price (the page's own current snapshot), the expected points per euro over the five
weeks. Sofix only suggests: it never buys or sells.

**Tracking: every number is written down, scored and shown on the Audit page.** Before each lock Sofix writes down every number it gives,
for every LaLiga player (not only yours, so one round gives about 220 starts); a day after the gameweek ends (when starts are settled
today) each one is scored. Every figure is shown per gameweek and for the season, per position, as "right N of M (X%)" or a miss in points,
"too few to tell" under 100, beside the same figure for today's formula from the two-season replay, so before and after sit side by side.
The page leads with the headline figures and each group folds open beneath them.

*The headline figures:* the xScore within ±7 · the chance of a decisive action honest · the expected all-around points within ±7 · the
range holding 8 in 10 · the better of two (66% today) · closer than Sorare's projection · mission picks completed · points left on the bench.

1. **The xScore.**
   - within ±3, ±7, ±10 and ±15 points of the score;
   - the typical miss and the squared miss, in points; too high or too low on average;
   - the better of two (the pair figure); the order within a position each gameweek, and whether its top five held the best five;
   - closer than Sorare's projection (the share of games), Sorare's own ±7, closer than today's formula;
   - each split by position, club or national team, home or away, started or came on, difficulty band, Sorare's grade, one game or two.
2. **The spread.** Inside the range (aim: 8 in 10); inside the middle band (aim: 1 in 2); the chance he beats his usual score and the
   chance of 60 or more, each honest by band.
3. **Decisive actions.**
   - the chance of one, honest by band, overall and for each kind: goal, assist, penalty won, clearance off the line, last-man tackle,
     clean sheet, penalty save;
   - the chance of a negative one, honest by band, overall and for each kind: red card, own goal, penalty conceded, error leading to a goal;
   - the level reached (15 or less, 35, 60, 70, 80 and up): the share expected against the share that happened;
   - the score with one and the score without, each within ±7 in the games where that outcome happened;
   - penalties and set pieces: taken by the named taker or by someone else.
4. **All-around points and the 53 stats.**
   - the expected all-around points within ±7; each of Sorare's groups (general, defensive, possession, passing, attacking, goalkeeping)
     within ±3;
   - each stat within 1 for those made a few times a game (saves, tackles, shots) and within 20% for the many (passes), with its average
     miss and its lean (too high or too low);
   - the points each stat earned against what the stat sheet expected.
5. **The match.** The chance of a clean sheet, honest by band; each side's expected goals against the goals it scored; the football
   model's goals against the bookmakers' over/under, which was closer; team news: in games with missing starters, with and without the
   adjustment, which was closer.
6. **Starting, minutes and role.**
   - the start chance honest by band, for each source (Futbol Fantasy, Sorare, Sofix), before and after its correction; of the players put
     at 80% or more, how many started;
   - the chance of coming on, honest by band;
   - minutes within 15 of the expected; taken off before the hour, expected against what happened;
   - the stand-in named for a missing starter against who played.
7. **Lineups and rewards.**
   - each plan's expected total against its total;
   - the chance of each reward, honest by band; essence expected against won;
   - the captain: how often he was his lineup's best scorer, and the points he added against the best choice;
   - linked scores: how closely a keeper and his defenders (and teammates up front) moved together, simulated against real.
8. **The decision scorecard.** Each gameweek, your lineups as entered (the extension reads them, as today), Sofix's plan frozen at the lock
   and the best lineups in hindsight from the same cards: the points left on the bench, how often the captain was the best choice, essence
   expected against won, missions completed, and how your lineups did when they followed Sofix and when they did not.
9. **Daily missions.** The suggested cards that completed the mission, against the chance given (honest by band); XP expected against
   won; benched picks flagged before kick-off, and how many were swapped.
10. **The next five gameweeks.** A forecast made one, two, three, four and five weeks ahead against the score, by distance; cards marked
    "buy" or "sell" against the rest, in points per euro over the following five weeks.
11. **The model itself.** Each part's gain on the latest weeks (measured again each month); each Monday correction: what changed, by how
    much, and whether the following weeks agreed.
12. **Coverage and freshness.** How many players had each number at the lock; how old Futbol Fantasy's % was; the reads that failed;
    Sorare's projection, the odds and the official elevens present or missing.

The record lives in read models (no migration): for every LaLiga player, the counts behind each figure; for your players, each number too.
If it outgrows them, a table is a **Stop**: a migration you apply.

**The honest limit.** The same player's score moves about 18 points from one game to the next (P2), and a decisive action is a weighted
coin. The model can give the weight; it cannot call the toss.

**Order.** One change to the numbers per refresh.

1. X1 · the data (about a day): the per-game reads, penalties and set pieces, the official elevens, the over/under line, and whether The
   Odds API's free plan has scorer prices for LaLiga.
2. X2 · tracking first: the record before each lock, the scoring after it, the Audit's figures with today's formula beside them, and the
   decision scorecard, so every later change shows as a before and an after.
3. X3 · keepers (P8 did their groundwork): the chance of a clean sheet and of a penalty save, the score with and without one, parts 1 to
   5, 8, 11, 12 and 13.
4. X4 · defenders, then midfielders and forwards: the same with parts 14, 15 and 16; each its own refresh.
5. X5 · on screen: a design canvas first (decision 8, a Stop: you choose), covering the panel's two outcomes, range and reasons, the stat
   sheet on the Players page, the next five gameweeks, the daily missions and the Audit's new figures. The tile keeps one big number.
6. X6 · lineups and the captain on the real spread (its own refresh: the reward chances change).
7. X7 · daily missions, with the official elevens.
8. X8 · self-correcting numbers, from the first band with 100 cases.
9. X9 · the next five gameweeks, with points per euro on the Cards page.
10. X10 · parts 6, 7, 9 and 10, one at a time.

**Done when:** each position that clears the bar ships in its own refresh; the panel shows the chance of a decisive action, the score with
and without one, the range and the reasons; the Players page shows each player's stat sheet and his next five gameweeks; the planner picks
lineups and captains on the real spread; each daily mission shows its best cards and flags a benched pick; the Monday corrections run; the
Audit shows every figure of the tracking catalogue with its counts, before and after, and the decision scorecard; the manual and
`docs/how_it_works.md` describe the new score.

### P9 progress

**X1 · the data: done 4 Oct 2026 (roadmap 10.1).** `python -m app.jobs.export_games` read every played LaLiga game since 1 August 2025 from
Sorare's public API without a key, in about an hour (two questions a game, three seconds apart; no refusal stopped it):
**449 games (380 of 2025/26, 69 of 2026/27 up to 20 Sep), 29,094 player rows, 14,142 appearances, 9,878 starts** (898 by keepers, 3,665
defenders, 2,641 midfielders, 2,674 forwards), **28,958 rows with Sorare's projection and grade**. `python -m app.sorare.gamedata` joins each
game, by club and date, to the football model's forecast from the Monday before, to football-data.co.uk's shots, cards and over/under 2.5
prices, and to both official elevens: **449 of 449 for each, no club unmatched** (the newest football-data file reaches 20 Sep).
The file is `backend/data/raw/sorare_games.jsonl` (12 MB, git-ignored).

What the read showed:

- **Sorare's scoring did not change over the two seasons** (section 1): version 7 throughout, and the new all-around column is the one in
  force, except a keeper's goal conceded, which is −5 and not the −3 of the picture.
- **An upcoming game lists its rostered players (61 in the first one checked) and carries no projection** (0 of 61): Sorare gives a
  projection for a player's next game only player by player, as the app's sync already reads it. The live record (X2b) has to ask for them.
- **Over/under 2.5 is already in the app's odds read** (2 credits with the who-wins prices, kept as `p_over_2_5` for every upcoming game), so
  part 12 costs no credits. The odds key is only in GitHub's secrets (not in the local settings), so whether the free plan has scorer prices
  for LaLiga waits for one read from the odds job.
- **A keeper almost never comes on**: 4 of his 902 appearances in the two seasons, 898 were starts.

**X2a · today's formula on every LaLiga player: done 4 Oct 2026 (roadmap 10.2).** `python -m app.jobs.league_replay --fixtures-from
<the owner's history file>` writes `backend/data/audit/replay_league.json` (numbers only). Each game is predicted from the games the
player had before its Sorare gameweek, LaLiga games only, so his form is his LaLiga form. All 449 games, 1,020 players:

| Figure | Result |
|---|---|
| The tile's "if he starts", on 9,878 starts | typical miss **14.5** points, leans +0.6; within ±3: **13%**, ±7: **30%**, ±10: **42%**, ±15: **60%** |
| The tile's "if he comes on", on 4,264 appearances off the bench | typical miss **7.9**; within ±3: 27%, ±7: **60%**, ±10: 76%, ±15: 87% |
| The expected score (the chance of not playing included), on all 29,094 rows | typical miss 16.1; within ±7: 15%; on the 14,142 who played it leans 12.8 low, by construction |
| The better of two players | **76%** of 1.84 million pairs (a flat guess 50%, his last five games' average 75%); keepers 89%, midfielders 77%, defenders 75%, forwards 74%. It counts every rostered player, the unused ones included, so it is **not** the owner's 66% of 84 cards: the Audit's league figure has to say which players count (candidates: those with a start chance of 40% or more) |
| Against Sorare's projection, on 8,964 starts | within ±7: today's **30%**, Sorare's **33%**; today's number nearer in 45% of games (43% in 2026/27); average miss 14.5 against 14.3 (difference +0.27 points, interval +0.11 to +0.44; Sorare leans 2.5 low, today 0.8 high), but squared miss −9.1 [−17.1, −1.3] in today's favour: Sorare's lands close more often, today's makes fewer large misses. Midfielders 42% nearer, the rest 44 to 47% |

What it says. **Sorare's projection and today's formula are as good as each other** (P6, answered on history: there is no case for
overruling or replacing either; whether the two together beat each is part 8's test). **Neither lands within ±7 points more than a third of
the time** on a starter, because a starter's score moves about 18 points from one game to the next: the ±7 figure the Audit will show
starts near 30% for a starter and 60% for a substitute, and what matters is how far the new model moves it.

**P8 on every keeper (the research script, unchanged, on the league history):** 829 starts by 33 keepers (697 in 2025/26, 132 in 2026/27),
against 637 by 20 before. A start scores 75.2 with a clean sheet and 44.5, 41.4, 33.8 and 30.2 after one to four goals. Barcelona 44.6
(41 starts, today's number said 49.9), Atlético 46.3 (49.1), Real Madrid 48.7 (49.8), everyone else 50.2 (50.1). Left-one-keeper-out,
squared miss against today's: the keepers' plain average −25.1 [−41.4, −8.2], the average plus a third of the game's effect −27.6
[−44.0, −10.3], plus his own level −31.2 [−46.3, −15.6] (the weight the other keepers support: 0.28 to 0.42, median 0.34). Fitted on 2025/26
and scored on 2026/27 (132 starts) nothing is clearly different (squared miss 19.4 for all). The conclusions of P8 stand and are firmer.

**X2b · what must be written down while it is still said: built 4 Oct 2026 (roadmap 10.2b).** The first draft of this step (a record of
every number for every player) was cut down once the data was in: almost every input of the new model can be read
again afterwards, so only the one that cannot is recorded live.

- **Recoverable later, so not recorded:** each game's scores, Sorare's projection and grade for it (kept on every past game, checked on
  all 449), the penalties and set pieces, the stats and both official elevens (the games export, rerun for the new games: about 20
  questions a round); the football model's forecast from the Monday before (recomputed from the history); the over/under 2.5 and
  who-wins prices as they stood before the match (football-data.co.uk keeps both). The model's own outputs for every player are
  recomputed from these, so the Audit's league figures are produced by rerunning `python -m app.jobs.league_replay` after each round.
- **Not recoverable, so recorded: Futbol Fantasy's start chance for every player of every match, who is out and why, and the
  formation** (`app/sorare/ff_chances.py`, read model `ff_chances`, written by the refresh's Sorare step beside the Lineups page, a
  failure of it leaving only itself out). Per match, `last` is the latest reading before the kick-off (replaced by each run until it,
  then frozen) and `atLock` the reading at the lock of the Sorare gameweek the match falls in (replaced until the lock, then frozen,
  from the first run that sees the match, even before that gameweek is the one being planned): what a manager could see when he set
  his lineup. A match first seen after its kick-off is not made up. Players are Futbol Fantasy's ids and names, matched
  to Sorare's when it is scored. About 40 KB a round, 1.5 MB a season; no migration. 9 tests, among them that a failure here still
  publishes the page.
- **Not built, on purpose:** a record of Sorare's projection and odds for every player before the lock. A game not yet played lists its
  players (61 in the one checked) but no projection, so it would take about 600 player questions a round for numbers Sorare keeps on
  the played game anyway.

**X3 · keepers: done and on production 4 Oct 2026 (roadmap 10.3; PR #39, refresh #73).** A keeper's number is now built from his game, as P9 says: the chance of a decisive action times
his score with one, plus the rest times his score without (`app/sorare/keeper.py`; fitted and tested by `python -m app.jobs.keeper_fit`, which writes
`artifacts/keeper_score.json`, and `backend/data/audit/keeper_walk_forward.json`, numbers only).

- **The chance of a clean sheet** is the football model's, with the bookmakers' over/under 2.5 price moving how many goals the game holds (the split
  between the sides stays the model's: part 12), then corrected on the keepers' own starts. The model's raw chance ran high for keepers: it said
  **29.7%** over the 738 starts tested, **24.5%** happened. The chance of a decisive action adds the penalties he saves (3.5% of the starts without a
  clean sheet).
- **His score with a decisive action** is 74.9 on average (plus 0.10 for each point of Sorare's projection); **without one** it is
  37.7 plus 1.7 points for each goal his side is expected to concede (a keeper who faces more shots makes more saves) plus 0.12 of Sorare's
  projection (part 8). Fitted on all 898 keeper starts to 20 Sep (2025/26 and 2026/27 so far), the file dated 30 Sep so that the held-out weeks stay unseen.
- **The range** is the 10th to the 90th percentile of the two possible games, each spread as scores were around its line, widened by a fifth (the
  leftovers of a fitted model are smaller than the next game's).
- **Tried and left out:** a keeper's own recent level (part 1: squared miss against today's −27.9 with it, −28.9 without) and what keepers scored against that
  opponent before (part 5: −25.8 with it, −27.2 without): neither added anything over the game, which confirms P8 ("a keeper's recent form says almost nothing"). The stat
  sheet (part 11) was not tried: a keeper's all-around points are mostly his saves, which the game already moves. Team news for both sides (part 13) cannot
  be tested on history (Futbol Fantasy's chances are only kept from 3 Oct, `ff_chances`).

**The test (walk-forward, each week predicted from the weeks before it; 738 starts over 43 gameweeks, 17 Oct 2025 to 20 Sep 2026).** Intervals are 95%, from
resampling whole gameweeks.

| number | starts | typical miss | squared miss (RMSE) | leans | within ±7 | better of two keepers |
|---|---|---|---|---|---|---|
| today's "if he starts" (last five games) | 738 | 16.26 | 19.76 | +0.36 | 25.3% | 50.1% [47.8, 52.4] |
| the keepers' average | 738 | 15.66 | 19.18 | +0.01 | 25.9% | 50.0% (it says the same for all) |
| Sorare's projection | 738 | 15.83 | 19.28 | +0.91 | 25.5% | 54.1% [51.5, 56.6] |
| **the new number** | 738 | **15.45** | **19.00** | −0.21 | 25.7% | **54.2% [51.6, 56.9]** |

The new number's squared miss minus today's: **−29.4 [−44.6, −13.3]**, its typical miss **−0.80 [−1.13, −0.45]**; minus Sorare's projection −10.5
[−30.7, +5.6] (as good, not clearly better). By season: 2025/26 (600 starts) −33.9 [−50.3, −17.3], better of two 53.8% against 49.2%; 2026/27 (138 starts, 10
gameweeks) −10.0 [−46.0, +29.3], 56.0% against 54.5%: the same direction, too few weeks for the interval to leave zero. The held-out weeks (from 1 Oct) hold no
keeper start yet.

**What it says.** (1) A keeper's number cannot be made much closer: **within ±7 stays near 25%** for every number, because a start swings between 75 and 35 on the luck of
the game. What the game does is move the middle (today's was 0.8 points further from the score on average and 29 squared points worse) and **order keepers:
today's number is a coin flip between two keepers of one gameweek (50.1%), the new one is right 54.2% of the time.** (2) The decisive chance is honest: it said
26.9% and 27.0% happened; by band (said, happened, starts): 9.0% / 13.4% (67), 16.4% / 14.5% (131), 23.5% / 27.2% (184), 30.9% / 29.8% (191), 41.9% / 38.8% (165).
(3) The range holds **79.3%** of scores (aim 80%; 79.3% in 2025/26 and 79.0% in 2026/27).

**Shipped.** The bar (the squared miss and the better-of-two figure, each clear of today's over 738 starts) is met on the walk-forward and on 2025/26, and you chose the fuller model
(P8's call). The held-out weeks can neither confirm nor refute it yet (about ten keeper starts a round), so the Audit's keeper figures, from 4 Oct on, are where it is watched. **What does not use it:** a played gameweek's replay (the football model's numbers for
a game already played are not kept), a game outside LaLiga, a game the app holds no prediction for, a keeper with no club in the registry: each keeps the old number. **What you see change** (production, 4 Oct: Soria at Barcelona 52 → 45, Oblak 62 → 50, Dituro 35 → 49; round 8's keepers 45 to 50): a
keeper's "if he starts", his expected score and the plans built on it; the panel's reasons and the range come with 10.5.

## 5 · Risks

| Risk | What limits it |
|---|---|
| Overfitting a small sample | The declared split; shrinkage; the gameweek-level interval; "no change" is allowed. |
| A fix to one slice hurts another | Every change is scored on all slices, not only the one it targets. |
| A migration the unattended job cannot run | P1 waits for you to apply it; code is written to ship after it, not before. |
| Sorare's API changes | The same guards as `sync.py`; an unreadable field leaves the number out, never a stale one. |
| Shifting numbers confuse the picture | One change per refresh; nothing in the same refresh as the FF switch ([futbolfantasy.md](futbolfantasy.md) S3). |
| Sixteen parts on two seasons (P9) | Each part fitted on 2025/26 and kept only if it clears the bar on its own; parts 12 to 16 added one at a time; shrinkage everywhere. |
| The Odds API's free credits (P9 part 12) | The over/under market is already in the 2-credit read; only scorer prices (about 10 credits a read) would add, and they wait if a month would run short; nothing paid. |
| An Audit page with too many figures (P9 tracking) | The headline figures lead; each group folds open; every figure says how many cases stand behind it, "too few to tell" under 100. |

## 6 · For the owner

1. **What should the big number on the tile be?** *Decided 3 Oct:* it follows his chance of starting, Futbol Fantasy's first.
   Under 40%, the score if he comes on; 40% or more, the score if he starts. It waits for P7, because today's "benched"
   number is not a score.
2. Should Sofix overrule Sorare's projection where the numbers say ours is better (P6)? It can now be measured on history (P6, "Sooner
   than that"), and in P9 Sorare's projection and grade are parts with a fitted weight. *Until that is measured (recommended):* once P9
   ships for a position, its number stays the big one and Sorare's sits beside it. Today a regular starter's number turns into Sorare's
   about two days before the lock (F1's cliff); say if you would rather keep that.
3. How much should national-team form count for a national-team game? The backtest answers it (P4 step 1); tell me if you
   have a strong prior.
4. The wider export (all LaLiga players, about 500 calls) if the first intervals are too wide: yes or no? *Answered 3 Oct by P9:*
   yes, every LaLiga game, at two questions per game (about 900, free), not one per player (checked).

## 7 · Order

P0 and the FF plan's first steps ([futbolfantasy.md](futbolfantasy.md) S1 to S4) start now and are independent. P1
follows P0 (what to record depends on what P0 finds).
P2 to P4 run while the recorded weeks accumulate; P6 waits for them. Nothing ships without the held-out comparison except
the display-only "2 games" in P1.

**From 3 Oct:** P7 (the bench score) and P8 (the opponent, keepers first) come before the rest of P4, in that order, one refresh
each (roadmap batch 9). P4-1, the level fix, is paused by you until games from 1 Oct exist to test it on.

**From 3 Oct, evening:** P9 replaces P8's single number with the full model (roadmap batch 10): the data, then the tracking (so every
change shows as a before and an after on the Audit page), then keepers, then the other positions, one refresh each, each built as the
chance of a decisive action with a score with and without one; then the screens, lineups and the captain on the real spread, the daily
missions with the official elevens, the Monday corrections and the next five gameweeks. Its look on screen waits for a design canvas.
