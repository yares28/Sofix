# Audit player comparisons

## Requested workflow

Move the five marked analysis sections above the owned-player comparisons: how close, against Sorare, goalkeeper
calibration, written before the lock and match forecasts. Keep the existing replay hero and its statistical rules.
Replace the small-card table with larger real Sorare cards, the actual match sides' crests, and prominent xScore,
Sorare, Actual and Diff. Keep the white, restrained interface and fold check timing into details.

Open on the selected GW (latest locked GW by default). From the player section the owner can choose any retained GW,
all GWs as match-by-match comparisons, or an all-time summary by player. View and GW selection survive a reload,
navigation and reopening the address. All retained player games remain covered, including double GWs, national games,
pending scores, substitutes and DNPs. No extension load or manual data refresh is needed.

Diff means actual minus saved xScore. Summary averages/misses use checked starts, show their sample counts, and never
treat missing, pending or DNP as zero. A real zero remains zero. Forecast source remains explicit. Only exact match
side identities may supply crests; never substitute a player's club for his national team. All-time means retained
history, with coverage named, rather than an invented history before recording began.

## Design

Visual thesis: calm white evidence, larger Sorare art, aligned tabular scores and quiet dividers.
Content: replay hero and analysis first; one player workspace with GW/all/summary controls, concise averages, player
comparisons and optional check detail. No additional decorative panels or repeated timing paragraphs per row.
Interaction: URL-backed view switching without jumping to page top, native GW selection, focus/hover feedback and
native disclosure for check timing; respect reduced motion.

## Acceptance and evidence

Write regressions first for all-history aggregation, missing versus zero, DNP/substitute/pending exclusion from start
averages, source identity and actual game crest identity. Browser acceptance covers the three views, a retained older
GW, cold load, reload/reopened tab, selected-GW navigation, corrections and analytics preceding the player workspace.
Run the Audit and mobile specs, the repository check gate, and inspect real-data screenshots at 1440 and 390 px.
Record real coverage and limitations here before shipping; read models and forecasts must remain unchanged.

## Verification — 11 October 2026

- Test-first evidence: the new aggregation suite failed on the absent implementation; the browser workflow failed
  because the five analysis sections followed the player list. Both now pass.
- `node scripts/check.mjs`: generated API types, eslint, typecheck and the full Vitest suite pass. The three new unit
  cases cover unequal forecast samples, real zero, pending/DNP/substitute exclusion, double games, retained weeks,
  mixed source identity and national-team crests without borrowing the player's club.
- Audit + mobile specs: 30 of 31 passed initially; the player accessibility case found invalid definition-list source
  markup. After fixing it, the four affected history/player/accessibility/mobile cases all pass. No unresolved failures.
  These include a cold page, all three views, older history beyond the timeline, reopening the summary address,
  selected-GW reload/navigation to Sorare vs Sofix, real zero, pending and corrected results, text floors and axe scans.
- Real read-model browser proof on localhost:3002 at 1440 and 390 px: GW21 contains 84 games (49 checked), all-GW mode
  renders all 265 games in five retained GWs (20–24), and summary groups 85 distinct players. No horizontal overflow.
  Crest URLs exist for 509 of 530 game sides; the inspected Málaga/Espanyol and Rayo/Athletic images loaded successfully.
  Unknown crests keep the existing shield fallback. No production database or source write was made.
- Current checked real rows contain no confirmed starts, so real all-time averages correctly remain unavailable.
  Numeric averages, positive/negative differences and zero actuals were verified with deterministic recorded fixtures;
  no historical scores or forecasts were fabricated. Acceptance is met for all retained data, including these gaps.
- Inspected `output/playwright/audit-players-desktop.png`, `audit-players-phone.png`, `audit-summary-phone.png` and
  `audit-analysis-desktop.png`; also captured `audit-all-desktop.png`. The larger cards, prominent scores and actual
  match crests retain the existing white styling. All five requested analysis sections precede the player workspace.
- Web Interface Guidelines pass on `PlayerScores.tsx`, `AuditPlace.tsx`, `AuditView.tsx` and `audit.css`: native controls,
  labelled navigation/select, semantic definition lists, visible focus, lazy dimensioned art, reduced motion,
  URL-backed filters and `content-visibility` for the long list. The source-label markup finding is resolved.
