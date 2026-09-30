# Plan · the xScore: why some predictions look wrong, then the fix (T1)

Written 2026-09-30. Entry in [TODO.md](../TODO.md) (T1); the sibling plan is [starts.md](starts.md), which decides where
the "will he start?" number comes from. S4 in [docs/sorare_plan.md](../docs/sorare_plan.md) is this plan's checklist.

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

### P1 · Record more, and one visible quick win (about a day, needs a migration)

- `sorare_forecasts` gains: Sorare's starter odds alone, our `p_start`/`p_on`/`start`/`bench`, the games (competition and
  opponent) and, once settled, `started`, minutes and each game's score. One **Alembic migration applied to production by
  you first**, then the code; the unattended job cannot add columns. It is **shared with [starts.md](starts.md) phase C**
  (`start_source`), so there is one migration, not two.
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
| Shifting numbers confuse the picture | One change per refresh; nothing in the same refresh as [starts.md](starts.md) phase C. |

## 6 · For the owner

1. **What should the big number on the tile be?** Today: the score *if he starts*, with the chance beside it. The
   alternative is the expected score (chance × score), which separates Giorgi from Oyarzabal at a glance but hides "how
   good if he plays". Or both. This is a design call and does not need the model work.
2. Should Sofix overrule Sorare's projection where the numbers say ours is better (P6)?
3. How much should national-team form count for a national-team game? The backtest answers it (P4 step 1); tell me if you
   have a strong prior.
4. The wider export (all LaLiga players, about 500 calls) if the first intervals are too wide: yes or no?

## 7 · Order

P0 and [starts.md](starts.md) A0 start now and are independent. P1 follows P0 (what to record depends on what P0 finds).
P2 to P4 run while the recorded weeks accumulate; P6 waits for them. Nothing ships without the held-out comparison except
the display-only "2 games" in P1.
