# Performance audit: responsive Sofix and ten separate accounts

29 October 2026. Baseline `75a0e36`. Requested workflow and acceptance gates:
[performance and ten-account plan](../plans/performance-ten-users.md).

## Verdict

The current app can answer ten concurrent local readers without errors, but it is **not ready for ten separate Sorare
accounts**. It repeats rendering and substantial browser computation for mostly published data, sends more private
state than some screens use, and has a global owner identity throughout storage and the extension. More server capacity
alone would leave those problems in place.

Two bounded fixes are implemented with regression tests: the Players page sends only its displayed data and does not
prefetch its long player-link list; R2 keeps pending downloads separate from its six-entry completed cache. These are
incremental improvements, not a ten-account release or a claim that the whole app is now responsive.

## Evidence and measurement boundaries

- Production was checked only through the required startup health/usage script. Deployment, Home, backend/frontend CI
  and last refresh were healthy; browser CI was cancelled. The initial Neon-status warning came from the worktree's
  missing frontend settings. One read of `neon_status` using the configured main checkout confirmed Sofix D answering
  at 1.48 GB sent, with the older four projects exhausted. No database was changed or manually selected.
- Usage at startup: 49K function calls, 19.5 GB-hours memory, 100K CDN requests and 1.9 GB data out over 30 days; 116 calls
  and 40 seconds function duration in the last hour. **Duration is not Active CPU.** The free API does not expose the
  actual Active CPU balance. The 27 October 3 h 56 m balance and 1.2–1.3 CPU seconds/render are historical repository
  evidence, not a new measurement.
- Built Next.js **15.5.28** twice and served both with `next start`, loopback only, against the deterministic mock API.
  No production-page load test, production database, source API polling, or extra spending was used.
- [Before](performance-before.json), [after](performance-after.json), [longer sample](performance-soak.json) retain
  response sizes, status/content types and aggregate latency. Navigation tests use the RSC request header. Bodies are
  uncompressed and fully consumed; these are not transferred-wire bytes, Web Vitals, or browser interaction latency.
- A pass over 25 routes records HTML followed by RSC; two legacy Audit routes redirect locally. Then ten clients each
  issue back-to-back RSC requests across Home, Players, Difficulty, Play, Cards and Table. There is no think time. The
  routes have already been visited, so this is primarily a **warm single-owner server test**. It does not emulate ten
  independent collections or authenticated sessions. First-route times also include module warming and are not a
  controlled cold-start comparison.
- [Component and block evidence](performance-components.json) comes from one offline calculation per mode and a read
  of existing copied publications. No real-data performance loop was run. Timing varies with warm-up and host load.

## Findings, in order of impact

### 1. Private state has no tenant boundary — blocker for ten accounts

The job has one configured `sorare_user` and writes `sorare`, `sorare_settings` and other global keys
(`backend/app/config.py`, `backend/app/jobs/sorare.py`). Saved weeks are keyed by GW only
(`frontend/lib/myWeeks.ts`, `frontend/app/api/my-week/route.ts`); mission storage accepts global keys
(`frontend/lib/missionStore.ts`). The extension uses one environment bearer token (`frontend/lib/extAuth.ts`),
and its overlay request contains card/player/week identity but no authenticated account context.

Browser caches such as `sofix:entered:v1:<slug>` and `sofix:weeks-checked:v1` also omit the manager
(`frontend/lib/myWeeksClient.ts`). Same-origin checks on writes prevent certain cross-site requests; they do not
identify which of ten users owns a record. Deployment protection remains an access boundary for today's private app.
This finding is not a claim of a demonstrated leak under today's single-owner deployment.

**Required solution:** trusted session → internal account ID → server-side Sorare binding. Derive account identity
from that session/token, never from a submitted username. Scope private records, R2 paths, cache keys/tags, jobs,
browser storage and extension pairing to that account. Reject cross-account access before serving a cached object.
Logout/account switching clears the old account's state and cancels its in-flight work. Keep the bucket private and
the existing deployment protection in place throughout migration. Ten users must not share the current extension token.

### 2. Season simulation blocks rendering and interaction

`LeagueTable` calls `standings()` in `useMemo`. That function simulates **5,000 seasons** in the render path
(`frontend/components/LeagueTable.tsx:54`, `frontend/lib/standings.ts:217`). Client components also execute during
the initial server HTML render and again during browser hydration. Changing table mode/split/GW can recalculate it.
For European leagues, `leaguePhaseGrid()` creates a new grid every render, invalidating those memo dependencies.
The actual table still computes the simulation even though its forecast columns are hidden.

Two offline probes of the 20-team, 38-GW fixture took roughly **63–142 ms** for Actual/Expected. The retained probe
recorded 62.6/69.4 ms; an earlier run recorded 127/141.6 ms. These are synchronous function times on this desktop,
not measured phone INP. The default 400-simulation season chart took another 36.5 ms in the retained probe.

**Required solution:** publish the supported table modes, splits, selected-GW outputs and chart points from the jobs,
keyed by football publication version. The browser should select prepared rows and draw them. Preserve seeded results,
round boundaries and all current controls. Use a worker for any necessary residual browser calculation; moving the
existing simulation into an API handler would still charge CPU on every request. Add parity tests against existing
seeded outputs before moving it. Do not change the football model or cut down the number of simulations to mask latency.

### 3. Data caching does not cache rendered pages

The production build marks all 23 non-alias route templates in this audit dynamic, including Home, Play, boards,
Gallery, Players and Audit. `searchParams` and `connection()` opt routes out of the full route cache; the cached
published blocks save upstream work but do not remove per-view rendering/serialization. Explicit `connection()`
appears in Home and the shared board route. The region is already `fra1`; moving the region is not the main fix.
The distinction is documented in [Next 15's caching guide](https://nextjs.org/docs/15/app/guides/caching).

Warm fixture navigation bodies were **482 KB** for Difficulty/Table and **525 KB** for Fixtures. A browser that has
cached the JavaScript still downloads and decodes that data on navigation. Full board HTML ranged from 616–722 KB
in this fixture. The complete season grid crosses the client boundary where only a smaller current view is shown.

**Required solution:** cache the genuinely shared football shell/results by competition, GW and publication version,
and supply small account-specific panels separately. Preserve old query bookmarks and selected-week navigation;
the existing [cacheable-page plan](../plans/cacheable-pages.md) is a useful starting point, but its assumption that
all pages share one owner's private data is now superseded by the ten-account requirement. Do not enable public ISR
on today's private Home/Play HTML. A shared cache key must never contain an owner's collection, missions or lineups.
Move clocks/countdowns to client timestamps; use publication invalidation and the existing scheduler for rollover.

### 4. Players serialized unrelated weekly plans — fixed

Previously `frontend/app/players/page.tsx` sent `{ ...data, market }` into `PlayersView`. The component only needs the
collection, selected market, next-GW identity and projection timestamp. Every week's plans/timeline/status were
serialized into the client boundary despite never being displayed there.

The fix narrows its props and retains the exact selected-GW market, valid zero start chances, null projections,
source identity, collection comparison and all existing filters. Its long player-link list now uses `prefetch={false}`.

- Fixture RSC body: **175,448 → 103,250 bytes**, a **41.2%** reduction.
- Fixture full HTML: **256,467 → 174,735 bytes**, a **31.9%** reduction.
- Current local publication's comparable props: **2,286,518 → 701,143 bytes**, a **69.3%** reduction; gzip equivalent
  **324,923 → 86,618 bytes**, a **73.3%** reduction. This compares the current market before selected-GW overlays and
  excludes the RSC envelope; it is **not** a measured live-page transfer.

The regression test fails on the old page because unrelated `weeks`/`timeline` are sent to the client. Player
prefetching was source-confirmed; a production request-count reduction has not been measured.

### 5. Cold block downloads could repeat — fixed at the block reader

`frontend/lib/r2.ts` previously kept in-flight promises in the same six-entry map as completed blocks. Loading a seventh
block could evict a still-running download; another reader of that block then fetched it again. A ten-reader test
with nine other pending blocks made 11 downloads for ten distinct blocks before the fix and ten afterwards.

Pending downloads now share a separate map until settled, while completed successful blocks retain a six-entry LRU.
Failed/missing low-level downloads are not retained; a new version is read separately. The memory key includes the
local directory or R2 account/bucket, avoiding reuse across different sources with identical key/version values.
This is source isolation, **not tenant authorization**. Tag invalidation/version discovery remain unchanged.

The pending map is per process, not a distributed lock. It does not cap the fan-out of different requested blocks.
Higher-level Next caches can still retain null payload parts until invalidation; this change only fixes the block
reader's own negative retention. Publication atomicity and missing-part handling need separate acceptance coverage.

### 6. The refresh pipeline cannot simply be repeated ten times

The copied `refresh_runs` block, published at 21:45 UTC on 29 October, retains a successful run from 15:07–15:21 UTC.
Its Sorare step took **700.1 seconds**, made **498 calls**, read **24.47 MB** from Neon, and published a roughly
2.31 MB Sorare block. Recorded substeps include 309.9 s Sorare sync, 102.8 s Futbol Fantasy, 167 s writes and 32.5 s
plan generation. The sync breakdown includes 144 foreign-index calls, 107 competition calls and 93 history calls.
These figures describe that retained run, not every run or the current upstream latency.

A literal tenfold repeat would be about **117 minutes**, **4,980 calls** and **245 MB** per batch. At four batches/day
for 30 days, the Sorare step alone would be about **14,002 runner minutes** and **29.4 GB Neon egress**, before other
jobs. This is an illustrative extrapolation; shared inputs and collection sizes change actual cost. It already shows
why copying the single-user workflow is unsuitable. The workflow's refresh timeout is 25 minutes and score checks
share its `refresh` concurrency group, so a longer monolith would also delay time-sensitive checks.

**Required solution:** one due-based shared collection for football, player history, art, public competition rules and
prices; account-owned collection/eligibility reads stay separate. Plan each account from those shared immutable inputs.
Deduplicate overlapping players across managers, stagger account jobs, and give score/lock checks priority over bulk
history. Use a small bounded worker queue, account/GW/input-version idempotency and a publication manifest switched
only after its dependencies exist. Retain last-good same-account results on failure with honest freshness labels.
Measure per-account time/calls/bytes before choosing concurrency; do not start ten independent unthrottled clients.

### 7. Global CSS and repeated broad reads add avoidable work

`frontend/app/layout.tsx` imports styling for virtually every feature. The build emitted eight CSS files totalling
about **433 KB raw**; the root's imports make feature styles eligible on unrelated routes. Browser styles are cached,
so this is primarily first-visit parse/style cost, not repeated network transfer on every click. First-load JavaScript
is 153–224 KB in the audited pages according to Next's build report, with 103 KB shared. JavaScript bytes alone are
not the dominant demonstrated problem; Nivo charts already use deferred loading in relevant components.

`loadSorare()` reconstructs all retained weekly parts, and defaults to including the market. Several consumers need
only a collection/calendar/summary; `loadSorareSummary()` already demonstrates a smaller read. Home starts seven
independent reads together, but still depends on several retained plans/rewards/actuals afterwards. The overlay starts
14 model reads before answering even a narrow request. Global search downloads a directory on first intent and then
retains it for the page lifetime. Published local storage contains **8,643 blocks / 77.5 MB**, including multiple
2–2.6 MB objects; these are stored-object sizes, not all downloaded per visit. Existing split caches mitigate Next's
per-item cache ceiling but do not guarantee every payload part is below it forever.

**Required solution:** feature-level styles; page-specific DTOs and small summary/calendar blocks; per-player/per-GW
detail loaded on intent; byte-budget checks on published shards and client boundaries. Keep 12-item pagination with
all items reachable: Players currently renders 30 and requires narrowing to reach the remainder, contrary to the
standing list rule. Its pagination is a separate visible change and was not silently changed in this audit.

### 8. Browser-triggered jobs and private-history reads grow with users

`NearLockRefresh` posts once per ten minutes **per browser** on mount; `YourSeason` and entered-lineup mounting can
request `/api/my-week`, which returns all saved weeks/snapshots. Existing local coalescing and visibility handling help,
but there is no account-wide/distributed budget. One browser's timer/storage key does not coordinate ten users or tabs
on different computers. Refresh POST checks the current workflow before dispatch; it is not a tenant job queue.

**Required solution:** the scheduler owns shared refresh work. Browsers ask for a small account-scoped version/status
and only their selected GW, reuse recent reads across same-account tabs, and stop background work while hidden.
Preserve automatic entered-lineup coverage and closed-tab behavior; do not replace it with extra manual visits.
Rate-limit by account and action on the server. Keep all Sorare writes explicit and outside automatic retries.

## Capacity result

The matched 120-request warm tests had **zero errors** in both builds. Before: p50 181.8 ms / p95 436.8 ms / p99
469.3 ms / 42.85 requests/s. After: 185.6 / 470.5 / 483.3 ms / 39.24 requests/s. That difference is small and noisy;
there is **no demonstrated general server-latency improvement**. The proven improvement is Players payload size and
the low-level duplicate-download regression.

The updated build then completed **1,800 requests, ten concurrent clients, zero errors**, in 31.98 s: p50 134.3 ms,
p95 318.1 ms, p99 372 ms, 56.28 requests/s. Better warm-up explains why this should not be compared directly to the
short baseline. This is a useful overload smoke test, not a long soak or evidence of memory stability. It excludes
browser hydration, user-specific caches, authenticated private writes, real source throughput and internet latency.

## Recommended free-first architecture

Keep the existing Python jobs, private R2 store and Next frontend. Avoid a full hosting rewrite before fixing where
work occurs. The target is to **compute per data change, select per account, and draw per interaction**.

1. **Shared publication:** football fixtures/FDR, player evidence, table/season projections and public competition
   references are generated once. Small versioned blocks carry explicit source, GW and freshness identities. Only
   genuinely public evidence may be shared through a public CDN cache; no change to bucket visibility is authorized here.
2. **Account publication:** `account:<id>:collection`, `account:<id>:plan:<gw>`, entered snapshots, missions, rewards and
   settings, with account-qualified storage constraints and cache tags. Shared player evidence can be reused; an owned
   card, eligibility result, private lineup or account reward remains account-owned.
3. **Read path:** static/shared shell and small versioned shared data; authenticated private gateway for the account's
   fragments. The gateway resolves account ownership before cache lookup and streams prepared bytes rather than
   recomputing rankings or parsing every league. Private browser responses remain private; any server object cache is
   partitioned by authenticated account and version. The frontend draws exactly the current view with bounded DOM work.
4. **Write path:** account-scoped validation and optimistic concurrency, server rate limits and a durable bounded job
   queue. Keep schema changes additive and migrate every production project manually before enabling new code. Existing
   owner data is explicitly assigned to the original account; never reinterpret global rows as belonging to a new user.
5. **Extension:** pair a revocable per-account token to an authenticated user and verified Sorare manager; reject manager
   mismatch before returning private plans or accepting a snapshot. Keep all allowlists and Check → Draft → explicit
   Enter, and clear account-scoped caches on identity change. The authentication provider/binding proof must be settled
   and tested before inviting users; never introduce Sorare password/login handling.

Vercel's published Hobby allowance is **4 Active CPU hours/month**. As an illustrative model, ten people making 100
dynamic views/day at the old 1.2 CPU seconds/view would need **10 CPU hours/month**, without other account projects or
APIs. Meeting the request for free therefore depends on reducing repeated work, not on the one-million invocation cap.
See [Vercel limits](https://vercel.com/docs/limits) and
[function billing semantics](https://vercel.com/docs/functions/limitations).

GitHub Free private repositories include **2,000 runner minutes/month**; the actual account plan/remaining minutes were
not inspected. Shared collection and staggered planning must fit its real included allowance before ten accounts are
enabled. See [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

R2 currently publishes a free tier of **10 GB-month storage, 1M Class A / 10M Class B requests** and free egress; these are
allowances, not a promise that overages cannot bill. No caps/plans were changed. See
[R2 pricing](https://developers.cloudflare.com/r2/pricing/).

If the optimized authenticated read path still exceeds the existing Vercel allowance, evaluate a **thin** Cloudflare
Worker gateway serving prepared objects under the existing free account. Free Workers allow 100K requests/day but only
10 ms CPU/request, so moving today's rendering/simulation there unchanged is unsuitable. That fallback needs a
representative prototype and verified auth/cache isolation; it is not a deployed or validated solution here.
See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

## Delivery order and release gates

1. **Current increment:** payload/prefetch and block coalescing fixes, repeatable local probes and this audit.
2. **Responsiveness:** publish table/chart outputs, trim each page boundary and introduce complete 12-item Players
   pagination. Verify output parity, selected-GW coverage, mobile search/filter responsiveness and no layout shift.
3. **Repeated renders:** cache a shared football page end to end, preserve legacy bookmarks and demonstrate a production
   CDN hit under existing protection, correct publish invalidation and timely rollover. Extend only after that proof.
4. **Ten accounts:** add identity, additive account-owned schema and jobs, extension pairing and account-qualified caches;
   migrate all projects first. Use deterministic identities for cross-account rejection, logout, multiple tabs, expiry,
   missing-versus-zero and wrong-manager tests. Keep feature disabled until all boundaries pass.
5. **Capacity sign-off:** ten distinct authenticated accounts, representative collection sizes, real account cold start,
   every selected GW, navigation and tab closure, plus a 30-minute local/preview soak. Test browsing while publication,
   one failed source and one failed account plan occur. No repeated production sweep. Inspect actual monthly CPU,
   runner minutes, R2 operations and Neon egress; do not extrapolate from the mock benchmark alone.

Proposed targets for sign-off (not current measured guarantees): p75 INP ≤200 ms on desktop and a throttled mobile;
warm navigation p95 ≤1 s desktop / ≤1.5 s mobile under ten identities; no wrong-account data or failed requests during
the soak; publish visible within one minute after it completes; no main-thread simulation on routine controls.
Choose a documented device/network profile for these measurements. Measure account planning time after shared-work
extraction before setting an all-ten warm-update deadline; the existing 700-second step cannot support a credible
five-minute promise unchanged. Keep at least half the hosting CPU allowance for other projects, jobs and unexpected load.

## Verification receipt and remaining limits

- New block-reader and Players regressions failed before the fixes and passed after: nine targeted tests, including
  zero values, selected-GW payload, retry/new versions and distinct local sources.
- Both optimized production builds succeeded. Existing CSS autoprefixer warnings remain; they were not introduced here.
- `node scripts/check.mjs`: documentation tests, generated API types, ESLint, typecheck, Vitest and documentation drift
  all passed. No backend code/schema/model change; no backend rerun was needed for these fixes.
- `npx playwright test e2e/cards.e2e.ts e2e/foreign-players.e2e.ts --project=desktop`: **14 passed**, including filters,
  player navigation, cold foreign-league bookmarks, GW changes and closing the search tab.
- Local production-build Players inspected at 1440 and 390 px in the available in-app browser, with functioning search,
  real card art in the fixture and no horizontal overflow. The owner's open Chrome was not exposed in the browser
  inventory; these screenshots are mock-data checks, **not** the standing real-data Chrome acceptance check. No copy,
  layout or styling was changed by the fixes.
- Real data verified: copied block sizes, comparable props, retained job timing/call/byte receipts, and one live published
  Neon-status read. Real user interaction timing, ten actual accounts, account isolation, long-term memory/CPU behavior,
  full production read-model freshness and ten-account upstream/job throughput remain unverified.
- No authentication, schema migration, new user, service upgrade, paid resource, Sorare mutation or manual refresh was
  performed. The full ten-account acceptance criteria are **not met** by this increment.
