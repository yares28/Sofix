# FixtureDiff — LaLiga Fixture Difficulty Plan

A premium, Apple-style **fixture difficulty board for LaLiga**, aimed at fantasy players (LaLiga Fantasy, Biwenger, Mister).
English UI. Built on the existing scaffold in this repo (see [README.md](README.md), [docs/architecture.md](docs/architecture.md), [docs/data_dictionary.md](docs/data_dictionary.md)).

> LaLiga has **no official difficulty rating**, so we compute one. The rating model and its backtest are the core of the product.

---

## 1. Stack (as scaffolded)

| Layer | Choice |
|---|---|
| UI | Next.js 15 + TypeScript (`frontend/`), restyled to the white premium look in [prototype/index.html](prototype/index.html) |
| API | FastAPI (`backend/app/api.py`) |
| Data + modelling | Python jobs in `backend/app/jobs/` (pandas, numpy, scipy, scikit-learn) |
| DB | PostgreSQL 16 via `docker-compose.yml`, SQLAlchemy models in `backend/app/models.py` |
| Tests | pytest (`backend/tests/`); Playwright for the UI later |

Core pipeline (from `docs/architecture.md`):
`raw snapshots → canonical IDs → point-in-time facts → features → P(W/D/L) → expected points → difficulty 0–100 → label`

- Difficulty = `100 × (1 − EP/3)` where `EP = 3·P(win) + P(draw)`
- Labels: Easy / Easy-ish / Normal / Hard-ish / Hard (thresholds tuned by backtest, see §4)

---

## 2. v1 scope

**In**
- Grid: 20 teams × matchdays, **Difficulty** and plain **Fixtures** views
- Three lenses: **Overall** (difficulty 0–100 from W/D/L), **Attack** (expected goals for), **Defence** (clean-sheet chance)
- Tooltip: win/draw/loss %, clean-sheet %, expected goals, rest days, kickoff status
- Horizon (Next 3/5/8/All), window arrows, sort, pin, search, insight cards
- "Date TBC" and rescheduled-match badges; times shown in `Europe/Madrid`

**Later**
- Injuries/suspensions (schema exists: `availability_snapshots`; needs an authorised source)
- Rest days / European congestion term, weather, market blend
- Accounts, planner, dark mode, Spanish translation

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

It replaces the current production path (`app/services/model.py`), which falls back to a hand-tuned Elo mapping and has a train/serve feature mismatch (see §7).

**What goes into the rating**

| Factor | Status |
|---|---|
| Team attack/defence strength, home advantage | ✅ in model |
| Form (recency weighting) | ✅ in model — backtest shows only a small gain, see §4 |
| Chance quality (shots on target proxy) | ✅ in model — the most useful addition |
| Promoted teams | ✅ prior; Segunda data still to add |
| Rest days / Europe / Copa | ⏳ needs UEFA/Copa fixtures (`context_snapshots`) |
| Injuries / suspensions | ⏳ needs authorised data |
| Weather | ⏳ total-goals adjustment only, never team-specific |
| Head to head | ❌ context only (tooltip) |
| Kickoff time / daylight | ❌ |

---

## 4. Backtest results (done)

Run: `python -m app.jobs.backtest` → [backend/reports/backtest_laliga.md](backend/reports/backtest_laliga.md)

Rolling origin: every Monday, fit on past matches only, forecast the next 8 weeks. Tuned on 2019/20–2022/23, scored on **2023/24–2025/26** (8,339 forecasts, all methods on the same matches).

| Method | RPS ↓ | Accuracy | Next-5 run ranking (Spearman) ↑ |
|---|---|---|---|
| Closing betting odds (ceiling) | 0.1886 | 55.5% | 0.617 |
| **Dixon-Coles (tuned)** | **0.1953** | **53.1%** | **0.554** |
| Dixon-Coles (no form, goals only) | 0.1960 | 52.7% | 0.542 |
| Elo (current fallback) | 0.2050 | 52.7% | 0.532 |
| Base rates | 0.2255 | 46.0% | 0.097 |

Findings:
1. The model closes **~82% of the gap** between knowing nothing (base rates) and the betting market; the current Elo fallback closes ~56%.
2. **Accuracy barely drops with horizon** (RPS 0.1949 at 1 week → 0.1962 at 6–8 weeks). An 8-week grid is sound.
3. **Form matters less than expected.** Best decay half-life ≈ 2 years; the no-form model is only slightly worse. Shots-on-target blending gives more.
4. **Tuning surface is flat** (top 8 configs within 0.0001 RPS). Prefer domain-sensible settings among ties (e.g. promoted prior −0.2).
5. **Labels:** proposed thresholds `(37.4, 48.6, 61.1, 71.3)` give 15/20/30/20/15 % shares. Middle bands are well calibrated; the extremes are too timid (Easy: 2.14 expected vs 2.32 actual points; Hard: 0.64 vs 0.53).
6. **Clean sheets are overestimated by ~3–5 points** in every bucket. The Defence lens needs recalibration before launch.
7. **Early season is not a weak spot** for this model: its gap to the market is smaller in Aug–Sep (0.0052 RPS) than in Oct–May (0.0071). Carrying ratings over from last season works.

---

## 5. Data sources

| Need | Source | Notes |
|---|---|---|
| Current fixtures/results | football-data.org (`PD`) | Free tier includes LaLiga; token in `.env` |
| Historical results, shots, closing odds | football-data.co.uk `SP1`/`SP2` | Cached in `backend/data/raw/` |
| Historical events/xG | StatsBomb Open Data | Limited historical subset |
| Current xG | Authorised/manual import | Understat has no API or clear licence; FBref lost Opta advanced stats (Jan 2026) |
| Suspensions | RFEF decisions | Human-reviewed PDF import |
| Injuries / market values | Authorised provider only | Transfermarkt Terms prohibit scraping |
| Europe/cup fixtures (rest days) | UEFA/RFEF feeds or paid API | football-data.org free tier lacks Europa/Conference/Copa |
| Weather | Open-Meteo | Check terms for commercial use |

**Branding:** team names only; no crests, no LaLiga logo or wordmark.

---

## 6. LaLiga calendar quirks

- Kickoff times are published matchday by matchday → nullable time + "Date TBC"
- Supercopa (January) moves 4 teams' league games → grid stays by matchday with a "moved to" badge
- Postponements → upsert by source fixture id (`fixtures.source_fixture_id`), bump `schedule_version`
- 3 promoted teams per season → Segunda history needed for priors
- International breaks → date gaps, not matchday gaps

---

## 7. Known issues in the current scaffold

1. **Train/serve feature mismatch** — `jobs/train.py` trains on `team_ppg5`, `shots_diff5`, `season_progress`…, but `services/feature_builder.py` produces `rolling_ppg_5`, `shots_diff_5`, `season_progress_pct`…. `OutcomeModel.ml_probs` fills missing names with `0.0`, so a trained model sees mostly zeros in production.
2. **Closing odds used as training features** — at prediction time (days before kickoff) there are no closing odds, so `market_p_*` arrive as `0.0` ("no chance of winning").
3. `feature_builder.py` computes `shots_diff_5` as shots − shots on target (own team), not team vs opponent.
4. Scoring labels use fixed thresholds that the backtest shows are unbalanced (11% Easy vs 12.8% Hard, 30.7% Normal).

Recommended: drive predictions from the Dixon-Coles model (§8 step 1) and keep the logistic model as a later ensemble candidate, retrained on features that exist at prediction time.

---

## 8. Next steps

| # | Step | Output |
|---|---|---|
| ✅ | Historical load + rolling-origin backtest + Dixon-Coles model + baselines | `app/modeling`, `app/backtest`, `jobs/backtest.py`, report |
| ✅ | Dixon-Coles drives `jobs/predict.py` (P(W/D/L), EP, difficulty, clean-sheet %, xG) | Real predictions in DB |
| ✅ | Backtested label thresholds in `services/scoring.py` | Balanced labels |
| ✅ | Team registry, grid API `GET /api/fixture-grid`, Open-Meteo weather, `jobs/refresh.py` | Frontend-ready payload |
| ✅ | Prototype design ported into `frontend/` on real data (lenses, horizon, sort, pin, tooltip) | Working site |
| 1 | Hosted database (recommended: Neon Postgres) + Alembic migrations | No Docker, safe schema changes |
| 2 | Recalibrate clean-sheet and extreme W/D/L probabilities (fitted on tuning seasons, verified on test) | Defence lens trustworthy |
| 3 | Add Segunda (`SP2`) history for promoted-team priors | Better early-season ratings |
| 4 | Rest-day term using UEFA/Copa fixtures; re-run backtest, keep only if it improves | v1.1 |
| 5 | Scheduled refresh, health checks, stale-data banner, Next.js security upgrade, deploy | Live |

**Database choice:** stay on Postgres (hosted on Neon) rather than Convex. The workload is Python batch
modelling and SQL analytics; Convex's strength (reactive TypeScript queries) isn't needed for data that
changes a few times a day, and adopting it would mean rewriting the models, jobs and API.

**StatsBomb Open Data:** not integrated. Its LaLiga coverage is historical and centred on Barcelona
matches, so it cannot supply current xG for all 20 teams. The adapter stays in `app/sources/` for research.

**Execution plan** (everything next: safety fixes, `CLAUDE.md` guardrails, cleanup/CI, pipeline reliability, refresh button + scheduling, frontend + crests, model optimisation): see [docs/next_features_plan.md](docs/next_features_plan.md). Evidence: [docs/upgrade_audit.md](docs/upgrade_audit.md).

## 9. Open questions

1. Hobby or commercial? Decides xG and weather sources.
2. Budget for a paid data API (xG, European/cup fixtures, injuries)?
3. Main fantasy game: LaLiga Fantasy or Biwenger?
4. Grid axis: strictly by matchday, or also a "by date" view?
