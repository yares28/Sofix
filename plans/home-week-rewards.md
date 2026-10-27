# Home selected-GW rewards

Reward-chance/FDR verification: test-first unit regressions pass (13 affected tests); the complete local gate passes;
all seven Home/rewards/mobile browser checks pass, including selected-round FDR values/colours, bottom alignment,
unknown/zero chances, draft exclusion and cold-read geometry. Production build passes. Real cached GW27 in the owner's
Chrome at 1440 and 390 px shows Sofix 29% per lineup, owner chance blank with no entries, Barcelona FDR 14 and Malaga
84 with their backend colours; no overflow. Rewards and fixtures have identical bottom edges on desktop. Mobile stacks
at natural height. Existing per-lineup chance and backend FDR are only reshaped; no server read or polling was added.
Clicking This week from Play on the local production build rendered Home with both chance figures and the FDR header.

Next requested change: show reward percentage for You and Sofix using the same mean essence-or-better chance per
lineup as Play (explicit per-lineup label, unknown distinct from zero, partial forecast coverage). Stretch Rewards to
fill the right column beside the fixtures on desktop, keeping natural stacking on phones. Append each team's selected
round FDR number in its backend-coloured rectangle at the far right of Home's table; preserve blanks, missing forecasts
and every fixture in double rounds. No extra reads, polling or user actions. Acceptance: unit regressions for chances
and selected-round FDR, Home reward browser spec including column alignment and bottom alignment, affected mobile
Home specs, desktop/phone real-data screenshots and the local gate before shipping.

Requested outcome: split the tall table surface into two separate cards in the right column: the existing table,
then your and Sofix's expected and actual rewards for the selected Sorare GW. On small screens they stack after the
fixtures. No extra user action or Sorare tab is required beyond the existing entered-lineup workflow.

Coverage: all entered lineups (excluding drafts) and every lineup in the best Sofix plan; cash, essence by competition
and rarity and XP stay separate; no card-prize row. Expected means the attainable prize at each lineup's projected
score, summed across the GW, matching Play. Actual means checked results, never a prize inferred from a partial score. Missing stays distinct from zero;
partial totals show coverage. Changing week must clear the previous week's figures. Reuse the existing private read
and its saved fallback, refresh and visibility rules without adding polling or a second private request.

Visual thesis: two quiet white surfaces, with the table at its natural height and aligned reward figures underneath.
Content: table, then a Rewards heading with GW and a Play link, then You / Sofix comparisons.
Interaction: existing week navigation updates both; existing lineup refresh updates your rewards; no decorative motion.

Acceptance: regression tests first for aggregation and selected-week UI, delayed cold read, known zero and missing
checks; existing board, Play and mobile specs; desktop/mobile local real-data screenshots; local checks before shipping.
## Evidence, 27 October

Owner correction: remove the Cards row from both sides, replace probability-weighted averages with attainable prizes
for both owner and recommendation, preserve checked results, missing/zero distinctions and cold-read geometry. No new user actions.

Correction verified: regression fails first for known no-prize forecasts, then passes with sparse prize totals; local
gate passes; all three rewards specs and the two affected mobile Home specs pass. Real cached GW27 in Chrome at
1440 and 390 px shows $0 cash, 250 LaLiga Limited essence and 2,000 XP, with no Cards row and no overflow. Screenshots
saved for both widths. Checked historical payouts and their retained-plan matching remain covered by the rewards spec.

- The local gate passed (generated API types, ESLint, TypeScript and the complete unit suite); the production build passed.
- The broad board/Play/mobile run passed 60 of 63 checks. The new test initially undercounted the existing season archive's
  two storage reads; corrected to those two plus the entered-lineup read. Both rewards tests subsequently passed, including
  cold-start geometry and missing versus checked zero. The board navigation timeout passed on retry.
- The existing Play comparison test still times out on Other plans & strategies (`view=plans`). Reproduced with the
  original, byte-identical `EnteredLineups.tsx` from the base commit; this is pre-existing and outside the Home change.
- Final rewards spec: 2/2 passed, including exclusion of drafts, expected essence from the saved probability-weighted
  forecast, owner zero rewards, the checked recommendation, mobile text/overflow, reload, different GW and cold start.
- After the real settled-week correction: 3/3 rewards browser tests and the complete local gate pass. The additional
  browser regression covers changed replay, no private snapshot, saved owner payouts and checked zero essence.
- Real cached GW27 in the owner's Chrome: all seven recommended lineups, separate Champion/LaLiga Limited essence,
  cash, cards and XP; no entered lineups and no checked rewards, correctly blank. Inspected 1440 and 390 px screenshots:
  separate natural-height table/reward cards, no horizontal overflow, readable labels. The local production build also
  navigated from Play to Home by clicking This week.
- A later real GW24 check found that its five-lineup replay differed from the six-lineup recommendation with checked
  rewards. The rewards card now selects the retained recommendation by exact lineup signatures and retains checked
  owner results even when a newer private snapshot is empty. Test-first regression covers both. Real GW24 now shows
  all six Sofix lineups checked, 100 European Champions Limited essence, and your 102 essence from two checked lineups
  (partial against the six entries). Unknown expectations for historical entries remain blank. Checked zero units stay zero.
- Web interface guidelines pass: semantic sections/headings and definition lists, tabular figures, existing link focus
  treatment, live loading status, stable cold-read rows, no added animation or polling.
- Initial missing Neon status was worktree configuration: after restoring its ignored local settings, the R2 status
  confirmed Sofix D answers and the other four projects are out of quota. No database or service settings were changed.
