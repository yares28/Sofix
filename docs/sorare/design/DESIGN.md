# Design language (approved 2026-09-21)

The owner approved `S0-competitions.html` (the Play page) as the look for every new page, the sorare.com
overlay excepted (that one copies SorareInside, see S7). Open that file next to this guide: it is the reference
implementation, and every value below comes from it.

## Principles

1. **Real data, even in previews.** Build previews from live API data and Sofix's own predictions.
   Never placeholder numbers; if a number doesn't exist yet, the element isn't shown.
2. **Decision first.** Top to bottom: the one thing to do (hero), a summary strip, every option,
   then secondary things folded away (e.g. "Not playable · 5").
3. **One hero number per view** (≥ 48 px). Everything else steps down: 40 → 34 → 22 → 14 → 12 px.
4. **Few words.** Labels are 11–12 px muted; numbers carry the page. No sentence where a number and a
   label will do. Explanations live in tooltips, disclosures and the sheet, not on the page.
5. **Colour has one job each.**
   - Green (`--good`) = a good chance or a reward won. Lighter green or grey = less likely.
   - Foil gold / foil red = the Limited / Rare rarity. It replaces rarity text labels.
   - FDR bucket colours = fixture difficulty, taken from the board, never re-derived.
   - Text is always ink (`--ink`, `--ink-2`), never the data colour.
6. **Cash and essence are shown side by side and never converted.** Essence takes the rarity's colour.
7. **Premium depth, calm motion.**
   - Soft layered shadows and a faint radial glow tinted by context (gold for Limited, red for Rare).
   - A foil shine that sweeps on hover.
   - Numbers count up in 700 ms, rings fill in 1 s, cards rise in with a 45 ms stagger, switch knobs slide in 350–450 ms.
   - `prefers-reduced-motion` turns all of it off.
8. **Say why when something is missing.** A locked competition shows its reason ("Needs a Rare goalkeeper").
   An empty state shows what would unlock it.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` / `--surface` | `#fbfbfd` / `#fff` | page / cards (same as the board) |
| `--ink`, `--ink-2`, `--ink-3` | `#1d1d1f`, `#6e6e73`, `#86868b` | text; `--ink-3` decorative only |
| `--track` | `#ececf0` | segmented-control and timeline tracks |
| `--good`, `--good-2`, `--good-track` | `#1f7a4f`, `#5cc58d`, `#d3f2e1` | meters, rings, "won" chips |
| `--low`, `--low-track` | `#aeaeb2`, `#f1f1f4` | meters under 20% |
| `--f-lim` | `linear-gradient(145deg,#fff3c4,#f7c948 38%,#d99a0b 62%,#ffe08a)` | Limited foil |
| `--f-rare` | `linear-gradient(145deg,#ffd6cf,#f0594c 40%,#b3261e 66%,#ff9e94)` | Rare foil |
| radii | 28 (hero, sheet 30) · 22 (cards) · 16 (inner) · 12 (buttons) | |
| `--shadow-card` | `0 0 0 1px rgba(0,0,0,.04), 0 2px 4px rgba(0,0,0,.02), 0 12px 32px rgba(0,0,0,.05)` | resting cards |
| `--shadow-lift` | `…0 8px 18px rgba(0,0,0,.06), 0 24px 48px rgba(0,0,0,.08)` | hover |
| `--ease` | `cubic-bezier(.3,.7,.2,1)` | all motion |
| type | SF / Inter; titles −0.03 em tracking; big numbers proportional, columns `tabular-nums` | |

Meter thresholds: ≥ 50% `--good` · 20–49% `--good-2` · < 20% `--low`.

## Components (all in the reference file)

- **Page head:** `h1` 40 px bold with one muted line under it (dates, lock time, a "in N days" pill; a pulsing
  green dot when live). Switches sit on the right.
- **Foil chip:** 16×22 px card with the rarity foil, a 1 px inner edge and a hover shine. A `.lg` 22×30
  size, plus a `.stack` variant (second card behind) for titles.
- **Rarity switch:** segmented track with two foil chips, name and card count; a white knob slides between them.
- **Gameweek timeline:**
  - Items in a `--track` pill, each with a status dot (grey = done, pulsing green = live, blue = next), a date
    line and the essence won or expected.
  - Breaks are hatched and not clickable.
  - Arrow buttons at both ends; ← / → keys move it; on phones it scrolls and centres the selected item.
- **Hero** (28 px radius, three columns, stacks on phones):
  - eyebrow (12 px uppercase), foil-stack and name at 30 px;
  - a 132 px ring meter holding the one hero number;
  - a 40 px secondary number with a range bar (bad → good band, a tick for "score needed", a dot for the
    prediction or a blue dot for the actual result);
  - reward chips;
  - a fan of the real Sorare card images with score ribbons and the captain marked;
  - a primary black button plus a soft grey one.
- **KPI strip:** one card, five tiles, divided by 1 px lines; label 12 px muted, value 22 px.
- **Option card** (competition):
  - 5 px foil edge on the left, name and mode, a 34 px value with a small label;
  - a 6 px meter, a stack of avatars and one pill;
  - lifts on hover and opens the sheet.
- **Folded list:** `<details>` card, "Not playable · N", two-column rows with a reason on the right.
- **Empty state:** big title ("One Rare goalkeeper away") beside foil slot cards; the missing slot is outlined with "+".
- **Sheet:**
  - blurred scrim; 30 px panel (a bottom sheet on phones) with a sticky header and lineup tabs as a segmented control;
  - a summary card (ring, number, range, rewards, Apply);
  - a grid of card art with a 3D tilt on hover, SorareInside-style score ribbons
    (`s9 ≥ 70`, `s7 ≥ 55`, `s5 ≥ 40`, `s3 ≥ 25`, `s1` below, `s0` unknown);
  - fixture line (opponent crest, H/A, Madrid kickoff, FDR dot), number rows, subs, ticked rules and a
    rewards disclosure.

### Added by the home page (S2, `S2-home.html`, built in `frontend/components/home/`)

- **Bento tile:** 22 px radius; a 17 px title that is the link, stretched over the whole tile, a muted meta beside
  it and a chevron that slides on hover. One 34 px number per tile, name on the left, number on the right.
- **Waiting tile:** a Sorare tile whose data comes with a later phase. A dashed outline shape and one line
  saying what fills it. Never a placeholder number.
- **Mosaic:** every club's next five games as 11 px cells in the board's difficulty colours, easiest run first.
  Played games are hatched and a double gameweek gets a dot.
- **Page hero number** (56 px): the time to act (days to kickoff, later the Sorare lock), the games done while a
  gameweek is on, the shocks once it's played.
- **Phones:** a bottom tab bar (the installed app has no browser bar), rendered outside the top bar.

## Layout

- Max width 1240 px, 20 px side padding (16 px on phones).
- Breakpoints: 1100 px (hero 2 columns, grid 2 columns, KPI 3 columns) and 700 px (single column, sheet
  becomes a bottom sheet, timeline arrows hidden).
- No horizontal page scroll; only the timeline scrolls.

## Accessibility

- Segmented controls use `aria-pressed`; meters and range bars carry an `aria-label` with the numbers.
- `:focus-visible` shows a 2 px accent ring. The sheet is `role="dialog"`, closes on Esc and returns focus.
- Images from Sorare and football-data.org load with `referrerpolicy="no-referrer"`.
