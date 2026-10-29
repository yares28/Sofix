# Performance audit and ten-account capacity

Requested 29 October 2026. The target is **ten separate Sorare accounts**, confirmed by the owner, with stable,
responsive use. Ten people viewing the existing owner's board is not acceptance of this requirement.

## Workflow contract

Each person opens Sofix cold, connects their own Sorare account, sees only their collection, plans, entered lineups,
missions and rewards, changes GW, navigates between pages and returns after closing tabs. Shared football evidence
is reused; account-specific evidence preserves its account and GW identity. Missing values remain distinct from zero.
Expiry, publication and concurrent requests must not mix users, serve another account's saved state, or amplify work
in proportion to every browser request. Entry remains Check → Draft → explicit Enter. No paid upgrades or new spending.

## Audit and delivery

1. Inventory rendering, payloads, JavaScript/CSS, storage, caches, background requests, jobs and account boundaries.
2. Measure the production build locally with deterministic data: cold/warm pages, RSC bytes, static assets,
   ten concurrent clients and errors. Repeated load never targets production or real upstream APIs.
3. Inspect real published block sizes locally and the required production health/usage check. Distinguish measured
   results from historical reports and hypotheses. Do not represent mock latency as production capacity proof.
4. Add failing regression tests before fixing verified, bounded performance defects. Preserve UI, selected GW,
   source identities, missing/zero values and publication invalidation. Avoid caching private HTML publicly.
5. Record a complete account-isolation and capacity design with free-tier budgets, rollout sequence and explicit
   acceptance gates; changes to authentication, storage and the private extension protocol are a separate implementation.
6. Run the repository checks and relevant browser checks for implemented changes. Retain exact commands, limitations,
   before/after evidence and remaining work in this plan and the audit report.

## Acceptance gates

- Immediate fixes have failing-before/passing-after regressions and measured payload/work reduction.
- Local ten-client test records requests, errors, p50/p95/p99 latency and throughput for a stated workload.
- The ten-account release additionally needs authenticated account isolation in routes, caches, browser storage,
  extension messages and jobs; ten distinct deterministic identities; cold start, selected GW, tab closure,
  expiry and missing/zero coverage; representative real-account verification; and an extended concurrency soak.
- A cache hit, HTTP 200, mock test or ten viewers of one owner does not prove the ten-account release.

## Initial evidence

- Baseline commit: `75a0e36`. Working tree initially clean; detached worktree, main checkout kept intact.
- Required startup health check: deploy/home/backend/frontend/last refresh healthy; browser CI cancelled;
  Neon status check returned null because this worktree has no frontend local environment. Investigate using
  the configured main checkout before treating it as a production failure.
- Startup usage: last 30 days 49K function calls, 19.5 GB-hours memory, 100K CDN requests, 1.9 GB data out;
  last hour 116 calls / 40 s function time. Actual Fluid Active CPU is unavailable in the free usage API.
- Prior 27 October findings in `cacheable-pages.md` are historical evidence, not current latency measurements.

## Delivered audit and bounded fixes

[Full audit, measured findings, architecture and release gates](../docs/performance-audit.md).

- Confirmed live Neon status using the configured main checkout: Sofix D answers (1.48 GB sent); the other four are
  exhausted. The initial null was local configuration, not a failed production switch. No database write was made.
- Fixed Players client over-serialization and disabled prefetch on its long result list; fixture RSC fell 41.2%.
- Fixed low-level R2 download coalescing beyond six pending blocks; failed/missing low-level reads retry and different
  local sources no longer reuse each other's same-key/version memory entry. Higher-level null caching is not solved.
- Regression tests failed before and passed after (nine targeted cases). Local production builds succeeded; local
  check gate passed; fourteen Gallery/Players/foreign-player browser cases passed. Desktop/mobile mock inspection
  showed working search and no horizontal overflow. Owner Chrome real-data visual acceptance was unavailable; the
  fixes do not alter copy, layout or styling.
- Ten-client local sample: 1,800 warm RSC requests in 31.98 s, zero errors, p95 318.1 ms. It uses one owner and mock
  data, and does not prove ten-account isolation, phone responsiveness, memory stability or real source throughput.
- Stored measured evidence in `docs/performance-{before,after,soak,components}.json`; local-only repeatable probes in
  `scripts/performance.mjs` and `frontend/scripts/profile-performance.ts`.
- Found render-time 5,000-season simulation, dynamic pages, broad client grids/styles, global owner state, and a
  retained 700-second / 498-call Sorare step. The full release sequence remains open: compute shared projections,
  cache shared views, introduce account boundaries and shared collection/account planning, then prove ten identities.

The requested audit is delivered. The ten-account product is **not implemented or accepted** by this increment.
