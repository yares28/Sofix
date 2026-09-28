# Sofix whole-app research and audit

**Review date:** 2026-09-27 · **Method:** source/route/schema review, model artifact inspection, deterministic browser
walkthrough, extension review harness, backend/frontend/design test runs, and cross-checking every tracked Markdown file.

This report is a current-state audit, not a future vision. It records what the code does, where the UI communicates
that behavior correctly, and where implementation, tests or older documents are still logically inconsistent.

## Executive conclusion

Sofix is now one integrated product with three sound boundaries:

1. a measured LaLiga model and fixture board;
2. a read-only cloud Sorare planning pipeline plus replay data;
3. a narrowly allowlisted local browser bridge for the few Sorare actions that require the owner's session.

Its production architecture is coherent and free-tier aware: GitHub Actions computes, Neon stores/publishes, Vercel
renders cached read models, and the extension runs only where a private browser session is necessary. The application
is not a weather app and no longer depends on a production FastAPI server—two facts that older docs obscured.

The football model is unusually well documented and its 0.1953 test RPS is meaningfully better than Elo/base rates,
though still behind closing odds. The Sorare side is useful but less mature: xScore is still a transparent heuristic,
and reward simulations make independence/spread simplifications that must remain visible until measured replay data
supports a better model.

## Inventory reviewed

- Nine web routes plus dynamic team pages, shared header/week selection and PWA metadata.
- Four production-facing same-origin APIs: refresh, revalidate, extension check-in and extension overlay.
- Python refresh, source clients, Dixon-Coles pipeline, odds fit, publishing and Sorare sync/planner/replay.
- Neon models/migrations and generated API/Zod boundaries.
- Manifest V3 background, bridge, content, popup, overlay and configuration scripts.
- GitHub workflow, cache/revalidation, setup/env references and all tracked Markdown.
- Full-page captures of Home, Play, Fixtures, Difficulty, Table, Cards, Players, Team, Control and Apply;
  extension panel/drawer captures from the real overlay bundle and recorded data.

## Current product behavior

### One calendar, two gameweek systems

The app correctly treats the selected date window as primary. LaLiga matchday numbers and Sorare gameweek numbers do
not align, so the header maps both instead of pretending they are interchangeable. If LaLiga has no round in a Sorare
week, football pages show the no-round state/unchanged cutoff and Sorare pages can still show playable cards. This is
logical and should remain explicit.

### Football board

The grid has six lenses, not the three/four described in old top-level docs. Overall, Attack and Defence are model
forecasts; Record and Vs odds are historical descriptive checks; Odds is the fair market view. Model lenses aggregate
future quantities, while record/market comparisons average per eligible game. That difference is intentional: sums
would reward clubs merely for having more priced/sample games.

Finished games retain the prediction and review, but are excluded from forward scales/totals. This preserves audit
value without contaminating planning. Difficulty labels now describe the club's status in ordinary football language
and the very-favourite cut is venue-aware.

### Tables

The current table applies head-to-head only when the pair has played both league fixtures; before then it uses the
remaining ordering. The predicted table is seeded, so rerendering identical data does not change percentages. The
opening projection is a fixed preseason artifact, preventing hindsight from rewriting the baseline.

### Sorare planning and replay

The cloud step uses public/read-only GraphQL and produces collection, competitions, forecasts, diverse optimized plans and a
market index. It records pre-lock player forecasts to `sorare_forecasts`; actuals can be joined later. Plans obey the
rule fields the sync captured and Apply asks Sorare to preview again before any write, which is the correct safety
boundary when competition rules can change.

The extension never becomes a general authenticated proxy: operations are allowlisted independently in the service
worker and page bridge. Account matching prevents the published owner's private plan appearing for another signed-in
Sorare account. Apply does not auto-run, and Enter is separated from Draft.

## Model findings

### Football model evidence

Current artifact: `dixon-coles-v1+42f7fe83`, trained/tuned only on 2019/20–2022/23 and scored on 2023/24–2025/26.
The 8,339-forecast test RPS comparison is:

| Model | RPS | Interpretation |
|---|---:|---|
| Closing odds | 0.1886 | Best external benchmark |
| Production | 0.1953 | Shipped result |
| Elo | 0.2050 | Benchmark only |
| Base rates | 0.2255 | Naive lower bar |

The remaining calibration weaknesses are favourites at 60–70% being under-confident, promoted teams adapting too
slowly after week eight, and raw clean-sheet probability being about four points high. The clean-sheet calibrator
addresses the third without claiming to solve the first two. A recent-team drift booster was tested and rejected
because its improvement interval crossed zero; that is good model governance.

### Market interpretation

Live 1X2 prices are de-margined. Team goal rates are fitted against fair 1X2 and over/under totals, then used to infer
scoring, clean-sheet, concede-two-plus and both-score probabilities. Calling those direct “bookmaker markets” would
be misleading; the UI/docs must say market-implied. Odds are blended into W/D/L only under the seven-day/48-hour/
three-bookmaker gate.

### Sorare forecast status

The current forecast intentionally prefers Sorare's conditional projection and play odds, with last-five priors as
fallback. It is not yet the proposed S4 fitted model and has not demonstrated that it beats Sorare's own projection.
The source comment correctly makes that a future replacement gate. Documentation that called S4 “done” was wrong;
S4 recording/replay infrastructure is done, fitted-model validation is open.

### Reward simulation assumptions

The planner uses 3,000 seeded draws, score SD 17.6 and beam width 120. The following limitations need measurement:

- player scores use a common spread rather than position/player/opponent-specific residual distributions;
- lineup outcomes simplify correlation between teammates, opponents and shared cards;
- combined “chance of any reward” multiplies miss probabilities as if plan outcomes were independent;
- reward cutoffs use the best available comparable history/current room evidence but competition populations change.

These make the percentage a decision aid, not a calibrated promise. Replay data should test calibration before any
model or UI claims become stronger.

## Logical inconsistencies and open issues

### Resolved during review — integration merge

The checkout initially contained unresolved Sorare backend/frontend/E2E entries. That integration was resolved and
landed on `main` as `8c4ff20` while this audit was in progress. The manual captures the same combined product surface.
The full verification matrix was rerun on this committed merge; its current results are recorded below.

### Resolved 2026-09-28 — one Sorare gameweek across two LaLiga rounds

The merged E2E run shifts the recorded Sorare calendar forward so countdowns remain live. That made Sorare GW15 span
both LaLiga GW6 and GW7 and exposed a real assumption in `seasonWeeks`: it creates one `Week` per LaLiga round and
assigns the same Sorare timeline item to every overlapping round. The result has duplicate `id`, `gw` and visible
“GW15” radios. Two Play tests cannot select GW15 uniquely, and the Home → Fixtures journey lands on GW6 when GW7 was
selected. This can happen in production around a midweek league round; it is not merely clock-dependent test data.

The model must represent one calendar window containing multiple LaLiga rounds (`md[]`/columns or a deliberate split
with unique IDs) while sharing one Sorare plan exactly once. Cross-page links must preserve the exact round, and a unit
test must cover one Sorare window overlapping two league rounds.

The alternate-port run had 49 passes and four failures: three from this root defect; the fourth only expected the QR
alt text to say port 3100 while the conflict-free test run intentionally used port 3200. The earlier Today/no-round and
post-refresh-cooldown failures both pass on merged `main`.

**Fixed.** A week is now one LaLiga round, with its own id and its own days, carrying the Sorare game week it sits
inside as a wider `span`; a game week with no round stays a week of its own. `pageWeeks` then gives each page the
rows it can open — every round to the board, one row per game week to Play — so the board can pick either round and
Play never offers the same plan twice. `weekDates(week, page)` prints the round's days on the board and the whole
game week on Play. Covered by unit tests for a game week over two rounds (`lib/weeks.test.ts`), and the Home journey
now asserts the bar shows the round it picked before the tiles follow it. The QR assertion reads `E2E_PORT`, and both
e2e ports follow the environment. Full suite on 2026-09-28: 55 Playwright passes, 244 Vitest, 265 pytest, 11 design
previews, ESLint/tsc/ruff/mypy clean.

### P1 — Sorare model gate still open

Enough pre-lock/scored gameweeks must accumulate before fitting and blind-comparing a replacement. Shipping an S4
model merely because data now exists would violate the same evidence standard used by the football model.

### P1 — accepted football RPS and generated report disagree

The operating contract calls 0.1953 the current production test RPS, while the generated 2026-09-16 report table
prints 0.1947 for the tuned model with its spread correction. The raw report is preserved rather than edited into
agreement. From the reconciled merge, rerun the canonical backtest and decide whether 0.1947 is an
accepted shipped configuration or only an experiment; update artifact, contract and report atomically.

### Resolved — demo fixture league mismatch

The E2E `/players` fixture contained Inter Miami examples while the page says LaLiga. The recorded fixture now holds
92 players from Barcelona, Atlético Madrid, Athletic Club and Celta de Vigo only. Cards of players outside LaLiga
remain in the owner's own collection, which is what a real collection looks like.

### Resolved — the refresh mock named removed weather work

`frontend/e2e/mock-api.mjs` now animates the steps the job really runs — sync, odds, predict, Sorare, publish — and
`team_registry.py` no longer describes stadium metadata as being “for weather lookups”.

### P2 — snapshot/value semantics must stay prominent

Cards and Players are latest-sync snapshots, not historical views selected by week. “Market value” is a cached Sorare
valuation, not a live listing or buy price. A “projection” is conditional on playing while xScore includes absence.
The new manual says this; future compact UI must not erase those distinctions.

### P2 — extension is coupled to a third-party surface

URL/card slugs and GraphQL operation shapes are more stable than generated CSS classes, but Sorare can change either.
The stored build/revision helps diagnose this, and the review harness exercises the real overlay bundle. A fake-Sorare
end-to-end contract and one real owner acceptance check are still required before retiring the old extension.

### Resolved documentation contradictions

- Open-Meteo/weather was removed from the implementation; old references are now explicitly historical.
- Production reads published Neon models directly; FastAPI is local fallback, not the Vercel data plane.
- The grid has six lenses and new labels, not three lenses or Easy/Hard labels.
- Elo is a benchmark, not a current runtime fallback.
- S7 overlay and S8 replay are implemented in the reviewed tree; the old plan listed both as unbuilt.
- GitHub Actions now requires Sorare/revalidation deployment settings in addition to football source settings.
- Home fixture rows publish the actual participating club/national team, identify every owned player in the game and
  use Play/xScore—not invented team odds—outside LaLiga. A selected Sorare-only week now says LaLiga is away instead
  of silently rendering the next league round.

## Security and operational assessment

Positive controls:

- DML-only app role for unattended jobs; direct owner URL kept out of Actions.
- Neon TLS verification and database identity guard before migrations.
- Same-origin refresh endpoint, server-only fine-grained GitHub token and explicit cooldown.
- Partial unique DB lock prevents concurrent refreshes.
- Odds calls are batched/throttled and raw request URLs/errors are not logged.
- Extension permissions/hosts are narrow; account matching and independent operation allowlists are defense in depth.
- Apply is preview → draft → explicit enter, never background automation.

Watch items:

- Do not add uptime checks to DB-backed routes: a continuous monitor would exceed Neon Free compute hours.
- Keep Vercel bypass and extension token out of generated screenshots/logs.
- If the extension is ever distributed, replace local shared-token installation assumptions with a lifecycle and update
  policy; the current design is intentionally one-owner/local.
- Third-party crests/card/player images are hot-linked and remain subject to third-party availability/licensing.

## Verification evidence

| Check | Result on 2026-09-27 |
|---|---|
| Backend pytest | 265 passed; two dependency deprecation warnings |
| Ruff | Passed |
| mypy | Passed |
| Frontend Vitest | 233 passed in 21 files |
| ESLint | Passed with zero warnings |
| TypeScript | Passed |
| Design preview checks | 11 passed |
| Playwright E2E | Full audit: 49 passed with 3 multi-round failures + 1 alternate-port QR artifact; new Home checks: 2 desktop + 1 mobile passed |

The first Vitest attempt hit a sandbox process-spawn restriction; the approved rerun completed normally. E2E used
alternate localhost ports because the default mock port was already held by another process. Remote Sorare artwork
was unavailable in the sandbox during capture, which is why the manual treats images as layout evidence rather than
proof of third-party asset uptime.

## Recommended order

1. ~~Redesign/test the shared calendar for one Sorare window containing multiple LaLiga rounds; make the QR E2E use its configured port.~~ Done 2026-09-28.
2. Canonically rerun the football backtest and settle the 0.1953/0.1947 accepted baseline.
3. ~~Remove the stale weather step/comment from the E2E mock/registry description and replace out-of-league mock players.~~ Done 2026-09-28.
4. Accumulate scored pre-lock forecasts; fit/replay S4 only under a declared holdout gate.
5. Measure reward-probability calibration and correlated outcomes before refining the percentage.
6. Add fake-Sorare extension E2E plus one live Check/Draft/Enter owner acceptance test.
7. Retire SorareExt only after the new extension passes that acceptance test and recovery steps are written.

## Documentation map and authority

| Question | Canonical document |
|---|---|
| How do I use every page? | [user_manual.md](user_manual.md) |
| What is built and what is odd/open? | This report |
| How is the system deployed? | [architecture.md](architecture.md) |
| What does each value/source mean? | [data_dictionary.md](data_dictionary.md) |
| How are calculations performed? | [how_it_works.md](how_it_works.md) |
| What proves the football model? | [fixture_difficulty.md](fixture_difficulty.md), [backtest report](../backend/reports/backtest_laliga.md) |
| What is planned next? | [next_features_plan.md](next_features_plan.md), [sorare_plan.md](sorare_plan.md) |
| What must contributors preserve? | [../AGENTS.md](../AGENTS.md) and [../CLAUDE.md](../CLAUDE.md) |
