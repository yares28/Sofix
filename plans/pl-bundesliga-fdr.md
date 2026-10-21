# Premier League and Bundesliga FDR delivery

Owner authorization, 21 October 2026: implement FDR for Premier League and Bundesliga now; their xScore is deferred. This supersedes the earlier research-only boundary for this delivery. Preserve historical research and LaLiga's shipped settings. No cup or European expansion is required for this release.

## Requested workflow and acceptance

- Choose LaLiga, Premier League or Bundesliga on the football board; use Fixtures, Difficulty, Table and team details for that league.
- Keep the selected date window across league changes and navigation; never reuse one league's numeric GW as another's. A week without a fixture stays empty.
- Automatically collect all 20 PL / 18 Bundesliga clubs and the full regular-league season on the existing scheduled refresh, including when the owner's computer is off. All clubs, not just owned players.
- Fit each new league independently using its own football-data.co.uk history and the researched reference architecture. No claim of a superior algorithm. Do not apply LaLiga's clean-sheet calibration, odds blend or decisive-action rates to another league. Missing odds/player numbers stay missing.
- Preserve source fixture/team IDs, pre-kickoff forecasts and results; no duplicate clubs, cross-league cleanup, training, scales or published data. Keep LaLiga and Sorare unchanged.
- Publish bounded per-league blocks through the existing R2/Neon cache. No raw research archives in production; no paid API expansion or schema migration unless proven necessary.
- Tests first: cold start and every club, repeated refresh/source failure, missing versus zero, administrative results, independent training, date navigation, reload/tab/league switching and LaLiga regressions. Verify real source coverage, desktop/mobile and production-build navigation.

## Delivery checks

- [x] Inspect source/serving contracts; retain representative current-season responses locally without credentials.
- [x] Backend workflow and cross-league isolation tests fail before implementation, then pass.
- [x] Board/team routing and week persistence pass; desktop/mobile mock screenshots inspected. Real published-block screenshots follow automatic publication.
- [x] Run node scripts/check.mjs and relevant browser suite; inspect own diff.
- [x] Commit and ship under AGENTS.md when checks pass; verify blocks after automatic refresh.

## Session evidence

- Worktree started clean at f38917f and was rebased onto current main 6e268e7. Startup node scripts/check.mjs --live failed: shared Git FETCH_HEAD is not writable in sandbox and network fetch failed. Production health unverified; retry with scoped escalation before shipping.
- PL research replay covers 9,880 matches; BL covers 7,953 sporting results / 7,956 fixtures. Neither supports a replacement architecture. xScore deferred.

Implementation decision: new leagues use normalized typed in-memory fixtures and one compact read-model block each (grid:PL, grid:BL1), retaining fixture IDs and forecast timestamps in each cell. Their raw histories stay in the existing Actions cache, rather than inserting foreign fixtures into LaLiga-specific normalized tables. This requires no production migration and preserves automatic full-season collection. Existing LaLiga normalized rows and Sorare reads are unchanged.

Startup check with scoped escalation passed: all 15 production routes HTTP 200, Vercel and last refresh successful. The local football-data token is absent; two configuration checks made no provider request. Live source access is configured only on the existing GitHub workflow.

Verification evidence is kept in docs/pl-bundesliga-fdr-validation.md. Initial full node scripts/check.mjs passed; source math validated on public real data. Full browser suite and production-build checks are in progress. Exact configured feed and real published-block UI proof remain pending first automatic refresh.

The final local check passed all backend/frontend gates, including the new bootstrap tests. A push inside the existing cooldown automatically initializes only missing league blocks under the refresh lock; later pushes skip that bootstrap. It never reruns the LaLiga/Sorare/paid-odds pipeline.

Final production-build navigation: league switch with different GW numbers for the same date, reload, table, team in a separate tab and back, and player search passed. All 15 mobile cases passed after the toolbar fix. An overlapping browser run erased the desktop run's trace during teardown (an artifact-path ENOENT); browser runs must use separate output directories or run sequentially. A final sequential league check follows integration with main.

Rebased cleanly onto 21b6ffe. The sequential post-integration browser run passed all four selected cases, including both league boards and the strict phone-width check. The final complete local gate was rerun after integration.

## Shipped and verified, 21 October

- Feature commit c9a1e2e is on main and deployed to https://sofix-livid.vercel.app. The automatic Vercel deployment was missing initially; the existing project was deployed with the authenticated CLI, without changing settings or plans. The subsequent live check reports Vercel success and all 15 production pages HTTP 200.
- Automatic refresh run 39629396814 succeeded. The bootstrap used the configured source and published PL at 15:51:38 UTC and BL1 at 15:51:47 UTC; no manual workflow dispatch or local source token was needed.
- One bounded successful SELECT through the app's normal failover confirmed PL 20 clubs / 38 rounds and BL1 18 / 34, both model +0d8bec30. Publication guards also require the complete 380 / 306 fixture pairs.
- Real published boards were inspected locally at 1440 and 390 px: Arsenal/Aston Villa/Bournemouth and Köln/Augsburg/Bayern, correct crests and no horizontal overflow. Screenshots are in ignored frontend/output/playwright/*-real-*.png. A mock production-test cache was cleared before that proof; the real-data script rejects mock club names.
- Direct production HTML checks confirmed the selected PL/BL1 picker and real club data, both HTTP 200. Backend/frontend CI passed; the full browser CI was still running at handover. Local checks, build, 15 mobile cases, production-build navigation and the final four browser cases passed as recorded above.
- The main folder contains unrelated uncommitted changes and was preserved. The checked worktree's local production preview runs at http://localhost:3218. These final evidence-only documentation updates are retained locally for the next code shipment, respecting the no-docs-only-push rule.

FDR delivery acceptance is met. xScore, live Odds/Vs odds, retrospective preseason projections and the broader cups/European expansion are outside this release, as recorded in the contract and validation notes.
