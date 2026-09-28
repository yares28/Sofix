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
| O3 ribbon | `extension/overlay.js`, `overlay.css` |
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

**Next: [O6](#o6--the-look--a-chip-that-belongs-on-sorares-card), the restyle.** The ribbon works but does not
look like it belongs: its label and chance chips are near-black boxes set inside the art, where Sorare's own chips
and the reference's are solid colour, hanging off the card's right edge. Doing O6 before the owner's live pass means
that pass judges the final look once, instead of twice.

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

The approved S7 design and our data agree on this. Per card, in priority order:

1. **`X 53`** — xScore (`PlayCard.x`), the headline. Colour-banded on our own scale.
2. **`88%`** — chance of playing (`PlayCard.p`). Greyed inset-ring treatment when it is low.
3. **Detail ribbon** on large surfaces only: opponent, venue and its difficulty (`ATL (H)`), from the fixture
   the board already computes.

States, in Sofix's plain language — never an optimistic blank:

| State | Ribbon |
|---|---|
| Numbers ready | the value, colour-banded |
| Not signed in to Sofix, or app unreachable | dark chip, "Sofix" — clicking opens the app |
| Player outside LaLiga | "no odds" — we say so rather than show a number we do not have |
| Still loading | translucent chip + spinner |
| Card we do not recognise | nothing at all — never a broken chip |

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

### O6 · The look — a chip that belongs on Sorare's card

**Why:** what O3 shipped reads as a black box. The `X` label (`#0b1711`) and the whole chance chip (`#101012`) are
near-black, and the stack sits inset at the art's top-left. Sorare's own chips and the reference's are **one solid
colour each, dark type, hanging off the card's right edge with a folded tail**, so they look wrapped around the card.
O6 makes ours the same family. It changes paint and placement only: identity, numbers, states and tests of behaviour
stay as they are.

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
per fact, the whole chip in the score colour, dark ink, the label dimmed to 75% **inside the same chip** rather than
in a box of its own, `pressio` 10px/800, 17px high, a smaller 14.5px "detail" chip underneath, stacked on the right
edge at `right: -8px` below Sorare's own badges.

**What ours becomes**

- **One chip per fact, solid fill, dark ink.** `X 53` is one chip in the score colour with `X` dimmed, not a black
  label next to a coloured number. No near-black chip remains except the deliberate "Sofix / open the app" one.
- **Right edge, hanging off it**, with the 4px folded tail tucked under, stacked **below Sorare's own badges**. Their
  stack height changes per card (none, a lock, "Best value"), so it is measured, not assumed: ours starts under the
  lowest thing of theirs drawn in the card's top-right band, found geometrically (never by their class names).
- **Sorare's type and metrics:** `pressio` with our system stack as fallback. Full tier 18px chips at 14px; compact
  tier a single 15px chip at about 11px. Exact compact numbers are set by eye on a real lineup slot.
- **Score paint from Sorare's tokens,** read at run time from the page (`getComputedStyle(:root)`), with the measured
  hex values above as fallback when a token is renamed. The meaning stays ours: the cut points are pinned to where
  Sorare puts its own colour changes before anything ships (see "to settle" below).
- **The other chips, proposed:**

| Chip | Paint |
|---|---|
| Score `X 53` | Sorare score token for 53, dark ink |
| Chance `PLAY 88%` | white chip, dark ink; `--c-score-veryLow` red when he is not expected to start |
| Score when he is not expected to start | light grey chip (`#d9dde4`), dark ink: the number is shown, its colour is withdrawn |
| Game `GET (H)`, rated | the board's five buckets painted in Sorare's hues: 1 `mediumHigh` green, 2 `medium` lime, 3 white, 4 `low` orange, 5 `veryLow` red. The word stays the board's label in the accessible name |
| Game outside LaLiga | grey chip, `NO ODDS · ORL (A)` |
| Loading | the grey chip at 60%, with the 8px spinner |
| App unreachable / token refused | the one dark chip, `SOFIX`, same shape and tail, clickable |

- **Escape the clip, the reference's way.** Hanging past the edge brings back section 2.4, which O3 avoided by
  staying inside the art: the chip's anchor and one ancestor get `overflow: visible` (classes `sfx-anchor`,
  `sfx-anchor-up`), **two ancestors at most**, removed again when the switch goes off. Sorare's own badge wrappers
  already measured `overflow: visible`, so on most surfaces nothing needs changing; the anchor is for the ones
  that do clip.
- **Motion:** the chip slides 4px in from the edge as it appears (the tail last); none under reduced motion.

**Files:** `extension/overlay.css` (rewritten), `overlay.js` (placement against the right edge, the badge-stack
measurement, token read, the anchor classes on and off), `core.js` (score to Sorare token, bucket to hue).

**Tests that change, and why**

- `e2e/overlay.e2e.ts`: the "exactly on its card" check becomes "hangs 6px past the right edge, starts below
  Sorare's own badges, and covers none of them"; colour checks move to the Sorare tokens. The fixture gains a
  Sorare-style badge stack and a card wrapper with `overflow: hidden`, to prove the anchor. Switching off must also
  remove the anchor classes.
- `lib/overlayCore.test.ts`: the "same bands as the board" test becomes "same cut points as Sorare", with the pinned
  thresholds written into it.
- Contrast: dark ink on every token and white on the violet one pass AA by calculation (worst is red at about 6:1);
  axe on the fixture keeps checking it.
- `S7-overlay.html` redrawn to the new chip, and `npm run design`.
- A one-off live comparison on a public sorare.com gallery with stub numbers, our chips next to Sorare's own, desktop
  and a phone width; the throwaway spec is deleted after, as in O5.

**To settle before shipping**

- **The cut points.** A first look at a player page showed a 50 painted like `mediumLow` and a 54 like `medium`,
  which would disagree with the board's `scoreColour()` at 50. Sample Sorare's own hexagons and bars across the
  range, pin where each colour starts, and record it. If the board's bands are off, fixing `scoreColour()` is its
  own change, not part of this one.
- **Game-chip hues** (the table above) and **white chance chip vs. violet**: owner's call when the first screenshots
  are in.
- **The drawer and edge tab are not in O6.** They are the approved S7 dark panel; say if they should follow.

**Done when** on a live public gallery and a lineup page our chips read as the same family as Sorare's (same height
and type, same edge, same fold), sit below theirs without covering them, pass AA, and every O5 behaviour test still
passes with the new geometry.

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
| Their badge stack grows and ours covers it (O6) | Placement measures their top-right band on every pass, and a fixture test asserts no overlap |

---

## 6 · Order, and what it costs

O1 -> O2 -> O3 are strictly sequential: identity feeds numbers, numbers feed pixels. O4 and O5 can overlap.
O6 comes after O5 and **before** the owner's live pass, so that pass looks at the final chip once. It touches only
the stylesheet, placement and paint, so it needs no new data and no change to the app.

The shortest honest path to something on screen is **O1 + O2 + O3**. O3 is the phase holding the real unknowns,
because it is the one negotiating with someone else's live DOM.

**Not in this plan:** anything that writes to Sorare from the overlay. Apply stays Check -> Draft -> Enter in
the app, three separate presses. The overlay reads and draws, nothing else.
