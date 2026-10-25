# One recommendation on Play; alternatives in Audit Strategies

## Owner contract — 25 October 2026

Play shows one recommended whole-GW plan with its cards, expected points and reward chances. Preserve the current recommendation rule (highest expected essence; published order breaks ties), allocations, long shots, rule details, essence preference, Pro rebuild and Check → Draft → explicit Enter. Put the owner's actual entered lineups above the recommendation for the selected GW, including a GW without a saved plan. No new manual collection steps, browser tabs, polling or source requests.

All other optimizer plans, Sorare projections, strategy lenses and saved hindsight stay accessible in Audit → Strategies for the same selected GW. Existing bookmarked `plan`, `by` or `after` views must reach their equivalent alternative instead of silently showing a different plan. Results charts, historical comparisons and missing-data states stay available. A future GW is planning, not a claimed historical result; hindsight remains labelled and available only after results.

## Delivery and acceptance

1. Trace existing plan selection, source blocks, frozen/archive fallback and entered-lineup reads. Capture the current real pages before the visible change.
2. Write failing tests for one recommendation, entered-first order, old links, all alternative sources and plans, GW preservation across navigation/reopening, missing plans/source data, future/finished/hindsight states and unchanged Apply confirmation boundaries.
3. Reuse the existing plan/card workspace in a dedicated Plans view under Strategies. Default Strategies keeps the podium and three results charts. Load only the view's required blocks, in parallel. Read plans through existing cached loaders; never duplicate models or recompute recommendations in a client.
4. Remove the plan/source selectors from Play and link to the same-GW alternatives. Retain one usable recommendation with real cards and explain its recommendation criterion in one short label.
5. Run required checks, Play/Audit/mobile specs and built navigation. Inspect real read models in the owner's Chrome at 1440 and 390 px; review the changed UI against Web Interface Guidelines. Ship directly with documentation and roadmap result, then verify live/local pages.

## Design

Visual thesis: keep Sofix's calm white card workspace, with actual entries first and one clear planning decision.
Content: selected GW and freshness; entered cards; recommendation with points/rewards and Apply; one link to alternatives. Strategies separates Plans from Results without replacing its charts.
Interaction: existing lineup sheets reveal detail; plan/source navigation names the selected choice; pending links respond immediately and motion respects reduced motion.

## Initial evidence

- Play currently offers optimizer plan tabs and five source choices. `bestPlan` selects highest expected essence, preserving published ties.
- Strategies currently reads summary/history only and has no future planning workspace. Its results charts must be preserved.
- `EnteredLineups` currently renders below the plan board on Play; its exact-GW loader and visibility throttle are already shared with Home.

## Verification

- Implementation: shared server reader, one Sofix recommendation on Play, entered lineups above it, average projected points, same-GW alternatives/return links, legacy redirects and exact source/GW guards. Alternatives do not load mission models or duplicate the private lineup reader. Results remain separate, including a Plans link before results exist.
- Regression evidence: the first alternative originally shared the default recommendation URL; a failing test reproduced it and explicit `plan=1` now preserves the choice. A failing phone test found 150 px rows truncating rewards; full-width 44 px rows now pass.
- Automated checks: the local gate passed generated types, eslint, typecheck and all 1,050 unit tests. Play/Audit/mobile specs passed across the main run and targeted corrections; three new navigation/workflow scenarios and the phone readability regression passed. The final local gate also passes after the last CSS edit.
- Built navigation: the final production build succeeds; the saved real GW25 has five Sofix plans, five Sorare plans and one per strategy lens. Recommendation is Sofix plan 3 (90% reward chance, 336 projected points per lineup). Source and plan changes preserve GW25. Built clicks between Plans, Results and the recommendation retain the selected GW; the Results podium and charts remain intact.
- Real owner Chrome: 1440 px and 390 px on local data, with desktop/phone screenshots. Every one of the five phone plan choices is 301 px wide and 44 px tall, with its full reward summary. Eight actual saved GW25 entries render above the recommendation, with actual scores and original card art; no horizontal page overflow. Fresh Sorare access reports unavailable, so this verifies the existing saved-read fallback, not a new live Sorare read. No Apply/Enter action was performed.
- Design review: semantic links, selected/pending states, visible focus, 11 px minimum text, phone wrapping, unchanged reduced-motion behavior. Screenshots are private local verification artifacts.
- No schema/model formula/extension release, polling or source request was added. Shipping gate: run `node scripts/check.mjs --live /play /audit/strategies` after the push and sync the main checkout without changing unrelated local files.
