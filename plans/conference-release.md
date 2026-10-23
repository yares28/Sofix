# Conference available now — owner-directed provisional release

23 October 2026. Owner: "The FDR in LaLiga is unproven too then ... I need an FDR
and xScore." This supersedes the full-season wait as a **product release gate**.
LaLiga has historical backtest evidence; no football model guarantees future accuracy.

## Outcome and user actions

Ship Conference main-stage FDR and opponent-based xScore for every current player
of all 36 clubs, using the existing competition/date controls. Preserve search,
bookmarks, mixed domestic/European weeks, owned-card/planning/overlay consumers,
expiry and actual playing-side identity. Qualifiers remain deferred. No manual source
visits or form-only/Sorare-projection substitute. No new subscription, schema migration
or credentials requested from the owner.

Use the fixed recovery candidate: 75% pooled club model / 25% Conference-average
score distribution, and its independently fitted 2023/24–2024/25 player coefficients.
Before enabling, replay the fixed candidate on every existing completed historical
case, including all 153 2025/26 matches / 3,366 starters. This is a diagnostic replay
of previously examined outcomes, not a new blind test or an opportunity to retune.
Preserve the original rejected model/report, coefficients, gates and research archive.

Release explicitly as **provisional**, with a plain on-screen note and measured
limitations. Never mark the failed independent gates as passed or flip the frozen
candidate's validated flag. CL/EL retain their existing validated artifacts/guards.
The full-season prospective recorder remains an independent continuing accuracy
check; its completion is not required to make Conference available.

## Acceptance before shipping

- Test first: consistent mixture of goals/clean sheets/probabilities, independent
  release authorization and malformed/missing artifact rejection; no LaLiga fallback.
- Require complete real 36-club identity, calendar, squads and shared recent history.
- Add the 36-club/six-game league-phase board and appropriate eight/top-24 zones,
  knockout calendars and existing UEFA tiebreaks; never invent past forecasts or odds.
- Keep unknown roles searchable without a guessed score; no partial mixed-week totals.
- Verify backend/client types, routing, global player search/bookmarks, mobile/desktop
  real data and the applicable full browser suite. Publish through normal refresh.
- Report exactly what real source/publication/UI proof passed, what was only simulated,
  and that Conference estimates remain provisional. xScore only appears for a selected
  Sorare week containing an eligible game; never fabricate a Conference game this week.

## Completed evidence (23 October)

- Fixed-candidate diagnostic: all 447 football cases and all 3,366 starters from
  153 completed holdout games. RPS 0.22924 vs base 0.23282; player RMSE 17.80 vs
  recent-form 18.49. These are previously examined outcomes, not fresh confirmation.
  Opponent benefit remains uncertain; within-seven accuracy loses one case to form.
- Real-source runtime replay: 36 clubs, 108 games, six rounds, all 1,110 current
  players rated for their next actual Conference game, sharing 90 recent UEFA
  history games. Source receipts and scope: `docs/european_validation/CONF-runtime-proof.json`.
- Backend publication: commit `00bbad1`, automatic refresh `39967133628`.
- Real UI checks exposed a legacy 300-character model-note guard and a hard-coded
  validated caption. The frontend corrects both and keeps Conference provisional.
  Final publication/browser results are added with the UI release.

Final acceptance: automatic refresh succeeded; one aggregate read confirms 36 clubs,
1,110 players/directory entries and complete 90-game shared history. Real UI: four
cases passed at 1440/390px (board/table/team navigation and cold player bookmarks).
Screenshots inspected. Local gate/build passed. Full browser run: 268 passed; its
new Conference case was repaired and passed separately. Affected European/mobile
rerun: 18 passed plus the repaired Conference case passed separately. No remaining
known test failure. `docs/european_validation/CONF-release-proof.json` keeps the receipt.
