# LaLiga difficulty model — backtest report

Generated 2026-09-13 23:05 UTC from football-data.co.uk results (2016/17 → 2026/27).

**Method.** Every Monday of a season, each model is fitted only on matches played before that day and
forecasts every match in the next 8 weeks. Settings were tuned on 2019/20, 2020/21, 2021/22, 2022/23; all numbers below are
from **2023/24, 2024/25, 2025/26**, which tuning never saw. Every method is scored on the same 8339
forecasts (matches with closing odds), each match forecast once per horizon.

Metrics: **RPS** (ranked probability score, lower is better; the main score), **log loss** (lower is better),
**accuracy** (most likely outcome was right), **clean-sheet Brier** (lower is better).

## 1. Chosen settings

- Time decay xi = 0.001 per day (half-life: 693 days)
- Goals weight = 0.7 (rest is the shots-on-target proxy)
- Ridge = 1.0, promoted-team prior = 0.0

Best configurations on the tuning seasons:

| xi | goals_weight | ridge | promoted_prior | rps |
|---|---|---|---|---|
| 0.001 | 0.7 | 1.0 | 0.0 | 0.2007 |
| 0.001 | 0.7 | 4.0 | -0.2 | 0.2007 |
| 0.002 | 0.7 | 1.0 | 0.0 | 0.2007 |
| 0.0 | 0.7 | 4.0 | -0.2 | 0.2007 |
| 0.001 | 0.7 | 1.0 | -0.2 | 0.2007 |
| 0.002 | 0.7 | 1.0 | -0.2 | 0.2008 |
| 0.0 | 0.7 | 4.0 | 0.0 | 0.2008 |
| 0.001 | 0.7 | 4.0 | 0.0 | 0.2008 |

Tuned model per tuning season. 2019/20 (restart without crowds) and 2020/21 (no crowds all season)
had much weaker home advantage, so settings that suit them may not suit normal seasons:

| season_start | matches | rps | accuracy |
|---|---|---|---|
| 2019 | 2790 | 0.1971 | 51.8% |
| 2020 | 2794 | 0.1977 | 50.9% |
| 2021 | 2804 | 0.2015 | 51.7% |
| 2022 | 2779 | 0.2065 | 52.4% |

## 2. Overall accuracy (test seasons)

| method | matches | rps | log_loss | accuracy | clean_sheet_brier |
|---|---|---|---|---|---|
| Closing odds (ceiling) | 8339 | 0.1886 | 0.9530 | 55.5% | — |
| Dixon-Coles (tuned) | 8339 | 0.1953 | 0.9741 | 53.1% | 0.1813 |
| Dixon-Coles (no form, goals only) | 8339 | 0.1960 | 0.9753 | 52.7% | 0.1828 |
| Elo (current fallback) | 8339 | 0.2050 | 1.0109 | 52.7% | — |
| Base rates | 8339 | 0.2255 | 1.0652 | 46.0% | 0.1909 |

## 3. RPS by how far ahead the forecast is

| method | 1 week | 2–3 weeks | 4–5 weeks | 6–8 weeks |
|---|---|---|---|---|
| Closing odds (ceiling) | 0.1888 | 0.1882 | 0.1882 | 0.1892 |
| Dixon-Coles (tuned) | 0.1949 | 0.1945 | 0.1952 | 0.1962 |
| Dixon-Coles (no form, goals only) | 0.1955 | 0.1951 | 0.1960 | 0.1970 |
| Elo (current fallback) | 0.2043 | 0.2045 | 0.2052 | 0.2056 |
| Base rates | 0.2257 | 0.2254 | 0.2253 | 0.2257 |

## 4. Early season vs rest of season (RPS)

| method | Aug–Sep cutoffs | Oct–May cutoffs |
|---|---|---|
| Base rates | 0.2221 | 0.2265 |
| Closing odds (ceiling) | 0.1814 | 0.1906 |
| Dixon-Coles (no form, goals only) | 0.1866 | 0.1986 |
| Dixon-Coles (tuned) | 0.1866 | 0.1977 |
| Elo (current fallback) | 0.1996 | 0.2065 |

## 5. Ranking runs of fixtures (what an FDR is for)

Spearman correlation between each team's forecast points over its next 5 matches and the points it
actually got, averaged over cutoffs (1 = perfect ranking, 0 = no better than random).

| method | spearman_next5 | cutoffs |
|---|---|---|
| Closing odds (ceiling) | 0.617 | 115 |
| Dixon-Coles (tuned) | 0.554 | 115 |
| Dixon-Coles (no form, goals only) | 0.542 | 115 |
| Elo (current fallback) | 0.532 | 115 |
| Base rates | 0.097 | 115 |

## 6. Difficulty labels (tuned model, test seasons)

Current thresholds from `app/services/scoring.py` (33.3, 48.3, 61.7, 73.3):

| label | fixtures | expected_ppg | actual_ppg | win_rate | share |
|---|---|---|---|---|---|
| Easy | 1837 | 2.23 | 2.45 | 77.5% | 11.0% |
| Easy-ish | 4048 | 1.75 | 1.78 | 49.3% | 24.3% |
| Normal | 5126 | 1.35 | 1.35 | 35.3% | 30.7% |
| Hard-ish | 3539 | 0.99 | 0.91 | 20.3% | 21.2% |
| Hard | 2128 | 0.60 | 0.48 | 11.1% | 12.8% |

Proposed thresholds (37.4, 48.6, 61.1, 71.3) (15 / 20 / 30 / 20 / 15 % of fixtures, fitted on the tuning seasons):

| label | fixtures | expected_ppg | actual_ppg | win_rate | share |
|---|---|---|---|---|---|
| Easy | 2717 | 2.14 | 2.32 | 71.9% | 16.3% |
| Easy-ish | 3284 | 1.70 | 1.70 | 46.1% | 19.7% |
| Normal | 4746 | 1.36 | 1.35 | 35.6% | 28.5% |
| Hard-ish | 3335 | 1.03 | 0.95 | 21.1% | 20.0% |
| Hard | 2596 | 0.64 | 0.53 | 12.2% | 15.6% |

## 7. Clean-sheet calibration (tuned model, test seasons)

| fixtures | predicted | observed |
|---|---|---|
| 3336 | 14.2% | 9.4% |
| 3335 | 23.7% | 19.9% |
| 3336 | 30.7% | 25.9% |
| 3335 | 36.9% | 32.2% |
| 3336 | 46.1% | 43.3% |

Forecast vs actual goals and clean sheets per match (test seasons):

| method | predicted_home | actual_home | predicted_away | actual_away | predicted_cs_home | actual_cs_home | predicted_cs_away | actual_cs_away |
|---|---|---|---|---|---|---|---|---|
| Base rates | 1.474 | 1.510 | 1.119 | 1.149 | 33.1% | 31.1% | 22.9% | 21.2% |
| Dixon-Coles (no form, goals only) | 1.452 | 1.510 | 1.097 | 1.149 | 35.8% | 31.1% | 26.4% | 21.2% |
| Dixon-Coles (tuned) | 1.460 | 1.510 | 1.105 | 1.149 | 35.0% | 31.1% | 25.6% | 21.2% |

## 8. Current ratings (2026/27, data through 2026-09-07)

Log-scale: +0.10 attack ≈ 10% more goals than an average team; +0.10 defence ≈ 10% fewer conceded.
Home advantage = +0.284, rho = +0.018.

| rank | team | attack | defence | overall |
|---|---|---|---|---|
| 1 | Barcelona | +0.674 | +0.312 | +0.986 |
| 2 | Real Madrid | +0.495 | +0.304 | +0.799 |
| 3 | Ath Madrid | +0.272 | +0.211 | +0.483 |
| 4 | Villarreal | +0.313 | +0.079 | +0.392 |
| 5 | Betis | +0.211 | +0.040 | +0.251 |
| 6 | Ath Bilbao | +0.050 | +0.137 | +0.187 |
| 7 | La Coruna | +0.206 | -0.021 | +0.185 |
| 8 | Celta | +0.057 | +0.067 | +0.124 |
| 9 | Vallecano | -0.017 | +0.090 | +0.073 |
| 10 | Sociedad | +0.063 | -0.033 | +0.029 |
| 11 | Alaves | -0.029 | +0.045 | +0.017 |
| 12 | Osasuna | -0.022 | +0.019 | -0.004 |
| 13 | Sevilla | -0.025 | -0.034 | -0.058 |
| 14 | Elche | +0.035 | -0.127 | -0.092 |
| 15 | Levante | +0.009 | -0.123 | -0.115 |
| 16 | Getafe | -0.358 | +0.243 | -0.115 |
| 17 | Valencia | -0.114 | -0.007 | -0.122 |
| 18 | Espanol | -0.082 | -0.050 | -0.132 |
| 19 | Santander | +0.198 | -0.344 | -0.146 |
| 20 | Malaga | -0.625 | -0.003 | -0.629 |
