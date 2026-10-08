# Missions repair and scouting plan

Prepared 8 October 2026; implementation started after owner confirmation and completed 9 October. Release checks are recorded below.
Investigated revision: `b1f2642` (matched `origin/main` when checked).

## Outcome

Make loading trustworthy, retain every mission day, distinguish your Sorare picks from Sofix's recommendations, let you correct your historical picks, and add a visible scouting panel for choosing alternatives.

The order is reliability and history first, then editing and scouting. Keep Sorare access read-only through the existing extension. Editing history changes Sofix's record; entering or changing picks on Sorare remains your action there.

## Evidence from the current app

One read-only production query at 14:51 Madrid on 8 October found:

- The extension had checked in as version **0.3.8**, with a signed-in account.
- All four supported rarities had recently saved **empty mission lists**, around 14:39 Madrid. This proves what Sofix stored, not that Sorare had no missions.
- **6 October, Limited:** your Jan Oblak and Mikel Oyarzabal picks are saved, both with imported `FAILURE` statuses. Sofix has **zero recorded candidates and zero recommendations** for that entry. Those imported statuses and the entry's date still need reconciliation against Sorare's task history.
- **7 and 8 October:** the log contains empty day objects. These days therefore disappear from the history view.
- The published player pool that Missions uses contains matches through **5 October**, then resumes on **9 October**. It contains no matches for 6–8 October. That is a coverage gap in this input, not evidence that you had no eligible cards.
- The bundled stat sheets used for “last 5 / last 8” have `asOf: 2026-09-20`; they are not current rolling statistics.

Code and local reproductions explain several failures:

1. `extension/background.js::loadMissions` accepts a `currentUser` object without validating the requested task list, then uploads an empty array for every rarity. A reproduction with a missing `tasks` field returned success and four empty lists. A valid picker with nullable `rarity` was also silently discarded. Sorare's published schema explicitly allows a null rarity. The precise response behind today's failure is still unobserved.
2. The button queries `currentUser.tasks(periodicity: DAILY)`, while the passive reader's recorded page fixture comes from `currentUser.taskGroup.myTasks`. Their results need to be compared on the same authenticated session. Schema validity alone does not prove they return the same missions.
3. `frontend/lib/missionLog.ts::nextDay` only collects matches still ahead at capture time. First loading after kickoff cannot reconstruct the earlier pool. `recordMissionPicks` omits rarity entries without candidates/picks, and `missionHistory` explicitly hides missions with neither side's picks. A local reproduction produced zero visible history rows.
4. Missions uses `data.weeks[].playing.players`, a product of the weekly optimizer. `backend/app/sorare/publish.py` publishes the finished, next and ahead weeks; this is not a complete mission-specific inventory of cards and games.
5. History identifies missions by **title**, not task instance; SCORE missions are dropped from the log; expired tasks are dropped by the reader. Explicitly empty appearances cannot clear an old pick because the merge keeps previous picks when the new array is empty.
6. Month-wide JSON writes use read-modify-replace with last-writer-wins semantics. Concurrent imports, refresh settlement and history edits could overwrite one another. Cache invalidation also happens before the asynchronous history write completes.
7. Current recommendations subtract the number already picked but do not reserve the actual cards. A reproduction suggested a player who was already selected. Allocation uses player slug, losing the distinction between two separate cards of that player.
8. The decisive percentage uses a conditional start model (`shape.p`) without availability. A fixture with 5% chance of playing still displayed 70% mission chance. Other stat missions use rates per start without a substitute/minutes adjustment.
9. The page already has a collapsed “All N…” list. It inherits the limited player pool and dated stats, and does not provide the proposed comparison workflow.

Relevant files: `extension/{bridge,background,core,content}.js`, `frontend/lib/{missions,missionsToday,missionsData,missionLog}.ts`, `frontend/components/missions/{LoadMissions,MissionsView}.tsx`, `frontend/app/api/ext/missions/route.ts`, `backend/app/sorare/{missions,publish}.py`.

## Sorare rules the repair must preserve

Sorare's football help describes a daily Decisive Picker with up to three selections, changes before each player's kickoff, and a 9 AM CET reset. Positive decisive actions include goals, assists and goalkeeper clean sheets. A card may also be in a lineup, but cannot be in overlapping pickers. Picker scores/statistics freeze five minutes after the match; later statistical corrections do not change Sorare's result. Therefore imported verdicts must remain distinct from Sofix's later calculations. [Sorare football mission rules](https://sorare.com/help/a/26447573297565/what-are-the-daily-missions)

Special pickers have varied restrictions, score targets, rewards and even five slots. The October 2025 programme is historical evidence of this variation, not the current mission schedule. [Sorare programme example](https://sorare.com/blog/football/%F0%9F%8C%8D-international-break-missions-programme-1-2)

The public schema downloaded on 8 October exposes `startDate`, `taskConfigSlug`, `displayedTypedRules`, `statThresholds`, `overperform`, `rewardConfigs`, pickable games/cards, and appearance card IDs, locks and results. It also exposes archived tasks through `taskGroup.myTasks(includingArchived: ...)` and paginated `taskConfig.myTasks`. Actual retention and authenticated access must be verified. Some pickable fields cannot be nested under lists: use bounded per-task aliases and pagination where required. [Sorare API documentation](https://github.com/sorare/api), [published schema](https://api.sorare.com/graphql/schema)

Use actual task timestamps and available period data to identify a mission day. The current fixed 08:00 UTC reset is an assumption derived from “CET”; verify summer/winter behavior from real task instances and test the October clock change. Do not date historical tasks by the time Sofix fetched them.

Scope stays the football card-picking missions on this page. Collect and Arcade daily-action missions are separate products; this repair does not expand into them.

## 1. Repair loading and make failure states truthful

**First deliverable:** clicking Load either confirms the saved missions or explains why they could not be verified, while preserving the last successful data.

- Capture a sanitized real response through the extension test path and compare the daily query with Sorare's `play` task group, including the rarity requested by its page. Use this fixture for the failing regression test. No credentials in fixtures.
- Prefer the same task-group source as Sorare's Missions page once parity is confirmed. Include all relevant active picker instances, using their actual periods; do not assume every visible picker comes from the DAILY query. Read completed/archived instances separately for history.
- Preserve structured rules, task ID/config identity, start date, slots, rewards and appearances. Retain unsupported missions with their real description and an explicit “not rated” state. SCORE may mean a fixed target or an overperformance target; do not label every SCORE mission “beat his average”.
- Validate account identity, collection shape, per-rarity scope, completeness, GraphQL errors and bounded extraction. Preserve error paths relevant to missions instead of accepting partial GraphQL data as complete.
- Resolve null rarity using explicit requested scope and verified typed eligibility. Do not guess or copy missions between rarities.
- Send a single bounded import envelope with per-rarity outcomes. A verified empty list is a valid result; malformed, incomplete, unsupported and failed responses cannot clear good data. Apply one import atomically and invalidate caches after persistence.
- Add request timestamps/sequence checks so a slow older response cannot overwrite a newer read. Repeated imports are idempotent. Deduplication includes the mission instance/day, not just identical text.
- Return “Saved 3 Limited missions, 2 picks imported” only after those writes succeed. Report partial rarity success explicitly. Keep sensible timeouts; one deliberate retry must work after the tab wakes or the user signs in. No automatic mutation or polling loop.
- Show separate states for not loaded, loading, current, stale, partial, load failed and **confirmed empty**. Keep the last good list visibly dated. A fresh empty response must not suppress recovery from a bad import for the whole day.
- Show owned rarities and rarities with history even when today's mission list is empty. History must stay reachable.

## 2. Give Missions its own eligible card and game pool

**Second deliverable:** “no eligible cards” means eligibility was checked, rather than that the weekly planner lacked data.

- Publish a compact mission pool from the owner's collection and games covering the mission window, including the GW currently playing. Reuse existing sync inputs and cached references. Do not feed Missions from optimizer-selected weeks or apply unrelated SO5 exclusions.
- Match task-specific pickable games/cards and typed rules: rarity, season, team/competition, sealed state and other restrictions when applicable. Use bounded reads through the existing allowlisted extension for eligibility the public snapshot cannot determine. Missing eligibility is “not checked”.
- Carry **card ID/slug + player ID + game ID**. Reserve imported choices and locked appearances across overlapping missions. Permit distinct cards of a player only where Sorare's actual rule allows it; do not impose or remove player uniqueness by assumption.
- Keep all mission-window fixtures in the stored record, with separate upcoming/live/finished states. Recommendations use only editable selections; your existing live/finished selections remain visible.
- Show the side actually playing, opponent, kickoff and card rarity. A national-team match must not be described using the player's club.
- Use game-specific start/substitute evidence. Where supported, mission chance combines the chance of starting and succeeding with the chance of coming on and succeeding. Missing components remain unestimated or clearly labeled as conditional historical rates. Never present a rate per start as an unconditional chance today.
- Parse typed targets and rewards before ranking. Preserve XP, each Essence currency and market credit separately. Unsupported conditions do not silently fall back to “any decisive action”.

## 3. Retain every day and repair existing history

**Third deliverable:** the calendar contains every tracked day, including unloaded days and days with incomplete evidence.

- Materialize a daily ledger in the existing refresh/publish workflow, rather than relying on a successful web callback or an open browser. Use existing scheduled runs and check-ins for snapshots; ensure there is a lightweight capture after the verified mission reset and before relevant games. This is not an uptime monitor.
- Keep one baseline Decisive Picker for each displayed owned rarity on an **unloaded day**, following your rule. Label it “Assumed Decisive Picker — missions not loaded”. When actual tasks arrive, reconcile the baseline with its real instance, without duplicating it. A verified empty rarity stays explicitly empty.
- A zero-candidate day still has a visible entry. Distinguish “no eligible cards, verified”, “player data incomplete”, “no forecast captured before kickoff”, “your picks not imported” and “no picks, confirmed”.
- Fill gaps since the earliest tracked mission day, initially 6 October. If a run was missed, create the ledger entry on the next run without fabricating historical predictions or ownership.
- Preserve the original immutable pre-kickoff Sofix forecast, the historical candidate/ownership snapshot, your imported selections and Sorare results as separate facts. Unknown candidates must not be treated as proof that nobody could succeed.
- Preserve task identity and appearance/card/game identity; titles are presentation. Retain SCORE and unranked missions in history even when there is no Sofix recommendation.
- Import recoverable archived tasks and final appearance statuses in one bounded, user-triggered history reconciliation. Recover dates from source evidence. Where Sorare no longer exposes an entry, keep it unknown and allow a manual correction.
- Preserve the 6 October imported picks during repair. Do not invent which cards Sofix would have recommended then. Audit excludes entries lacking the necessary pre-kickoff evidence and labels official outcomes separately from calculated outcomes.
- Replace month-wide blind replacement with per-day records and revision-checked merges in `read_models`. Refresh updates settlement fields, imports update source fields, and the editor updates only overrides. Handle a revision conflict by re-reading/merging the affected fields, never by dropping a concurrent change.
- Keep legacy logs readable, migrate them idempotently, retain a rollback copy, and compare old/new counts before switching reads. Do not delete old production logs as part of this repair.
- Show a date picker/calendar and the last 30 **days**, with every mission within each day. The current limit counts mission entries, not calendar days.
- Invalidate Missions and Audit after the log actually commits; confirm a successful save is visible immediately.

Prefer existing `read_models` storage for the repair, avoiding a new schema dependency. Reuse the approved [data-keeping plan](data-keeping.md) for durable `player_games`, shared actuals and rolling stat sheets when available. Do not create a second competing player-history store. Its production migration remains owner-first; loading and history visibility fixes can ship independently.

## 4. Edit your historical picks

Each historical mission gets **Edit my picks**. The editor shows the date, rarity and mission rule, lets you add/remove/replace cards up to the source's slot limit, then previews the change before Save.

- Search the historical collection and cards already recorded in the mission, so selling a card later does not remove it from the editor. A manual addition without provable historical ownership is visibly user-reported.
- Store corrections as a dated override with an optional note. Keep the original imported selection underneath and offer **Restore imported picks**. Include an explicit “I made no picks” state; an empty correction must not resurrect old picks.
- Later imports update the source record without silently removing your correction. Surface conflicts for resolution.
- Editing your cards never changes Sofix's frozen recommendations or labels an inferred outcome as Sorare-confirmed. Recalculate personal comparisons only when the card/game/target evidence supports them.
- Use the existing protected, same-origin save pattern with server validation and a revision check. No exposed extension token, general GraphQL proxy, or Sorare write operation.
- Your correction persists across reloads/devices and appears in both Missions and Audit with a “Corrected by you” label.

## 5. Add the scouting card below current missions

Place a visible **Choose your own picks** card between current missions and History. Consolidate the existing collapsed lists into this panel, rather than duplicating their current limitations.

The panel opens on the selected mission and shows its exact target and eligible player/card list. Provide name search, position/availability filters, and sorting by estimated mission chance, recent target success, relevant stat or kickoff. Eligible players with missing stats remain visible with “No estimate”.

Each row should include:

- Card art, name, rarity, number of usable copies and whether you already selected it or Sofix recommended it.
- Actual team/opponent, competition, kickoff/lock, start probability and source, and confirmed lineup status when available.
- The mission-relevant metric: decisive-action frequency, goals, assists, interceptions or score threshold/overperformance target.
- Last 5 and last 8 **starts**, their sample counts, longer-term baseline and observation cutoff. Separately show appearances/minutes where known; do not disguise substitute games or missing games as starts.
- For a “2+ interceptions” mission, show how often he actually reached 2+, as well as average interceptions. An average alone is not a hit rate.
- An estimated chance only when supported, with a short explanation and evidence freshness. For SCORE missions without a defensible probability model, show target, historical outcomes and score distribution without a manufactured percentage.
- Availability/eligibility reasons: locked, picked elsewhere, wrong season/competition, or eligibility not checked. A player in a normal lineup is not automatically excluded from Missions.

Support comparing up to three players and building a **local shortlist**. Pinning your preferred picks reserves those cards and recalculates the remaining suggestions. A link opens the relevant mission on Sorare for you to make the actual selections.

Source stats from the shared rolling history/read model in the data-keeping plan, including owned players outside LaLiga. Until that source is available, show the dated fallback honestly; do not ship a “current” scouting claim on the September 20 file. Avoid a separate AI service, paid data feed or unbounded per-player calls.

## Consumer improvements to prioritize and brainstorm

Included in the repair:

- **A useful top summary:** missions loaded, your picks filled, open slots, next lock and last successful sync. One main Load action.
- **Your picks beside Sofix's picks:** show what is actually selected today, including locked cards. A filled mission should not look empty.
- **Actionable recovery:** “Sorare tab needs reloading” or “missions could not be verified”, with Retry and retained data, instead of a false empty state.
- **Readable history:** every date, clear pending/settled/corrected states, and visible reasons for incomplete entries.

Good follow-on choices:

- **Why this player over that one?** a compact comparison of target hit rate, start likelihood and fixture evidence.
- **Reward preferences:** prefer a chosen Essence pool, XP or market credit without converting them into one invented currency. Explain the tradeoff when two missions need the same card. Prefrence: Essence first, clues second, xp third
- **What changed since the last load?** highlight new missions, changed picks and an unavailable player, using reads already made by the app.
- **Personal notes and hindsight:** record why you picked someone, then review target achieved versus expected. Keep incomplete days out of accuracy statistics.
- **Mobile companion:** review the latest saved missions and shortlist on the phone, clearly stating that a new Sorare import needs the extension browser.

Defer notifications until import reliability and existing near-lock data coverage are proven. Any later alert should have explicit opt-in and reuse the existing refresh/extension cadence; no new browser polling or paid service.

## Verification and delivery

Write failing regression tests before implementing each behavior change. Cover:

- Complete populated/empty loads, missing task fields, partial GraphQL errors, nullable rarity, unsupported task types, old extensions, signed-out/no-tab states and request races.
- Source task-group parity, pagination, archived results, exact mission dates across midnight/reset/DST, multiple missions sharing titles and variable slot counts.
- Every unloaded day visible, no game versus unknown coverage, first capture after kickoff, a missing active GW, explicit removal of picks, and SCORE history retained.
- Imports, settlement and manual corrections racing; duplicate imports; corrections surviving refresh; sold cards; restoration of imported picks; unauthorized writes rejected.
- Actual card reuse versus multiple copies, already picked/locked cards, conditional versus unconditional chance, absent stats, and typed targets.
- Official Sorare verdict retained when later stats disagree; days without pre-lock evidence excluded from the Sofix score.

Run `node scripts/check.mjs`, the Missions and Audit Missions browser specs, and `e2e/mobile.e2e.ts` for the layout work. If shared mocks/nav change, run the full browser suite. Inspect the local real-data page at 1440 and 390 px, including populated, failed import, empty day, editor and scouting states. Follow CLAUDE.md's design bar and the required design-guidelines pass for restyled files.

Extend `scripts/check.mjs`'s live page list to include `/missions` and `/audit/missions`: its current list of 11 omits both. Rebuild the owner's extension folder before the extension release, then follow the established main/worktree shipping path, local checks, live check and a read-only post-refresh data comparison. No docs-only push for this plan.

Suggested delivery sequence:

1. Fix truthful loading and expose preserved/empty history states.
2. Repair the card/game pool, daily recording and recoverable history; validate the legacy import.
3. Add the historical correction editor with concurrency-safe persistence.
4. Add scouting and current-pick comparison on the corrected inputs; reuse the shared live stat source.

## Checks performed for this plan

- Required session health check: `node scripts/check.mjs --live --no-wait` passed with network permission. Vercel deployed, all 11 configured routes returned 200, backend/frontend CI succeeded, E2E was still running at that observation, last scheduled refresh succeeded. No wait for CI.
- Explicit read-only GETs for `/missions` and `/audit/missions`: both 200. An HTTP 200 is not proof of correct mission content.
- One production SELECT over the relevant read models; no data was changed.
- Six existing frontend test files: **139 passed** (`missions`, `missionsToday`, `missionLog`, `overlayCore`, `extensionBackground`, extension Missions route). The initial sandbox run could not resolve worktree paths; the permitted rerun passed.
- `pytest -q tests/test_sorare_missions.py -p no:cacheprovider`: **7 passed**.
- Separate local diagnostic reproductions confirmed false-empty loading, omitted late-captured history, already selected players being suggested again, and availability being ignored. These are not new committed tests.
- Read Sorare's official football mission rules and current public GraphQL schema.
- At initial planning, authenticated Sorare capture, UI acceptance and implementation had not been performed. No connected Chrome/Sorare tab was exposed. The exact real response behind the false empty list remains unobserved; the implemented loader rejects the reproduced incomplete-response paths.

## Implementation and release verification — 9 October 2026

Implemented the verified import envelope, retained dated lists, active-GW mission inventory, rolling scored-start evidence, daily gap ledger, archive reconciliation, separate revisioned corrections/restoration and visible scouting/comparison/local shortlist. Manual corrections survive mission-ID reconciliation. Current suggestions and refresh captures distinguish separate copies of the same player. Unsupported/combined targets are retained without invented estimates. Source archive dates are calendar dates, not shifted through a guessed reset.

No schema migration, Sorare write or additional paid service is required. Live task-group parity, the summer reset boundary and actual archive availability still require a signed-in extension import. The UI explicitly distinguishes unknown eligibility/coverage from no cards.

Validation: failing regressions were reproduced before the related repairs. The full browser run passed 193 of 194 tests and exposed a scouting-art overlap; that was fixed, then all 31 Missions/Audit/mobile checks passed, including the failing interaction. A final Audit missing-day regression failed before its repair, then the 31 checks passed again. Real-data desktop/mobile screenshots were inspected; imported 6 October picks and 7/8 October baseline gaps were visible. Both allowlisted GraphQL queries validate against Sorare's current public schema.

Final local gate: `node scripts/check.mjs` passed ruff format/check, mypy, the backend test suite, OpenAPI export, API type generation, eslint, typecheck and vitest. No authenticated Sorare import was available in the connected browser; the owner must reload extension 0.3.9, load current missions and reconcile archived history to verify account-specific parity. Deployment, CI and refresh state are checked after the push with `node scripts/check.mjs --live /missions /audit/missions`; a single read-only production SELECT checks the published inventory and preserved ledger when available.
