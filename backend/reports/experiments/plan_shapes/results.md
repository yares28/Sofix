# Which picture of a player's score makes the most accurate plan? (18 Nov 2026)

Replay: 6,754 LaLiga starts, Jan-Oct 2026, every model fitted only on earlier games (`extract.py`). Lower is better for CRPS
(how far the whole predicted picture sits from the real score).

| Picture of a starter's score | CRPS | Chance of 50+ (real 40.5%) | 70+ (real 13.8%) | 80+ (real 6.3%) |
|---|---|---|---|---|
| Before: bell around v1, spread 17.6 | 9.783 | 48.2% | 12.6% | 4.5% |
| Bell around v3 | 10.320 | 35.1% | 6.9% | 2.2% |
| v1's distribution | 9.675 | 41.0% | 14.2% | 6.0% |
| v0's normal and decisive scores | 9.701 | 44.3% | 16.6% | 8.2% |
| **Half v1's distribution, half v0's two scores** | **9.643** | 42.7% | 15.4% | 7.1% |

Average score, squared error: v1 302.64, v0 301.52, the two averaged 300.76.

## Lineups (`lineups.py`, 1,200 pools of 30 starters, seeds 7, 11, 23, through `planner._draw`)

Each method picks the five most likely to clear a target. Said = its own chance, real = how often that lineup cleared it.

| Target | Before: said -> real | Now: said -> real | Real rate, now minus before |
|---|---|---|---|
| 300 | 65.3 -> 66.6 | 65.3 -> 68.5 | +1.9 |
| 340 | 33.7 -> 37.9 | 37.1 -> 39.6 | +1.6 |
| 380 | 10.9 -> 17.0 | 15.2 -> 15.8 | -1.1 |
| 420 | 2.1 -> 3.8 | 4.3 -> 3.9 | +0.1 |
| 460 | 0.3 -> 0.5 | 0.8 -> 0.6 | +0.1 |

Points of the picked lineup: +3.5 on average (324 before), positive in both halves of the weeks and on all three seeds. The real-rate
changes are inside the noise (about 2 points either way at 1,200 pools): the proven gains are the honest chances and the points.
v3 as the plan's number: chances far too low (30% said, 64% real at 300), 5 points fewer, worse at 380 and 420.

Not covered: everyone in a pool started (no start risk), no bench, flat card bonus, LaLiga only. The other competitions keep the bell
until their shapes are replayed the same way.

## Candidate changes replayed on eight real gameweeks (GW21-29, four searches each)

Rebuilt from each frozen plan, judged on real scores and real cutoffs; bell-curve forecasts, because those weeks saved no distributions.
Reward counts each lineup up to 500 essence, so one 90,000-essence-equivalent win cannot decide it.

| Candidate | Paid lineups a week | Reward a week | Lineup points | Error of stated chances |
|---|---|---|---|---|
| Today | 1.41 | 291 | 322.4 | 0.177 |
| Bench ranked by reward | 1.44 | 298 | 324.0 | 0.180 |
| Bench first, lineups over 2% | 1.41 | 305 | 327.3 | 0.184 |
| Bench first, lineups over 5% | 1.25 | 286 | 326.3 | 0.171 |
| Start chance capped at 93% | 1.38 | 245 | 322.4 | 0.194 |
| Start chance capped at 90% | 1.44 | 347 | 326.9 | 0.195 |
| Uncertain cutoffs | 1.62 | 453 | 320.1 | 0.190 |
| Recent cutoffs | 1.81 | 375 | 326.5 | 0.230 |
| Recent + uncertain cutoffs | 1.59 | 378 | 322.0 | 0.177 |

No candidate is proven. The two uncertain-cutoff versions are tracked live (`cutoffTests`); proving a gain of 0.2 paid lineups a week takes about
30 gameweeks. Recent cutoffs alone won more while estimating the cutoffs worse (30.9 points off against 22.3), so that gain is treated as luck.
