# Architecture

## Core pipeline
`raw snapshots -> canonical IDs -> point-in-time facts -> features -> P(W/D/L) -> expected points -> difficulty 0-100 -> label`

From the selected team's perspective:

- `EP = 3*P(win) + P(draw)`
- `Difficulty = 100*(1 - EP/3)`

Initial bands:
- Easy: 0–33.3
- Easy-ish: 33.3–48.3
- Normal: 48.3–61.7
- Hard-ish: 61.7–73.3
- Hard: 73.3–100

Keep the continuous score; tune bucket thresholds only after rolling-origin backtests.

## Prediction horizons
Store separate point-in-time snapshots at T-7d, T-24h, T-6h and optionally T-90m.
Every feature must obey: `available_at <= prediction_ts`.

## Full feature families represented in the schema
1. Dynamic Elo/team strength
2. Home/away strength
3. Recency-weighted form
4. xG/xGA/npxG/xPts
5. Shots/SOT + finishing and GK over/under-performance
6. League table / season progress
7. Injuries/suspensions and player contribution
8. Expected XI and rotation
9. Rest / congestion / Europe / cup context
10. Travel / stadium geography / altitude
11. Transfers / squad continuity
12. Manager change/tenure
13. Tactical style: possession, PPDA, pressures, transitions/set pieces
14. Market 1X2 probabilities
15. Weather
16. Motivation: title/relegation/derby
17. Referee tendencies
18. Low-weight H2H
19. Promoted-team prior
20. Missingness / source uncertainty

## Model
Ship:
- internally computed Elo
- Poisson outcome probabilities
- multinomial logistic baseline
- market probabilities if present
- blend hooks

Production target after validation:
- LightGBM or Bayesian hierarchical model
- calibrated probabilities
- rolling-origin validation
- ablation by feature family
