# xS versions: the switch between Sofix v0, v1 and v2 (17 November 2026)

The owner picks which xS the app shows, and can change back at any time. This plan builds that switch and Sofix v2.
The design was agreed on the canvas [Sofix xS versions](https://claude.ai/artifact/1V9P9ip6nygK6G34ggVZFx) after
three rounds of comments (17 Nov). Research behind it: `plans/xscore-accuracy.md` (Phases A and V3) and
`docs/xscore-failure-analysis.md`, on the research branch until it merges.

## What the owner asked for (the contract)

- **Three versions, Sofix v1 the default.**
  - **v0:** the formula used before 12 Nov (normal and decisive score mixed by the decisive chance,
    `backend/app/sorare/outfield.py`, `keeper.py`). Live it already exists as `previousSofix` / `previousSofixOn`.
  - **v1:** today's number, his expected points (`sofix` in the score records; `x` / `mu` on cards).
  - **v2:** his most likely final score, the number the user should expect as the final score, decisive actions
    included. Sofix v1 already works it out (`point`, published as `sofixPoint` / `sofixOnPoint`).
  - v3 (normal score switching to the decisive one) stays out until the research's Phase V3 passes. The switch must
    take a fourth row without a redesign.
- **The big number is the score to expect, never a base plus extra.** No "40 + decisive", no "→ +30".
- **The decisive chance is a separate scenario: "27% chance of 79"**, where 79 is the full score if a positive
  decisive action happens (goal, assist, penalty won, last-man tackle, clearance off the line, penalty save, the
  keeper's clean-sheet decisive). It shows **only in detail views**: the sorare.com hover panel, the player page,
  and the line under Home's front card. **Never on a card**: gallery, Players list, Play's plans, Home's fan,
  Lineups, Arcade and the overlay tiles show the number only, in the same chip as today.
- **Hover panel (overlay), v2 layout:** top row = the big number at v1's size, the decisive line small beside it
  ("27% chance of 79", no box, no bar, no star); then the five cells; bottom row = the game on the left, the
  competition icon and the source's freshness ("FF · 4 min ago") on the right, replacing the kickoff time.
- **The switch:** in the top bar beside the theme toggle, "xS v1 ▾". A menu with the three versions, a check on the
  chosen one, and each version's hit rate with a **±7 / ±10 / ±15** toggle. One choice for the whole app and the
  overlay, kept on this computer.
- **Audit: one page for every version.** The top compares all versions (live and replay, starters and substitutes,
  ±7/±10/±15). A version picker opens that version's own page: today's Audit sections, filled with its numbers.
- **Unchanged by the switch:** lineup totals and plans (expected points), rewards, price per point, Targets,
  Scores' actual points.

## What exists and what is missing

| Need | Today | Gap |
| --- | --- | --- |
| v1 per game | `sofix` (score records), card `x` = chance of playing × `mu` | none |
| v0 per game | `previousSofix`, `previousSofixOn` (score records, `publish.py` ~2002) | not on cards or in the overlay payload |
| v2 per game | `sofixPoint`, `sofixOnPoint` (score records only) | not on cards, Players, Play, Home, Arcade, overlay |
| Decisive chance and score | `shape.p`, `shape.dec` in `_split_out`, **only for the owner's players** (overlay rows) | needed for every player a detail view can show |
| Live hit rates per version | `versus.py` judges `sofixPoint` and `previousSofix` against v1 for the version table | ±10 and ±15, per version, starters and subs, in one Audit block |
| Replay hit rates | `frontend/lib/data/sofix_v1_replay.json`: ±7 for v0 (`previousHits`), v1 (`meanHits`), v2 (`hits`) | ±10 and ±15 per version (research step V3.2) |

Two rules to keep while filling the gaps:

- **No made-up numbers.** A player with no v2 number keeps v1's chip until the job publishes it, and a detail view
  with no decisive split shows no decisive line. Never a usual rate.
- **The chip is "if he plays", the start % is beside it.** v1's card chip mixes in the chance he does not play
  (Dmitrović 8). v2's most likely score is his score if he starts; every card already shows the start % next to it.
  For a likely substitute, v2 uses `sofixOnPoint` with the same rule as `sofixOn` today.

## Steps (depth-first: each one ships something the owner can use)

### 1. Publish every version's number with every game

**Done 17 Nov (backend, not deployed):** `publish._versions` adds `startPrev`/`subPrev` (v0), `pDec`/`decIf` and
`subPDec`/`subDecIf` (the decisive scenario) next to `startPoint`/`subPoint` (v2) on every game Sofix v1 worked out,
through `_game_numbers`: the week's players, the market's `fixture` and `next` (every LaLiga player), and the other
leagues' markets. The overlay's `now` rows take `startPoint`/`startPrev` from the frozen record. Frontend type
`XsVersions` (`lib/play.ts`). The Sorare block grows about 60 kB (1.33 → ~1.39 MB, under the 1.6 MB line). Not yet
in the score record: the decisive scenario (the Audit's step 4 adds it if it needs it).

- Backend: everywhere a game's Sofix number is published for a card (`card_games`, the week's `players` rows,
  `_split_out`, the market `next` games, Arcade's LaLiga rows, league squads), publish `v0`, `v1`, `v2` side by side
  and the decisive split `{p, dec}`, for every player Sofix forecasts, not only the owner's.
- Pydantic → OpenAPI → `npm run gen:types` → Zod. Defaults applied after the cache read (memory: Next's cache
  outlives a deploy).
- Measure the payload before and after (`curl -H "rsc: 1"`, AGENTS "Pages"): three numbers and two decisive fields
  per game; keep each client component to the fields it draws.
- Tests first: a published game carries the three numbers and the split; a player with no v2 has none (not v1
  copied in); a substitute's v2 is `sofixOnPoint`.
- **Done when:** the refresh publishes the fields and `node scripts/check.mjs` passes. Nothing visible changes yet.

### 2. The switch and the app's cards

**Done 17 Nov (not deployed):** the choice lives in this browser (`localStorage` `sofix-xs`, set before the first
paint like the theme, `lib/xs.ts` `XS_SCRIPT`) instead of a cookie: pages draw each chip in every version
(`components/XsSwap.tsx`) and one rule in `globals.css` shows the picked one, so pages stay cacheable and switching
costs no request. Wired: gallery, Players, Play's plans and your entered lineups, Home's fan and away-week rows, the
player page (with the v2 decisive line) and Home's front-card line. Below 1200 px the button is the version alone and
the theme toggle moves into its menu (the bar had no room). **Still on v1:** Arcade's cards and Play's Pro windows
(their payloads carry no per-game versions yet), the overlay (step 3). Real data: v2 shows today; v0 needs the next
refresh with step 1's fields.

- `components/XsSwitch.tsx` beside `ThemeSwitch` in `SiteNav`: the button, the menu (three rows, check, hit rate),
  the ±7/±10/±15 toggle. Keyboard and focus like the existing menus; reduced motion respected.
- The choice lives in a cookie (`xs=v0|v1|v2`, default v1) so the server draws the chosen number with no flicker.
  Check this against [plans/cacheable-pages.md](cacheable-pages.md): if pages move to cached renders, the three
  numbers ride in the payload and the chip picks client-side before paint instead.
- One helper `xsOf(game, version)` in `lib/` that every chip uses: gallery (`s5-card-score`), Players
  (`s5-stat` xScore cell), Play's plans (`rc-xs`), Home's fan (`rx-hx`) and lineups, Arcade (`arc-card-score`),
  Lineups. Totals keep `x`.
- Detail lines: player page (`pd-x` with "27% chance of 79" under it; the histogram already shows both humps),
  Home's plate under the front card.
- Hit rates in the menu: from the Audit block of step 4; replay ±7 from `sofix_v1_replay.json` until then.
- Tests first: `xsOf` per version; the cookie's default; a game with no v2 shows v1; the menu's keyboard flow.
  Page specs for gallery, Play, Home, player page; desktop 1440 + phone 390 on the local dev server, every control
  touched (switch, toggle, each version).
- **Done when:** switching changes every card's number and nothing else, on real data, and back again.

### 3. The overlay

**Done 17 Nov (not deployed, extension 0.5.21):** overlay entries carry `xs: {v0, v2}` (the tile's number in the role it
shows) and `dec: {pct, score}` (`lib/xs.ts` `tileVersions`); the app's switch sends `xs-version` to the worker, which keeps
`xsVersion` in `chrome.storage.local`; `overlay.js` draws tiles and the panel in it and redraws on a change. The panel's
head row is the number and, in v2, the small decisive line; its last row is the game, the plan's chip and "FF · N min ago".
The "LaLiga" pill on the panel was the plan's chip (which lineup holds the card), not the competition: it moved down as a
pill rather than becoming a league icon, so the lineup name and captain mark stay. Not checked on sorare.com yet: needs
the deploy, `configure.mjs` and the owner's Chrome.

- The extension learns the choice from Sofix: the page bridge posts it on load and on change (`bridge.js`), the
  worker keeps it in `chrome.storage`, `/api/ext/overlay` takes `xs=` and answers that version's number.
- Tiles: same chip, the chosen number (`overlay.js` tile score).
- Hover panel: the agreed layout (top row number + small decisive line; bottom row game · competition icon ·
  "FF · N min ago"); v1 and v0 keep today's panel with the new bottom row.
- Extension release rules: `node extension/scripts/configure.mjs` after the push (memory: extension release needs
  the main folder; the extension reloads itself).
- **Done when:** on a real compose page in the owner's Chrome the tiles and the panel follow the switch.

### 4. Audit: every version on one page

- Job (`versus.py`, `audit.py`): per version, starters and played substitutes, hits within 7, 10 and 15, live
  (saved before lock) and replay. v0 live from `previousSofix`, v1 from `sofix`, v2 from `sofixPoint`.
- Replay ±10/±15: from the research's step V3.2 when it lands; until then those cells say "Being measured".
- Page: the comparison block at the top (versions × the four columns, ±7/±10/±15 toggle, the one in use marked);
  a version picker (one dropdown) that refills today's sections with that version's numbers. Under 100 cases a
  figure says "too few to tell" (AGENTS `/audit`).
- **Done when:** the Audit shows all three versions' own rates on real data and the picker changes every section.

### 5. Docs and roadmap

- User manual: the switch, what each version means, where the decisive line shows. `docs/how_it_works.md`: v2's
  number and the "never a base plus extra" rule. Roadmap: this plan's steps in "Next up" when the owner orders them.

## Open points to settle while building

- Whether Home's plate line counts as a card (the owner allowed detail views; the plate describes the front card).
- The overlay's competition icon: LaLiga's for a LaLiga game; for a Sorare competition pill (Champion, All Star)
  the Sorare league icon used on Targets, if the panel still needs it.
- v3 joins as a fourth row only after the research's Phase V3 passes.
