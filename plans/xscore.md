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
  | Goal conceded | **−3** (was 0) | **−4** (was −2) | −2 | 0 |
  | Clean sheet, 60 minutes or more | (it is a decisive action instead) | +10 | 0 | 0 |
  | Save / save inside the box / diving save / diving catch | +2 / **+2** (was +1) / +3 / +3.5 | | | |
  | Shot on target, big chance created | +3, +3 | +3, +3 | +3, +3 | +3, +3 |
  | Yellow card, error leading to a shot | −3, −5 | −3, −5 | −3, −3 | −3, −3 |

  Which column applies in 2026/27 is to be confirmed with a keyed read of a few games' `allAroundStats` (P7 step 1); the
  measurements below behave like the new one (a keeper who concedes four is near 20).

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
conceded costs 3. His two clean sheets this season (84.5 and 81.5) carry his average. Against Barcelona a clean sheet is a 3% chance
by the bookmakers (Barcelona scores in 97% of their prices) and 9% by Sofix's board, and Barcelona has scored 31 in 7 league games. Your
list of keepers against Barcelona averages 37 (middle value 30); the three in the export match yours to the point: Agirrezabala 60
(16 Sep), Ryan 20.5 (13 Sep), Dituro 18.2 (23 Aug). A rough sum with this season's keeper scores by goals conceded gives him about
**38 with the bookmakers' prices and 42 with Sofix's**: around 40, not 52.

**The fix: the game goes into the score, position by position, keepers first** (the biggest effect: 33 against 51).

- **Goalkeepers:** chance of a clean sheet × his score with one + the rest × his score without one, the second falling with the
  goals his side is expected to let in (−3 a goal, partly made up by saves). The chance of a clean sheet and the goals expected are
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
makes it finer but still accurate.

**The idea.** A Sorare score is a decisive level plus all-around points: 35 with no decisive action, 60 with one, 70 with two (a level of
60 or more is also a floor), and 15 or less after a red card, an own goal, a penalty conceded or an error that leads to a goal. Sivera at
Athletic on 19 Sep: a clean sheet and a penalty save make level 70, plus 14.8 all-around, 84.8. So Sofix works out, for each player and
game:

1. **The chance of a decisive action**, and the smaller chance of a negative one.
2. **His score with one and his score without**: the level plus his all-around points, which move with the game too (−3 a goal conceded
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
| 2 · The game (the app's difficulty) | The football model's numbers behind the difficulty: his side's expected goals (an attacker's goals and assists), the chance of a clean sheet (a keeper's decisive action, a defender's +10 at 60 minutes), the goals expected against (−3 or −4 each), the win chance, home or away. | the chance, the score without |
| 3 · Starting or coming on | A substitute who comes on also starts at 35, with fewer minutes for the rest. "If he starts" and "if he comes on" each get their own chance and scores; the big number follows the start chance (decision 1). | everything |
| 4 · His share of his side's attack | His goals and assists against his side's: a striker who scores a third of his side's goals gets a third of tonight's expected goals. Pulled to his position's share while he has few games. | the chance |
| 5 · What the opponent gives his position | Per club and position: how players there did against it, minus what was expected of them (keepers at Barcelona, forwards against Getafe). Recent games count more; it counts for little until there are many (a club gives about 38 keeper starts a season). | the score without |
| 6 · Shots against and for | A keeper facing many shots on target makes more saves (+2 each, +2 more inside the box): part of why a strong side costs a keeper less than the goals alone say (P8). From football-data.co.uk's match statistics (shots and shots on target), already cached. | the score without |
| 7 · Minutes | A starter often taken off near the hour earns fewer all-around points, has less time for a decisive action and can miss a defender's 60-minute clean sheet. | both |
| 8 · Sorare's projection and its grade (A to F) | Sorare keeps, for every past game, the projection and the grade it gave before kick-off (checked 3 Oct: all 22 starters of Athletic–Alavés). The grade ranks the projection within the position: keepers 55 → A and 46 → C, defenders 55 → B, forwards 45 to 49 → D. Both become parts with a fitted weight, tested on two seasons instead of waiting for 100 recorded players (P6). | the xScore |
| 9 · Cards and errors | His rate of red cards, own goals, penalties conceded and errors leading to a goal makes the negative chance; yellow cards and fouls cost all-around points. | the negative chance, the score without |
| 10 · The rest, one at a time | Two games in a week (best of two, game by game, P4-4); club or national team (P4-1); a European game three days before; penalty duty where the stats show it. | as each says |

**The data (X1).** Two free questions per LaLiga game, because one asks for more than Sorare allows without a key (checked: 879 against a
limit of 500). The first: every player's score, decisive level and all-around points, whether he started, his minutes, Sorare's projection
and grade, the two teams and the result. The second: each score broken into its 53 stats (goals, assists, clean sheet, saves, saves inside
the box, goals conceded, passes, duels, cards …). Checked on Athletic 0–0 Alavés: 57 players, 22 of them starters. 2025/26 and 2026/27 so
far is about 450 games, so about 900 questions two seconds apart: under an hour with the waits, free, in a local git-ignored file like the
history export. Each game is joined to the football model's forecast from the Monday before (P8's join) and to football-data.co.uk's shots.
In production the refresh reads only the new games (about 20 questions a week) and keeps the levels and tables in a read model: no
migration.

With every LaLiga player, one round gives about 220 starts to test on, not only your players' games, so the held-out weeks can decide
within a round or two.

**The bar.** Walk-forward by Sorare gameweek, as P2. Fit on 2025/26, check on 2026/27 up to 1 Oct, then on the held-out weeks from 1 Oct.
Baselines: today's formula, the position's plain average (it beat today's for keepers, P8) and Sorare's projection alone. A part stays
only if the squared miss falls with an interval under zero and the pair figure (the Audit's 66%) does not fall. The chance of a decisive
action must be honest (of the games where it says 30%, about 30% have one; scored like the start chances), and the range must hold about
8 starts in 10. The Audit shows each ("too few to tell" under 100).

**The honest limit.** The same player's score moves about 18 points from one game to the next (P2), and a decisive action is a weighted
coin. The model can give the weight; it cannot call the toss.

**Order.** One change to the numbers per refresh.

1. X1 · the data (about a day: the reader, its tests, the read).
2. X2 · keepers first (P8 did their groundwork): the chance of a clean sheet, the score with and without one, parts 1 to 5 and 8.
3. X3 · defenders, then midfielders and forwards: each its own refresh.
4. X4 · on screen: a design canvas first (decision 8, a Stop: you choose), then the panel's two outcomes, range and reasons. The tile
   keeps one big number.
5. X5 · parts 6, 7, 9 and 10, one at a time.

**Done when:** each position that clears the bar ships in its own refresh; the panel shows the chance of a decisive action, the score with
and without one, the range and the reasons; the Audit shows how honest the chances and the range were; the manual and
`docs/how_it_works.md` describe the new score.

## 5 · Risks

| Risk | What limits it |
|---|---|
| Overfitting a small sample | The declared split; shrinkage; the gameweek-level interval; "no change" is allowed. |
| A fix to one slice hurts another | Every change is scored on all slices, not only the one it targets. |
| A migration the unattended job cannot run | P1 waits for you to apply it; code is written to ship after it, not before. |
| Sorare's API changes | The same guards as `sync.py`; an unreadable field leaves the number out, never a stale one. |
| Shifting numbers confuse the picture | One change per refresh; nothing in the same refresh as the FF switch ([futbolfantasy.md](futbolfantasy.md) S3). |

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

**From 3 Oct, evening:** P9 replaces P8's single number with the full model (roadmap batch 10): the data, then keepers, then the other
positions, one refresh each, each built as the chance of a decisive action with a score with and without one. Its look on screen waits
for a design canvas.
