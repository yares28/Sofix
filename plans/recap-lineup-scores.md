# Recap lineup scores and current Gameweek (11 October 2026)

## Requested workflow

- Opening the app without a selected week stays on the current Sorare GW until its end, then advances. Explicit week links and navigation continue to select that week.
- Recap's Your lineups contains every entered lineup and every lineup of the best Sofix plan (owner clarification: no Sorare-projection plan group).
- Each lineup shows its expected xScore beside its actual score. Missing forecasts/results remain unknown; zero is a real score. Forecasts and scores must belong to the selected GW and source.
- Owner clarification: calculate estimates for custom entered lineups too. Recorded matching lineup totals remain the original forecast; custom estimates combine the selected GW's forecasts with Sorare's original slots, captain, card bonuses and substitution rules. Independent playing chances are disclosed on the estimate. This extends the existing extension read, requiring one extension Reload after its folder is rebuilt.
- Play's Your Sorare lineups card moves below the Sofix plan and shows expected score beside actual score.
- Best plan selects the plan with maximum expected essence rewards, rather than whichever plan was published first. Explicit alternative-plan links remain usable.
- Existing automatic selected-week reads and saved-week fallback remain intact; no extra Sorare visits, clicks, or new entry actions.
- Older saved custom teams are enriched automatically on their selected page when the updated extension can read Sorare. Only matching board/card/captain metadata is added; scores, rewards and the original saved snapshot are preserved with a compare-and-swap write. Phones and a closed Sorare tab retain saved data.

## Acceptance and evidence

### Follow-up: automatic persistence and mission picks locked on load

- Save every successful selected-GW Sorare lineup read, including live scores, drafts and confirmed empty reads. Keep the latest snapshot separately from the immutable final reward archive; a live snapshot must never count as final rewards.
- On opening, reopening or navigating between Recap and Play, immediately show that GW's saved snapshot, then refresh live lineups automatically in the background. A closed Sorare tab, failed read or unavailable storage must preserve the last successful teams and identify them as saved. Old final teams render before optional metadata enrichment. No extra clicks or page visits.
- Freeze each mission's Sofix and independent best picks, card/game identities and prediction evidence at its first successful load. Navigation, reloads, later form changes, players disappearing after kickoff and scheduled Python refreshes must preserve those choices. Further reads can update the owner's picks/verdicts, and new source task IDs get their own first snapshot. Empty choices stay empty; a new mission day/rarity does not borrow old picks.
- Test first: live storage versus final archival, replacement/zero/empty reads, storage failure, closed-tab cold start and selected-GW isolation; nonblocking final metadata; locked missions before/after kickoff with missing players, changing forecasts, source-task identity and daily expiry. Verify both TypeScript and Python writers, affected browser flows, and local real-data desktop/mobile views before shipping.
- Implemented: latest live reads use `entered_week:<slug>` while final reward records remain immutable `my_week:<slug>`. Browser snapshots render first, server snapshots support a cold device, and background failure preserves the last successful read. Final archival removes drafts from both server and browser snapshots. A closed-tab response cannot outrun the server snapshot, and background callbacks cannot overwrite their own completed status with a loading state.
- Implemented: Recap reads the daily mission ledger. Both the extension import writer and scheduled Python capture preserve loaded task choices, independent best picks, original card/game identities and forecast evidence. Existing recordings retain their latest available choices; selections overwritten before this fix cannot be recovered. Repeated imports still update the owner's verdicts. Saved-status labels wrap inside their chance column.
- Verification so far: failing regressions reproduced live-storage rejection, changing pre-kickoff picks, blocking old metadata and the draft/archive boundary. The local gate passed ruff format/check, mypy, pytest, OpenAPI export, generated types, eslint, typecheck and vitest. After the final draft correction, lint/typecheck and all 806 frontend tests passed; the 44 focused persistence/mission tests passed. The affected 45-case browser run had 42 passes and three failures (obsolete status text, callback ordering, and a new fixture selecting an empty player list); all four affected acceptance cases passed after correction.
- Real-data proof: local Recap and Play restore GW19's saved custom team (estimated xScore 406 / actual 374) with Sorare unavailable, without waiting for optional metadata. Today's nine Recap mission picks match a read-only SELECT of the daily ledger, including players whose kickoffs passed. Desktop 1440 px and phone 390 px screenshots were inspected under ignored `output/playwright/*persistence*` and `*locked*`; no page overflow. The long saved-status label initially measured 114 px inside a 76 px column and now fits at 76 px. Web Interface Guidelines pass: semantic actions, polite status announcements, long-label wrapping, existing focus/reduced-motion support and readable text sizes.
- Limit: a real authenticated Sorare read/new live snapshot write remains unverified in this browser. The existing extension test path, storage route tests and cold-device browser acceptance verify that path without touching production rows. Real saved teams and current mission records were checked read-only. No workflow substitution or additional owner action was introduced.
- Final browser validation: the full 221-case run passed 220 cases. Starting the focused label runner before the final phone case had closed its context removed its trace artifacts, causing an infrastructure failure (ENOENT), not an app assertion. The isolated final phone case and the updated saved-mission desktop/phone label assertions both passed (2/2). All browser cases are therefore verified, with that rerun recorded explicitly. Final frontend lint and typecheck also passed after the CSS/assertion change.

### Follow-up: missing comparison scores and mismatched rows

- Owner reports entered rows styled differently, missing entered xScores and missing Sofix actuals despite scores elsewhere in the app. Both groups must use the same card/name/score layout and compare selected-GW values automatically, including older saved teams without new extension metadata.
- Reproduce with the real retained GW19 team (nine cards, no indices/scoring metadata) and GW21 player results. Add regression tests before correcting lookup and layout. Check recorded forecasts, saved player identities/card bonuses and selected-game results; reviewing/live results must remain provisional rather than being hidden or treated as DNP.
- No new user action or Sorare visit is required to use data already retained in Sofix. Validate real saved and live weeks at desktop/mobile sizes, as well as cold loading, navigation and closed-tab persistence.
- Fixed: entered and Sofix rows share their card and score components, including captain and bench labels. Entered estimates prefer the full retained pre-lock forecast; missing old bonus fields are restored only from that GW/board's replay. Legacy responses retain their appearance order, used for estimates when explicit indices are absent. Partially indexed responses remain unknown.
- Real-data verification: GW19's saved nine-card custom team now shows estimated xScore 406 and actual 374 on Recap and Play, without a Sorare session. The Sofix comparison remains 428/378. Every one of GW21's ten plan lineups now has an Actual so far (first row 224 versus xScore 251). Reviewing/live played scores are provisional; pending/unplayed live rows cannot trigger substitutions.
- Follow-up checks: `node scripts/check.mjs` passed generated types, eslint, typecheck and the frontend unit suite. Fourteen focused scoring tests passed. The 32-case Recap/Play browser run passed 31 cases; the old compact-card selector expectation was corrected and its rerun passed along with both Recap acceptance cases and mobile Recap (4/4). The mobile suite passed all 14 cases. Real saved/current Recap and saved Play screenshots at 1440/390 px were inspected under `output/playwright/recap-fixed-*` and `play-fixed-*`, with no page overflow. Web Interface Guidelines review passed the shared components and styles. A real authenticated Sorare read remains unverified; saved data and the extension test path cover these fixes.

### Initial delivery checks (before the follow-up)

- Add failing regression tests before changes: live/end boundary and stale nextId, explicit navigation, essence selection, all-lineup coverage, matching forecast identity, missing versus zero, and comparison layout.
- Run the required local checks and browser suite (shared week selection changes), then inspect local real-data Recap and Play at 1440 and 390 px.
- Initial production check: all 13 routes returned 200; Vercel, backend/frontend/browser CI and refresh successful.
- Local gate passed: ruff format/check, mypy, 1,022 pytest tests, OpenAPI export, generated API types, eslint (zero warnings), typecheck and vitest.
- Final Recap spec: both acceptance tests passed, covering all entered/best-plan rows, custom captain estimates, actual zero, explicit alternatives, selected-GW isolation, reload, closed tabs and desktop/mobile screenshots. All initial browser failures were resolved in affected-page and focused reruns. Final board restoration and score validation also passed typecheck, lint and 21 focused unit tests.
- Full browser suite exercised 219 cases. Ten failures exposed obsolete default-week/position/selectors, the away-week text floor and an incomplete extension test ping. These were corrected and rerun. All 30 Play tests passed; mobile layouts passed apart from a cold compile readiness assertion, which passed with a page-ready wait. The focused audit/Recap/freshness/default-week regressions passed after corrections.
- Local real read models: default is GW21 (9–13 October), all 10 best-plan lineups rendered, with partial actuals distinguished from missing. GW22 opens Plan 2 (12 expected essence) instead of Plan 1 (10). Frozen GW19 shows xScore 428 and actual 378; its saved entered team still shows actual 374. Read-only SQL confirmed 84 selected game IDs in GW21's frozen forecasts and 19 in GW19's.
- Captured and inspected desktop 1440 px/mobile 390 px Recap and Play screenshots under ignored `output/playwright/`, including the real saved GW19 and the extension-fixture custom score rows. No horizontal overflow. UI guidelines pass: labelled score groups, semantic controls, tabular numbers, 11 px text floor and existing focus/reduced-motion behavior preserved. Guidelines: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md.
- Real signed-in Chrome was unavailable to the browser tools. Authenticated reads and custom-score persistence/tab closure were verified with the repository's extension test path, not a real owner session. The initial delivery left old records without slots unknown until an automatic metadata read; the follow-up above removes that dependency for retained forecasts/rules. A forecast missing from that GW remains unknown. No later GW's forecasts or another competition's multipliers fill gaps.

### Source evidence (credential-free)

Sorare's public schema (https://api.sorare.com/graphql/schema) exposes appearance `index`, `grade`, `positions`, `averageScore`, player identity and leaderboard scoring configuration. One representative public read-only request returned LaLiga's five starter/two substitute slots, 0.5 captain bonus, 0.05 season bonus, 0.01 per grade, 0.02 club bonus and 0.04 cap bonus:

```graphql
query {
  so5 { so5Leaderboard(slug: "football-9-13-oct-2026-seasonal-spain-in_season_spain_limited") {
    rules { appearances(includeSubs: true) { positions sub } }
    engineConfiguration { season captain grade scarcity sameActiveClub averageScores }
    displayedTypedRules { key }
  } }
}
```

The existing allowlisted `SofixFixtureLineups` query now supplies this metadata and original appearance indices in the same selected-GW read. No new write operation, permission or credential handling was added.
