# Sorare inside Sofix — plan and tracker

**Reconciled 2026-09-27 against merged `main` (`8c4ff20`).** Use the [manual](user_manual.md) for operation and
[research report](research_report.md) for risks.

Status: ✅ implemented · 🚧 proof/acceptance pending · ⬜ open.

**The open boxes below are scheduled in [plans/roadmap.md](../plans/roadmap.md) (2 Oct 2026):**
- S4: batches 1 and 3
- S6: step 0.1
- S7: steps 0.2 and 1.4, and batches 6 and 7
- S8's calibration: batch 5
- S9: batch 7

## Fixed decisions

| Topic | Decision |
|---|---|
| Scope | LaLiga clubs plus their Sorare-covered European games; one owner |
| Public data | Sorare public GraphQL/read-only key in cloud refresh |
| Private actions | Existing signed-in Sorare session in local Chrome extension |
| Saving | Check → Draft → separately Enter; nothing automatic |
| Storage | Neon batched current models plus retained pre-lock forecasts |
| Rewards | Cash/essence separate, never converted |
| Calendar | Sorare games/cutoffs decide eligibility; date-map but never equate GW numbers |
| Design | White app; dark contextual overlay; no copied wordmark |

## Overview

| Phase | Theme | Status |
|---|---|---|
| S0 | API/rule discovery | ✅ |
| S1 | Cloud foundation/status | ✅ |
| S2 | Home/gameweek/optimizer | ✅ |
| S3 | Public sync/freshness | ✅ |
| S4 | xScore model | 🚧 recording/replay done; fitted model open |
| S5 | My cards/Players | ✅ |
| S6 | Apply | 🚧 built; live acceptance open |
| S7 | Overlay | 🚧 built; contract hardening open |
| S8 | Predicted vs actual | ✅ initial replay |
| S9 | Hardening/retire SorareExt | ⬜ |

## S0 — discovery ✅

Published SDL was reviewed because runtime introspection is disabled. Public-key queries can read rules/rewards,
cards by username, scores/projections, gameweeks/games, squads, values and past leaderboards under rate/complexity/
depth limits. Private future lineups/mutations require the owner's browser session.

Safe mutation path:

- `previewSo5Lineup` returns feedback/bonuses without writing;
- `createOrUpdateSo5Lineup(..., draft:true)` saves but does not enter;
- `confirmSo5Lineups` enters;
- read current lineups first to avoid duplicates/respect caps.

Edge rules: filter passed cutoffs; explain sealed/for-sale/in-offer/used exclusions; distinguish bonus thresholds from
hard caps; respect track-specific rarity/slots/substitutes/locks; aggregate double GWs as best-game behavior; use
Sorare games, never LaLiga matchday, for eligibility.

## S1 — foundation ✅

- [x] Public sync in scheduled refresh, no home PC.
- [x] Neon published state plus explicit fresh/waiting/stale/error status.
- [x] Control shows cards/competitions/projections/scores/retention.
- [x] Public/cloud path independent from extension/session.

## S2 — product and optimizer ✅

Home summarizes lock, playable cards, best plan, reward chance, expected separate essence/cash, replay and collection
constraint. `/play` expands every lineup/evidence.

Planner uses seeded beam width 120 and 3,000 draws; enforces slots/caps/in-season/rarity/club/card/player uniqueness,
bonuses, captain and substitutes. Repeated randomized whole-week searches are ranked on normalized cash + essence,
then filtered for at least 20% card-set difference; up to five plans are published. Cutoffs come from current tables
or comparable history. The seed makes identical input reproducible.

One date window drives all pages. A Sorare-only week does not make football jump; a football-only week does not invent
a Sorare contest.

## S3 — sync ✅

- [x] Gameweeks/fixtures/leaderboards/rules/rewards/comparables.
- [x] Collection, exclusions, duplicates, eligible tracks.
- [x] History, conditional projection and play odds.
- [x] LaLiga squad index: one competition + one call/club per refresh.
- [x] Defensive references/payload versioning and pre-lock `sorare_forecasts`.

Payload version is 5 at review. Cards/Players/value are latest-sync snapshots, not historical reconstruction.

## S4 — xScore 🚧

Current heuristic: last-five smoothed play/conditional score; replace with Sorare projection and starter+sub odds when
available; multi-game chance of any appearance plus best-of-two uplift; `xScore=P(play)×conditional score`; common SD
17.6. Source/history/range are published.

- [x] Capture pre-lock predictions and post-game actuals.
- [x] Show player/lineup replay.
- [ ] Accumulate enough scored weeks and declare train/test split.
- [ ] Fit availability/score candidates using pre-lock inputs only.
- [ ] Blind-compare with Sorare projection/current heuristic; ship only with evidence.

## S5 — Cards and Players ✅

- [x] `/cards`: usable collection, distinct-player/duplicates, folded exclusions, URL filters/sort, form/play/tier.
- [x] `/players`: cached LaLiga index, local search/filter, conditional projection, Limited valuation, owned flag and
  improvement over fifth-best owned same-position card.
- [x] Subnav/home links, tests, browser/design checks.

Production index is `laliga-es`, read club by club: Sorare prices a Limited in-season card as `eurCents` and
will not return `activePlayers` on the clubs list. A schema mismatch leaves the index empty rather than failing a
run. The E2E fixture now holds only LaLiga clubs.

## S6 — Apply 🚧

- [x] Carry leaderboard/card/slot/captain/sub fields.
- [x] Read account/current entries on open; reject stale/past/locked/mismatched plans.
- [x] Show every entered/draft lineup at the top of the selected GW on Home and Play, including timeline-only weeks.
- [x] Show Sorare preview feedback/errors/bonuses/costs.
- [x] Dedicated Draft press and separate Enter confirmation.
- [x] No write control without extension/tab/account preconditions.
- [x] Fake-Sorare E2E: the three presses, Sorare's refusal in its own words, and what it already holds, all
  driven through a stubbed `chrome.runtime.sendMessage` (`frontend/e2e/apply.e2e.ts`).
- [ ] Real owner test: Check, Draft, update/undo and safe Enter; document rejection/session recovery and fees.

## S7 — overlay 🚧

- [x] Card ribbon (xScore, chance of playing, the game) by card/player slug; cards found by picture address, never by
  Sorare's class names (`extension/core.js`, `overlay.js`, `overlay.css`; app side `lib/overlay.ts`, `/api/ext/overlay`).
- [x] Plan drawer (edge tab) opens Apply in Sofix and never writes (`extension/drawer.js`).
- [x] 15-minute session cache, change/six-hour check-in, popup switch that acts live, cards-recognised count.
- [x] Fake-Sorare E2E (`frontend/e2e/overlay.e2e.ts`): every card size, every state, no doubles on re-render, the
  switch, Sorare's own buttons stay hittable, axe. Card-finding also checked on real public sorare.com pages.
- [x] O6 restyle: one solid chip on the card's left edge in Sorare's own colours, no game detail, clear of Sorare's own
  chips (owner's compose-page screenshot, 2026-09-29). Rejected the same day; its look is superseded by O10.
- [x] O8: odds for every game his players play, from Sorare's own game odds (any league, national teams); LaLiga games
  keep Sofix's model. Built and checked live 2026-09-29; nothing shows on screen until O10.
- [x] O9: two scores, if he starts and if he doesn't, from Sorare's starter/substitute odds and his started games
  (display only; the planner is unchanged until S4). Built 2026-09-29; priors measured on 80 LaLiga players.
- [x] O10: the approved look (design canvas, 2026-09-29): a glass tile inside the corner (score if he starts, then FDR
  or xG), a Sofix win / clean sheet row under Sorare's odds, a starts / doesn't-start hover, Sorare's colours. Built 2026-09-29 and checked against a stand-in Sorare; live check on Sorare's own pages is open.
- [x] O11: player xG from Understat (big-five leagues and Russia); elsewhere no estimate ("No odds", the owner's call). Built 2026-09-29; 77% of real midfielders and forwards have a name match.
- [x] O7: plan/captain marks, rank on a pick list, stale grey-out, on the O10 tile. Built 2026-09-29; Sorare's real "Select your ..." heading is unchecked.
- [ ] The board's `scoreColour()` steps differ from Sorare's (measured 2026-09-29); fix as its own change.
- [ ] Player panel (range, history, value, plan membership): designed in S7, not built, not in `plans/overlay.md`.
- [ ] Account matching: numbers are gated by the extension token, not by the signed-in Sorare account.
- [ ] Payload-version negotiation and live current-layout owner acceptance (lineup, compose, signed out).

## S8 — replay ✅ initial

- [x] Retain pre-lock player forecasts; attach actual without overwrite.
- [x] Compare submitted lineup to original centre/range and reward needed/won.
- [x] Surface on Home/Play.

Next: calibration by source/position/competition with adequate samples and correlation analysis.

## S9 — hardening ⬜

- [x] Merge integration landed at `8c4ff20`.
- [x] Fix one Sorare GW spanning multiple LaLiga rounds (duplicate picker and wrong cross-page round). Done 2026-09-28
  (`lib/weeks.ts`, `pageWeeks`; see PLAN.md).
- [ ] Add fake-Sorare security/contract E2E.
- [ ] Measure reward calibration/correlation.
- [ ] Complete live Apply/overlay acceptance and recovery docs.
- [ ] Retire legacy SorareExt only with coverage/rollback proof.
- [ ] Recheck API/asset terms before non-private use.

## Design evidence

Phase HTML previews remain under `docs/sorare/design/` and `npm run design` validates them. They are historical design
evidence; the implemented UI and [manual screenshots](user_manual.md) are authoritative.
