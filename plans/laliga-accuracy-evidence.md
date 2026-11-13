# LaLiga score accuracy: the evidence (12 Nov 2026)

Owner's ask: LaLiga only, evidence before any fix. Accuracy is the share of pre-lock numbers within 7 points of the real
score, starters and played substitutes apart ([AUDIT-EVIDENCE-001](../docs/context.md#audit-evidence-001)). Nothing in the app
was changed. Scripts and the three full reports are in `backend/reports/experiments/laliga_accuracy/`. The live code read is
commit `2308b0fc` (Sofix v1); it needs the research cache of the worktree that built it
(`backend/data/raw/score-foundation/football.json`, `formula-packages`).

Earlier research: [handover](../docs/xscore-research-handover.md), [Sofix v1](sofix-v1.md).

## The test idea

| | Suspicion | Test | Data |
|---|---|---|---|
| A | The real record is worse than the replay, or than other leagues | Recount within 7 on real pre-lock numbers, by position, week, source, league | published `audit`, `score_record:*`, `audit_game_checks` blocks (local copy) |
| B | The misses sit in one step: decisive actions, minutes, clean sheets, cold players | Replay Jan-Oct 2026 from earlier fits, split each miss by Sorare's score parts, then hindsight swaps | games export, football inputs |
| C | The live model is fed something else than it was trained on, or the football inputs are poor | Training row against live row, line by line; clean-sheet chance against what happened | release script, live job, `football.json` |

The ruler every test reruns: Sofix v1 replayed on Jan-Oct 2026 from games before it: **2,596 / 6,754 starters (38.44%)**,
**2,176 / 2,925 substitutes (74.39%)**. `confidence_replay.py`, `miss_collect.py` and `long_record.py` each reproduce both counts.

## Every test and what it said

| # | Test | Result | Verdict |
|---|---|---|---|
| 1 | Real record, production (`audit.versus`, GW21-29, the formula before v1) | Starters: Sofix 29.2% of 4,147, Sorare 32.5%. Forwards 22.7% against 33.8%. Substitutes: Sofix 58.1% of 1,711, Sorare 36.7% | Informative: forwards were the old formula's weak spot; substitutes are a strength |
| 2 | Real record rebuilt from local blocks | 221 starter cases only (results are kept locally for the owner's players); Sofix 24.4%, Sorare 25.8% | Too few; trust test 1 |
| 3 | LaLiga against other leagues on the real record | Starters within 7: CL 26.9% (391), EL 32.6% (393), Conference 30.6% (395). PL 3 cases, Bundesliga 9, Ligue 1 none | LaLiga is not worse than the others; no league "behaves correctly" (all about 3 in 10). PL, BL1, FL1 cannot be compared locally |
| 4 | Settled numbers made by Sofix v1 | 0. First possible about 18 Nov | No live evidence for v1 yet |
| 5 | Misses by decisive outcome (replay, starters) | 1,547 starts (22.9%) had a decisive level change; 21 hit. They are 1,526 of the 4,158 misses (36.7%) | The largest single source, and a coin before lock |
| 6 | Ordinary games (no decisive change) | 2,575 hit of 5,207 (49.5%). FWD 62.8%, MID 53.1%, GK 47.3%, DEF 38.9%. Number runs 3.6 low; 1,768 misses under, 864 over | Defenders are the weak ordinary case |
| 7 | Defenders whose side kept a clean sheet | 90 hit of 478 (18.8%), number 17.6 low | Concentrated miss; the +10 clean-sheet points are not in the chosen window |
| 8 | Minutes | Ordinary hit rate falls from 64.6% (under 46 minutes) to 42.4% (90 and more, 2,891 starts) | A pattern, not a lever: minutes known in hindsight add 47 hits |
| 9 | Home or away, past starts, team strength, month, club, opponent | No pattern. Clubs' rank does not hold between Jan-May and Aug-Oct (rank correlation 0.15) | Ruled out |
| 10 | Hindsight ceilings (cheating, diagnostics) | Decisive level known +808 hits (50.4%); with goals conceded +941 (52.4%); goals conceded alone +113; whole-2026 median known +232; minutes +47 | 50% needs the decisive outcome; a longer player record is worth trying (+232 at most) |
| 11 | Training row against live row | Football inputs the same quantity and order; same history filter; position mapping the same. Lock hour differs by one in winter (harmless) | No training/serving mismatch in the inputs |
| 12 | Which number the Audit judges | The headline Sofix against Sorare within 7 (`versus.starts_of`) reads `sofix`, the average; only the per-version counts (`versus.model_versions`) read `sofixPoint`. In the release replay the average lands 30% for starters, the point 38% | **Measurement gap**: the headline will stay near 30% whatever v1 does |
| 13 | Silent fallbacks | A missing artifact, a game with no `forecastBefore`, or a lock at or before `trainedThrough` gives the previous formula with no log (`scores.py:104`) | Risk, size unknown live |
| 14 | Football inputs against results (1,238 games) | Clean-sheet chance runs high: said 0.305, happened 0.261. Jan-Jun 2026 clearly worse (said 0.298, happened 0.206, no skill over a constant); Jul-Oct 2026 better (98 games) | Inputs are weak but the trees are indifferent to a pure lean; knowing goals conceded is worth only +113 |
| 15 | Confidence tiers (the model's own chance of landing within 7) | Honest by band (says 42%, lands 40%; says 52%, lands 52%) but only 161 starters (2.4%) reach 50% | Works, changes no rate |
| 16 | Decisive window | No starter reaches a 50% decisive chance; the 90 put in a decisive window land 28% | Failed: nothing to gain |
| 17 | A fixed shift per position, chosen on Jul-Dec 2025, applied to 2026 | Starters 2,596 → 2,544 (516 gained, 568 spoiled); substitutes 2,176 → 2,168 | Failed: the lean is not a fix |
| 18 | Bigger trees (depth 8, 100 trees) | Jul-Dec 2025: 1,402 → 1,432. 2026: 2,596 → 2,596 | Failed: does not carry over |
| 19 | A longer player record (all his earlier starts: count, median, average, ordinary median and spread, decisive rate, last-ten median) | Jul-Dec 2025: 1,402 → 1,430 of 3,762. 2026: 2,596 → 2,628 (38.44% → 38.91%). With bigger trees: 1,455 and 2,641 (39.10%). Substitutes unchanged (2,178, 2,175) | **Small gain, same sign in both periods.** Not yet tested with whole-gameweek resampling |
| 20 | Bookmaker player prices | The Odds API lists LaLiga anytime scorer, shots on target and assists, US bookmakers, one match at a time. Local `ODDS_API_KEY` is empty, so the one read was refused and no credit spent | Not determined |

### Decisive actions and defenders (owner's ask, 12 Nov, second round)

`decisive_defender.py`, starters only, every input known before lock. New inputs from all his earlier games: per-90 rates of
18 stats (goals, assists, shots on target, chances, tackles, interceptions, duels, passes...), how often his starts had a
decisive action, penalties and set pieces taken, his share of his side's goals, his usual minutes, and his ordinary score with
his side's result taken out. Interval: whole gameweeks resampled 2,000 times, against v1 on the same starts.

| # | Test | Jul-Dec 2025 (3,762) | Jan-Oct 2026 (6,754) | Verdict |
|---|---|---|---|---|
| 21 | v1 as shipped | 1,402 (37.27%) | 2,596 (38.44%) | the before number |
| 22 | All new inputs in one forest | 1,453, +51 [+24, +84] | 2,667, +71 [+33, +109] | Helps |
| 23 | A model of ordinary games only, never calling a decisive | 1,492, +90 [+53, +128] | **2,704 (40.04%), +108 [+66, +150]** | **Best: the interval leaves zero in both periods** |
| 24 | A decisive-chance model, then the likeliest window of the mix | 1,494, +92 | 2,703, +107 | Same as 23: calling a decisive adds nothing |
| 25 | Defenders: his score without his side's result, tonight's scoreline put back | 1,484, +82 (DEF 435 against 438) | 2,690, +94 (DEF 787 against 810) | Failed for defenders; forwards +10 |
| 26 | Opponent style (what a position does against a club, against its own usual) | −8 on test 23 | +12 on test 23 | Noise |

The decisive-chance model itself (test 24): it ranks players (AUC 0.65 to 0.68; 19% of starts have a decisive action) but its
most certain calls are a coin: where it said 50% or more (102 starts in 2026), 49% happened; its top 5% of starts, 47%. A
decisive call only pays above about 55 to 60%, because the score with a decisive action is itself spread over 60 to 85. So no
player-rate formula tested here makes decisive games hittable; what the new inputs buy is a sharper ordinary score
(forwards 784 → 847, midfielders 814 → 841, defenders 794 → 810, keepers 204 → 206 in 2026).

Live caveats for test 23: it needs every past game's stats (kept in `player_games.stats`), the penalty and set-piece flags of
the games export, and a long record; for players the owner does not own the live record starts 1 Jul 2026.

### Towards Sofix v2 (owner's ask, 12 Nov, third round)

`v2_features.py` builds one table of pre-lock inputs for all 38,850 appearances (88 inputs); `v2_models.py <round>` tries
candidates on it (rounds a to d). Same two periods, same interval, against v1. "Plain model" = fitted on ordinary games only.

| # | Test | Jul-Dec 2025 | Jan-Oct 2026 | Verdict |
|---|---|---|---|---|
| 27 | Plain model, every input (the candidate) | 1,484 (39.45%), +82 [+41, +130] | **2,722 (40.30%), +126 [+80, +175]** | Best so far |
| 28 | Added one group at a time: last-year rates, his line in the eleven, his side's and the opponent's passing and goals, more of his ordinary record | 39.5 to 39.7% | 40.0 to 40.2% | All within noise of each other: no single group matters |
| 29 | Model shape: 300 deeper trees, 300 shallower, random forest, boosted score classes, forest and boosted averaged, one forest per position | 38.7 to 40.1% | 39.5 to 40.2% | No shape beats the plain forest in both periods; boosted is worse |
| 30 | Only what the live job has for every player today (scores, started, minutes, decisive level) | 1,463 (38.89%), +61 [+30, +94] | 2,674 (39.59%), +78 [+39, +120] | About two thirds of the gain without stat sheets |
| 31 | v1's own inputs, fitted on ordinary games only | +44 [+21, +67] | +36 [+1, +69] | A third of the gain is the "ordinary games only" idea alone |
| 32 | Substitutes with the new inputs (five variants) | 1,270 to 1,289 against 1,289 | 2,175 to 2,191 against 2,176 | No gain: v1's substitute number stays |

| 33 | Test 27 on top of the research's six input tables (1,329 more inputs: stats, matchups, sequences, player context, European routine, pass geometry; `v2_models.py e`) | 39.6 to 39.7% | 40.1 to 40.2% | No gain; substitutes 2,187 to 2,191 against 2,176, interval touches zero |
| 34 | Test 27 against the frozen research best (the owner's bar: 2,765 starters, 2,201 substitutes) on the same 6,754 starts | | mine 2,722, research 2,765, both right 2,435 | **The bar is not beaten** |
| 35 | Blends of the two numbers (25, 50, 75%), and the research number wherever test 27's distribution agrees | | 2,759, 2,730, 2,710, 2,739 | Failed: none beats 2,765 |
| 36 | Cheating ceiling: whichever of the two was right, chosen in hindsight | | 3,052 (45.2%) | Two separately built models give nearly the same number (within 3 points on 82% of starts); even a perfect chooser between them stays under 50% |

| 37 | Decisive odds per start (`v2_decisive.py`): match outlook, his record, what the opponent gives away to his position (last 10 and 38 games, also home or away), tonight's eleven; made honest on the last fifth of the fitting games | AUC 0.685 | AUC 0.653, same as without the opponent and eleven inputs | The opponent and eleven add nothing. Forwards' top 10% of odds: 51% had one; defenders' top 10%: 15%. In 2026 the odds run high at the top (said 0.72, happened 0.52) |
| 38 | Switch to his decisive score when the odds pass a threshold (per position, chosen on Jul-Dec 2025) | | 2,644 (39.15%), research 2,765 | Failed: of 516 switched starts, 211 had a decisive and only 121 of those landed within 7 |
| 39 | Same at one threshold for all (0.4, 0.5, 0.6) | | 2,655, 2,700, 2,704 against 2,707 never switching | Failed: the higher the threshold, the closer to never switching |

**Why the switch loses (test 38).** A decisive score is itself spread: 60 with one decisive, 70 with two, plus 0 to 25 all-around
points, so a decisive number lands within 7 of a decisive game only 57% of the time (121 of 211). A switch therefore wins
only when odds × 0.57 beats (1 − odds) × his ordinary hit rate (about 0.5), that is above about 47% honest odds. In 2026 the
starts the model rated above 60% had a decisive 52% of the time: 93 starts, worth a handful of hits.

**The owner's bar (13 Nov): better than 2,765 / 6,754 starters (40.94%) and 2,201 / 2,925 substitutes (75.25%), and above 50%.**
Not met. Note the two "v1"s: 40.94% and 75.25% are the research best, which was never live; the artifact that is live as
"Sofix v1" replays at 38.44% and 74.39% ([sofix-v1.md](sofix-v1.md)).

**Where it has settled.** Starters level off at about 40% (from 38.4%): inputs, model shapes and the decisive call no longer
move it beyond noise. With v1's substitutes, every player who played: (2,722 + 2,176) / 9,679 = **50.6%** (v1: 49.3%).
Starters alone cannot reach 50% before lock: the decisive level known in advance gives 50.4% (test 10), and the best
decisive-chance model's surest calls happen half the time (test 24).

**v2 as it would be built:** starters = test 27 (needs each LaLiga game's stat sheet, which `games-export.yml` already keeps
daily in GitHub's cache, no Neon read; test 30 is the fallback where a player's sheet is missing); substitutes = v1.

## Where the errors are

1. **Decisive actions: 37% of starter misses.** A goal, an assist or a keeper's clean sheet moves the score 25 points or more and
   cannot be called before lock: no starter's chance reaches 50%.
2. **Defenders: 39% in ordinary games, 19% on clean-sheet days.** Their score has two levels ten points apart and the football
   inputs separate them poorly.
3. **The spread of ordinary all-around points** (sd 12), skewed upwards, with tackles, interceptions and blocks the part that
   differs most between hits and misses for defenders and midfielders.
4. **Not where suspected:** no fault in a club, an opponent, a month, home or away, cold players, or the way the live job
   builds the inputs.
5. **The Audit's headline judges a different number** from the one v1 tunes (test 12).

## Options

| | Option | Evidence | For | Against |
|---|---|---|---|---|
| A | The Audit's Sofix against Sorare rate reads the point from v1 on (old rows keep their number) | 12 | Shows the 8 points v1 already has; small change in `versus.py`; LaLiga only | The tile shows the average (owner's rule of 26 Oct: the number prices in the decisive chance), so the Audit would judge a number the tile does not show; its typical miss is a little worse (14.5 against 13.8) |
| B | Sofix v1.1: the longer player record | 19 | Uses data already kept; same model shape | About +0.5 to +0.7 points; live history for players the owner does not own starts 1 Jul 2026, so less than the replay at first; needs a new frozen version and a fresh check |
| C | Log every fallback and count it on the Audit | 13 | Makes a silent loss visible; no behavior change | No accuracy by itself |
| D | Better goals forecast for defenders and keepers | 7, 14 | Aims at the concentrated miss | Ceiling +113 hits even with the real goals known |
| E | Wait for v1's first settled weeks (from about 18 Nov) and compare point, average and Sorare on the same games | 4 | The only fresh, unreused evidence | Two to three weeks for 1,000 starts |
| F | A 50% target for all starters | 5, 10, 16 | | Needs the decisive outcome; not reachable before lock |

**Recommended:** C and E now (no behavior change), A if the owner agrees the Audit should judge the point, then B as a frozen
v1.1 checked on weeks after its freeze. Not D or F.

## Where code and documents disagree

- `plans/sofix-v1.md` and `docs/how_it_works.md` §8 say the record saves the point "for score accuracy", and
  `xscore-research-handover.md` states the target on the point; the Audit's headline within-7 comparison still reads the average
  (`versus.py:127-135`). Observed behavior: average. Intended, as written: the point. Open for the owner (option A).
- `docs/how_it_works.md` §8 steps 1-5 still describe the last-five formula with Sorare's projection replacing the score, beside
  the paragraph saying LaLiga uses Sofix v1 and that Sofix does not read the projection since 26 Oct.
- `docs/xscore_success_rate.md` says no formula change has shipped and nothing has been tuned on the held-out weeks; both are
  out of date since 4 Oct and 12 Nov.
- `plans/sofix-v1.md` says a game it cannot answer keeps the previous number; a game with no football numbers gets no number
  at all (`scores.py:95-99`).

## Not determined

Sofix v1 on real pre-lock numbers; how often the live job falls back; how complete the live history is for players the owner
does not own, and how often `mins` is missing (an all-missing window gives a feature value training never saw); whether the
planner's correction (`score_fixes`) is fitted on a mix of old and v1 numbers; PL, Bundesliga and Ligue 1 on the real record.

## Next steps

1. Rerun `confidence_replay.py` before and after any change: 2,596 / 6,754 and 2,176 / 2,925 are the before numbers.
2. Count fallbacks and missing minutes on the next refresh (option C).
3. On the first two settled v1 weeks, compare point, average and Sorare's number on the same starts (option E).
4. Test 19 again with whole gameweeks resampled 2,000 times; freeze it as v1.1 only if the interval leaves zero.
5. **Bookmakers' player prices (owner's yes, 13 Nov).** The refresh now saves each LaLiga game's anytime scorer, assist and
   shots-on-target prices once in its last 30 hours (`jobs/scorer_odds.py`, block `scorer_odds:<event id>`). After about
   ten rounds (~100 games, ~2,000 starters with a price): turn each price into a chance (margin removed), match the
   bookmakers' player names to Sorare's, and rerun tests 37-39 with that chance in place of, then beside, the built odds.
   It is worth switching only if starters rated 50% or more have a decisive at least about half the time (test 38).
