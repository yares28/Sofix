# Who starts — check each game when its result is saved

Owner approval, 24 October 2026: remove the whole-GW plus 24-hour delay for Who starts, including FF's predicted eleven
and the Sorare/Sofix comparisons. Use every recorded player's saved start/non-start as soon as it is usable, independent
of ownership and browser visits. Do not speed up source requests or add manual refreshes. Keep corrections, source
identity and pre-lock forecasts; never turn a missing result into DNP or count a future game.

Score and Lineups finalisation keep their existing requirements. A start fact may be usable while Sorare reviews its
score. Full-GW score comparisons must still wait for their own boundary and all required double-game results.

Acceptance before implementation: cold job with already-saved results before GW end; a partial double; final, reviewing,
explicit DNP with a missing start flag, unknown flags, cancelled/pending and future rows; legacy start-only records;
pre-lock source/FF identity; corrections and repeated publication without duplicate counts. Confirm that Lineups and
full-GW score comparisons keep their existing finalisation gates. Rebuild from real saved data read-only, then check
the published read model after the automatic refresh. UI wording must describe per-game checks accurately.

Pre-change read-only evidence, 24 October: all 309 games in 20–23 October have usable results, and 232 of 3,079 games in
23–27 October have usable start facts (126 scores still reviewing). The current published start record counts none of
those two GWs because its next settlement deadline is 24 October 13:59 UTC. The other 3,173 recorded games are future.
The refresh, score and daily-history jobs have succeeded on the deployed settlement repair.

Implementation: per-game start eligibility requires a usable saved result and a kickoff no later than now. Both the
record and predicted elevens use it. A separate `scoreReady` marker retains the existing full-GW score boundary;
Lineups' final-status and complete-results checks are unchanged. Settlement version 2 makes the next automatic job
republish already-saved facts once, including an otherwise idle run, without new source requests.

Verification: four per-game workflow regressions failed before implementation. The focused backend run passed 73 tests,
including partial doubles, reviewing scores with zero, explicit DNP, unknown flags, future rows, legacy records,
corrections, frozen-source preservation and release publication without browser/source calls. An additional Lineups
assertion keeps REVIEWING scores unfinalised. All 22 Audit browser cases passed, including the new per-game wording.

Real data, database-enforced read-only reconstruction (9.85 MB): 20–23 October advances 0 → 309 checked, 23–27 October
0 → 232, all older GW counts stay unchanged, and the future GW remains 0/326. Source totals become Sorare 881/1,833,
Sofix 2,059/5,210 and FF 1,239/1,684. Predicted elevens become FF 534 checked / 436 started, Sorare 317 / 252 and Sofix
534 / 398. The complete full-GW xScore comparison object is identical to the published one. No production data write,
source call, migration or manual refresh was needed. Publication is through the automatic jobs after shipping.

The real-data dev preview was checked in the owner's Chrome at 1440 and 390 px: the new wording is visible and the
page has no horizontal overflow. Counts in those pre-release screenshots still use the existing published model;
the calculation above verifies the new counts separately, without replacing the owner's data source with a mock.
Evidence is in the session's audit-per-game folder. The final gate, built-page navigation and deployment are reported
in the handover. No layout or source-schedule change.

Final pre-push checks: the complete `node scripts/check.mjs` gate passed (ruff, mypy, full pytest, OpenAPI/type generation,
eslint, TypeScript and Vitest). `next build` passed. Clicking Lineups → Who starts in the built app showed the new rule;
desktop and phone screenshots were saved. No checks were unavailable. Production counts require the automatic publisher;
the data-reconstruction proof above did not publish or edit production data.
