# Restructure (5 Oct 2026)

Design canvas (private): https://claude.ai/artifact/L9MPWJXADyZKcMXw5rfz3m (11 boards, approved with "ok build it").
Owner's rule for the build: **wire everything up and cut no feature**; the canvas leaves things out only because it is a design.

## Structure

Four places in the top bar (phone: bottom bar), one page-wide switch under it. Every route keeps its address.

| Place | Views (switch) | Routes |
|---|---|---|
| This week | Recap, Sorare, LaLiga, Lineups (+ Missions until R3 folds it into Sorare) | `/`, `/play`, `/fixtures`, `/lineups`, `/missions` |
| Season | Fixtures (all rounds, R5), Difficulty, Table; club pages | `/season`, `/difficulty`, `/table`, `/team/[code]` |
| Gallery | Cards (was "My cards"), Players | `/cards`, `/players`, `/players/[slug]` |
| Audit | xScore, Who starts, Written down (R7) | `/audit` |

Control stays behind the status pill. Source of truth: `frontend/lib/places.ts`.

## Steps

- **R1 places and switch** (`lib/places.ts`, `NavLinks`, `LensBar`, `TabBar`; the Sorare sub-nav retired; "My cards" is "Gallery").
- **R2 Recap** (`/`): header (GW, round, days, lock), 10 best cards (xScore hexagon, game, start chip); This round as a
  scoreboard (two rows a match: win chip, xG bar, clean-sheet bar; draw and both score); table after the round (narrow);
  Your lineups (entered lineups from the extension first, else the plan's best three: cards, team score, needs, ring with
  cash-or-essence chance, other rewards, expected essence, then the rest as chips); Missions (big cards); News this week
  (FF: hurt this week, back this week, your players first, then the league); everything the old home showed stays
  reachable (Last gameweek, plan state, away week, early plan, expected competitions).
- **R3 Sorare view** (done 5 Oct: lock countdown, lineups after four summed up, missions folded in with last-5 rate) (`/play`): hero = lock countdown + plan facts + Apply (Check, Draft, Enter); plan picker; every
  lineup as a row (cards with xScore, team score, needs, reward ring); Before / After the games / In hindsight; missions
  folded in (big cards, last-5 rate); all current Play features kept (your Sorare lineups and their results, sheets,
  early plan banners, kept weeks, apply).
- **R4 LaLiga view** (`/fixtures`): round hero (your players this round), kindest games, clean sheets, match cards (win,
  bookmakers, xG, clean sheet, both score), table after the round.
- **R5 Season**: Fixtures for all 38 rounds (new), Difficulty grid in the score colours (five buckets: cyan, green,
  yellow, orange, red), Table with Now / After round N / End of season and title/top four/relegation.
- **R6 Gallery**: Cards shelves by position with three score hexagons, next game, start chips; Players unchanged inside.
- **R7 Audit**: xScore view, Who starts view, Written down.
- **R8 Look**: Sorare score colours everywhere a 0-100 number appears (`lib/cards.ts` BAND_COLOURS); Geist; white shell
  (ink theme optional, not built unless asked).

Each step: unit tests for new logic, e2e updated, desktop and phone checked, manual updated, one PR.
