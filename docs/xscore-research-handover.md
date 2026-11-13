# LaLiga xScore research and handover

Checkpoint: 12 November 2026. The independent research target remains open. Research and the versioned app release are separate workstreams.

## Read this first

- [Evidence index](xscore-evidence/index.json) identifies every saved report, plan, candidate list, validation, failure analysis, source qualification, selection and freeze record by path and SHA-256. A report is not necessarily an independent experiment. The exact results and their original nested breakdowns are in the [complete research archive](xscore-evidence/research-2026-11-12.zip), along with the research scripts, focused tests, and both frozen forecast vectors. Extract it into a scratch directory. Consult `backend/reports/experiments/laliga_score_research_checkpoint.json` first, then the corresponding plan, result and integrity files.
- The archive holds no credentials, environment files, production database, or raw third-party dumps. For reproduction on the owner's computer, the pinned raw native file is `C:/Users/Yaya/Desktop/PROJECTS/FixtureDiff/backend/data/raw/sorare_games.jsonl`, SHA-256 `d929567d90aba106c17a7caf958a3aaeefc21749f11efe6dca4ea90d374f39d0`. Derived research files, raw public archives and fixed optional local packages are in this worktree under `backend/data/raw/score-foundation` and `backend/data/raw/formula-packages`. The archived files and source keys identify their dependencies. Those ignored caches are not automatically transferred with Git. Preserve or deliberately reconstruct them before disposing of this worktree.
- Read [the existing score engine plan](../plans/score-engine.md), [the xScore plan](../plans/xscore.md), [the forecast contract](context.md#forecast-sources-001) and [pre-lock contract](context.md#forecast-prelock-001). The [v7 scoring reference](xscore-sorare-scoring.md) gives the scoring rules and observed per-position weights. Check the live model version separately before interpreting any result.
- [Sofix v1 release](../plans/sofix-v1.md) records the deployable LaLiga formula, the four-period comparison, and how Audit will follow new pre-lock forecasts. Its later replay is 38.44% for starters and 74.39% for played substitutes. The research bests below use different inputs.

## Next attempt: start here (13 Nov 2026)

**Other competitions:** PL, Bundesliga, Ligue 1, CL, EL and Conference have their own Sofix v1 refits since 13 Nov 2026, with every test (C1-C9) in [competitions-xscore-evidence.md](../plans/competitions-xscore-evidence.md). The LaLiga steps below are unchanged.

1. **[LaLiga accuracy evidence](../plans/laliga-accuracy-evidence.md)**: tests 1-39 of 12-13 Nov, each with its numbers and verdict.
   In short: decisive actions cause 37% of starter misses; a decisive-chance model built from the match outlook, the
   player's record, the opponent's record by position and the official eleven ranks players (AUC 0.65-0.68) but switching to
   the decisive score lost hits (test 38), because a decisive score lands within 7 only 57% of the time; the best new
   starter model reached 2,722 / 6,754, below the 2,765 here. Owner's bar: better than 2,765 starters and 2,201
   substitutes, and above 50%. Any data known before kick-off is allowed (owner, 13 Nov), not only before the Sorare lock.
2. **Scripts** in `backend/reports/experiments/laliga_accuracy/`: `v2_features.py` builds one pre-kick-off input table for
   all 38,850 appearances (rows in the same order as the research tables and the frozen vectors here, checked);
   `v2_models.py <round>` and `v2_decisive.py` rerun the candidates; `confidence_replay.py` reproduces the live v1 replay
   (2,596 / 6,754 and 2,176 / 2,925), the before number for any live change.
3. **Bookmakers' player prices, recorded from 13 Nov 2026.** Each refresh saves each LaLiga game's anytime scorer, assist
   and shots-on-target prices once in its last 30 hours: read model `scorer_odds:<event id>` = {eventId, home, away, kickoff,
   capturedAt, hoursBefore, markets: {market: {player as the bookmaker names him: [[bookmaker, outcome, line, decimal
   price]]}}} (`backend/app/jobs/scorer_odds.py`; US bookmakers only; Neon and R2). No history exists before that date, so
   they can only be judged on games after it. To use them: remove each bookmaker's margin, match names to Sorare slugs,
   then rerun tests 37-39 with the price chance in place of, then beside, the built odds. Switching pays only where a
   start's honest decisive chance is about 47% or more.

## What counts as success

The task is strictly **more than 50%** within **inclusive ±7 points** for **all 6,754 LaLiga starts** in the fixed later comparison. That takes **3,378 hits**. The best frozen starter vector hits 2,765, leaving **613 net extra hits**. The **2,925 played substitutes** are a separate cohort. DNPs do not enter either conditional score denominator. Cold players, transfers, missing external coverage and forecasts that cannot be overridden remain in the fixed denominators using the appropriate declared fallback. Report MAE, large misses, hits gained and hits spoiled alongside the hit rate. Where possible, show uncertainty by resampling whole gameweeks.

The research case file contains 38,850 native v7 appearances, 27,236 starts and 11,614 played substitutes. Use earlier chronological validation from January–June 2024 (4,400/1,865), 2024/25 (8,360/3,540), and July–December 2025 (3,762/1,621), with pre-validation warm-up. Keep January–October 2026 (6,754/2,925) for the existing comparison, with earlier-only formula selection. All of these outcomes have been reused. They remain a reproducible comparison, not a fresh blind claim. Confirm a frozen candidate on a genuinely unused later set of pre-lock forecasts.

Historical locks are inferred as Tuesday or Friday at 14:00 UTC, whichever is the most recent at kickoff. A historical match only becomes available when kickoff plus 48 hours is strictly earlier than the target lock. Actual current minutes, lineup, formation, score, events, projected role learned from the current outcome, or closing prices captured after the lock never enter an operational forecast. After-the-fact interventions diagnose headroom and need explicit hindsight labels. For real deployment use the recorded Sorare lock and original pre-lock capture, with the same past-data availability rule wherever the historical training depended on it.

## Authority and limits

The owner authorized autonomous local research, discarded weak branches, and asked for the remaining misses to determine the next tests. New hypotheses, free data, local scripts and stronger diagnostics are within scope. No paid services, secret disclosure, production DB writes, automatic Sorare entries, or changes to application behavior are part of the research goal. The 12 November request separately authorized a **Sofix v1** release and Audit versioning. That release exception does not authorize future experimental formulas to go live. Preserve frozen historical forecasts, use matched comparisons, and keep the independent research running separately from the release. No model should inherit another model's reported performance.

## Verified comparison

| Frozen forecast | Starts within 7 | Played substitutes within 7 | Interpretation |
| --- | ---: | ---: | --- |
| Original research controls | 2,761 / 6,754 (40.88%) | 2,189 / 2,925 (74.84%) | Empirical score-window model for starts; historical analogues for substitutes |
| Best frozen by cohort | 2,765 / 6,754 (40.94%) | 2,201 / 2,925 (75.25%) | Bounded team goal share for starts; regularized two-component ordinary-score distribution for substitutes |

The best starter result adds four hits over its paired research control and increases average error from 13.83 to 13.86. The substitute result adds twelve hits and reduces average error from 6.99 to 6.86. These are conditional scores and different formulas by cohort. The primary artifacts are `laliga_score_team_share.json`, `laliga_score_mixture_shrunk.json` and their frozen selections, integrity reports, and saved vectors. The best score research model uses external and reconstructed historical features unavailable through the current live path. Its rate cannot be attributed to a reduced-feature model or to an availability-weighted xScore.

## What the experiments established

This overview is a navigation aid. The evidence archive keeps **all** recorded experiments and detailed metrics, including unpromoted variants and interrupted work. The `laliga_score_` prefix is omitted below.

| Family | Read first | Findings and limits |
| --- | --- | --- |
| Form, local and personal corrections | `failure_review`, `local_errors`, `personal_correction`, `relative_player`, `form_change` | Simple shifts, player modes, repeat-opponent results and flexible form changes did not produce a stable improvement. Raising all scores by 3 rescued 366 misses and spoiled 547 hits. Relative-player and new-club bench signal changed only two strongest-reference cases and gained zero. |
| Direct selection of a score window | `exact_window`, `small_regimes`, `small_rescue`, `candidate_rank`, `expert_choice`, `direct_windows` artifacts | Tried different classifiers, action networks, rescue branches, interval centers and score distributions. Exact numerical window optimization did not beat the control. Rejected or unfinished variants are kept separately. |
| Decisive events, shots and teammate goal allocation | `team_share`, `event_intensity_evaluation`, `created_chances_evaluation`, `native_sot_conditioning`, `large_miss_events` | Goal-share starter model is the retained +4. Most high decisive scores remain missed. Provider shot-on-target definitions disagreed widely; repaired native input was screened separately. Actual event substitution in a diagnostic recovers some misses but is unusable before lock. |
| Ordinary-score distributions | `mixture_shrunk`, `quantile_curve`, `quantile_calibration`, `histogram_ordinary`, `leaf_ordinary`, `history_components`, `unconditional_ordinary`, `joint_density` | Empirical modes protect the ±7 target. Stronger mixture shrinkage improved substitutes by +12 over their own control, not starters. Increased model complexity and calibration changes failed to make the required score improvement. |
| Shape, club and opponent effects | `matchups_evaluation`, `team_shape_conditioning`, `europe_shape_conditioning`, `team_error_memory`, `shared_error_recovery`, `defender_role_pressure` | Shared defender errors are real within a match. Clean sheets/conceded points account for most shared error. Recent team error did not transfer to the next match. Even using actual other defender errors, one simple offset gained 274 hits and spoiled 274. |
| Score components and headroom | `component_replacement`, `duel_miss_decomposition.integrity`, `defensive_residuals`, `mechanics`, `regain_headroom` | Correcting both duel and clean-sheet/conceded points with actual values after the match gained 460 net starter hits in one diagnostic. Actual recovery/interception-only replacement gained 76; the best choice of zero/half/full rescued 359 misses. These are limits of specified interventions, not attainable accuracy or ceilings for other formulas. Winning share dominated volume in 734 of 743 large defender duel swings. |
| Duel opponents and event sources | `opposition_strength`, `physical_duel_signal`, `duel_game_spread`, `openplay_duel_source`, `openplay_duel_signal`, `openplay_aerial_exposure`, `openplay_aerial_routine` | Openplay linked 112,472 opposing contests over 1,140 matches. Both actors matched Sorare for 81,205. Better identification of likely aerial opponents did not improve score hits. Earlier personalized score variant lost 41 starter hits and 67 substitute hits versus retained. Archive ends May 2026; newer source coverage still needs verification. |
| Match flow, clock, possessions and substitutions | `joint_goal_flow`, `passing_style_signal`, `openplay_regain_workload`, `openplay_shared_flow` | Regain context gained 18 starter and 7 bench hits against its matched raw-event model, but lost 64/44 against the strongest references. The shared passing-run pressure experiment correctly classified 416/751 matches versus 381/751 from the common mode. It lost 77 starter/45 bench hits against the strongest references; the bench model gained 33 vs matched ablation. |
| Public odds and timestamps | `projection_receipts`, `player_prop` and `team_market` reports | Only 29 games had usable archived projection receipts, with no earlier fitting receipts. Public market publication times and representative coverage remained limiting. Retrospective estimates and post-lock odds must not be treated as pre-lock observations. |
| News, availability, European data and indirect traits | `coach_source`, `absence`, `suspension`, `observed_workload`, `travel`, `referee`, `physical_traits` reports | Verified facts can explain individual fixtures, but usable historical pre-lock scope was often narrow. Workload, simple lineup changes and referee/trait features did not meet the full-score advancement gate. The European cache has 57,036 played records but lacks duel counts. |

In the later starter sample, **3,989** forecasts miss. Of those, **2,466** have no net decisive boost/penalty, **1,295** have a positive net decisive result, and **228** a negative net result. **1,474** misses are more than 7 and up to 14 points away; **1,306** exceed 25. The main opportunity is selecting when an ordinary forecast should move while protecting its existing hits. In hindsight, the most dominant recent team pressure mode corresponds to 14.62 ordinary points for neutral starting defenders, versus 6.10 under pressure. The current three-mode forecast is too uncertain to make that difference a reliable xScore improvement.

## Upcoming work

1. Focus on **which player** progresses or retains the ball, beyond whether the team tends to dominate. Qualify live-play sequence labels and actual per-role opportunity share from the verified archive, keeping conflicting event clocks unknown. Compare with the old passing-count, geometry, and match-flow controls so a new effect is identifiable. Test useful shifts at the ±7 boundaries, counting spoils.
2. Continue only with supported mechanisms. Keep routine score and decisive events coherent while testing whether a change improves the actual full score distribution. Test starter and substitute cohorts separately. Retain low-volume and missing-input cases in every score comparison.
3. Look for broadly available pre-lock evidence that moves more than one isolated score component. Screen opportunity before model fitting. Do not repeat retired grids or treat actual opponents, minutes or events as candidate features.
4. Keep collecting truly prospective pre-lock observations with an immutable version ID. Freeze one candidate before a new verification window and compare on identical fixtures. The score target and denominator remain unchanged. The Audit should separate retrospective research, live saved forecasts, and the previous live model rather than mixing them into a new headline.
