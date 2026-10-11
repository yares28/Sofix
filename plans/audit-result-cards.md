# Audit result cards — 11 October 2026

## Requested outcome and workflow

Make Written before the lock and Match forecasts, checked communicate their existing results at a glance. Preserve
their position, scope (all recorded history), pairing rules, published numbers and no minimum sample gate. A cold
load or selected-date URL shows the same saved statistics; no extra user action is needed to see the results.

Visual thesis: calm white surfaces, large tabular numbers and one restrained green accent identifying lower error.
Content plan: each card leads with its result, then its sample counts; methodology stays available in a native details
control. The pair card explains what its percentage means and shows compared pairs, recorded GWs and checked player
GWs separately. The match card places Sofix and bookmakers side by side, labels lower RPS as better, and states the
absolute difference. Avoid repeating a collapsed confidence interval as “65% (65%)”.
Interaction thesis: existing card entrance remains; details disclose secondary explanations and retain visible keyboard
focus; existing reduced-motion rules remain. No ornamental motion, extra imagery or new dashboard panels.

Acceptance first: first-pair/real-zero accuracy, distinct sample counts, non-degenerate range, missing statistics,
each source winning, equal displayed values, zero versus absent RPS. Check desktop and phone, current real-data
statistics and the existing Audit navigation/URL workflows. Run the frontend gate and Audit desktop/mobile specs,
inspect 1440/390 screenshots, review Web Interface Guidelines, then ship through the normal direct-to-main workflow.

## Implementation and evidence

- Extracted PrelockAudit: a large descriptive accuracy rate, separate pair/GW/player-GW counts, and a native method
  disclosure with the published confidence range. Same all-history scope, pair rules and first-pair availability.
- Restyled MatchAudit with large paired RPS values, a text label on the lower error and the absolute gap. Comparison
  uses the displayed four-decimal precision so equal displayed values cannot claim a winner. Saved forecasts and
  paired results remain distinct; methods and odds provenance are available in native details.
- Regression tests were written first and failed with the new component absent. They now cover first-pair zero,
  missing statistics, a collapsed range, both lower-error sources and a tie at displayed precision. Browser coverage
  checks a cold selected-date load, reload, sample counts, a non-degenerate range, disclosure and accessibility.
- Local frontend gate passed (generated API types, ESLint, TypeScript and Vitest). All 19 selected Audit desktop and
  mobile tests passed, including the existing navigation, closed-tab and selected-GW workflows.
- Real read models on localhost:3002/audit?w=2026-10-09 showed 65% on 20 pairs in one GW, 17/875 player GWs checked;
  Sofix RPS 0.1082 versus bookmakers 0.0884 on 7 paired results, 311 forecasts saved. No source calls or data writes.
- Inspected screenshots at 1440 and 390 px: output/playwright/audit-results-1440.png and audit-results-390.png.
  No horizontal overflow. Primary results and all sample counts are visible without opening the methods.
- Web Interface Guidelines pass on the three Audit components and audit.css: semantic headings and description
  lists, native keyboard disclosures with visible focus, tabular figures, theme-aware lower-error text, named
  container queries, readable text and existing reduced-motion behavior. No extra assets or decorative charts.
- Acceptance criteria met on the published real-data cases; synthetic tests cover zero, missing and tied cases that
  are absent from the current published aggregates. Calculations and source coverage are unchanged.
