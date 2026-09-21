# LaLiga difficulty model — backtest report

Generated 2026-09-16 00:29 UTC from football-data.co.uk results (2016/17 → 2026/27).

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
- Rating spread = 1.1 (1.0 = the fit as it comes; above that the ratings are stretched around
  their average, which is undone shrinkage, not new information)

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

Rating spread on the tuning seasons, chosen on log loss because RPS barely separates them:

| spread | rps | log_loss |
|---|---|---|
| 1.00 | 0.2007 | 0.9974 |
| 1.05 | 0.2005 | 0.9969 |
| 1.10 | 0.2005 | 0.9967 |
| 1.15 | 0.2005 | 0.9968 |
| 1.20 | 0.2006 | 0.9971 |
| 1.25 | 0.2007 | 0.9977 |

Tuned model per tuning season. 2019/20 (restart without crowds) and 2020/21 (no crowds all season)
had much weaker home advantage, so settings that suit them may not suit normal seasons:

| season_start | matches | rps | accuracy |
|---|---|---|---|
| 2019 | 2790 | 0.1964 | 51.6% |
| 2020 | 2794 | 0.1970 | 50.9% |
| 2021 | 2804 | 0.2016 | 51.4% |
| 2022 | 2779 | 0.2069 | 52.4% |

## 2. Overall accuracy (test seasons)

| method | matches | rps | log_loss | accuracy | clean_sheet_brier |
|---|---|---|---|---|---|
| Closing odds (ceiling) | 8339 | 0.1886 | 0.9530 | 55.5% | — |
| Dixon-Coles (tuned) | 8339 | 0.1947 | 0.9717 | 53.2% | 0.1818 |
| Dixon-Coles (no form, goals only) | 8339 | 0.1960 | 0.9753 | 52.7% | 0.1828 |
| Elo (current fallback) | 8339 | 0.2050 | 1.0109 | 52.7% | — |
| Base rates | 8339 | 0.2255 | 1.0652 | 46.0% | 0.1909 |

## 3. RPS by how far ahead the forecast is

| method | 1 week | 2–3 weeks | 4–5 weeks | 6–8 weeks |
|---|---|---|---|---|
| Closing odds (ceiling) | 0.1888 | 0.1882 | 0.1882 | 0.1892 |
| Dixon-Coles (tuned) | 0.1943 | 0.1938 | 0.1946 | 0.1956 |
| Dixon-Coles (no form, goals only) | 0.1955 | 0.1951 | 0.1960 | 0.1970 |
| Elo (current fallback) | 0.2043 | 0.2045 | 0.2052 | 0.2056 |
| Base rates | 0.2257 | 0.2254 | 0.2253 | 0.2257 |

## 4. Early season vs rest of season (RPS)

| method | Aug–Sep cutoffs | Oct–May cutoffs |
|---|---|---|
| Base rates | 0.2221 | 0.2265 |
| Closing odds (ceiling) | 0.1814 | 0.1906 |
| Dixon-Coles (no form, goals only) | 0.1866 | 0.1986 |
| Dixon-Coles (tuned) | 0.1853 | 0.1972 |
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

Current thresholds from `app/services/scoring.py` (37.4, 48.6, 61.1, 71.3):

| label | fixtures | expected_ppg | actual_ppg | win_rate | share |
|---|---|---|---|---|---|
| Easy | 2957 | 2.16 | 2.29 | 70.4% | 17.7% |
| Easy-ish | 3110 | 1.70 | 1.70 | 46.2% | 18.6% |
| Normal | 4524 | 1.36 | 1.35 | 35.1% | 27.1% |
| Hard-ish | 3231 | 1.03 | 0.98 | 22.2% | 19.4% |
| Hard | 2856 | 0.62 | 0.54 | 12.3% | 17.1% |

Proposed thresholds (36.1, 48.2, 61.6, 72.5) (15 / 20 / 30 / 20 / 15 % of fixtures, fitted on the tuning seasons):

| label | fixtures | expected_ppg | actual_ppg | win_rate | share |
|---|---|---|---|---|---|
| Easy | 2663 | 2.19 | 2.32 | 71.8% | 16.0% |
| Easy-ish | 3248 | 1.72 | 1.74 | 47.4% | 19.5% |
| Normal | 4894 | 1.35 | 1.34 | 35.0% | 29.3% |
| Hard-ish | 3311 | 1.00 | 0.94 | 21.1% | 19.9% |
| Hard | 2562 | 0.60 | 0.53 | 12.3% | 15.4% |

## 7. Clean-sheet calibration (tuned model, test seasons)

| fixtures | predicted | observed |
|---|---|---|
| 3336 | 13.4% | 9.5% |
| 3335 | 23.7% | 20.0% |
| 3336 | 31.3% | 25.6% |
| 3335 | 37.9% | 31.9% |
| 3336 | 47.7% | 43.7% |

The model's clean-sheet chances run high, so they are corrected before the board shows them:
p' = sigmoid(-0.154 + 0.932 * logit(p)), fitted on 22,334 forecasts from the
tuning seasons. Win, draw and loss are untouched. On the test seasons:

| clean sheets | predicted | observed | brier |
|---|---|---|---|
| as fitted | 30.8% | 26.1% | 0.1818 |
| corrected | 28.8% | 26.1% | 0.1803 |

Forecast vs actual goals and clean sheets per match (test seasons):

| method | predicted_home | actual_home | predicted_away | actual_away | predicted_cs_home | actual_cs_home | predicted_cs_away | actual_cs_away |
|---|---|---|---|---|---|---|---|---|
| Base rates | 1.474 | 1.510 | 1.119 | 1.149 | 33.1% | 31.1% | 22.9% | 21.2% |
| Dixon-Coles (no form, goals only) | 1.452 | 1.510 | 1.097 | 1.149 | 35.8% | 31.1% | 26.4% | 21.2% |
| Dixon-Coles (tuned) | 1.458 | 1.510 | 1.102 | 1.149 | 35.5% | 31.1% | 26.1% | 21.2% |

## 8. Current ratings (2026/27, data through 2026-09-07)

Log-scale: +0.10 attack ≈ 10% more goals than an average team; +0.10 defence ≈ 10% fewer conceded.
Home advantage = +0.284, rho = +0.016.

| rank | team | attack | defence | overall |
|---|---|---|---|---|
| 1 | Barcelona | +0.741 | +0.344 | +1.085 |
| 2 | Real Madrid | +0.545 | +0.334 | +0.879 |
| 3 | Ath Madrid | +0.299 | +0.232 | +0.531 |
| 4 | Villarreal | +0.345 | +0.086 | +0.431 |
| 5 | Betis | +0.232 | +0.044 | +0.276 |
| 6 | Ath Bilbao | +0.055 | +0.151 | +0.206 |
| 7 | La Coruna | +0.226 | -0.023 | +0.203 |
| 8 | Celta | +0.062 | +0.074 | +0.136 |
| 9 | Vallecano | -0.019 | +0.099 | +0.080 |
| 10 | Sociedad | +0.069 | -0.037 | +0.032 |
| 11 | Alaves | -0.032 | +0.050 | +0.018 |
| 12 | Osasuna | -0.024 | +0.020 | -0.004 |
| 13 | Sevilla | -0.027 | -0.037 | -0.064 |
| 14 | Elche | +0.039 | -0.140 | -0.101 |
| 15 | Levante | +0.010 | -0.136 | -0.126 |
| 16 | Getafe | -0.394 | +0.267 | -0.127 |
| 17 | Valencia | -0.126 | -0.008 | -0.134 |
| 18 | Espanol | -0.090 | -0.055 | -0.145 |
| 19 | Santander | +0.218 | -0.379 | -0.161 |
| 20 | Malaga | -0.688 | -0.003 | -0.691 |
