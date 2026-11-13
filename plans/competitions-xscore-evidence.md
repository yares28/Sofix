# xScore beyond LaLiga: the evidence (13 Nov 2026)

Owner's ask (13 Nov): bring the other competitions' xScore up to LaLiga's (Sofix v1), or as far as each goes, compared with
Sofix v1, and keep every test and conclusion. Accuracy is the share of numbers within 7 points of the real score, inclusive,
starters and played substitutes apart, judged on the number a model picks for that question (the point), as in
[sofix-v1.md](sofix-v1.md). Sorare's own projection is neither used nor compared (owner's rule).

**Result:** shipped as `Sofix v1 PL`, `BL1`, `FL1`, `CL`, `EL`, `CONF`. On 2025/26 starters go from 27-28% to 35-39% and
played substitutes from 58-62% to 76-79%; every gain's interval is far above zero in both periods tested.

## What was live before

PL, Bundesliga, Ligue 1, Champions League, Europa League and Conference League ran the formula LaLiga had before Sofix v1:
a keeper model and one linear model per outfield position, fitted per competition on 2023/24-2024/25
(`artifacts/league_xscore/*.json`, `artifacts/european_xscore/*.json`; [pl-bundesliga-xscore.md](pl-bundesliga-xscore.md),
[ligue-1-fdr-xscore.md](ligue-1-fdr-xscore.md), [european-fdr-xscore.md](european-fdr-xscore.md)). Their recorded 2025/26
holdout, starters within 7: PL 27.6%, Bundesliga 27.3%, Ligue 1 27.2%, CL 26.5%, EL 27.0%, Conference 26.1%. Substitutes
had no model of their own (his recent average). LaLiga's Sofix v1 replays at 37.95% / 76.3% on the same season.

## Data and method

- **Games:** every played game since 1 Jul 2023 from Sorare's public API without a key, one question a game
  (`python -m app.jobs.export_games --competition <slug> --no-stats --since 2023-07-01 --out data/raw/xscore-leagues/<slug>.jsonl`;
  European cups: main stage only through a small driver calling `export_games.run`, qualifiers' results kept in the
  `_list.json` files for the goals model). PL 1,238 games, Bundesliga 999, Ligue 1 ~1,000, CL 575, EL 591, Conference 501.
  Keyless pace: 15-30 games a minute from one computer, with 75-second waits when Sorare refuses; the set took most of a day
  over two sessions. The files are git-ignored research data on the owner's computer.
- **Fixture numbers before the lock:** domestic leagues refit the boards' reference Dixon-Coles model (`league_fdr.REFERENCE`)
  on football-data.co.uk results strictly before the lock day; the cups refit the boards' pooled European goals model on the
  three cups' results known before the lock (Sorare's final scores, extra time included, every venue treated as a home
  ground; the board itself reads UEFA's regulation scores and venues: a small difference, listed under limits).
- **Lock:** the latest Tuesday or Friday 14:00 UTC at kick-off; history settled 48 hours before it (as Sofix v1).
- **Periods:** 2025/26 (fitted on everything settled before its first lock, so 2023/24-2024/25) and 2026/27 to 8-10 Nov
  (fitted on everything before it). 2025/26 is the season the live formulas were checked on, so their numbers compare.
- **Interval:** whole lock weeks resampled 2,000 times (seed 20261113); "net" = hits gained minus hits spoiled against the live
  formula, 95%.
- **Code:** `backend/app/research/sofix_v1_competitions.py` (cases, fits, artifacts) and
  `backend/reports/experiments/other_competitions/evaluate.py` (every variant; each run's JSON in `results/`, the Audit's
  file from `replay_json.py`).
- **Harness checks:** LaLiga rebuilt this way gives Sofix v1 37.95% / 76.3% on 2025/26. The replayed live formulas land on
  the case counts their own releases recorded: PL 8,360 starts (27.7% here, 27.6% recorded), Bundesliga 6,732 (27.5 / 27.3),
  Ligue 1 6,711 (27.4 / 27.2, one start more), CL 4,158 (26.3 / 26.5), EL 4,158 (27.3 / 27.0), Conference 3,366 (27.3 / 26.1).

## Every test and what it said

Starters within 7, 2025/26 then 2026/27. All variants keep v1's substitute trees except where said.

| # | Test | PL | BL1 | FL1 | CL | EL | CONF | Verdict |
|---|---|---|---|---|---|---|---|---|
| C1 | Live formula replayed | 27.7 / 27.9 | 27.5 / 27.5 | 27.4 / 28.2 | 26.3 / 26.3 | 27.3 / 30.2 | 27.3 / 29.0 | Baseline. Subs (2025/26): 62.3, 59.7, 60.3, 59.3, 61.3, 58.2 |
| C2 | LaLiga's Sofix v1 artifact as it is | 37.8 / 35.9 | 36.0 / 34.1 | 36.3 / 36.1 | 34.3 / 33.6 | 36.7 / 38.3 | 36.8 / 36.4 | LaLiga's trees carry over: +8 to +10 points |
| C3 | v1 trees fitted per competition, his games in that competition (70 days) | 37.7 / 34.9 | 36.4 / 35.1 | 36.1 / 37.1 | 33.7 / 34.1 | 36.8 / 37.5 | 36.4 / 35.2 | Same as C2 within noise. Subs 79.0, 76.2, 76.9, 76.8, 77.8, 77.6 |
| C4 | C3 with his games in every competition | 37.9 / 34.6 | 36.4 / 34.8 | 36.5 / 37.2 | 34.0 / 34.1 | 36.6 / 37.8 | 36.7 / 35.7 | No gain |
| C5 | C3, the starter's point from trees fitted on ordinary games only (LaLiga test 31), 120 trees depth 7 | 38.8 / 36.1 | | | 34.5 / 34.3 | 37.2 / 37.2 | | Best on average. LaLiga itself +88 / +18 this way |
| C6 | C5 with his games everywhere | 38.7 / 35.7 | | | 34.8 / 34.2 | 36.8 / 37.5 | | No gain |
| C7 | One model for several competitions, C5's point (PL with LaLiga; cups with LaLiga, PL, CL, EL; BL1/CONF with all six and LaLiga) | 39.3 / 35.8 | 36.7 / 35.6 | | 34.8 / 34.0 | 36.9 / 37.8 | 37.1 / 35.9 | Within noise of C5 and C9; more to keep in step |
| C8 | Longer history: 150 and 365 days (own competition, and 150 everywhere) | 39.1 / 35.9 | | | 34.5 / 35.1 | 36.8 / 37.2 | | Noise; 70 days stays (live history for players you do not own starts 1 Jul 2026) |
| C9 | **C5 at v1's small shape (36 trees, depth 5): shipped** | **39.1 / 35.6** | **36.7 / 35.7** | **37.4 / 37.4** | **34.6 / 34.2** | **36.8 / 37.8** | **37.7 / 35.9** | Same as C5 (8,160 against 8,157 hits on PL, CL, EL summed); artifacts stay LaLiga-sized |

C8's best rows shown (PL 150 days; CL 365 days in 2026/27); the others were lower or equal.

### C9 in full (shipped)

| | Starters 2025/26 | net | Typical miss | Subs 2025/26 | net | Starters 2026/27 | Subs 2026/27 |
|---|---|---|---|---|---|---|---|
| PL | 2,316 → 3,269 / 8,360 (27.7 → 39.1%) | +824 to +1,096 | 14.1 → 14.4 | 1,950 → 2,475 / 3,132 (62.3 → 79.0%) | +453 to +594 | 613 → 784 / 2,200 (27.9 → 35.6%) | 563 → 704 / 884 |
| BL1 | 1,848 → 2,469 / 6,732 (27.5 → 36.7%) | +525 to +725 | 14.4 → 15.1 | 1,684 → 2,151 / 2,823 (59.7 → 76.2%) | +415 to +520 | 490 → 636 / 1,782 (27.5 → 35.7%) | 412 → 544 / 757 |
| FL1 | 1,836 → 2,510 / 6,711 (27.4 → 37.4%) | +564 to +786 | 14.5 → 14.8 | 1,614 → 2,058 / 2,677 (60.3 → 76.9%) | +384 to +504 | 559 → 741 / 1,980 (28.2 → 37.4%) | 518 → 650 / 832 |
| CL | 1,095 → 1,438 / 4,158 (26.3 → 34.6%) | +217 to +478 | 15.1 → 16.0 | 1,004 → 1,299 / 1,692 (59.3 → 76.8%) | +191 to +398 | 417 → 541 / 1,584 (26.3 → 34.2%) | 374 → 483 / 675 |
| EL | 1,134 → 1,530 / 4,158 (27.3 → 36.8%) | +280 to +522 | 14.6 → 15.2 | 1,068 → 1,355 / 1,741 (61.3 → 77.8%) | +180 to +392 | 478 → 598 / 1,584 (30.2 → 37.8%) | 389 → 493 / 689 |
| CONF | 920 → 1,268 / 3,366 (27.3 → 37.7%) | +215 to +478 | 14.3 → 14.5 | 797 → 1,063 / 1,370 (58.2 → 77.6%) | +169 to +369 | 345 → 426 / 1,188 (29.0 → 35.9%) | 257 → 352 / 486 |

LaLiga for comparison (same harness, Sofix v1 as live): 37.95% / 37.4% starters, 76.3% / 74.9% substitutes.

## Conclusions

- **Shipped** (C9) for all six: Sofix v1's trees refitted per competition on 2023/24 to 10 Nov 2026, his games in that
  competition over 70 days, the starter's point from trees fitted on ordinary games; the expected score and the decisive
  chance still come from the full trees. Version `Sofix v1 <code>`, so the Audit keeps each apart; the Audit's xScore card
  switches between the competitions. The live job uses a competition's model only where its board gives the game's numbers
  and the lock is after the model's `trainedThrough`; otherwise the earlier formula, as before.
- **Ligue 1, Conference and PL reach LaLiga's level** (37-39% on 2025/26); Bundesliga and EL are a point below; **CL stays
  lowest (34-35%)**: none of history scope, window, pooling or shape moved it beyond noise.
- The typical miss grows a little (most 0.3-1.2 points): the point aims at landing within 7, not at the smallest average
  error, exactly as for LaLiga.
- Fitting on ordinary games only is the one idea that helped everywhere (C5/C9 against C3: +22 to +84 starters per
  competition in 2025/26). It is not shipped for LaLiga here (that needs its own frozen v1.1, [laliga-accuracy-evidence.md](laliga-accuracy-evidence.md) option B).

## Limits

- Retrospective replays: 2025/26 was examined to choose among C3-C9 (all close), so the live record is the real test; the
  Audit counts each version's settled pre-lock forecasts from the first lock after 13 Nov.
- The cups' goals model is rebuilt from Sorare's final scores (extra time counted) with no neutral venues; the board reads
  UEFA's regulation scores and venues. About 2% of cup games went to extra time.
- The research lock is approximated (Tuesday or Friday 14:00 UTC); the live job uses Sorare's real lock.
- Rebuilding needs the git-ignored game files and the pinned scikit-learn 1.7.2 package folder (the one Sofix v1 used):
  `PYTHONPATH=<formula-packages>;. .venv/Scripts/python -m app.research.sofix_v1_competitions PL BL1 FL1 CL EL CONF`.

## Next

1. From about 18-25 Nov, read each version's live counts on the Audit card; 100 settled starts per competition is the floor.
2. CL: the one competition under 35%. Untried: domestic fixture outlook for the cup game's sides, and bookmakers' prices
   (recorded for LaLiga only so far).
3. LaLiga v1.1 with the ordinary-games point (+88 / +18 here), as its own frozen version.
