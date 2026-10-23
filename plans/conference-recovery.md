# Conference recovery — development only

23 October 2026, owner: "Resume confrence and explain the blocker".

## Requested outcome and acceptance

Deliver automatic Conference league-phase/knockout FDR and FDR-based xScore for all
36 current clubs, through the existing competition/week controls. No extra user actions,
manual squad visits or form-only substitute. Qualifiers remain deferred. Preserve the
ten approved training-source exceptions and every completed holdout game.

The first candidate failed, despite complete holdout coverage: football RPS 0.237738
against base 0.232819; xScore RMSE 17.795778 against the same architecture without
FDR 17.822220, with paired difference CI [-0.173588, 0.098363]. Neither required
independent improvement is established. The original protocol, reports, artifacts
and CL/EL runtime remain unchanged. This is an accuracy blocker, not a token request.

## Development experiment fixed before opening development metrics

Use only reviewed main-stage football rows from seasons starting 2021 and 2022.
Replay every completed 2022/23 Conference main-stage game; 2021/22 is warmup.
All 2023/24 and later outcomes are excluded before any fit, comparator or selection.
These are development data, never a fresh blind sample: earlier research examined
historical outcomes. Development cutoffs are kickoff minus three days, explicitly
different from the actual Sorare deadlines in the frozen release replay.

Keep the existing pooled UEFA club model and its settings byte-for-byte. Test four
mixtures of its score distribution with a pre-cutoff Conference-average Poisson:
club-model weights 0.25, 0.50, 0.75, 1.00. Mix probabilities, clean sheets and expected
goals consistently; do not change only the headline win probability. Average rates
use only results available strictly before cutoff within 730 days; neutral games
use a symmetric rate. Also compare the rolling home/draw/away base rate.

Select minimum development RPS, breaking ties toward the smaller club weight.
Record all four candidates, paired whole-week uncertainty, source/input hashes,
case counts and settings. Selection is a research suggestion only: always
`validated=false`, `modelEligible=false`. A candidate worse than the rolling base
or with Brier/log-loss loss is explicitly not recommended for prospective capture.
Never rerun 2023–2025 as an independent acceptance test for this selected candidate.

## Next gate

If development supports a candidate, freeze its exact football and independently
trained player models before capturing new, unplayed fixtures at actual Sorare locks.
Only then collect final outcomes and evaluate every eligible completed game, with the
original paired football and xScore/no-FDR gates and per-position requirements.
Do not call the partially played 2026/27 season blind retrospectively. Recording and
settlement must survive the owner's computer being off, through the existing jobs.
Promotion still requires the full current 36-club squad/fixture/history proof,
mixed-week routing, expiry and desktop/mobile product checks. No publication now.

## Development result and player freeze

All 141 development games and 811 pre-2023 pooled history games were replayed.
The predeclared selection chose 0.75 club weight: RPS 0.220020 versus base 0.235693,
paired weekly difference CI [-0.030272, -0.000393], 15 weeks. Brier/log loss improved.
This is selected development evidence, not a new release pass. All four results are
kept in docs/european_validation/CONF-development.json. The failed report is untouched.

Fit the corresponding keeper/outfield models once on all 6,248 approved 2023/24 and
2024/25 Conference starts. Reuse their already frozen pre-lock club-model features;
mix with the same pre-lock competition Poisson goal/clean-sheet rates, not outcome
probabilities substituted for goals. Fit the identical no-FDR comparison on those
same starts. No projection and no new hyperparameter search. Do not construct or
evaluate replacement features for 2025/26. Save training hashes and exact fitted
coefficients under a research-only artifact, with no runtime registration. Timestamp
the freeze; subsequent prospective cases must have actual locks after that timestamp.

The training-only fit completed on all 284 approved games / 6,248 starts. Its frozen
research artifact is docs/european_validation/CONF-candidate-v2.json. There are no
replacement holdout metrics and no Conference runtime block. Automatic prospective
recording/settlement is still to be implemented; the artifact alone does not start
recording and does not make Conference ready to ship. Keep this distinction explicit
when resuming. The required product acceptance remains open.

Verification for this research step: test-first isolation/checksum/coverage/mixture
checks and a full replay isolation test; real cached complete development replay and
real training-only fit. No new source query, UI behavior, schema or production data
write is introduced. Local gate evidence is recorded in the accompanying delivery plan.
