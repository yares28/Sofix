# Navigation skeletons — 30 October 2026

## Requested outcome and acceptance

Switching pages must show immediate destination-shaped skeletons during the server wait, rather than leave the
old page looking unresponsive and then replace it. Coverage is every page, Audit view, player/team detail, selected
GW and league; desktop and phone, cold destinations and revisits. The owner only clicks the existing navigation,
card, crest or week control. No extra action or source is required.

Keep the bars usable while the page loads, announce loading once, make the old content inert, respect reduced
motion, and clear the skeleton on completion, redirects, errors and history navigation. Cached navigation adds no
minimum display time. Do not add requests, prefetches, polling or server reads. Preserve detail-page 404 status.

## Evidence and implementation plan

- Only `(board)/loading.tsx` exists; its generic bento does not match Fixtures, Difficulty or Table. Other pages wait
  for their complete server response; `LinkPending` changes only the selected bar link.
- The older no-`loading.tsx` rule documents a measured server/React fallback delay. Keep that rendering path and
  display skeletons in the persistent client shell while the existing navigation is pending.
- First add delayed-navigation regression tests. Add route-specific first-visit layouts using the pages' existing
  classes and responsive grids. Revisited addresses reuse measured geometry only (no copied text, images or data),
  with viewport and query keys so a different GW, league or width cannot silently borrow the wrong page.
- Exercise all routes in the production build against deterministic local data, plus the complete browser suite
  because the navigation shell is shared. Inspect real-data pages and skeletons in the owner's Chrome at 1440/390.
- Run the repository checks, review the diff, update the manual and ship together. Record actual verification and
  any limitations here before reporting completion.

## Verification

The original shell fails the delayed Gallery regression with no loading main. All 26 routes are mapped,
including detail families and legacy redirects. The 22-page navigation sweep passed at 1440 and 390 on the local
production runtime; detail links, history, modified clicks, selected GW/league, offline cleanup and measured card-art
geometry also passed. The final production suite passed **317/317** cases in 10.3 minutes, including geometry expiry.
`node scripts/check.mjs` is all clear (generated types, eslint, typecheck, the 1,148-case unit suite, documentation
drift and repository script tests). `npm run build` passed; the existing Arcade CSS `end` warning remains unchanged.
Static rendering tests also preserve a plain Link outside the navigation provider.

One controller owns navigation and completion for links and pickers. Stable anchor refs and the existing prefetch
settings are preserved. An idle live region has no status role or accessible name. The offline fixture serves a
verified transparent pixel for the local image proxy instead of downloading remote art; assertions use the visible
main rather than finding both the hidden previous page and its decorative loading layout. The test dev badge is
disabled because it sits over the phone's first tab. These changes retain all original data assertions.

Geometry is tab-local, capped at 24 address/viewport combinations, expires after five minutes, and is keyed by the full sorted query and
viewport width. Scrolled pages use the responsive route layout instead of remembering displaced sticky controls.
Cold data-dependent lists/plots cannot know the incoming row count or plot values; route shells use their existing
CSS layouts, while a measured revisit preserves the rendered geometry for that address and width. Thus the audit
does not claim zero total-page height change for an unseen GW or changing data. No extra source read is introduced.

Real-data local screenshots cover all 22 main pages at **1440 and 390 px**, using the main folder's existing local
block copy with database/R2 reads disabled. Both passes reported no page-width overflow; screenshots were inspected
alongside the delayed skeleton captures. The installed Chrome browser was used; there was no connected owner Chrome
tab (the open native browser was Brave). Private extension actions were exercised through the mock extension test
path, not the owner's Sorare account. Web Interface Guidelines review covered semantics, live announcements, focus,
reduced motion, responsive bounds and preservation of card/crest dimensions. The temporary real-data server was
stopped and its TypeScript include change restored.

Initial live check: deployment, home HTTP 200 and recorded CI checks succeeded. The worktree checker lacked R2
settings and reported a null Neon status; the final check must inherit the main folder's read settings rather than
interpret missing local settings as a production failure.

## Coverage recheck

Recheck every route file, query-based subview and internal navigation entry point. The existing actions must keep
their loading feedback, including confirming a departure from an unsaved mission-history correction. The route
inventory covers 26 files; source inspection found that the correction guard used a document navigation after
Discard, bypassing the shared skeleton. Add a failing desktop/phone regression before routing that confirmed
internal departure through the existing controller. Also exercise the Strategies Results/Plans query subviews and
their plan links, and rerun the desktop/phone route sweeps. First-visit data-dependent geometry remains the
limitation recorded above; a route coverage check does not prove exact geometry for every data state.

The confirmed-departure regression failed before the fix (no Loading Missions main) and passed afterwards at
1440/390. Keep editing retains the note, Discard shows feedback, and Rare remains the destination. Results/Plans
and an individual plan also passed with the response held. Source inspection found no other page-switch bypass:
remaining plain anchors open external sources or jump within the page, remaining direct routers only refresh,
and history-based match/chart/filter controls already use data held by the page. Route inventory tests cover
all 26 entries, including the two legacy redirects. The production build and repository checks passed again.
The final production-runtime run passed all 45 navigation, Missions and mobile cases (1.6 minutes), including
the complete 22-page desktop/phone sweeps and both-width Strategies query-subview checks.

Real local block data also exercised the unsaved correction prompt and confirmed departure, with loading and
arrived screenshots inspected at 1440/390 and no page-width overflow. No correction was saved and no Sorare write
was made. As in the first pass, this used installed Chrome rather than an attached owner tab; cold-state geometry
is not a strict 1:1 match in all data states (the stale-missions state is one visible example).
