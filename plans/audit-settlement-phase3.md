# Audit settlement — phase 3

Owner contract, 24 October 2026: Who starts must compare FF, Sorare and Sofix against the real result of each recorded game. Finished games must not remain labelled as future games waiting. Missing results, actual zero, non-appearances, reviewing scores, postponed/cancelled games and genuinely future games must stay distinct. `/audit/lineups` must use the same trustworthy results. Every eligible result reaches the published statistics automatically through the existing jobs, exactly once, without visiting pages or opening Sorare player tabs.

Delivery order: first trace and repair Who starts and Lineups together with their automatic settlement/publication, verify on real data and ship. Then verify weekly strategy averages, then Missions Audit completeness. The later one-plan Sorare change remains separate. Do not broaden the first delivery into a redesign or alter frozen predictions.

Acceptance before implementation: regression reproducing finished games still waiting; old weeks as well as the current selected GW; cold start and repeat job runs; both players retained and players no longer owned; source identity and pre-lock evidence; doubles count once per player/game; missing versus zero, known substitute versus no appearance, reviewing and postponed/cancelled games. Simulate the automatic job-to-published-statistics path using local data, with no page visits. Inspect representative real saved records read-only and compare the resulting counts. No production writes or manual refresh; respect the owner's scheduled-refresh choice.

Findings, read-only on 24 October (23 October UTC): the published Audit has 3,079 current-GW games and 326 upcoming-GW
games, all unchecked by the existing whole-GW rule. GW24 ends 23 October 13:59 UTC and becomes eligible 24 October
13:59 UTC; it has 309 stored results (251 final/DNP, 58 reviewing), so zero checked before that boundary is intentional.
GW23 has all 631 starts checked, GW22 has 246 of 247, GW21 all 622. These counts do not establish that every unknown
game has finished; do not invent results to clear the count.

Thirty current-GW records explicitly say DID_NOT_PLAY / played=false / started=null. One read-only request using the
existing automatic score-check query against Sorare's official GraphQL endpoint confirmed the representative source:
game Game:293d223f-165f-478e-9603-9060d636dd8f, 23 October 18:30 UTC, statusTyped=played. Justin Diehl and Tiago Tomas both
have scoreStatus=DID_NOT_PLAY, playedInGame=false, gameStarted=null, minsPlayed=null. The adapter previously rejected
these known non-starts. No source limit or user workflow substitution was needed; no production rows were changed.

Reproduction without credentials: use test_player_audit's explicit-DNP regression, the idle-score-job boundary test and
the daily-history cold-start test. The five initial regression cases failed before their fixes. test_frozen_scores also
reproduces an alternative-only player omitted by the shared Sofix game map, a missing result permanently closed after
14 days, an old incorrect final cache, and a board's missing reward cut masked by another board's available cut.

Implementation: explicit DNP normalization at audit read time; only valid result statuses accepted; a two-field idle
deadline check with no history reads or source calls; daily-history Audit publication and cache invalidation; source
specific lineup game maps fetched together; versioned lineup cache rebuilt once while preserving orphaned history;
missing actuals or a reward board's cuts never become final just because 14 days passed. Competition wording now says
"0 of N checked", covering future, settling and missing games honestly. Frozen forecasts and the 24-hour boundary stay.

Additional automatic coverage: the daily reader retains recorded owners' unfinished games even after their cards are
sold, dropping those extra reads once results are final. Its correction window includes old REVIEWING and unset-status
rows, even after newer final games arrive. New history reads preserve null appearance/start flags rather than coercing
them to false; an explicitly false appearance can still prove a non-start. Each case failed in its regression first.
These changes do not reconstruct the provenance of any older already-coerced boolean.

Real-data proof: one database-enforced read-only reconstruction of the entire Audit succeeded (27.01 MB read, no
publication). Mature source totals remained Sorare 526/1,833, Sofix 1,519/5,210 and FF 1,021/1,684. It scheduled the next
boundary at 24 October 13:59 UTC (15:59 Madrid). Rebuilt Lineups preserves the known point/prize totals and reopens GW21's
incomplete reward checks instead of treating another board's cuts as evidence for them. A missing legacy plan rule
remains unscorable, never a made-up score. The post-release unattended publication still awaits its automatic run; no
manual refresh, production data write, migration, browser-dependent result collection or replacement workflow was used.

Browser proof: real read models in the owner's connected Chrome at 1440 and 390 px, both dev and production-mode
navigation. Who starts has no page overflow. The real Lineups page exposed an existing 6 px phone overflow; the failing
regression reproduced it, and a keyboard-focusable comparison scroller now contains it (page width 375 at viewport 390).
Evidence screenshots are in the session's audit-phase3 folder. The documented phone text floor is 10 px (CLAUDE.md).

Checks: the 21 existing Audit browser cases and all 16 mobile cases passed; the new phone regression passed separately
after its assertion used the documented phone text floor. The focused backend suite passed 51 cases before the final
null-flag regression; the final repository gate includes that regression too. Final gate/deployment status is recorded
in the handover. Production-build compilation, lint and type checking passed.

Final local gate: `node scripts/check.mjs` passed ruff format/check, mypy, the full pytest suite, OpenAPI export, generated
API types, eslint (zero warnings), TypeScript and Vitest. Both source-coverage regressions and the null-flag regression
are included. All 38 relevant browser cases passed across the full run and the corrected phone regression rerun. No
checks remain unavailable. Final real Chrome screenshots use the successful production build, with no page overflow.

Strategies' weekly points averages and Missions completeness are still the next deliveries,
not completed by this settlement repair. The strategy audit's existing 14-day rule is deliberately unchanged here.
