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
it. **Next: O7** (marking the cards in your plan, ranking a pick list, greying stale numbers), then the owner's live
pass on the final look.

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

---

## 6 · Order, and what it costs

O1 -> O2 -> O3 are strictly sequential: identity feeds numbers, numbers feed pixels. O4 and O5 can overlap.
O6 comes after O5 and **before** the owner's live pass, so that pass looks at the final chip once. It removes data
(the game fields) rather than adding any. O7 needs one new answer from the app: plan membership per card.

The shortest honest path to something on screen is **O1 + O2 + O3**. O3 is the phase holding the real unknowns,
because it is the one negotiating with someone else's live DOM.

**Not in this plan:** anything that writes to Sorare from the overlay. Apply stays Check -> Draft -> Enter in
the app, three separate presses. The overlay reads and draws, nothing else.
