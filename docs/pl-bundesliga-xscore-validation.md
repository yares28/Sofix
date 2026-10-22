# Premier League and Bundesliga xScore validation

21 October 2026. These are independent league models, fitted on 2023/24–2024/25 Sorare starts and evaluated once on 2025/26. The target is **score conditional on starting**. Playing chances retain their existing source hierarchy and heuristics; this is not fresh prospective/blind evidence or validation of every component of a lineup's reward estimate.

## Frozen comparison

The existing goalkeeper and outfield architectures were fitted separately for each league. No LaLiga learned coefficients, clean-sheet calibration or substitute shape were loaded. Retrospective Sorare projections were excluded because their historical pre-lock publication was not established. The independent reference FDR configuration was fixed at xi=.001, ridge=1, promoted prior=0, spread=1.10; the whole Sorare lock date was excluded from the football results used for a forecast. A player's own form used only his league's preceding 70 days, before the actual Sorare cutoff.

The preregistered candidate had to improve RMSE over both a last-five-starts baseline and the same player-history estimator with FDR features removed. The paired bootstrap resampled whole Sorare weeks (2,000 draws, seed 20261021); both 95% intervals had to exclude zero. Every position needed at least 100 test starts and no RMSE loss. Within-seven-point frequency and same-position ordering could not deteriorate. No post-holdout tuning was done.

## Source eligibility and amendment

All scores are authentic Sorare version 7 values, with complete official starting elevens and source playing-side identity. Unknown and zero are distinct. A goalkeeper's clean-sheet label comes from his own playing period, rather than the team's final score. The known Union Berlin–Bochum administrative result of 14 December 2024 is excluded from BL1 outcome/FDR history under the original protocol.

The original collection gate required the full league calendar. Before any PL holdout metrics were opened, **protocol v2** explicitly excluded only Bournemouth–Luton, 13 March 2024, from player-outcome training. The [Premier League confirms the replay date](https://www.premierleague.com/en/news/3885238); Sorare's competition/date feed, club calendar, and the fully paged histories of both preceding starting goalkeepers returned no game in that window (private source run 39678332864). This establishes an observed source gap, not a claim that the data can never exist. No Sorare score was reconstructed or replaced by zero. Its real football result remains in FDR training.

PL training therefore contains 759 of 760 league fixtures; raw source coverage is 1,139/1,140 across three seasons. All **380 holdout fixtures** are present. BL1 has 917 eligible fixtures after the administrative exclusion and all **306 holdout fixtures**. This amendment changed source eligibility before PL testing; it did not change the candidate, settings, baselines or accuracy gates. BL1's cohort and result are unchanged. Collection retains its original v1 hash; evaluation records v2 separately.

## Results

**Premier League:** 8,360 test starts. Model RMSE **17.4551**, recent form **18.3819**, no-FDR ablation **17.7635**. The RMSE difference interval is [-1.0646, -0.7923] against form and [-0.4219, -0.1967] against ablation. Within-seven frequency improved from 27.49% to 27.60%; pair ordering from 55.13% to 58.76%. Every position improved. All amended-protocol gates passed.

**Bundesliga:** 6,732 test starts. Model RMSE **17.8814**, recent form **18.7538**, no-FDR ablation **18.2925**. Difference intervals are [-1.0587, -0.6837] against form and [-0.5801, -0.2423] against ablation. Within-seven frequency improved from 26.47% to 27.32%; pair ordering from 56.14% to 59.64%. Every position improved. All gates passed.

Full coefficients, position results, protocol and runner/source/history/identity/case fingerprints are embedded in [PL's artifact](../backend/artifacts/league_xscore/PL.json) and [BL1's artifact](../backend/artifacts/league_xscore/BL1.json). The runtime checks that evidence, league, reference configuration and training boundary before loading a model. No model is enabled merely by setting a Boolean flag.

## Current workflow proof

Real unattended squad preflight for Sorare week `football-23-27-oct-2026`: PL **20 clubs / 619 players**, BL1 **18 clubs / 541 players**, with no club failures. The source required 22 and 20 calls respectively. Stable player identities are deduplicated on the actual active club. A failed club read retains saved identities and clears its old game/projection fields.

Runtime joins use the actual playing side, opponent, venue, kickoff and a forecast timestamp before the selected Sorare cutoff. Other competitions never receive a foreign domestic model's coefficients. LaLiga retains its existing model. Current histories are collected by whole match, reused after settlement with three days of corrections, and shared with the existing game mirror. Research archives are not copied into production Neon.

Owned and unowned players share the central calculation. Per-league player indexes, bounded detail shards and the identity directory use existing R2/read-model caching; selected-GW records retain genuine source identities and zeros. All new blocks must fit below 1.6 MB. Publication and browser verification must be recorded in the task plan before calling the workflow complete.
