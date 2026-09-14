# FixtureDiff — product and model reference

A premium, Apple-style **fixture difficulty board for LaLiga**, for a single fantasy player (the owner).
English UI. Personal, non-commercial project.

> LaLiga has **no official difficulty rating**, so we compute one. The rating model and its backtest are the core of the product.

- Execution plan and status: [docs/next_features_plan.md](docs/next_features_plan.md)
- Audit evidence: [docs/upgrade_audit.md](docs/upgrade_audit.md)
- Architecture: [docs/architecture.md](docs/architecture.md) · Data sources: [docs/data_dictionary.md](docs/data_dictionary.md)
- Working rules and free-tier limits: [CLAUDE.md](CLAUDE.md)

---

## 1. Stack

| Layer | Choice |
|---|---|
| UI | Next.js 15 + React 19 + TypeScript (`frontend/`), white premium design |
| API | FastAPI (`backend/app/main.py`, `api.py`) |
| Data + modelling | Python 3.11 jobs (`backend/app/jobs/`): pandas, numpy, scipy |
| DB | Neon Postgres project FDR (Frankfurt), SQLAlchemy 2 + Alembic; app role `fdr_app` |
| Quality | pytest, ruff, mypy, ESLint (jsx-a11y), vitest; GitHub Actions CI |

Difficulty from the selected team's perspective: `EP = 3·P(win) + P(draw)`, `difficulty = 100 × (1 − EP/3)`,
labelled Easy / Easy-ish / Normal / Hard-ish / Hard with backtested thresholds `(37.4, 48.6, 61.1, 71.3)`.

---

## 2. Scope

**Built**
- Grid: 20 teams × 38 matchdays, **Difficulty** and plain **Fixtures** views
- Three lenses: **Overall** (difficulty), **Attack** (expected goals for), **Defence** (clean-sheet chance)
- Tooltip: kickoff (Madrid time), win/draw/loss %, expected goals, clean-sheet %, difficulty, weather
- Horizon (Next 3/5/8/All), window stepping, sort, pin, search, insight cards
- "Date TBC" markers; rescheduled games detected; results shown for played matchdays

**Planned** (see the execution plan): refresh button and scheduled refresh, club crests, accessibility and
mobile layout, fantasy-planning metrics, model improvements, later dark mode and Spanish.

---

## 3. The rating model

**Dixon-Coles Poisson goals model with time decay** — `backend/app/modeling/dixon_coles.py`

```
log λ_home = μ + home_adv + attack[home] − defence[away]
log λ_away = μ + attack[away] − defence[home]
```

- Match weights `exp(−xi · days_ago)` over a 2-year window (this is "form")
- Target = blend of goals and a shots-on-target proxy (`goals_weight`)
- L2 pull toward a prior (0 for established teams, `promoted_prior` for promoted ones)
- Dixon-Coles low-score correction `rho`
- Outputs per match: λ home/away, P(H/D/A), clean-sheet probability per side → expected points → difficulty

| Factor | Status |
|---|---|
| Team attack/defence strength, home advantage | ✅ in model |
| Form (recency weighting) | ✅ in model (small gain) |
| Chance quality (shots on target proxy) | ✅ in model (the most useful addition) |
| Promoted teams | ✅ prior; Segunda data planned |
| Rest days / Europe / Copa | ⏳ planned experiment |
| Market odds for the next matchday | ⏳ planned experiment |
| Injuries / suspensions | ⏳ needs authorised data |
| Weather | Context only (tooltip); never team-specific |
| Head to head, kickoff time | ❌ not predictive enough |

---

## 4. Backtest results

Run: `python -m app.jobs.backtest` → [backend/reports/backtest_laliga.md](backend/reports/backtest_laliga.md)

Rolling origin: every Monday, fit on past matches only, forecast the next 8 weeks. Tuned on 2019/20–2022/23,
scored on **2023/24–2025/26** (8,339 forecasts, all methods on the same matches).

| Method | RPS ↓ | Accuracy | Next-5 run ranking (Spearman) ↑ |
|---|---|---|---|
| Closing betting odds (ceiling) | 0.1886 | 55.5% | 0.617 |
| **Dixon-Coles (tuned, in production)** | **0.1953** | **53.1%** | **0.554** |
| Dixon-Coles (no form, goals only) | 0.1960 | 52.7% | 0.542 |
| Elo (original scaffold fallback) | 0.2050 | 52.7% | 0.532 |
| Base rates | 0.2255 | 46.0% | 0.097 |

Findings:
1. The model closes **~82% of the gap** between base rates and the betting market (Elo: ~56%).
2. Accuracy barely drops with horizon (RPS 0.1949 at 1 week → 0.1962 at 6–8 weeks), so an 8-week grid is sound.
3. Form matters less than expected; shots-on-target blending gives more. The tuning surface is flat.
4. Label thresholds give 15/20/30/20/15 % shares; middle bands are well calibrated.
5. Early season is not a weak spot (gap to market smaller in Aug–Sep than Oct–May).

Known weaknesses (measured in the audit, targeted in phase 6 of the plan):
- **Favourites under-confident:** 60–70% predicted → 74% actual; 70–80% → 86%; 80%+ → 93%.
- **Promoted teams** learned too slowly after week 8 (gap to market +0.0111 vs +0.0058).
- **Clean sheets** overestimated by ~4 points.
- **Market disagreement** > 10 points on 12.5% of next-week matches.

---

## 5. LaLiga calendar quirks

- Kickoff times are published matchday by matchday → "Date TBC" until football-data.org marks a game `TIMED`
- Supercopa (January) moves 4 teams' league games → grid stays by matchday; moved games flagged as rescheduled
- Postponements → upsert by source fixture id (unique), `schedule_version` bumps only when kickoff really changes
- 3 promoted teams per season → add them to the team registry each June
- International breaks → date gaps, not matchday gaps

---

## 6. Decisions

| Topic | Decision |
|---|---|
| Use | Personal, non-commercial, single user |
| Database | Neon Postgres (not Convex): Python batch jobs + SQL, no reactive-query need |
| Region | AWS Frankfurt |
| Refresh button | Owner only: server-side token, 10-minute cooldown |
| Crests | On by default for personal use, behind a flag |
| StatsBomb Open Data | Research only (LaLiga to 2020/21, Barcelona matches only) |

Resolved scaffold issues (for history): the original logistic model had a train/serve feature-name mismatch and
used closing odds as features; it and its modules were removed once the Dixon-Coles model replaced it.

## 7. Open questions

1. Budget for a paid data API (xG, European/cup fixtures, injuries)?
2. Main fantasy game: LaLiga Fantasy or Biwenger?
3. Grid axis: strictly by matchday, or also a "by date" view?
