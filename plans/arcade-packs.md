# Gems and packs — 1 November 2026

## Requested workflow

2 November extension: compare two editable options, including mixed packs (for example 2 Gold versus 1 Platinum +
4 Silver). Each option supports multiple pack types and a quantity per type. Show total packs/cards, costs in each
currency, the selected goal's chance and expected count, and all tier outcomes together. Reuse the saved reading;
editing either option never reads odds. Remember both options and the chosen mode across navigation/reload, scoped to
the owner/set/board/step. Missing odds invalidate the whole option instead of silently comparing a partial basket.
Repeated players count once across all pack types for a new-player or collection goal. The comparison view shows only
the two options and their results; the wallet optimiser remains in Single pack mode. Tests precede the new aggregate
math and comparison controls; check the owner's examples, mixed currencies, unknown slots, persistence and phone layout.

Upgrade the existing Arcade section without adding another tab. The owner chooses a pack and a quantity (at least one),
sees Icon, Icon or Star, each individual tier, expected cards and the total price. A compact goal selector replaces the
mission button wall. Gems and essence budgets stay separate. Pack comparisons show one-pack odds; quantity results name
their denominator and outcome rather than an unexplained percentage or saturated bar.

Odds are read only on the owner's click, saved locally for the signed-in owner, set and board, and reused after refresh,
navigation and tab closure until Read odds again. A failed or incomplete refresh retains the last complete reading.
Changing the board/set/owner must not apply another board's odds. Missing odds are not zero. Saved player odds are
re-evaluated against the current owned players; duplicates never become extra new players.

## Implementation and acceptance

1. Regression tests first: integer budget combinations, distinct-player averages across repeated packs, complete slot
   coverage, tier/combined-tier quantity results, persistence and explicit refresh failures.
2. Use native browser storage for the large odds snapshot, with bounded storage and identity validation. No new dependency,
   automatic odds polling, purchase action or server read.
3. Restyle the section as a compact pack catalogue and selected-pack calculator, with budget recommendations below.
   Keep all available packs paginated at eight and all collection goals discoverable in one selector. Only claim mission
   eligibility that the source actually identifies; record any unavailable rule explicitly.
4. Check the page spec, mobile layout, local gate, production build, and real data in the owner's open Chrome at
   1440 px and 390 px. Verify a real explicit odds reading and retained results after reload; do not purchase packs.
5. Update the manual and this evidence, inspect the diff, ship to main and check the changed production route.

## Evidence before the change

- `ArcadePacks.tsx` held odds only in component state and hid the read button after success. The pack row mixed one-pack
  odds with a budget-wide probability bar. Every collection goal rendered as another button.
- `spendGems` greedily bought by probability per price, which can lose to a different affordable integer combination.
  Its summed new-player average counted a repeated player more than once across packs.
- `parseTierOdds` compacted missing slot indices; `readPackOdds` accepted the prefix of a failed batched reading.
- Pack odds come from the existing allowlisted extension query `slotGameplayTierOdds`, including tier shares and player
  chances per slot. No pack artwork is supplied by that query or the board; use the actual pack names and league labels.
- Hosting is currently blocked by Vercel (HTTP 402). The local production server remains the real-data verification path.

## Verification

- Pack calculation regressions and all 24 Arcade page cases passed. The separate mobile specification passed all 19 cases.
- The first 1440 px screenshot exposed the global table minimum width spilling into the catalogue; a failing containment
  regression reproduced it. The pack table now owns its minimum width, and the catalogue uses eight packs per page.
- The initial gate passed script checks, generated API types, lint, typecheck and unit tests; the documentation review/index
  must be refreshed after the final source edits. The production build passed.
- Real-data Chrome inspection and screenshots are in progress. A live reading on 2 November supplied every slot and tier totals of 100%, but raw player totals ranged from 95.9% to 105.4%.
  The failed regression reproduces this mismatch. Player estimates now preserve each published tier share and scale relative
  player weights within that tier; the tier calculations use the source shares unchanged. This is an explicit estimation
  assumption, not a claim that the raw player figures are an exact probability distribution.

- The final local gate passed (script tests, generated API types, eslint, typecheck, unit tests and documentation checks).
  The full Arcade spec passed 24 cases; all 19 mobile cases passed; the two changed pack workflows passed again after
  the final numeric display changes. The final production bundle contains the slot-based log-probability calculation.
- On the owner's real board, 10 Gold Ligue 1 packs cost 500 gems: one-pack Icon chance 41%, ten-pack chance 99.5%,
  expected Icons 4.1 and no-Icon chance 0.5%. The reading was saved on 2 November at 00:20 Madrid and survived reload
  without another odds click. The published tier shares remain unchanged. The live check certifies tier results and
  retained readings; it is not an independent validation of every collection mission's eligibility rules.
- Visual review also found rounded nonzero averages displayed as zero and near-certainty displayed as a guarantee.
  Tiny averages now say <0.01; only a guaranteed qualifying slot can display 100%. Other near-certain results say >99.9%.

## Two-option comparison verification - 2 November

- The full Arcade spec passed all 25 cases on a clean serial run; all 19 mobile cases passed. An earlier run had one timeout after reload; the unchanged case passed in the clean rerun. The three pack workflows passed again after the comparison layout and incomplete-gallery regression.
- Unit coverage includes two Gold versus one Platinum plus four Silver, separate currency totals, distinct players across mixed packs, missing odds and probability underflow versus certainty.
- Real Chrome retained both options, quantities and the saved 00:20 Madrid odds after reload. At equal cost of 100 gems, two Gold Ligue 1 packs show 65.2% for at least one Icon (0.82 average), versus 62.6% (0.8 average) for one Platinum plus four Silver Ligue 1. No new source odds request was needed.
- The real gallery is marked incomplete (438+ cards). A failing browser regression reproduced unqualified ownership estimates; new-player and collection figures now show upper bounds and no winner badge. Tier odds remain exact to the saved source shares. Mission eligibility remains based on existing source fields, without independent validation of every mission.
