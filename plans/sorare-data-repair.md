# Sorare data repair — owner contract, 10 October 2026

Read this with AGENTS.md when resuming. Release 0.3.12 did not meet the owner's requirement.

The subsequent Missions repair is documented in [mission-comparison-repair.md](mission-comparison-repair.md), including
the confirmed owner choices, implementation, local verification and remaining source-history limits.

## Required outcomes

1. **Parked by the owner on 10 October:** selecting Sorare in Sofix loads the selected GW's available starting percentages automatically, without visiting
   individual Sorare match/player pages. One existing signed-in Sorare session may be required by the extension;
   do not introduce further user actions or background browser navigation without discussing that tradeoff.
2. Verify the API using Sorare's official documentation and https://api.sorare.com/graphql/playground. Keep the
   exact non-secret query and the result, including null/error distinctions. Prefer a supported automatic API path.
3. Every player shown in the relevant Sofix views has the computed xScore and available supporting statistics joined
   correctly to their actual game. Do not invent unavailable statistics or silently convert missing values to zero.
4. Verify which owner lineups are saved, when, and whether they are actually compared with Sofix's frozen predictions.
   Code that could save data is not proof that a particular GW was saved. Inspect stored data read-only.

## Acceptance before calling this fixed

- When starting percentages resume: cold start in Sofix with no match page visited; multiple matches/players from the selected GW have verified odds.
- When starting percentages resume: closing or navigating a Sorare match page cannot erase already-read valid data. Expired readings are labelled or
  refreshed; 0% remains zero; double GWs and other matches never borrow each other's values.
- Check player coverage on real read models and reproduce missing xScore cases in regression tests.
- Report actual saved lineup/GW counts and separate drafts, entered teams, frozen forecasts and completed comparisons.
- Do not claim a whole-GW live test passed when only a public player response or mocked extension was checked.

## Evidence and status

- 0.3.12 captures native responses in each Sorare tab's memory (15-minute TTL). Closing a tab loses the capture.
  It is a diagnostic workaround, not an accepted automatic loading solution.
- The schema linked by Sorare's official [API documentation](https://github.com/sorare/api) documents
  `PlayerGameStats.footballPlayingStatusOdds` as SorareInside data available only within Sorare products.
  [Issue 693](https://github.com/sorare/api/issues/693) reports the same public API nulls while website percentages remain visible.
- The public playground query below returned HTTP 200, no GraphQL errors, 60 game players with null odds in both versions,
  and three null next-fixture odds. Oyarzabal's separate projected-score field returned 50, so score availability is independent.
  This is evidence of the public product restriction, not an authenticated extension acceptance test. The owner chose to skip starting percentages.
- GW21's frozen plan holds all 84 owned players. Its score record holds 611 players, including 598 of the 619 current market
  players. The main optimizer has advanced to GW22 and omits GW21. The overlay and Players now restore the selected GW's
  retained records; other weeks never fill a gap. Eight owned players lack a stat sheet because they have fewer than three
  final starts with complete stats/context; missing is labelled and never replaced with zero.
- Read-only inspection found 41 entered lineups across 15 nonempty GWs, plus four saved empty weeks (19 saved weeks total).
  Live GW21 is not archived: only settled final lineups are saved. GW19's three frozen plans cannot be scored reliably because
  they predate saved bonus rules. They now say `Rules not saved`; pending actuals, no competition entry and an unsaved week
  have separate states. Do not claim these older comparisons are completed.
- Durable countermeasures are in AGENTS.md and `.cursor/rules/preserve-owner-workflow.mdc`; the requested user journey and
  source limitations must survive session resets. Shipping permission never authorizes substituting a different workflow.
- Real-data verification: all 84 owned players have a retained GW21 xScore; the authenticated local overlay returned every one
  with exactly the frozen score. Player search restored 598 forecasts. The real database exposed a separate timestamp-object
  crash on player pages; dates are now normalized at the database boundary and covered by a regression test.
- Local verification passed: `node scripts/check.mjs` (ruff, mypy, pytest, OpenAPI/types, eslint, TypeScript, vitest).
  Player, Cards, Play, Audit and mobile specs passed all 71 cases across the initial run and a five-case rerun;
  the rerun used a 120-second test budget for local compilation. Desktop (1440 px) and phone (390 px) screenshots of
  the real-data player search, player detail and Rewards pages have no horizontal overflow.

## Reproducible public playground query (10 October 2026)

Run in https://api.sorare.com/graphql/playground without credentials. The game is Real Sociedad–Deportivo, 11 October.

```graphql
query SofixStartingOddsCheck {
  anyGame(id: "Game:a313a797-15d2-4ab2-aa15-1285a9f6e986") {
    id
    playerGameScores {
      anyPlayer { slug }
      anyPlayerGameStats {
        ... on PlayerGameStats {
          fieldStatus
          current: footballPlayingStatusOdds { starterOddsBasisPoints }
          updated: footballPlayingStatusOdds(newVersion: true) { starterOddsBasisPoints }
        }
      }
    }
  }
  players(slugs: ["mikel-oyarzabal-ugarte", "jan-oblak", "vinicius-jose-paixao-de-oliveira-junior"]) {
    slug
    ... on Player {
      nextClassicFixturePlayingStatusOdds { starterOddsBasisPoints }
      nextClassicFixtureProjectedScore
    }
  }
}
```
