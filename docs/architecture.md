# Architecture

## Pipeline (implemented)

`sources → canonical teams → fixtures/results → rating model → P(W/D/L), xG, clean sheet → expected points → difficulty 0–100 → label/bucket → grid API → board`

| Step | Module | Notes |
|---|---|---|
| Migrations | `app/migrate.py`, `migrations/` | Run as the Neon owner via `POSTGRES_MIGRATION_URL`; refuses a different database than the app's |
| Sync | `app/jobs/seed_and_sync.py` | One football-data.org call; teams via `services/team_registry.py`; replaces fixture fields in place |
| Predict | `app/jobs/predict.py`, `services/rating_predictions.py` | Dixon-Coles fit on football-data.co.uk history + synced results; replaces rows per model version |
| Weather | `app/jobs/sync_weather.py`, `sources/open_meteo.py` | One call per stadium; confirmed kickoffs within 14 days; one row per fixture |
| Grid | `services/fixture_grid.py`, `api.py` | Teams × matchdays; buckets derived from labels; lens scales for attack/defence |
| Board | `frontend/` | Renders buckets and scales from the API; no business thresholds in the browser |

From the selected team's perspective:

- `EP = 3·P(win) + P(draw)`
- `Difficulty = 100·(1 − EP/3)`
- Labels (backtested, 15/20/30/20/15 % shares): Easy ≤ 37.4 < Easy-ish ≤ 48.6 < Normal ≤ 61.1 < Hard-ish ≤ 71.3 < Hard

Keep the continuous score; change thresholds only after rolling-origin backtests.

## Rating model

Dixon-Coles Poisson goals model (`app/modeling/dixon_coles.py`): team attack and defence ratings, home advantage,
time-decayed match weights, a goals/shots-on-target target blend, a ridge prior (promoted-team offset), and the
low-score correction. Tuned and validated with `app/jobs/backtest.py`.

## Data model (Neon)

`competitions`, `teams`, `stadiums`, `source_entity_map`, `fixtures`, `predictions`, `weather_snapshots`.
The app connects as the least-privilege role `fdr_app`; migrations use the owner role.

## Future feature families (research, not implemented)

The original research listed these candidate inputs. Each would be added only if a backtest shows it improves
the model (see `docs/next_features_plan.md`, phase 6):

1. Dynamic Elo / team strength — covered by the rating model
2. Home/away strength — covered (league-wide home advantage)
3. Recency-weighted form — covered (time decay)
4. xG / xGA / npxG / xPts
5. Shots / SOT, finishing and goalkeeper over/under-performance — SOT covered
6. League table / season progress
7. Injuries / suspensions and player contribution
8. Expected XI and rotation
9. Rest / congestion / Europe / cup context
10. Travel / stadium geography
11. Transfers / squad continuity
12. Manager change / tenure
13. Tactical style (possession, PPDA, pressures, set pieces)
14. Market 1X2 probabilities
15. Weather (context only today)
16. Motivation: title / relegation / derby
17. Referee tendencies
18. Low-weight head-to-head
19. Promoted-team prior — covered
20. Missingness / source uncertainty
