# The xScore success rate

**66%.** Take two of your players in the same position and the same gameweek. The one the xScore rated higher scored more
in 66 of every 100 such pairs. A coin flip gets 50. The honest range is 65% to 67%.

That is the one figure the [Audit page](../frontend/app/audit/page.tsx) leads with. This document says exactly how it is
counted, why that way, what it says and what it does not, and how it is kept up to date.

| | |
|---|---|
| Pairs behind it | 39,961 |
| Gameweeks | 99 (Sorare's own, 3 Aug 2025 to 1 Oct 2026) |
| Players | 84 of yours |
| What was scored | the form formula behind the xScore, replayed on their games |
| Where the numbers live | [`backend/data/audit/replay.json`](../backend/data/audit/replay.json), numbers only |

## How it is counted

1. **Every gameweek.** For each of Sorare's gameweeks, take the players of yours that had a game in it.
2. **What the xScore said.** Replay the xScore as it would have been before that gameweek locked, knowing only the games
   before it. This is the same code the page runs (`forecast.forecast`), not a copy of it.
3. **What he scored.** The best of his games in that gameweek, because that is Sorare's own rule for two games in one
   gameweek (`multiGameScoreAggregator` is `max`). Zero if he did not play.
4. **Pairs.** Within one gameweek, pair every player with every other player of his position. Goalkeepers are only paired
   with goalkeepers, defenders with defenders, and so on, because that is the choice a lineup makes.
5. **Right or wrong.** A pair is right when the player with the higher xScore scored more.
   - Two players who scored the same (two zeros, say) are not a pair: neither was the better pick.
   - Two players with the same xScore count half a pair, as a coin flip would. Saying the same number for everyone
     therefore scores exactly 50%, which is why 50% is the baseline.
6. **The rate** is the pairs that were right, divided by all pairs.
7. **The range** comes from drawing the gameweeks again at random 2,000 times, whole gameweeks at a time (a gameweek's
   pairs move together, so counting them as independent would make the range too narrow), and taking the middle 95%.

A worked example. Three midfielders, one gameweek:

| | xScore | Scored |
|---|---|---|
| A | 48 | 30 |
| B | 41 | 55 |
| C | 25 | 10 |

A against B is wrong (A is rated higher, B scored more). A against C and B against C are right. That is 2 of 3 pairs, 67%.

## Why this figure and not another

The xScore is an expected score, and a single game's score is mostly luck: a player scores 0 or about 60, rarely 33. So
asking "how close was it?" mostly measures luck. What a lineup needs from the xScore is a choice: of these two, who is the
better pick? This figure asks exactly that, and it has a natural floor (50%, guessing) that makes any number readable.

The other ways of counting it, on the same games:

| Way of counting | Result | Why it is not the headline |
|---|---|---|
| Within 10 points of the real score | 35% | Depends on the 10; a score is 0 or about 60, so being "close" is rare for anyone |
| Within 15 points | 49% | Same |
| Within 20 points | 59% | Same |
| Typical miss | 19.5 points | In points, not a rate, and it has no baseline to be judged against |
| Level (said against scored) | says 32.7, players scored 35.6 | It runs about 3 points low; about the level, not the choice |

## What it says, and what it does not

- **It is better than guessing, modestly.** 66% is 16 points above a coin flip: about a third of the way from guessing to
  never being wrong.
- **A plain average of his last five games does as well.** It scores 66% too (64.8% to 67.3%). The xScore's formula adds
  nothing to the ordering so far. What the page adds beyond it, Sorare's own projection and Futbol Fantasy's chance of
  starting, is not in the history, so this replay cannot test it. The live check below will.
- **By position:** goalkeepers 69%, defenders 66%, midfielders 64%, forwards 68%. The ranges are wider for goalkeepers,
  who are fewer.
- **It is a replay of the form formula only.** Sorare publishes its projection only for the next game, and Futbol
  Fantasy's lineups are not kept once a game is over, so neither is in the past. The Audit page says "replay" for that
  reason.
- **It covers your players, 84 of them, since August 2025.** Not the whole league.
- **Nothing has been tuned on it.** The games from 1 Oct 2026 are held out: any change to the formula is decided on the
  games before that date and checked once on the ones after. The history ends on 1 Oct 2026, so the held-out part has
  next to nothing in it yet, and no change to the formula has been shipped.

## The live check

The replay is the past. From the first gameweek Sofix recorded (GW19, locked 2 Oct 2026) the refresh also writes down,
before each lock, what the xScore said for each of your players with a game, and a day after the gameweek it adds what
happened. The page counts the same pairs on that record: this is the real xScore, with Sorare's and Futbol Fantasy's
numbers in it.

It shows a figure from 100 pairs. Until then it says "too few to tell", with how far along it is, rather than a number
that is mostly luck. The first two gameweeks recorded were international-break weeks with only 15 of your players. In a
normal LaLiga round about 75 of them have a game, which is several hundred pairs, so expect a figure once the first
LaLiga round (round 8, GW21) is settled, from Wed 14 Oct.

## Who starts

The second half of the page. Sorare, Futbol Fantasy and Sofix each give a chance that a player starts a game. Each is
written down before the lock and checked, a day after the gameweek, against whether he started.

- **Called right:** said 50% or more and he started, or said less and he did not.
- **Error score:** how far the chances were from what happened, on average. 0 is perfect; 0.25 is what saying 50% every time
  gets. Lower is better.
- **What 80% means:** of the players a source put at 80% or more, how many started.
- **The floor:** a source shows its figures from 100 games. Under that the page says "too few to tell".

What is known today:

- **Sofix, replayed on the past:** right on 72% of 4,615 games. Saying he always starts would be right 56% of the time. Its
  error score is 0.188, against 0.246 for saying the same thing every time. It runs a little low: it says 51% on average and
  56% of those players started; where it said 80% or more, 87% started.
- **Futbol Fantasy:** covers LaLiga only, and none of your players had a LaLiga game in the two gameweeks recorded so far
  (their games were Nations League, Segunda División and Argentina). It joins the record with the first gameweek that has
  one (round 8's, locking on Fri 9 Oct).
- **Sorare:** has not given a start chance for any of your players. If that stays so, it never joins the comparison.
- **The three side by side, on the same games,** needs about 100 games for each. Round 8's Futbol Fantasy lineups name 75 of
  your players, so Futbol Fantasy and Sofix should reach 100 checked games within about two LaLiga rounds (round 9 is Fri 16
  to Mon 19 Oct), and Sorare only if it ever gives odds. Recording every LaLiga player rather than only yours (roadmap,
  decision 4) is not needed for this.

Only Sofix's chance can be replayed on the past, because the other two are not kept anywhere once a game is over.

## Keeping the number up to date

The replay file is made on your machine, because the history is yours. From `backend/`:

```bash
python -m app.jobs.export_history
python -m app.jobs.xscore_backtest --summary data/audit/replay.json
```

The first reads your players' games from Sorare's public API (slow, and rate limited per address; it waits and goes
on). The second writes the full report to the screen and the numbers the page shows to the file. Commit the file: it holds
numbers only, no player is named in it. The next refresh puts it on the page.

Rerun it when a good number of new gameweeks have been played, or when the formula changes.

## Where each piece lives

| Piece | Where |
|---|---|
| The count of pairs | `backend/app/sorare/backtest.py`, `pair_accuracy` |
| The replay, the live record and the page's numbers | `backend/app/sorare/audit.py` |
| The record that the live check reads | `backend/app/sorare/starts.py` (`start_chances`) |
| The page | `frontend/app/audit/page.tsx`, `frontend/components/audit/AuditView.tsx` |
| The step that writes it | `backend/app/jobs/sorare.py`, after the start record (read model `audit`) |
