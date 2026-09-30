# Plan · which "will he start?" to trust (T2)

Futbol Fantasy, Sorare or Sofix. Written 2026-09-30. Entry in [TODO.md](../TODO.md) (T2); the sibling plan is
[xscore.md](xscore.md), which uses the answer.

**Why it matters on screen.** A card's expected score is `p_play × mu` (`publish.py` `_expected`, the planner's
`value`), so the chance of starting scales the number on every tile, decides which cards a plan places and who
captains. It is also the percentage printed on every tile. If one source is clearly better, the numbers you see and
the lineups you are offered both move.

**Rule that stays until this plan finishes** (AGENTS.md, Limits): Futbol Fantasy is stored and compared only; nothing
on screen uses it until it has proved itself.

---

## 1 · What exists (verified 2026-09-30)

| Piece | Where |
|---|---|
| Futbol Fantasy read: lineups page + 20 team pages, 2 s apart, 150 s budget, never blocks the run | `backend/app/sources/futbolfantasy.py` |
| One row per source per player per gameweek, frozen at the lock, settled a day after the week | `backend/app/sorare/starts.py` (`rows`, `save`, `settle`) |
| Wired into every Sorare run, failures never stop it | `backend/app/jobs/sorare.py` (`record_starts`) |
| Scoring table (Brier, "right at 50%", mean) | `compare`, `python -m app.jobs.starts` |
| Stored as one read model `start_chances`, the last page read as `futbolfantasy` | no table, no migration |

All of it is on `main` and deployed (production deployment at `b84c6ba` is READY).

**What production holds today** (read-only count, 2026-09-30):

- `start_chances`: **1 gameweek, 15 players, 0 settled.** Sofix has 15 numbers, **Sorare 0, Futbol Fantasy 0.**
- `sorare_forecasts` (the older record of what Sorare and Sofix said): 3 gameweeks, 30 rows, 11 scored, and
  **`plays_odds` is empty in all 30**, although every row has a projection.

Two things follow:

1. **Futbol Fantasy has no rows yet, probably because the week recorded is a national-team week.** Its chances are for
   LaLiga's next round only, and `rows` writes one only when the player has a LaLiga game in that round's window. The
   recorded week has 15 players and 6 with two games, which is what a national-team week looks like. This is an
   inference: the first LaLiga week is the real test of the collection (A0).
2. **Sorare's starter odds may not be arriving at all.** `nextClassicFixturePlayingStatusOdds` has never made it into a
   recorded row. Either Sorare publishes it later than the lock-side runs (the code assumes "about two days before"),
   only for some games, or the read is wrong. Until this is known, one of the three columns is empty, and the tile's
   "54% he starts" for Oyarzabal is very likely the form formula, not Sorare (see
   [xscore.md](xscore.md), lead L2).

## 2 · The question, made exact

For each **(player, game)** with a LaLiga club game in a gameweek: did he start, and what did each source say before the
lock?

- **Outcome:** `started`, from Sorare's own game record (`gameStarted`), for the LaLiga game itself.
- **Sources:** Sorare's starter odds; Sofix from form alone; Futbol Fantasy's percentage; plus two dumb baselines to
  beat (the base rate, and his share of *starts* in his last five games from the history; the card's `started5` is how
  often he *played*, which is not the same thing).
- **Population:** only the players you own. That is also the only population the tile ever shows, so it is the
  right one; it is not a fair sample of "all LaLiga players" (owned players start more often).
- **Frozen at the lock**, because that is the last moment you can change a lineup; a later correction is not
  something you could have used.

## 3 · Phases

### A0 · Make sure the clock is running (before anything else)

The sample only grows on LaLiga weeks, so a silent fault costs a week each time.

1. **At the first LaLiga week**, read what the run wrote: how many of your LaLiga players with a game got a
   Futbol Fantasy number, and how many did not. Add a line to the run summary ("Futbol Fantasy: N of M matched") so it is
   visible without a query.
2. **Name matching** reuses Understat's matcher with no hand-checked overrides (`starts._matched`). Measure the match
   rate; list the unmatched names; add Futbol Fantasy overrides only for real misses. A wrong match is worse than none.
3. **Sorare's odds:** read `nextClassicFixturePlayingStatusOdds` for a few of your players in the last two days before
   a LaLiga lock, by hand, and compare with what `player_weeks` saw. Decide: late publication (fine, wait),
   missing for some games (record which), or a bug (fix, test-first).
4. **Settle by the game, not the week.** `settle` marks `started` if he started *any* scored game inside the
   gameweek's window. A player with a LaLiga game and another competition's game in the same window could be marked
   "started" for the wrong game. Check how often that happens in a recorded week; if it ever does, store the game id
   and competition in `Row` and settle against that game.
5. **Keep the reasons.** The `futbolfantasy` read model carries `international`, `suspended` and `lesion` per player;
   `start_chances` does not. Record `international`/`suspended` next to the chance so an outlier (a 70% on a suspended
   player) can be explained, not guessed at.

*Done when:* one LaLiga week has Futbol Fantasy numbers for most of your LaLiga players, the summary says so, and the
question about Sorare's odds has an answer.

### A1 · How fast the sample grows (measure, then decide)

`python -m app.jobs.starts` already refuses to call a difference under 100 settled players per source. After the first
LaLiga week, divide: settled players per LaLiga round ÷ 100 = rounds until a first verdict. International breaks add
nothing for Futbol Fantasy. Write the estimate in TODO.md.

If that is too slow for you, there is one option that costs something, and it is **your call, not a default**: settle
Futbol Fantasy against Sofix's form for *every* LaLiga player (about 500 Sorare history calls a week, throttled,
one batch), not only yours. It would answer "is Futbol Fantasy better than form?" in a few weeks, but not "better than
Sorare's odds", and it uses Sorare's rate limit. Recommendation: do not, until A0 shows how slow the owned-player sample is.

### B · The comparison

Extend `compare` and `python -m app.jobs.starts` (read-only) to report:

- **Paired table:** only players every source has a number for, so the sources face the same players.
  The unpaired table stays beside it.
- **By competition:** LaLiga club games and national-team games apart. Futbol Fantasy only has LaLiga, so it can only
  win there; for national weeks the contest is Sorare vs Sofix.
- **Brier and log-loss** (`backend/app/backtest/metrics.py` already has both), the reliability table (chance given in
  10%-wide bins against how often he started), and the raw mean against the base rate.
- **Uncertainty:** the difference in Brier between two sources with a 95% interval from resampling **whole gameweeks**
  (the same idea as the football model's matchday bootstrap, so the few players of one week are not treated as
  independent).
- **Recalibrated too:** Futbol Fantasy's percentages are editors' round numbers; also score each source after a
  leave-one-gameweek-out recalibration, so a source that ranks players well but is miscalibrated is not thrown away
  when a correction would fix it.
- **One verdict line per competition:** "Sorare", "Futbol Fantasy", "Sofix", or "no difference yet". The default
  when the interval includes zero is the incumbent (Sorare's odds, where it has them), because the simplest wins a tie.

Candidate to test as well: the plain average of the sources that exist for a player. Fit weights only when there are
300 or more paired players; three correlated sources on fewer would only overfit.

Tests first (AGENTS.md): synthetic weeks where one source is built to be better, and the interval must find it; where
none is, it must say "no difference".

*Done when:* the job prints the paired table, the interval and a verdict from synthetic data, and the real data gives
the same table with "too few" where it is.

### C · Use the verdict (only when B says a source wins)

Nothing here starts before a verdict. What it would change:

- **The chance that feeds `_split`** (`forecast.py`): today Sorare's odds, else form. It becomes: the source the
  verdict names for that competition, then Sorare, then form. `p_start + p_on` stays at most 1; Futbol Fantasy gives
  only the start chance, so the chance of coming on stays Sorare's (`plays − start`) or form's.
- **A suspended player** (Futbol Fantasy's `suspended`) is 0, with the reason shown.
- **The record:** `Forecast` carries `start_source`; `sorare_forecasts` needs it (and [xscore.md](xscore.md) P1 wants
  more columns), so they share **one migration**. Order matters: the owner applies the migration to production first,
  then the code ships; the unattended job has no right to create columns.
- **On screen:** the percentage does not change shape. The hover panel names where it came from ("54% he starts ·
  Futbol Fantasy"), and says plainly when it had none ("Futbol Fantasy: not available for this game"). The overlay answer
  (`lib/overlay.ts`) gets `startSource`; generated types and Zod follow (`npm run gen:types`).
- **Docs:** AGENTS.md Limits row (no longer "stored and compared only"), the manual, `docs/how_it_works.md`.

*Checks:* the planner and forecast tests, the overlay e2e, `npm run design`, and desktop + mobile screenshots of the
tile and the panel.

### D · Keep it honest

Re-run the comparison monthly (and after any change on Futbol Fantasy's site). If the chosen source falls behind
over the last ten or so gameweeks, say so in the job's output; switching back is a decision, not automatic.

## 4 · Risks

| Risk | What limits it |
|---|---|
| The site changes its HTML | The parser returns nothing rather than wrong numbers; the tests pin the row format; a run with no Futbol Fantasy data is normal. |
| Wrong name match | Only confident matches are kept; misses are listed (A0). |
| Too few players | The 100-player floor and the interval; "no difference yet" is an acceptable answer. |
| Politeness to a site with no API | Already limited: 21 requests, 2 s apart, at most every 6 h (45 min in the last 3 h before a lock). No change planned; nothing wider than that without asking. |
| Its percentages are for LaLiga's next round only | Rows are written only for a player with a LaLiga game in that round's window; a gameweek with two LaLiga rounds is one week per round since 28 Sep. |

## 5 · For the owner

1. Is "best source per competition" acceptable (for example Futbol Fantasy for LaLiga, Sorare for internationals), or
   should the tile always use one?
2. The wider sample in A1: no, unless A0 shows the owned-player sample is too slow?

## 6 · Order with the xScore plan

A0 and [xscore.md](xscore.md) P0 start now and are independent. B needs weeks of data, so it waits while the
xScore backtest runs. C waits for B, and shares its migration with xscore P1. Do not ship C and an xScore model
change in the same refresh: a shift in numbers could not be blamed on either.
