# Audit follow-ups — 11 October 2026

## Owner's requested outcome and workflow

The top bar is the only GW selector. In Gameweek mode, Your players must follow it, including cold loads, URL reloads,
view navigation and an old address containing `scoreGw`; remove the competing local selector. All GWs and Summary
remain available. Rank individual games within each GW by actual score descending, including a real zero, then DNP,
then pending/missing results. Rank the all-time player summaries by their average actual score descending.

Show each game's saved pre-lock FF, Sofix and Sorare start percentages beside the observed start outcome: Started,
Did not start, or Pending/Unknown. Preserve 0%, distinguish missing sources from zero, and never borrow another game
or a later forecast. Expose retained per-game source values in the backend comparison payload; existing records must
also be readable through the app's cached, read-only record path while a new audit publication arrives.

Show the actual paired ranking success rate and confidence interval in Written before the lock from the first pair,
and Sofix/bookmaker RPS in Match forecasts, checked from the first paired result. Name sample counts, but remove the
100-case display gate in these two marked sections. This explicit request overrides their previous threshold rule;
it does not change forecasts, pairing rules or eligibility. Missing comparisons remain missing, never fabricated.

## Acceptance

Failing tests first: selected top-bar GW wins over stale local parameters and survives navigation/reopening; no local
GW combobox; actual ranking in Gameweek/All GWs/Summary; frozen per-game start-source identity, zero/missing source
and started/substitute/DNP/pending outcomes; pair accuracy and match RPS visible below 100, with no divide-by-zero
for an empty sample. Run the local gate, Audit spec and phone Audit spec. Inspect 1440/390 real-data screenshots.
Publish through the normal pipeline; no production database writes or manual refresh dispatch.

## Implementation and evidence

### View explanations follow-up

Owner request: explain Gameweek, All GWs and Summary beside their controls. Keep one short explanation directly
under the tabs for the selected view; changing tabs updates it, and a cold URL or reopened tab shows the matching
explanation. Gameweek means individual games in the top-bar GW, All GWs means every retained game grouped by GW,
and Summary means per-player checked-start averages, total diff and average miss across retained GWs. Keep the
existing minimalist layout and avoid repeating the summary explanation in the methodology note. Acceptance: each
tab and a direct/reopened Summary URL show the corresponding text; desktop/mobile checks remain clean.
The frontend gate passed (API types, eslint, typecheck, Vitest). Real-data previews of all three views showed the
matching explanation with no horizontal overflow; screenshots at 1440 and 390 px were inspected. The change adds
only descriptive copy, a screen-reader description and native hover hints; score calculations are unchanged.
Audit desktop spec and its mobile layout case passed: 18 tests, including all three explanations and reopened Summary URLs.

- Removed the local GW control and its `scoreGw` override; URL tabs retain the top-bar selection. Games sort by known
  actual score, then DNP, then pending. Summaries sort by checked-start average actual.
- Comparison rows expose the exact frozen game's start-source values and FF match link. Cached older payloads restore
  those from the matching retained record; wrong GW, wrong game and post-lock records are rejected. No extension action
  or fresh provider call is needed. Missing pre-lock numbers remain absent, not zero.
- A real-data SELECT identified 30 `started: 1` results which boolean-only UI checks missed. Normalize Sorare's 1/0 flags
  on ingestion, backend comparison and cached frontend rows. Missing flags stay unknown. Test-first regressions reproduced
  both the numeric-flag failure and the old 100-result gates, stale GW override and missing source display.
- `node scripts/check.mjs` passed ruff format/check, mypy, pytest, OpenAPI export, generated API types, eslint, typecheck
  and Vitest. Initial gate caught one remaining old threshold assertion; updated it to assert the first pair's real zero
  rate, then the complete gate passed. No unresolved check failures.
- Audit desktop spec plus the Audit mobile case: 18 passed. Coverage includes cold load, closed/reopened tabs, stale
  `scoreGw`, no local selector, source fallback with exact identity, 0% versus absent, numeric start flags, substitutes,
  DNP, pending, ranking, accessibility and horizontal overflow. The shared mock was not changed.
- Real-data local UI at port 3002 inspected at 1440 and 390 px; screenshots in
  `output/playwright/audit-followups-desktop.png` and `output/playwright/audit-followups-mobile.png` (ignored).
  Current GW21 has 84 rows, 49 checked and 28 confirmed starts; its restored xScore average miss is 17.6 points,
  Sorare's 17.8, signed diff +8.8. All five retained GWs have 265 rows. FF chances exist for 74 GW21 rows and Sofix for 75;
  no retained Sorare start chances exist in these five records, so those cells show a dash. No later odds are substituted.
- New backend calculations verified against the real database in an explicit READ ONLY transaction: live 65% on 20
  pairs, Sofix match RPS 0.1108187082 and bookmakers 0.0902807383 on six pairs. No data was published or changed by this
  check and no provider calls were made. The first local attempt used the root's placeholder connection; verification
  succeeded using the app's configured database connection.
- Web Interface Guidelines pass on the changed Audit components/CSS: semantic links and definitions, URL state, focus,
  lazy sized art, long-list content visibility, text floor, reduced motion and empty/missing states checked.
- Backend publishing uses the normal automatic refresh triggered by the push. The old published audit has null paired
  rates/RPS until that run republishes; the UI accurately labels that transition rather than fabricating the missing stats.
