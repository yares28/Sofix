# How accurate is the LaLiga number on the real pre-lock record

Script: SCRATCH/live_record.py (raw output at the end of this file). Read-only, local blocks only.
"within-7" = |forecast - real score| <= 7, same rule as versus.py (CLOSE = 7). Starters: Sofix = game.sofix; subs: game.sofixOn (falls back to sofix); Sorare = game.sorare.

## 1. audit.json payload.versus (production database, 11 records, 4 settled; weeks 21-29), LaLiga starts

| scope | cases | Sofix within-7 | Sofix mean miss | Sofix lean | Sorare within-7 | Sorare mean miss | Sorare lean | Sofix closer |
|---|---|---|---|---|---|---|---|---|
| All starts | 4147 | 29.2% | 14.03 | -0.20 | 32.5% | 13.89 | -1.94 | 47.5% |
| GK | 375 | 24.5% | 16.13 | -2.65 | 23.2% | 16.11 | -0.91 | 51.6% |
| DEF | 1517 | 30.6% | 14.82 | -0.96 | 30.9% | 14.97 | -1.83 | 49.7% |
| MID | 1373 | 33.1% | 12.83 | -0.02 | 35.9% | 12.77 | -2.71 | 46.9% |
| FWD | 882 | 22.7% | 13.67 | +1.87 | 33.8% | 12.83 | -1.40 | 43.1% |
| Substitutes (came on) | 1711 | 58.1% | 8.35 | +2.02 | 36.7% | 10.67 | +4.63 | 63.9% |

By GW (starts, Sofix / Sorare within-7): GW21 n=220: 24.1% / 27.3%; GW23 219: 30.1 / 33.3; GW24 22: 40.9 / 31.8; GW25 836: 29.3 / 32.8; GW27 835: 27.4 / 29.5; GW28 1179: 30.0 / 33.1; GW29 836: 30.4 / 35.4. GW24 has only 22 cases. (The block's "pair"/"pairs" fields are pair-ranking rates, not used here.)

## 2. Independent rebuild from the local blocks

What the local blocks can and cannot do:
- score_record:* blocks hold the pre-lock forecasts (every writtenAt is before its lock, checked) but NO results: 0 of 16,965 games carry `actual`, and `settledAt` is absent in all of them.
- Results exist locally only in audit_game_checks.json (the owner's players only, about 4 per game, 51 LaLiga game ids) and league_games:EUROPE.starts (starters' scores, European competitions only). sorare_league_history.json is a stale snapshot (every player read 2026-10-08, last LaLiga game 2026-10-12, PENDING) and gave 0 usable LaLiga results. audit.json playerScores holds the same owner-only rows (218 LaLiga starts).
- So the rebuild covers 337 of 3,118 LaLiga forecast games (10.8%), owner's players only. It is a small sample, not a replacement for the 4,147 in versus (the production database holds results for every player).
- Weeks with LaLiga forecasts and results: GW21, 23, 24, 25, 27, 29. Records for GW22, 26, 28 hold no LaLiga games; GW30 and GW31 are not played yet.
- `started` is null for 57 LaLiga played games (the code then treats the case as unusable). So LaLiga substitutes: 0 usable cases locally; see the exploratory table.

### LaLiga starters, rebuilt (n=221 paired; every one has by = sofix and a Sofix number)

| source | n | within-7 | mean abs miss | lean |
|---|---|---|---|---|
| Sofix | 221 | 24.4% (54) | 15.2 | -4.1 |
| Sorare | 221 | 25.8% (57) | 15.1 | -4.0 |

Lower than production (29.2% / 32.5%); the sample is small (about +/- 6 points at 95%) and covers the owner's players only.

| split | group | n | Sofix within-7 | Sorare within-7 | Sofix lean |
|---|---|---|---|---|---|
| position | GK | 35 | 25.7% | 22.9% | -8.2 |
| position | DEF | 78 | 19.2% | 20.5% | -5.8 |
| position | MID | 68 | 29.4% | 25.0% | -2.4 |
| position | FWD | 40 | 25.0% | 40.0% | -0.2 |
| GW | 21 | 38 | 18.4% | 23.7% | -6.7 |
| GW | 23 | 44 | 36.4% | 27.3% | -7.6 |
| GW | 24 | 6 | 33.3% | 33.3% | +0.9 |
| GW | 25 | 44 | 29.5% | 25.0% | -0.8 |
| GW | 27 | 45 | 15.6% | 22.2% | -1.5 |
| GW | 29 | 44 | 20.5% | 29.5% | -5.1 |
| venue | away | 61 | 23.0% | 29.5% | -3.8 |
| venue | home | 72 | 20.8% | 22.2% | -1.3 |
| venue | not recorded (older weeks) | 88 | 28.4% | 26.1% | -6.6 |
| game scoreSource | sofix | 44 | 20.5% | 29.5% | -5.1 |
| game scoreSource | not recorded (older weeks) | 177 | 25.4% | 24.9% | -3.9 |
| start source | futbolfantasy | 215 | 24.2% | 25.6% | -4.3 |
| start source | sorare | 6 | 33.3% | 33.3% | +0.9 |
| pStart | 0.8 and up | 147 | 27.9% | 24.5% | -4.5 |
| pStart | 0.3 to 0.6 | 67 | 16.4% | 28.4% | -4.4 |
| pStart | under 0.3 | 7 | 28.6% | 28.6% | +7.5 |
| past played games (stale history) | 0-2 | 9 | 33.3% | 22.2% | +1.4 |
| past played games | 3-5 | 54 | 31.5% | 27.8% | +1.6 |
| past played games | 6-9 | 137 | 21.9% | 27.0% | -5.8 |
| past played games | 10+ | 21 | 19.0% | 14.3% | -10.6 |
| real score band (diagnostic) | under 15 | 4 | 0.0% | 0.0% | +28.5 |
| real score band | 15-35 | 31 | 3.2% | 3.2% | +16.8 |
| real score band | 35-60 | 109 | 46.8% | 46.8% | +3.2 |
| real score band | 60+ | 77 | 2.6% | 6.5% | -24.6 |

Notes: "past played games" counts games in the stale history snapshot (8 Oct, all competitions), so it mostly tracks the week, not experience; no player with real "few games" signal. The score-band split uses the outcome, so it is a diagnostic, not a fair rate: it shows forecasts sit near 45 and miss both tails (big scores under-called by about 25, poor ones over-called by about 17). Most of the 221 (109) real scores fall in 35-60, where both sources hit 46.8%.

### Fell back or not
All 221 LaLiga starter cases have a Sofix number and a Sorare number. A per-game scoreSource is only recorded from about GW29 (44 cases, all sofix). No LaLiga game with sofix = None has a result locally, so a fallback rate cannot be calculated for LaLiga. (A forecast with sofix = None is excluded from versus entirely, so the audit does not show it either.)

### LaLiga substitutes, exploratory (played, started unknown, minutes under 46)

| number | n | within-7 | mean miss | lean |
|---|---|---|---|---|
| Sofix sofixOn | 46 | 80.4% | 5.3 | +1.4 |
| Sofix start number | 56 | 19.6% | 11.7 | +10.7 |
| Sorare | 56 | 33.9% | 9.8 | +8.4 |

Ten of the 57 sit at exactly 45 minutes (may be half-time changes), and 10 of the 56 have no sofixOn, so indicative only. It agrees with production (Sofix 58.1% vs Sorare 36.7% on 1,711 subs): the sub number sofixOn is much better than Sorare's single projection, which is a start-based number.

## 3. Other competitions, same weeks (results available locally)

| competition | n paired (starters) | Sofix within-7 | Sofix mean miss | Sofix lean | Sorare within-7 | Sorare mean miss | Sorare lean | rows with result but no Sofix number |
|---|---|---|---|---|---|---|---|---|
| LaLiga | 221 | 24.4% | 15.2 | -4.1 | 25.8% | 15.1 | -4.0 | 0 of 221 |
| Champions League | 391 | 26.9% | 14.9 | -0.9 | 30.4% | 15.3 | -2.0 | 111 of 502 |
| Europa League | 393 | 32.6% | 13.2 | +0.1 | 33.3% | 12.8 | -2.5 | 45 of 438 |
| Conference League | 395 | 30.6% | 14.2 | -0.7 | 35.4% | 13.9 | -3.7 | 22 of 417 |
| Bundesliga | 9 | 22.2% | 15.4 | -6.8 | 22.2% | 15.4 | -7.4 | 5 of 14 |
| Premier League | 3 | 0.0% | 17.8 | +17.8 | 66.7% | 12.8 | +12.8 | 1 of 4 |

European results come from league_games:EUROPE.starts (every starter of settled games, not only the owner's players), hence the larger n. Substitutes: no results for any competition. Premier League, Bundesliga, Ligue 1: league_games:PL|BL1|FL1 hold only game ids, dates and settled flags, no scores, so those leagues cannot be compared (PL 3, Bundesliga 9, Ligue 1 0 usable cases). Comparison caveat: the LaLiga sample is the owner's players only, the European one is everyone who started, so the gap (24% vs 27-33%) is partly a sample difference.

## 4. New LaLiga model ("Sofix v1", live 12 Nov 2026)
0 of 3,118 LaLiga forecast games in the local score_records carry modelVersion (nor sofixPoint, sofixOnPoint, startPoint, subPoint). scoreModels in the blocks lists only PL, BL1, FL1, CL, EL, CONF (xscore-v2/v3), no LaLiga key. The newest records were written 10 and 11 Nov, before go-live, and are unsettled. versus.model_versions would return nothing (audit.xscore has no models key). Settled forecasts with the new model: 0. Everything above is the previous formula. The versioned comparison can start only after a record written after 12 Nov is settled (27 h after the week's last game; GW31 locks 13 Nov, so about 18 Nov at the earliest).

# Raw output of the script

# Rebuild from local blocks

Usable settled rows (any comp): 1611; LaLiga: 221

LaLiga coverage per week (forecast games / result found / no result):

| GW | forecast games | result found | no result | written after lock |
|---|---|---|---|---|
| 21 | 598 | 51 | 547 | 0 |
| 22 | 0 | 0 | 0 | 0 |
| 23 | 604 | 69 | 535 | 0 |
| 24 | 59 | 9 | 50 | 0 |
| 25 | 606 | 69 | 537 | 0 |
| 26 | 0 | 0 | 0 | 0 |
| 27 | 623 | 71 | 552 | 0 |
| 28 | 0 | 0 | 0 | 0 |
| 29 | 628 | 68 | 560 | 0 |
| 30 | 0 | 0 | 0 | 0 |
| 31 | 0 | 0 | 0 | 0 |

## LaLiga starters: paired n=221 (rows with a result of that kind: 221)
| source | n | within-7 | MAE | lean |
|---|---|---|---|---|
| Sofix | 221 | 24.4% | 15.2 | -4.1 |
| Sorare | 221 | 25.8% | 15.1 | -4.0 |

**by position** (starters)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|
| GK | 35 | 25.7% | 16.6 | -8.2 | 22.9% | 17.1 | -6.0 |
| DEF | 78 | 19.2% | 17.2 | -5.8 | 20.5% | 16.7 | -4.1 |
| MID | 68 | 29.4% | 13.7 | -2.4 | 25.0% | 14.2 | -4.0 |
| FWD | 40 | 25.0% | 12.8 | -0.2 | 40.0% | 12.0 | -2.2 |

**by GW** (starters)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|
| 21 | 38 | 18.4% | 16.6 | -6.7 | 23.7% | 17.0 | -7.1 |
| 23 | 44 | 36.4% | 14.4 | -7.6 | 27.3% | 14.5 | -7.4 |
| 24 | 6 | 33.3% | 9.0 | +0.9 | 33.3% | 9.8 | +2.8 |
| 25 | 44 | 29.5% | 15.2 | -0.8 | 25.0% | 15.9 | -0.9 |
| 27 | 45 | 15.6% | 15.8 | -1.5 | 22.2% | 14.8 | -2.1 |
| 29 | 44 | 20.5% | 15.4 | -5.1 | 29.5% | 14.5 | -4.0 |

**by venue** (starters)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|
| A | 61 | 23.0% | 14.6 | -3.8 | 29.5% | 13.8 | -2.0 |
| H | 72 | 20.8% | 16.1 | -1.3 | 22.2% | 16.1 | -2.6 |
| None | 88 | 28.4% | 14.9 | -6.6 | 26.1% | 15.3 | -6.6 |

**by game's scoreSource** (starters)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|
| sofix | 44 | 20.5% | 15.4 | -5.1 | 29.5% | 14.5 | -4.0 |
| None | 177 | 25.4% | 15.2 | -3.9 | 24.9% | 15.3 | -4.0 |

**by player 'by'** (starters)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|
| sofix | 221 | 24.4% | 15.2 | -4.1 | 25.8% | 15.1 | -4.0 |

**by past played games in history before kickoff** (starters)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|
| 0-2 | 9 | 33.3% | 9.2 | +1.4 | 22.2% | 10.5 | +0.1 |
| 3-5 | 54 | 31.5% | 12.6 | +1.6 | 27.8% | 12.9 | +2.0 |
| 6-9 | 137 | 21.9% | 16.2 | -5.8 | 27.0% | 15.8 | -5.6 |
| 10+ | 21 | 19.0% | 18.6 | -10.6 | 14.3% | 19.0 | -10.9 |

**by modelVersion** (starters)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|
| None | 221 | 24.4% | 15.2 | -4.1 | 25.8% | 15.1 | -4.0 |

**by result source** (starters)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|
| game_checks | 221 | 24.4% | 15.2 | -4.1 | 25.8% | 15.1 | -4.0 |

**by startSource** (starters)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|
| futbolfantasy | 215 | 24.2% | 15.4 | -4.3 | 25.6% | 15.3 | -4.2 |
| sorare | 6 | 33.3% | 9.0 | +0.9 | 33.3% | 9.8 | +2.8 |

**by pStart band** (starters)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|
| .8+ | 147 | 27.9% | 15.5 | -4.5 | 24.5% | 15.7 | -3.8 |
| <.3 | 7 | 28.6% | 10.8 | +7.5 | 28.6% | 7.6 | +1.1 |
| <.6 | 67 | 16.4% | 15.1 | -4.4 | 28.4% | 14.8 | -5.2 |

**by actual score band** (starters)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|
| 0-15 | 4 | 0.0% | 28.5 | +28.5 | 0.0% | 28.3 | +28.3 |
| 15-35 | 31 | 3.2% | 16.8 | +16.8 | 3.2% | 17.2 | +16.6 |
| 35-60 | 109 | 46.8% | 7.7 | +3.2 | 46.8% | 7.7 | +3.1 |
| 60+ | 77 | 2.6% | 24.6 | -24.6 | 6.5% | 24.2 | -24.1 |

## LaLiga substitutes: paired n=0 (rows with a result of that kind: 0)
| source | n | within-7 | MAE | lean |
|---|---|---|---|---|
| Sofix | 0 |
| Sorare | 0 |

**by position** (subs)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|

**by GW** (subs)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|

**by venue** (subs)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|

**by game's scoreSource** (subs)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|

**by player 'by'** (subs)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|

**by past played games in history before kickoff** (subs)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|

**by modelVersion** (subs)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|

**by result source** (subs)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|

**by startSource** (subs)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|

**by pStart band** (subs)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|

**by actual score band** (subs)

| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |
|---|---|---|---|---|---|---|---|

## Fell back (no Sofix number for the game) among LaLiga rows with a result

| started | sofix missing | sorare missing | n |
|---|---|---|---|
| True | False | False | 221 |

## All competitions, same weeks (every row with a result; Sofix vs Sorare where both)


starters

| comp | n paired | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean | rows w/ result | of which sofix None | sorare None |
|---|---|---|---|---|---|---|---|---|---|---|
| 1-hnl | 0 | - | - | - | - | - | - | 1 | 1 | 0 |
| bundesliga-de | 9 | 22.2% | 15.4 | -6.8 | 22.2% | 15.4 | -7.4 | 14 | 5 | 0 |
| k-league-1 | 0 | - | - | - | - | - | - | 2 | 2 | 0 |
| laliga-es | 221 | 24.4% | 15.2 | -4.1 | 25.8% | 15.1 | -4.0 | 221 | 0 | 0 |
| premier-league-gb-eng | 3 | 0.0% | 17.8 | +17.8 | 66.7% | 12.8 | +12.8 | 4 | 1 | 0 |
| segunda-division-es | 0 | - | - | - | - | - | - | 7 | 7 | 0 |
| superliga-argentina-de-futbol | 0 | - | - | - | - | - | - | 4 | 4 | 0 |
| uefa-champions-league | 391 | 26.9% | 14.9 | -0.9 | 30.4% | 15.3 | -2.0 | 502 | 111 | 0 |
| uefa-europa-conference-league | 395 | 30.6% | 14.2 | -0.7 | 35.4% | 13.9 | -3.7 | 417 | 22 | 0 |
| uefa-europa-league | 393 | 32.6% | 13.2 | +0.1 | 33.3% | 12.8 | -2.5 | 438 | 45 | 0 |

subs

| comp | n paired | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean | rows w/ result | of which sofix None | sorare None |
|---|---|---|---|---|---|---|---|---|---|---|
| 1-hnl | 0 | - | - | - | - | - | - | 0 | 0 | 0 |
| bundesliga-de | 0 | - | - | - | - | - | - | 0 | 0 | 0 |
| k-league-1 | 1 | 0.0% | 36.8 | -36.8 | 0.0% | 36.0 | -36.0 | 1 | 1 | 0 |
| laliga-es | 0 | - | - | - | - | - | - | 0 | 0 | 0 |
| premier-league-gb-eng | 0 | - | - | - | - | - | - | 0 | 0 | 0 |
| segunda-division-es | 0 | - | - | - | - | - | - | 0 | 0 | 0 |
| superliga-argentina-de-futbol | 0 | - | - | - | - | - | - | 0 | 0 | 0 |
| uefa-champions-league | 0 | - | - | - | - | - | - | 0 | 0 | 0 |
| uefa-europa-conference-league | 0 | - | - | - | - | - | - | 0 | 0 | 0 |
| uefa-europa-league | 0 | - | - | - | - | - | - | 0 | 0 | 0 |

## Result coverage by competition (all weeks)

| comp | forecast games | result found | no result |
|---|---|---|---|
| 1-hnl | 180 | 2 | 178 |
| 2-bundesliga | 5 | 3 | 2 |
| austrian-bundesliga | 288 | 0 | 288 |
| bundesliga-de | 1608 | 15 | 1593 |
| eliteserien | 313 | 0 | 313 |
| eredivisie | 505 | 0 | 505 |
| jupiler-pro-league | 412 | 3 | 409 |
| k-league-1 | 4 | 4 | 0 |
| laliga-es | 3118 | 337 | 2781 |
| ligue-1-fr | 1566 | 0 | 1566 |
| ligue-2-fr | 3 | 0 | 3 |
| premier-league-gb-eng | 1817 | 14 | 1803 |
| premiership-gb-sct | 209 | 0 | 209 |
| primeira-liga-pt | 363 | 0 | 363 |
| segunda-division-es | 82 | 12 | 70 |
| serie-a-it | 868 | 0 | 868 |
| spor-toto-super-lig | 347 | 0 | 347 |
| super-league-ch | 128 | 0 | 128 |
| superliga-argentina-de-futbol | 10 | 9 | 1 |
| superliga-dk | 250 | 0 | 250 |
| uefa-champions-league | 1421 | 526 | 895 |
| uefa-europa-conference-league | 1182 | 420 | 762 |
| uefa-europa-league | 1287 | 462 | 825 |
| uefa-nations-league | 999 | 0 | 999 |

Games carrying modelVersion (laliga?, has): {(False, False): 13847, (True, False): 3118}
audit.versus recorded/settled: 11 4 audit keys xscore: ['replay', 'live']
audit xscore.models: None

## Exploratory: LaLiga played, started unknown (game_checks), Sofix sub number vs minutes

n: 57 mins distribution: [1, 2, 3, 6, 7, 8, 11, 12, 13, 13, 14, 15, 15, 15, 19, 19, 19, 20, 20, 21, 21, 22, 22, 22, 23, 23, 23, 24, 24, 25, 25, 26, 26, 27, 29, 29, 29, 30, 30, 30, 30, 31, 33, 34, 34, 34, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 72]
mins<46 (probable sub) Sofix sofixOn n,within7,MAE,lean = 46 | 80.4% | 5.3 | +1.4
mins<46 (probable sub) Sofix start number n,within7,MAE,lean = 56 | 19.6% | 11.7 | +10.7
mins<46 (probable sub) Sorare n,within7,MAE,lean = 56 | 33.9% | 9.8 | +8.4
mins>=46 (probable unmarked start) Sofix sofixOn n,within7,MAE,lean = 1 | 100.0% | 3.2 | -3.2
mins>=46 (probable unmarked start) Sofix start number n,within7,MAE,lean = 1 | 100.0% | 6.1 | +6.1
mins>=46 (probable unmarked start) Sorare n,within7,MAE,lean = 1 | 100.0% | 5.8 | +5.8
