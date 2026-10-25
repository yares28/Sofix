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
- Mission investigation and both design implementations are pending.
