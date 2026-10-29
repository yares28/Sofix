# Arcade: can the chosen five be trusted? (plan, 29 Oct 2026, not started)

Owner, 29 Oct: "say start % is 100% … how can I trust those players are the best? In LaLiga I trust xScore a bit but here there
are a lot of leagues I have no info on, and maybe the xScore is a bit flawed. Check this with other than LaLiga start %, to always
make the best choice of players." Plan only; built when there is budget again.

## How a card is scored today (`outlookOf`, `frontend/lib/arcade.ts`)

| Piece | Source, in order |
|---|---|
| Score if he plays | Sofix xScore for the leagues with a Sofix board (LaLiga, Premier League, Bundesliga, Ligue 1, CL, EL, Conference) → Sorare's projection for the game → his average when he plays (`form`) |
| Start % | Sofix's number (LaLiga: FF → Sorare → Sofix; the others: Sorare's word, Sofix model) → Sorare's Arcade start % read from your tab → unknown (counts as starting) |
| Spread | his own played games, scaled to his score; under 3 games, a third of his score |
| Bonuses | edition, club, captain (Sorare's numbers) |

The lineup is the five with the best simulated chance at the step's target (`bestLineup`). So the choice is only as good as the
score each card gets, and that has never been checked against Arcade results outside LaLiga.

## Questions to answer, with data, before changing anything

1. **Which score source is right, league by league?** For every common card that played in HyperGlitch (the owner's kept board has
   1,171 commons, their past scores and Sorare's projections): Sofix xScore, Sorare projection, L5 and L15 averages against the score he
   actually made. Per league: mean error, and how often the source's top five for a game window was the real top five (the choice is
   what matters, not the exact number).
2. **Are start % honest outside LaLiga?** Sorare's Arcade start % and Sofix's, in buckets (0–20, …, 90–100), against who started.
   `/audit` already does this for LaLiga (starters by source); extend the same job to the Arcade leagues.
3. **Is the spread right?** Of lineups given a 60% chance, did about 60% clear? From the kept boards' entered lineups and their scores
   (21 Oct: 313.93, 371.76, 357.29, 316.16 are known).
4. **Do bonuses change the pick enough to matter?** Edition and club bonuses applied, against the same lineups without them.

## Steps

1. **Collect** (Python job, no new Sorare cost beyond one batched read): HyperGlitch game scores of the owner's commons' players, each
   with the projection Sorare showed before the game (kept in the extension's reads) and Sofix's xScore at the time where one existed.
   Keep a credit-free fixture of a few games for the tests.
2. **Backtest by league** (`app.jobs.arcade_backtest`, like `lineup_backtest`): for each source and blend, pick the five per window
   and score the pick with what really happened; report per league: top-five hit rate, points left on the table, calibration of the
   chance shown.
3. **Choose per league**: the source (or blend weight) that wins blind on the earlier half and holds on the later half. Ship only a
   league whose gain holds; the others keep today's order.
4. **Show it**: on each card, which source its score came from (SF / SO / form) and the league's measured error, so a thin league is
   visible; on Your move, the next-best card for each slot one tap away.
5. **Re-check each set**: the job runs after a set ends and writes the result to the plan's Results.

## Acceptance

- Per league, the chosen source's top-five hit rate and points left on the table, against today's, on games it was not tuned on.
- Lineup chances calibrated within 5 points per bucket, or the spread corrected until they are.
- No league uses a source that lost blind; a league with too few games says "too few to tell" and keeps today's order.
- Starts: Sorare's and Sofix's start % checked against real starts outside LaLiga, shown on `/audit`.
