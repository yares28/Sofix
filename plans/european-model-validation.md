# European model validation protocol — frozen before new metrics

23 October 2026. Scope CL, EL and CONF independently. This is retrospective held-out validation;
earlier European research has examined historical outcomes, so no claim of a freshly blind competition sample.
No accuracy metrics from this new source-complete replay have been opened. Source errors are resolved before
evaluation, with receipts; domestic exceptions never authorize European exclusions.

**Version 2 scope amendment before metrics, 23 Oct:** owner explicitly selected "Release validated league phase
and knockouts first" after source collection found non-final qualifying scores. First-release training history and
evaluation use only the group/league phase and knockouts of CL, EL and CONF. Exclude qualifying from this release
population and from both football and player-history fit inputs, with separate phase counts preserved. All 36
current main-stage clubs per competition remain required. Qualifying forecasts are a later separately validated
release; do not present first-release evidence as proving qualifying accuracy. This paragraph supersedes the
original all-phases statements below; candidate settings and statistical gates remain unchanged.

**Version 3 training-source amendment before metrics, 23 Oct:** owner approved excluding the ten documented
Conference training games `2039295`, `2039335`, `2039302`, `2039311`, `2039326`, `2039358`, `2039383`, `2042294`,
`2042311`, `2042314`, after complete game reads, null direct player-score lookups and empty terminal histories.
Exclude them from player training targets and own-score history, retain every actual result in FDR history.
Keep all 153 completed Conference holdout games, including Rijeka–Sparta's resumed match. CL/EL unchanged.
The actual per-game Sorare fixture/cutoff overrides date-window inference for all cases; no new historical projection.

## Candidate and population

One fixed football candidate, with no hyperparameter search: pooled European club strength on a common scale,
Dixon–Coles Poisson targets, 730 days, xi=.001/day, ridge=1, spread=1.10, unknown club prior=0,
maximum score 10 and fitted low-score correction. Goals only; unavailable shots are not zero.
Canonical UEFA club IDs are shared across the three cups. Fit strictly before the actual Sorare lock (for xScore)
or the forecast cutoff (football replay). No separately fitted domestic rating is assumed comparable across countries.

Neutral venues have zero home-advantage exposure in training and prediction. The source's nominal home side
does not prove home advantage. Require an explicit reviewed venue classification and completed regulation outcome;
extra-time totals, penalties, administrative awards and interrupted matches cannot substitute for a score at 90 minutes.
Store actual completion times and a conservative historical result-availability bound separately from kickoff.
Historical availability bounds are retrospective assumptions, not proof of an archived publication timestamp.

Football development history is 2019/20–2022/23, with Conference starting only when held. Do not import earlier
research's selected winners or tune on 2023/24–2025/26. Football evaluation reports each of those three seasons;
xScore training is 2023/24 plus 2024/25 and holdout is all completed 2025/26 fixtures with authentic Sorare coverage,
including qualifying. The full official calendar remains the denominator. Any missing source/score/XI/version or
unresolved date/team/venue/outcome is a coverage failure; it is never silently removed to pass an accuracy gate.

## Football checks and gate

Replay implementation clarification before metrics (23 Oct): primary football cutoffs are the actual per-game
Sorare deadlines, shared across the three cups. Use kickoff plus two days as a conservative retrospective
availability bound; for a resumed game use the later original/resumption kickoff plus two days. Preserve the
native completion field separately because some historical values are implausible. Apply the same availability
test to player own-history. The base-rate and unweighted Poisson comparators use the same 730-day pre-cutoff
competition history. Report observed deadline horizons in 0-2, 2-4 and 4-8 day bins; do not claim separately
validated unobserved horizons. Rank strength within actual fixture pairs, without a domestic table simulation.

Same cases for every method. Primary RPS against a rolling pre-cutoff competition home/draw/away base-rate
forecast (one pseudo-observation per outcome); also report unweighted goal-rate Poisson, log loss, Brier,
clean-sheet calibration, goal error and reliability bins. Whole UEFA playing-week paired bootstrap, 2,000 draws,
seed 20261023, 95% CI. Each competition must improve RPS with the paired difference CI wholly below zero
against the base-rate comparator, with no aggregate Brier or log-loss loss. Never aggregate competitions to hide a failure.

Report coverage and performance by season, qualifying/group/league/knockout phase, cold clubs (<5 earlier games),
neutral versus home venue and first/return legs. Preserve first-leg aggregate information for analysis; these are
regulation-match probabilities, never advancement probabilities. Rare final/venue subgroups get their actual sample
sizes and uncertainty, without an independent accuracy claim. Report horizon and ranking checks before promotion.

## xScore checks and gate

Use the existing keeper/outfield feature architectures, independently fitted for each European competition,
with the validated European FDR inputs. No historical Sorare projection, guessed start chance, bonus or price input.
Score conditional on an authentic start is distinct from whether the player starts. Preserve Sorare scoring version,
final status, actual team, role, minutes and authoritative XI. Extra-time player scoring follows authentic Sorare scores
and must stay labeled separately from football's regulation target.

History population is the player's authentic starts across CL, EL and CONF during the 70 days strictly before lock,
shared across those competitions and deduplicated by canonical Sorare game/player. Domestic games and national-team
games are outside this first fixed candidate's history population; no synthetic earlier starts. A cold player retains
the two-start prior. Baseline: own last-five starts, two prior starts at 51. Same history availability and case set for candidate and baseline.
Ablation: independently fitted identical player-history architecture with FDR features removed. Compare matched
cases only after complete alignment. Keep the history population identical between training and runtime; decide and
record its competition scope before constructing evaluation cases, never after reading accuracy metrics.

Each competition independently requires >=100 holdout starters per position and both paired whole-Sorare-week
RMSE difference CIs wholly below zero versus form and the no-FDR ablation (2,000 draws, seed 20261023).
No position RMSE loss versus form; no loss in within-7 accuracy or same-position within-game pair ordering.
Also report per-phase/cold-player/extra-time coverage and errors. A failed gate does not authorize another candidate
fitted to that exposed holdout. Fresh prospective confirmation is a separate future recording exercise.

## Promotion and product proof

Collector, alignment and research fitter cannot enable a production model. Promotion requires a separate artifact
with protocol, source, identity, venue/outcome-review, runner and case hashes and every competition's gates.
Then prove automatic current squads, fixtures and recent history, per-game domestic/European selection in one GW,
all existing player/card/planning consumers, expiry, cold start, missing/zero and date/bookmark navigation.
Use bounded blocks and reused player histories; no duplicate player records or large raw archives in Neon.
