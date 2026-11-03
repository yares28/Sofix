# Points needed on Arcade and Pro lineup cards (2 Nov 2026)

## Owner's request

Every card of a complete Arcade or Pro lineup carries a pill at its art's top right (owner, 2 Nov 2026; was bottom right), on Sorare's lineup page of any Arcade or Pro step,
read afresh each time the page is opened: the raw Sorare player score that card
needs for the lineup to reach its step's target. It is a target calculation, apart from xScore, predicted score and start %.

## Workflow (the contract)

- **Before the games:** each of the five scoring cards takes an equal share of the target in bonus-adjusted points; its pill is
  `target / (5 × multiplier)`, rounded up to one decimal, ".0" dropped. One balanced way to reach it, not five minimums.
- **Multiplier = 1 + the bonuses the step's rules give, added once.** Arcade: edition + club (only while the step's
  `collection` rule is not off) + captain (the step's `captain`); an entered Arcade lineup uses Sorare's own multiplier for each
  card (`bonus`, captain included). Pro: in-season + level + rarity (the card's `mult`, published by `Competition.multiplier`)
  + the board's captain bonus. Reward bonuses (Pro's Rare Reward Bonus, `boost`) never count.
- **While the games are on:** `remaining = max(0, target − current bonus-adjusted score)`. Finished cards (a confirmed DNP is a
  finished 0; Arcade and Pro have no substitutes, so no captain moves) keep their contribution and leave the share-out. Every card
  still able to score aims at **the same bonus-adjusted end score, counting what it has already** (owner, 3 Nov 2026: Hakimi at 62
  read "+37.6", the extra points on top of what he had, which nobody could read). A live card shows how far he is from his:
  **"-7"** short of it, **"+3"** (green) past it; a card past it keeps what it has and the others share the rest, so they need less.
  Until 3 Nov live cards showed the additional raw points from now, a fresh equal share of what was left on top of their score.
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

## On sorare.com (owner, 2 Nov 2026: "I want the pill in the extension, so I can see it in Sorare, not in Sofix")

Same calculation (`frontend/lib/pointsNeeded.ts`, ported to `extension/core.js`, the formula file the overlay already shares),
drawn by the overlay on the card art at its bottom right, on Sorare's own pages:

- **Entered lineups (Arcade and Pro), before and during the games.** The background worker reads the board's steps and your
  lineups through the page bridge (the existing `SofixArcadeLineups` and `SofixProLineups` reads: each card's score, Sorare's
  multiplier, captain, kick-off), at most every 2 minutes while a game of yours is live and the tab is in front. The overlay
  already knows which card each picture is (by slug); a card in an open lineup gets that lineup's pill, wherever Sorare shows it.
- **The compose page** (`/football/play/boards/pro/<config>/<step>/compose-team`): the step is in the address, so every card
  shown gets its pre-match pill for that step (target ÷ 5 ÷ its multiplier; the captain's value in the explanation), from
  Sorare's own bonus answer for the card.
- Reward boosts never count; unknown stays "—" with why; no Sorare writes.

Open evidence to collect before building: the DOM of the compose page's five slots and of Sorare's view of an entered lineup
(screenshots in the owner's Chrome; the window must be in front, else Chrome stops painting it).
