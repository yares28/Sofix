# Ligue 1 FDR and xScore

Owner request, 22 October 2026: add Ligue 1 FDR and xScore using the same independently validated release standard as PL/Bundesliga. No extra owner actions, source tabs, tokens, paid services or continuously running PC.

## Contract

- Automatic full regular-season fixture board, Difficulty, Fixtures, Table and team pages for every Ligue 1 club; preserve selected dates across leagues and navigation. No borrowed LaLiga calibration, odds or model coefficients.
- Automatically index every Ligue 1 squad, owned and unowned players. Player search, direct bookmarks, selected Sorare GW, owned cards/plans and existing foreign-player consumers use consistent actual playing sides and sources. Missing differs from zero; source failure retains identities and expires forecasts.
- Train Ligue 1 xScore independently on authentic version-7 2023/24 and 2024/25 starters, evaluate once on complete 2025/26 holdout. Use the existing fixed candidate/reference FDR, recent-form comparator, no-FDR ablation, whole-week paired bootstrap (2000 draws, seed 20261021); require >=100 starts per position, both RMSE CI upper bounds below zero, no per-position RMSE, within-7 or ordering loss. No post-holdout tuning. Any source gap or failed gate is reported and blocks model promotion, never disguised as a pass.
- Retrospective conditional-on-start evidence is distinct from future blind validation and starting-chance accuracy. Only enable a Ligue 1 player-facing model after its gates pass; FDR can ship separately while collection/validation runs.
- Use existing private Actions cache/artifacts and bounded R2/read-model blocks. No migration, direct production SQL mutation or manual full-refresh dispatch after a backend push. Preserve the three-hour full-refresh cooldown; missing-board bootstrap is allowed.

## Acceptance

- [ ] Real fixture/history source and all-club coverage verified; literal aliases and league table rules checked.
- [ ] Failing regression tests precede implementation: full league/season, source failures/isolation, selected date/GW, expiry, missing/zero, actual side, bookmarks/search.
- [ ] FDR collection, publication and UI enabled and verified on real data at 1440/390 px, with production-build navigation.
- [ ] Historical Sorare cohort and current squads complete; frozen independent xScore accuracy gates pass before promotion.
- [ ] Automatic xScore history/publication and every player surface verified; required local checks, browser specs and live release checks pass.

## Evidence

- Started from clean worktree and fast-forwarded to ebbb346, preserving concurrent Arcade/overlay work. Production startup check: Vercel deployed, all 15 pages HTTP 200, backend/frontend CI successful, last scheduled refresh successful; live Neon Sofix C with normal quota failover. Existing PL/BL1 model artifacts and protocol are unchanged.

- Free CSV real reads: 380 games in 2021/22 and 2022/23, then 306 in each 2023/24, 2024/25 and 2025/26; 63 current 2026/27 results and all 18 current club identities, including Le Mans/Troyes. The historical xScore denominator is 918 games before any documented administrative exclusions. Source codes are football-data.org FL1, CSV F1 and the existing Understat/Sorare registry slug ligue-1-fr.
- Source-only delivery adds FL1 to the private historical/current-squad preflight, without adding it to runtime enabled leagues or changing either existing artifact/protocol hash. A single configured football-data.org read in the research workflow retains the complete current fixture response. Raw source indexes are retained even when literal alias reconciliation fails, allowing a credential-free reproduction.
- Primary references: https://www.football-data.org/coverage lists Ligue 1 in the free tier; https://ligue1.com/en/articles/l1_article_2830- gives the revised tie breakers (overall GD, H2H points/GD, season goals, wins, away wins, discipline, drawing). No discarded away-goals rule will be copied from older summaries.

- Before collecting outcomes or opening holdout metrics: exclude Montpellier-Saint Etienne, 16 March 2025, from statistical FDR fitting and player-outcome training as an administratively finalized, interrupted match. Keep its official result for table/fixture display. LFP decision (2 April 2025): https://ligue1.com/fr/articles/l1_article_2277-discipline-toutes-les-decisions-du-2-avril-l1-2425 ; ASSE confirms the 0-2 result was ratified without restarting: https://www.asse.fr/actualites/le-score-est-enterine-les-trois-points-acquis--ac38439 . This reduces expected eligible outcome fixtures to 917 (training only); all 306 holdout matches remain required. Other source gaps block evaluation; do not invent exclusions after reading metrics.

- Source preflight run 39823551072: configured fixture feed has all 18 clubs/306 fixtures; current Sorare squads are complete with 520 football players and no errors. Retained historical index has 915 fixtures. Initial alias reconciliation failed with 301 unmatched date windows; raw receipts prove exact labels and are used to add literal mappings. Offline matching then leaves only Montpellier-Clermont 29 November 2023, the predeclared administrative match, and Nantes-Toulouse 17 May 2026; no scores or missing rows are fabricated. The next source read uses the existing bounded date/club/preceding-keeper reconciliation for the two eligible gaps.
- Real full-season FDR builds successfully with all 18 clubs/34 rounds, 486 future side predictions and independent model FL1:dixon-coles-v1+0d8bec30. The configured feed gives Strasbourg source ID576 the malformed TLA "RC "; a failing regression proves this and a presentation-only STR override preserves the actual source ID.
- Required live check after 739e627 revealed a newly published critical Next.js dependency audit failure (GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r). Both official advisories specify 15.5.28 as the patched 15.x version. Patch Next and its matching eslint config before the next release; no major upgrade, paid service or security-setting change.
