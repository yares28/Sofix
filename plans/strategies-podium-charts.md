# Strategies: podium and three charts

Owner request, 24 October: the page still reads as numbers and weekly tables. Replace that presentation with a
Best strategies podium at the top and three genuinely different chart types. Make the overall winner, reasons,
points/reward tradeoffs and comparison with the best eligible hindsight lineup understandable on entry.

Visual thesis: a restrained white winners' podium, followed by connected score dots, a points/rewards scatter plot
and a reward-mix donut; one green selected strategy links the charts. No generic metric-card grid or weekly tables.
Content: top three ranking places (every tie kept, no ninth-place bronze after a large second-place tie), the selected strategy's rule, then three labelled charts;
saved real card lineups remain an optional disclosure. All saved GWs remains the default; GW/ranking selection stays.
Interaction: click a podium place, score row or scatter dot to inspect one strategy across charts; a named selector
offers the same keyboard/touch action. Donut segments and selected marks explain changes with restrained transitions;
reduced motion removes them. No new data reads, sources, calculations of model results or scheduled refreshes.

Acceptance: three visible chart types and a literal podium; no table or week-by-week numeric section. Preserve all
strategies, ties (including more than three tied strategies), separate reward currencies, missing/zero distinction,
partial hindsight coverage, values above the saved replay and unknown reward cutoffs. A pending reward is never a
loss. Charts expose units, sample sizes, keyboard selection and meaningful text alternatives. Test first, verify
the published real-data page in the owner's Chrome at 1440 and 390 pixels and click through a built preview. Keep
the reduced Neon readers and compact client props; run the page/mobile checks, local gate and limited live check.


Implementation: the numeric history sections are removed from Strategies. Its optional real-card evidence stays.
Only the compact published decision goes to the chart client; selecting a strategy does not call the server.
The score chart uses paired hindsight averages and explicit coverage; its labelled score axis may start above zero
so gaps remain readable. The scatter separates currencies, groups identical coordinates, names the points/reward
extremes and supports keyboard selection. The donut keeps unknown cutoffs as Pending, apart from Nothing and XP.
The podium preserves all tied names and does not award a ninth-place strategy bronze after a seven-way second tie.
Seven rendering regressions cover chart types, ties, first-case/zero/missing results, partial hindsight and rewards.

Checks so far: local gate passed; all 39 Audit/mobile cases passed. Built-page navigation in the owner's Chrome
showed all three charts with saved real data. Clicking xScore on the podium changed the gap to 77.20 points and
its essence to 300; choosing Surest starters showed genuine 0% rewarded (one XP-only and three nothing). Enter on
the overlapping scatter group selected xScore and updated the donut. Phone inspection found no horizontal overflow
or text below 10px. The saved-data RSC response fell from 565,206 to 528,473 bytes; no new database/source read.
Fresh interface guidelines were applied to keyboard controls, names, focus, touch targets, contrast, units and
reduced motion. Final live-data desktop/phone checks follow after shipping.


Component references checked: shadcn's chart composition (container, axes, legend, accessible active state) and
21st's Leaderboard Podium. The page keeps Sofix's own white styling and dependency-free drawing. Final local gate
and production build passed. Rewards ranking shows a first place and seven-way shared second; essence ranking
shows shared first and third, preserving skipped ranks. The final saved-data response remains 528,473 bytes.


Coverage retained: You, Sofix plan 1 and Sorare plan 1 keep their weighted average points and checked counts as
unranked hollow reference dots, apart from the matched strategy cohort. They are also visible in older owner-only
weeks with no strategy decision. A regression first failed on those missing references and now passes; browser
coverage checks the owner's 280-point and Sorare's 200-point fixture averages without a table. The extra client
props are only three names, averages and counts. Eight rendering cases now cover the feature.
