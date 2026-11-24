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

Nothing here is built. Design canvas: [Sofix Squads](https://claude.ai/artifact/GnHLGGjVjHWjPZR7dZ2xh9) (§8).

### Your canvas comments (24 Nov 2026, round 2) and what changed

Where this list and the sections below disagree, this list wins.

| You said | Change |
|---|---|
| "It needs to take the best players too... why isn't Alonso a choice?" / "balance between starters and best players" | The team is now **the best real score inside the budget**, not the cheapest set that covers: each game the best five of the team's starters (captain +50%), a game without five counts 0, coverage target still required; among sets within 1% of the best score, the cheapest. Celta's team now has Marcos Alonso (9 of 13 started, 59 a start) and costs €28.88 to complete (11 cards, you own 6): 319 a game against 287 for the cheapest (€24.36). A "What more money buys" curve shows the score for each budget (Celta: nothing better past €29). |
| "Shouldn't this be at the top so I can select the team?" / "restyle... gauge with the crest inside, price at right with Pro or Arena under it" | The club list is a picker under the filters: 12 tiles a page (crest inside a ring = games its best five topped 320; price; PRO pill; clubs with no team inside the budget greyed with their cheapest price). The Club dropdown is gone. |
| "What is the LL?" | Gone: the pill says LALIGA PRO. |
| "Why some are black and other blue?" / "did everyone eventually play or we got a DNP?" / "needs the crests" / "sections per position" | The strip is "Who played": black cell = started (his score inside), light blue = came on (minutes), grey = did not play; opponent crests on the game header; rows grouped under Goalkeeper, Defenders, Midfielders, Forwards with space between, no per-row label. |
| "1 long card with a switch between Arena and Pro... filters hindsight and xScore; best, average, median, expected" | One card, Pro/Arena switch, "Lineup: Hindsight / Sofix xS before kickoff", "Score: Best / Median / Average" (xS: "What it scored / What xS said"). Pro chart: the score each game against the step the board stood on (stair line), cleared steps green with their prize, a miss on a later step marked "back to 320"; summary: steps cleared, won, highest step, resets. One club = one try a matchday. Celta's team in hindsight: 6 steps, $5 + 2,500 essence, highest 360, back to 320 five times. Arena chart: the seven's score (subs in) against the score each LaLiga Limited Arena prize needed (329 = 250 essence, 376 = 500, 437 = 2,000, 471 = $10; `reward_bars`, 7 weeks); summary: weeks paid, won, all five started, a sub came in. Sofix xS was saved per game from 11 Oct only (5 of 13 games): the others show "no number". |
| "This is bad... help me choose the team before the season starts... I never said wait 5 games" | Removed. Next season picks the team from **the whole previous season** and shows the new cards' price from the drop (cards come out before the first game); no waiting state. |
| "compare the starts from the whole season before... new transfers can affect start chances" | Next season shows the players new at the club with no LaLiga games last season (Celta: Cáceres, Faye, Driouech, Bayındır), and the proof: Celta's team picked from 2025/26 (38 games) fielded five starters in 13 of 13 this season, 308 a game (the best team in hindsight: 319), 5 Pro steps. |

Corrections found while redoing the numbers: a sub in the Arena only replaces a player who **did not play** (one who came on keeps
his low score), so "all five started" is stricter than round 1's "full five with a sub": Elche's seven, 10 of 13 (77%), not 92%;
Celta's 5 of 13. The two-clubs board is now computed: Alavés + Levante (€38.03, two tries a matchday) cleared 11 steps for $80 +
3,000 essence, up to 420; Alavés alone 7 steps.

### Round 3 (24 Nov 2026)

Where round 3 and round 2 differ, round 3 wins (the next-season numbers changed with the method below).

| You said | Change |
|---|---|
| "This page is a wreck, it doesn't take into account the user flow and the main point" (the states board) | No separate states board. Next season and Two clubs are **the same page with its filters changed**: pick a club (or pair) in the picker, see its price and team, check who played, replay the season. Three desktop boards: Now, Next season, Two clubs. |
| "Too bloated, too much text, too much clutter" (Pro/Arena summary) | The summary is the big number, what it won, and the board's steps (Pro) or the seven (Arena). Rows and footnotes gone. |
| "Add a bit more of life" (cells) | A started cell wears Sorare's score colour (`frontend/lib/cards.ts` bands) with the score; came on: white with the band's outline and the minutes; did not play: a faint dot. Cells pop in; "Five starters" is a thin green/coral bar. |

Next season, measured: the team is picked from **every player's own 2025/26 LaLiga record at any club, by round** (Fri–Mon and
Tue–Thu rounds), so a signing from another LaLiga club counts with his old club's starts ("from Elche" on Febas). Players with no
LaLiga record (from abroad or the second division) are listed as new. A club whose best team inside the budget does not reach the
target shows its coverage instead of PRO (Elche 45%: its keeper on record started 22 of 38); promoted clubs say NEW. Celta: €31.94,
12 cards, 37 of 38 rounds with five, 315 a round; bought that way last August it made 278 a game this season, 12 of 13 with five
(the best team in hindsight: 319). Alavés picked the same way made 311, Levante 287, Elche 269. Two clubs is counted by round (two
tries a round, three when a club plays twice): Alavés + Levante €38.03, 11 steps, $80 + 3,000 essence; their Arena seven from both
clubs €15.33, paid in 4 of 15 rounds.

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

1. **Filter bar:** League (All, LaLiga, Premier League, Bundesliga, Ligue 1; European competitions only join "Any clubs"); Team
   (One club / Two clubs / Any clubs); Season (Now · 2026 cards / Next season · 2027 cards); a budget (€); the coverage target
   (five starters in 70–100% of games, 90 by default); "Count my cards", on by default.
2. **Club picker** (under the filters): every club of the league as a tile, 12 a page: crest inside a ring (games the team's best
   five topped 320), price to complete, PRO or ARENA under it; clubs with no team inside the budget greyed with their cheapest price.
   Tapping one makes it the hero.
3. **Hero:** price to complete (count-up), cards, price for all, cards you own; games with five starters, points a game, games over
   320; beside it **What more money buys**: the best score a game for each budget, this team and the cheapest marked.
4. **The team:** real Limited cards in four position sections, each with price (struck when yours), starts and points a start.
5. **Who played:** one column per league game (opponent crest, H/A, date), a "Five starters" row, then position sections; a cell is
   started (score inside), came on (minutes) or did not play.
6. **Pro or Arena, played all season** (one card): the switch, Lineup (Hindsight / Sofix xS before kickoff) and Score (Best /
   Median / Average, or What it scored / What xS said). Pro: score each game against the board's step (stair line), prizes,
   resets, summary and the board. Arena: score against the prize lines, the seven, weeks paid, subs, no Multi-Club with one club.

Phone: filters fold into one "Filters" sheet; picker 6 a page; hero with the money curve under it; team three cards a row; Who played
scrolls sideways inside its card; the Pro/Arena card stacks (chart, then summary).

## 4 · How the team is chosen (backend, published, never in the page)

`backend/app/sorare/squads.py`, run by the refresh's Sorare step, publishes `squads:<league>` blocks; the page only draws.

1. **Pool:** a club's in-season Limited players with a price; games = the club's league games in the window (this season for Now,
   the whole previous season for Next season), FINAL or REVIEWING.
2. **Pro:** every set from each position's leading candidates (GK 1–2, DEF 1–4, MID 1–4, FWD 1–3; candidates ranked by start rate
   times points a start). For each game, the best valid five of the set's starters plus the captain's 50%; a game without five
   counts 0. The team is the **best average score inside the budget that reaches the coverage target**; among sets within 1% of
   that score, the cheapest. Published for each budget step (the curve) and each target (70, 80, 90, 100%): the page never searches.
3. **Arena:** the club's usual keeper plus four outfielders, a GK sub and an outfield sub; a sub only replaces a player who did not
   play. Best average score inside the budget.
4. **Charts:** per game, Pro's best, median and average five of the starters, Sofix's xS pick (real and expected, where Sofix saved
   its number), and the Arena seven's score with subs; the ladder (one try a matchday a club; a miss sends the board to 320) and the
   Arena prize lines (`reward_bars`) are worked out from those.
5. **Verdict:** Arena when its seven started together in at least the target share of games, else Pro.
6. **Two clubs:** every pair and budget split inside the budget, two tries a matchday (same week), a clear lets the next try aim at
   the next step; ranked by money won, then steps, then price.
7. **Any clubs:** the same search over the whole league; the strip shows each card's own starts.
8. **Your cards:** an owned in-season Limited card costs 0, so the search may pick a better set around them.
9. **Transfers:** a player counts only his games for the club; players new to the club with no league games in the window are
   listed as new (start chance unknown) and counted from their first game for it.

## 5 · Start of season (2027 cards)

1. **Before the first game:** the team is picked from the whole previous season: every player at the club now, with his own
   LaLiga record at any club, by round; players with no LaLiga record are listed as new. Sorare drops the new cards before the
   first game, so the price is the new cards' price from the drop.
2. **The drop:** the refresh reads `lowestPriceAnyCard(rarity: limited, inSeason: true)` for the new season; until then the board
   says "2027 cards not out yet" beside last season's price.
3. **As games are played:** the new season's games join the record game by game; no waiting state.
4. **Price record from today:** each refresh's prices go into a small per-league history (one number per player per day, R2 block
   `squad_prices:<league>`, a season ≈ 300 kB per league); each card then shows a price line, and next August the launch price and
   how fast it fell are measured.
5. **Proof shown:** the team picked this way last August and how it did this season (Celta: 12 of 13 with five starters, 278 a
   game, 5 Pro steps, against 319 for the best team in hindsight).

## 6 · Upgrades (built with the page unless you say no)

1. **What more money buys** (drawn): the best score for each budget; shows where money stops buying points.
2. **Ladder and prize replay** (drawn): the Pro and Arena season replays in §3.6.
3. **Pre-season proof** (drawn): last August's pick, measured on this season.
4. **Fixture run:** the next 6 league games of the club with the difficulty colours, so you buy before an easy run.
5. **Cheapest buy now:** each card links to its cheapest listing on sorare.com (link only, Sofix never buys).
6. **Price line:** from the record in §5.4, each card's price over the season, so you can wait for a dip.
7. **Swap a card:** tap a card for the club's next-best players at that position, each with what the team's score and price become.

## 7 · Steps (depth-first, each one shippable)

| Step | What | Done when | Check |
|---|---|---|---|
| Q1 | `squads.py`: Pro and Arena search by score inside the budget, one club, now prices, per-game series, budget curve; tests (best five, coverage, owned free, sub rule, transfers) | `squads:<league>` published for LaLiga, PL, BL1, FL1 | pytest; one SELECT of the block after a refresh |
| Q2 | `/squads` page: filters, club picker, hero and curve, team, Who played, the Pro/Arena card with its filters, 1:1 skeleton | your clubs on real data at 1440 and 390 px | `e2e/squads.e2e.ts`, mobile spec, look in your Chrome, web-design-guidelines |
| Q3 | Buy-now prices (`lowestPriceAnyCard`) and the daily price record | prices say "listed" or "est." | test; a real read of 3 players |
| Q4 | Two clubs and Any clubs | the Team dropdown's three options | tests; look |
| Q5 | Next season: previous season's record, new arrivals, the proof, drop prices | the Season dropdown | test with a fake drop date |
| Q6 | Fixture run, swap a card | on the page | test; look |

**Q1 built (24 Nov 2026, committed locally, not pushed):** `backend/app/sorare/squads.py`, called by the refresh's Sorare step once
a day (not in quick runs), publishes `squads:LALIGA`, `squads:PL`, `squads:BL1`, `squads:FL1`. Each club: its games (opponent and
crest), the players its teams use (price, owned, card art, per game started/came on/did not play, score, minutes), the Pro teams as
frontiers for each target (70/80/90/100%) both ways (full price, your cards free: `from` = the budget a team applies from), each
team's per-game best/median/average five, Sofix's pick (scored and said) and the ladder on your Limited board for its league, and
the Arena sevens as frontiers with their series, subs and all-five-started. Keeper candidates widened to three (Rayo now gets a
team). On today's blocks: 76 clubs in about 95 s; LaLiga ~1 MB, PL 0.7, BL1 0.6, FL1 0.7 MB; Celta €28.88 / 319, Elche €23.88 / 332,
Alavés €27.97 / 326, the canvas's numbers. Ligue 1 has no Arena prize lines (no Ligue 1 Limited competition in `reward_bars`), and
a league without your Limited Pro board has no ladder. Tests: `backend/tests/test_squads.py`.

**Q2 built (24 Nov 2026, committed locally, not pushed):** `/squads` (Gallery's fifth view): `frontend/app/squads/page.tsx`,
`components/squads/SquadsView.tsx`, `lib/squads.ts` (budget pick, ladder, Arena prize, picker order; `lib/squads.test.ts`), the
FastAPI stand-in `/api/squads/{code}`, a 1:1 loading skeleton, `e2e/squads.e2e.ts` on a trimmed real fixture (picker pages, budget,
target, your cards, "Set €" when nothing fits, Who played, the Pro and Arena replay, axe, text floor and overflow at 1440 and 390
px). Not in this step: next season and two/any clubs (Q4, Q5), so those filters are not shown yet. The look in your Chrome is still to
do: the extension was not connected; the isolated browser's screenshots were checked instead.

**First live data (24 Nov 2026):** all four leagues published (LaLiga 20 clubs, PL 20, BL1 18, FL1 18, every club a team). The
Premier League, Bundesliga and Ligue 1 teams showed initials: the card-art step only knew LaLiga's roster. It now also keeps a
card for each foreign squad player Squads draws (`card_art.refresh(others=...)`, about 43 batched questions the first time,
then only new players), never linked to a lineup.

Limits: the Sorare price read is one `anyPlayer` alias per player in batches (keyless 500 complexity), only for players in a
published team (≈ 20 a club, ≈ 1,600 for four leagues), once a day; nothing on page view. No new Neon table. The search runs in
the job (about a minute for LaLiga's 20 clubs in the prototype).

## 8 · Design canvas

[Sofix Squads · buy a team that always plays](https://claude.ai/artifact/GnHLGGjVjHWjPZR7dZ2xh9) (round 3, 24 Nov 2026, private
until you share it), every number from today's blocks; the Mode, Lineup, Score and page buttons work. One page, three states:

- **1 · Now, Celta (1440):** picker (11 clubs inside €40, Alavés first: 9 of 13 over 320); hero €28.88 to complete, 11 cards,
  you own 6, 319 a game, money curve; the team by position; Who played in Sorare colours; the Pro/Arena replay (Pro: 6 steps,
  $5 + 2,500 essence; Arena €24.94: paid 5 of 13, 1,500 essence).
- **2 · Next season, Celta (1440):** picker of all 20 clubs picked from 2025/26 (coverage shown where a club misses 90%, NEW for
  promoted); hero €31.94 at the drop and the proof panel; the team with "from" tags; the new arrivals; Who played over 38 rounds;
  the replay over 38 rounds (14 steps, $10 + 6,000 essence).
- **3 · Two clubs, Alavés + Levante (1440):** picker of pairs; hero €38.03 and both against each alone; the team with club
  badges; Who played per club; the replay by round with each try's crest.
- **Phone 390, Elche:** the same page, picker 6 a page, Who played scrolls, the card opened on Arena.

Not drawn yet: Any clubs (Q4), fixture run and swap a card (Q6).
