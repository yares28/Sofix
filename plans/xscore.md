# Plan · the xScore: why some predictions look wrong, then the fix (T1)

Written 2026-09-30. Entry in [TODO.md](../TODO.md) (T1); the sibling plan is [futbolfantasy.md](futbolfantasy.md),
which makes Futbol Fantasy the main source of the "will he start?" number (your decision, 30 Sep). S4 in
[docs/sorare_plan.md](../docs/sorare_plan.md) is this plan's checklist.

**Scheduled in [roadmap.md](roadmap.md) (2 Oct 2026):** P0 and P1 in its batch 1, before round 8 locks; P2 to P6 in batch 3.
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
| L5 | Open | Two players are too few to say; the backtest (P2) measures the spread of scores by role. |
| L6 | Open | Which of two games Sorare counts needs a lineup holding a two-game player: public leaderboards are depth 8 and 9 and complexity 576 and over, beyond the keyless limits (7 and 500). Wanted: the extension's read of an entered lineup of yours with such a player (Giorgi has two games in GW19), or a keyed query from the refresh job. |

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
  check, desktop and mobile screenshots.

### P2 · The backtest harness (two to three days)

`backend/app/sorare/backtest.py` and a read-only job, reusing `backend/app/backtest/metrics.py`; an export script for
the history; tests first with synthetic histories (a player built to start in national games and not in club games must
show the error the current model makes). Output: the tables in section 3, by slice, for today's model. No behaviour change.

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

## 5 · Risks

| Risk | What limits it |
|---|---|
| Overfitting a small sample | The declared split; shrinkage; the gameweek-level interval; "no change" is allowed. |
| A fix to one slice hurts another | Every change is scored on all slices, not only the one it targets. |
| A migration the unattended job cannot run | P1 waits for you to apply it; code is written to ship after it, not before. |
| Sorare's API changes | The same guards as `sync.py`; an unreadable field leaves the number out, never a stale one. |
| Shifting numbers confuse the picture | One change per refresh; nothing in the same refresh as the FF switch ([futbolfantasy.md](futbolfantasy.md) S3). |

## 6 · For the owner

1. **What should the big number on the tile be?** Today: the score *if he starts*, with the chance beside it. The
   alternative is the expected score (chance × score), which separates Giorgi from Oyarzabal at a glance but hides "how
   good if he plays". Or both. This is a design call and does not need the model work.
2. Should Sofix overrule Sorare's projection where the numbers say ours is better (P6)?
3. How much should national-team form count for a national-team game? The backtest answers it (P4 step 1); tell me if you
   have a strong prior.
4. The wider export (all LaLiga players, about 500 calls) if the first intervals are too wide: yes or no?

## 7 · Order

P0 and the FF plan's first steps ([futbolfantasy.md](futbolfantasy.md) S1 to S4) start now and are independent. P1
follows P0 (what to record depends on what P0 finds).
P2 to P4 run while the recorded weeks accumulate; P6 waits for them. Nothing ships without the held-out comparison except
the display-only "2 games" in P1.
