# Arcade cards and controls — phase 2

Owner contract, 23 October 2026: larger real Sorare cards; compact FDR and xScore overlays at the upper right and edition bonus at the lower right. Below the art show only a large start percentage at the left, game crests at the right and xD below those crests. Keep fixture and source details accessible without adding prose beneath the cards. Mission odds remain conditional on starting. xD uses the existing expected-decisive formula, including starter and substitute chances, and is displayed as a decimal. Unknown values remain distinct from zero.

Add composable start-percentage and FDR filters, alongside existing search, league, position and edition controls. Sorting uses the same next fixture and displayed source as the card. Paginate the collection. Consolidate Arcade's board, scores and start-percentage reads into named icon controls at the upper right beneath the wallet, preserving automatic reads, fallback and errors. No new source requests, polling, extension permissions or paid services.

Visual thesis: a quiet white gallery led by larger original card art, with precise overlays and a short aligned evidence row. Content: existing Arcade hero and plans, shared action toolbar, missions, then the filtered collection. Interaction: fixture buttons change the card's visible fixture evidence; loading icons and press feedback explain reads, respecting reduced motion.

Acceptance tests before implementation: overlays inside the artwork; only start/crests/xD below; fixture selection keeps FDR, score, start and xD aligned; zero versus missing; start and FDR filters compose and reset pagination; clear filters restores the collection; named toolbar actions preserve board, scores and start reads, including failure and an old-extension fallback. Existing Arcade and mobile browser suites, local checks, production-build navigation, then owner Chrome screenshots at 1440 and 390 with real cards and no horizontal overflow. Record exactly what real data could prove before shipping.

Status: implemented and verified locally; deployment confirmation follows this commit.

Owner follow-up: the xScore overlay shows only the number, with the existing Sorare score-scale colour and readable contrasting ink. Its name and source remain accessible through the label and tooltip. Zero and missing remain distinct. Verify the number has no visible text label and changes colour across score bands, then check Arcade and the real desktop/mobile cards before shipping.

Follow-up verification: the previous label failed the rendering regression before the fix. Local checks and all 16 Arcade browser tests pass. Real Chrome at 1440/390 showed number-only orange 29/32, red 4 and yellow 45/46; unavailable scores stay grey. Both viewports fit. Captures: `arcade-phase2/score-colour-desktop.png` and `score-colour-mobile.png` in the session's visualization folder. This changes presentation only.

24 October release check: the score-badge commit deployed and CI passed all 1,016 unit tests, then its runtime dependency audit rejected the existing Zod 4.6.5 pin (GHSA-mrhx-c7xc-m3w5, updated 23 October; fixed in 4.6.6). Zod is pinned to 4.6.7 with only its lockfile entry changed. The runtime audit reports zero vulnerabilities; local checks, all 16 Arcade browser tests and the production build pass with the patched dependency. The audit gate is retained.

## Verification and limits

- The new collection/toolbar regression failed on the previous page before implementation. The first-fixture xD regression failed with a missing published field before the publisher changed. xD remains the existing expected-value calculation (starter plus substitute contributions); conditional mission odds are untouched. A double's better-game xD is never attached to its first fixture.
- `node scripts/check.mjs` passed backend formatting, lint, types, pytest and OpenAPI export, and frontend generated types, lint, types and the full unit suite. The final Arcade browser suite passed all 16 tests; the mobile suite passed all 16. Tests cover zero/missing, source identity, fixture switching, unknown FDR, combined filters, pagination reset, cold/resumed reads, the older-extension fallback and failed refreshes retaining the collection.
- `npm run build` passed. In the owner's connected Chrome, Gallery → Arcade navigation on `next start` rendered the real collection. At 1440 px card art measured 204 px wide; at 390 px the gallery used two columns and 44 px fixture/control targets. Neither viewport overflowed. Local captures are `arcade-phase2/desktop.png`, `mobile.png` and `toolbar-desktop.png` in this session's visualization folder.
- Real data: all 1,357 cards remained in the collection. Combining start ≥80% with FDR ≤50 returned 107 cards; the zero-start filter returned 118 cards whose visible values were 0%. The board, actual live scores, real art, crests, bonuses and 0–100 FDR were inspected. Fixture switching was proved with two mock fixtures; the real next-fixture xD values remain unverified until the scheduled refresh publishes the added field. Missing xD stays a dash in the meantime. No manual refresh is dispatched, per the owner's choice.
- The Web Interface Guidelines pass checked the changed controls for names, focus, loading/disabled/error states, text floors, reduced motion, image dimensions and mobile targets. No new server read, polling interval, extension release, dependency or paid service was added. The owner's unrelated main-folder changes are preserved.

## Players filters, 30 Oct 2026

On Your cards, six menus beside the ones already there. Each is its own menu. They combine, and any of them returns to the first page.

- **Tier:** All tiers, Icon, Star+, Star, Impact, Roster, Reserve. Sorare's `gameplayTier`: GOAT, STAR_PLUS, STAR, IMPACT, ROSTER, DNP. Star+ is its own choice. A plus tier with no menu of its own (Impact+, Roster+) uses the tier it sits above.
- **L5, L10, L40:** Any, ≥40, ≥50, ≥60, unknown. L5 is `LAST_FIVE_SO5_AVERAGE_SCORE`, L10 is `LAST_TEN_PLAYED_SO5_AVERAGE_SCORE`, L40 is `LAST_FORTY_SO5_AVERAGE_SCORE`. Unknown is no number. Zero is a number. The cut uses the rounded number.
- **Day:** Any day, each next-game day in Madrid, and No game. No game is a card whose club has no game before the set ends. A board whose games were not read matches neither.
- **xScore:** Any, ≥40, ≥50, ≥60, unknown. The same number the card shows for the next game.

L5, L10 and L40 are asked on the existing past-scores read (extension 0.4.20). Until that extension is reloaded they stay unknown. Tier, day and xScore use numbers the page already has.
