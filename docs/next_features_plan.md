# Sofix execution plan

**Updated 2026-09-27.** Work phase by phase and tick tasks here. Evidence is in the
[research report](research_report.md); Sorare detail is in [sorare_plan.md](sorare_plan.md).

Status: ✅ complete · 🚧 partial/proof pending · ⬜ open.

## Overview

| Phase | Theme | Status |
|---|---|---|
| 0 | Security/destructive guardrails | ✅ |
| 1 | Contributor and user documentation | ✅ refreshed |
| 2 | Dependencies, CI, migration/type drift | ✅ |
| 3 | Reliable sync/lock/observability | ✅ |
| 4 | Schedule, refresh, read models, cache | ✅ |
| 5 | Football UX, PWA, responsive/accessibility | ✅ |
| 6 | Football model/backtest/calibration | ✅ with research questions |
| 7 | Sorare integration/replay/extension | 🚧 |
| 8 | E2E/release hardening | ⬜ |
| 9 | Next measured improvements | ⬜ |

## 0 — Safety ✅

- [x] Ignored/server-only secrets; sanitized logs.
- [x] Neon verify-full TLS, database identity check, DML/owner role separation.
- [x] Explicit approval for destructive SQL/branch actions.
- [x] In-memory/mocked backend tests and narrow extension hosts/operations.

## 1 — Documentation ✅

- [x] Reconcile README, PLAN, AGENTS and CLAUDE with production.
- [x] Illustrated all-page/extension manual.
- [x] Architecture, data dictionary and whole-app audit.
- [x] Mark weather/FastAPI/old label/lens descriptions as removed/historical.
- [x] Document model/optimizer limitations without overstating precision.

## 2 — Codebase/CI ✅

- [x] Python 3.11 locks; Ruff, mypy, pytest, migration drift and audit.
- [x] ESLint zero warnings, TypeScript, Vitest, generated API drift and npm audit.
- [x] Playwright journeys and design-preview checks.

## 3 — Pipeline ✅

- [x] Idempotent fixture/results sync and cross-source registry.
- [x] Batched/throttled fair odds with credit reporting.
- [x] Replace predictions per model version; step-level run audit and single-run lock.
- [x] Unattended schema check/manual migrations.
- [x] Remove Open-Meteo/weather (2026-09-16).

## 4 — Always-on production ✅

- [x] Four UTC cron triggers plus dispatch.
- [x] Neon read models consumed directly by Next.js; FastAPI local fallback.
- [x] One-hour named caches/authenticated revalidation.
- [x] GitHub-backed same-origin refresh button and cooldown.
- [x] Control status/schedule/connections/limits/setup and PWA install.

## 5 — Football product ✅

- [x] Home/Fixtures/Difficulty/Table/Team share one week.
- [x] Six lenses, backend-owned buckets/scales, blank/double/finished handling.
- [x] Bento runs/matches/picks/ranking/aligned table and Next/3/5/8 price views.
- [x] LaLiga tie-breaks, seeded projection, optional crests.
- [x] Responsive/container layout, keyboard/focus/reduced motion.
- [x] Fixed-ratio Home cards; actual club/national side and owned players per fixture; honest no-LaLiga week state.

## 6 — Football model ✅ / monitored

- [x] Blind tune/test split, Dixon-Coles versus closing odds/Elo/base.
- [x] Stretch and CS calibration; venue-aware strongest label.
- [x] Gated market blend/implied secondary values; post-match review/opening projection.
- [x] Reject unproven drift/promoted booster.
- [x] Canonically rerun and settle the accepted baseline: **0.1947** (2026-09-28); 0.1953 is the same model without the shipped rating spread.
- [ ] Revisit favourite/promoted calibration only with predeclared held-out candidates.

## 7 — Sorare 🚧

- [x] Public sync, collection, competitions/rules/rewards and dual-calendar mapping.
- [x] Cards/Players latest-snapshot pages.
- [x] Transparent xScore heuristic, repeated diverse whole-week optimizer and pre-lock replay.
- [x] Check → Draft → Enter Apply.
- [x] Read and show the owner's real entered/draft lineups at the top of their selected Sorare GW.
- [x] Account-matched overlay/plan drawer.
- [ ] Fit/blind-test S4 after enough scored weeks.
- [ ] Measure reward correlation/calibration.
- [ ] Fake-Sorare E2E and live owner acceptance.
- [ ] Retire SorareExt only after acceptance/rollback proof.

## 8 — E2E/release ⬜

- [x] Merge reconciliation landed at `8c4ff20`.
- [ ] Represent two LaLiga rounds in one Sorare window without duplicate IDs/radios or wrong cross-page routing.
- [ ] Add unit/E2E coverage for that midweek-round case.
- [ ] Make QR alt-text E2E use configured `E2E_PORT` so alternate ports remain valid.
- [ ] Replace non-LaLiga `/players` mock examples.
- [ ] Replace the removed `weather` step in the refresh mock and stale registry comment.
- [x] Run local backend/frontend/design/E2E matrix; record 49 E2E passes and the four explained failures.
- [ ] Run CI after the calendar/test fixes.

## 9 — Measured improvements ⬜

- [ ] Analyze position/player-specific Sorare residual spread.
- [ ] Model/bound teammate/opponent/shared-lineup correlation.
- [ ] Add Sorare calibration plots after adequate sample.
- [ ] Extension payload/version negotiation and unsupported-revision recovery.
- [ ] Recheck third-party terms before any distribution beyond private use.

## Completion rule

Checked means implementation, tests and docs agree. Preview/fixture/unverified working tree alone is not complete.
Model work also requires its declared holdout/calibration gate.
