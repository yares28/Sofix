# Quota recurrence and overall strategy comparison

Owner request, 24 October: diagnose the renewed Neon limit using the earlier fixes and repair the cause, without paid
upgrades or repeated new projects. Then make Strategies an overall visual comparison, including the best lineup the
owner could have made. Preserve automatic coverage and all saved evidence; weekly lists are secondary.

Neon acceptance: identify the actual current quota and large readers; reproduce a fallback/leak before changing it;
use the existing R2/cache path and least-privileged saved credentials; prove real R2 reads and repeated local reads
without downloading page payloads from Neon. Do not print credentials, remove data, change spare projects by hand or
run a migration. Fix one useful piece completely before moving on. Record verified savings and remaining readers.

Strategies acceptance: lead with a visual overall result, clearly label points and rewards, and compare each strategy
against the best feasible lineup in hindsight on the same competitions/GWs. Missing hindsight must remain unknown,
never zero or 100%. Publish the calculation in jobs; display retained cards and real results without new source reads.
Test unequal coverage, zero/missing best scores, ratios/point gaps, ties and mobile readability before shipping.

Initial evidence: existing monthly counters report Sofix C 5,014,728,118 bytes, Sofix B 4,539,374,142; the app still has
answering projects, while Sofix/FDR are quota-refused. Both local frontend environment files lack all R2 settings,
despite the saved read-only R2 token being present in the ignored root settings. Local logs show full Audit/mission
payloads falling back to Neon. The jobs also retain direct block/history reads; inspect their logs before assigning
the whole increase to localhost. No destructive recovery or paid resource is authorized or needed for this diagnosis.

## Neon repair, 24 October

Confirmed in job logs: score run 40126810780 downloaded 31.5 MB; saved-result publication 40115430678 downloaded
33.1 MB. Both workflows omitted the existing PLAYER_GAMES_MIRROR restore/save, despite publishing the full Audit.
At 48 score checks a day, a 31.5 MB check repeated at every slot would send 1.51 GB/day; this is a rate illustration,
not a measured daily total. Audit also bypassed the block cache for archives, plans, score records and start records.

The two workflows now share the existing history copy with refresh. Audit block readers use write timestamps,
the cached copy and R2 before Neon; start correction and frozen scores read the synchronized history copy. R2 accepts
only the version Neon names, preserving zero/null payloads, and falls back on a missing/stale/unreadable block.
A network failure falls back for the rest of that job rather than retrying a dead connection for every block.
Score jobs report Neon MB separately for score reads and Audit. Check cadence and coverage are unchanged.

Regression tests first failed on the missing workflow cache and absent versioned R2 reader. Targeted source/Audit,
strategy and mirror tests then passed (40). The local read-only R2 settings were restored in both ignored frontend
configurations. A real R2 read remains unverified: Python rejects the endpoint's certificate; Node times out. Public
HTTPS verifies normally. TLS validation stays enabled. Do not claim local R2 savings until a real read succeeds.
Full backend verification and a scheduled-run byte measurement follow before closing this issue. Monthly counters
will not fall after this repair; only new data transfer can be reduced.

## Strategies design contract

A calm white editorial ranking with one green result: first the winner and the reason, then a clearly labelled
hindsight target and the points left to gain. A compact ranked chart replaces repeated metric grids; every bar names
its unit and endpoint, and rewards stay beside points. Detailed rules, reward counts and real lineup cards remain
available by disclosure. On phones each row keeps its name, score, bar and rewards together. No decorative motion;
existing navigation feedback identifies period/ranking changes. Hindsight means the best feasible saved replay found
from that week's eligible cards and rules, after results, not an assertion of a mathematically exhaustive optimum.
A representative read-only projection confirms the four shared boards have replay maxima 513, 391, 687 and 506
(524.25 average); missing archives stay unknown. No new Sorare request or optimization is needed by the page.


Strategies implementation: cache version 5 and settlement version 7 republish each board's saved hindsight score.
The job compares only boards scored by every active strategy; a second matched subset supplies hindsight averages,
shares of the summed best score and average point gaps. A missing archive is excluded, zero is included without
inventing a percentage, and a score above the saved replay is shown honestly. The chart leads with the points winner,
its rule and wins over the baseline, then compares all strategies with labelled point/reward scales. Essence stays
separate by rarity; weekly context, reward breakdowns and real card evidence remain accessible. Seven rendering
regressions and 17 strategy backend cases cover these states. Preview uses the previously captured real read models
and the tiny read-only replay projection above, with database connections disabled; a live published-data check follows.


Automatic refresh 40130512929 succeeded with the cache repair: Audit 3.48 MB, full Sorare step 26.8 MB and whole
refresh 32.9 MB. History-copy logs show unchanged games fetched zero rows. Some extension-written mission/entered
blocks lack the R2 version and correctly fall back to Neon. A metadata-only read confirms the published Audit
(version 6, four shared boards, keeper/defender leader). A standalone score-check byte measurement remains due.
Local R2 TLS fails on a self-signed network interception certificate (core1.netops.test), not an accepted R2 certificate;
no certificate check was bypassed. Existing local disk caching continues to protect repeated reads.

Chrome also reproduced a filter race: changing ranking while a GW navigation was pending replaced the new GW with
the old URL. A browser regression first failed with only rankBy=rewards in the URL. The picker now merges pending
choices until the transition completes, preserving both controls. The 38 Audit/mobile checks passed before this
isolated addition; the new race and saved-GW tests are rerun after the fix.


Pre-shipping checks: node scripts/check.mjs passed (ruff formatting/lint, mypy, full pytest, OpenAPI/types,
eslint, typecheck and vitest). Final picker/disclosure changes also passed frontend lint, typecheck and all 1,030
unit tests; both targeted browser cases passed after the fix. The 38 Audit/mobile cases passed. A production build
served the saved real data; clicking from Audit opened Strategies, and phone/desktop inspection found no horizontal
overflow or undersized text. The RSC response is 565,206 bytes (previous 558,775; +6,431). Design review checked
labelled scales/units, genuine zero vs missing, ties, native disclosures, visible keyboard focus, 44px disclosure
controls and inherited reduced-motion handling. Temporary previews have no Neon connection. Production R2 settings
were compared read-only and match the restored local values; the temporary settings download was removed.


Final live evidence: Vercel deployed b8280b6; home and Strategies returned 200. The automatic saved-result job
published Audit settlement version 7, with four hindsight boards averaging 524.25. The main localhost page was
verified in the owner's Chrome (127.0.0.1:3000): 472.67 / 524.25, 90.16%, 51.58 point gap. Desktop and phone
screenshots were saved; neither view overflows or breaks the text floor, and the real card disclosure still opens.

A remaining avoidable Audit page read was then fixed: only xScore needs the current player fixtures; the other
Sorare-using Audit views need collection and timeline. loadSorareSummary reuses the versioned head cache without
reading market or weeks; xScore keeps fixtures but omits the unused market. Existing full loaders for other app
pages remain unchanged. Regression first failed on the absent summary reader; both summary/default-path tests now
pass. A metadata-only measurement gives 848,872 bytes for the whole Sorare block versus 69,758 for its head: 91.8%
less for this portion on a cold/version-changed Neon fallback, not a claim about total page or account usage. The
cold-server 6.9 MB log includes home, extension and Audit requests, not Strategies alone. Repeated same-version
page interactions did not add payload reads; only the newly published Audit version added its 0.76 MB once.
