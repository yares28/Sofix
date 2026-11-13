# FIVE CLEAREST FINDINGS (starters; 4,158 misses of 6,754; hits 2,596). Hindsight numbers are cheating, diagnostics only.

1. The coin: 1,547 starts (22.9%) had a decisive level change and only 21 of them hit (0.4% positive, 6.7% negative). They hold 1,526 of the 4,158 misses (36.7%). Knowing the level in advance would give +808 hits (a1: 2,596 -> 3,404, 50.4%); level plus goals conceded: +941 (52.4%). Positive decisive is 1,307 starts (FWD 31% of FWD starts, GK 24%, MID 15%, DEF 13%); the point forecast ignores it, as intended.
2. Ordinary games still miss half the time (2,632 of 5,207 ordinary starts): the AA error is wide (p10 -19.5, p90 +10.2, sd 12.0) and skewed: 1,768 misses are real above prediction vs 864 predicted too high. Mean error -3.6 (the forecast sits ~3.6 below ordinary reality, partly because the coin mass pulls the mode window the other way for the ordinary games).
3. Defenders: 783/2,013 ordinary hits (38.9%) vs FWD 62.8%, MID 53.1%, GK 47.3%. DEF hit 18.8% (90/478) when his side conceded 0 (bias -17.6): clean sheet gives +10 AA and the model gave 41.3 average when real was 63.0. Knowing goals conceded lifts DEF clean-sheet games from 91 to 197 hits (+106), and +113 overall (that is the whole c1 gain; GK +18, MID +5, FWD 0).
4. Minutes: hit rate falls with minutes (90+: 42.4% ordinary; <60: 62-65%) and bias goes from +4.2 (<46 min) to -5.7 (90+): the model is too low for full-90 players, too high for early exits. But knowing minutes only adds +47 hits (b1), so it is not recoverable value: the 90+ AA is just wide.
5. Defensive action points are what separate misses from hits for DEF/MID (tackles/interceptions/clearances/blocks: DEF 11.4 pts when real above prediction vs 7.9 in hits vs 5.5 when predicted too high; MID 8.8/4.2/2.0; passing and duels follow). No single group dominates, it is the individual's game-level activity, which only his own past can proxy (player median 2026 known: +232 hits, DEF +127).
No sign of a clubs/home/away/month/past-starts effect after noise: hit rates 46-52% across all those cells; club ranks do not persist (Spearman Jan-May vs Aug-Oct 0.15 as team, -0.16 as opponent). Barcelona/Real Madrid/Atletico starters are lowest (28-33%, bias -11 to -13: their players score above the model) but the gap shrinks to unreliable halves.

# Where do the starter misses happen? (Sofix v1 replay, Jan-Oct 2026, LaLiga)

Replay check: starters 6754 cases, 2596 hits (38.44%); substitutes 2925, 2176 hits (74.39%). Matches the reference counts (2596 / 2176).
Error = prediction minus real score (positive = predicted too high). Decisive: negative = level points < 35, none = 35, positive = >35. 'Ordinary' = decisive level points exactly 35 (a decisive action may still have cancelled out). AA = score minus level points.
Total starter misses: 4158.

## 1. Starters: position x decisive outcome

**hit rate**

| pos | dec | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|---|
| DEF | negative | 143.00 | 11.00 | 7.69 | 132.00 | 22.38 |
| DEF | none | 2013.00 | 783.00 | 38.90 | 1230.00 | -5.60 |
| DEF | positive | 311.00 | 0.00 | 0.00 | 311.00 | -35.74 |
| FWD | negative | 18.00 | 0.00 | 0.00 | 18.00 | 20.18 |
| FWD | none | 1242.00 | 780.00 | 62.80 | 462.00 | -0.45 |
| FWD | positive | 566.00 | 4.00 | 0.71 | 562.00 | -31.65 |
| GK | negative | 35.00 | 0.00 | 0.00 | 35.00 | 22.73 |
| GK | none | 429.00 | 203.00 | 47.32 | 226.00 | -1.70 |
| GK | positive | 150.00 | 1.00 | 0.67 | 149.00 | -33.43 |
| MID | negative | 44.00 | 5.00 | 11.36 | 39.00 | 19.92 |
| MID | none | 1523.00 | 809.00 | 53.12 | 714.00 | -3.95 |
| MID | positive | 280.00 | 0.00 | 0.00 | 280.00 | -34.24 |

**by decisive outcome only**

| dec | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|
| negative | 240.00 | 16.00 | 6.67 | 224.00 | 21.81 |
| none | 5207.00 | 2575.00 | 49.45 | 2632.00 | -3.57 |
| positive | 1307.00 | 5.00 | 0.38 | 1302.00 | -33.38 |

**by position only**

| pos | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|
| DEF | 2467.00 | 794.00 | 32.18 | 1673.00 | -7.78 |
| FWD | 1826.00 | 784.00 | 42.94 | 1042.00 | -9.92 |
| GK | 614.00 | 204.00 | 33.22 | 410.00 | -8.06 |
| MID | 1847.00 | 814.00 | 44.07 | 1033.00 | -7.98 |

Misses with a decisive level change ('the coin'): 1526 of 4158 misses (36.7%), from 1547 cases (22.9% of starts). Ordinary games: 2632 misses from 5207 cases.
Ordinary-game misses: too high (pred>real) 864, too low 1768.

**model decisive chance vs reality**

| pos | mean p_dec (model) | real decisive>35 share | real level<35 share |
|---|---|---|---|
| DEF | 0.18 | 0.13 | 0.06 |
| FWD | 0.21 | 0.31 | 0.01 |
| GK | 0.18 | 0.24 | 0.06 |
| MID | 0.18 | 0.15 | 0.02 |

## 2. Starters, ordinary games only (level points 35)
n=5207, hits 2575 (49.45%), misses 2632.
Error in AA points (pred - real), percentiles: p5=-25.4, p10=-19.5, p25=-10.5, p50=-2.2, p75=4.4, p90=10.2, p95=14.0; mean -3.57, sd 11.98, MAE 9.39.
Share of ordinary cases by |error| band: 0-3.5: 1376, 3.5-7.0001: 1199, 7.0001-10: 708, 10-15: 871, 15-25: 757, 25-200: 296

**by minutes played**

| mband | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|
| <46 | 294.00 | 190.00 | 64.63 | 104.00 | 4.24 |
| 46-59 | 269.00 | 165.00 | 61.34 | 104.00 | 1.18 |
| 60-75 | 1006.00 | 606.00 | 60.24 | 400.00 | -1.05 |
| 76-89 | 747.00 | 387.00 | 51.81 | 360.00 | -3.68 |
| 90+ | 2891.00 | 1227.00 | 42.44 | 1664.00 | -5.65 |

**by past starts in the 70-day window**

| sband | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|
| 0 | 532.00 | 261.00 | 49.06 | 271.00 | -4.23 |
| 1-2 | 944.00 | 487.00 | 51.59 | 457.00 | -3.14 |
| 3-5 | 1467.00 | 713.00 | 48.60 | 754.00 | -3.17 |
| 6+ | 2264.00 | 1114.00 | 49.20 | 1150.00 | -3.85 |

**home (True) / away**

| home | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|
| False | 2678.00 | 1328.00 | 49.59 | 1350.00 | -3.38 |
| True | 2529.00 | 1247.00 | 49.31 | 1282.00 | -3.77 |

**by goals conceded (3 = 3+), GK and DEF**

| pos | conc | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|---|
| DEF | 0 | 478.00 | 90.00 | 18.83 | 388.00 | -17.64 |
| DEF | 1 | 760.00 | 344.00 | 45.26 | 416.00 | -4.59 |
| DEF | 2 | 449.00 | 205.00 | 45.66 | 244.00 | -0.83 |
| DEF | 3 | 326.00 | 144.00 | 44.17 | 182.00 | 3.11 |
| GK | 1 | 213.00 | 107.00 | 50.23 | 106.00 | -4.29 |
| GK | 2 | 132.00 | 59.00 | 44.70 | 73.00 | -1.46 |
| GK | 3 | 84.00 | 37.00 | 44.05 | 47.00 | 4.53 |

**by team strength (xGF - xGA quartile)**

| sstr | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|
| weakest | 1304.00 | 648.00 | 49.69 | 656.00 | -2.95 |
| q2 | 1306.00 | 664.00 | 50.84 | 642.00 | -3.54 |
| q3 | 1298.00 | 659.00 | 50.77 | 639.00 | -3.42 |
| strongest | 1299.00 | 604.00 | 46.50 | 695.00 | -4.36 |

**by month**

| month | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|
| 1.00 | 737.00 | 380.00 | 51.56 | 357.00 | -3.41 |
| 2.00 | 674.00 | 325.00 | 48.22 | 349.00 | -2.82 |
| 3.00 | 603.00 | 302.00 | 50.08 | 301.00 | -3.59 |
| 4.00 | 685.00 | 328.00 | 47.88 | 357.00 | -3.52 |
| 5.00 | 857.00 | 439.00 | 51.23 | 418.00 | -3.62 |
| 8.00 | 505.00 | 245.00 | 48.51 | 260.00 | -4.23 |
| 9.00 | 661.00 | 321.00 | 48.56 | 340.00 | -3.54 |
| 10.00 | 485.00 | 235.00 | 48.45 | 250.00 | -4.16 |

**by position**

| pos | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|
| DEF | 2013.00 | 783.00 | 38.90 | 1230.00 | -5.60 |
| FWD | 1242.00 | 780.00 | 62.80 | 462.00 | -0.45 |
| GK | 429.00 | 203.00 | 47.32 | 226.00 | -1.70 |
| MID | 1523.00 | 809.00 | 53.12 | 714.00 | -3.95 |

**position x minutes**

| pos | mband | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|---|
| DEF | <46 | 106.00 | 56.00 | 52.83 | 50.00 | 5.45 |
| DEF | 46-59 | 45.00 | 20.00 | 44.44 | 25.00 | 3.56 |
| DEF | 60-75 | 191.00 | 78.00 | 40.84 | 113.00 | -2.92 |
| DEF | 76-89 | 207.00 | 89.00 | 43.00 | 118.00 | -4.22 |
| DEF | 90+ | 1464.00 | 540.00 | 36.89 | 924.00 | -7.23 |
| FWD | <46 | 90.00 | 73.00 | 81.11 | 17.00 | 3.50 |
| FWD | 46-59 | 112.00 | 79.00 | 70.54 | 33.00 | 0.55 |
| FWD | 60-75 | 415.00 | 279.00 | 67.23 | 136.00 | 0.51 |
| FWD | 76-89 | 248.00 | 153.00 | 61.69 | 95.00 | -1.58 |
| FWD | 90+ | 377.00 | 196.00 | 51.99 | 181.00 | -2.00 |
| GK | <46 | 1.00 | 0.00 | 0.00 | 1.00 | 32.80 |
| GK | 90+ | 428.00 | 203.00 | 47.43 | 225.00 | -1.78 |
| MID | <46 | 97.00 | 61.00 | 62.89 | 36.00 | 3.32 |
| MID | 46-59 | 112.00 | 66.00 | 58.93 | 46.00 | 0.87 |
| MID | 60-75 | 400.00 | 249.00 | 62.25 | 151.00 | -1.79 |
| MID | 76-89 | 292.00 | 145.00 | 49.66 | 147.00 | -5.07 |
| MID | 90+ | 622.00 | 288.00 | 46.30 | 334.00 | -6.82 |

Mean (pred-real) is bias; |bias| > ~1.5 with n>150 is notable.

## 3. AA stat groups, DEF and MID, ordinary starters

**DEF** (n=2013; hits 783, misses too-high 372, too-low 858)
| group | mean pts hit | mean pts, misses where pred too high | mean pts, misses where real above pred | sd hit | sd miss | share of AA var hit | share of AA var miss | corr with error (all) |
|---|---|---|---|---|---|---|---|---|---|
| duels | -1.11 | -4.53 (pred too high, n=372) | 2.05 (real above pred, n=858) | 3.68 | 5.18 | 0.10 | 0.19 | 0.58 |
| defbonus | 0.45 | 0.08 (pred too high, n=372) | 2.10 (real above pred, n=858) | 1.28 | 2.31 | 0.03 | 0.07 | 0.52 |
| cs_conceded | -4.67 | -7.58 (pred too high, n=372) | 1.55 (real above pred, n=858) | 6.16 | 8.61 | 0.38 | 0.29 | 0.53 |
| passing | 3.37 | 0.86 (pred too high, n=372) | 5.84 (real above pred, n=858) | 5.34 | 6.28 | 0.30 | 0.17 | 0.36 |
| defensive | 7.94 | 5.49 (pred too high, n=372) | 11.39 (real above pred, n=858) | 4.36 | 5.57 | 0.07 | 0.17 | 0.51 |
| attacking | 2.41 | 1.89 (pred too high, n=372) | 3.40 (real above pred, n=858) | 3.08 | 3.89 | 0.07 | 0.05 | 0.20 |
| discipline_errors | -2.88 | -4.74 (pred too high, n=372) | -2.05 (real above pred, n=858) | 2.84 | 3.01 | 0.04 | 0.07 | 0.32 |
| other | -0.00 | -0.00 (pred too high, n=372) | 0.00 (real above pred, n=858) | 0.00 | 0.00 | 0.00 | 0.00 | 0.09 |
| (total AA) | 5.51 | -8.50 | 24.26 | 5.46 | 17.63 | 1 | 1 | |
Column 3 = predicted too high, column 4 = real above prediction; group means are real points. Mean model expectation of AA (pred-35) in hits 5.3, in misses 5.3.

**MID** (n=1523; hits 809, misses too-high 197, too-low 517)
| group | mean pts hit | mean pts, misses where pred too high | mean pts, misses where real above pred | sd hit | sd miss | share of AA var hit | share of AA var miss | corr with error (all) |
|---|---|---|---|---|---|---|---|---|---|
| duels | -0.40 | -2.29 (pred too high, n=197) | 1.51 (real above pred, n=517) | 1.95 | 2.74 | 0.12 | 0.13 | 0.58 |
| defbonus | 0.14 | 0.00 (pred too high, n=197) | 2.21 (real above pred, n=517) | 0.75 | 2.34 | 0.04 | 0.10 | 0.61 |
| cs_conceded | -2.27 | -3.01 (pred too high, n=197) | -2.18 (real above pred, n=517) | 2.09 | 2.21 | 0.09 | 0.03 | 0.11 |
| passing | 1.93 | -0.90 (pred too high, n=197) | 5.25 (real above pred, n=517) | 3.74 | 5.28 | 0.33 | 0.24 | 0.51 |
| defensive | 4.15 | 1.98 (pred too high, n=197) | 8.82 (real above pred, n=517) | 3.26 | 5.39 | 0.17 | 0.25 | 0.63 |
| attacking | 3.88 | 2.03 (pred too high, n=197) | 6.94 (real above pred, n=517) | 3.23 | 5.38 | 0.21 | 0.19 | 0.45 |
| discipline_errors | -1.78 | -3.21 (pred too high, n=197) | -1.41 (real above pred, n=517) | 1.90 | 2.08 | 0.05 | 0.06 | 0.25 |
| other | -0.00 | -0.00 (pred too high, n=197) | 0.00 (real above pred, n=517) | 0.00 | 0.00 | 0.00 | 0.00 | -0.00 |
| (total AA) | 5.65 | -5.40 | 21.13 | 4.70 | 13.81 | 1 | 1 | |
Column 3 = predicted too high, column 4 = real above prediction; group means are real points. Mean model expectation of AA (pred-35) in hits 5.4, in misses 5.7.

## 4. Hindsight ceilings (CHEATING, diagnostics only: use facts unknown before lock)
| variant | n | hits | hit% | baseline hits | gain |
|---|---|---|---|---|---|
| (a1) level known: pred + (level-35), positive-level floor | 6754 | 3404 | 50.40 | 2596 | 808 |
| (a2) level known: model plain-expectation + (level-35), floor | 6754 | 3346 | 49.54 | 2596 | 750 |
| (b1) minutes known: 35+(pred-35)*mins/usual | 6754 | 2643 | 39.13 | 2596 | 47 |
| (b2) minutes known: 35+(plain-35)*mins/usual | 6754 | 2556 | 37.84 | 2596 | -40 |
| (c1) goals conceded known: pred + (conceded & DEF clean-sheet pts - expected) | 6754 | 2709 | 40.11 | 2596 | 113 |
| (c2) as c1 + GK clean sheet (+25 level) known | 6754 | 2690 | 39.83 | 2596 | 94 |
| (a1+b1) level and minutes known | 6754 | 3417 | 50.59 | 2596 | 821 |
| (a1+c1) level and goals conceded known | 6754 | 3537 | 52.37 | 2596 | 941 |
| (d) player's whole-2026 median starter score known (incl. this game) | 6754 | 2828 | 41.87 | 2596 | 232 |
| variant (ordinary only) | n | hits | hit% | baseline |
|---|---|---|---|---|
| (b1) minutes | 5207 | 2622 | 50.36 | 2575 |
| (b2) plain-expectation + minutes | 5207 | 2547 | 48.91 | 2575 |
| (plain expectation only, no hindsight) | 5207 | 2495 | 47.92 | 2575 |
| (c1) conceded | 5207 | 2677 | 51.41 | 2575 |

**(d) by position**

| pos | n | hits_baseline | hits_median |
|---|---|---|---|
| DEF | 2467 | 794 | 921 |
| FWD | 1826 | 784 | 807 |
| GK | 614 | 204 | 223 |
| MID | 1847 | 814 | 877 |

## 5. Clubs and opponents (starters, >=150 starts)

**lowest 10 by team (of 20 with >=150 starts)**

| team | n | hits | hit% | misses | mean(pred-real) | JanMay hit% | JanMay n | AugOct hit% | AugOct n |
|---|---|---|---|---|---|---|---|---|---|
| barcelona-barcelona | 330.00 | 93.00 | 28.18 | 237.00 | -13.17 | 31.82 | 220 | 20.91 | 110.00 |
| real-madrid-madrid | 330.00 | 106.00 | 32.12 | 224.00 | -12.42 | 32.73 | 220 | 30.91 | 110.00 |
| atletico-madrid-madrid | 330.00 | 109.00 | 33.03 | 221.00 | -11.37 | 36.36 | 220 | 26.36 | 110.00 |
| real-betis-sevilla | 341.00 | 119.00 | 34.90 | 222.00 | -11.51 | 37.66 | 231 | 29.09 | 110.00 |
| girona-girona | 231.00 | 84.00 | 36.36 | 147.00 | -10.88 | 36.36 | 231 | nan | nan |
| celta-de-vigo-vigo | 341.00 | 126.00 | 36.95 | 215.00 | -8.55 | 38.10 | 231 | 34.55 | 110.00 |
| villarreal-villarreal | 352.00 | 133.00 | 37.78 | 219.00 | -7.98 | 36.78 | 242 | 40.00 | 110.00 |
| elche-elche | 341.00 | 129.00 | 37.83 | 212.00 | -8.85 | 39.39 | 231 | 34.55 | 110.00 |
| valencia-valencia | 341.00 | 132.00 | 38.71 | 209.00 | -7.15 | 37.23 | 231 | 41.82 | 110.00 |
| real-sociedad-donostia-san-sebastian | 341.00 | 133.00 | 39.00 | 208.00 | -8.81 | 37.23 | 231 | 42.73 | 110.00 |

**highest 10 by team**

| team | n | hits | hit% | misses | mean(pred-real) | JanMay hit% | JanMay n | AugOct hit% | AugOct n |
|---|---|---|---|---|---|---|---|---|---|
| levante-valencia | 352.00 | 139.00 | 39.49 | 213.00 | -8.37 | 38.84 | 242 | 40.91 | 110.00 |
| getafe-getafe-madrid | 341.00 | 135.00 | 39.59 | 206.00 | -5.38 | 35.50 | 231 | 48.18 | 110.00 |
| athletic-club-bilbao | 319.00 | 127.00 | 39.81 | 192.00 | -8.03 | 45.91 | 220 | 26.26 | 99.00 |
| sevilla-sevilla-1890 | 330.00 | 132.00 | 40.00 | 198.00 | -6.73 | 38.53 | 231 | 43.43 | 99.00 |
| espanyol-barcelona | 341.00 | 137.00 | 40.18 | 204.00 | -5.64 | 41.56 | 231 | 37.27 | 110.00 |
| real-oviedo-oviedo | 231.00 | 93.00 | 40.26 | 138.00 | -7.28 | 40.26 | 231 | nan | nan |
| rayo-vallecano-madrid | 330.00 | 135.00 | 40.91 | 195.00 | -8.71 | 38.96 | 231 | 45.45 | 99.00 |
| mallorca-palma-de-mallorca | 231.00 | 96.00 | 41.56 | 135.00 | -7.36 | 41.56 | 231 | nan | nan |
| deportivo-alaves-vitoria-gasteiz | 341.00 | 149.00 | 43.70 | 192.00 | -7.38 | 43.29 | 231 | 44.55 | 110.00 |
| osasuna-pamplona-irunea | 330.00 | 151.00 | 45.76 | 179.00 | -4.75 | 48.48 | 231 | 39.39 | 99.00 |

team: Spearman rank correlation of Jan-May vs Aug-Oct hit rate over 17 clubs = 0.15. Spread of overall hit% (sd) = 4.0; binomial noise sd at n~321 = 2.7.
Mean(pred-real) of the 5 lowest clubs: -11.87; of the 5 highest: -7.10.

**lowest 10 by opp (of 20 with >=150 starts)**

| opp | n | hits | hit% | misses | mean(pred-real) | JanMay hit% | JanMay n | AugOct hit% | AugOct n |
|---|---|---|---|---|---|---|---|---|---|
| real-oviedo-oviedo | 231.00 | 76.00 | 32.90 | 155.00 | -8.76 | 32.90 | 231 | nan | nan |
| levante-valencia | 352.00 | 124.00 | 35.23 | 228.00 | -7.61 | 34.71 | 242 | 36.36 | 110.00 |
| espanyol-barcelona | 341.00 | 121.00 | 35.48 | 220.00 | -10.32 | 33.77 | 231 | 39.09 | 110.00 |
| atletico-madrid-madrid | 330.00 | 119.00 | 36.06 | 211.00 | -9.91 | 30.45 | 220 | 47.27 | 110.00 |
| elche-elche | 341.00 | 123.00 | 36.07 | 218.00 | -8.53 | 38.10 | 231 | 31.82 | 110.00 |
| osasuna-pamplona-irunea | 330.00 | 120.00 | 36.36 | 210.00 | -10.60 | 36.80 | 231 | 35.35 | 99.00 |
| real-sociedad-donostia-san-sebastian | 341.00 | 124.00 | 36.36 | 217.00 | -8.14 | 38.53 | 231 | 31.82 | 110.00 |
| villarreal-villarreal | 352.00 | 130.00 | 36.93 | 222.00 | -10.30 | 35.12 | 242 | 40.91 | 110.00 |
| sevilla-sevilla-1890 | 330.00 | 127.00 | 38.48 | 203.00 | -7.88 | 37.66 | 231 | 40.40 | 99.00 |
| athletic-club-bilbao | 319.00 | 123.00 | 38.56 | 196.00 | -10.05 | 41.36 | 220 | 32.32 | 99.00 |

**highest 10 by opp**

| opp | n | hits | hit% | misses | mean(pred-real) | JanMay hit% | JanMay n | AugOct hit% | AugOct n |
|---|---|---|---|---|---|---|---|---|---|
| real-betis-sevilla | 341.00 | 132.00 | 38.71 | 209.00 | -8.44 | 40.69 | 231 | 34.55 | 110.00 |
| rayo-vallecano-madrid | 330.00 | 131.00 | 39.70 | 199.00 | -6.28 | 42.86 | 231 | 32.32 | 99.00 |
| deportivo-alaves-vitoria-gasteiz | 341.00 | 136.00 | 39.88 | 205.00 | -9.36 | 39.83 | 231 | 40.00 | 110.00 |
| barcelona-barcelona | 330.00 | 133.00 | 40.30 | 197.00 | -2.19 | 40.00 | 220 | 40.91 | 110.00 |
| mallorca-palma-de-mallorca | 231.00 | 94.00 | 40.69 | 137.00 | -7.80 | 40.69 | 231 | nan | nan |
| getafe-getafe-madrid | 341.00 | 141.00 | 41.35 | 200.00 | -8.10 | 44.16 | 231 | 35.45 | 110.00 |
| celta-de-vigo-vigo | 341.00 | 142.00 | 41.64 | 199.00 | -8.71 | 42.42 | 231 | 40.00 | 110.00 |
| real-madrid-madrid | 330.00 | 139.00 | 42.12 | 191.00 | -6.84 | 39.55 | 220 | 47.27 | 110.00 |
| girona-girona | 231.00 | 99.00 | 42.86 | 132.00 | -7.35 | 42.86 | 231 | nan | nan |
| valencia-valencia | 341.00 | 150.00 | 43.99 | 191.00 | -8.59 | 44.59 | 231 | 42.73 | 110.00 |

opp: Spearman rank correlation of Jan-May vs Aug-Oct hit rate over 17 clubs = -0.16. Spread of overall hit% (sd) = 3.0; binomial noise sd at n~321 = 2.7.
Mean(pred-real) of the 5 lowest clubs: -9.02; of the 5 highest: -7.92.

## 6. Substitutes (brief)

**position x decisive**

| pos | dec | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|---|
| DEF | negative | 7.00 | 0.00 | 0.00 | 7.00 | 26.65 |
| DEF | none | 659.00 | 473.00 | 71.78 | 186.00 | -0.51 |
| DEF | positive | 33.00 | 0.00 | 0.00 | 33.00 | -30.29 |
| FWD | negative | 15.00 | 0.00 | 0.00 | 15.00 | 20.89 |
| FWD | none | 1093.00 | 995.00 | 91.03 | 98.00 | 0.17 |
| FWD | positive | 166.00 | 0.00 | 0.00 | 166.00 | -29.22 |
| GK | negative | 1.00 | 0.00 | 0.00 | 1.00 | 27.50 |
| GK | none | 2.00 | 1.00 | 50.00 | 1.00 | -5.60 |
| MID | negative | 15.00 | 0.00 | 0.00 | 15.00 | 19.67 |
| MID | none | 852.00 | 707.00 | 82.98 | 145.00 | -0.80 |
| MID | positive | 82.00 | 0.00 | 0.00 | 82.00 | -31.55 |

**decisive only**

| dec | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|
| negative | 38.00 | 0.00 | 0.00 | 38.00 | 21.64 |
| none | 2606.00 | 2176.00 | 83.50 | 430.00 | -0.32 |
| positive | 281.00 | 0.00 | 0.00 | 281.00 | -30.03 |
Ordinary subs: n=2606, hits 2176 (83.5%). AA error pctl: p5=-10.8, p25=-3.2, p50=0.4, p75=3.1, p95=7.6

**by minutes**

| mband | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|
| <46 | 2556.00 | 2154.00 | 84.27 | 402.00 | -0.23 |
| 46-59 | 22.00 | 11.00 | 50.00 | 11.00 | -1.76 |
| 60-75 | 20.00 | 7.00 | 35.00 | 13.00 | -6.59 |
| 76-89 | 8.00 | 4.00 | 50.00 | 4.00 | -8.78 |

**home/away**

| home | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|
| False | 1310.00 | 1113.00 | 84.96 | 197.00 | -0.04 |
| True | 1296.00 | 1063.00 | 82.02 | 233.00 | -0.61 |

**by past starts**

| sband | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|
| 0 | 877.00 | 757.00 | 86.32 | 120.00 | 0.24 |
| 1-2 | 659.00 | 541.00 | 82.09 | 118.00 | -0.39 |
| 3-5 | 669.00 | 551.00 | 82.36 | 118.00 | -0.62 |
| 6+ | 401.00 | 327.00 | 81.55 | 74.00 | -0.93 |

**by position**

| pos | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|
| DEF | 659.00 | 473.00 | 71.78 | 186.00 | -0.51 |
| FWD | 1093.00 | 995.00 | 91.03 | 98.00 | 0.17 |
| GK | 2.00 | 1.00 | 50.00 | 1.00 | -5.60 |
| MID | 852.00 | 707.00 | 82.98 | 145.00 | -0.80 |

**by month**

| month | n | hits | hit% | misses | mean(pred-real) |
|---|---|---|---|---|---|
| 1.00 | 349.00 | 293.00 | 83.95 | 56.00 | 0.20 |
| 2.00 | 343.00 | 293.00 | 85.42 | 50.00 | 0.23 |
| 3.00 | 303.00 | 254.00 | 83.83 | 49.00 | -0.24 |
| 4.00 | 341.00 | 277.00 | 81.23 | 64.00 | -0.57 |
| 5.00 | 416.00 | 348.00 | 83.65 | 68.00 | -0.31 |
| 8.00 | 263.00 | 231.00 | 87.83 | 32.00 | -0.44 |
| 9.00 | 338.00 | 273.00 | 80.77 | 65.00 | -1.16 |
| 10.00 | 253.00 | 207.00 | 81.82 | 46.00 | -0.33 |
Sub misses: 749; with decisive change 319.

## Concentration of starter misses
| index | misses |
|---|---|
| decisive happened (coin) | 1526 |
| ordinary, <60 min | 208 |
| ordinary, 60+ min, predicted too high | 713 |
| ordinary, 60+ min, real above prediction | 1711 |


## Addendum: hindsight hits by position (starters)

        n  base    a1   c1  a1_c1
pos                              
DEF  2467   794   977  884   1077
FWD  1826   784  1165  784   1165
GK    614   204   297  222    324
MID  1847   814   965  819    971

DEF by goals conceded (3=3+): baseline vs c1

      n  base   c1
ga                
0   547    91  197
1   928   348  348
2   569   209  185
3   423   146  154

DEF mean model prediction when his side kept a clean sheet (60+ min) vs conceded: 41.3 vs 40.0; mean real score 63.0 vs 44.2; mean model cs chance 0.29, real clean-sheet share 0.22
