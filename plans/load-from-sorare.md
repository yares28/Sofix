# Plan 4 · "Load from Sorare" and the on-the-move rebuild (20 Oct 2026)

The owner's idea: one button in Sofix that loads what Sorare knows now (announced elevens, starting chances, missions) and rebuilds a
lineup, Pro first, around players who start. Every line below is marked with where it was checked. Step 1 of section 7 is built
(20 Oct 2026: `backend/app/jobs/pro_rebuild.py`, `pro-rebuild.yml`, `/api/pro-rebuild`, Play's Pro lineups, the dock); steps 2 to 4 are not.

## 1 · Checked: what exists and what Sorare gives

| What | Status | Evidence |
|---|---|---|
| Announced elevens and benches | **Public, no key, no session.** `Game.homeFormation/awayFormation { startingLineupAvailable startingLineup bench }` | Sorare's schema (`api.sorare.com/graphql/schema`, type at line 29730); read in production by `frontend/lib/actualLineupsData.ts` (60 s cache) |
| When elevens appear | **Measured 20 Oct 2026** on two 16:45 UTC Champions League games: see section 5 | `xi_watch` log, one public request every 2 min |
| Starting chance | Sorare's type has `starterOddsBasisPoints`, **`substituteOddsBasisPoints`** and `nonPlayingOddsBasisPoints`, documented as "only available within Sorare products"; the public API answers null | Schema line 19565 and type `PlayingStatusOdds` (line 19824); `plans/sorare-data-repair.md` (null test, API issue 693) |
| What the extension keeps of it | The starter chance only (`extension/core.js` `collectStartingOdds`, `bridge.js`, `lineupChances.ts`). The substitute chance is dropped | grep of the repo for `substituteOdds`: only the job's public query asks for it (`sync.py`), and that answers null |
| Reading a whole round of starting chances | Built: Lineups' "Read the round on Sorare" opens up to 40 match pages in background tabs, 4 min limit | `extension/background.js` `readRound`, `LineupsView.tsx` |
| Missions | Built: the app's Load button reads them through the open Sorare tab | `background.js` `loadMissions` |
| Pro boards and steps | Built: read from the public API by the job | `backend/app/sorare/pro.py` |
| The planner | Python, in GitHub Actions. Its own time is **12.6 s**; a whole refresh is **7 to 9 min** (Sorare reads 118 s, Futbol Fantasy 113 s, score checks 41 s) and reads **20 MB** from Neon | `refresh_runs` row 169 (20 Oct 12:46), `details.sorare.parts` and `neonMB`; GitHub run timings |
| Starting a job from the app | Built (`dispatchRefresh`, used by Refresh and near-lock). A manual run's job starts **2 to 5 s** after the request | GitHub API, runs 39420158685, 39341529224, 38911722001 |
| Closest existing job | `replan.yml` (re-plans a locked week): **300 s**, of which 17 s setup and 279 s the script, which reads Sorare again | GitHub run 39340886527 |
| Entering Pro from Sofix | **Not built.** Apply leaves Pro out (`play.ts` `enterable`); `plans/pro.md`: "Not built: (c) Apply for Pro". Sorare's schema has `upsertTaskLineup(taskId, taskAppearances, targetScore, taskLineupId)` | Schema line 41494; untested through the extension |
| Pro rules | Enter or edit a lineup **until its first player kicks off** ("you can wait for confirmed starting lineups"); 4 tries per step; pre-set lineups go in by themselves; a card in an active lineup is locked | Sorare help "What is Pro?" (updated 14 Aug 2026) |
| Arena rules | Lineups lock **Tuesday and Friday 16:00 CET**; one goalkeeper and one outfield sub come in only on a DNP | Sorare help "What is Arena?" (14 Aug 2026) |
| The owner's Pro rule today | A Pro lineup's games start within an hour and it is entered only if all its players start | `pro.py` docstring, `plans/pro.md` (20 Oct) |

## 2 · What follows from it

- **Possible:** rebuilding a **Pro** lineup on announced elevens. Pro can be edited until the first kickoff, the elevens are public, and
  the planner itself is seconds.
- **Not possible:** the same for Arena (Classic, In-Season). It locks at 16:00 CET on Tuesday or Friday, before nearly every teamsheet;
  after that the only change is Sorare's own DNP sub. For Arena the button can only refresh starting chances before the lock.
- **Possible from a phone:** the elevens and the rebuild need no extension. Starting chances and missions do (desktop Chrome with a
  Sorare tab open); entering needs the extension too.
- **Not possible without Sorare's page:** starting or substitute chances in the job. They exist only in what Sorare's own page loads.
- **Possible but not done:** keeping Sorare's substitute chance. The type has it; whether Sorare's page asks for it is unseen
  (one look at a player page's network answer settles it).

## 2b · What a player's record shows about games he did not start (checked 20 Oct 2026)

- **His score in each game he came on:** kept. The job asks Sorare for `gameStarted` and `minsPlayed` of every game of your players
  (`sync.py` line 103) and keeps them (`player_games`); the forecast already splits his last five into starts and substitute
  appearances (`forecast.py` `_split`).
- **A game he did not play at all:** kept only as "did not play". Whether he sat on the bench unused or was not in the squad is **not**
  in the job's record. It is in each game's bench list, which Sorare's public API gives per game (`Game.homeFormation.bench`); a local
  export holds it for 449 LaLiga games from 15 Aug 2025 to 4 Oct 2026 (`backend/data/raw/sorare_games.jsonl`, git-ignored, so the job
  cannot use it).
- So (b) can be checked on his substitute appearances now; counting an unused bench game as a 0 needs the bench lists of his past
  games read into the job first (one public request per game, cached once read).
- **The real figures (GW24 plan, live read model `sorare`, 20 Oct 2026, 54 players):** chance of playing once benched: median 30%,
  three in four under 43%, the top tenth over 53%; nobody at 80%. Highest: Riquelme 77% (39 if he comes on), Carlos Martín 66% (37),
  Saliba 65% (39), Mojica 65% (40), Gerard Moreno 60% (39). Score if he comes on: 36 to 44 for all ten. So 0.77 × 39 = 30 for the best
  of them, under any announced starter scoring 40+: with today's numbers (b) would almost never pick a bench player, and (a) is the
  case that matters. Why the rates are low: for a regular starter the rate comes mostly from his position's usual figure (few
  non-starts in his last five), and Sorare's substitute chance, which would replace it, is not kept yet (section 1).

## 3 · Shape

1. **Button on Play (Pro board):** "Load from Sorare". The app reads the announced elevens of the games in the Pro window (public API,
   already cached 60 s). With the extension present it also runs the existing round read and missions load.
2. **Rebuild job** (new workflow, the `replan.yml` pattern): plans Pro only from the latest run's saved forecasts with the announced
   elevens applied: announced starter = starts, anyone else = does not start. It publishes one small read model; the page shows the
   swaps ("Pedri not in the eleven → Gavi").
   **Bench players (the owner, 20 Oct 2026):** a player announced on the bench may fill a slot only (a) when no announced starter of
   yours can fill it, or (b) when he "has big scores even if he doesn't start" and "rarely has DNPs, a high % he plays (not starts)".
   Read with the numbers Sofix already publishes per player: (b) holds when his chance of playing once benched (`benchedOn`) times his
   score if he comes on (`on`) is at least what the best announced starter for that slot is expected to make. A Pro lineup has no sub
   slots, so a bench player who stays on the bench scores 0 for it. Section 2b has the real figures.
3. **Shown beside the plan (the owner, 20 Oct 2026):** Play's Pro board keeps Sofix's Pro lineup and adds the rebuild next to it,
   "rebuilt at 18:12", with the swaps named.
4. **Enter with Guide me (the owner, 20 Oct 2026):** the rebuild opens in the dock's Guide me on Sorare's own page, card by card, as
   the alarm's Swap does. Entering from Sofix (`upsertTaskLineup` through the extension) waits until after one real test.

## 4 · Costs (free tier)

- GitHub Actions: public repo, standard runner: free.
- Neon: a full refresh reads 20 MB (run 169). A Pro-only rebuild reads less; measure it on the first run. The live project has sent 0.2 GB
  of its 5 GB this month.
- Sorare public API: limited per IP (seen 2 Oct 2026: the history export, at one request a second, was refused after ~30 players). The button reads one
  game per request, cached 60 s, only when pressed.
- Vercel: one route call per press: within Hobby.

## 5 · When the elevens appear (measured)

Two Champions League games kicking off 16:45 UTC on 20 Oct 2026 (Fenerbahçe–Slavia, Sabah–Dortmund), polled every 2 min on the
public API: still unannounced at 15:45:00 UTC, all four elevens (22 players each game) announced at 15:47:00 UTC. So the elevens
appeared between 60 and 58 minutes before kickoff, for both games together. One evening, two games: a later check should repeat it
on a LaLiga matchday.

## 6 · Open: the owner's choices (no default taken)

1. ~~Bench players~~ answered (section 3): no count of games; his chance of playing once benched, against the best starter's score.
2. ~~Where the button lives~~ answered: on Play's Pro board.
3. ~~Replace or beside~~ answered: beside Sofix's Pro lineup, marked "rebuilt at 18:12".
4. ~~Entering~~ answered: Guide me on Sorare first; entering from Sofix (`upsertTaskLineup`) waits.

All choices are made (20 Oct 2026). Nothing is open but section 5's measurement.

## 7 · Order

1. Rebuild job + "Load from Sorare" button on Play's Pro board, Pro only, elevens only (works from a phone); the rebuild shown beside
   the plan; Guide me in the dock for it.
2. Add the extension's round read and missions to the same button (desktop).
3. Keep the substitute chance once a page is seen sending it.
4. Enter Pro from Sofix (`upsertTaskLineup`), after one real test.
