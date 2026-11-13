# Sofix v1: training vs live feature rows, football input quality, live distribution check

W = C:/Users/Yaya/.codex/worktrees/7cef/FixtureDiff (paths below are relative to W/backend/app unless noted). Read-only; scripts and raw outputs are in this folder (inputs_q2.py, inputs_q3b.py, inputs_q3c.py, q2_out.txt, q3b_out.txt).

## Q1. Differences between the training row and the live row

| # | Item | Training | Live | Rating |
|---|---|---|---|---|
| 1 | GameNumbers argument order | `GameNumbers(ctx["cs_own"], ctx["lam_other"], ctx["lam_own"])` = (cs, xga, xgf), research/sofix_v1_release.py:66-67 | keyword constructor `GameNumbers(cs=raw_clean_sheet(p_clean_sheet), xga=xg_against, xgf=xg_for, p_over=...)`, sorare/keeper.py:421-426; dataclass order cs, xga, xgf (keeper.py:59-65); features read `.cs .xga .xgf` (sofix_v1.py:43) | identical |
| 2 | Home/away orientation | `home = row["team"] == game["home"]["slug"]`; own side = h if home (release.py:63-66) | Prediction row of the player's club (perspective team) found by `by_odds_name`, nearest kickoff within 36 h (keeper.py:431-436); `home = game.venue == "H"` (scores.py:99). `predict_both_sides` gives home side cs_h, lam_h, lam_a and away side cs_a, lam_a, lam_h (services/rating_predictions.py:162-163), the same keys training reads | identical (cs-vs-clean-sheet table in Q2 confirms cs is the own side's) |
| 3 | cs: raw or calibrated | football.json cs is the raw Dixon-Coles score matrix (research/score_foundation_run.py:57-70, no calibration) | Prediction.p_clean_sheet is calibrated (`correction.apply`, rating_predictions.py:144); `raw_clean_sheet` inverts it with sigmoid((logit(shown)-a)/b) (keeper.py:125-134), a=-0.154, b=0.932 (artifacts/clean_sheet_calibration.json). v1 never calls `adjusted_goals`, so the bookmaker line (`p_over`) is carried but unused in v1 features | identical quantity (inverse is exact up to the 1e-4 clip). Bookmaker adjustment is NOT used by v1: the live GameNumbers has p_over, features ignore it |
| 4 | xgf / xga | lam of fit_dixon_coles(config dixon_coles.json incl. spread 1.1) | Prediction.xg_for/xg_against = same model, "expected goals always stay the model's" (rating_predictions.py:99-102) | identical quantity |
| 5 | Football model freshness | fit cutoff = lock date minus 2 days, CSV history only (score_foundation_run.py:68-71); fit once per lock for all games of that lock; lock-to-game gap mean 1.55 d, max 3.3 d | fit at `now.date()` incl. DB recent results (jobs/predict.py:229-237); refreshed each run, so up to the lock | harmless (live inputs are fresher, not stale) |
| 6 | Lock used for history | `cutoff_for`: most recent Tue/Fri 14:00 UTC at or before kickoff (release.py:26-34) | `forecastBefore` = the gameweek's lock (publish.py:438, scores.py:103). Real locks in blocks: 14:00Z until 23 Oct, 15:00Z from 27 Oct (winter time) | harmless: 1 h shift in winter. A Tuesday-evening game in a Fri-Tue week has an earlier live lock (Fri) than the training lock (Tue 14:00): live history is up to 4 days older than training's for such games |
| 7 | `trained_through` guard | n/a | v1 used only if `v1.trained_through < before` (scores.py:104). Artifact trainedThrough = 2026-10-27T20:00Z. Every lock at or before that, and any game with no `forecastBefore`, silently gets the previous formula (`_named(previous...)`, scores.py:107). If the artifact file is missing, `load()` returns None (sofix_v1.py:121) and the whole path is the old one with no log; a wrong version string raises and the "game scores" step is dropped by `optional(...)` (jobs/sorare.py:722) | harmless today (all locks since 30 Oct pass). Silent fallback is a monitoring gap: nothing records which formula produced a number except `modelVersion` in score_record (present only for v1 games) |
| 8 | Game with no football numbers | row skipped from training | v1 branch appends None for that game (scores.py:96-100): no number, not the old formula | harmless |
| 9 | History row filter | `sofix_v1.eligible` (same function both sides): competition == "laliga-es", played True, started is bool, score not None, status != PENDING, lock-70d <= date < lock-48h, newest first (sofix_v1.py:24-38) | same function called as `eligible(past, before)` (scores.py:105); `past` already excludes status PENDING and dates >= lock and is sorted newest first (publish.py:401-402) | identical filter |
| 10 | Keys of live history rows | export rows: pos, team, score, ver, played, started, mins (never None, 79,336/79,336), plus injected date and competition. No `status` key | player_games.load: competition, status, score, played, started, mins, date (player_games.py:18, 160-170); `played`/`started` built in sync.py:572-580: started=False when playedInGame False, None when unknown; mins = minsPlayed | harmless. `competition` = "laliga-es" equals keeper.LALIGA. Rows with started None or played None are dropped by `eligible` exactly as training drops them. Non-LaLiga rows are dropped by the competition test. DNP rows (played False) dropped |
| 11 | Missing `mins` live | always present | `mins` None is skipped in the mean; if all of the recent rows lack it the feature is -1.0 (sofix_v1.py:52-57), a value training never produced for a player with scores | unlikely-but-possible bug; cannot size without the live DB |
| 12 | Training history only counts ver==7 rows | rows with `ver != 7` are skipped before they enter history (release.py:56-62); all 79,336 rows are ver 7 | live history has no `ver` check | harmless unless Sorare changes the scoring version |
| 13 | History coverage of non-owned players | complete LaLiga export | owner's players: full read; others: `leagueHistory` = player_games.load(days=70 from `fetched`) (jobs/sorare.py:671, publish.py:1417-1422); block league_history_status.json says 659 players covered from 2026-07-01 | cannot be fully verified; any missing game changes the count and form features. Window start lock-70d is later than fetched-70d for future locks, so no truncation |
| 14 | Position | export `pos` (positionTyped); every one of 1,192 players has exactly one pos (checked) | `SORARE_POSITION[player.position]` (scores.py:76); same GK/DEF/MID/FWD order as `POSITIONS` | identical in practice; `pos None` gives no number (scores.py:92) |
| 15 | Role | trees fit separately on rows that played as starter or as substitute | both roles predicted for every player (sofix_v1.py:99-102) | harmless; the sub number is "if he comes on" |
| 16 | `Outcome.p_clean_sheet` shown | n/a | `from_distribution(hist, numbers.cs)` stores the RAW cs (sofix_v1.py:81-86), while the board shows the calibrated one (about 3 points lower) | harmless for the score; a display inconsistency |
| 17 | What the page and Audit store (mean vs point) | model tuned for `point` = best within-7 window (sofix_v1.py:73-76) | `game_scores = o.start` = the MEAN (publish.py:2002 area, 1996: `"sofix": round(start_score,1)`, `"sofixOn": sub.outcome.start`); the point goes only to `sofixPoint`/`sofixOnPoint` (publish.py:2002-2003). `player_games.save_statements` stores `sofix_x = game["sofix"]` = mean (player_games.py:249). The Audit's Sofix-vs-Sorare "within 7" and every headline figure compare the mean (versus.py:114, `starts_of`, `_side` line ~198; `comparison` score_checks.py:306). Only `versus.model_versions` (versus.py:142-175, audit.py:454) compares `sofixPoint` / `sofixOnPoint`. Cards panel shows the xScore (mean) and the point as small text (CardsView.tsx:89,317) | likely accuracy-relevant (see below) |
| 18 | Planner stretch | n/a | `score_fix.apply(f.mu)` (publish.py:1462-1473) stretches Sofix's mean for planning when `on`; it was fitted on the previous formula's `sofix_x` records (score_fixes.py docstring: real = -11.8 + 1.24 x number) and will keep fitting on a mixture of old and v1 means | possibly accuracy-relevant for plans, only if the fix is on; I could not read its current state |

### Item 17 in numbers (from frontend/lib/data/sofix_v1_replay.json, the release's own replay)
Within-7 rate, starters (cases 4,400 / 8,360 / 3,762 / 6,754), previous formula vs v1 point vs v1 mean:
- 2024 H1: 29.7% / 38.3% / 29.3%
- 2024/25: 30.6% / 38.7% / 30.1%
- 2025 H2: 30.2% / 37.3% / 29.5%
- 2026: 30.0% / 38.4% / 30.1%

Substitutes: 59-65% (previous) / 74-80% (point) / 69-74% (mean). Mean absolute error for starters is worse for the point (14.2-14.7) than for the mean (13.7-13.9) and the old formula (13.5-13.8). So the gain is entirely in the point. The page and the Audit headline show/compare the mean, which for starters equals the old formula's rate; the gain appears only in the "models" block of the Audit.

## Q2. Are the football inputs themselves good? (football.json joined to real results, LaLiga, one row per side, `n` = games)

Clean-sheet chance = P(own side concedes 0). Brier base = p(1-p) at the period's own hindsight rate, which is an optimistic bar. xGA columns equal xGF because each game contributes both sides.

| period | games | mean cs said | happened | Brier cs | Brier base | skill | mean xGF | goals for | corr xG-goals | corr cs-CS |
|---|---|---|---|---|---|---|---|---|---|---|
| 2023 H2 | 180 | 0.315 | 0.278 | 0.1814 | 0.2006 | +0.096 | 1.253 | 1.333 | 0.401 | 0.324 |
| 2024 H1 | 200 | 0.312 | 0.307 | 0.1952 | 0.2129 | +0.084 | 1.255 | 1.312 | 0.397 | 0.291 |
| 2024/25 | 380 | 0.308 | 0.257 | 0.1809 | 0.1907 | +0.052 | 1.285 | 1.309 | 0.420 | 0.257 |
| 2025 H2 | 171 | 0.304 | 0.275 | 0.1830 | 0.1993 | +0.082 | 1.295 | 1.278 | 0.430 | 0.294 |
| 2026 (Jan-Oct) | 307 | 0.291 | 0.220 | 0.1714 | 0.1715 | +0.001 | 1.343 | 1.438 | 0.400 | 0.196 |
| 2026 Jan-Jun | 209 | 0.298 | 0.206 | 0.1686 | 0.1634 | -0.032 | 1.318 | 1.404 | 0.327 | 0.180 |
| 2026 Jul-Oct | 98 | 0.277 | 0.250 | 0.1772 | 0.1875 | +0.055 | 1.394 | 1.510 | 0.522 | 0.244 |
| all | 1238 | 0.305 | 0.261 | 0.1812 | 0.1930 | +0.061 | 1.291 | 1.341 | 0.410 | 0.267 |

Slope of an ordinary least squares fit of clean sheet happened on cs said (1.0 = well calibrated): 2023 H2 1.17, 2024 H1 1.14, 2024/25 0.90, 2025 H2 1.07, 2026 0.69 (Jan-Jun 0.62, Jul-Oct 0.90).

Reliability by band (said / happened, n = sides):

| band | 2023 H2 | 2024 H1 | 2024/25 | 2025 H2 | 2026 | 2026 Jan-Jun | 2026 Jul-Oct | all |
|---|---|---|---|---|---|---|---|---|
| 0.0-0.1 | .072/.077 (13) | .079/.083 (12) | .069/.081 (37) | .075/.105 (19) | .069/.000 (33) | .061/.000 (19) | .079/.000 (14) | .071/.061 (114) |
| 0.1-0.2 | .157/.038 (53) | .157/.125 (72) | .157/.090 (133) | .158/.102 (59) | .148/.144 (97) | .149/.152 (66) | .147/.129 (31) | .155/.104 (414) |
| 0.2-0.3 | .251/.204 (108) | .254/.277 (94) | .251/.202 (178) | .255/.241 (83) | .248/.206 (189) | .250/.157 (121) | .244/.294 (68) | .251/.219 (652) |
| 0.3-0.4 | .351/.356 (90) | .350/.339 (124) | .350/.310 (226) | .347/.294 (102) | .349/.241 (187) | .350/.242 (132) | .346/.236 (55) | .349/.300 (729) |
| 0.4-0.5 | .448/.429 (70) | .445/.390 (77) | .444/.380 (142) | .442/.459 (61) | .438/.306 (85) | .439/.281 (64) | .434/.381 (21) | .443/.386 (435) |
| 0.5-0.6 | .530/.478 (23) | .528/.700 (20) | .534/.488 (41) | .531/.333 (15) | .549/.450 (20) | .545/.429 (14) | .558/.500 (6) | .534/.496 (119) |
| 0.6+ | .638/.667 (3) | .636/1.00 (1) | .615/0 (3) | .632/1.00 (3) | .624/.667 (3) | .618/.500 (2) | .634/1.00 (1) | .628/.615 (13) |

Expected goals against goals scored: overall 1.291 vs 1.341 (xG about 0.05 low). By quartile of xGF the mapping is close to straight in 2024-2025 (e.g. 2024/25: 0.77 to 0.87, 1.03 to 1.04, 1.33 to 1.29, 2.00 to 2.03). In 2026 Jan-Jun the bottom quartile is under-forecast (0.82 forecast, 1.11 scored) and the top over-forecast (2.03, 1.87). Home sides 2026: xGF 1.52, goals 1.67; away 1.16 vs 1.21.

Reading:
- The raw cs leans high, every period, by about 4 points overall (0.305 vs 0.261), mostly in the 0.1-0.4 bands and mostly for away sides (2026 away: said 0.246, happened 0.173). This is the bias the production calibration (a, b) removes for display; v1 is trained on the raw value, so it learns whatever relationship holds in 2023-2026 together.
- Discrimination is weak but real: correlation of xG with goals is 0.40-0.43, cs with clean-sheet outcome 0.26-0.32, Brier skill 5-10% over a hindsight constant in 2023-2025.
- 2026 Jan-Jun is worse: skill -3% (no better than a constant), cs said-vs-happened slope 0.62, xG correlation 0.33 (SE about 0.05 for n=418 sides, so about two standard errors below 0.42), cs lean +9 points (0.298 vs 0.206). Jul-Oct 2026 (98 games) looks better (skill +5.5%, xG correlation 0.52) but is small. So 2026 is worse on cs, not clearly worse in xG level, and the newest slice is within noise of the earlier periods.

## Q3. Distribution of live inputs against training

What the blocks hold (checked in frontend/.blocks, written 2026-11-11 14:45-14:47):
- No v1 output is in any block. `modelVersion` / `sofixPoint` are absent from every score_record, sorare and audit block. The release commit (2308b0fc) is dated 12 Nov 18:28, after the blocks, so all `sofix` values in them are the previous formula. The predicted-points comparison below is therefore for the previous formula.
- cs / goals reach the blocks only through the board: sorare.json, sorare_week/plan:*, grid.json. Board cs is the calibrated value (inverted here with the production a, b); goals are rounded to 2 decimals. Of 1,233 board entries, only 79 LaLiga entries (18 distinct sides, all 6-8 Nov) are `source: "model"` in the score/plan blocks; the rest are Sorare's own odds. Finished games in grid.json carry no prediction. The only larger live sample is the scheduled-fixture predictions in grid.json (520 LaLiga sides, 20 Nov 2026 to 30 May 2027, written 11 Nov), which are far-ahead predictions, not the exact pre-lock inputs. There is no overlap with training games, so no paired comparison was possible.

Quantiles (min / p10 / p25 / p50 / p75 / p90 / max), raw cs inverted:

| set | n | cs quantiles | cs mean (sd) | xGF mean (sd) |
|---|---|---|---|---|
| LIVE grid, all scheduled | 520 | .014 .112 .189 .279 .357 .432 .596 | 0.275 (.118) | 1.421 (.590) |
| LIVE grid, next 3 weeks | 44 | .061 .107 .170 .270 .350 .448 .491 | 0.268 (.120) | 1.440 (.533) |
| LIVE board 6-8 Nov, model | 18 | .151 .169 .198 .222 .312 .367 .519 | 0.260 (.094) | 1.391 (.333) |
| TRAIN all 2023-26 | 2,476 | .012 .139 .215 .310 .392 .465 .671 | 0.305 (.122) | 1.291 (.501) |
| TRAIN 2025/26 | 760 | .023 .135 .216 .307 .383 .451 .642 | 0.301 (.120) | 1.308 (.511) |
| TRAIN 2026/27 so far | 196 | .012 .113 .207 .271 .356 .416 .634 | 0.277 (.117) | 1.394 (.525) |

Home sides: live cs 0.321, xGF 1.62 against training (all years) 0.351 / 1.47 and 2026/27-to-date 0.323 / 1.58. Away: live cs 0.230, xGF 1.22 against 0.259 / 1.12.

Reading: the live inputs match the 2026/27 training slice almost exactly (cs 0.275 vs 0.277, xGF 1.42 vs 1.39). Against the full training set the live inputs are lower in cs (0.275 vs 0.305) and higher in xGF (1.42 vs 1.29), i.e. 2026/27 itself has shifted, and the training set includes it for 196 rows. That is not a training/serving mismatch in the inputs; it is a period drift that a model trained on all years under-weights. The x-axis of 2026/27 (more goals expected, fewer clean sheets) is inside the training range everywhere except xGF tail (max 4.29 live vs 4.46 train). The only confirmed mismatch candidates remain items 11, 13, 17 above.

Predicted points in blocks (previous formula `sofix`, starter, LaLiga, 3,071 player-games across ten weeks) against actual starter scores in training: GK mean 47.3 (p10-p90 42.8-51.2), DEF 47.3, MID 47.9, FWD 50.0 vs training actual starters 48.9 / 47.4 / 48.8 / 50.1 (actual p10-p90 about 27-76). Predicted substitute (`sofixOn`) means 41.3-42.0 vs actual substitutes 33.8-39.8. The previous formula is much narrower than reality, as expected of a mean.

## Could not determine
- The live v1 outputs, because none have been published yet; no live input vs actual comparison of v1 was possible.
- Live history completeness for non-owned players and how often live `mins` is missing (needs the production player_games table, which I did not touch).
- Whether `score_fix.on` is currently true (its state is in a Neon-kept record).
- Whether the Audit's headline will be switched to `point`; the code at this commit compares the mean.
