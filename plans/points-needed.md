# Points needed on Arcade and Pro lineup cards (2 Nov 2026)

## Owner's request

Every card of a complete Arcade or Pro lineup carries a pill at its art's bottom right: the raw Sorare player score that card
needs for the lineup to reach its step's target. It is a target calculation, apart from xScore, predicted score and start %.

## Workflow (the contract)

- **Before the games:** each of the five scoring cards takes an equal share of the target in bonus-adjusted points; its pill is
  `target / (5 × multiplier)`, rounded up to one decimal, ".0" dropped. One balanced way to reach it, not five minimums.
- **Multiplier = 1 + the bonuses the step's rules give, added once.** Arcade: edition + club (only while the step's
  `collection` rule is not off) + captain (the step's `captain`); an entered Arcade lineup uses Sorare's own multiplier for each
  card (`bonus`, captain included). Pro: in-season + level + rarity (the card's `mult`, published by `Competition.multiplier`)
  + the board's captain bonus. Reward bonuses (Pro's Rare Reward Bonus, `boost`) never count.
- **While the games are on:** `remaining = max(0, target − current bonus-adjusted score)`. Finished cards (a confirmed DNP is a
  finished 0; Arcade and Pro have no substitutes, so no captain moves) keep their contribution and leave the share-out. Live cards
  show the *additional* raw points from now; unstarted cards start at 0.
- **Ceiling 100 raw:** a card that cannot take its equal share takes its maximum and the rest is shared among the others. When
  every card still able to score cannot cover `remaining` even at 100, the lineup is **Unreachable**.
- **Reached:** `remaining = 0` on provisional scores says "Target reached", never "cleared"; only Sorare's result says cleared.
- **Unknown stays unknown:** no target, multiplier or started card's score → "—" with the reason. A known 0 is data. A lineup
  short of five cards is not treated as a smaller lineup.
- Recalculates from the data each view already has (no new polling, no Sorare writes).

## Where

`frontend/lib/pointsNeeded.ts` (calculation and wording, tests in `pointsNeeded.test.ts`), drawn by Arcade's lineup cards
(Your move, The chain, Pick teams: pitch and card list), Arcade's live lineups, Play's Pro lineups (plan rows and "Pro · once the
teams are out") and your entered Pro lineups.
