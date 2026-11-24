# Plan · Squads: what a team that always plays costs (24 Nov 2026)

You said: "Start of season/now team buying prices. A page where I can enter and see how much it would cost to buy a team (from all
available competitions). The team has to have enough players to play each week, either Pro or Arena, depending on how much rotation
the team does week to week: Celta does a lot of rotation so Pro is better, but Elche doesn't have that much. If the forwards rotate a
lot, see if forward 2 plays the minutes forward 1 doesn't; the idea is having a full team that plays all the time."

Your answers (24 Nov 2026):

- **Now** is this season's in-season cards (2026), bought today. **Start of season** is next season: the team bought when the new
  in-season cards (2027) drop.
- A team can be **one club, two clubs combined, or any clubs** of a league: one control with all three.
- You enter **a club**, **a budget**, whether **cards you own** count, and a **coverage target** (how often a full lineup must play).
- **Limited** only.

Nothing here is built. Design canvas: *link added when published* (§8).

## 1 · What the page answers

One question: **"For €X, I can field a full five every week with this team, in Pro or in the Arena."** The hero is the price; the
evidence under it is the cards (real card art), and a strip that shows, game by game, which of them started, so you see forward 2
filling forward 1's missing weeks.

## 2 · Research (24 Nov 2026)

### Sorare's rules that decide the team ([help centre](https://sorare.zendesk.com), articles 28894302069661 "What is Pro?" and 28920678508061 "What is Arena?", both updated 20 Nov 2026)

| | Pro (Hot Streaks) | In-Season Arena |
|---|---|---|
| When you pick | Any time up to the first kickoff of the lineup: **after the teamsheets** | Before **Tuesday and Friday 16:00 CET**: **before the teamsheets** |
| Lineup | 5 cards (GK, DEF, MID, FWD + one outfielder), at least 4 in-season, all games inside an hour (`pro.WINDOW`) | 5 cards + a GK sub + an outfield sub, at least 4 in-season |
| A non-starter | You simply leave him out: you only need **five who start** among the cards you own | A sub replaces him only if he did not play at all (benched but came on: no swap, low score) |
| Bonuses | No Multi-Club, no Cap | **Multi-Club** and **Cap 260** stay on, and both are lost when a sub comes in |
| Same card | A card in a Pro lineup for a match cannot be in an Arena lineup for that match | |

So the two modes need different teams, exactly as you said:

- **Pro** needs a pool of cards from which five starters can be picked almost every matchday. Rotation does not hurt: owning both
  forwards that share the shirt covers it. The question is the **cheapest set** whose starters cover the target.
- **Arena** needs seven cards chosen before anyone knows who starts. Rotation hurts directly. The question is **how often** the five
  you pick all start (with the two subs' help), and that is a property of the club.
- A one-club Arena team **never gets the Multi-Club bonus**. Two clubs combined get it back, and give Pro two matches a matchday
  (more tries per step: 4 lineups a step).

### Data Sofix already has (checked on today's blocks)

| Need | Where | Coverage |
|---|---|---|
| Every squad player, position, crest, price now | LaLiga: `sorare` block `market` (664 players, `eur` = Sorare's Limited in-season market value); PL/BL1/FL1/CL/EL/CONF: `league_squads:<code>` (`eur` per player) | all clubs |
| Who started each game this season | `player_games:<slug>`: `started`, `mins`, `status` per game, every competition | 640/664 LaLiga players, 607/607 PL |
| Card art | `sorare_card_art` (Limited, current season) and LaLiga `market.pic` | Sofix's rule: real cards |
| Your cards | `sorare.collection` (`inSeason`, `rarity`, `player`) | yours |
| Next games and xS | `xs_ahead` blocks, `players:<code>` `next` | 45 days ahead |
| Pro board targets and prizes | `sorare.weeks[].pro[].steps` (LaLiga 20 Oct: 320 → 550) | your boards |

### Prices: what the public API gives (read-only requests, 24 Nov 2026)

- **Buy now:** `anyPlayer(slug) { ... on Player { lowestPriceAnyCard(rarity: limited, inSeason: true) } }` answers without a key and
  names the cheapest listed in-season Limited card; with its `liveSingleSaleOffer`/`livePrimaryOffer` (as `sync.PRICES` already
  reads) that is the price you would actually pay. Sorare's market value (`eur`, already published) is the fallback, marked "est.".
- **Past prices:** `tokens.tokenPrices(playerSlug, rarity, first ≤ 20)` returns the last 20 sales only (José Luis García Vayá's reach
  13 Nov, Iago Aspas's 3 Nov, Lamine Yamal's 20 Nov). **This August's launch prices cannot be recovered.** So Sofix records prices
  from now on (§5.4), and next August's launch is measured, not guessed.

### Rotation, measured (this season's LaLiga games, 12–13 per club)

Prototype on today's blocks (scratch script, not in the repo): "Arena" = the seven (5 + GK sub + outfield sub) that fielded a full five
of starters most often, a sub covering one non-starter; "Pro" = the cheapest set of the club's cards that fields five starters in at
least 90% of games. Market value today, euros.

| Club | Arena: full five | Arena € | Pro € (cards) | Verdict at 90% |
|---|---|---|---|---|
| Elche | 92% | 28 | 24 (6) | Arena |
| Alavés | 92% | 24 | 20 (6) | Arena |
| Sevilla | 92% | 38 | 35 (7) | Arena |
| Espanyol | 92% | 41 | 41 (7) | Arena |
| Racing | 92% | 38 | 29 (7) | Arena |
| Real Madrid | 100% | 527 | 267 (8) | Arena |
| Barcelona | 85% | 721 | 317 (10) | Pro |
| Getafe, Valencia | 77% | 26, 28 | 25, 28 (7) | Pro |
| Real Sociedad | 69% | 38 | 43 (8) | Pro |
| Villarreal | 62% | 58 | 61 (8) | Pro |
| **Celta** | **54%** | 34 | **38 (8)** | **Pro** |
| Rayo | 77% | 28 | none found | three keepers share the shirt: the search needs all three |

Your read was right: Celta's best seven field a full five in 7 of 13 games, Elche's in 12. Celta's Pro answer is the braid you
described: Hugo González, Pablo Durán and Williot Swedberg each start under half the games, and between them a Celta forward started in
12 of 13. Without subs, Celta's five usual starters all started in 3 of 13 games. Bundesliga, Premier League and Ligue 1 run the same
(76 clubs in all, a few seconds each).

## 3 · The page (`/squads`, in the Gallery bar after Prices)

1. **Filter bar (one row, dropdowns, each with All):** League (All, LaLiga, Premier League, Bundesliga, Ligue 1; European
   competitions are not a Pro board and only join "Any clubs"); Team (One club / Two clubs / Any clubs); Season (Now · 2026 cards /
   Next season · 2027 cards); Mode (Best for this club / Pro / Arena). A budget field (€) and a coverage target (70–100%, 90 by
   default) as a slider. "Count my cards" switch, on by default.
2. **Hero:** the chosen team's price as one big number (count-up), the mode verdict beside it as a pill (Pro or Arena with its
   league disc, the Targets look), and the coverage it reaches ("full five in 12 of 13 games"). With your cards counted: "€24 to
   complete, you own 2".
3. **The team:** real Limited cards in position shelves (GK, DEF, MID, FWD), each with its price and start rate; cards you own wear
   an "Owned" corner and cost nothing.
4. **The relay strip:** one column per league game this season, one row per card; a filled cell where he started. Above it, the
   lineup line: green when five starters were there, coral when not. Pairs that share a shirt are drawn as one braid (forward 1's
   gaps lined up with forward 2's starts), so "forward 2 plays when forward 1 doesn't" is seen, not read.
5. **Pro or Arena, side by side** (below the strip): the same club's two answers in two columns (cards needed, price, coverage,
   and for Pro the ladder: chance per matchday to clear each step of the board with that team's five, from xS; for Arena the Cap 260
   check and "no Multi-Club with one club").
6. **Clubs for your budget:** every club whose team fits the budget, ranked by coverage then price, crest + price + coverage dial;
   paginated at 12. Tapping one makes it the hero.

Phone: filters fold into one "Filters" sheet; hero, team (two cards a row), strip (scrolls sideways inside its card, games
newest-first so today is visible), side by side becomes stacked, budget list.

## 4 · How the team is chosen (backend, published, never in the page)

`backend/app/sorare/squads.py`, run by the refresh's Sorare step, publishes `squads:<league>` blocks; the page only draws.

1. **Pool:** a club's in-season Limited players with a price; games = this season's league games of the club.
2. **Pro:** the cheapest set (GK 1–2, DEF 1–4, MID 1–4, FWD 1–3, from each position's most-started) that fields GK + DEF + MID +
   FWD + one outfielder from its starters in at least the target share of games. Exact search over those candidates (the prototype
   runs a club in seconds). Several targets (70, 80, 90, 100%) are published so the slider does not recompute.
3. **Arena:** the seven (5 + GK sub + outfield sub) with the most games where five starters were there (a sub covers one
   non-starter if the lineup stays valid), cheapest among equals; also the Cap 260 total of the five's L15 averages.
4. **Verdict:** Arena when its seven reach the target, else Pro; ties go to the cheaper.
5. **Two clubs:** pairs of clubs whose league games rarely share a kickoff hour, each pair's Pro set covering the target in both
   matches; Arena seven from both clubs (Multi-Club bonus kept). Top 50 pairs per league by price.
6. **Any clubs:** the league's cheapest seven by start rate per position (Arena) and the cheapest Pro pool; no relay strip
   (players from different matches), the strip shows each card's own starts.
7. **Your cards:** an owned in-season Limited card of a chosen player costs 0; the search runs again with owned cards free (so it may
   pick a different, better set when you already own a player).
8. **Budget:** the page filters the published teams by price; no search in the page.
9. **Transfers:** a player who left the club mid-season counts only his games for it; a new signing counts from his first game, and
   a club with fewer than 5 games says "too early to tell" instead of a coverage.

## 5 · Start of season (2027 cards)

1. **Before the 2027 cards drop:** the team is chosen from this season's starts (players still at the club), and each card shows
   today's 2026 price as a reference, labelled "2027 cards not out yet". No invented launch price.
2. **When the cards drop:** the refresh reads `lowestPriceAnyCard(rarity: limited, inSeason: true)` for the new season; the Season
   dropdown's "Next season" becomes the real price.
3. **The first weeks of a season** have few games: the start record falls back to last season's for the same club (marked), until
   5 games of the new season.
4. **Price record from today:** each refresh's prices go into a small per-league history (one number per player per day, R2 block
   `squad_prices:<league>`, a season ≈ 300 kB per league); each card then shows a price line, and next August the launch price and
   how fast it fell are measured.

## 6 · Upgrades proposed (built with the page unless you say no)

1. **Ladder reach (Pro):** for the chosen team, the chance per matchday to clear each step of its league's board, from its five's xS
   (`pro.py`'s step math), and its real record this season. A team that cannot clear 360 is shown as such: price is only half of the
   answer. Measured on Celta's €38 Pro team: it fielded five starters in 12 of 13 games, and their real scores (best-average five of
   the starters, before captain and bonuses) were 189-347, over the first step's 320 in 2 of 12. Elche's five: 142-360, 2 of 12.
2. **Fixture run:** the next 6 league games of the club with the difficulty colours, so you buy before an easy run.
3. **Cheapest buy now:** each card links to its cheapest listing on sorare.com (link only, Sofix never buys).
4. **Price line:** from the record in §5.4, each card's price over the season, so you can wait for a dip.

## 7 · Steps (depth-first, each one shippable)

| Step | What | Done when | Check |
|---|---|---|---|
| Q1 | `squads.py`: Pro and Arena search, one club, now prices, tests (coverage, owned free, transfers, too-early) | `squads:<league>` published for LaLiga, PL, BL1, FL1 | pytest; one SELECT of the block after a refresh |
| Q2 | `/squads` page: filters, hero, team, relay strip, side by side, budget list, 1:1 skeleton | your clubs on real data at 1440 and 390 px | `e2e/squads.e2e.ts`, mobile spec, look in your Chrome, web-design-guidelines |
| Q3 | Buy-now prices (`lowestPriceAnyCard`) and the daily price record | prices say "listed" or "est." | test; a real read of 3 players |
| Q4 | Two clubs and Any clubs | the Team dropdown's three options | tests; look |
| Q5 | Ladder reach and fixture run | the Pro column shows the step chances | test against `pro.py`; look |
| Q6 | Next season mode (reference prices until the drop, then real) | the Season dropdown | test with a fake drop date |

Limits: the Sorare price read is one `anyPlayer` alias per player in batches (keyless 500 complexity), only for players in a
published team (≈ 20 a club, ≈ 1,600 for four leagues), once a day; nothing on page view. No new Neon table.

## 8 · Design canvas

[Sofix Squads · buy a team that always plays](https://claude.ai/artifact/GnHLGGjVjHWjPZR7dZ2xh9) (24 Nov 2026, private until you
share it), every number from today's blocks:

- **Desktop 1440, Celta, one club, now:** filter bar; hero €34.37 to complete (count-up) with the Pro pill and a 13-segment ring
  (12 green, 1 coral); the eight cards on position shelves with start bars and "Yours" on Hugo González; "Who started" with the
  three forwards in three blues and an "Any forward" row that braids them; Pro beside Arena (Pro: the five's real score per game
  against the 320 and 360 lines and the board's steps; Arena: €20 with four owned, 7 of 13); 11 clubs within €40.
- **Phone 390, Elche, Arena:** filters folded into one button; hero €18 with the ring; the seven in rows of three; the strip;
  Arena and Pro as two rows; the club list.
- **States:** two clubs (Elche + Levante, €29 for two tries a matchday), next season (Celta's cards greyed, "Waiting for the 2027
  cards", today's €38 as reference), and too early (3 games).

Not drawn yet: Any clubs (Q4 computes it) and the ladder-reach chances (Q5).
