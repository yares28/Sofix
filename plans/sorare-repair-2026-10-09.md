# Sorare repairs — 9 October 2026

Status: implemented; local verification and release recorded below. Covers the owner's seven production issues and removal of unnecessary UI text.
The owner confirmed both missing Sofix plans and failed plan submission, and reproduced the issues on extension **0.3.9**.
That version is the reproduction baseline; 0.3.10 contains the bridge and inventory repairs.
This follow-up supersedes completion assumptions for the affected flows in [missions-repair.md](missions-repair.md).

## Evidence and limits

- The session health check passed: Vercel deployment, all 13 configured production routes, reported CI checks and latest refresh. HTTP 200 and successful jobs do not establish correct content or working Apply.
- Local Missions showed three loaded missions and empty suggestions/scouting. “All cards” revealed only José Salinas, already selected, and a sealed Sirlord Conteh card. This explains that local filter result, not whether Sorare's eligible inventory was complete. The local extension warning reported 0.3.8; it does not explain the owner's 0.3.9 production report.
- Local Play showed two plans for the next open GW22, with the lineup hidden under “Long shots”; the inspected browser could not reach a Sorare tab. Neither observation disproves the production failures. Check the exact selected GW and both Sofix/Sorare plan views.
- `sync.pick_gameweeks` selects finished and future open weeks, omitting the locked/live interval. `publish.build_payload` publishes last/next/ahead weeks. Play only loads the separate week archive for finished weeks and does not read the frozen plan for a live week. This is a concrete visibility gap after lock.
- Lineups joins `sorare.weeks` and `market` to the displayed FF match. The market index is read for the next planned fixture and publishes only its first game. On the locally inspected Málaga–Espanyol match, both the Sofix and Sorare views had no chances. Trace the missing current-match data before changing rendering.
- `loadMissions` discovers eligibility only for games already supplied by Sofix's pool, truncates task/game pairs to 24, and accepts a card page only when its first 100 results are complete. Scouting, suggestions and the summary independently select/filter games, so their results can disagree.
- History maps one card per mission. Your season filters to the current July–June season, counts every archived week (including empty weeks) and renders zero-reward rows. Saved weeks already contain lineup cards and essence rewards, allowing a winning-lineup drill-down.
- The actual production 0.3.9 lineup/Apply error has not yet been captured. No specific GraphQL, session or mutation failure is claimed as its cause.

## 1. Restore plans, entered lineups and Apply (request 1)

Start with failing regressions for the reported GW and extension 0.3.9. Trace these as three distinct paths: plan publication/loading, private lineup reading, and Check/Draft/Enter.

- Keep the current/live GW's last pre-lock plan visible using the existing frozen record. Do not rebuild historical recommendations with later information. If no frozen record exists, show one short “Plan not recorded” state.
- Verify upcoming Sofix plans and Sorare-projection plans independently: competition/card inputs, published records, selected GW, cache invalidation and UI selection. Show the best available plan immediately even when its reward chance is low; put the low-chance label on it rather than hiding the entire lineup.
- Reproduce the private read through the allowlisted extension test path, capturing sanitized response shapes and error paths for the exact fixture. Check worker/bridge versions, origin routing, session availability and the response parser. Verify valid partial GraphQL responses without accepting an incomplete read as “no lineups”.
- Check the recent archive integration: interactive current-GW reads must not wait behind a season of queued archive reads or a slow archive-storage request. A failed archive attempt must not suppress an intentional retry for the rest of the day. Preserve the last successful same-GW view during a read failure and never show another GW's lineups as current.
- Reproduce Apply with the same displayed plan, board/card IDs, captain and substitutes. Validate each step's response explicitly. A missing response is not success; an ambiguous write timeout must not claim “nothing saved” or trigger an automatic retry. Read back before offering the next action.

Acceptance: selected-GW entered/draft lineups load; available Sofix plans display; frozen plans remain visible after lock; the extension test path passes Check → Draft → explicit Enter and failure recovery. Real submission remains an owner action, and locked plans remain unenterable.

Main files: `backend/app/sorare/{sync,publish,frozen}.py`, `frontend/app/play/page.tsx`, `frontend/lib/{playData,weeks,myWeeksClient,entered,apply}.ts`, `frontend/components/play/{PlayView,EnteredLineups,ApplySheet}.tsx`, `extension/{background,bridge,content}.js`.

## 2. Use one correct mission inventory (requests 3, 4 and 7)

- Reconcile owned cards against the mission's actual pickable games/cards and rules, including the active GW, other leagues and national teams. Remove the circular dependency where a game missing from Sofix's pool can never be discovered through eligibility checks. Verify the relevant Sorare contract with a sanitized extension fixture before choosing the bounded query shape.
- Replace silent pair truncation with bounded batches/pagination and explicit completeness. Reuse reads across rarities/tasks where valid; do not introduce polling or an unbounded per-player loop. Partial/unread eligibility stays distinguishable from a verified empty result.
- Build one shared mission-specific candidate resolver for suggestions, Choose your own picks and the Daily missions summary. Use card + player + game identity, task window, rarity/season/rule restrictions, kickoff locks and existing selections. Verify sale/sealed/offer restrictions against mission eligibility instead of blindly inheriting SO5 exclusions.
- Rank each supported mission by its own target and game-specific availability: decisive action, shots, tackles, interceptions, goals, assists or score target. Audit current SCORE/overperformance handling, which presently produces no recommendations. Where a probability is not supported, retain eligible cards and use a clearly named supported ranking; do not manufacture a mission percentage or treat missing stats as ineligibility.
- Allocate editable recommendations across overlapping missions with the existing Essence → clues → XP preference and actual card-use rules. Imported picks and local pins reserve the correct card. Explain a reservation beside that card. Clear stale shortlist references when mission instances or eligibility change.
- Default Choose your own picks to eligible, editable cards for the selected mission, including cards without estimates. Keep already picked/locked cards accessible with compact labels. Distinguish no eligible cards, incomplete eligibility and a filter with no matches using one actionable line.
- Add **Available players** to the existing Daily missions card: distinct eligible editable players, usable copy count where relevant, and a compact row of their card art/names. Count each player once across missions; open the relevant scouting list from the summary. If eligibility is incomplete, show a partial/unchecked state instead of zero.

Acceptance: a captured mission with eligible owned cards populates both recommendations (when rankable) and scouting; different targets change the ranking; selected/locked copies are not reused; the top summary agrees with the list. Missing estimates do not hide playable cards. Shared Home/Play mission summaries use the same pool and do not falsely claim that no cards fit.

Main files: `backend/app/sorare/{sync,mission_pool}.py`, `extension/{background,bridge}.js`, `frontend/app/api/ext/missions/pool/route.ts`, `frontend/lib/{missions,missionsToday,missionsPool}.ts`, `frontend/components/missions/{MissionsView,MissionScouting}.tsx`, Home/Play consumers.

## 3. Restore match-specific starting percentages (request 6)

- Supply source chances for the matches actually on Lineups, independently of which GW the optimizer now plans. Reuse existing per-game records and source reads; retain captured current-GW chances through the lock transition.
- Join by player and exact game/FF match identity. Publish Sofix and Sorare values separately for owned and other LaLiga players. Cover substitutes and multi-game weeks; never copy the first game's chance into another fixture.
- Preserve Sofix's independent estimate. Use Sorare's value only where it is available for that match; an absent source is “Not published”, not 0%, and FF is never relabeled as Sorare. Keep genuine 0% values visible.

Acceptance: FF, Sofix and Sorare switches display their own available values for the same selected match before and after a GW lock. Existing captured values survive a switch to planning the next GW. A missing source has a short accurate state.

Main files: `backend/app/sorare/{sync,publish,forecast,starts,player_games}.py`, `frontend/app/lineups/page.tsx`, `frontend/lib/lineupChances.ts`, `frontend/components/lineups/`.

## 4. Group mission history by day (request 2)

- Render one outer card per date, newest first, containing all that day's missions within the existing rarity filter. Date and day status appear once; mission title/target, your picks, Sofix picks and outcomes form compact rows inside.
- Preserve task IDs and mission-level edits/restoration. Grouping must not merge two tasks with the same title or apply one correction to the whole day. Keep all 30 days, including missing/unloaded/confirmed-empty days, without fabricating forecasts.
- Hide empty “Missed” rows and repeated explanatory paragraphs; show missing evidence once at the relevant level. Apply the same grouping to the shared Audit Missions history.

Acceptance: three missions on one date produce one date card with three individually editable mission rows; saves, correction conflicts and date/rarity filters still work.

Main files: `frontend/components/missions/MissionHistory.tsx`, `frontend/lib/missionLog.ts`, shared Missions/Audit styles and tests.

## 5. Make Your season readable (request 5)

- Group saved weeks by season, defaulting to the newest, with a compact season selector. Show **rewards earned** and **GW played** for each season. Count distinct GWs with at least one entered lineup; empty archive records and drafts do not count. A played GW with no reward still counts as played.
- Keep Essence and cash separate and correctly labeled; display other reward types only when the saved source supports them. Audit the current Limited-only essence parser before making all-rarity or all-reward claims. Older/unavailable history must not be presented as a complete zero season.
- Keep Week by week, but omit rows with no earned rewards. This is a display filter, not deletion from history or removal from the GW-played total.
- Expand a rewarded GW to show its essence-winning lineups: competition, essence earned, card thumbnails, captain, and score/rank when recorded. Reuse saved lineup data, with a link to that exact GW; no extra per-card source calls.
- Remove “Saved from Sorare”, routine success messages and archiving-method paragraphs from the main card. Keep one concise actionable sync error or incomplete-history indicator only when needed; move supporting detail into a disclosure.

Acceptance: two seasons remain separate; empty archived weeks do not inflate participation; zero-reward detail rows are hidden; opening a winning GW shows the actual saved lineups whose rewards sum to its total.

Main files: `frontend/components/recap/YourSeason.tsx`, `frontend/lib/{myWeeks,myWeeksClient,entered}.ts`, Recap styles and tests.

## 6. Remove recent UI bloat throughout the touched flows

Keep decision-making information: target, reward, eligible cards, opponent/kickoff, useful estimate and sample, picks, result, and the next action. Remove duplicate status paragraphs and empty sections. Use readable reward names instead of raw values such as `LIMITED_BEST_STAR_RANK_CRAFT_CLUE`.

Move statistical-method explanations, fallback-window mechanics, archive details and repeated safety prose into one relevant Details disclosure or the manual. Keep essential source attribution, dated/incomplete evidence and real errors visible in compact form. Retain the white Sofix design, card art, text floor, semantic controls and responsive behavior. Avoid adding a new dashboard or another summary card.

## Implementation order and verification

1. Reproduce and repair plan visibility, private reads and Apply; add the failing tests first.
2. Repair mission inventory/eligibility and source chances; then update suggestions, scouting and available-player summary.
3. Group history and simplify Your season; do the copy/empty-section removal alongside those changes.
4. Run `node scripts/check.mjs`, relevant backend/extension/frontend regressions, and Playwright `play`, `apply`, `missions`, `lineups`, `board`, `audit` and `mobile` specs as affected. If shared `weeks.ts`, shell/nav or mock changes, run the full browser suite instead.
5. Inspect populated and unavailable states on the local real-data pages at 1440 px and 390 px; check overflow, focus, text size and the required design-guidelines pass for restyled files. Use the extension test path for authenticated flows, with no live automated entry.
6. Keep any contract changes source-first and regenerate types. Prefer existing storage; no production migration is planned. If one proves necessary, the owner's migration precedes code deployment.
7. Rebuild the owner's extension folder before an extension release, then use the normal checked commit/push flow, post-push `--live / /play /missions /lineups /audit/missions`, and one read-only data verification after the normal refresh. Report authenticated production acceptance separately from mocked tests and page health.

## Delivery evidence

- Production's public address was present in the manifest but rejected by the worker when the configured address used the other Vercel alias. Both exact app origins are now allowed; lookalike origins remain rejected. Protocol 5 versions both the page bridge and tab request, so an old listener cannot duplicate a write during extension reload.
- Current lineup reads bypass saved-history storage and take priority between archive reads. Same-GW successful reads survive temporary errors. Apply validates Check/Draft/Enter responses independently; uncertain writes require a read-back and never retry automatically.
- The existing frozen GW21 record contains five plans and ten lineups although GW21 is absent from the main Sorare payload. Play restores that record and card art. Home uses the selected week's record rather than silently falling forward.
- Eligibility discovers each task's pickable games independently of the weekly pool, then pages owned cards in bounded batches. Shared candidates populate suggestions, scouting and available-player counts; incomplete inventory remains partial. Historical score/stat hits are labeled separately from forecasts.
- Captured Sofix chances are joined to the exact FF match, player and kickoff. The real-data Malaga–Espanyol preview now shows them. Sorare's private starter odds use a single allowlisted read for the selected game; actual authenticated values remain owner acceptance after reload.
- History groups all missions inside one date card and retains individual correction controls. Your season groups rewards and entered-GW totals by season, omits zero-reward detail rows and expands saved essence-winning lineups. The real-data preview shows 3,053 Limited essence across 15 played GWs; GW15 expands two winners totaling 355 essence.
- Regression tests cover the repaired contracts, inventory, frozen plans, captured/private chances, season totals and uncertain-write recovery. Local checks include backend formatting/lint/types/tests and generated OpenAPI/types, frontend lint/types/unit tests, browser specs and desktop/mobile real-data screenshots. No live Apply or mission entry was performed; production data remained read-only. No migration is needed.
- `node scripts/check.mjs` passed. The full browser run passed 206 of 207 tests; its Today-navigation failure passed on focused reruns. After Home's final selected-GW repair, all ten focused Home/navigation/mobile checks passed. Typecheck and affected-file ESLint also passed after that repair. The design-guidelines pass checked semantic controls, focus, source labels, text sizes and overflow; the season selector uses the theme surface.

Release: rebuild the main checkout's extension folder before pushing 0.3.10. The owner reloads the extension and Sorare tab once, then verifies authenticated import, mission inventory and Check → Draft → explicit Enter. HTTP health checks and mocked bridge tests do not establish live submission success.
