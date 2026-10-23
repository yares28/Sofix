# Conference v2 prospective acceptance — fixed before capture

Candidate: `docs/european_validation/CONF-candidate-v2.json`, SHA
`ff0d528671114fd96b962cc423964fada72a1875ac56637f5b8e18988eec15ea`.
The fitted coefficients, football configuration and 0.75 club weight are frozen.

Population: every remaining 2026/27 main-stage fixture whose actual Sorare lock is
strictly after the candidate's frozenAt timestamp. Include future knockout draws.
The completed edition must contain all 108 league-phase and 45 knockout fixtures,
and every member of the prospective population must have an authentic final outcome
and 22 starters matched to complete pre-lock predictions. Qualifiers are excluded.
An abandoned/administrative game or incomplete score is a blocker, never an implicit
exclusion. The ten old training exceptions do not authorize a prospective exclusion.

Capture all current players of both actual clubs during the 36 hours preceding the
actual source cutoff; preserve unknown roles without a prediction. Keep immutable
revisions in private R2 and select the last complete matching gameweek/cutoff revision
whose storage timestamp is strictly before lock. Preserve both source IDs, all actual
sides, role, venue and original/rescheduled dates. No prediction reconstruction.
Use only observed facts: own history is final authentic CL/EL/CONF main-stage starts
in the 70 days before lock, with availability strictly before capture. Zero is valid.
Persist form and independently trained no-FDR predictions on the same players.

After the entire edition finishes, verify the complete denominator before opening
accuracy metrics. Do not stop early based on results. Compare football RPS against
the pre-capture rolling Conference home/draw/away base rate, with no Brier/log-loss
loss; paired whole-playing-week 95% difference CI must be wholly below zero.
Compare xScore RMSE with form and no-FDR separately; both paired whole-Sorare-week
95% difference CIs must be wholly below zero, >=100 starters per position, no position
RMSE loss to form, no loss in within-7 or same-position within-game pair accuracy.
Use 2,000 draws, seed 20261023. Report phases, venue, cold cases and actual forecast
horizons with sample sizes. A report never registers or promotes a serving model.

The recorder stores the protocol and implementation hashes before its first accepted
capture and refuses subsequent implementation changes. Fixes that affect forecasts
require explicit evidence/version handling, not silent replacement of saved records.
