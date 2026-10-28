# Plan algorithm v2 (28 Oct 2026)

The owner's ask, after a deep dive into the recommended plan: Sofix picks the best lineups each week on its own, and learns
from each gameweek. His own lineups stay a comparison only (no "plan around what I entered").

## Requested (contract)

1. **Score fix.** Make the projected score and its range right.
2. **Reward bar from many weeks.** The score a reward needs comes from every finished week of the season (the last 10 weeks,
   last season's included, at the start of a season), not the last week only.
3. **Swap cards between lineups** after the plan is built, every refresh, so the plan is ready hours before the lock.
4. **Captain from every starter**, not only the top three.
5. **Essence by dilution.** A league's own essence (LaLiga, Bundesliga… whichever he plays) is worth far more than Champion
   (five leagues mixed), and All Star (every league, SPFL included) least.
6. **Strategies compete every week.** The top three strategies are simulated each gameweek and the plan is built with the one
   that wins the simulation; no waiting ten weeks for a verdict.
7. **Rebuild on news**, not only on the clock.
8. **Track record in the Play hero**, beside "Expected paid lineups".
9. **Learn after each gameweek:** like the strategy audit, measure each part of the calculation on what happened and feed the
   result back (score stretch, spread, cut-offs, captain, start chances).

## What the deep dive found (GW21-25, frozen plans against what happened)

- **Lineups beat their projection by 31 points** (35 lineups); 10 of 35 landed above the top of the range, none below.
- **The player number is right on average**: 461 LaLiga starts of GW21-24, real minus Sofix +0.2, spread 17.7 (the planner uses
  17.6), same miss as Sorare's projection (14.0). The miss is at the ends: players Sofix rates 60+ score 5 more, under 40 score
  6 less (fit: real = -11.8 + 1.24 x Sofix; slope 95% range 0.96-1.52, so not proven yet). The plan picks the top players,
  hence its +31. The learning loop turns the stretch on once its range clears 1.
- **Start chances are right**: said 89% → played 87%; said 70% → 76%.
- **Reward chances are right in total**: said 6.2 paid lineups, 8 paid (32 judged).
- **The reward bar from last week misses by 39.5 points**; the mean of all earlier weeks misses by 28.9 (1,099 cut-offs). The kept
  record holds only 14 weeks, so the season is fetched from Sorare once.
- **The captain** was the lineup's best starter 9 times in 32; about 11 points lost a lineup.
- **Hindsight**: GW21's best plan sent the cards that scored 90-100 to Champion (5,000 and 2,000 essence); ours had them in
  LaLiga Cap and All Star.
- **GW25's records are missing** (strategy lab, Sorare-numbers plan, score record): every refresh from 19 Oct 23:26 to 25 Oct 16:04
  wrote to Sofix C, and production moved on 25 Oct to a project that never got those days. Sofix C answers again on 1 Nov.

## Order (each shipped on its own)

| Step | State |
|---|---|
| 3, 4, 5: polish, captain, essence weights | shipped 28 Oct. Replan of GW21-25: expected (weighted) essence higher in 4 of 5 weeks (+4% to +35%), GW21 550 against 574 |
| 2: reward bar from the season | shipped 28 Oct: mean of the season's comparable weeks (24.3 off against 29.2). At a season's start the list holds only this season's weeks: Sorare's fixture list stops at Game Week 1 (`sync.gameweeks`) |
| 6: strategy contest | |
| 8: track record | |
| 7: rebuild on news | |
| 9 and 1: learning loop (score stretch, spread, cut-off bias, captain) | |
