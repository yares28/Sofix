# Arcade recommendations and card cleanup — 30 October 2026

## Requested workflow and acceptance

Opening Arcade automatically recommends the lives and teams to play from the owner's current board and all listed games. No extra visits, refresh clicks or Sorare entries are required. On step one, spending every available life is preferable when all misses reset to the same step with fresh lives before the next opportunity; preserve later-step risk and settlement/card holds. The Play/Hold comparison must describe the recommended group, with readable labels at 1440 and 390 px. Your move, its chain node/detail and Pick teams must use identical cards, captains and probabilities for identical games, target and availability. Editing the selected games or target may legitimately change the team.

Lineup cards use the collection's compact FDR (0–100) badge at the upper right and xScore below it; remove the visible range and repeated name/stat rows. Preserve source, fixture, unknown/zero and captain identity in accessible labels/titles and FF attribution.

## Design

Keep the white decision surface and real Sorare art. The decision leads, the full-width comparison follows, and the five cards carry their ratings. Existing button/focus transitions stay restrained and reduced-motion aware.

## Evidence and implementation

Before changes: climbWindows chooses quickLineup/normal probabilities; YourMove and chain details rebuild bestLineup/simulated teams; chain thumbnails retain quickLineup. Pick teams runs bestLineup independently. The bar shows one lineup rather than the recommended batch. More lives require a half-point gain even on step one, where exhausting lives resets without losing progress.

Regression tests precede implementation: step-one reset dominance, later-step holding, shared lineup/captain/chance, held cards and future windows; browser tests cover a cold start, card badges, readable desktop/mobile comparison and consistent view handoff. Existing extension navigation/expiry and source identity tests remain required. Real-data proof uses the owner's Chrome and local copied blocks, never a production sweep or Sorare write.

## Verification

- Implemented: exact simulated selection across all views, stable player/team sample streams and joint insurance odds, step-one reset preference, reusable card ratings, full-width comparison and preserved team handoff. The existing 60-candidate shortlist is retained; an exhaustive oracle checks pruning, and all target results are cached together rather than re-simulated per step.
- Test-first evidence: the original step-one regression returned one entry instead of four; the consistency regression selected a different captain; the initial browser regression found no badges on lineup art. All now pass.
- `node scripts/check.mjs`: all clear (script tests, generated API types, eslint, typecheck, full Vitest suite and documentation drift). `npm run build`: passed. `npx playwright test e2e/arcade.e2e.ts e2e/mobile.e2e.ts`: 37 passed; after the final search optimization, Arcade's 18 tests passed again. The focused selector/reset suite has 49 cases after retaining the concurrent form-parser test, included in the gate.
- Real data, owner's Chrome, local production build on 127.0.0.1:3001 with the main folder's copied blocks: clicked Home → Arcade; cold read returned 228 Divination commons and 92 games, then automatic board reads picked up the owner's newer collection. The recommendation was four entries today, 48% for at least one clear, against 28% for the later-only move. The first team's Diouf / Clauss / Sano (captain) / Buchanan / Samatta, its xScores 38 / 42 / 67 / 46 / 40 and its 36% individual chance matched Your move, the chain and the builder.
- 1440 px and 390 px screenshots inspected in that Chrome. Real Sorare art loaded; FDR/xScore badges stack on the art; no range/name block remains below; mobile labels fit their measured content width, no text under 10 px, and no horizontal overflow. The viewport override was restored. Web interface guidelines pass: semantic controls, image dimensions/alternatives, visible focus, source attribution, minimum text size, reduced-motion scroll and reflow checked on changed files.
- Limits: no Sorare lineup was entered, cancelled or settled by this work, so live reset/cancellation was not re-enacted; that rule retains the dated owner/board evidence in arcade-rework.md. Probability calibration and existing source-coverage/expiry policy are unchanged. The source help page was inaccessible during this session; no new external-game rule was inferred from that failure.
- Session-start production check: deploy and CI successful; Neon status unavailable from this worktree's R2 configuration, and the existing last-hour function-time budget was exceeded. No new server polling/reads were introduced. The main checkout has unrelated uncommitted work; it is preserved, and the isolated local production preview is used for verification.

Shipping integration: rebased onto the concurrent Arcade tier/form/day/xScore filter release, preserving every new filter and parser test. Re-ran the gate (application checks passed) and all 18 Arcade browser tests; the upstream extension field/version change needed its source-review hashes refreshed after inspection, and the documentation check then passed.
