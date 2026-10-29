# Arcade rework: the real Sorare flow (29 Oct 2026)

Owner, 29 Oct: planning "flawed and undercooked"; "make it prioritize playing quickly… whether to move up and down quickly or wait,
and why. Last set I chased the perfect lineup up to step 5, lost, and wasted a month"; surface high-value teams with a good Sofix start %
and positive Sorare news; with 300+ gems, which packs to buy for Icons or Stars or to finish missions, showing the maths; redesign around
the real flow; keep the game selection and its ticket styling as is. Audit before it: [arcade-audit.md](arcade-audit.md).

## What the real flow is (evidence)

| Fact | Source |
|---|---|
| Sorare's site now calls the mode **Series** (`/football/series/play`); next set **Divination**, from 30 Oct 13:00 UTC, same four leagues, no end date yet | owner's signed-in tab; public `cardSet { nextSet }`, 29 Oct |
| A step: GK, DF, MD, FW + 1 outfield; 4 lives; a miss costs one; the last sends you to step 1; a validated score moves you up at once, no gameweek wait; scores freeze 5 minutes after a game | Sorare help 33949360053917 "What is Arcade?" |
| **Lineups entered together on one step are insurance only: when one clears, Sorare cancels the others.** 21 Oct, step 2: 313.93 cleared; 371.76, 357.29 and 316.16 on the same day's games were cancelled (the 371.76 would have cleared step 3) | owner's kept board (`sofix-arcade-last`, read 22 Oct) |
| So the climb runs **window by window**: a lineup on the 14:00 games settles about 16:00 and the next step can take the 18:30 games the same day. The old plan moved one day at a time and joined up to 3 days, which made it slower | the above; `pickableGames` lists each game's kick-off |
| Tiers: GOAT = Icon (5★), STAR 4, IMPACT 3, ROSTER 2, DNP = Reserve 1; `_PLUS` tiers between | public `config.gameplayTierRatings`; Mbappé, Yamal, Raphinha, Pedri GOAT; Vinícius STAR |
| Each pack slot publishes each tier's share and each player's chance (`slotGameplayTierOdds { gameplayTier probabilityBasisPoint playerOdds { player team } }`) | Sorare SDL; query validated against the API 29 Oct |
| Packs on HyperGlitch: Gold 50 gems, Silver 10 gems (5 cards), Live Today 10 gems (3), Bronze 1,000 essence; the owner has 326 gems | kept board; his Series page |
| Collection missions (`setCollectionsTaskTracks`, `myCollectionTasks`): `CardsCountTargetTask` names players, clubs or leagues; only first-owner cards count | SDL; Sorare help 26447573297565 |
| Sorare's player `news(last:)` is **empty** (signed in or not); `playingStatus` (STARTER, REGULAR, SUBSTITUTE…) and `activeInjuries` are filled, months ahead | read for 8 players, 29 Oct |
| A common card's score swings by about a third of its average (median 0.327, quartiles 0.264–0.385, 884 players with 5+ games); 206 of 1,171 had under 3 games and were treated as sure scores | owner's kept extras |

## What changed

- **Planner** (`lib/arcadeClimb.ts`): kick-off windows (games within 75 minutes); from each window a lineup may use that window, the next
  3 hours, the rest of the day or up to 26 hours; 1 to `lives` lineups together; a look-ahead to the last listed game values the highest
  step cleared. A hold costs the window it skips; a near tie (0.005 of a step) is played. It can **spend** a hard step's last lives when the
  steps below are quick, and **wait** for a clearly better window, naming it. Tested in `arcadeClimb.test.ts`.
- **Your move / the chain / the board's chances** (`ArcadePlanner.tsx`): replaces the tower, departures and on-deck.
- **Captain**: never a card with no start % while another has one (`bestLineup`, `quickLineup`). **Thin records** get a spread.
- **Teams to build around** (`lib/arcadeTeams.ts`, `ArcadeTeams.tsx`).
- **Gems and packs** (`lib/arcadePacks.ts`, `ArcadePacks.tsx`): Icon, Star or better, new players, each collection mission.
- **Pick teams**: tickets unchanged; busy cards left out; settle time shown; games and aim shared with Your move and the teams.
- **Extension 0.4.18**: tiers and clubs in pack odds, Sorare status in the past-scores read, the collection missions read.

## Owner's answers (29 Oct, evening)

- Rewards repeat: "each time you get to the last step you get 1000eur". The planner now counts money won (each clear pays again, the top
  restarts the climb from step 1) instead of the highest step reached; essence and gems break ties only. Tested in `arcadeClimb.test.ts`.
- "Duplicated cards don't count in missions, even special cards (if you have the base card)": a mission goal counts each player you do not
  have once (`missionGoal`, `arcadePacks.test.ts`).
- Between sets the page shows the last board, marked ended, instead of an empty page.

## Not confirmed (check when Divination opens, Fri 30 Oct 14:00 Madrid)

- The new reads on a live board: tiers in pack odds, Sorare status, collection missions (only validated against the schema; the board
  and missions are empty between sets).
