# Missions Audit: results, coverage and comparison

## Owner contract (25 October 2026)

Finish Missions Audit and automatic statistics; add a chart that explains the result immediately. Compare the owner's picks, Sofix's captured picks and the best result available from the saved eligible cards. Show results from the first case. Do not repeat the unexplained bars, weekly tables or numeric clutter rejected on Strategies.

All saved mission records must be accounted for: checked, waiting, unsupported or incomplete. Missing forecasts and reconstructed forecasts must not become captured forecast accuracy. Missing own picks are not zero. Rewards retain their real unit and rarity, and unknown rewards are not invented. Existing history corrections and evidence remain available. No new manual page visits, tabs or collection steps. Existing scheduled jobs settle and publish without the browser being open. Historical eligibility that was never captured cannot be recovered by pretending it was complete.

## Delivery

1. Diagnose real saved mission coverage with small read-only summaries. Trace settlement/publication and existing history/reward contracts.
2. Add failing regression tests for coverage, same-mission comparisons, zero versus missing, incomplete/reconstructed forecasts and automatic publication.
3. Publish compact lifetime mission figures and comparison data; settle saved missions through the existing automatic publication path, with cached history reuse and no extra source requests.
4. Replace the floor-gated hero/table with a labelled comparison chart and a clear result, coverage and drill-down. Keep client props limited to what is drawn; paginate lists over 12 items.
5. Run checks and the page/mobile specs; inspect real data in the owner's Chrome at 1440 and 390 px and built navigation. Record what is and is not proved. Ship with this plan and roadmap result; let the scheduled refresh publish data.

## Design

Visual thesis: calm white space, strong typography and a single comparison graphic with directly labelled outcomes.
Content: immediate verdict and matched sample; comparison with best available; coverage with explicit reasons; mission evidence and existing editable history.
Interaction: local selection updates the comparison without a server render; focused evidence expands on demand; transitions respect reduced motion.

## Initial evidence

- `MissionsAudit` still gates its headline at `floor` and uses a by-mission table.
- `missions.record` silently skips missing/late/incomplete eligibility and missing Sofix predictions; own results are only counted after the Sofix comparison qualifies. Only 30 result rows are exposed.
- `settle_kept` runs in the full Sorare refresh; `audit.publish` used by half-hourly score checks and daily history does not call it.
- Production has dated mission blocks through 24 October; the source records exist. Further read-only summaries will establish their actual settlement and forecast coverage.

## Verification / results

- Implemented a compact lifetime overview, with one classified row per saved mission and independent own results. The existing captured-forecast record remains separate from reconstruction. The chart compares identical cohorts and labels total successes, averages, the per-mission ceiling and missed opportunities. Rarity, comparison, coverage and pagination controls stay local and survive reopening the URL.
- Reward equivalents use explicit saved per-choice/full-house terms only; flattened reward configs lose bonus conditions and are not interpreted as receipts. Units and rarities remain separate. Unknown terms stay unknown.
- Moved settlement into automatic Audit publication, covering the full refresh, half-hourly score checks and daily history. New mission imports/corrections wake an idle publication; future mission settlement boundaries join its clock. No source requests were added. Cached game history supplies actuals.
- Fixed monthly suppression at day/rarity granularity, updates to already-settled stats, deliberately empty captured allocations and void-only own games. Own corrections update the full chart record immediately, including dates outside the legacy thirty-row result window.
- Read-only production evidence: 157 saved missions / 371 candidates, including 42 missions with own selections. The local overview of those saved records accounts for 18 checked comparisons, 9 pending, 29 incomplete eligibility, 97 uncaptured forecasts and 4 unrated targets. Own outcomes: 20 successful picks / 51 checked mission records; 11 same-mission comparisons for all three sides. This is a snapshot before the next automatic settlement, not a promise that missing evidence is recovered.
- Regression tests were written failing first. Required local backend/frontend checks passed (ruff format/check, mypy, pytest, OpenAPI/types, eslint, typecheck, vitest). Audit/mobile suite: 38 passed initially; the remaining assertion incorrectly used a lifetime fixture total instead of its displayed dated records, was corrected, then both the Mission test and phone test passed. Accessibility, URL reopening and no server render on chart filters passed. Production build and navigation from Strategies into Missions passed against the read-only real-data snapshot. Desktop 1440 and phone 390 were inspected in the owner's Chrome; no page overflow or text under 11 px in the overview. Screenshots are in the local `missions-audit` evidence folder. Web Interface Guidelines reviewed: semantic controls, visible focus, chart alternatives, URL state and reduced motion.
- Real-data scope: published ledger and saved verdicts were read, never mutated. Missing forecasts/eligibility cannot be backfilled into verified accuracy. New production publication is left to the automatic workflow; no manual refresh, schema change, extension release or paid service.
