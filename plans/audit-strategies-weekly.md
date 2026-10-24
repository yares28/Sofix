# Strategies: weekly results

Owner contract, 24 October 2026: verify automatic scoring and complete the weekly average actual points per checked
lineup for You, every saved strategy, Sofix plan 1 and Sorare plan 1. Keep the Sorare projection strategy distinct from
the whole Sorare plan. Show counts from the first result; missing is not zero. No extra page visits, player tabs or
manual refresh are required. Preserve frozen choices, scoring rules, doubles, captain/club bonuses and substitutions.

Coverage: every saved completed GW, including owner-only and Sorare-only weeks, late results and late private reads.
Each source uses its own recorded games. Missing/reviewing results remain pending after 14 days; missing historical
rules are unavailable, not a fabricated score. Repeated scheduled publications must not duplicate totals. Source
changes must reopen a cached week. The existing automatic jobs publish the results; no production data edits.

Acceptance tests before implementation: alternative-only players and conflicting game maps; actual zero versus missing
owner score, owner result without rank and draft exclusion; old pending results followed by settlement; cold start,
repeat publication, cache upgrade/orphan preservation and late owner-week arrival; weighted season averages and
source identity. Browser checks cover weekly summaries, all sources, empty/pending/unavailable states, bounded comparison lists,
retained GW selection after navigation/reload, desktop/phone and accessibility.

Visual thesis: a quiet white comparison workspace with aligned points and visible evidence counts.
Content: a compact season overview, then a selected GW's averages and expandable real-card lineups; prize detail stays
secondary. Interaction: native GW selection, paginated comparisons and short focus/hover transitions respecting reduced
motion. Reuse Sofix's controls and accessible native disclosures.

Initial findings: weekly averages exist, but are flattened into one long summary sentence. Sorare plan 1 is missing.
The reader discovers only weeks with strategy/Sofix plans, leaving out older owner-only weeks. Owner scores are gated
by rank and null scores become zero; incomplete weeks stop checking after 14 days. A shared game map can replace a
strategy's own fixtures. Cache version 2 keeps completed weeks without checking for later source changes.

Validation and real-data evidence will be recorded here before shipping. Missions and the single Play plan remain
separate deliveries. No new paid calls, schema changes or manual source refresh.

Implementation: four source families are read independently; the whole Sorare plan uses its own games and only rank 1,
while the Sorare projection strategy retains its own identity. Source-aware cache version 3 reopens changed inputs and
keeps orphaned history. The 14-day give-up is removed; incomplete scores, unavailable records and pending prize checks
are counted separately. Owner score zero is valid, an unknown score is pending, a missing rank delays only the prize.
Pending cards keep their identity and show no invented appearance flag. Audit publication version 5 adds owner-only
review-window boundaries to the existing automatic source-free job. No new source requests or schema changes.

Real-data proof: database-enforced read-only reconstruction includes 24 saved weeks rather than the publication’s 6.
Owner: 60 checked lineups, 18,325.03 points, 305.42 average; 4 rankless prize checks. A separate SQL aggregation of
saved private entries reproduces all three counts exactly. Sofix: 27 checked, 9,068.25 points, 335.86 average, with one
legacy incomplete record unavailable. Sorare plan 1: 25 checked, 8,306.69 points, 332.27 average. The frozen Sofix totals
are unchanged. Initial reconstruction read 5.29 MB; final reconstruction with pending card identity read 5.56 MB.
No production writes, player API calls or manual refresh. The normal push/scheduled workflow publishes these results.

Browser proof: owner’s Chrome, built-page navigation from Lineups to Strategies, real saved-data snapshot at 1440 × 900
and 390 × 844. Checked source and strategy averages, older owner-only weeks, GW19’s unavailable record and real cards.
No page overflow (1425/1440 and 375/390); a clean first load initially had no console errors. Reloads can log the existing shared metadata hydration warning
(React 418), also reproduced on the unchanged Starts view; the pages recover and their controls work. No warning
suppression or unrelated shell change is included. Guidelines pass covers semantic controls, labels,
focus, reduced motion, text floor and preserved URL selection. Local RSC is 525,208 bytes versus 1,745,996 before
(about 70% smaller); only the selected GW’s cards are rendered and unrelated mission history is skipped.

Checks: regression tests fail first for the scoring/discovery/cache/automatic-boundary defects. Focused backend suite
passes 14 cases. Repository gate passes formatting, lint, mypy, full pytest, OpenAPI/types, eslint, tsc and Vitest.
Production build passes. Audit/mobile checks initially passed 37/38; the remaining check used an obsolete CSS selector
for the restyled Strategies page and was updated. Broader browser verification and final publication are recorded in
the handover; no unresolved workflow substitution is accepted as complete.

The broad browser run exposed a pre-existing timing failure in Starts’ contrast scan: it sampled the 180 ms reveal
mid-fade (blended text #79797e, 4.19:1), before the resting contrast. Its check now awaits the chart’s actual opacity 1
state before running the same accessibility rules; no animation, contrast rule or assertion is disabled.

Final local verification: full browser run 275/277 passed; the two failing checks were the exact disclosure selector
and the pre-existing mid-animation contrast scan described above. Both passed after their fixes in the targeted
last-failed run (2/2). All 277 cases are covered across those runs, including the required phone suite. Frontend
unit tests passed 1,023/1,023 and final lint has zero warnings. No test remains failing or unavailable.
