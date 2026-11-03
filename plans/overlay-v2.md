# Overlay v2 (planned 2-3 Nov 2026)

Every Sorare card shows its own next game, a crest and a smaller tile in Sorare's colours; Sorare's lineup builder gains
Sofix's team gauge, your own filters, Sofix's lineup on demand and a two-card compare; Arcade lineups show their chance to
clear; "comes on" is rebuilt from real minutes.

- **Design canvas:** https://claude.ai/artifact/2EG3ZudN1Qd9Hj7qKsxB8Y (private). Boards: Main (the card, its island, its
  panel, a small card), Edge states, On Sorare's builder, On Sorare's Arcade lineups, Captain and price per point (with the
  team gauge and panel), Comes on and start % hover. Every number on it is real data from 2-3 Nov 2026; a bracket marks a
  number that only exists after step 1.
- **Status:** steps 0, 1 and 2 shipped 3 Nov 2026 (extensions 0.4.30, 0.4.31, 0.4.34); step 3 next. Section 9 keeps the decision log.
- **Reads before building:** AGENTS.md (Sorare safety, Pages, Limits), [overlay.md](overlay.md),
  [overlay-bridge.md](overlay-bridge.md), [points-needed.md](points-needed.md), `docs/context.md` contract EXTENSION-ACTIONS-001.

---

## 1. The finished result (the spec)

### 1.1 One visual language

Every new piece follows these rules, so the overlay reads as one thing next to Sorare's own UI:

| Element | Look |
|---|---|
| A number about a player or game (xScore, FDR, team total, team stats) | A chip: rectangle, 5-6 px radius, **black text on Sorare's score colour** for that value |
| Sofix's own marks (plan outline, captain "C", start % source dot) | One purple, `#7c5cff`, **faint** (about 55% opacity), never glowing |
| Anything that floats (island, panels, pills, tooltips) | Dark `#0b0a10`, 1 px `#24202f` border, soft shadow, 14-22 px radius |
| Good / bad colouring (stats, compare, price per point) | Sorare's palette: `#00f3eb` `#25ed36` `#b6ff1a` `#f0ce1d` `#ff7e34` `#ff5a5a` (from the page's own `--c-score-*` tokens when readable, `core.SCORE_FALLBACK` otherwise) |
| Text | Never under **11 px** (desktop floor; the canvas's 10 px labels grow to 11) |
| Motion | Each appearance explains itself (island grows out of the crest, rings fill, chips rise); all of it off under `prefers-reduced-motion` |

Score colour steps are Sorare's own (`core.SCORE_STEPS`): ≤20, ≤35, ≤50, ≤60, ≤75, above. FDR colours are the bucket colours
(1 easiest, cyan/green, to 5, red).

### 1.2 On every card

**Crest (opponent of his next game).**
- Only the crest image, no container, centred on the card's **top edge, half outside**. About 40 px on a full card, 26 px on a
  small one. Drop shadow only.
- **Two games in the week:** both crests side by side, in kickoff order.
- **Sorare's substitution icon** (subbed on/off, top centre of the card): the crest goes to its right, the pair centred.
- **Live game:** the crest becomes a dark pill (`#0b0a10`): crest, a pulsing red dot, the minute ("62′").
- **Sure not to play** (injured, banned, out of the matchday squad): the same dark pill with **"Out" in red**.
- **Missing crest** (Sorare gives none, e.g. Fenerbahçe): a shield in the club's colour with its three-letter code.
- **No game ahead:** nothing at all.

**Island (hover or keyboard focus on the crest).**
- Grows out of the crest, **upwards, above the card**, never over the art (an iPhone-island morph: a 40 px circle opening to a
  ~290 px rounded panel).
- Content, top to bottom: both crests left and right with the **day and time** (Madrid) and the **competition** between them;
  then five stat tiles coloured good/bad: **win %, clean sheet %, team xG, xG against, FDR**. Two-game weeks list both games.
  Postponed or no date: "Date TBC".
- Never blocks a click on the card; closes on pointer leave or Escape.

**Tile (top left).**
- Smaller than today. The **xScore chip** first, then the **FDR chip** written "64 FDR" (number large, "FDR" small), both
  black text on their colour.
- Small cards: the xScore chip only.
- Gone from the tile: the edition/XP bonus chip, the "No xG"/"No odds" row, the plan tick, captain star, rank badge and the
  "×2" badge (two games now show as two crests). An out-of-date number goes grey with the reason on hover, no "Old" text.

**Start % (top right, under Sorare's projection grade).**
- Lineup cards carry Sorare's own start badge ("80%") and projection grade (A/B/C…) at the top right. Sofix's start % sits
  **under the grade**, as a dark chip with a faint purple source dot. No grade on the card: it takes the grade's place.
- **Hover, full card:** "Sofix 83% · Sorare 80%". **Hover, small card:** one line naming the number's own source, "Sofix 83%"
  or "FF 90%".
- **Far apart** (Sofix and Sorare start % differ by 30 points or more, both start chances): an amber ring on the chip.

**Points-needed pill.** Unchanged in content and pages (only entered lineups still in play, on Sorare's lineup pages), stays
**top right, above Sorare's start badge**.

**Captain.** On the builder, a small faint purple **"C" at the bottom right** of the card Sofix would make captain in the cards
on the pitch; it disappears once that card is made captain.

**Price per point.** On the market and your gallery: "€1.14/pt", **green** when he is in the cheapest third of similar cards,
**red** in the dearest third, plain in between. Similar = same rarity, same position, Sorare average within 5 points.
Price = Sorare's Limited price (`eur`, `sorare/sync.py`); points = his xScore for his next game.

### 1.3 The tile's hover panel

Compact (about 250 px wide), dark:
- **Starts / Comes on** switch.
- **Starts:** the xScore as the one hero number, start % beside it; then xD and decisive %.
- **Comes on:** the chance he comes on (from the rebuilt model, 1.6), a bar of his minutes in each of his last 10 games
  (started green, came on yellow, unused grey), and four numbers: started, came on, unused, average minutes when on.
- Not in the panel any more: the game's data (now in the island), last-5 scores, source chips, the score-distribution chart
  and the "what moves his number" rows.

### 1.4 Sorare's lineup builder (compose pages)

**Team gauge.** A ring placed in **Sorare's own bonus column** (under "+6% lineup bonus", "Multi-club", "Cap 260"), same form
factor as Sorare's items: 54 px ring, 17 px number, "SOFIX" and "n of 5" beside it.
- The number is the **total xScore of the cards on Sorare's pitch, whatever you put there** (Sofix's plan or not), with every
  bonus Sorare applies (edition, captain, lineup bonuses). The ring fills as cards are added.
- **Hover opens the team panel:**
  - The total as a score-coloured chip and its likely range (Sofix's GW29 lineup: **295**, 221-365).
  - **Three ring gauges:** the reward the total most likely lands in, larger, in the centre; the one below on the left; the one
    above on the right; each with the chance of reaching it (same example: no reward 24% · **500 XP 76%** at 257 · 1000 XP 38%
    at 314). Pro and Arcade: the step target instead of reward tiers.
  - **Team stats** as coloured chips: **xD** (sum), **win %** (average of the five games), **clean sheet %** (keeper and
    defenders' games), **FDR** (average).
  - No bonus line, no clubs, no captain, no lowest start.

**Sort and filter bar** above Sorare's card list:
- **Sort** (xScore by default; also FDR, start %, clean sheet %, xG, comes on %).
- **"+ Filter"** opens a list you pick from: xScore, clean sheet %, xG, xG against, win %, start %, comes on %, kickoff day.
  Each chosen filter becomes a chip with its own threshold (slider), removable with ×. **No preset filters.** Your filters are
  remembered per browser (`chrome.storage.local`).
- Cards that fail a filter fade out (not removed from Sorare's page); a count shows "3 of 12".

**Sofix lineup switch** in the same bar: the cards of Sofix's plan for this competition get a **faint 1.5 px purple outline**,
nothing else (no tag).

**Compare (Shift+click two cards).** Both get a white outline; a panel opens: both cards' art and names, the game of each as
crests with the day, then rows **xScore, FDR** (coloured chips), **win %, clean sheet %, xG against, xD**, the better value in
each row in green. Shift+click again or Escape closes it.

### 1.5 Sorare's Arcade lineups page

One small dark pill **"[x]% to clear"** beside the header of **each lineup still in play** (none on missed or finished ones).
The projection inside Sorare's score bar was dropped: Sorare's own bar already shows the score.

### 1.6 "Comes on", rebuilt

Today `_on_from_form` (`backend/app/sorare/forecast.py`) uses the last five games, ignores minutes and blends in a positional
prior, so most players read the same (the score if he comes on is 42 for all five of Sofix's GW29 LaLiga starters).
The new number, per player, from his **last 10 games** in `player_games` (`mins`, `started`):
- **started**, **came on** (not started, minutes > 0), **unused** (not started, 0 minutes), **average minutes when on**;
- **comes on %** = came on ÷ (came on + unused), shown from **one** such game; none: nothing.
- No "after this minute" rule (owner). Real example: Abdul Mumin, 0 started, 7 came on (22 min), 3 unused: **70%**, where
  Sofix says 60% today.
- Shown in the panel's Comes on side, as a filter, in compare, and live for a benched player (the crest's live pill plus the
  number in the panel).
- Whether the planner also switches to it is a model change: only after `app.jobs.lineup_backtest` shows it does not lose
  (AGENTS.md "Model rules").

### 1.7 Which game a card is about

1. **Lineup pages** (Arcade, Pro): the game Sorare put in that lineup (`taskAppearances.game`).
2. **Builder pages of a competition:** his next game **that counts in that competition** (a Pro board's league, an Arcade
   set's `availableCompetitions`, the address's gameweek). His Champions League game is not his next Pro Spain game.
3. **Any other page** (galleries, market, player pages): his next game, whatever the week.
4. After the final whistle his next game takes over; the answers are kept per game, so it moves on by itself.
5. National-team games: the opponent of the side actually playing, never his club's.
6. A game with no published xScore (not yet planned, a league Sofix does not model): crest and island only, **no number**.
   His next game must always have one (section 3, step 1); a later game may not.

---

## 2. Findings that shape the build

1. **The app answers one week only.** `overlayNumbers` (`frontend/lib/overlay.ts`) picks the address's week or the one being
   planned; players you do not own come from the league market blocks (`players:<league>`), published **for the planned
   week only**. A GW29 Arcade common (Nicolas, Laporte, Brassier on 2 Nov) therefore has nothing.
2. **The game itself is not sent.** `OverlayEntry.game` carries win, clean sheet, goals, difficulty and bucket, but no opponent,
   crest, kickoff, venue or competition; only multi-game weeks list `fixtures` (opponent name, venue, kickoff, competition).
3. **Two FDRs for one game.** Oblak's tile on the GW29 builder says FDR 62 (Sofix's model), the GW29 plan stores 65.3 for the
   same game (odds read from Sorare, `source: "sorare"`). One source must win everywhere: the board's model where it rates the
   game, Sorare's odds only where it does not, as `OverlayGame.source` already describes.
4. **Sofix-vs-Sorare score comparisons need like with like.** `sofix_x` in `player_games` is "if he starts", Sorare's projection
   already includes his start chance (Borja Mayoral: 51 against 36). The warning is therefore on start % (1.2), not on score.
5. **The chance maths exists twice already.** `frontend/lib/arcadePlan.ts` simulates any five cards (2,000 seeded runs,
   teammate link 0.09, `chanceOf`); the Python planner (`backend/app/sorare/planner.py`) simulates its own lineups and
   publishes each lineup's reward tiers (`tiers[].need`, `p`). The team panel and the Arcade pill reuse the TypeScript method,
   copied into `extension/core.js` with a parity test (the way `pointsNeeded` is shared today).
6. **The builder's pitch is already read.** `core.composeBoard` and `core.composeSum` (used by `dock.js`) find the compose
   board and the slot buttons; the gauge builds on them.
7. **Tiles vanished** on the GW29 compose page minutes after drawing (2 Nov, ~22:00), with the page unchanged; a reload
   brought them back. Unexplained: reproduced and fixed first (step 0).
8. **Free tier.** Vercel's 4 h of CPU a month is shared with three other apps and the account was blocked on 2 Nov (memory
   "Vercel blocked in Nov 2026"); the extension already falls back to localhost. Every addition stays **one batched call per
   page**, answers only the fields drawn, and heavy work stays in the Python jobs.
9. **A test harness exists:** `frontend/e2e/overlay.e2e.ts` runs the real extension scripts on fixture pages
   (`e2e/fixtures/sorare-*.html`) with `chrome.*` scripted; `frontend/lib/overlay.test.ts` and `overlayCore.test.ts` cover the
   route and `core.js`.

---

## 3. Build, step by step

Depth first: each step ships alone (its tests, its doc line, an extension release and one Reload), and the owner uses it before
the next starts. Extension version numbers continue from 0.4.29.

### Step 0. Stable ground (small)

- **Vanishing tiles:** reproduce on the GW29 compose page in the owner's Chrome (leave it open 10 minutes, watch
  `[data-sfx]` count and `report()` stats); suspects: `watchFixture` clearing on an address change Sorare makes silently
  (`?arena=true`), `forget()` on detached media, the app answer expiring. Regression test in `overlay.e2e.ts`.
- **One FDR source** (finding 3): the plan's games and the overlay take difficulty from the same place; a test with a LaLiga
  game rated by the model and an Arena game priced by Sorare.
- **Manual line:** Sofix's xScore covers seven competitions, not four (`docs/user_manual.md`).

Done when: tiles stay for 30 minutes on a compose page; Oblak's FDR is the same on the tile and in the plan.

**Result (3 Nov):** the vanishing came from extension releases (21:47-22:13 on 2 Nov): after a Reload the worker injects a fresh
overlay into the open tab, and the old, orphaned one swept every `[data-sfx]` on the page when its next message failed, the new
copy's tiles included. Each copy now names itself on `<html data-sfx-run>`, notices it is orphaned on its next pass and removes only
its own drawings (`overlay.e2e.ts`, "keeps the tiles when the extension is reloaded"). The plan's games now carry the board's own read
where a board rates the game (`jobs/sorare.board_games`, `foreign_scores.board_read`, `publish.with_board`), Sorare's odds elsewhere.
`sorare/keeper.py` is frozen by the Conference League recorder, so the LaLiga read lives in the job. Not reproduced live in Chrome:
it needs an extension Reload under an open builder tab.

### Step 1. Every card answers for its own game

Backend (refresh, `backend/app/jobs/sorare.py`, `sorare/publish.py`):
- Publish the league market rows (`players:<league>`) for **every player's next game**, not only the planned week: one row per
  player, keyed by game, for the planned week **and the week after** (GW+1). Runtime and Neon bytes measured before and after
  (the Sorare step is ~735 s of a ~15 min refresh); R2 block size kept under the 1.6 MB split rule.
- Each published game carries its identity: `gameId`, `kickoff`, `venue`, `competition`, `team`, `teamCrest`, `opponent`,
  `opponentCrest`, `opponentCode`, `opponentColor` (for the shield).

App (`frontend/lib/overlay.ts`, `app/api/ext/overlay/route.ts`):
- `OverlayRequest` gains `games?: Record<cardOrPlayerSlug, gameId>` (lineup pages send the lineup's game per card) and
  `board?` (the compose board slug, for "counts in that competition").
- `overlayNumbers` answers each slug for its game per section 1.7, across the planned week, GW+1 and the early LaLiga rounds
  (`sorare_ahead:<round>`); `OverlayEntry.game` gains the identity fields above; a game with no xScore returns the game without
  `x`.
- Still one call, at most 120 slugs, only drawn fields.

Extension:
- `background.js`: the answer cache is keyed per player **and game** (`ov:<gameId>:<slug>`), not per page week.
- `overlay.js`: on lineup pages, pass each card's game from the need-data copy (`taskAppearances.game.id`); on compose pages,
  the board slug from `core.composeBoard`.

Tests first: `overlay.test.ts` (next game across weeks; lineup game wins; competition filter; a game with no number; national
team opponent), `extensionBackground.test.ts` (per-game cache), `overlay.e2e.ts` (an Arcade lineup mixing GW28 and GW29 draws
five tiles).

Accept on real data: the owner's Hot Streak lineup shows all five tiles (Valverde, Ezzalzouli GW28; Nicolas, Laporte, Brassier
GW29), and Ezzalzouli's Pro Spain builder shows Elche (Sun), not Dortmund.

**Result (3 Nov):** squads are read with a second alias (`a0`, the week after) and each team's `code` and `styleGuideColor`
(checked against Sorare's schema and one live read: Atlético `ATM`, `#ce3524`); every market row gains `next` (the week after's
first game: p, pStart, start, x, fixture) and each fixture `id`, `opponentCode`, `opponentColor`; each week gains `boards`
(leaderboard → leagues). The kept domestic squad indexes drop `a0` (`foreign_coverage.stored`: a PL index would grow from ~1.0
to ~1.5 MB of a 1.6 MB block), so a quick run that reuses one gives that league no next-week game. The app answers per game
(`match` on each entry); the worker keys its cache `ov:<week>:<board>:<game>:<slug>`. Not built: the "game with no number"
answer (no published game lacks an xScore today) and the per-competition xScore on a builder (the number stays the week's;
only the game and its FDR follow the board). The first refresh after it failed (3 Nov 12:07 UTC): `players:CL` passed the 1.6 MB
block budget with `next` on its 1,113 rows; the European markets now leave `next` out (their players' next game is domestic, in
their own league's rows).

### Step 2. Crest, island and states

- `overlay.js`: a fixed-position layer appended to `document.body` holds crests and islands (Sorare's boxes clip anything inside
  them); positioned from each card's `getBoundingClientRect` on the existing paint pass, scroll and resize; follows Sorare's
  hover tilt by re-reading the rect each frame while the pointer is over the card.
- Crest states per 1.2: two crests, substitution icon (found by position: a round icon centred on the top edge), live pill with
  the minute (from the existing live reads, `liveByMatch`), "Out" (FF status out, Sorare not in squad), shield fallback.
- Island per 1.2, opening above the card; keyboard: the crest is a button, Enter/Space opens, Escape closes, focus returns.
- **Owner's check (edge case 8):** a card in the first row of a scrolling list, with the crest half outside and fully on the
  art; screenshots of both, the owner chooses.
- `overlay.css`: the island morph (clip-path from a 40 px circle) and the live dot pulse, both off under reduced motion.

Tests: e2e for each state on the fixture page (two games, live, out, missing crest, substitution icon), axe on the island,
reduced-motion snapshot.

**Result (3 Nov):** built as above, with three changes. The live pill says "Live", not the minute: no source here gives the real
minute (a clock from kick-off is wrong by half-time and stoppages). The sixths are worked out by the app from the boards it already
loads (each rated side-game of the gameweek, the season's below 12), not stored by the refresh: a few thousand cells per call, no new
block. Hover tilt is not followed (the crest sits on the card's resting edge). The substitution icon is found by what lies on the card's
top centre (a round 14-40 px element); not yet seen on a real Sorare card. Edge case 8 decided (3 Nov): the crest stays half outside on a
top-row card too, and it is smaller everywhere: 22 px on a full card (18 each for two games), 16 on a small one (14), 16 in the pill (second cut, 0.4.36). A card Sorare hides (opening a
player from the gallery) takes its crest away, since the crest lives on the page, not in the card; so does a card under a dialog laid over the
page (the gallery's ?card= player page, 0.4.37), the card inside the dialog keeping its own.

### Step 3. Tile, start %, captain C, price per point

- Tile per 1.2 (xScore chip, "64 FDR" chip, no extras); small-card variant; grey stale state.
- Start % chip under Sorare's grade (found by position in the top-right strip; fallback: the grade's place), source tooltip,
  far-apart amber ring (30 points).
- Points-needed pill above Sorare's start badge (moves from its current top-right inset).
- Captain "C" on the builder: the card on the pitch with the highest xScore × card multiplier, hidden once Sorare marks it
  captain.
- Price per point: app answers each card's price group rank (rarity, position, average ±5) from the market blocks; the overlay
  colours "€x/pt". Text from the market block's `eur`.

Tests: core tests for the captain choice, price thirds, far-apart rule; e2e for chip order, the 11 px floor, and the pill's new
place.

**Progress (3 Nov):** shipped in parts. Part 1 (0.4.38): the tile as two chips, the start % chip under Sorare's grade found by
position (its box kept as offsets per card size and page change, so scrolling does not probe again), the 30-point ring, the hover
lines, the pill above Sorare's start badge or beside it; the rank badges and the text walk that found "Select your..." headings
went with them. 0.4.39: on a full card under 130 px (Sorare's builder list, 118 x 191) the chips are tighter, and the start % steps
below the tile when a badge of Sorare's pushes the tile into its row. Captain "C" and price per point follow.
0.4.40 (owner, 3 Nov): the FDR chip sits under the xScore chip, not beside it; the start % and points-needed pills are drawn like
Sorare's own start badge, with its colour steps read from its script ([[49.5, "low"], [79.5, "medium"]], then high:
`--c-score-veryLow`, `--c-yellow-400`, `--c-onBase-success`).
0.4.41 (owner's pitch screenshot): Sorare's badge sits 4 px past the card's right edge, 8 px down, its grade under it, both
right-aligned; ours joins that column 4 px under the grade (or takes the badge's place), inside the card only where the card's box
clips. The captain's round button on the corner is left out of the probe. 0.4.42 (owner: "all pills"): the xScore and FDR chips take the same badge
form, mirrored (square bottom-left corner), 4 px apart, 4 px past the left edge and 8 px down where the card lets it show. 0.4.43: Sorare's
builder list wraps each card in a box with `contain: content`, which cut ours at the card's edge; ours now go one box up, where
Sorare's own badge is (only for paint containment or a clip path; a card cut by its own overflow keeps ours inside).
Crests on an Arcade builder (owner, 3 Nov): the app picked only between the week being planned (GW29) and the week after, so on
the Hot Streaks builder Mbappé showed Valencia (Sat), not AEK (Wed, the week being played). A page naming no week now reads the week
being played too (the same cached frozen plan a lineup page reads) and a card's game in it that is still ahead comes first (1.7.3);
for your cards first. Then (owner: "build it"): the refresh gives every market row `now`, his first game of the week being played
still ahead, from that week's frozen record read through `kept_blocks` (R2 first, kept between runs), so no Neon payload is read
again; `publish.with_now`. The side's crest is left out of it (the row has it): measured on 3 Nov's blocks, `players:CL` would
otherwise reach 1.54 MB of its 1.6 MB budget (with it out, ~1.38 MB; EL ~1.3, CONF ~1.2). The app answers it first while it is ahead
on a page naming no week. Its numbers are as they stood at that week's lock. A game now stays a card's game until 115 minutes after kick-off (edge case 4,
"after the final whistle"; it moved on at kick-off before), so the crest shows the live pill while it is on.
Captain, decided from the code: Sorare adds bonuses together (`frontend/lib/arcadePlan.ts`, `multiplier`, read 21 Oct), so a captain
adds his captain bonus × his raw score whatever his card's own bonus; the card to captain is the one with the highest xScore, not
"xScore × card multiplier" as 1.2 says. Not built yet: how Sorare draws a placed pitch card and its captain was not seen (his builders
were empty on 3 Nov and none of his GW28/29 lineups was entered); it needs a filled builder to read.
Captain C built (0.4.45): a filled Classic builder (Spain arena draft, 3 Nov) draws a 32 px round `div[title="Captain"]` "C"
centred on each pitch card's top-left corner, white, pink with the class `active` on the captain; a 16 px one sits in the "Select
Captain" line. On a builder page (`composeBoard`, or an Arcade step's `compose-team`) the cards with such a mark are the pitch;
`core.captainPick` takes the highest fresh xScore and nothing once it is Sorare's captain.
Price per point built (0.4.47): the app adds `price` {eur, perPoint, third, similar} to every answer whose player has a priced
market row (`lib/overlay.ts`, `priceOf`): his `eur` over the answer's own xScore, ranked against the other leagues' rows (each
player once) of his position within 5 of his average, by their row's `eur / x`; under 5 of them, no third. Measured on 3 Nov's
blocks: 5,722 priced rows, a FWD averaging 49 has 644 like him, median €0.17/pt. The overlay draws it on Limited cards only
(card slug or alt), on `/football/market…` and your own gallery, as the canvas's dark pill, moved up to the right at two thirds of the card (on the market his name runs across the bottom, where the canvas had it); the captain C took the
canvas's filled purple disc. Step 3 is done.

### Step 3b. A light overlay (owner, 3 Nov: "the page lags, it's unbearable"; next after step 3)

**Crests on builders and lineup pages only (owner, 4 Nov, 0.4.50):** "it bugs out a lot" on the gallery and lists, "works better in lineup builder"; `crestPage()` = `builderPage() || needPage()`.

**Built (4 Nov, 0.4.49).** Measured first on his gallery (20 cards, 0.4.48, a scripted scroll with no screenshots): every frame
about 1 s. In the e2e page a pass took 115 ms, 94 of them in 57 `clearOf` probes (about 1.6 ms each). Done: (1) a scroll moves only
the crests (`moveCrests`, read then write), with a pass at most every 400 ms while it lasts (so cards scrolled in still get their
tiles; strict "no pass" left them bare on a long scroll) and one 150 ms after it stops; `schedule()` itself defers, so every caller
does; crests are drawn for cards in the 300 px visibility margin so one scrolled in has its crest. (2) `clearOf`, `topRightOf`,
`barFor` and the room check are kept per card size and page change, as offsets, probed only with the card wholly on screen.
(5) Sorare's text-only changes (auction timers) are not news; page changes run a pass at most every 250 ms; a press looks again
after 300 ms (the captain is a class). (6) a crest under a sticky bar of the page hides (one hit test at its place). (7) the live
dot pulses with transform and opacity. (8) each pass is timed; probes stop at 8 ms a pass and the rest wait a frame (their tile
stays hidden); the slowest pass of the minute reaches the popup. Not done: (4) skipping unchanged cards (tiles compare a
signature already; the probes were the cost) and per-node `contain` (it would clip the focus ring).

**Measured (3 Nov, his Chrome, 0.4.37, Hot Streaks builder, 34 cards, overlay on):** scrolling five ticks down and up gave frames
of 170-640 ms, almost all inside animation-frame callbacks with no page script named (Long Animation Frames API; content scripts
are not attributed), while Sorare's own named script took 6 ms. The overlay's redraw runs in an animation frame, so it is the
overlay. Cause in the code: step 2's `scroll`/`resize` listeners (`onMove`) call `schedule()`, the full `pass()`: discover,
identify, every `want*` and `paint()` over every visible card, each one measured and redrawn, with layout reads (`subIconOf`'s
`elementsFromPoint`, `barFor`, `roomIsFree`, `clearOfCached`, `locateAgo`) between writes. Worse, `clearOfCached` keys its answer on the card's
`rect.top`, so every scroll frame re-runs `clearOf` on every card: a grid of `elementsFromPoint` probes (every 10 px across the
tile, every 12 px down) per card, then a `getBoundingClientRect` for each element hit. Before step 2 a scroll did not start a pass.
Seen at the same time: crests of cards scrolled under the builder's sticky search bar float over it (the crest layer sits above
Sorare's header).

Instructions:
1. **A scroll only moves crests.** `onMove` calls `moveCrests()`: one read pass (each drawn crest's card `getBoundingClientRect`),
   then one write pass setting `transform: translate3d()` (not `left`/`top`). No discover, no identify, no `want*`, no tile or pill
   redraw (those live inside the cards and scroll with them). The island repositions in the same pass.
2. **`clearOf` once per card, not per frame.** Key its answer on the card's size, the tile's size and `pageEpoch`, and store it as
   an offset from the card's top (not a page position), so scrolling reuses it.
3. **Read everything, then write everything, in every pass.** No layout read after a write: `subIconOf`, `barFor`, `roomIsFree`,
   `clearOfCached` and `locateAgo` run in the read phase and keep their answer per card until its size or the page epoch changes
   (the `ResizeObserver` and `pageEpoch` already say when).
4. **Only what changed is redrawn.** A card whose rect, entry and tier are the same as last pass is skipped (compare a small
   signature); a pass with nothing new touches no DOM.
5. **Page changes are batched.** The `MutationObserver` ignores attribute-only changes and our own nodes, and asks for discover
   at most every 250 ms (idle callback), not every frame.
6. **Crests are clipped to their card's scroll box.** A crest shows only while its card's top edge is inside the nearest
   scrolling ancestor's visible rect (found once per card, kept), so it never rides over a sticky header or a closed list.
7. **Cheap to paint.** Our nodes get `contain: layout paint style`; no `backdrop-filter` or large blurred shadows on per-card
   nodes; `will-change` only on the island while it animates; the live dot's pulse is `opacity`/`transform` only.
8. **A budget, checked.** Each pass times itself (`performance.now()`); the popup's report line shows the slowest pass of the
   last minute. Target: no pass over 8 ms on a 100-card page, no frame over 50 ms while scrolling.

Tests: e2e, the fixture page with 200 cards: 20 scroll frames run no discover and no tile redraw (counters on the test hook), the
crest still sits on its card's top edge after the scroll, a card under a sticky header shows no crest, and the slowest pass
stays under its budget (a loose bound on the test machine). Accept on his Chrome: the same Long Animation Frames measurement on
the builder and the gallery, before and after, with frames while scrolling under 50 ms, and the same with the overlay switched
off as the baseline.

### Step 4. Panel and "comes on"

- Backend: `forecast.py` gains the 10-game minutes record per player (from `player_games`: started, came on, unused, minutes
  when on) and publishes it with each market and playing row (`benchRecord: {started, on, unused, minsOn, games}`).
- Panel per 1.3: Starts / Comes on; the minutes bar from the record; comes on % from one game.
- Live bench: during his game, a benched player shows the comes-on % in the panel.
- Planner switch to the new rate: a separate decision after `lineup_backtest --pools 600` (keep or drop on its result).

Tests: `test_forecast.py` (record from games; no games, nothing; a red card; a cup game counted), `overlay.test.ts`, e2e panel.
Accept: Abdul Mumin shows 0 / 7 / 3 / 22′ and 70%.

### Step 5. Team gauge and panel on the builder

- `core.js`: `teamChances(cards, lines, captainBonus)`, a copy of `arcadePlan.simulate` + `chanceOf` (2,000 seeded runs,
  teammate link 0.09), with a parity test against the TypeScript version on the same inputs.
- App: the answer for a compose board carries its reward tiers (`tiers[].need`, reward label) from the planned week's
  lineups for that board, or `reward_bars` when Sofix has no lineup there; Pro and Arcade give the step target.
- `overlay.js`: reads the pitch with `core.composeSum`'s slot reader, sums xScore × multipliers (edition, captain, lineup
  bonuses read from Sorare's bonus column), draws the gauge in Sorare's bonus column, and on hover the team panel (1.4): total
  chip and range, three ring gauges around the likeliest reward, team stats chips.
- Recomputed only when the pitch changes; no app call for it (all numbers are already on the cards).

Tests: parity test; core tests for "likeliest reward and its neighbours" (no reward below, top tier above); e2e of the gauge
filling as slots fill. Accept: Sofix's GW29 LaLiga lineup put on the pitch by hand reads 295 (221-365), 76% / 38% / 24%,
within 2 points of the planner's own numbers.

### Step 6. Sort and filter, Sofix lineup, compare

- Bar above Sorare's card list (found as the scroll box holding the card grid). Sorting uses CSS `order` on Sorare's own grid
  items (never moving Sorare's DOM nodes, which React owns); filtering fades with a class; both undone when the bar is cleared
  or the overlay is turned off.
- "+ Filter" menu, chips with sliders, saved per browser; count "n of m".
- Sofix lineup switch: outlines the plan's cards for this board (from `inPlan`).
- Compare: Shift+click two cards (Sorare's own click still works without Shift), panel per 1.4, Escape closes.

Tests: e2e on a fixture list of 12 cards (sort order, each filter, chip removal, persistence after reload, overlay off restores
Sorare's order, compare values and green winners), axe on menu and panel.

### Step 7. Arcade "% to clear"

- On Sorare's Arcade lineups pages (`/football/series/<step>/lineups`), each lineup still in play: its five cards' game
  entries (step 1) and its step's target (need-data copy) through `core.teamChances`; a pill beside the lineup's header.
- Once a lineup's games start, the chance uses each finished card's real score and the rest simulated (same rule as the
  points-needed pill).

Tests: e2e with one waiting and two missed lineups (pill only on the waiting one). Accept on the owner's Hot Streak page.

### Step 8. Further weeks (GW+2, GW+3)

- The refresh plans two more weeks of market rows for every league; measured first (refresh minutes, Neon MB, R2 size). Ships
  only if the refresh stays under its slot and the free tiers hold; otherwise LaLiga only (already published as early rounds).

---

## 4. Edge cases and their decisions

| # | Case | Decision |
|---|---|---|
| 1 | Lineup page | The lineup's own game (owner: yes) |
| 2 | Builder of a competition | Next game that counts there (owner: yes) |
| 3 | Two games in a week | Both crests side by side (owner) |
| 4 | Final whistle | Next game takes over (owner: OK) |
| 5 | Postponed / no date | Crest, "Date TBC" in the island (owner: OK) |
| 6 | National-team game | The national side's opponent (owner: OK) |
| 7 | Sure not to play | Dark live-style pill, "Out" in red (owner) |
| 8 | Crest cut at the top of a list | Decided from before/after screenshots in step 2 (owner) |
| 9 | Plan tick, star, rank badges | Dropped (owner) |
| 10 | No Sorare grade | Start % takes its place (owner: OK) |
| 11 | Same player twice on a page | Same numbers (owner: OK) |
| 12 | Comes on | Last games on the bench, no minute rule, from one game (owner) |
| 13 | Sorare's substitution icon | Crest to its right, pair centred (owner) |
| 14 | No number for a later game | Crest and island only (owner) |
| 15 | No game at all | Nothing (owner) |
| 16 | Overlay switched off | Every Sofix element and every sort/filter change removed, Sorare's page as it was |
| 17 | Sorare re-renders a card (React) | Elements re-attached on the next paint pass (`pageEpoch`); never kept inside Sorare's nodes |
| 18 | 200 cards on a gallery | Crests drawn for visible cards only (existing `IntersectionObserver`), islands built on demand |
| 19 | App unreachable / not signed in | Existing "Offline"/"Sign in" tag; crests and islands not drawn without data |
| 20 | Hidden tab | Nothing asked (existing visibility rule) |

---

## 5. Risks and limits

- **Sorare's page changes.** Everything is found by position and size, never by class names (the overlay's rule since O5); the
  e2e fixtures are refreshed from real pages when Sorare changes, and `report()` shows matched/seen counts in the popup.
- **Sorting someone else's React list.** CSS `order` only; if Sorare's list is virtualised (only visible cards in the DOM),
  sorting is limited to what is loaded and the bar says so.
- **Refresh time and free tiers** (steps 1, 4, 8): measured before shipping; no paid tier, no keep-alive, no extra project.
- **Sorare safety:** reads only; no write buttons in the overlay; Apply stays Check → Draft → Enter in Sofix.
- **Extension releases** need the owner's Reload each time (`node extension/scripts/configure.mjs` after the push); releases
  are batched per step.

---

## 6. How each step is checked

1. Test first for every rule (vitest for the app and `core.js`, pytest for the job, e2e for the drawn result).
2. `node scripts/check.mjs`, then the step's e2e spec.
3. Real data in the owner's Chrome on the pages named in the step, desktop width: screenshots, matched against the canvas.
4. Push to `main`, extension rebuilt, owner reloads; `check.mjs --live` (Vercel may be blocked in November; local app then).
5. The step's line in `docs/user_manual.md` in the same commit; the roadmap's "Next up" updated.

---

## 7. Settled last (3 Nov)

- **Island:** exactly as drawn on the canvas (both crests, day, time, competition; win %, clean sheet %, xG, xG against, FDR).
- **Good/bad colours for game stats:** each stat is ranked against **all games of the same gameweek** that Sofix rates (every
  league's grid), then coloured by sixths in Sorare's six score colours: top sixth `#00f3eb`, then `#25ed36`, `#b6ff1a`,
  `#f0ce1d`, `#ff7e34`, bottom sixth `#ff5a5a`. Higher is better for win %, clean sheet %, xG and xD; lower is better for xG
  against. FDR keeps its own bucket colours. The ranks are computed by the refresh (one small table per week:
  each stat's five cut points), so the page only compares a number with five cuts. A week with fewer than 12 rated games uses
  the season's games instead (too few to rank fairly).

---

## 8. Not doing

Confirmed-eleven tick (Sorare shows 100%), next three games in the island, rotation warning, live "on track" line, projection
inside Sorare's score bar, swap suggestion, the bonus line and clubs/captain/lowest-start stats in the team panel.

---

## 9. Decision log

- **2 Nov:** request (next game everywhere, crest half outside, Arcade-style tile on the left, compact panel, start % under
  Sorare's grade); canvas comments: crest without container and an island on hover, xScore then "x FDR", no source chips or
  last 5, darker live pill, nothing instead of dashes; edge cases 1-13 answered.
- **2 Nov:** upgrades chosen: lineup total, sort/filter, comes on rebuilt, start % disagreement; not wanted listed in 8.
- **3 Nov:** filters picked by the user; start % hover simplified; comes on approved; gauge in Sorare's bonus column; chance
  per Arcade lineup; faint outline for Sofix's lineup; captain "C"; price per point; compare added; swap dropped.
- **3 Nov:** gauge bigger; no tag on the outline; compare with card art, crests and coloured chips; price test by similar
  cards; the gauge counts any cards on the pitch and its hover shows rewards as three ring gauges and team stats.
