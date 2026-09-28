# Sofix design language

**Approved 2026-09-21 · reconciled 2026-09-27.** HTML files here are historical phase previews checked by
`npm run design`. The implemented UI and [illustrated manual](../../user_manual.md) are authoritative if they differ.

## Principles

1. One decision/question per surface.
2. Quiet white shell, strong data: near-black type, soft structure, colour only for meaning.
3. One hero fact, aligned support, then evidence/details.
4. Bento composition without boxing every label/value.
5. Honest fresh/waiting/stale/no-game/no-odds/not-signed-in states; missing is never zero.
6. Tabular aligned numbers and explicit units/source/freshness.
7. Motion explains change and respects reduced motion.
8. Sofix stays its own design; dark extension harmonizes with Sorare but copies no wordmark/classes.

## Tokens and type

Implementation CSS variables are authoritative. Canvas is cool white; cards white with 1 px soft border, restrained
shadow and generous radius; positive is deep green, market secondary blue, risk coral/red, attention amber with text.
Rarity colour appears only as card data. Avoid dense text over gradients and fully saturated large surfaces.

Use the app system font stack. Hero numbers may be bold; labels are short/sentence case; body remains readable at zoom.
Reflow instead of shrinking critical text. Numeric columns use tabular figures.

## Layout

- Fluid and centered beyond `--page-max` 1600 px.
- Shared header/week control on every route.
- Ranking/current-table cards stack below 1200 px.
- Reused internals respond to named containers (`ladder`, `gwcard`) rather than viewport alone.
- Mobile keeps decision → evidence → detail order and accessible touch targets.
- Horizontal scrolling is intentional data behavior, never broken page chrome.

## Components

- **Status:** dot/icon plus text; include age/source when trust depends on it.
- **Week selector:** step arrows, centre picker, target/current; date range is common reference while both GW numbers stay distinct.
- **Probability/score:** `%`, fair odds `x.xx`, points; keep conditional score, P(play), xScore and range distinct.
- **Collection:** position shelves, distinct-player vs duplicate counts, folded exclusions/reasons; no flat tiny-card wall.
- **Player search:** lead with squad improvement or owned state, then cached value/projection/form; no fake buy affordance.
- **Planner:** rules/lock/xScore/range/reward evidence; cash and essence separate.
- **Apply:** visible Check → Draft → Enter progress; final action distinct and never automatic/default-focused.
- **Control:** state first, then schedule/history, connections/limits, freshness, setup/install and architecture.
- **Extension:** dark panel/mint accent; stable URL/slug anchors; drawer opens Apply, never writes in overlay.

## Accessibility

- WCAG AA text, visible focus and correct landmarks/headings.
- Native controls first; no clickable divs.
- Colour has text/shape/pattern equivalent; buckets 4–5 retain ring and spoken label.
- Tables keep headers; custom charts expose equivalent text.
- Reduced motion removes count/entrance animation.
- Third-party art never carries unique information alone.

## Preview index

| File | Decision | Status |
|---|---|---|
| `S0-competitions.html` | Rule discovery | Historical evidence |
| `S1-foundation.html` | Always-on/status | Built into Control |
| `S2-home.html` | Initial home | Superseded by v2 |
| `S2-home-v2.html` | Whole-gameweek home | Built/evolved |
| `week-selector.html` | Shared calendar | Built |
| `S3-sync.html` | Sync freshness | Built in Control |
| `S4-xscore.html` | Conditional/P(play)/xScore evidence | Heuristic built; fitted model open |
| `S5-cards.html` | Collection shelves | Built |
| `S5-search.html` | Squad-upgrade search | Built |
| `S6-apply.html` | Three-stage Apply | Built; live acceptance open |
| `S7-overlay.html` | Dark ribbon/drawer (the player panel is not built) | Ribbon and drawer built; live acceptance open |

## Review checklist

- Can the primary question be answered in five seconds?
- Are unit/source/freshness/uncertainty unambiguous and missing truthful?
- Is presentation re-deriving a backend decision?
- Does mobile preserve decision order and keyboard/zoom/focus/reduced-motion behavior?
- Does it still feel like Sofix rather than a generic dashboard?
- If it writes to Sorare, are Check, Draft and Enter unmistakably separate?

