# Backtesting: how to test a change before it ships

Sofix has four replays. Each answers a different question, runs on your computer, reads files (not the database) unless said, and
writes nothing unless it says `--write`. Use the one that matches what you changed. Run everything from `backend/`:

```powershell
cd backend
.venv\Scripts\python -m app.jobs.<job> ...
```

| You changed | Run | It answers |
|---|---|---|
| How lineups are picked (planner, a strategy, a rule, the captain) | `lineup_backtest` | Does this way of picking score more points, or reach a good total more often? |
| The xScore (a player's number if he starts) | `outfield_fit`, `keeper_fit` | Is the typical miss smaller, week after week? |
| The whole xScore on the owner's players | `xscore_backtest` | How often does the number pick the better of two players? |
| Planner or start chances, on one real week | `replan_frozen` | What would today's planner have entered for that week? (reads the database, read only) |

## `lineup_backtest`: judge a way of picking lineups

```powershell
.venv\Scripts\python -m app.jobs.lineup_backtest --pools 600 --seed 7
```

**What it is.** A test on past games. It never looks at the current gameweek and never plans a real week.

1. It reads every LaLiga game in `backend/data/raw/sorare_games.jsonl` (who started, what each scored, the projection Sorare gave) and joins
   it to the football model's forecast for the game.
2. For every past gameweek it works out the number the model would have given each starter **using only the weeks before it**
   (`outfield.walk_forward`, `keeper.walk_forward`). The first weeks only train, so they are not tested.
3. It draws random **pools**: 30 players who started in one gameweek (3 keepers, 9 defenders, 9 midfielders, 9 forwards), each with his
   number and what he really scored. A pool stands in for "your cards".
4. Every strategy of `app/sorare/strategies.py`, the same code the refresh uses for the Strategies page, builds one lineup from the
   pool with those numbers (five slots, captain the best number of that strategy). The lineup is scored on the real scores, the captain's
   counting half as much again.
5. Beside them, a random lineup from the same pool, and the best lineup in hindsight (the same code fed the real scores).

**What the table says.** Mean points, how often the lineup was *good* or *great* (the random lineups' 90th and 99th percentile, so it
moves with the data, not with a number someone picked), and the share of the best-in-hindsight mean. The `pools` column can differ by row:
a rule such as "keeper with his defender" cannot always be met, and those pools are left out of that row.

**Reading it.**
- Differences under about 2 points are noise at 1,000 pools (the mean's standard error is about 2). Run more pools (`--pools 3000`) or
  another `--seed` before believing a gap that small.
- A change ships only if its mean does not fall **and** its good and great rates do not fall.
- "Great" rates are small numbers (about 10%): a gap of one or two points there is also noise.

**What it does not cover.** There is no bench, no card bonuses, no Sorare reward table and no "will he start" (everyone in a pool
started). It judges *picking*, not whole plans or prizes: for a week's plan use `replan_frozen`, and for real prizes the Audit.
"Surest starters" is skipped for that reason, and "Favourites only" needs the match odds, which only some games have.

**The data it uses, and keeping it current.** The file is a snapshot. Today it holds 449 games from 15 Aug 2025 to 20 Sep 2026 and
does not change by itself, so running the replay in two months gives the same answer unless you extend it:

```powershell
.venv\Scripts\python -m app.jobs.export_games          # reads only the games not in the file yet; free, no key, slow (2 s a call)
.venv\Scripts\python -m app.sorare.gamedata --refresh   # optional: download football-data.co.uk's newest results and prices again
.venv\Scripts\python -m app.jobs.lineup_backtest --pools 1000
```

Games still to be played are never read: a replay only ever uses finished games. The Sorare API refuses fast callers, so
`export_games` waits and resumes; stop it with Ctrl+C and run it again later. It takes a few minutes for a week or two of games.

**Time.** About 20 seconds for 150 pools, 2 to 3 minutes for 1,000.

### Testing a new strategy

1. Add it to `STRATEGIES` in `backend/app/sorare/strategies.py`: either `numbers` (move each player's number) or `rule` (a function that
   says whether a partly filled lineup can still be completed), or both. Nothing else is needed: the replay, the Strategies page and
   the tests pick it up.
2. Run `lineup_backtest`. Compare its row with `xScore`'s on the same seed and with a second seed.
3. If it does not beat the xScore, it can still be worth keeping on the Strategies page as a comparison, but do not put it on the Play page.
4. Add a unit test in `backend/tests/test_strategies.py` that shows the rule or number does what it says on a tiny pool.

### Testing a change to the planner

`strategies.pick` calls `planner.best_starters`, so a change there moves every row. Run the replay **before** the change and again after,
on the same seed, and keep both tables in the commit message or the plan's results. For the effect on a whole real week, replan it:

```powershell
# POSTGRES_URL must point at the database: the app string in the git-ignored `.env.sofix-neon`. Load it into the shell; never print, paste or commit it.
.venv\Scripts\python -m app.jobs.replan_frozen                 # the newest frozen week; or pass its slug
```

It reads the plan frozen at the lock and the owner's cards, plans the week again with today's code and prints each plan. It writes nothing.

## `outfield_fit` and `keeper_fit`: judge a change to the xScore

```powershell
.venv\Scripts\python -m app.jobs.outfield_fit --fixtures-from data/raw/sorare_league_history.json --through 2026-09-30
.venv\Scripts\python -m app.jobs.keeper_fit   --fixtures-from data/raw/sorare_league_history.json --through 2026-09-30
```

Each week's starts are predicted from the weeks before it only, then scored against today's number, the position's plain average and
Sorare's projection: typical miss, squared miss, how often within 7 points, how often the better of two players went first, with 95%
intervals from resampling whole gameweeks. Keep a change only if its squared miss falls in most weeks. Without `--write` nothing is
saved; `--write` fits on every start up to `--through` and writes the artifact the refresh reads, so use it only for a change you
mean to ship. The xScore formula itself is the owner's to change (AGENTS.md "Model rules").

## `xscore_backtest`: how often the xScore picks the better of two

```powershell
.venv\Scripts\python -m app.jobs.xscore_backtest --history data/raw/sorare_history.json --holdout 2026-10-01
```

Scores the model on the owner's players' game history (the file `app.jobs.export_history` writes; it is not in the repository, so export it first). Games on or after `--holdout` are reported apart: decide every change on the
earlier games and look at the held-out ones once. `--summary data/audit/replay.json` also writes the numbers the Audit page leads with
(numbers only, committed; the history itself stays on the computer).

## Rules for any backtest

- Judge on games the change did not see: walk forward, never fit and score on the same weeks.
- Report the table you ran, the seed and the number of pools or weeks. Never claim a gain smaller than the noise.
- Free only: these replays use local files. Nothing here needs a paid service or a deploy.
- The production database is read-only. Only `replan_frozen` touches it, and only to read.
