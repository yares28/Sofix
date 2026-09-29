# Plan · the sorare.com overlay

Sofix's numbers, drawn on Sorare's own pages. Written 2026-09-29.

**Why this plan exists:** the popup has had a "Scores on sorare.com" switch since the first version. It writes
`overlay` to `chrome.storage.sync` and nothing reads it. The feature behind it was never built. This is the
build.

---

## Status · 2026-09-29

**O1 to O4 are built, and so is the automated half of O5.** What is left is the half no test can do: looking at the
owner's own signed-in pages (lineup, compose, gallery, player page, signed out, switch off).

| Phase | Where |
|---|---|
| O1 identity | `extension/core.js` (key, alt name, answer walker), `bridge.js` (index, `identify`) |
| O2 numbers | `frontend/lib/overlay.ts`, `app/api/ext/overlay/route.ts`, `lib/extAuth.ts`, `background.js` (`askApp`, session cache); `backend/app/sorare/publish.py` now names each player by slug |
| O3 ribbon, restyled by O6 | `extension/overlay.js`, `overlay.css`: one chip on the card's left edge (see O6) |
| O4 switch, drawer | `overlay.js` and `drawer.js` read `overlay` live; the popup shows "Cards recognised here"; the app answers `plan: true` for the drawer |
| O5 proof | `frontend/e2e/overlay.e2e.ts` on `e2e/fixtures/sorare-cards.html` (real extension scripts, stubbed `chrome.*`, axe); `S7-overlay.html` shows the built ribbon |

**Checked on real sorare.com** (public pages, nobody signed in, stub numbers): a player page resolved 5 of 5 visible
cards and a card gallery 7 of 7, from real GraphQL answers, with one batched ask. That is O1's "done when" on public
pages; the same on a lineup page needs the owner's session.

**Where the build differs from this plan, and why**

- **No clearing on route change (O1).** The index is capped at 2000 and evicts oldest first. Clearing on navigation
  would lose cards Sorare re-draws from its own cache without asking again; the cap already bounds memory.
- **No `overflow: visible` overrides (2.4).** The ribbon sits inside the card's own picture, so nothing clips it and
  nothing of Sorare's has to be restyled. It is placed by measuring how far it is from where it should be, which does
  not depend on which ancestor is positioned.
- **Numbers exist only for players you own.** xScore is computed for your players, so the endpoint answers those and
  omits everyone else; there is no `owned` flag because it would always be true. A market player gets no ribbon.
- **The app is asked by player slug when the page's answers name it, by card slug otherwise.** xScore belongs to the
  player, so one ask covers all his cards. A card only its link names (`?card=…`) is asked by card slug.
- **Difficulty reuses the board's club-name matcher** (`sideOutlook` in `lib/home.ts`), so the overlay can never
  disagree with the board. Outside LaLiga, and for national-team games, the chip says "No odds".
- **The drawer shows the gameweek's best plan, not one card's.** It asks for the plan only when opened.
- **Account matching is not enforced.** The numbers are gated by the extension's token. The app cannot compare the
  signed-in account with the published owner reliably: the extension reports `nickname || slug`, the job plans for
  `SORARE_USER`, and a wrong guess would silently blank the owner's own overlay. Needs `whoami` to report both.
- **Found on the real site, not in the plan:** slugs contain underscores (`…-super_rare-9`), so a slug pattern of
  letters, digits and hyphens rejects a whole batch; a card's small face-only picture (`/picture/avatar-…`) carries the
  card's id and must not get a ribbon; gallery cards link to `?card=<slug>`, used as a fallback identity.

**To see it live:** run `node extension/scripts/configure.mjs`, reload the extension (0.2.0) and the sorare.com tab,
and let one Sorare refresh finish, because `playing.players` only carries each player's slug from that refresh on.

**O6, the restyle and repositioning, is built (2026-09-29): see its "Built" record below.** The chip is now one solid
chip on the card's left edge in Sorare's own colours, with no game detail; the owner's compose-page screenshot drove
it.

**The owner rejected O6's look the same day and approved a redesign (2026-09-29): O8 to O11 below.** A glass tile
inside the card's top-left corner (the score if he starts, then FDR or xG by position), a Sofix odds row under
Sorare's own win/draw/loss bar (win % and clean sheet %), a hover that switches between "starts" and "doesn't start",
all in Sorare's colours, with numbers for every game his players play, national teams included. **Next: O8**, then
O9, O10 and O11; O7's marks follow on the new tile. The owner's live pass waits for O10.

---

## 1 · What already exists

Three-quarters of the hard parts are done, in both repos.

**Ours, already working**

| Piece | Where | What it gives us |
|---|---|---|
| MAIN-world page bridge | [extension/bridge.js](../extension/bridge.js) | Already patches `window.fetch` and keeps Sorare's GraphQL endpoint + headers in memory |
| Content relay | [extension/content.js](../extension/content.js) | Two-way `postMessage` channel, versioned (`sofix-bridge-3`) |
| Authenticated app channel | [extension/background.js](../extension/background.js), [app/api/ext/checkin](../frontend/app/api/ext/checkin/route.ts) | Bearer `EXTENSION_TOKEN` + Vercel bypass, proven in production |
| The numbers | `PlayCard` / `MarketPlayer` in [lib/play.ts](../frontend/lib/play.ts) | `x` (xScore), `p` (chance of playing), `average`, `fixture` (opponent, venue, kickoff) |
| **The approved design** | [docs/sorare/design/S7-overlay.html](../docs/sorare/design/S7-overlay.html) | A dark/mint ribbon (`.rib`) on the card plus an edge tab into a drawer. Already signed off |
| The switch | [extension/popup.html](../extension/popup.html) line 16 | Exists, wired to nothing — this plan gives it its wire |

**Missing:** everything that draws. No content script writes to sorare.com's DOM today; `content.js` only asks
who is signed in and relays Apply's questions.

---

## 2 · What the reference extension does, and what we take

`C:\Users\Yaya\Desktop\PROJECTS\ExtentionSorare\SorareInside Ext` (v0.5.8) solves the same problem. Its value to
us is **mechanics**, and those are worth copying closely because they encode a lot of hard-won detail.

### 2.1 Finding cards without touching Sorare's class names

Sorare is a React app whose class names are generated and change on every deploy. The reference never uses
them. It finds cards by their **media** instead:

```js
const CARD_SELECTOR = [
  'img[alt*=" - "]',
  ...['cardsamplepicture/', '/card/', '/carddata/'].flatMap((path) => [
    `img[src*="${path}"]`, `video[src*="${path}"]`,
    `video[poster*="${path}"]`, `video source[src*="${path}"]`,
  ]),
].join(', ')
```

That survives redesigns, because the asset URLs are the product. **We take this wholesale.**

### 2.2 Identity from the asset URL

```js
value.match(/cardsamplepicture\/([^/?#]+)/u)
  ?? value.match(/\/(?:image-resize\/)?card(?:data)?\/([^/?#]+)\/(?:picture|video)\//u)
```

The capture group is a stable key per card image. The player name comes from `alt` (`"Jan Oblak - ..."`), and
the authoritative slug from GraphQL. **We take this.**

### 2.3 Sizing the ribbon to the card it lands on

One page shows the same card at four sizes. The reference measures `getBoundingClientRect()` and classifies —
it never trusts the route alone:

| Surface | Test | Strategy |
|---|---|---|
| full-card | height >= 120 and not thumbnail-sized | full ribbon |
| compact-card | width <= 112 or height <= 170 | compact ribbon |
| thumbnail-card | width <= 74 or height <= 96 | compact ribbon |
| avatar-or-tile | round, <= 96px, or no card asset | **skip** |

**We take this, with our own two tiers** (full / compact); a third "round" case only if a page needs it.

### 2.4 Escaping the card's clipping box

A ribbon that hangs off the card edge gets clipped by Sorare's `overflow: hidden`. The reference walks **two**
ancestors up and forces them open:

```css
.si-companion-card-anchor { overflow: visible !important; position: relative; }
.si-companion-card-overflow-anchor { overflow: visible !important; }
```

**We take this,** renamed `sfx-anchor` / `sfx-anchor-up`, and keep the two-level limit — going deeper starts
breaking their scroll containers.

### 2.5 Batched positioning

`MutationObserver` -> `requestAnimationFrame` -> measure *every* ribbon -> then apply *every* position, with a
retry counter. Separating the read pass from the write pass is what stops layout thrash on a gallery of 200
cards. **We take the shape of this.**

### 2.6 The ribbon form

A 17px chip, `10px/800` uppercase, `LABEL` + `VALUE`, radius 2px, with a folded corner made from a CSS
triangle tucked under the right edge:

```css
box-shadow: 0 1px 0 rgba(255,255,255,.55) inset, 0 2px 4px rgba(0,0,0,.28);
/* ::after */ border-width: 5px 6px 0 0; bottom: -5px; right: 1px;
```

Plus states worth taking outright: `loading` (translucent + 8px spinner), `missing` (grey), `auth-required`
(near-black, clickable, the only one with `pointer-events: auto`), and a greyed **inset ring** when a player
is not expected to start.

### What we do **not** take

- Their logo, wordmark, icons, name, and the `si-companion-*` class names — all become `sfx-*`.
- Their Mantine colour ramp (`#2b8a3e`, `#ffd43b`, `#fa5252` ...). Our difficulty and xScore already have a
  colour language; the overlay uses **ours**, so a green on Sorare means the same as a green on the board.
  *(O6 revisits the paint, not the meaning: on sorare.com a score is painted with Sorare's own score tokens, at the
  same cut points, so the chip matches the page it sits on.)*
- Their cookie permission, their auth bridge, their subscription and paywall states.
- **Their CSS file itself.** We re-implement the pattern in our own tokens and class names rather than copying
  the file — which is what design rule 8 ("copies no wordmark/classes") already requires of us, and it keeps
  someone else's licensed code out of a public repo. The look lands the same; the source is ours.

---

## 3 · What the ribbon says

*Revised by O6 after the owner's live look (2026-09-29): one chip, no game detail. The first design below is kept
struck through so the reasoning is not lost.*

*Superseded by O8 to O11 (approved 2026-09-29): the game comes back as Sofix's own odds row, and the chip becomes a
tile that says what drives the card's score. This section is kept for its reasoning.*

Per card, in priority order:

1. **`X 41`** — xScore (`PlayCard.x`), the headline, in Sorare's own score colour.
2. **`74%`** — chance of playing (`PlayCard.p`), a second segment of the **same chip**, not a chip of its own.
3. ~~**Detail ribbon** (opponent, venue and its difficulty, `ATL (H)`)~~ — **dropped.** Sorare's card already draws the
   fixture: both flags, its own win/draw/loss bar and the kickoff. Repeating it on top of the art is noise.

States, in Sofix's plain language — never an optimistic blank:

| State | Ribbon |
|---|---|
| Numbers ready | one chip: the score in its colour, then the chance |
| Not expected to start | the score greyed, the chance in red: the number stays, its colour is withdrawn |
| Not signed in to Sofix, or app unreachable | dark chip, "Sofix" — clicking opens the app |
| Still loading | translucent chip + spinner |
| Card we do not recognise, or Sofix has nothing on him | nothing at all — never a broken chip |

~~Player outside LaLiga: "no odds".~~ No longer a state: nothing about the game is drawn.

---

## 4 · Build phases

### O1 · Identity — which player is this card? *(no pixels yet)*

- Extend [bridge.js](../extension/bridge.js) to capture GraphQL **responses**, not just request headers. It
  already wraps `fetch`; add a `clone().json()` on responses from the GraphQL endpoint and walk the JSON for
  any object carrying `pictureUrl` + `slug` + `player.displayName`.
- Index `cardImageKey -> { cardSlug, playerSlug, playerName }`. Cap the map (the reference uses 2000) and clear
  it on route change, so a long session cannot grow without bound.
- Extract `cardImageKey()` and `normalizeCardName()` exactly as in section 2.2.
- Hold it in the closure, like the endpoint headers: **nothing stored, nothing sent away.**
- *Tests:* unit-test key extraction and alt parsing against the real asset URLs already sitting in
  `S7-overlay.html` and `S5-cards.html`.

**Done when** a console probe on a real lineup page resolves every visible card to a player slug.

### O2 · The numbers — one endpoint

- New `frontend/app/api/ext/overlay/route.ts`. POST, bearer `EXTENSION_TOKEN`, `timingSafeEqual` — the exact
  pattern of [checkin](../frontend/app/api/ext/checkin/route.ts).
- Body (Zod): `{ week?: string, cards: string[], players: string[] }`, **capped at 120 slugs** per call.
- Reads the already-cached `sorare` and `grid` read models through `loadSorare()` / `loadGrid()`. No new Neon
  query per request; the cache tags do the work.
- Returns per slug `{ x, p, average, opponent, venue, kickoff, difficulty, owned }`, and omits unknowns rather
  than returning nulls that would draw an empty chip.
- `background.js` batches one call per route change and caches answers in `chrome.storage.session` behind a
  TTL, so scrolling never refetches.
- Privacy: card slugs go only to our own app, never to any third party.
- *Tests:* route unit tests (auth rejected, cap enforced, unknown slug omitted) plus a mock-api fixture.

**Done when** the background worker logs a full answer for a real lineup page.

### O3 · The ribbon — the part you can see

- New `extension/overlay.js` and `extension/overlay.css`, registered as a content script on
  `https://sorare.com/*`: CSS at `document_start`, JS at `document_idle`.
- Card discovery (2.1), surface classification (2.3), anchoring (2.4), batched positioning (2.5).
- Ribbon markup `.sfx-rib` with `.sfx-rib__label` / `.sfx-rib__value`, folded corner via `::after`.
- Tokens `--sfx-rib-*` on `:root`, colour bands from Sofix's own ramp, `pointer-events: none` everywhere
  except the signed-out chip.
- Idempotence: one ribbon per card, keyed by a `WeakMap` on the media element — React re-renders must never
  double it.
- `IntersectionObserver` so off-screen cards in a long gallery wait their turn.
- Every DOM write inside `try/catch`: **a failure of ours must never break their page.**

**Done when** ribbons sit correctly on a lineup page, a compose page, a gallery and a player page.

### O4 · The switch, and the drawer

- Wire the existing `overlay` key: `overlay.js` reads it at start and subscribes to `chrome.storage.onChanged`,
  so flipping the switch adds or removes ribbons **live, without a reload**.
- Add sub-switches only if wanted: xScore / chance / fixture.
- Then the second half of the approved S7 design: the edge tab into a drawer, showing the gameweek's plan for
  the card you are looking at, with a button that opens Apply **in the app**. Per the design rule, the drawer
  opens Apply; it never writes in the overlay.

**Done when** the popup switch visibly controls sorare.com, and the drawer opens the right gameweek.

### O5 · Proof

- A Playwright fixture page reproducing Sorare's card markup at all four surfaces (real asset URLs, no
  network — served from `e2e/`). Assert the right value, the right band, no duplicates after a simulated
  re-render, clean removal when the switch goes off, and that ribbons never sit over Sorare's own buttons.
- axe-core on the fixture.
- Update `S7-overlay.html` to match what was built, so `npm run design` keeps covering it.
- **Live acceptance** on real sorare.com, which no test can stand in for: lineup, compose, gallery, player
  page, signed out, and with the switch off.

### O6 · The look — one chip that belongs on Sorare's card

*Superseded by O10 (2026-09-29). Its score colour rule and its measured placement carry over; the edge chip, the
anchor escape it needed and the "Show chance of playing" setting do not.*

**Why.** The owner's live look, 2026-09-29, on the compose page ("Select your Defender"), with the real card:

- Our three chips stacked at the card's top-left cover about **a sixth of the card** (roughly 110 x 70 px of 180 x 250),
  including the player's shoulder. Two of them are near-black boxes; the third, "NO ODDS  CRO (H)", says what the
  card already says just below it (the flags, Sorare's own 78/14/8 win-draw-loss bar, "Tue 20:45").
- Sorare's own chips on the same card are **one row each, solid colour, hanging off the right edge**: a gold
  percentage with a crown, and a green "C" (a captain control, so it must stay clickable).
- Two different percentages sit side by side: Sorare's gold 60% and our 74%. Ours counts a substitute appearance
  (`starterOdds + substituteOdds`); theirs looks like the starter chance alone. Same idea, different number, no label.

Restyling **and repositioning** is the top priority: paint alone would not have fixed this card. O6 changes what is
drawn, where it goes and how much room it takes. Identity, numbers, states and the drawer's data stay as they are,
apart from the game fields that go.

**What Sorare draws** (measured 2026-09-29 on a public card gallery, the "19H 06M" and "Best value" chips):

| Property | Sorare's chip |
|---|---|
| Stack | absolute, `top: 8px`, `right: 0` of the card, one chip per row, right-aligned |
| Chip | 18px high, `padding: 2px 4px`, `gap: 4px` (12px icon, then text), radius `4px 4px 0 4px` (square bottom-right) |
| Type | `pressio` (Sorare's own face, already loaded by the page), 14px/14px, weight 400, uppercase |
| Colour | solid token fill, ink `#0e0e0e`; the violet `#7029ff` chip uses white ink |
| Overhang | the chip's right edge sits 6px past the card art |
| Tail | a 4 x 4 triangle under the right edge (`clip-path: polygon(100% 0, 0 0, 0 100%)`), same fill with a `rgba(14,14,14,.6)` layer on top: the fold |
| Score tokens | `--c-score-veryLow #ff5a5a`, `low #ff7e34`, `mediumLow #f0ce1d`, `medium #b6ff1a`, `mediumHigh #25ed36`, `high #00f3eb` |

**What the reference draws** (`SorareInside Ext/ribbon.css`, read for the pattern only, per section 2): one chip
per fact, the whole chip in the score colour, dark ink, the label dimmed to 75% **inside the same chip**,
`pressio` 10px/800, 17px high, stacked on the right edge at `right: -8px` below Sorare's own badges.

**What ours becomes**

1. **One chip, one row.** `X 41` and `74%` are two segments of a single solid chip, in the score colour with dark ink,
   the `X` dimmed. No near-black chip remains, except the deliberate "Sofix / open the app" one.
2. **Nothing about the game.** The opponent, venue, kickoff, difficulty and "no odds" leave the chip, its accessible
   name, and the endpoint's answer. `lib/overlay.ts` stops matching clubs against the board (so the `home.ts` exports
   added for it are reverted) and the tests for them go. Less on the wire, less to keep true.
3. **Where: the top of the card's left edge, hanging 6px off it,** the mirror of Sorare's right-edge chips, with the
   4px fold tucked under on that side. The right band is theirs (the percentage, the "C", the lock, "Best value") and is
   never touched. Their stack differs per card, so placement is **measured on every pass, geometrically** (never by
   their class names): anything of theirs found in our band pushes ours below it. It stays out of the central band of
   the art, where the face is.
4. **A room budget, as a test.** The chip covers **under 6% of the card's area** and none of its centre. The card in
   the screenshot lost about 17%.
5. **Sorare's type and metrics:** `pressio`, system stack as fallback; 18px chip at 14px on a full card, 15px at about
   11px on a small one (a lineup slot or thumbnail: the number alone, no chance segment).
6. **Paint from Sorare's tokens,** read at run time from the page, with the measured hex values as fallback if a token
   is renamed. The cut points are pinned to where Sorare puts its own colour changes (see "to settle").
7. **The other states, same shape and tail:**

| State | Paint |
|---|---|
| Score `X 41` | Sorare score token for 41, dark ink |
| Chance `74%` | white segment, dark ink |
| Not expected to start | light grey score segment (`#d9dde4`), the chance segment `--c-score-veryLow` red |
| Loading | the grey chip at 60%, with the 8px spinner |
| App unreachable / token refused | the one dark chip, `SOFIX`, clickable |

8. **Escape the clip, the reference's way.** Hanging past the edge brings back section 2.4, which O3 avoided by staying
   inside the art: the chip's anchor and one ancestor get `overflow: visible` (`sfx-anchor`, `sfx-anchor-up`), **two
   ancestors at most**, removed again when the switch goes off.
9. **Motion:** the chip slides 4px in from its edge as it appears; none under reduced motion.
10. **One new setting, in the popup: "Show chance of playing"** (on by default). Off leaves the number alone. It is
    the one control that answers "too much" without an update, and it is cheap: the same live storage key path.

**Upgrades considered** (what else would make it better, and where each goes)

| Idea | What it adds | Data | Verdict |
|---|---|---|---|
| **A mark for cards in your plan, and the plan's captain** | Turns numbers into a decision: on "Select your Defender", *these are the ones Sofix picks*. A small mint tick in the chip; a star for the captain | Already published: the best plan's lineups list each card (`starters`, `subs`, `captain`) | **O7, and the most valuable of the lot.** Needs the endpoint to answer plan membership per card |
| **Rank on a pick list** (`#1`, `#2`, `#3` among the cards on screen) | Ranks a long list at a glance | None: the page's own visible cards | **O7**, only where 4 or more ranked cards are on screen |
| **After the game: what he scored** against what Sofix expected | Review without opening the app | Actuals per player (the plan cards have them; the player list does not) | Later |
| **Stale numbers grey out** when the published data is older than a set age or his game is played | Never shows a confident number that is out of date | Publish time, kickoff | **O7**, small |
| **One score-if-he-plays number** in the drawer | Separates form from availability | `mu`, not returned today | Not now |
| **A delta against Sorare's own L10 hexagon** | | | **Rejected:** it mostly restates the chance and reads as a contradiction next to their number |

**Files:** `extension/overlay.css` (rewritten), `overlay.js` (one chip, left-edge placement, the band measurement, the
token read, the anchor classes on and off, the setting), `core.js` (score to Sorare token), `popup.html/js` (the
setting), `frontend/lib/overlay.ts` and its tests (the game fields out), `frontend/lib/home.ts` (exports reverted).

**Tests that change, and why**

- `e2e/overlay.e2e.ts`: "exactly on its card" becomes "hangs 6px off the left edge, covers under 6% of the card, none
  of its centre, and none of Sorare's own chips". The game-chip and "No odds" assertions go. The fixture gains a
  **compose-style card**: a gold percentage chip and a working "C" button on the right, a footer with flags and an
  odds bar, and a wrapper with `overflow: hidden`. The "C" must still be the thing under the pointer, and switching off
  must remove the anchor classes.
- `lib/overlayCore.test.ts`: "same bands as the board" becomes "same cut points as Sorare", with the pinned thresholds.
- `lib/overlay.test.ts`, the route test and `extensionBackground.test.ts`: the game fields and the difficulty matching
  come out of what they assert.
- Contrast: dark ink on every token passes AA by calculation (the worst, red, is about 6:1); axe keeps checking it.
- `S7-overlay.html` redrawn to the one-chip look, and `npm run design`.
- A one-off live comparison on a public sorare.com gallery with stub numbers, our chip beside Sorare's own, at desktop
  and phone width; the throwaway spec is deleted after, as in O5.

**To settle before shipping**

- **The cut points.** A first look at a player page showed a 50 painted like `mediumLow` and a 54 like `medium`,
  which would disagree with the board's `scoreColour()` at 50. Sample Sorare's own hexagons and bars across the range,
  pin where each colour starts, and record it. If the board's bands are off, fixing `scoreColour()` is its own change.
- **What Sorare's gold percentage is,** checked against `starterOddsBasisPoints` on the same player. If it is the
  starter chance alone, decide whether ours keeps counting substitutes or matches theirs (the score already weights it
  either way), and say which in the popup's wording.
- **The left band on other surfaces.** The compose card's left is free; a lineup slot, a gallery card and the player
  page must be looked at for a rarity or season badge there. The measurement handles it, but the owner's live pages are
  the proof.
- **The drawer and edge tab are not in O6.** They are the approved S7 dark panel; say if they should follow.

**Done when** on the compose page, a gallery and a lineup page the chip reads as the same family as Sorare's (same
height and type, same fold), hangs off the left edge without touching a chip of theirs, covers under 6% of the card
and none of its face, passes AA, and every O5 behaviour test still passes with the new geometry.

---

**Built (2026-09-29).** What changed from the plan above, and what was measured on the way:

- **Sorare's colour rule, read from its own public script** (`thresholds-*.js`, football): the first step whose limit
  is `>=` the score: 20 red, 35 orange, 50 yellow, 60 lime, 75 green, above 75 cyan. It matched **all 42 real hexagons**
  sampled across the goalkeeper, defender, midfielder and forward scouting lists (41 and 50 yellow, 53 and 60 lime,
  61 and 75 green, 76 to 96 cyan). Pinned in `extension/core.js` (`scoreLevel`) and `lib/overlayCore.test.ts`, with the
  measured hex values as fallback when the page's `--c-score-*` tokens cannot be read. The chip paints the *rounded*
  score, so the number seen and its colour agree.
- **The board's own `scoreColour()` (`lib/cards.ts`) does not follow that rule.** It steps at 15/30/40/50/65/80/90
  with a blue and a teal Sorare does not use, so a 76 to 79 is green on the board and cyan on Sorare, and its comment
  ("matched to Sorare's own ramp") is wrong. Fixing it changes the My cards page, so it is **its own change**, not
  part of O6.
- **Game fields removed end to end:** the answer is `{ x, p, average }`; the `home.ts` exports added for the difficulty
  matcher are reverted, and the route no longer reads the fixture grid at all.
- **Placement is measured, not assumed:** the strip the chip would take is sampled with `elementsFromPoint` (position
  and size only, never class names), remembered until the card or the page around it changes, and the chip starts
  below anything small of Sorare's own found there. If that would sink past 45% of the card's height it stays put
  rather than cover the face.
- **A wrapper that only clips is let show the hanging chip** (`sfx-anchor`, `sfx-anchor-up`, two levels at most,
  given back on switch-off). A wrapper that scrolls is never touched: the chip stays inside the picture there.
- **Dropped from the plan:** the 4 px slide-in (the position is corrected from measured rectangles, and a moving
  element makes those wrong; the chip fades in instead), and a picture under **48 px** wide gets no chip at all (a
  40 px rarity thumbnail on a real player page took 11% of the picture).
- **New setting:** the popup's **Show chance of playing** (`overlayChance`, on by default).
- **Checked live** on Sorare's public gallery and player page with stub numbers, at 1440 and 390 wide: the chip
  covers 2.3% of a gallery card (the owner's first look lost about 17%), hangs 6 px off the edge, sits 8 px down, uses
  Sorare's own `pressio` font, and had none of Sorare's own chips under it. It scales with Sorare's carousel
  transforms. The compose page itself needs the owner's session, so that layout is proved on the fixture page only.
- **Still open from "to settle":** what Sorare's gold percentage on the compose card is (its public API returns no odds
  outside an open gameweek, so it could not be checked from here), and whether the left band carries a badge on a
  lineup slot. Both are for the owner's live pass.

### O7 · Decisions, not just numbers

**Why.** A number on a card says how good he is expected to be; it does not say what to do. The owner opens
"Select your Defender" to *choose*, and Sofix already knows the answer: its best plan has already put specific cards in
specific lineups. O7 shows that on the card, on the same single chip from O6.

- **Plan mark.** A card that the best plan uses gets a small mint tick in the chip; the plan's captain gets a star. A
  card the plan leaves out shows the plain chip, never a warning. Which lineup it is in goes in the accessible name,
  never on the art.
- **Rank on a pick list.** Where 4 or more cards with numbers are on screen at once (a "Select your ..." list), the
  top three by xScore get `#1`, `#2`, `#3` in the chip. Worked out in the page from what is visible; no new data.
- **Stale grey-out.** When the published gameweek is old (more than a set number of hours) or his game has been played,
  the chip greys and says so rather than showing a confident number that no longer holds.
- **The endpoint's one new answer:** per card slug, `{ inPlan, captain, lineup }` from the best plan's lineups, plus the
  publish time. Small, cached, and read from the same read model.
- **Tests:** a plan-membership case in `lib/overlay.test.ts`; the fixture page gains a pick list of six cards with
  known numbers, asserting who is ticked, who is starred, and that a list of three is not ranked.

**Done when** on the compose page the cards Sofix would pick are visibly the ones ticked, the captain is starred, and
nothing else on the card changed. Not in O7: anything that changes a lineup. Apply stays Check, Draft, Enter, in the app.

*O7 now follows O10: its tick and star go on the new tile.*

**Built (2026-09-29), on the O10 tile.** Where it differs from the text above:

- **The marks sit beside the tile, not in it.** A 15 px white tick (a card the best plan uses), or a gold star in Sorare's yellow
  (its captain), hangs off the tile's top-right corner; a small `#1` / `#2` / `#3` pill sits on its bottom edge. They are drawn in
  the wrapper next to the tile because the tile itself clips its corners, they never answer the pointer, and on a small card
  the tick shrinks to 10 px and there is no rank. Which lineup it is in goes in the tile's name for a screen reader and in the
  hover panel ("In your best plan · All Star · Captain"), never on the art.
- **The endpoint's new answer rides on the player, not the card.** Each entry gains `inPlan`: for the copies of that player in
  the best plan (the first plan only), `{ [card slug]: { lineup, captain } }`; substitutes count as in the plan, never as its
  captain. The extension looks up the card slug of the card it is drawing, so a second copy the plan leaves out stays plain,
  and no extra request is made. A card whose slug the page never named gets no mark, rather than a guess.
- **Grey-out.** The entry also carries `over` (his game has kicked off) and the extension greys on it, or when the numbers
  are more than 24 hours old (`core.STALE_HOURS`; the refresh runs at least three times a day, with gaps up to about ten
  hours). The score loses its colour, the stripe fades, and the driver line reads **Started** or **Old**; the panel says
  "His game has started." or "These numbers are N h old." A number that cannot be dated is not greyed on a guess.
- **Rank, and how it decides it is looking at a pick list.** A list is the full-size cards as wide as the first one under a
  heading that starts "Select your ...", up to the next such heading, and it needs **four or more** with numbers; the best
  three by xScore get `#1` to `#3`. With no such heading on the page nothing is ranked (a gallery never grows a "#1"), and a
  list of three is not ranked. **Known limits:** it ranks the cards *on screen* (plus 300 px), so on a long list the ranks are
  among what is visible and can change as you scroll; and it depends on Sorare's heading being a heading element with that
  text, which only your signed-in page can confirm.
- **Tests:** 4 endpoint (the copy the plan uses and its captain, a substitute, only the best plan, no plan), 2 for a game that
  has started, 5 for the helpers (age and started, undated, top three, ties, the heading), and 3 in the browser (ticks and
  star, ranks and the heading test, grey-out); the fixture gained a "Select your Defender" list of six, a "Select your
  Forward" list of three, and two cards with numbers that no longer hold. 22 overlay tests pass, axe included.

### O8 to O11 · The redesign the owner approved (2026-09-29)

**Why.** The owner's second live look (compose page, "Select your Goalkeeper", Jan Oblak) rated O6's chip "1/10, not
premium". It hung off the card's edge, ran into Sorare's own starting-odds chip so that the two read as one bar (our
89% beside their 90%), and said nothing about what drives the card's score. He set the content by position and
approved a redesign on the design canvas: https://claude.ai/artifact/V8R5Gp4Q1hXLULRZxXMVbq (boards "A · Glass tile
+ Sofix odds row", "Tile and odds row, enlarged", "Midfielder & forward", "Hover: starts / doesn't start", "This week"
and the states board). The canvas is the look to build; this section is what it needs underneath.

**What he approved**

| Piece | What it shows | Where and how big |
|---|---|---|
| **The tile** | The score **if he starts** (a small shirt marks it), then one driver: **FDR** for goalkeepers and defenders, **xG** for midfielders and forwards | Inside the card's top-left corner, 6 px in; 44 × 42 px, about 5% of a compose card and none of the face. Dark glass (blur) with a 2 px stripe of Sorare's colours on top |
| **The Sofix odds row** | Sofix's **win %** and **clean sheet %**, for every position | Directly under Sorare's own win/draw/loss bar, same width, 22 px, the same stripe on top |
| **The hover** | A **Starts / Doesn't start** switch, Starts by default: the score for each and the chance of each; then the drivers (a goalkeeper: difficulty with its five bands, clean sheet with a bar); "updated … ago". No fixture line | A panel beside the card, opened from the tile |
| **States** | Loading (shimmer); **no odds yet**; **doubtful starter** (a red row: shirt and his start chance); **signed out** (a tiny "SIGN IN" tag, the only thing that takes a click); **small card** (the number alone) | The same tile |

**Colours are Sorare's, not the web app's.** The score keeps O6's six-step rule. The FDR uses five of the same tokens:
Very favourite cyan `#00f3eb`, Favourite green `#25ed36`, Even yellow `#f0ce1d`, Underdog orange `#ff7e34`, Big
underdog red `#ff5a5a`, all with dark ink. Win % is lime `#b6ff1a` like Sorare's own win figure; other numbers are
white. The stripe is those five colours. The web app keeps its own colours.

**What this undoes from O6, on purpose.** The chip on the card's edge goes, and with it the overflow escape
(`sfx-anchor`, `sfx-anchor-up`) it needed, because the tile sits inside the art. "Nothing about the game" goes: the
odds come back, as Sofix's own read under Sorare's. The popup's **Show chance of playing** setting (`overlayChance`)
goes, because the tile no longer shows the chance; it appears only as the doubt row and in the hover. O6's score colour
rule and its measured placement (`clearOf`) stay.

**The data, checked on 2026-09-29 rather than assumed**

- **Sorare's public API has every game's odds, for both sides, in any league or national team:** `Game.homeStats` and
  `awayStats` give `FootballTeamGameStats { winOddsBasisPoints drawOddsBasisPoints loseOddsBasisPoints cleanSheetOdds
  threeGoalsOdds }`. Called without a key for Oblak's next games: Slovenia v North Macedonia (Nations League, 29 Sep)
  answered Slovenia 5600 / 2700 / 1700 with `cleanSheetOdds` 1.80, and North Macedonia 1700 / 2700 / 5600 with 4.33.
  `cleanSheetOdds` is a decimal price (1 / 1.80 ≈ 56%). The same call answered **null for the games further out** (3, 6
  and 10 Oct): Sorare fills the odds only in the last few days before a game.
- **Sorare's per-game player stats** (`PlayerGameStats`) include `gameStarted`, `minsPlayed`, `totalScoringAtt`,
  `ontargetScoringAtt`, `bigChanceMissed` and `goals`. There is no xG field.
- **Play % today** is Sorare's `nextClassicFixturePlayingStatusOdds`, starter plus substitute (`publish.py`), else his
  last five games (`forecast.py`). Sorare's odds already separate starter, substitute and not playing.
- **FBref stopped publishing Opta's xG in January 2026. Understat still publishes its own, free and without a key:**
  `https://understat.com/getLeagueData/La_liga/2026` (a gzip JSON answer; it expects `X-Requested-With:
  XMLHttpRequest`) lists each player's season `xG`, `npxG`, `xA`, `shots` and minutes (`time`). It answered 461 LaLiga
  players on 29 Sep (Arda Güler: 1.92 xG in 359 minutes). Understat covers LaLiga, the Premier League, the Bundesliga,
  Serie A, Ligue 1 and the Russian league. Nothing free and official covers MLS, Brazil or national teams.

**Order.** O8 and O9 are data only and change nothing on screen. O10 is the look and needs both. O11 fills the xG line
and needs O9's minutes. Then O7.

#### O8 · Odds for every game your players play

- **Sync** (`sync.py`, `GAMES_FOR`): each game also asks `homeStats` and `awayStats { ... on FootballTeamGameStats {
  winOddsBasisPoints drawOddsBasisPoints loseOddsBasisPoints cleanSheetOdds } }`. It uses the same aliases, so there is
  no extra call.
- **Publish** (`publish.py`): each `PlayerGame` gains `odds: { win, draw, loss, cleanSheet, difficulty, label, bucket,
  source: "sorare" }`, for **the side he plays for in that game** (a national team during internationals, as the
  calendar rule already says). Win, draw and loss are the basis points / 10000. Clean sheet is 1 / `cleanSheetOdds`:
  the price's own chance, with the bookmaker's margin in it, so a point or two high; the hover says where the number
  came from. Difficulty and label use `scoring.difficulty_score` and `scoring.difficulty_label` with his venue: the
  board's own formula and home/away cut points, so a 35 means the same on sorare.com as on /difficulty. A game with no
  odds has no `odds`, never zeros.
- **LaLiga games keep Sofix's own model.** For a LaLiga game the endpoint takes win, clean sheet, difficulty and label
  from the grid (exactly what the board shows) and uses Sorare's only when the grid has nothing. That brings back the
  club matcher O6 reverted (`sideOutlook` in `lib/home.ts`, commit `f023498`), and each answer says which source it used
  (`source: "model" | "sorare"`).
- **Endpoint** (`lib/overlay.ts`, `/api/ext/overlay`): each entry gains `game: { win, cleanSheet, difficulty, label,
  bucket, source } | null` for the game Sorare's card shows, his next one in the gameweek. A double gameweek shows the
  next game; whether the hover also lists the second is decided in O10.
- **Tests:** publish turns Sorare's stats into the block (basis points, the decimal price, the formula, a national-team
  side, missing odds); the endpoint prefers the model for a LaLiga game and falls back to Sorare's; anything unknown
  stays absent.
- **Done when** the endpoint answers Oblak's Slovenia v North Macedonia with win 56, clean sheet 56 and difficulty 35
  "Very favourite" (`sorare`), and an Atlético LaLiga game with the board's own numbers (`model`).

**Built (2026-09-29).** Where it differs from the text above, and what was measured:

- **Win and clean sheet travel as fractions** (0.56, 0.556), like `p`; difficulty stays the board's 0-100. The tile
  rounds them to whole percents.
- **The board's model is used only for LaLiga games** (`laliga-es`, so a Copa del Rey tie between two LaLiga clubs
  never borrows a league fixture's numbers), matched on the side he plays for (`game.team`, else his club), the
  venue and the opponent. A LaLiga game the board has no forecast for falls back to Sorare's odds, then to `null`.
- **Two LaLiga clubs are named differently by Sorare and the board**, checked against Sorare's club list: "Deportivo
  Alavés" (the board says "Alavés") and "Deportivo La Coruña" (the board says "Deportivo"). A two-entry alias table in
  `lib/home.ts` covers them and a test pins both; without it Alavés, the canvas's own example, would have had no
  numbers. The other eighteen clubs match by name once Sorare's club words are stripped.
- **The query cost.** The cards query Sorare rates by complexity went from 6,146 to 10,146 with the four gameweek
  aliases a run asks for (each alias adds about 1,000 for the two stats objects); the keyed limit is 30,000, so a
  run has room for about ten aliases, and a run uses four.
- **Live check** (keyless, read-only, through `card_games`): Oblak's Slovenia v North Macedonia gave win 0.56,
  clean sheet 0.556, difficulty 35.0 "Very favourite"; Türkiye away to Belgium (a national side of Güler's) gave win
  0.18, clean sheet 0.111, difficulty 75.3 "Big underdog"; the games further out gave no odds and no block. The
  payload version stays 6: the new `odds` block is optional, so an older payload reads as "no odds".
- **Tests:** 4 backend (a game's odds for each side, the home/away cut points, a game without odds, a missing or
  impossible clean-sheet price) and 8 endpoint (model for LaLiga, model preferred with Sorare's as fallback, national
  side, no cross-competition borrowing, no odds gives `null`, the two aliases, a double gameweek, the route's answer).

#### O9 · Two scores: if he starts, and if he doesn't

- **History** (`sync.py`, `HISTORY`): each past game also reads `gameStarted` and `minsPlayed` (`... on PlayerGameStats`
  inside `anyPlayerGameStats`), so every game is a start, a substitute appearance or a miss.
- **Forecast** (`forecast.py`) publishes, next to today's numbers:
  - `start`: his score if he starts. Sorare's projection is "if he plays", which for a regular starter is his start
    score; for a player who often comes on, his own started games decide it (smoothed like `_from_form`).
  - `bench`: his score if he doesn't start = the chance he comes on when benched × his score when he comes on. The
    chance comes from Sorare's odds as substitute / (substitute + not playing), else his history. The score comes from
    his own substitute appearances, with a prior when he has few. A goalkeeper who never comes on gets a `bench` near 0,
    and the hover says why ("2% he comes on").
  - `pStart` and `pOn`: Sorare's starter and substitute odds, else his history.
- **The planner does not change.** It keeps today's xScore (chance of playing × score if he plays) until S4's blind
  comparison shows the split is at least as good. O9 only publishes the two numbers for the overlay.
- **Endpoint:** each entry gains `start`, `bench`, `pStart` and `pOn`.
- **Tests:** the split on a recorded history (starts, substitute appearances, misses), the fallbacks, a goalkeeper, and
  that the planner's `x` and the published plans are unchanged.
- **Done when** the endpoint answers two scores and two chances for every player it answers today, and the published
  plans are identical to before.

**Built (2026-09-29).** How it works, and what was measured to set it:

- **His last five games** are read as a start, a substitute appearance or a miss (`sync.history` now keeps
  `started` and `mins`; Sorare answers `gameStarted` 1 / 0 and `minsPlayed` inside `anyPlayerGameStats`).
- **`start`** is Sorare's projection when he is a regular starter (starts at least three in four of the games he
  plays, by Sorare's starter and substitute odds, else by his own games); otherwise it is his own starts, pulled
  towards a typical start by two games' worth. With no start on record it is the projection.
- **`bench`** is the chance he comes on when not starting, times what a substitute scores. The chance is Sorare's
  substitute / (substitute + not playing) when it has published odds, else his own games pulled towards a prior. What
  he scores is his own substitute appearances pulled towards a prior.
- **`pStart` and `pOn`** are Sorare's starter and substitute odds, else his last five games (split the way the prior
  chance of playing is, so the two always add up to the chance the planner already uses).
- **The priors are measured, not guessed** (80 players from 8 LaLiga clubs, 20 Jul to 29 Sep 2026, keyless Sorare
  reads): a start scored 51.0 on average (206 starts); a substitute appearance 41.9 in about 22 minutes (87); an
  outfield player came on in 30% of the games he did not start (201 misses, 86 appearances), a goalkeeper in 1% (72
  games, so the prior is 2%, and a goalkeeper who never comes on gets a `bench` under 1). They only steady a short
  record; a player's own games and Sorare's odds override them.
- **The planner is untouched.** `Forecast` gains four optional fields the planner never reads; a test builds the whole
  payload with and without the roles and asserts the plans and every player's `p` and `x` are identical.
- **The endpoint** answers `start`, `bench`, `pStart` and `pOn` only for a payload that carries them; an older
  payload gets none and the overlay falls back to `x`.
- **Tests:** 6 forecast (a regular starter, a player who often comes on, a goalkeeper, the two chances add up, the
  planner's numbers unchanged, no roles and no game), 1 history parse, 2 publish, 2 endpoint.
- **Found on the way, and fixed separately (2026-09-29):** Sorare returns games not yet played as `PENDING` rows
  (`playedInGame: false`), and `player_weeks` counted every row dated before the gameweek's lock as a game he missed.
  A player's form for a later gameweek therefore included the games still to come as misses, which understated his
  chance of playing wherever form is used (the weeks after the next, and any player Sorare has no odds for). O9's
  fallback chances inherited it. `player_weeks` now skips `PENDING` rows (`DID_NOT_PLAY` still counts as the real
  miss), with two regression tests. It **changes the published plans** for those weeks. Measured on 14 real players
  for a gameweek locking 13 Oct, planned from form: Oblak's chance of playing went from 31% to 89% (he starts every
  game; 4 games to come had counted as misses), Morten Hjulmand 46% to 89%, Rodrigo Hernández 31% to 89%, Arda
  Güler 60% to 89%; players with no games to come before the lock did not move.

#### O10 · The look

- `overlay.css` is rewritten and `build()` / `place()` in `overlay.js` are redone to the canvas: the tile, the odds row,
  the hover panel and the states. `core.js` gains the FDR bucket → Sorare token map; O6's score rule is unchanged.
- **The tile** sits inside the corner. It is still measured against Sorare's own chips (`clearOf`), never goes into the
  card's central band, and only takes the pointer on its own 44 × 42 px so the card still selects everywhere else.
- **The odds row makes room without entering Sorare's DOM.** Sorare's odds bar is found by position and content (three
  percentages right under the card picture), never by class name. A class of ours gives it a 26 px bottom margin (the
  same kind of change as O6's anchor class, given back on switch-off), and the row is drawn absolutely in that room.
  Sorare's kickoff line moves down by that much; nothing is inserted among React's children. No odds bar found → no row.
- **The hover** opens on hover or keyboard focus of the tile, closes on leaving or Escape, starts on "Starts", and
  never writes anything.
- **Retire** the popup's "Show chance of playing" setting and `overlayChance`.
- **Tests** (`overlay.e2e.ts` and its fixture): the tile is inside the art, under 6% of the card, clear of the centre
  and of Sorare's chips; the row sits directly under Sorare's odds bar with the kickoff line still visible and nothing
  overlapped; a card click outside the tile still selects the card; switch-off removes the room class; the hover
  switch starts on "Starts"; each state renders; axe passes. Then redraw `S7-overlay.html` from the canvas, run
  `npm run design`, and update the manual.
- **Done when** the owner's compose page looks like the canvas, nothing of Sorare's is covered, and every earlier
  overlay test still passes.

**Built (2026-09-29).** Checked in Chrome against a stand-in Sorare (19 overlay e2e tests, axe on desktop, with the panel
open and on a phone) and by eye against the canvas. Where it differs from the text above:

- **The endpoint gained two fields O10 needs** (not in O8's text): `pos` (which driver the tile shows) and `at` (when the
  numbers were made, for "updated 11 h ago").
- **A third tile size.** A card under 80 px wide (a bench thumbnail) gets an 18 px tile, not the 24 px one: 24 px was 10%
  of a 56 px thumbnail. The doubtful starter's red row makes its tile 58 px tall on purpose (under 7.5% of a card, off the
  face).
- **Sorare's odds bar is found by what it says** (the smallest box whose whole text is three percentages) **and where it
  sits** (right under the picture, about as wide). It is cached per page change. After the margin class is added the row
  checks that nothing of Sorare's (their kickoff line) sits in the room; if something does, the row is not drawn and the
  bar is given back, so a layout where the margin moves nothing costs the row, never covers their text. A card-sized
  transparent link or an empty box does not count as "something".
- **The panel is on `document.body`, position fixed**, out of every clipping box of Sorare's. It opens on the tile's left,
  or on the card's right when there is no room; a scroll or resize moves it with the tile and closes it only when the tile
  has left the screen. Hover, or keyboard focus, opens it; only **keyboard** focus inside it keeps it open after the
  pointer leaves (a mouse press on its switch does not); Escape closes it and gives the focus back to the tile without
  reopening it.
- **A press on the tile selects nothing** (it opens the panel and is stopped there); a press anywhere else on the card
  still selects it. A small card's number does not take the pointer at all.
- **xG was "xG —" for every midfielder and forward until O11 (built the same day, below)**: the slot, the panel row and the "Not available" note are built and tested with an xG in the answer, but no player has one yet.
- **Retired:** the popup's "Show chance of playing" switch and `overlayChance`, the `sfx-anchor` classes and the code that
  found scrolling ancestors. The only class of ours on a page element of Sorare's is `sfx-room` on their odds bar.
- **`S7-overlay.html` is redrawn** with the extension's own stylesheet linked, so the sheet cannot drift from what ships
  (`npm run design` passes on all twelve previews); the older player-page design, with the panel that is not built, is kept
  as `S7-player-page.html`.
- **A bug the browser run caught:** the wrapper that is measured had an entrance animation with a scale, so it was measured
  mid-flight and the tile settled 1.7 px off. The measured boxes now fade (opacity only) and the tile itself carries the pop.
- **Not checked, and only the owner can:** Sorare's real compose page. The odds bar is found from what it is expected to
  say and where it is expected to sit (the owner's screenshot), not from its real markup, which needs a signed-in page. If
  it is not found the tile still shows and only the row is missing; "Cards recognised here" in the popup does not count
  it, so that is what to look at first.

#### O11 · Player xG

- **Understat** for the six leagues it covers: the season's players from `getLeagueData/{league}/{season}`, one call per
  league per refresh, kept in the read model. Players are matched to Sorare's by name and club, with a short override
  list for the ones that differ (accents, nicknames, a January transfer).
- **His xG for the next game** = his non-penalty xG per 90 minutes (the season so far, pulled towards his position's
  average while his minutes are few) × the minutes he plays when he starts (from O9's history) × how many goals his side
  is expected to score in that game against its own average (Sofix's model for LaLiga, the goals implied by O8's odds
  elsewhere), plus his penalty share if he takes them. It is published per player, and the tile shows it for "if he
  starts".
- **Outside those six leagues** (MLS, Brazil, national-team games) there is no free source. Either an estimate from
  Sorare's own shots and big chances, labelled as an estimate, or nothing. **Decided 2026-09-29: no estimate. The tile says
  "No odds" where there is no xG.**
- Understat has no official API, so be polite: one call per league per refresh, a clear user agent, nothing live from
  the extension. If it changes or goes away, the tile says "No odds" rather than show an old number.
- **Tests:** the matching (an accented name, a club change), the formula on recorded numbers, and a player Understat
  doesn't cover.
- **Done when** the midfielder and forward tiles show a real xG for players in the six leagues.

**Built (2026-09-29).** Where it differs from the text above, and what was measured:

- **Split between the job and the app.** The job (`app/sources/understat.py`, `app/sorare/xg.py`) turns Understat's numbers
  into, for each midfielder and forward it can name, the xG of one game he starts in an *average* game for his side:
  `{ np, pen, team }`, where `team` is his team's own average xG per game so far (Understat's team history). The endpoint
  scales it to the game: `np` x (his side's goals in that game / `team`), clamped to half and double, plus `pen`. His side's
  goals in the game are the board's `xg_for` for a LaLiga game and, elsewhere, what Sorare's clean-sheet prices imply
  (`goalsFor`, new in O8's odds block: the chance the other side keeps a clean sheet is e^-goals, so a price of 4.33 means
  1.47 goals). A national-team game is the club rate unscaled (a club average is no yardstick for a country's goals).
  In effect: his share of his team's xG times the goals expected in this game.
- **The rate.** His non-penalty xG per game, with five games of the position's norm added (0.32 a 90 for a forward, 0.12 for
  a midfielder, **measured** on 29 Sep 2026 over the six leagues: 61 forwards and 102 midfielders with 450+ minutes); his
  penalty xG (xG minus non-penalty xG) pulled hard towards none (ten games' worth); both times the minutes he plays when he
  starts (his last five starts, up to 90, else 80). Under one full game of minutes, or no confident match, there is no xG.
- **Fetching.** One request per league per refresh, only leagues the owner has players in, a clear user agent, one retry on
  a server error, a gzip body read whether or not it is announced as one; 461, 421, 367, 448, 424 and 366 players came back
  live for the six leagues. A league that fails is left out and its players show "No odds": the raw table is not kept, so an
  old number can never stand in.
- **Matching, measured on real squads** (the first 30 of 8 clubs in each of five leagues, 618 midfielders and forwards; the
  lists include reserves Understat never names): 77% have a name match, 55% also have a full game of minutes. Rules, in
  order: an override list by Sorare slug (empty, for names that differ); the full name without accents or letters like
  ø, ß, ł (Understat writes "Sørloth", Sorare "Sorloth"); one name inside the other with two words in common ("Cristian
  Gabriel Romero" and "Cristian Romero"); then, only among teammates and never a keeper or pure defender, a name with one
  word ("Fermín" for "Fermín López", "Mariano Díaz" for "Mariano") or a shortened first name with the same surname ("Javi
  Puado", "Toni Martínez"). Two players with one name are told apart by club or not matched at all. The names that stay
  without a number are mostly players who have not played a full game yet (Julián Álvarez 71 minutes, Gabriel Jesus 19) and
  reserves Understat does not list; Sorare's names that Understat writes differently go on `OVERRIDES` as they turn up.
- **The panel** says "From Understat's season numbers." under the xG row; without a number it says "Not available for this
  player."; the tile's driver line reads "No odds" (the same words as a game nobody has priced, whatever the odds row
  under Sorare's bar says, as the owner asked).
- **Decided (2026-09-29): no estimate outside these leagues.** MLS, Brazil and a player at any other club show "No odds"
  on the tile. For a national-team game, a player at a covered club has his club rate; one at an uncovered club has nothing.
- **Tests:** 8 for the reader (parsing strings, team averages, the season, one request per league, a gzip body, one retry,
  a failed league left out, an answer that is not league data), 16 for matching and the rate (accents, containment, same-name
  players, overrides, one-word and nickname matches, forwards/keepers, the formula on recorded numbers, penalty takers,
  minutes from starts only, no confident match), 2 for the job (one call per league the owner plays in; nothing when
  Understat is down), 2 for publish (his xG on the player, plans unchanged) and 4 for the endpoint (the board's goals, Sorare's
  implied goals with the clamp, unscaled cases, absent).

**Not in O8 to O11:** writing to Sorare (Apply stays in the app), changing the planner's model (that is S4), and the
web app's colours.

---

## 5 · Risks

| Risk | Handling |
|---|---|
| Sorare changes its DOM | We key off asset URLs and `alt`, never their classes. Worst case the ribbon *disappears*; it cannot break their page |
| Sorare changes its asset URL shape | Same — and the popup should report "0 of N cards matched", so it is visible rather than silent |
| A gallery of 200 cards stutters | Read/write batching plus `IntersectionObserver` |
| We cover one of their controls | `pointer-events: none`, and a fixture test asserting their buttons stay hittable |
| `overflow: visible` breaks their scroll area | Two ancestors maximum, exactly as the reference does |
| Someone else's CSS in a public repo | Re-implemented in our own tokens and names (section 2, "what we do not take") |
| Sorare renames its `--c-score-*` tokens (O6) | Measured hex values as fallback: the chip keeps its colour, it just stops following their theme |
| The overhang lands on a surface that clips it (O6) | `sfx-anchor` on two ancestors at most, removed with the switch; a fixture card with `overflow: hidden` proves it |
| Their chips grow and ours covers them, or covers the art (O6) | Placement measures the band on every pass; a fixture test asserts no overlap, that their "C" stays clickable, and a room budget under 6% |
| Unplayed games counted as misses in a player's form (found in O9, predates it) | Fixed 2026-09-29: `player_weeks` skips `PENDING` rows; `DID_NOT_PLAY` still counts; two regression tests. Moved the form-based plans, see O9 |
| The two odds objects per game raise the cards query's complexity (O8) | Measured: 6,146 to 10,146 of a 30,000 limit with four aliases; recheck if a run ever asks for more than about ten gameweeks |
| Sorare fills a game's odds only in its last few days (O8) | The tile says "no odds" and no row is drawn; LaLiga games further out still have Sofix's model |
| A clean-sheet price carries the bookmaker's margin (O8) | Shown as the price's own chance and labelled as coming from Sorare's odds; revisit if Sorare exposes the other side |
| The room made under Sorare's odds bar disturbs their layout (O10) | Only a margin class on their bar, given back on switch-off; the row is ours and absolute; a fixture test keeps the kickoff line visible |
| The tile taking the hover blocks the card's own click (O10) | Only the tile's 44 × 42 px takes the pointer; a fixture test clicks the card elsewhere and checks it still selects |
| Understat changes its data or goes away (O11) | One call per league per refresh, nothing kept: on failure the tile says "No odds", never an old number; the reader is tested against the shape seen live on 2026-09-29 |
| A player Understat and Sorare name differently gets no xG, or the wrong one (O11) | Unique-among-teammates rules and no guessing between two candidates; `OVERRIDES` in `app/sorare/xg.py` for the rest; wrong is worse than none |

---

## 6 · Order, and what it costs

O1 -> O2 -> O3 are strictly sequential: identity feeds numbers, numbers feed pixels. O4 and O5 can overlap.
O6 comes after O5 and **before** the owner's live pass, so that pass looks at the final chip once. It removes data
(the game fields) rather than adding any. O7 needs one new answer from the app: plan membership per card.

O8 and O9 are data only and can land before any pixel changes; O10 needs both; O11 needs O9's minutes; O7 follows
O10. None of it costs anything: Sorare's public API is already in use, Understat needs no key, and no paid service is
added. The read models grow by a few numbers per player and per game.

The shortest honest path to something on screen is **O1 + O2 + O3**. O3 is the phase holding the real unknowns,
because it is the one negotiating with someone else's live DOM.

**Not in this plan:** anything that writes to Sorare from the overlay. Apply stays Check -> Draft -> Enter in
the app, three separate presses. The overlay reads and draws, nothing else.
