# Sorare's starting % in Sofix: owner contract, 12 October 2026

Read with AGENTS.md and [sorare-data-repair.md](sorare-data-repair.md) (why the public API cannot give this number).

## What the owner asked for (12 Oct 2026)

"Why is the starting % not shown in /lineups for Sorare, and in other places too?" Then, from the options offered:
**A, B and C.** His own words for C: "a button that opens and reads all the team games and saves the %".

- **A. Save what the extension sees.** Every starting % that Sorare's own page loads in his signed-in tab is saved in
  the database, not kept 15 minutes in the tab's memory. No action from him.
- **B. His own cards.** Sorare shows the % "while composing your team or when checking it in the lobby" (its help
  page). Those pages are ones he opens anyway; what they load is saved through A. No new action from him.
- **C. One button.** On Lineups, Sorare view: "Read the round on Sorare". The extension opens each match of the round
  in a background Sorare tab, one at a time, lets Sorare's page load, saves what it shows and closes the tab. He
  accepted that it opens tabs (it was the tradeoff parked on 10 Oct; he proposed the button himself on 12 Oct).

Not asked, not built: D (asking Sorare directly from the tab). `extension/bridge.js` already records why: a query of
ours gets `null` for the odds; only the page's own questions get a number.

## Evidence held on 12 Oct 2026

- Public API, keyless, the job's own squad query: every Real Sociedad player has a projection and
  `nextClassicFixturePlayingStatusOdds: null`. In the database: 0 of 623 market players and 0 of 31,080 game rows ever
  had a Sorare start chance.
- The one native shape captured (10 Oct, `frontend/lib/extensionBridge.test.ts`): Sorare's `LazyFixtureChartQuery` on a
  player page carries that player's odds for each of his coming games.
- **Not yet seen:** what a match page, the compose page and the lobby actually send (one player, a team, both teams?).
  Claude could not look: the owner's Chrome was not connected on 12 Oct. So how many players one page of C yields is
  unknown until his first click. The saved rows answer it (`sorare_chances:<game>` holds one entry per player).

## How it works

1. `bridge.js` (page): a native answer with odds posts the new or changed readings (`type: "chances"`), plus the games
   the answer mentioned even when Sorare had no number for them.
2. `content.js` → `background.js`: `chances-seen`; the background posts them to `POST /api/ext/chances`.
3. The app saves one row per game, `read_models` key `sorare_chances:<Game id>`,
   `{ players: { <player slug>: [basis points, seen at (epoch seconds)] } }`. The merge happens inside Postgres, so
   nothing is downloaded to save a reading. `0` stays zero; a game Sorare has no number for is never written.
4. Lineups reads the saved rows of the matches it shows and uses them as the Sorare view. A live reading from an open
   tab still wins while it is fresher.
5. The button sends the round's linked matches to the extension (`read-round`), which walks them and answers with how
   many players each match gave.

## Acceptance (real data, his signed-in Sorare)

- [ ] After reloading the extension (0.3.14), opening one Sorare page that shows a starting % makes that % appear on
      Lineups (Sorare view) after a reload of Sofix, with the Sorare tab closed.
- [ ] The button on a LaLiga round: every linked match answers with a player count; the counts and the saved rows
      agree; the round's Sorare view shows numbers without visiting any match by hand.
- [ ] A 0% shows as 0%; a match Sorare has no odds for says so and writes nothing; a double gameweek never borrows the
      other game's number (rows are keyed by game).
- [ ] His own cards outside LaLiga get a number after he opens his team-building page (B).

Until these are ticked on his machine this is built, unit-tested and unproven on real pages.

## Next, once real readings exist

Feed the saved number to the job as the `sorare` source (forecast, plans, Home, Play, overlay) and into
`player_games.sorare_start` for the Audit, with the pre-lock rule `save_statements` already applies. Not in this step:
it changes plan numbers for players Futbol Fantasy does not cover, and needs real readings to test against.
