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

## Follow-up: understandable match error, 11 October

Requested outcome: replace the unexplained decimal RPS headline with an intuitive match-forecast comparison.
No extra clicks to understand the result; keep all saved GWs and the same paired matches. Preserve the original
published statistic, zero/missing behavior and first-result availability.

Visual thesis: the same restrained white card, one-decimal error points out of 100, and proportional comparison bars.
Content plan: explain what is measured; label 0 as perfect and 100 as worst; compare Sofix and bookmakers; name the
lower error and gap in points; retain counts and put the raw RPS plus its full name and conversion in details.
Interaction thesis: existing entrance and native method disclosure; bars convey values without extra animation.
RPS is multiplied by 100, never inverted or presented as a percentage of correct predictions. The local normalized
formula in backend/app/backtest/metrics.py divides the sum of two squared cumulative probability gaps by two, so its
range is 0–1. The display range is therefore 0–100. Ties and gaps use displayed one-decimal error points.

Acceptance tests first: 0.1082 → 10.8/100; 0.0884 → 8.8/100; 2.0-point comparison, both lower-error sources, rounded
ties, first-result zero, worst score 100 and missing data. Raw RPS remains accessible in details. Run Audit desktop
and mobile specs and frontend gate; inspect real-data screenshots at 1440/390, review interface guidelines, ship.

Follow-up verification:

- The new regression assertions failed on the old raw-decimal display, then passed on the error-point display.
  Frontend gate passed: generated types, ESLint, TypeScript and Vitest.
- Audit desktop/mobile run: 18 passed and one existing history-navigation case missed the All GWs view change;
  that case passed on an isolated `npx playwright test --last-failed` rerun without code changes. No outstanding failures.
- Real read-model page at /audit?w=2026-10-09: asserted 10.8/100 and 8.8/100; 7 compared matches and 311 saved
  forecasts; method disclosure retained original 0.1082/0.0884 and odds date. Screenshots inspected at 1440/390:
  output/playwright/audit-error-scale-1440.png and audit-error-scale-390.png. No horizontal overflow.
- Axe WCAG A/AA scans on the real-data card, with details expanded, returned no violations at both widths.
- Interface-guidelines review: visible scale and units, positive lower-error text plus color, decorative bars hidden
  from assistive technology, semantic values and native disclosure, theme tokens, tabular digits and existing reduced
  motion preserved. The numeric statistic is rescaled, not replaced by accuracy; calculations and data are unchanged.
