# Strategies: make the decision clear

Owner correction, 24 October 2026: entering Strategies must answer which strategy is better, why, its average points
and rewards. Unexplained numbers and decorative bars are not an acceptable result. Preserve the automatic audit,
saved GW selection and full card evidence. No extra owner action or manual source refresh.

Delivery: lead with the point leader and reward-frequency leader on the actual saved record. Explain the strategy’s
selection rule and its measured advantage against xScore, without inventing a causal football explanation or claiming
future superiority. Compare active strategies on the same completed competition/GW boards. Display ties, absent
comparisons and the actual sample from the first case. Keep pending scores, unknown prizes and unknown amounts distinct.
Cash and essence stay separate; essence rarities never combine. Amounts for unentered model lineups are what their
scores reached against saved reward cutoffs, not money the owner actually received.

The first screen presents the finding and its reason. An ordered comparison shows a sentence describing each strategy,
average points, rewards in X/Y lineups and recorded average cash/essence amounts, with explicit units. Remove the
unexplained bars. Put whole-plan/owner season context and the selected GW’s actual cards after that decision. A GW
selector updates the whole decision comparison; all saved weeks remain accessible.

Acceptance before changes: regressions for unequal coverage and pending outcomes, ties, genuine zero versus missing
rewards, multi-part reward tiers, separated essence rarities and the mean of all comparable lineups. Repeated cached
publication stays idempotent. Browser tests cover the visible conclusion/reason, points/rewards units, ties/no evidence,
selected GW restoration, retained cards, desktop/mobile readability and accessibility. Read saved real data only;
verify the leader’s numbers independently against its board rows. Normal jobs publish the decision summaries.

Visual thesis: an editorial results page whose first sentence gives the answer; the supporting numbers have visible
units and denominators. Use the existing white Sofix design, accessible native controls and disclosures. No marketing
copy, decorative chart or wall of statistic cards. Reuse the frontend/design skills already read for this work.

Implementation and evidence: `strategy_decision` publishes the complete-case comparison from saved boards, leaders
and ties, advantages against xScore, reward frequency and cash/essence amounts. Multi-part reward tiers retain cash
and essence even if their best prize is a card. Unknown amounts never become zero; essence comparisons require the
same recorded rarity for every strategy. No picking/scoring algorithm changed; three existing rule descriptions
were clarified. The page removes all bars, leads with the criterion’s winner and explanations, makes the points/essence
tradeoff explicit, and labels every value and denominator. Both period and ranking persist in the URL. Full raw
history and cards remain available below.

Real saved-data reconstruction (read-only, 5.69 MB, no source calls or production writes): all ten strategies share four
completed boards across GW23 and GW24 (GW24 All Star; GW23 LaLiga, Champion and All Star). Keeper with his defender
averages 472.67 points, +25.62 against xScore, beating it in three of four cases. xScore and No attacker against the
keeper both average 300 Limited essence; the points leader averages 250. Favourites only reaches a real reward in
4/4 cases and averages 237.5 Limited essence. No cash is reached on these shared cases. Separate sums of the saved
board rows reproduce every average. Full owner/Sofix/Sorare totals remain unchanged.

Checks so far: meaningful backend regressions failed first, then passed. Complete repository gate passes ruff, mypy,
full pytest, generated API/types, eslint, TypeScript and Vitest. The four focused rendering tests cover explicit
conclusions/reasons, units, real zero versus unknown, ties, ranking order/headline, separated rarities and no hidden
100-case gate. All 38 Audit/mobile browser checks passed. Built-page real-data navigation, final phone/desktop
proof and normal automatic publication are recorded in the handover. No shared mock, shell or navigation changes;
no migration, new source request, manual refresh or paid dependency.

Final real UI proof: owner’s Chrome at 1440×900 and 390×844, navigating from built Lineups to Strategies, using
saved read-model data. The first screen gives the point leader, tied Limited-essence leaders and reward-frequency
leader, followed by the factual points/essence tradeoff. Phone refinement brings both headline averages and units
above its fixed bottom navigation. Rank by essence correctly puts the tied strategies at rank 1, and its headline
updates to the selected criterion; the GW selector changes the comparison. No page overflow (1425/1440, 375/390)
and no phone text under 10 px. Small category labels use dark green in light mode; dark mode retains light green.
Native controls/disclosures have explicit labels, high-contrast keyboard focus and reduced-motion support. Web
interface guidelines review found and resolved small-text colour and definition-list markup issues. No new image
assets or source requests are needed. Existing shared reload metadata warnings are unchanged, as documented in
the prior delivery. Final build, lint, types and focused rendering tests pass after these refinements.
