# Who starts - complete page redesign

Owner approval, 24 October 2026: implement the complete redesign, keep A, B and C available for comparison, and remove the 100-case rule. Start-chance corrections use the first checked case; all observed statistics remain visible with their sample sizes. No source schedule change or manual refresh.

## Required outcome

- FF, Sorare and Sofix display only LaLiga, Premier League, Bundesliga, Ligue 1, Champions League, Europa League and
  Conference League, in that order. The current Serie A and other competition lines disappear from this page.
- Replace the Sofix-only historical headline with the live results of all three sources, their individual checked
  counts and one update time. Scope the live accuracy/counts to the seven named competitions; do not leave an
  unrestricted headline above a restricted breakdown. Do not declare a winner across unequal samples.
- Replace the correction table with an understandable visual chosen by the owner. Show predicted chance against
  observed starts, sample size and whether that evidence currently changes the forecast. Keep figures visible from
  the first checked case. Automatic corrections also start from the first case; probability bands no longer pool to reach 100.
- Restyle the entire page as one calm white comparison workspace: strong typography, fewer nested boxes, no stretched
  source panels or large gaps, concise labels and accessible source identity. A shared competition filter controls
  the live source summary and breakdown; an absent source remains missing instead of becoming zero.
- Redesign the saved-GW record as a compact timeline and predicted-elevens results as source comparisons with overall,
  GW and club views. Paginate lists beyond 12 entries. Keep the Sofix historical replay secondary and explicitly dated,
  outside the live comparison headline.

## All three correction visualizations - approved

A. Connected dots (recommended): one shared 0-100% scale, one predicted dot and one observed dot connected for each
recorded chance band. Direct labels such as 70% predicted -> 84% started, with the case count. Three source views, one selected at a time, with consistent scales. Fast to read and usable on a phone.

B. Reliability chart: predicted chance horizontally, observed starts vertically, diagonal for agreement. A source's
points above the diagonal mean more players started than predicted. Source controls, sample-sized points and
tap/keyboard details. Best for assessing the whole calibration shape, with more explanation needed than A.

C. Paired bars: predicted versus observed percentage for each chance band, a shared scale and direct values/counts.
Familiar, with more vertical space than A. Source controls preserve a compact phone view.

The actual existing five-point chance ranges and their mean predictions must drive the visual; do not relabel a pooled
range as an invented fixed 70% band. No pending-sample badges remain: the observed values and sample counts are shown directly.
The chart is descriptive for the selected competition scope. Forecast corrections continue to use all saved evidence, now from the first case in each existing five-point band.

## Acceptance before implementation

Test the seven-competition allowlist and consistent summary scope; all three sources in the header; zero versus
missing and absent competition coverage; first-case figures; preserved pre-lock evidence and no case threshold;
correct pooled-range/mean/observed chart semantics; source/filter switching, touch and keyboard details; cold start,
navigation, refresh and pagination; responsive layout without overflow or layout shift. Keep heavy aggregation in
the publisher, and send only displayed fields to the browser. Before shipping, run the local gate, affected browser
specs and built navigation, then verify real data in the owner's Chrome at 1440 and 390 px. Follow normal direct-main
shipping; no schema change or manual refresh is planned.

## Current evidence

The current source panels stretch to the longest unrestricted competition list and push FF's small breakdown far
below its headline. The header instead uses the separate Sofix-only replay (72% on 4,615 historical games), while the
three live sources are below it. Correction rows already contain the mean prediction, observed start share, pooled
range, case count and applied flag needed for each proposed visualization. The real-page screenshots from the
first-case release are available in the session's audit-first-case evidence folder and are the starting point for
any page mockup. No application code changed during this review.

Visual thesis: an open white comparison workspace with large aligned figures, restrained green evidence marks and concise labels. Content: three-source summary, seven competition comparisons, switchable correction charts, compact saved-GW timeline, predicted elevens and secondary historical replay. Interaction: source/filter changes update the whole selected scope locally; chart transitions explain the new view; focus/tap reveals exact evidence. Respect reduced motion.


## Implementation and real-data verification

The publisher adds a 46.2 KB `startsBoard` with all-seven and per-competition source scores, independent five-point
bands, saved-GW counts and predicted-elevens groups. The old raw Audit statistics remain available to other views.
The page's header and breakdowns share the same scope. All three styles and source/filter choices are available
immediately and saved in the URL, including Back/reload and closed-tab bookmarks. A/C bands and club groups paginate
at 12. Saved-GW details retain the per-source forecast counts; elevens retain picked and checked counts. The historical
Sofix replay is secondary. No case threshold remains for this page or start-chance corrections.

Regressions failed before the changes for first-case correction, separate adjacent bands, seven-scope summaries,
source identity/future/DNP cases, preserved legacy chances, cached metadata without competition, the game-read query
count, and skipping unrelated mission-history reads. The focused backend suite passed 32 cases and the focused browser
run passed 25, including all 22 Audit and three new full-workflow cases. The full local gate passed ruff, mypy, pytest,
OpenAPI/type generation, eslint, TypeScript and Vitest; a production build passed. Remaining full-suite and final built
Chrome checks are recorded in the handover.

The development preview uses an ignored local snapshot of actual published R2 blocks plus a database-enforced
read-only reconstruction of the new board (11.09 MB). No source requests or production writes were made. It uses the
app's existing typed API fallback only for pre-release visual testing; production continues to read automatically
published read models. The new seven-competition totals are FF 1,249 checked / 81.18% right, Sorare 891 / 83.61%, Sofix
2,007 / 77.93%. Each FF and Sofix calibration has 14 bands, including one-case bands; all are used. Sorare has nine
bands and its smallest has 61 cases, also used. Competition identities arrive in the one bulk game-row query; no
per-player query is needed. Source reads and plan rebuilds retain their schedules. A version-4 automatic Audit publish
is required after shipping; existing plans use the new correction policy on their next scheduled rebuild.


Final pre-release checks: the complete local gate passed again after the final edits, as did the production build.
Built navigation Lineups -> Who starts works in the owner's Chrome. The real reconstructed header and all three chart
styles were inspected at 1440 and 390 px, including a selected one-case FF band (15% predicted, 0% started). No horizontal
overflow or built-page browser errors. Screenshots are in the session's audit-starts-redesign folder. The broader
277-test run recorded one player-search failure outside Who starts; its targeted retry passed. The new Who starts
workflow cases and Audit cases passed. The web-interface-guidelines review covered controls, keyboard/focus, URL state,
missing/zero, touch, reduced motion, typography and scope payloads; no unresolved finding. No required check unavailable.
Production data publication is verified separately after the push; no manual source refresh is dispatched.
