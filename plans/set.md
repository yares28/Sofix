# SET page (Sorare Arcade): research and plan, 20 Oct 2026

Status: **research and design only, nothing built.** Upgrades U1–U6 added and the owner's answers recorded 21 Oct (bottom of this file). **Step 1 shipped 21 Oct**:
`/arcade` reads the board, cards, gems, essence and common missions (extension 0.4.5). **Step 2 shipped 21 Oct**: each card shows Sorare's start % for its next games (extension 0.4.9). **Step 3 shipped 21 Oct** (extension 0.4.12): predicted
score per card and Pick teams. **Step 4 shipped 21 Oct**: Pick a day. **Step 5 shipped 21 Oct** (extension 0.4.14): best pack. **Step 6 shipped 21 Oct**: live lineups, dead and cut losses; next is step 7.
Design canvas: https://claude.ai/artifact/NcPHzXynH6oHiVLeTg3BFG (private, sample numbers, real common-card art).

## What the owner asked (20 Oct 2026)

A new page, SET, in the top bar, for Sorare's free mode with common cards of the current set (HyperGlitch) only:
1. start chances from the ones Sofix already has; 2. only his HyperGlitch commons; 3. two modes: pick teams → lineups
from those games; pick a day → the best 4 lineups and a schedule to climb the steps ("today 15h Lineup 1, 18h Lineup 2
for step 2, tomorrow 14h Lineup 3 for step 3"); 4. which pack to open for the most gems, from how close each mission is
("5 players for 10 gems beats 70 players for 20 gems"), per league; 5. the best players for set missions; 6. a lineup
flagged dead when its remaining cards cannot reach the target, and "cut losses" when a card needed for a stronger lineup
sits in the live one; 7. an original look that shows the steps and the predictions. No change to existing pages.

## Confirmed (source named)

| Fact | Source |
|---|---|
| SET is now called **Arcade**: free, common cards, unlimited, cannot be sold or traded | Sorare help 33949360053917, 17629357197341, 4406429217053 (read through the Zendesk API) |
| Current set: **HyperGlitch**, slug `glitch`, 8 Sep → **27 Oct 2026 16:00 UTC** (17:00 Madrid). The guides say 29 Oct; Sorare's own API says 27 | public API `cardSet { currentSet }`, 20 Oct |
| Leagues in the set: **Ligue 1, LaLiga, Bundesliga, English League** | same query, `availableCompetitions` |
| A lineup is GK, DF, MD, FW + 1 extra outfield player | help 33949360053917 |
| A board is levels with a points target; **4 lives per level**, a miss costs a life, losing all sends you back to step 1; you move up as soon as the score is validated, no gameweek wait | same |
| A score counts as it stood 5 minutes after the game ended | same |
| Owning several players of one club gives a collection bonus, up to 5% | same |
| Your board's rewards from step 2 up: 5,000 essence, 10 gems, 30 gems, €100 + 1,000 Limited essence, €1,000 + 1,000 Limited essence | owner's screenshot, 20 Oct |
| Sorare's schema has everything needed, for the signed-in user: the board (`boards(mode: CAREER)`, each step's `target`, `rewardConfigs`, `state`, `myCurrentStep`), the common cards (`cards(rarities: [common])`), gems (`inGameCurrencyBalances(COMMON_GEM)`), collection missions (`myCollectionTasks`, `competitionCardCollections`), packs and **each pack's per-player draw odds** (`CardPack.slotGameplayTierOdds`), pack currency `COMMON_ESSENCE` / `COMMON_GEM`, pack kinds `LIVE_TODAY`, `ONLY_STARTING_PLAYERS`, `DAILY_FREE_PACK` | published SDL, `https://api.sorare.com/graphql/schema`, 20 Oct |
| Common-card pictures are public (`Player.commonPlayer(rarity: common).pictureUrl`) | public API, 20 Oct (used on the canvas) |
| The pack list is **not** public: signed out, the market shows no pack groups | public API `market.setSections`, 20 Oct |

### Read from the owner's account (step 1, 21 Oct 2026, extension 0.4.5 on his signed-in tab)

| Fact | Field |
|---|---|
| **6 steps**: 260 / 300 / 360 / 400 / 440 / **480** pts (settles 460 vs 480) | `setBoard(mode: CAREER).steps.target` |
| Rewards: 2,000 essence · 5,000 essence · 10 gems · 30 gems · €100 + 1,000 Limited essence · €1,000 + 1,000 Limited essence | `steps.rewardConfigs` |
| **4 lineups per step** (`maxLineupsCount`); `remainingLineupsCount` drops when one is entered (3 of 4 with 1 waiting) | `CareerStep` |
| **Captain +50%** (`engineConfiguration.captain` = 0.5 on every step) | same |
| Edition multipliers: Standard 1, Shiny 1.05, Holo 1.10, Overflow 1.15, Static Fracture 1.20, Legendary 1.30 | `Card.skinEdition.bonus` |
| Sorare numbers steps from **0**; Sofix shows them from 1 | `steps.level` |
| A lineup can be cancelled while `forfeitable`; `cancelledAt` records it | `TaskLineup` |
| 1,292 HyperGlitch commons (of all his commons, the rest other sets); gems 51; essence per set in `cardShardsChests` (matched Sorare's 1.5K) | `cards(rarities: [common])`, `inGameCurrencyBalances`, `cardShardsChests` |
| His **Missions > Common panel** today: two **LaLiga Common streaks** ("Score 400+ in the LALIGA EA SPORTS Common competition", 2 of 5, 2,000 essence), no Decisive Picker. Streaks count Sorare's LaLiga Common competition, not the Arcade board | `taskGroup("play").myTasks(rarity: common)` |

Not saved anywhere: the page reads this in the browser each visit (Neon rules), so there is no `set` read model.
Pack odds (`slotGameplayTierOdds`, one call per pack slot) are read in step 5, where they are used.

## Step 2, start chances: plan with the multi-competition expansion (21 Oct 2026)

**Where the expansion stands.** `plans/multi-competition-expansion.md` lives only in the Codex worktree
`~/.codex/worktrees/7e4a` (uncommitted, baseline `b023591`). It is research: no model approved, no app work authorised,
8 to 12 focused weeks for six competitions (LaLiga, PL, Bundesliga, CL, EL, Conference) plus cups. Its start-% part is
P6 (P6.2 "attach lineup evidence to canonical matches", P6.4 "generalize forecasts carefully") and research tasks R2/R4
("timestamped pre-lock start evidence" for every competition). None of it is built. **Ligue 1 is not in its scope**, and
it has no Sorare start evidence outside LaLiga (R0.7: zero timestamped paired forecasts for the new leagues).

**What Arcade needs is already there in Sorare.** Seen 21 Oct on his Arcade step 1 compose page
(`/football/play/boards/pro/football-glitch-chapter-1/<step>/compose-team`): every card tile carries Sorare's start %,
and the page's own answer holds it per game and player. The goalkeeper bench alone gave 23 players in 20 games, all
with a number, and the games are each club's **next game in any competition** (Real Madrid–Leipzig CL, LASK–Real
Sociedad Conference, Lille–Galatasaray, Stuttgart–Marseille), not only its league. The extension's reader
(`collectStartingOdds`, plan A of [sorare-start-chances.md](sorare-start-chances.md)) already picks these up and saves
them as `sorare_chances:<game>` with the time seen. Each other position loads when its tab on the page is opened.

**So step 2 does not wait for the expansion, and it feeds it:**

- 2a. **Board games.** Add `CareerBoard.pickableGames(fromDate, toDate)` (game, kick-off, which of his cards play) to
  the Arcade read: the page then knows each card's next game. Query checked against the schema before use.
- 2b. **Read Arcade's start %**, one button on `/arcade` (the same deal as "Read the round", plan C): the extension opens
  the current step's compose page in a background tab, opens each position (GK, DEF, MID, FWD), lets Sorare's page
  load, and closes it. What it shows is saved through A. His own visits to that page save it too, with no click.
- 2c. **Show it.** `/arcade` reads the saved rows only for the games in 2a (one small bounded read, never polled) and
  puts Sorare's % on each card. A card without one says "no start % yet". LaLiga cards also show Futbol Fantasy's and
  Sofix's, as Lineups does.
- 2d. **No Sofix number outside LaLiga.** Sofix's own start % is fitted on LaLiga only (expansion P6.4 is what would
  widen it, after validation), so for Premier League, Bundesliga, Ligue 1 and European games Arcade uses Sorare's %
  and nothing else. Never a made-up rate.
- 2e. **For the expansion.** The saved rows are per canonical Sorare game and player with the time they were seen,
  which is the timestamped pre-lock start evidence R2/R4 ask for, now for PL, Bundesliga, Ligue 1 and every European
  game Arcade cards play. The Audit's "who starts" already scores the Sorare source once games settle.
- Cost: about 1 KB per game read; Arcade adds a few dozen games a week. No new job, no polling.

Owner, 21 Oct: **yes to the 2b button**; **Ligue 1 stays out of the expansion** (Arcade uses Sorare's % for it).

**Shipped 21 Oct (extension 0.4.9).** Seen on his account: the board has 84 games to the set's end; after his first press of
the button the saved rows held Sorare's % for 27 of the 46 games of Wed and Thu (388 player readings, 144 from that walk) and
none for Friday on. Sorare's compose page gives a % only for a card's next game close to kick-off, so later games say "no
start % yet" and the page says how far ahead Sorare has given numbers ("read again then"). The tab opens beside the Arcade
tab; Chrome must be in front for Sorare's bench to load more cards on scroll (a covered window loads nothing and says so).

Acceptance (his machine): after 2b, every card whose game Sorare gives a % shows it on `/arcade` with the Sorare tab
closed; a 0% shows as 0%; a card in two games this week shows each game's own number; the saved rows match the tiles.

## Step 3, predicted score and Pick teams (shipped 21 Oct 2026, extension 0.4.12)

Read on his account 21 Oct before building: the club bonus is `CareerBoard.bonuses(cardSlug)` (`So5CollectionBonus`, 2% to 5%),
the same for every card of a club, so one card per club is asked (two questions). Sorare **adds** its bonuses: his waiting
lineup's captain (Kimmich, club +2%) shows `TaskAppearance.bonus` 1.52 = 1 + 0.50 + 0.02, the others 1.05 (club +5%). So a card
counts × (1 + edition + club + captain). An edition bonus inside a lineup was not seen yet (his one lineup has only Standard cards);
the edition is added the same way, to be checked on his first lineup with a Shiny card.

- **Score if he plays**: Sorare's projection for that game (`anyGame.playerGameScores.projection`, published about two days
  ahead, read for the next 3 days' games), else his own average of his last 15 games he played (minutes > 0).
- **Start %**: LaLiga game = the number Lineups uses (Futbol Fantasy, Sorare or Sofix, `market.pStart`) when Sofix's game is the
  same kick-off; any other game = Sorare's saved reading; none = "no start % yet", counted as starting (answer 10).
- **Likely range**: 20th to 80th percentile of his own played games × his bonus (6 games in 10); none under 3 games.
- **Chance at a step**: 2,000 simulated games with a fixed seed: each card starts with his chance, then scores one of his own past
  games scaled to his score if he plays; the lineup's chance = the share at or over the target.
- **Pick teams**: the games he picks; Sofix tries the 6 best cards per slot (10 for the extra outfield card), one card per player,
  simulates the 60 best by expected score with the two best captains each, and keeps the best chance at the step aimed at.
- Past scores and projections are read through his tab (signed in: 50 players a question; the public API caps keyless questions at
  about 9 players). Nothing is saved; read once per visit.

## Step 4, Pick a day (shipped 21 Oct 2026)

- Up to the lives left on the step (Sorare's `remainingLineupsCount`, at most 4), lineups are built one after another from the day's
  games, each from the cards no other uses, then put in the order they settle (last kick-off + 2 h: a game plus Sorare's 5 minutes).
- Each is aimed at the step it lands on: one step up for every earlier lineup more likely than not to clear that settles before its
  first game. One whose first game starts before an earlier lineup on its step settles says it is lost if that one clears; the later
  one on a step says it retries if the earlier one misses.
- Cards already in a lineup on Sorare that is not finished (not cancelled, a card not locked, or a game live) are left out. A second
  card of the same player may still play (seen 21 Oct: he owns two Courtois; one waits in his step-1 lineup).
- Play or hold: the decided rule, against each later day's best lineup at the same step; a later day with no start % for most of its
  lineup is not compared and the page says so.
- Projections, past scores and club bonuses are kept 30 minutes in the browser: on 21 Oct a few reads in a row (about 100 questions
  each) made Sorare answer 429, and the read now stops at the first 429 and says so.

## Step 5, packs and missions (shipped 21 Oct 2026, extension 0.4.14)

- His step's packs, read 21 Oct: Bronze 1,000 essence (5 cards, one per league), Bronze Live Today 1,000 essence (3), Goalkeeper Pack
  Bronze 1,000 essence (1), Silver 10 gems (5, per league), Silver Live Today 10 gems (3), Gold 50 gems (5, per league).
- Odds: `CareerStep.cardPacks.slotGameplayTierOdds(slotIndex)`, every player's chance per slot (about 1,000 players a slot; two slots
  a question is Sorare's size limit, about 2 MB). Read on a click ("Work out the best pack"), never on a visit.
- A pack's worth = the players it would give him that he does not have yet, on average (each player counted once across slots).
  Essence and gems only buy packs, so one best pick: the pack he can afford now that gives the most new players.
- Missions: the daily Missions > Common panel as Sorare gives it, with a gems column; a mission without a gem amount shows a dash.
  On 21 Oct the panel held two LaLiga Common streaks (essence) and no Decisive Picker.

## Step 6, live (shipped 21 Oct 2026)

- "Your lineups on Sorare": every entered lineup not cancelled and not finished, read through his tab (`SofixArcadeLineups`, one
  small question), refreshed by a button and every 2 minutes only while one of its games is live and the page is in front. Never Neon.
- A card has played 115 minutes after kick-off, is live before that, else still to play (Sorare's lineup read has no game status).
  Points = his score × Sorare's multiplier for that card (`TaskAppearance.bonus`, captain and club included).
- Ceiling = points so far + each card still able to score at his best of his last 15 played games × his multiplier. **Dead** when the
  ceiling misses the target; a card still to play with no past games leaves the ceiling open (never called dead on a guess).
- Chance left: the cards still to play simulated as in a plan, the live ones as they stand. **Cut losses** (cancel on Sorare, a life)
  only while Sorare lets it be cancelled (`forfeitable`) and its cards still to play raise the next planned lineup of their day by more
  than this one's chance left. Seen 21 Oct on his waiting step-1 lineup: 0 of 260, 40% chance left, at most 517.

## Not confirmed (guides only, or not found)

- Step targets 260 / 300 / 360 / 400 / 440 and step 6 **460 or 480** (two guides disagree). The extension can read the real ones.
- A **captain worth +50%** (one guide only; the help page does not mention it).
- Edition bonuses Shiny 5%, Holo 10%, Shiny Overflow 15%, Holo Static Fracture 20%, Legendary 30% (guides; the schema has `SkinEdition.bonus`, so the real value can be read).
- Pack prices: Bronze 1,000 essence, Silver 10 gems, Gold 50 gems, Starting XI 25 gems; Bronze+ free every 10 league Bronzes (guides).
- Collection missions pay essence and "Gems later in the set"; no gem amounts published.
- **Whether a card can be swapped out of a lineup after another card in it has kicked off.** One guide says the whole lineup locks. This decides whether "cut losses" can exist.
- Whether one card can sit in two lineups at once (two steps, or a retry), and whether two lineups can be live at once.
- Whether Sorare's Arcade compose page shows a start % (the schema has starter-odds filters on steps and packs, so it likely does).

## What Sofix has today, and what it lacks

| Need | Sofix today | Gap |
|---|---|---|
| Start % | LaLiga: Futbol Fantasy + Sofix's own. Sorare's %: only what the extension sees on his pages (shipped 12 Oct, unproven) | **Premier League, Bundesliga, Ligue 1 have nothing reliable.** 3 of the set's 4 leagues |
| His common cards | Collection read is `rarities: [limited, rare]` only | New read, through the extension |
| Board, lives, gems, essence, missions, packs | Nothing ("Arcade: skip" in plans/pro.md 4.2) | New read, through the extension (private data) |
| Expected scores | Sorare projections and history for his Limited/Rare cards and the LaLiga market | Commons are other players in other leagues: projections for them are public, but it is more API calls |
| Live scores | Half-hourly score check | "Dead lineup" needs minute-by-minute: read it in his Sorare tab, never by polling Neon |

**Is it possible?** Yes for everything, but **not with the data the app already has**: it needs an extension upgrade that
reads his Arcade data from his signed-in tab, and start chances for three more leagues. Point 1 ("start % already in the
app") holds only for LaLiga.

## Proposed plan (each step checked on his pages before the next)

0. **His answers** to the questions below.
1. **Read** (extension): current set, his commons of that set only, the board (targets, rewards, lives, step), gems and
   essence, collection missions, packs on offer with their odds. One small read model `set`, written only when it
   changed (Neon rules). Set-agnostic: "current set", never "HyperGlitch" in code.
2. **Start chances for four leagues**: save Sorare's own % from the Arcade compose page, the same way as A in
   sorare-start-chances.md; LaLiga keeps FF and Sofix's. A card without one says "no start % yet", never a made-up rate.
3. **Predicted score per card**: Sorare's projection × start chance × edition bonus × club bonus (× captain if confirmed),
   with a likely range from his past scores; "Pick teams" mode: best five from the games chosen, chance against each step.
4. **"Pick a day" mode**: the 4 lineups in kick-off order, each aimed at the step it would be on, with lives counted (a miss
   means the next lineup retries the same step), and the schedule strip.
5. **Gems**: for each pack, the expected new players toward each mission from its published odds; the best pack per
   1,000 essence; missions sorted by reward per pack needed. Today's Decisive Picker picks.
6. **Live**: dead when the cards still to play cannot reach the target even at their best; "cut losses" only if Sorare
   lets a card leave a started lineup (question 4).
7. Page, specs, 1440 + 390 px look, manual and roadmap lines.

**Time:** steps 1 to 6 are several working days, and HyperGlitch closes on **27 Oct**. The next set is **not announced**:
`cardSet { nextSet }` returns null (public API, 21 Oct).

## Upgrades (21 Oct 2026)

No guess anywhere in the plan: every open fact is either answered by the owner or read from his account before the
step that needs it is built. Nothing is built on a guide's number.

- **U1. Step 1 settles the open facts first.** Before any planner code, the read records from his account: each step's
  real target and reward, lives left, edition bonus per card (`SkinEdition.bonus`), pack prices and odds, captain (if the
  compose schema has one), and the lineup rules (swap after kick-off, one card in two lineups, two lineups live). Each
  fact is written into "Confirmed" with its source. A fact the read cannot settle is asked, never assumed.
- **U2. Set-agnostic from day one.** `nextSet` is null today, so the code reads "current set" and its leagues each time;
  when the set changes the page shows the new set, or "no set running" between sets.
- **U3. Start % never invented.** Outside LaLiga a card shows Sorare's % once the extension has seen it, else "no start %
  yet"; how the planner treats such a card is the owner's rule (question 7).
- **U4. Live view costs nothing on Neon.** Minute-by-minute scores are read in his Sorare tab by the extension and shown
  in the page/dock; Neon gets one write when a lineup's result is final. No polling, no refetch on focus.
- **U5. Gem math shows its source.** Pack odds come from Sorare's `slotGameplayTierOdds`; a mission with no published
  gem amount shows a dash, never an estimate.
- **U6. Edge cases written down before code** (answers below): postponed or cancelled games, a card with no start %,
  last life, a day's boundary, a lineup kicking off before the previous one is validated, board finished, set ending
  mid-plan, a card already in a lineup on Sorare.

## Owner's answers (21 Oct 2026)

| # | Question | Answer |
|---|---|---|
| 1 | Scope | **The full thing now**, before 27 Oct; the goal is to climb as high as possible before the set ends. Imperfect is fine. |
| 2 | Look | **Both**, through the existing theme switch (`ThemeSwitch.tsx`): white and Night. |
| 3 | Captain | **Yes.** His bonus is read from the account in step 1 (the +50% is one guide only). |
| 4 | Swap after kick-off | **No, the lineup locks** once one of its cards has played. |
| 5 | Cut losses | = **cancel the lineup**. Cancelling a started lineup **costs a life**; its unplayed cards come back. |
| 6 | One card in two lineups | **No.** |
| 7 | Lineups waiting at once | **Yes, up to the lives left on that step** (max 4). |
| 8 | Others waiting when one clears the step | **Locked** (a card has played or is playing) → **lost**. **Not locked** → they move on to the next step. |
| 9 | Missions | **Decisive Picker and the other missions on that daily panel.** Not the collection missions. |
| 10 | Card with no start % | **Allowed, marked** "no start % yet", picked on his projection. |
| 11 | Postponed / cancelled game | **Warn only** (rare). |
| 12 | A day | **Until the day's last game.** Only the 4 leagues play, so nothing runs past midnight Madrid. |
| 13 | Packs | **Gems too**: one best pick across essence and gems. |
| 14 | Enter lineups on Sorare | **No, only show them.** He builds them on Sorare. |
| 15 | Dead / cut-losses alerts | **SET page only**, not the dock. |
| 16 | Name in the top bar | **Arcade**. |
| 17 | Cards that count | **Current set's commons only.** |

## Rules decided (the owner left these to Sofix, 21 Oct)

- **Aim.** Each lineup is built for the best chance of reaching the target of the step it will be on; points above
  the target earn nothing. A low step favours safe starters, a high target pulls in players who can score big, so one
  rule gives both what the owner described ("clear step 2, high score in step 4").
- **When to spend a life.** Step 1 (nothing to lose): always play the best lineup available. From step 2: play today's
  lineup if no later day before the set ends offers a better chance for that step with his cards; else hold it.
  When the days left are fewer than the steps still to climb, play anyway (climb beats waiting). On a reward step's last
  life (30 gems, €100, €1,000), hold unless today is the best chance left before the set ends.
- **Cut losses.** A lineup is **dead** when its cards still to play cannot reach the target even at their best scores.
  Sofix suggests **cancel** only when its unplayed cards raise another planned lineup's chance by more than this
  lineup's own chance left (cancelling costs the same life a miss would).
- **Waiting lineups** never exceed the lives left; Sofix plans the ones after a clear as "moves on if not locked".

## Still read from his account in step 1 (no guide numbers)

Each step's target and reward, lives left, captain bonus, edition bonus per card, club bonus, pack prices and odds,
Decisive Picker and daily missions with their rewards. Any of these missing from the read is asked, not assumed.
