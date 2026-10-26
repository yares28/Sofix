# Difficulty: all competitions

Requested 26 October 2026: move the competition selector to the right of the Difficulty hero, use competition icons,
and add All. The owner confirmed all seven competitions: combine each club's domestic and European games in one row.
Rank the best 40 clubs for the selected horizon/lens. Preserve the hero, fixture grid, run cards, matches and picks;
hide the standings card in All and let Expected points span its space. Ten clubs per page. Individual competitions
keep their existing behavior. Switching, reloads and cold bookmarks preserve calendar dates, horizon and lens.

Design: Sofix's white surfaces, a compact icon strip aligned right in the existing hero, wrapping on phones.
Selection and focus make the active competition clear; existing entrance and control motion respect reduced motion.

Implementation: combine published forecasts in the refresh job, resolve actual club identities before merging,
bucket games by Madrid calendar week and retain fixture competition/source links. No extra upstream calls, database
migrations or invented forecasts. Missing sources are disclosed. Finished games stay visible but leave future totals.

Acceptance: regression tests first for duplicate clubs and fixture IDs across sources, date boundaries, double games,
missing versus zero, partial coverage, top-40 ranking and navigation. Run repository checks, board/league/mobile
browser specs, production-build click navigation and real-data Chrome screenshots at 1440 and 390 px. Record evidence here.

Evidence, 26 October: seven published source snapshots contain 184 club entries; 31 reviewed domestic/UEFA joins yield
153 unique clubs. The combined season is 2.64 MB, so publication uses 30-club blocks and the server sends only the chosen
window (five-week local RSC response: 514,616 bytes). A missing block fails visibly instead of silently dropping clubs.
The existing bootstrap also initializes All from saved forecasts during the source-refresh cooldown, under its writer lock.
Club and fixture identities, Madrid's daylight-saving boundary, zero versus missing, multiple games, finished-game totals,
top-40 ordering, cached-block reconstruction and missing-block handling have regression tests. Desktop and phone checks
in the owner's Chrome used real published snapshots; all seven competition images loaded and neither width overflowed.
Double-game rows expand to keep both tiles visible. The final integrated production build passes all 66 board, All,
European, domestic-league and mobile browser checks, including real click navigation, reload and a closed original tab.
`node scripts/check.mjs` passes (ruff format/check, mypy, pytest, OpenAPI export, API types, eslint, typecheck, vitest).
The full 291-test browser run was also exercised: four board/test failures were corrected and passed on rerun; the
existing Lineups accessibility check still reports two colour-contrast violations outside this change. No claim that
the entire browser suite passes. The owner's main checkout has unrelated unfinished work, so it is preserved and the
integrated local preview runs on port 3015 using a separate copy of the real blocks. No schema migration is needed.
