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

- Add failing regression tests before changes: live/end boundary and stale nextId, explicit navigation, essence selection, all-lineup coverage, matching forecast identity, missing versus zero, and comparison layout.
- Run the required local checks and browser suite (shared week selection changes), then inspect local real-data Recap and Play at 1440 and 390 px.
- Initial production check: all 13 routes returned 200; Vercel, backend/frontend/browser CI and refresh successful.
- Local gate passed: ruff format/check, mypy, 1,022 pytest tests, OpenAPI export, generated API types, eslint (zero warnings), typecheck and vitest.
- Final Recap spec: both acceptance tests passed, covering all entered/best-plan rows, custom captain estimates, actual zero, explicit alternatives, selected-GW isolation, reload, closed tabs and desktop/mobile screenshots. All initial browser failures were resolved in affected-page and focused reruns. Final board restoration and score validation also passed typecheck, lint and 21 focused unit tests.
- Full browser suite exercised 219 cases. Ten failures exposed obsolete default-week/position/selectors, the away-week text floor and an incomplete extension test ping. These were corrected and rerun. All 30 Play tests passed; mobile layouts passed apart from a cold compile readiness assertion, which passed with a page-ready wait. The focused audit/Recap/freshness/default-week regressions passed after corrections.
- Local real read models: default is GW21 (9–13 October), all 10 best-plan lineups rendered, with partial actuals distinguished from missing. GW22 opens Plan 2 (12 expected essence) instead of Plan 1 (10). Frozen GW19 shows xScore 428 and actual 378; its saved entered team still shows actual 374. Read-only SQL confirmed 84 selected game IDs in GW21's frozen forecasts and 19 in GW19's.
- Captured and inspected desktop 1440 px/mobile 390 px Recap and Play screenshots under ignored `output/playwright/`, including the real saved GW19 and the extension-fixture custom score rows. No horizontal overflow. UI guidelines pass: labelled score groups, semantic controls, tabular numbers, 11 px text floor and existing focus/reduced-motion behavior preserved. Guidelines: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md.
- Real signed-in Chrome was unavailable to the browser tools. Authenticated reads and custom-score persistence/tab closure were verified with the repository's extension test path, not a real owner session. Old records without slots remain unknown until the automatic metadata read succeeds; a forecast missing from that GW remains unknown. No later GW's forecasts or another competition's multipliers fill gaps.

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
