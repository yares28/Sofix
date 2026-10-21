# Plan · the overlay as a bridge (O3, O4, O5, O9, D3, D5, D9)

Written 20 Oct 2026, O9 and D9 added 21 Oct; gaps closed and the owner's answers added 21 Oct. Goal: answer on Sorare what you would
otherwise open Sofix for. The owner picked seven upgrades from the canvas https://claude.ai/artifact/AjySU9stfrPkep1Sp7Aj5F (boards O3,
O4, O5, O9, D3, D5, D9; the others were dropped). Nothing here writes to Sorare; Apply stays Check → Draft → Enter. **First in "Next up"**
(the owner, 21 Oct: "first, before the rest").

## Roadmap

Cheapest first; each step reuses the one before it. One step per commit, each shipped and looked at before the next.

| # | Step | Effort | Depends on | Status |
|---|---|---|---|---|
| 0 | The red backend CI (ruff, mypy, pytest on 81eaf48) | Small | — | done 21 Oct (certifi advisory) |
| 1 | B1 · O5 · start % on the lineups you entered | Small | — | done 21 Oct, extension 0.4.8, seen on his Lineups page |
| 2 | B2 · O4 · worth now, in your gallery | Small | — | to do |
| 3 | B3 · O3 · Sofix's line on a LaLiga player page | Medium | — | to do |
| 4 | B4 · O9 · market switch: LaLiga starters only | Small | B3 | to do |
| 5 | B5 · D5 · search any player from the dock | Medium | B3 | to do |
| 6 | B6 · D9 · compare two players in the dock | Medium | B3, B5 | to do |
| 7 | B7 · D3 · free competitions not entered yet | Medium | — | to do |
| 8 | Extension release, manual lines, one Reload | Small | 1–7 | to do |

## Sorare's addresses (measured on sorare.com, 21 Oct 2026)

| Page | Address |
|---|---|
| Your entered lineups | `/football/lineups/<mode>/<gameweek>` (e.g. `/football/lineups/arena/football-25-29-sep-2026`, plans/overlay.md) |
| Gallery | `/football/my-club/<manager>/cards/<rarity>` (`/football/my-club/<manager>/cards` redirects to `/limited`) |
| Player page | `/football/players/<slug>`, with tabs `/fixtures`, `/history`, `/cards`, `/watchlists` |
| Market (cards on sale) | `/football/market/shop/instant-buy`, `/auctions`, `/manager-sales` |

## What the code already has (checked 21 Oct)

- **Every full tile already shows his start %** with whose number it is, amber under 50% (`DOUBTFUL`, core.js) and red under 15%
  (`OUT_CHANCE`). A compact tile (a small card) shows only the score (overlay.js, `tier === "compact"`).
- **`paid`, `value`, `since`** are in each `collection` card (`CollectionCard`, play.ts); `/prices` already groups unbought cards as
  "crafted, won" (prices.ts). The overlay's answer does not carry them yet.
- **Players you don't own:** the overlay already asks for them by player slug (`p:` keys, from the page's own answers), but
  `overlayNumbers` only knows the week's `playing` players (your cards'). `market` has each LaLiga player's `pStart`, `sources`, `start`,
  `x`, first `fixture` and `eur`; `verdict()`, `gain()`, `squadBar()` and `UPGRADE_START = 0.7` are in cards.ts.
- **Every lineup in a plan is free:** the planner keeps a competition with a fee out of every plan (`enterable`, planner.py), so no
  "free" flag is needed. A Pro lineup carries `pro` in its dock row.
- **The dock already reads what is entered** (the `entered` step, dock.js), but only while you press Enter.

## B1 · O5 · start % on entered lineups

- **What:** on `/football/lineups/...`, every card with a tile shows Sofix's start % in the tile's own colours (amber under 50%, red
  under 15%), compact tiles included. Hover: "Sofix: 63% to start (Futbol Fantasy)". **A mint outline when Sofix and Sorare disagree:
  one is at 40% or less and the other at 60% or more** (the owner, 21 Oct: one thinks he won't start, the other thinks he will).
- **Code:** `overlay.js` only: the compact tile gets the start row on lineups pages. `DISAGREE_LOW = 0.4` and `DISAGREE_HIGH = 0.6` in
  `core.js` beside `DOUBTFUL`, compared on `pStart` against `sources.sorare` (no outline when Sorare has no number).
- **Measured 21 Oct on his `/football/lineups/pro`:** every card there already gets the full tile with its start row, top-left;
  Sorare's own % is a badge at the card's foot, so nothing covers it. So B1 shipped as the hover title and the mint ring only
  (`startDisagreement`, `startTitle` in core.js); compact tiles stay as they are.
- **Done when:** on his signed-in lineups page every owned card shows its %, three match /lineups exactly, and one disagreement wears
  the outline.

## B2 · O4 · worth now

- **What:** on **your** gallery only (`<manager>` is your Sorare account; someone else's gallery gets nothing), a line under each card:
  "now €X ▲13%", or "now €X · not bought" for a crafted or won card (the /prices wording). A squad total in a glass box at the top: worth
  now, what was paid, and the difference, the same figures as /prices.
- **Code:** the endpoint adds `paid` and `value` to an owned card's entry. `overlay.js` draws the line when the address is a gallery. The
  total reuses `prices()`. The hover gives the refresh time (`sorare.generatedAt`): the value is Sorare's from the last refresh, not a
  live listing. A card Sorare does not value shows nothing.
- **To measure first:** where Sorare's "Bought" line sits under a card on his own gallery (public galleries don't show it).
- **Done when:** five cards' figures and the total match /prices.

## B3 · O3 · the player page strip

- **What:** on `/football/players/<slug>` and its tabs, for a LaLiga player: score if he starts, start % with each source, his next five
  games in board colours, and "yours / in plan" or the upgrade verdict.
- **Code:**
  - `overlayNumbers` answers a player not in `playing` from `market`: `pStart`, `sources`, `start`, `x`, `fixture`, and
    `verdict(player, squadBar(collection), owned)`. One fallback, read through one helper (`marketOf(sorare)`), so B4–B6 use it and
    roadmap item 5's split of `market` changes one place.
  - `nextFive(grid, club, now)` in `lib/home.ts` beside `sideOutlook`, matching the club by `clubKey`: the next five cells with opponent,
    venue, label and bucket colour. The label shows, never a bucket number (AGENTS.md).
  - `overlay.js` reads the slug from the address and draws the strip in the hero.
- **Risks:** a player outside LaLiga gets no strip (nothing, never zeros). No extra Neon reads: the route already reads `market`.
- **Done when:** Yamal (yours) and a LaLiga player you don't own both show the strip, and the numbers match /players.

## B4 · O9 · market switch

- **What:** on the three market shop pages, one switch beside Sorare's filter chips: "LaLiga starters", with "3 of 18" on screen. On,
  every card that isn't a LaLiga player at least 70% to start is dimmed and the rest wear their tile. Off by default; remembered in
  `chrome.storage.local`.
- **Code:** tiles on market cards from B3's fallback; one dimming layer per card picture. The 70% is `UPGRADE_START`, sent in the answer
  so the two never disagree.
- **Risks:** Sorare adds cards as you scroll: each new one is dimmed as it appears, with no flash. An unknown player is dimmed, never
  hidden: Sorare's buttons stay usable.
- **Done when:** on Manager Sales the switch dims everything except LaLiga starters, and off brings the page back exactly as Sorare drew it.

## B5 · D5 · search

- **What:** a Search tab in the dock. Type a name and get his card, score, start % and next five, plus "Open his Sorare page" (a plain
  link to `/football/players/<slug>`).
- **Code:** `/api/ext/overlay` with `index: true` returns `[slug, name, club, pos]` for the collection and `market` (~25 KB). The
  background worker keeps it for the day. Matching in `dock.js` (accents folded, start of each word). A pick asks through B3's fallback.
- **Risks:** a name outside LaLiga says "not LaLiga". The index is read once a day, never per keystroke (Neon rule).
- **Done when:** "yamal", "raphi" and "oblak" find the right player in under 100 ms after the first load.

## B6 · D9 · compare two players

- **What:** a Compare tab in the dock, two players face to face: score if he starts, start %, next five, upgrade margin on your squad
  (`gain()`), lowest price (`eur`). The better figure in each row is green. Slots filled from the hover panel ("Compare") or from Search.
- **Code:** `dock.js` keeps the two slugs in `chrome.storage.session`; the hover panel gets a read-only "Compare" button. One ask with
  both slugs. Pictures: the card on the page, or Sorare's public card art.
- **Risks:** the price is the cached one from the last refresh, said on hover. Two positions: the margin row says "different positions".
- **Done when:** Mbappé against Raphinha shows the same figures as /players for both.

## B7 · D3 · free competitions not entered

- **What:** in the Lineups tab, a "3/5 entered" hero above the plan's lineups, **Pro left out** (the owner, 21 Oct; Pro keeps its own
  section). Each row is ticked if entered, or shows "Sofix team ready" with Guide me. The pill gets an amber "2 to enter" badge in the
  last 24 hours before the lock.
- **Code:** no planner change (every planned lineup is free). `dock.js` runs the existing `entered` step (read only) when the dock opens
  before the lock, at most every 10 minutes, and marks each non-Pro row. "Enter the N left" is the existing Enter flow, limited to them.
- **Risks:** one Sorare read per opening, throttled. A competition opened after the plan was built is not listed: "as of the last plan".
- **Done when:** with one free competition left empty on purpose, the dock lists it, and after entering it by hand the tick appears on
  the next opening.

## Checks for every step

- `node scripts/check.mjs` passes.
- `frontend/e2e/overlay.e2e.ts` gets a fixture case (lineups page, gallery, player page, market, dock search, compare, free list),
  including the axe check.
- A look at the owner's signed-in Sorare tab: one screenshot per step.
- The manual's overlay section gets a line per step. `extension/manifest` is bumped and he presses Reload once (step 8; until 9.7 ships).
