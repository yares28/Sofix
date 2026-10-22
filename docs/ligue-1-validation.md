# Ligue 1 FDR and xScore evidence

22 October 2026. Contract and execution receipts: [delivery plan](../plans/ligue-1-fdr-xscore.md).

## FDR

The configured football-data.org FL1 feed supplies all 18 clubs and 306 regular-season fixtures. Five cached F1 CSV seasons fit the fixed independent reference (xi=.001, ridge=1, promoted prior=0, spread=1.10). No LaLiga learned coefficients, clean-sheet calibration, live odds blend or decisive-action rates are applied. Raw clean-sheet probabilities are uncalibrated; retrospective preseason projections and live Odds/Vs odds are unavailable.

Automatic bootstrap published 18 clubs/34 rounds (420,204 bytes), model `FL1:dixon-coles-v1+0d8bec30`. Source IDs remain unchanged; Strasbourg's malformed provider abbreviation `RC ` has a tested presentation override `STR` for source ID576. Interrupted Montpellier-Saint Etienne 16 March 2025 is excluded from statistical fitting; its ratified official result remains available to the fixture/table source.

Current tables use overall goal difference, completed mutual-game points and goal difference, season goals, wins and away wins. Discipline/drawing are unavailable, so unresolved places remain shared. These follow the [LFP's revised rules](https://ligue1.com/en/articles/l1_article_2830-); old away-goals tie breakers are not used. Relegation is two direct places plus a play-off place; simulations count direct relegation.

Real published Difficulty, Fixtures, Table and PSG pages were checked locally at 1440/390 px on a production build with no horizontal overflow or undersized text. Calendar dates survive league changes, reload and team navigation. No raw historical archive is copied into production.

## xScore release gate

All 18 current Sorare squads passed preflight: 520 football players, no club errors. The target is score conditional on starting. Protocol v3 is frozen before opening any holdout metrics: fit 2023/24-2024/25 independently; test 2025/26 once; require a complete eligible authentic version-7 starter cohort, actual Sorare cutoffs, no future own-form/FDR inputs, >=100 starts per position, paired whole-week 95% RMSE difference intervals below zero against both recent form and a no-FDR ablation, no per-position RMSE loss, and no within-seven or ordering loss. No historical Sorare projections enter the model without pre-lock publication evidence. No post-holdout tuning.

The [LFP's 2 April 2025 decision](https://ligue1.com/fr/articles/l1_article_2277-discipline-toutes-les-decisions-du-2-avril-l1-2425) ratified the interrupted Montpellier-Saint Etienne result. This training fixture was declared ineligible before collecting outcomes; the initial eligible denominator was 917/918; the owner-approved amendments below define the final cohort. PL/Bundesliga protocols and artifacts remain unchanged.

The owner approved two administrative exclusions before metrics: Montpellier-Saint Etienne (16 March 2025) and Nantes-Toulouse (17 May 2026, abandoned after 22 minutes; [LFP report](https://ligue1.com/fr/articles/l1_article_5119-j34-nantes-toulouse-definitivement-arrete)). Six training-only source exceptions were also approved before metrics: Montpellier-Clermont replay (29 November 2023), absent from the competition/date/club/both goalkeeper paths; Lens-Metz (16 September 2023), Metz-Nice (7 October), Monaco-Metz (22 October), Metz-Le Havre (29 October), PSG-Metz (20 December), each with only 21 authoritative player identities and 21 starter outcomes. Their real results remain in football history. Nantes-Lyon (7 February 2026) retains every official starter; an unrelated disabled identity outside both elevens is ignored.

The final cohort is 910 fixtures / 20,020 starter outcomes: 605 training fixtures and all 305 completed holdout fixtures / 6,710 starters over 36 Sorare weeks. No remaining alignment errors, missing fixtures, unknown versions or incomplete elevens. No post-holdout tuning.

The frozen candidate passed: RMSE 17.8570 versus recent form 18.7283 and no-FDR ablation 18.1038. Whole-week paired 95% difference intervals were [-1.0954, -0.6331] versus form and [-0.4161, -0.0761] versus ablation (2,000 draws). Within-seven accuracy was 27.23% versus 26.83%; same-position ordering 58.29% versus 55.04%. Position RMSEs all improved: GK 19.4826 vs 20.8233 (610 cases); DEF 19.1435 vs 20.2269 (2,564); MID 15.9210 vs 16.4491 (1,956); FWD 17.2959 vs 17.9802 (1,580).

Full evidence, source/history/identity/runner/case fingerprints, protocol and fitted coefficients are retained in `backend/artifacts/league_xscore/FL1.json`; private raw receipts remain in the resumable Actions cache and seven-day artifacts (runs 39826539575 / 39829438939). No raw archive enters Neon. The current all-club preflight contains 520 football players from all 18 squads, with no errors.

This is retrospective score validation conditional on starting, with documented training exclusions. It does not establish fresh prospective/blind accuracy, starting chances or lineup rewards. Current forecasts require the actual playing sides and matching pre-lock FL1 FDR; missing context uses its honestly named source.
