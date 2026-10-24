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
