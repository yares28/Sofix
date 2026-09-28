# How Sofix works, number by number

**Verified 2026-09-27.** This is the calculation/data-flow reference. See the [manual](user_manual.md) for operation
and [research report](research_report.md) for caveats.

## 1. Source to screen

```text
football-data.org fixtures/results ─┐
football-data.co.uk history ────────┼─> GitHub refresh ─> Neon normalized rows + complete read_models
The Odds API prices ────────────────┤                                  │
Sorare public GraphQL ──────────────┘                                  v
                                                               cached Next.js/PWA
                                                                        │
signed-in Sorare session <─ local allowlisted extension <───────────────┘
```

Production has no always-running Python server. FastAPI is local/typed fallback. Refresh order:

1. verify Alembic head (unattended runs never migrate);
2. sync fixtures/results and the current CSV cache;
3. sync one batched odds call if last success is ≥6 hours old;
4. replace current football predictions;
5. sync/forecast/plan/replay Sorare;
6. replace `grid`, `system`, `sorare`, `sorare_references`;
7. authenticated cache revalidation.

A partial unique index permits one running refresh. Button retry is ten minutes. Steps record status/timing and publish
usable state where possible even when an optional source fails.

Schedule in UTC: daily 07:17 and 22:43, Tuesday 13:23, Friday 17:23. Control converts to Madrid time.

## 2. Football inputs

- **football-data.org:** calendar/results/team identity. UTC kickoff, Madrid display; unassigned is Date TBC.
- **football-data.co.uk:** five-season goals/shots/on-target/closing odds; production fit uses last 730 days. Old files
  stay cached; current season is conditionally refreshed; new-season 404 means not published.
- **The Odds API:** EU h2h + totals. Remove each bookmaker margin, then aggregate fair prices. Usable for blending only
  within seven days, age ≤48 hours and ≥3 bookmakers.
- **Team registry:** canonical join among codes/spellings/colours/stadiums/Sorare odds aliases.

Market scoring/CS/concede/BTS values are inferred by fitting goal rates to fair 1X2+totals. They are not direct quotes.

## 3. Dixon-Coles

Training target per side:

```text
target = 0.70 × goals + 0.30 × scaled shots on target
weight = exp(-0.001 × age_days)
```

The fit estimates club attack/defence, league home advantage and low-score `rho`, with ridge 1.0, 730-day window and
neutral promoted prior. Conceptually:

```text
log(lambda_home) = intercept + home + attack[home] - defence[away]
log(lambda_away) = intercept        + attack[away] - defence[home]
```

Strengths are stretched 1.10 around their mean to undo ridge compression. A 0–10 Poisson grid receives Dixon-Coles
adjustments at 0–0, 0–1, 1–0, 1–1, is renormalized, then summed for W/D/L, xG and score events.

Eligible W/D/L blend:

```text
P_final = 0.65 × P_model + 0.35 × P_market
```

Missing/stale/sparse market means model-only, not zero. Clean-sheet display is calibrated:

```text
logit(P_calibrated) = -0.1542058812 + 0.9321588120 × logit(P_raw)
```

Fit `n=22,334`, through 2026-09-17. Other probabilities are not silently passed through this correction.

## 4. Difficulty and labels

```text
expected points = 3 × P(win) + P(draw)
difficulty = 100 × (1 − expected_points / 3)
           = 100 × P(loss) + 66.7 × P(draw)
```

Lower is kinder. Current bands:

| Bucket | Label | Cut |
|---:|---|---|
| 1 | Very favourite | `<36.0` home, `<23.4` away |
| 2 | Favourite | then below 48.6 |
| 3 | Even | 48.6–61.1 |
| 4 | Underdog | 61.1–71.3 |
| 5 | Big underdog | 71.3+ |

The strict away top cut makes the strongest label mean roughly the same win promise at both venues. Backend publishes
bucket and all scales; frontend renders them.

## 5. Six lenses

| Lens | Tile | Window/ranking |
|---|---|---|
| Overall | Expected-result difficulty | Sum expected points |
| Attack | Expected team goals | Sum xG |
| Defence | Calibrated clean-sheet chance | Sum expected CS |
| Record | Club's five-season result edge at model price | Average shrunk edge per eligible game |
| Vs odds | Same at bookmaker price | Average shrunk edge per priced game |
| Odds | Fair market win chance | Average market expected points per priced game |

Record/Vs odds require at least five club games and shrink toward an eight-game league prior; they never feed the
forecast. Finished fixtures retain forecast/review but leave future totals and scale cuts. Blanks count no match;
doubles include both.

Overview picks: FWD by xG, DEF/GK by CS, MID by 65% attack + 35% defence standardized blend. Kindest/toughest uses
per-game value so doubles do not win automatically. Next is match cards; Next 3/5/8 is one selected-price tile per GW.

## 6. Tables and review

Current standings stop after selected GW. Head-to-head applies only after both mutual matches, then GD/goals. Predicted
table fixes played points and runs seeded remaining-fixture simulations; identical input means identical percentages.
The opening projection is a fixed preseason artifact.

Finished fixtures keep pre-kickoff belief and add surprise/performance-gap/verdict. Results never rewrite the forecast.

## 7. Sorare public sync

The read-only key fetches Sorare gameweeks/games/cutoffs, leaderboards/rules/rewards, public owner cards/exclusions,
eligible tracks, player scores/projections/play odds, and the LaLiga squad/market index. References are reused to respect
rate/complexity/depth limits. Sorare's own games decide eligibility; its GW number is not a LaLiga matchday key.

Every published player game carries the actual participating side and crest as well as the opponent. That distinction
matters during international windows: a Real Madrid card representing Türkiye is shown as Türkiye, never Real Madrid.
Outside LaLiga the app shows chance to play and xScore, explicitly not a fabricated match-win probability.

Cards/Players are latest-sync snapshots. Market value is cached valuation, not a live listing. A double gameweek uses
Sorare's best-game behavior.

## 8. xScore

1. Last five with priors estimates P(play) and conditional score (priors 0.60 and 45).
2. Sorare conditional projection replaces score when present.
3. Sorare starter+sub odds replace P(play) when present.
4. For `g>1`, `P(any)=1-(1-p)^g` and conditional mean receives a best-of-two uplift.
5. `xScore=P(any)×conditional_mean`.

Common SD is 17.6. Source is published (“sorare”, “form”, “no game”). This is a transparent heuristic awaiting an S4
fitted/blind-tested replacement.

## 9. Optimizer/rewards

Seeded beam search (width 120), 3,000 score draws and repeated temperature-weighted whole-week searches enforce slots,
position/card/player uniqueness, rarity/in-season/club/cap rules, bonuses, captain and substitutes. A substitute is
used only when protection exceeds sacrificed value. Candidates are ranked by normalized cash + normalized essence and
filtered until card-set signatures differ by at least 20%; at most five are published. The two reward units remain
separate and are never converted by an exchange rate.

Cutoffs use current tables or comparable past gameweek/room samples. Probabilities use common spread and simplify
teammate/opponent/shared-lineup correlation; combined “any reward” treats plan misses as independent. They are aids,
not guarantees. `runs` controls repeated randomized searches; the fixed seed keeps identical input reproducible.

## 10. Replay

Pre-lock player forecasts are retained in `sorare_forecasts`; post-game actuals join without overwriting. Home/Play
compare submitted-lineup actual to original centre/range/reward threshold. Only rows captured before lock qualify for
fitting; one gameweek is not sufficient evidence.

## 11. Apply and extension

Public key cannot read private future lineups or mutate them. The extension bridges the existing signed-in tab with
two independent allowlists for identity, gameweek lineups, competition entries/capacity, preview/check, draft and enter.
The home Sorare section and Play ask for `so5Fixture(slug)` and its `mySo5Lineups`, so the selected timeline GW owns
the result even when no optimized `GameweekPlan` is retained. Card art/names and leaderboard names come from that
private response; they are not reconstructed from the current collection snapshot:

```text
Check (read-only Sorare verdict) → Draft (saved, not entered) → Enter (separate confirmation)
```

The page bridge keeps captured request headers in its closure; credentials/cookies do not go to Sofix. Overlay numbers
are gated by the extension token, cached 15 minutes in session, and anchored by card-picture addresses and Sorare slugs
rather than generated CSS.
Check-in sends public account/version/build/revision on change or every six hours.

## 12. Published/API contract

Local FastAPI and production `grid` model share `ApiResponse<FixtureGrid>` (`success`, `data`, `error`, `meta`). Consumers:

- validate generated/Zod types;
- use bucket/scales unchanged;
- distinguish missing from zero and model from market-derived;
- handle every blank/double/finished cell;
- keep UTC input/Madrid display;
- never expose server/DB/GitHub/extension secrets.

Schema change: Pydantic → OpenAPI export → generated TS → Zod → typecheck. Never hand-edit generated artifacts.

## 13. Evidence/change gates

Football: tune 2019/20–2022/23, test 2023/24–2025/26 once; ship only with significant RPS improvement or calibration
gain without loss. The accepted baseline is RPS 0.1947, reproduced by a canonical rerun on 2026-09-28; 0.1953 is the
same model without the shipped rating spread.

Sorare: use pre-lock records, declared split, compare with Sorare baseline and report uncertainty. Never call replay
blind if it used post-lock data.

Schema/runtime: migrations owner-only, dev branch first; unattended schema check only; keep caches to protect Neon.

## 14. Code map

| Concern | Primary code |
|---|---|
| Football fit/matrix | `backend/app/modeling/dixon_coles.py` |
| Predict/blend/calibration | `backend/app/jobs/predict.py`, `services/rating_predictions.py` |
| Grid/labels/scales | `backend/app/services/fixture_grid.py` |
| Sorare forecast/planner | `backend/app/sorare/forecast.py`, `planner.py` |
| Sorare sync/publish | `backend/app/sorare/sync.py`, `publish.py` |
| Web cache/load | `frontend/lib/api.ts`, `playData.ts`, `db.ts` |
| Football UI | `frontend/components/Overview.tsx`, `DifficultyGrid.tsx`, `FixtureBoard.tsx` |
| Sorare UI/Apply | `frontend/components/play/`, `components/cards/`, `lib/apply.ts` |
| Extension | `extension/background.js`, `core.js`, `bridge.js`, `content.js`, `overlay.js/css`, `drawer.js` |
| Operations | `.github/workflows/refresh.yml`, `frontend/app/control/`, `frontend/lib/github.ts` |
