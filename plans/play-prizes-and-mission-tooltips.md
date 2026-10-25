# Play prizes and mission bar details — 25 October 2026

## Requested outcome and workflow

Mission Audit keeps only the two compact outcome bars and side totals. Hovering, focusing or tapping a nonempty segment shows that category's pick hits/misses, distinct missions, saved reward amounts and the rarities with successful picks. No zero-hit rarity rows. Include both You and Sofix, existing rarity/action filters, pending/void distinctions and saved reward terms versus receipts. Escape/outside click dismiss; tooltips stay within desktop and phone viewports and work without hover.

Play must show usable before-kickoff projections for every entered lineup in the selected GW, including Pro and a custom lineup containing a player absent from the optimizer. Trace missing evidence instead of filling it with zero, another GW or final scores. Preserve the exact recorded recommendation, actual-check timing and one shared entered-lineup read. When source evidence really is incomplete, explain precisely which lineup and field is missing, and show the available cohort with an explicit denominator rather than suppressing the whole hero.

Replace confusing probability-weighted reward subtotals and ≥ signs with totals from the actual prize tier each lineup’s projected score reaches, and other attainable tiers/probabilities in a tooltip. Keep cash, essence kinds/rarities, card prizes and XP separate. Show only positive projected prizes and positive actual winnings; unpublished actuals stay pending, never silently zero. Explain that the former $0.21/29 values were weighted averages, not available prizes. Prize details must not require another tab or source refresh. Preserve zero-cost limits, no schema/extension changes unless source evidence proves necessary.

## Design contract

Visual thesis: the existing white two-column comparison with large clear figures; compact prize chips and quiet outcome bars expose detail only on intent.
Content: portfolio figures, attainable prizes versus winnings, lineups; mission bars with anchored category details and the existing chart/evidence.
Interaction: restrained tooltip reveal and selection transition, immediate keyboard/tap feedback, reduced-motion support. No decorative animation or repeated legends.

## Acceptance and release

Write failing regressions before fixes: Pro/custom/missing-player same-GW forecasts, partial-versus-whole denominators, real prize tiers (no invented weighted prize), hidden zeros, current actual receipts, mission category/rarity amounts with full-success bonuses and distinct mission counts, keyboard/touch/dismissal and no overflow. Cover cold start, navigation/reopening and source/GW identity. Run the repository gate, affected page/mobile checks and shared-code suite when required, optimized-build navigation, real owner Chrome at 1440/390 and design-guidelines review. Ship documentation and evidence together, then confirm only the changed production routes.


## Owner choice and evidence

- The owner selected: total prize at each lineup’s projected score, with other possibilities in a tooltip. The Projected column therefore sums real reached tiers; it does not show probability-weighted essence/cash averages or zero winnings. Exact per-tier probabilities remain available on intent. Rich prize details paginate at six options; both surfaces support hover, focus, tap, Escape and outside dismissal.
- Initial failing unit regressions reproduced missing same-GW evidence and weighted-versus-real prizes. Source captures cover all eight saved entries, including two Pro tasks and the custom Rodrigo captain lineup. The Pro board/step/target and roster bonus are checked independently from the actual result.
- The real-data page exposed a separate data gap: the answering Neon copy only holds the 19 October GW25 frozen block (one plan, no Pro; score_record and alternate blocks for that GW absent). Its generated page has GW24/26/27, so a same-GW merge alone cannot fill GW25. The exact earlier published pre-lock block survives in the local versioned cache: built 2026-10-23T13:21:37Z, frozen 14:11:19Z, five plans, 86 players, 316,229 bytes, SHA256 69d3fcaea9f5c00b3e63cc54187aff72cdf9f3e659b8b389403990441f86f2ff. No later-GW forecast or final result was substituted. A production restoration requires the owner’s explicit exception to the read-only rule; approval was requested with the exact key and cache scope.
- Real owner Chrome at 1440/390 confirms compact mission bars, correct category amounts and successful rarities, and no horizontal overflow. The live known cohort is displayed explicitly while restoration is pending, rather than hiding all point/risk figures. A pure offline check of the complete pre-lock block produces forecasts for all eight entries.


## Verification

- Initial focused regressions failed on the four new requirements; the repaired forecast/prize/mission/workspace units pass. The full frontend gate passes generated API types, zero-warning ESLint, TypeScript and all units after replacing the old assertion that reward totals were always visible.
- Affected browser run: 43/44 passed initially; the remaining mission case had an uppercase XP selector while the accessible name was lowercase. The corrected case and both new projection/cold-start workflows passed together. All seventeen phone checks passed. The optimized build passes all 37 pages; all four affected workflows pass on `next start` with isolated mocks.
- Real Chrome 1440/390: yellow segment shows 7 hits in 6 missions, Limited 200 / Rare 400 essence; Sofix XP details show its own results. No repeated legend or totals under either bar. The phone check caught a scrollbar-width placement error and an automatic-scroll dismissal; both were fixed against the actual content width, with tethered placement and no horizontal overflow. Rich prize details offer a lineup selector and six tiers per page, keyboard focus entry/return, Escape and outside dismissal.
- One real-data local RSC measurement: 1,200,152 bytes (development response 10.6 s, not a CPU benchmark). No source polling, extra Sorare call, migration or extension reload was added. No production record was changed while restoration approval is pending.

- Full browser run: 285/286 pass. The existing Team news assertion assumed its captured reading would always be called “yesterday”; a long run crossed the label’s date boundary and correctly rendered a weekday/time instead. The assertion now accepts both supported labels while still checking every changed-player value. The final five production-mode cases pass, including that assertion, all eight mock entries, real prize amounts, zero suppression, mission hover/tap details, cold-start geometry and keyboard focus entry/return. All seventeen phone cases passed in the full run.
