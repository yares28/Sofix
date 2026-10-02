# Plan · Pro in the best plan (T3, roadmap batch 4)

You said: "The app doesn't compute all game modes. It never gives me the Pro option when best lineups are calculated per
competition. Find detailed info on Pro and plan its integration into the best plan. Pro has future levels, so it has to take
into account whether it's even possible to reach the next step and fight for the upgraded reward or not." ([TODO.md](../TODO.md), T3.)

This file holds steps 4.1 (research) and 4.2 (what Sorare has that Sofix doesn't) of [roadmap.md](roadmap.md), written
2 Oct 2026. **Step 4.3 is a Stop: you read this and choose the scope.** Nothing here has been built.

## 4.1 · What Pro is

**Source.** Sorare's own help centre, read through its public Zendesk API (`https://sorare.zendesk.com/api/v2/help_center/en-us/articles/<id>.json`),
so no page of sorare.com was scraped. The articles: "What is Pro?" (28894302069661, updated 14 Aug 2026), "What are the 3 game
modes in Sorare Football? (Arcade, Pro & Arena)" (17629357197341, 14 Aug 2026) and "How does scoring validation work in Pro Mode?"
(38144599039005, 30 Sep 2026). A third-party summary (SorareGoat, 4 Jul 2026) says the same.

**The mode.** Sorare 27 has three football modes: Arcade (the old Sets), **Pro** and Arena (every player-against-player
leaderboard: In-Season Arenas, Classic Arenas, Arena Rooms). Pro is Hot Streaks: you play against fixed scoring targets set by
Sorare, not against managers. You climb a board's steps by hitting the step's target with a lineup, until you reach the top or
run out of lives.

**The rules that change what a planner has to do:**

| Rule | What it means for a plan |
|---|---|
| **Anytime Entry.** A board is open whenever a domestic league match with a licensed team is being played; you enter or edit a lineup until its first player kicks off; clearing a step lets you go straight to the next. | Pro does not wait for a Sorare gameweek and its lock. It follows each league's matchdays and can use the confirmed lineups, so a Pro plan is made per matchday and per lineup, late. |
| **Step Clock.** 4 lives and 4 lineup tries per step. Once a lineup is submitted, the step has to be cleared by the end of that league matchday (38 in LaLiga) or it fails. Skipping a matchday costs nothing. | The chance of clearing a step is the chance that one of up to four lineups reaches the target inside one matchday. |
| **Pre-set lineups.** Lineups for later steps can be set in advance; the next is submitted automatically when the current step is cleared, if none of its players has started. | An Apply for Pro would be a set of lineups in order, not one. |
| **Scoring validation.** Above the target at the first validation (minutes after the final whistle): validated for good. Below it: marked failed, but reviewable until the end of the Game Week, and validated if a correction lifts it. A new lineup can be tried at once. | A score near the target is not lost to a later correction, and not final either. |
| **Rare Reward Bonus.** +15% per In-Season Rare card in the lineup, +40% if the captain is an In-Season Rare, and a lineup of five In-Season Rares doubles the base prize pool. Super Rare and Unique are eligible and get the same bonus. | The reward is not fixed: it depends on the cards used. The planner has to price it. |
| **Bonuses.** Cap 260 and Multi-Club do not apply (Arena only); the scarcity bonus does not apply; New Season, XP, Collection and Captain bonuses do. | The lineup's expected score is computed with a different bonus set than a Classic lineup's. |
| **Cards.** In Pro and In-Season Arena a lineup needs at least 4 In-Season cards and at most 1 Classic (Super Rare and Unique In-Season lineups: up to 2 Classics). A card in a Pro lineup for a match cannot be in an Arena lineup for that match, and the other way round. An active lineup cannot be cancelled and its cards are locked, though the same card can be in another lineup for another match. | Pro and Arena compete for the same cards: the planner has to decide where each card plays, match by match, not just which lineup it is in. |
| **Forfeit.** A step can be forfeited at any time, restarting from step 1. | Out-of-reach steps can be abandoned, which is part of "whether it is even possible to reach the next step". |

**What the API shows** (Sorare's public GraphQL schema, read as a file, no query made):

- `boards(mode: CAREER | SQUAD, sport, rarity, rarities, engaged, so5Competition)` and `board(id)` return a `Board` with
  `steps`, `myCurrentStep` and `myUnclaimedRewardsCount`.
- A Pro step is a `CareerProStep`: `level`, `target` (the score the step needs; `originalTarget` before a promotion),
  `rewardConfigs`, `state` (`PLAYABLE`, `LINEUP_SET`, `LIVE`, `PRE_MATCHDAY_LOCKED`, `LOCKED`, `FAILED`, `CLAIMABLE`, `CLAIMED`),
  `ladderPoints` (Sorare Points it feeds on the active ladders), `myLineups`, `so5Competition` and `rewardMultiplierConfiguration`.
- The account has `proUnlocked`. `unlockProMode`, `lockProMode` and `markAsProOnboarded` exist and are writes: Sofix never calls them.

**Not found, and how to find it.** The help centre does not name a "King's Step", the number of steps, or each step's target and
reward, and the boards are not readable without the owner's account. They are in `CareerProStep` for the signed-in owner, so
the way to know is a read-only query made by the extension from the owner's own tab (step 4.5), never from here.

## 4.2 · What Sorare has that Sofix doesn't

| What Sorare has | What Sofix does today | Proposal |
|---|---|---|
| **Pro boards**: steps, targets, 4 tries and the Step Clock, Anytime Entry, the Rare Reward Bonus | Nothing. The sync lists only Classic gameweeks (`eventType: CLASSIC`, `FIXTURES` in `backend/app/sorare/sync.py`) and its competitions (`_tracks`), so no Pro competition reaches the planner | **Build** (T3, your request): steps 4.4 to 4.7 |
| **Your Pro level and progress**: `proUnlocked`, the current step, its target and state | Nothing | **Build** with Pro (4.5), read through the extension, read only |
| **Super Rare and Unique cards and competitions** | Filtered out: the collection is read for `rarities: [limited, rare]` | **Later**, only if you own any: it needs a number of them from you first |
| **Arena Rooms** (10 managers, Essence entry) | Left out of the plan: a Room depends on nine other managers' lineups, so it has no expected number (user manual, section 7) | **Skip**, as decided |
| **Automatic substitutes in Arena** (one goalkeeper and one outfield substitute, used only for a DNP; Multi-Club and Cap bonuses go if one comes on) | The planner keeps a substitute only "when protection exceeds the value it gives up" (how_it_works.md, section 9) | **Check** against the rule, then adjust: a small step, separate from Pro |
| **Arcade** (Sets, missions, Gems) | Nothing | **Skip**: a collection game, not a lineup plan |
| **One card, two modes** | The plan assigns each card to one lineup of one competition | **Build** with Pro (4.6): a Pro lineup and an Arena lineup cannot share a card for the same match |

## 4.3 · Stop: your choice

Read the two tables above, then say:

1. **Scope.** (a) Read and show only: Play says which step you are on, its target and the chance your best lineup clears it;
   (b) also let the planner put cards in Pro lineups instead of Arena ones when that pays more (4.4 to 4.6); (c) also Apply
   for Pro (a set of lineups in order). **Recommended: (a) first, then (b) once the numbers have been checked against a real
   week; (c) only if you want it.**
2. **Which cards do you play in Pro?** Limited In-Season only, or Rare as well? It sets which cards the planner offers.
3. **Does Play need a new look** for Pro (a step ladder, a target against the expected score)? If yes it is a design
   canvas first (4.7), another Stop.
