# Plan · the sorare.com overlay

Sofix's numbers, drawn on Sorare's own pages. Written 2026-09-29.

**Why this plan exists:** the popup has had a "Scores on sorare.com" switch since the first version. It writes
`overlay` to `chrome.storage.sync` and nothing reads it. The feature behind it was never built. This is the
build.

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

---

## 6 · Order, and what it costs

O1 -> O2 -> O3 are strictly sequential: identity feeds numbers, numbers feed pixels. O4 and O5 can overlap.

The shortest honest path to something on screen is **O1 + O2 + O3**. O3 is the phase holding the real unknowns,
because it is the one negotiating with someone else's live DOM.

**Not in this plan:** anything that writes to Sorare from the overlay. Apply stays Check -> Draft -> Enter in
the app, three separate presses. The overlay reads and draws, nothing else.
