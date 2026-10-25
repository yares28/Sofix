# Mission outcomes and Play comparison - 25 October 2026

## Owner contract

Mission Audit must agree with the actual picks and settled results shown in Limited/Rare history. Show who got more missions right and which missions/actions they got right. Under those charts, show two labelled segmented outcome bars, one for You and one for Sofix: missed, essence, XP and each clue reward. Missing and pending outcomes remain explicit; never turn absent evidence into a miss or invent reward receipts. Include saved settled selections even when the complete eligible-card ceiling is unknown; keep reconstructed picks clearly identified and outside captured forecast accuracy. Automatic settlement/publication remains automatic, with no extra manual reads, tabs or paid requests.

Play's top section must compare the owner's actual entered lineups with the recommended Sofix whole-GW plan. Large figures explain reward potential and risk, tied to the selected GW, with honest empty/partial/saved states. Retain the actual lineups, recommendation, alternative-plan navigation and Check > Draft > explicit Enter workflow. Distinguish projections from actual rewards, cash from essence, and XP from a paid reward. Use existing published numbers and lineup reward estimates rather than inventing a risk score.

## Delivery

1. Repair the prior release's red browser CI before behavior work; retain its real best-plan/custom-score/entered-GW acceptance assertions.
2. Trace and reproduce the mission summary/history mismatch using the current local models and a small read-only production summary if needed. Record the shared source and time boundary; add failing regression tests first.
3. Finish Mission Audit end to end: aligned settled selections, explanatory comparison charts, two outcome bars and drill-down showing the successful picks. Preserve coverage/forecast provenance and corrections. Ship this usable result before the Play redesign.
4. Redesign Play's header around You / Sofix, large reward and risk figures, real Sorare card art, a clear selected GW and one action. Test future/live/finished, absent own entries, partial results, all supported competitions and GW navigation.
5. Run local gates, affected page/mobile specs, production-build navigation and owner Chrome checks at 1440/390. Record real-data evidence and remaining source limitations. Ship each completed outcome directly to main with its documentation and roadmap result, then check only the changed production pages.

## Design

Visual thesis: a calm white comparison spread, with large aligned numbers and semantic reward colour; the owner can see the winner and the reason at a glance.
Content: Mission Audit leads with who won, an action-by-action chart, then two segmented outcome bars and the matching history. Play leads with entered versus recommended reward potential, downside probability and a compact strip of real lineup cards.
Interaction: one selection filters charts and evidence together; direct labels and focused details explain each segment; quick, restrained transitions respect reduced motion. No numeric card mosaic, unexplained charts or pill soup.

## Evidence and verification

- Initial CI: 281 browser checks passed; Recap's integration test still expected the removed Play plan tabs and old entered-below-plan order. Repair the assertions for the approved one-recommendation workflow, preserving exact best-plan contents and selected-GW coverage.
- CI repair shipped as `0e0ea39`: the failing Recap integration now verifies the exact four-lineup best plan, the entered-first order, alternative navigation and selected-GW preservation. Its regression and the local gate passed; the deployment check passed.
- Mission root causes: the published overview required every eligible candidate to be settled and complete, while history checks only selected players. Its chart also used a narrower shared cohort; newly imported mission/rarity rows could precede the published overview. Selected results were hidden despite being known. The live-page correction overlay previously updated only explicitly corrected overview rows.
- The result view now derives compact selection outcomes from the same history projection as the histories, once per page. The Missions page skips the redundant correction read in `loadAudit`. Frozen forecast accuracy stays separate. The race compares matched settled selections; action charts and outcome bars retain each side's independent record. Native controls keep rarity/action/page state in the URL and SSR restores it without an all-records flash.
- Current read-only proof: 115 source blocks, reduced to 1.79 MB by omitting candidate sheets/evidence. Source contains 163 missions. The new view matches `missionHits` exactly for both rarities and sides: Limited owner 12/25, Sofix 7/25; Rare owner 5/17, Sofix 1/15. Across 28 shared missions the owner hit 13, Sofix 6. Pick outcomes: owner 20 hit/84 missed/17 pending, Sofix 12 hit/86 missed/35 pending. Imported verdicts take precedence. These are saved-record results, not a new Sorare fetch.
- Six new logic regressions cover partial eligibility, pending/void/empty, mission-versus-pick counting, reconstruction provenance, reward units/rarities/full-house terms and full dated coverage. Render tests cover two outcome bars, unknown ceilings, pagination and SSR filters. The workflow browser regression deliberately keeps unpicked candidates pending/incomplete while confirming picked outcomes and rarity discovery.
- Audit/mobile suite: all 40 passed, including accessibility, no overflow and the text floor. Real saved-data owner Chrome at 1440/390 shows the two charts, segmented bars and original card art; private screenshots are retained locally. RSC was 0.55 MB before and 0.58 MB after, with the new compact outcome props. Web Interface Guidelines reviewed; the Sofix label colour was darkened after the accessibility test caught low contrast.
- The mission production build and final local gate pass. Built navigation from Strategies into Missions shows the exact current results. The restored-filter SSR regression and workflow recheck pass. Shipping checks follow the push; Play comparison redesign remains the next active step.
