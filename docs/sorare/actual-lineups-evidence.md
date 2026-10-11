# Actual starting lineups — 11 October 2026

Select **Actual** beside FF/Sorare/Sofix on Lineups. The exact selected match's announced starting XI and bench load
automatically, without a signed-in Sorare tab, extension, manual match-page visits or additional spending.

Sorare is the first requested source and supports this. Its [official API repository](https://github.com/sorare/api)
links the [public schema](https://api.sorare.com/graphql/schema) and
[playground](https://api.sorare.com/graphql/playground). `Game.homeFormation` / `awayFormation` expose
`startingLineupAvailable`, `startingLineup` (player rows) and `bench`. These are starting match sheets, not starting
probabilities or a live list of players currently on the field. Our existing export held both sheets for 449 games.

The first diagnostic used two aliased `anyGame` roots; Sorare rejected it with `Duplicated root field`. The owner
explicitly approved an additional single-game request. It returned 11 starters on each side and benches of 11 / 12
for Real Madrid–Villarreal, 10 October 2026 at 19:00 UTC. That credential-free response is kept and tested in
`frontend/lib/fixtures/actual-lineup-response.json`. The rejected query was not treated as evidence of unavailable data.

Reproduction: POST JSON to `https://api.sorare.com/graphql`, `Content-Type: application/json`, no authentication:

```graphql
query ActualLineup($id: ID!) {
  anyGame(id: $id) {
    ... on Game {
      id date homeTeam { slug name } awayTeam { slug name }
      homeFormation { startingLineupAvailable startingLineup { slug displayName position } bench { slug displayName position } }
      awayFormation { startingLineupAvailable startingLineup { slug displayName position } bench { slug displayName position } }
    }
  }
}
```

Variables: `{"id":"Game:51889f90-24a2-44dd-8f6e-7933a36736e0"}`.

The server resolves the selected match against the competition's next / last 20 Sorare games, cached for an hour.
Both teams, home/away and exact kickoff must match. Formations use a one-minute cache so a negative read cannot hide
a newly announced XI for an hour. Selection, match navigation and returning to the visible page read on demand;
there is no polling or retry loop. Unknown names, date changes and ambiguous fixtures remain unmatched. Source errors,
rate limits, partial sheets and not-announced sheets are separate states. Each XI must have 11 unique players and one
goalkeeper in the source's first row; people cannot repeat across teams or bench. Actual cards show Starter / Bench,
with rows from the source, independently of fantasy positions. No predicted XI substitutes for a missing actual XI.

Real-data boundary: the direct formation query was verified on one current played match, alongside the 449 saved
matches. The index lookup, cache/expiry and navigation use fixtures in tests. Pre-kickoff announcement timing and
every competition's live coverage were not exhaustively probed under the diagnostic request limit.
