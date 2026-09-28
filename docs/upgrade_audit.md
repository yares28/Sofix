# Sofix upgrade audit

**Original:** 2026-09-14 · **Re-audited:** 2026-09-27. Full evidence: [research_report.md](research_report.md).

## Verdict

Original safety, reliability, cache, calibration and accessibility work shipped. The product is now unified LaLiga +
Sorare with PWA, direct-Neon read models, cloud refresh, replay and local extension. The in-progress merge was resolved
to `main` at `8c4ff20`; remaining risks are a multi-round shared-calendar defect, model/report baseline mismatch,
unvalidated fitted Sorare model and extension/live-entry hardening.

## Security/compliance

| Finding | Status | Evidence/next |
|---|---|---|
| Secret exposure | ✅ | Server env; sanitized odds errors; ignored extension config |
| Mixed migration/app authority | ✅ | DML app role; manual owner URL; DB identity/TLS guard |
| Concurrent/rapid refresh | ✅ | Partial unique lock + ten-minute gate |
| Broad Sorare session bridge | ✅ design | Five operations allowlisted twice; account match; no cookie export |
| Accidental entry | ✅ design | Check → Draft → Enter; nothing automatic |
| Destructive production action | ✅ guardrail | Explicit owner approval required |
| Rights/terms | ✅ documented | Personal use, hot-link assets, no Transfermarkt scraping/LaLiga mark |

## Pipeline

| Finding | Status | Notes |
|---|---|---|
| Production depended on FastAPI | ✅ | GitHub publishes Neon models; Next reads direct |
| Schema drift unattended | ✅ | Actions checks, never migrates |
| One failure blanks product | ✅ | Step status/isolation; usable prior/current publish |
| Neon budget risk | ✅ | Tagged one-hour caches; revalidation; no polling |
| Unnecessary weather | ✅ removed | Open-Meteo gone; references historical only |
| Odds credit control | ✅ | One ≥6 h batch; remaining credits in Control |
| Sorare needed home PC | ✅ public path | Cloud reads; only session writes local |

## Models

| Finding | Status | Evidence |
|---|---|---|
| Honest football holdout | ✅ | Tune 2019/20–2022/23; test 2023/24–2025/26 |
| Compressed extremes | ✅ | Spread 1.10 |
| CS overconfidence | ✅ calibrated | Logistic calibrator on 22,334 observations |
| Favourites under-confident | ⬜ | 60–70% band observed about 74% actual |
| Promoted adaptation slow | ⬜ | Drift booster rejected because CI failed |
| Accepted RPS vs report | ⬜ | Contract 0.1953; generated tuned row 0.1947; canonical rerun needed |
| Sorare fitted model | ⬜ | Current xScore heuristic; replay/fitting gate open |
| Reward calibration | ⬜ | Common SD/correlation/independence assumptions |

## UX/testing

Resolved on 2026-09-27: Home now uses a fixed card ratio, publishes the actual participating club/national side,
identifies the owned players in each fixture and labels Play/xScore instead of implying unavailable team odds.

| Finding | Status | Notes |
|---|---|---|
| Unified week/layout/accessibility | ✅ | Explicit dual GW mapping, named containers, reduced motion, zero-warning lint |
| Labels/lenses | ✅ | Five current labels, six lenses, backend-owned scales |
| User documentation | ✅ | Illustrated manual covers all pages/extension |
| One Sorare GW spans two LaLiga rounds | ⬜ | Duplicate picker IDs/radios and wrong round on cross-page link |
| QR E2E tied to port 3100 | ⬜ test-only | Use configured `E2E_PORT`; alternate conflict-free run used 3200 |
| Demo player scope | ⬜ test-only | Replace Inter Miami fixture entries with LaLiga players |
| Stale weather mock/comment | ⬜ test/docs | E2E run animation and registry comment still name removed weather work |
| Extension acceptance | ⬜ | Fake-Sorare contract + one real owner Check/Draft/Enter |

## Verification snapshot

- Backend: 265 pytest passed; Ruff/mypy passed (two dependency deprecation warnings).
- Frontend: 233 Vitest tests in 21 files; ESLint/TypeScript passed.
- Design: all 11 previews passed.
- Browser E2E full audit: 49 passed; three failures share the calendar defect; one is alternate-port-only QR text.
  The added Home regression journeys pass at desktop and mobile widths.
- Earlier Today/no-round and cooldown assertions now pass on merged `main`.

## Priority

1. Support multiple LaLiga rounds inside one Sorare window and make the QR test port-aware; correct mock players.
2. Canonically rerun football backtest and settle 0.1953 vs 0.1947 atomically.
3. Remove stale weather/out-of-league test-fixture content.
4. Accumulate and blind-score enough pre-lock Sorare weeks for S4.
5. Measure correlated reward calibration.
6. Complete extension contract E2E/live acceptance; retire SorareExt only afterward.
