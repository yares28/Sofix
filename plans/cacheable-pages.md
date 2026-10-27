# Cacheable pages: a page view costs no Vercel CPU (plan, 27 Oct 2026)

## Why

Vercel Hobby gives the whole account (Sofix, upv-cal, trakzi, folio2) 4 h of Fluid Active CPU per 30 days. On 27 Oct 2026 it
stood at 3 h 56 m, mostly Sofix (6 to 23 min a day from 11 Oct). Every Sofix page is a server render on every view, every
prefetch and every deploy screenshot, because each page reads the URL (`?w=`, `?gw=`, `?page=`...) or the clock
(`connection()`, `headers()`, `new Date()`), and Next renders those per request. One render cost 1.2-1.3 s of CPU (23 Oct).

What one hour of production showed (27 Oct, request-logs API): 267 calls, every page `cache: MISS`; 65 of them Vercel's own
headless screenshot of two deploys opening each nav link; the rest the owner's views, the extension and polls (the last two
fixed in a53e9cf).

**Goal:** a view of any page is served from Vercel's CDN (`x-vercel-cache: HIT`, no function run). A page is built again
only when its data changes (a job publishes, the app writes) or the week rolls over. **Target:** Sofix under 1 min of CPU a
day on a normal day, read on Vercel's usage page, with nothing on screen lost or slower.

## What stays exactly as it is (the owner's workflow)

- Every page, every number and every link the owner uses today, including old bookmarks with `?w=`, `?gw=`, `?md=`.
- The week in the top bar drives every page; switching weeks is one tap.
- Countdowns, "starts in", fresh/stale labels tick live.
- New data shows within a minute of a job publishing (today: `/api/revalidate` after each publish).
- 1:1 skeletons, no layout shift; dev server and e2e mocks keep working.

## Design

1. **The week moves from the query into the path, invisibly.** Each week-driven page gets a `w/[week]` segment
   (`/play/w/<weekId>`); the bare address (`/play`) shows the current week. `next.config` rewrites
   (`has: [{ type: "query", key: "w" }]`) send `?w=` / `?gw=` / `?md=` links to the path form at the CDN, so old links and the
   week bar keep working with no function call. Rewrites are routing config, not middleware: no CPU.
2. **Pages are static with on-demand revalidation.** `export const revalidate = 3600` (a safety net) plus the cache tags the
   loaders already carry (`GRID_TAG`, `SORARE_TAG`, `SYSTEM_TAG`, `MY_WEEKS_TAG`, `MISSIONS_TAG`). `/api/revalidate` already
   revalidates them after every publish, so each page is built once per publish, on its first view, instead of once per view.
   `generateStaticParams` returns `[]`: week pages are built on first view and then cached.
3. **The clock moves to the browser.** Everything that reads "now" on the server (`connection()` in PlayPlace, LineupsPage,
   AuditPlace, home, arcade, missions, season, team; `new Date()` in about 24 components) gets the timestamps instead and
   computes the label in a small client component, like `StatusPill` already does. Which week is "current" for a bare address
   is decided at build time; the Cloudflare clock (`clock/timetable.json`) pings `/api/revalidate` at each lock and week
   boundary so the bare address rolls over on time.
4. **Other query parameters become client state or path segments.** `page` (Cards, lists over 12), `rarity` (Missions),
   `league`/`pos`/`stat`/`chart`/`min`/`cw` (Players, Stats, Season), `view` (Strategies), `m` (Lineups), `results` (Audit),
   `plan`/`by`/`after` (Play alternatives): each is either drawn by the client from data already on the page (filters,
   pages of a list) or a path segment when it changes what the server reads. Decided per page in P1-P4 below.
5. **Control** reads `headers()`: find out why (likely the host for the extension setup), move it to the client.
6. **Left as functions, each with a budget:** `/api/refresh`, `/api/ext/*`, `/api/my-week`, `/api/revalidate`, `/api/settings`.
   Each is listed with its calls per day in the `--live` CPU line's breakdown once P5 measures them.
7. **Fewer deploys:** a push that changes nothing in `frontend/` no longer deploys (`ignoreCommand` in `frontend/vercel.json`:
   `git diff --quiet $VERCEL_GIT_PREVIOUS_SHA HEAD -- .`; when Vercel's clone lacks that commit the diff errors and the build
   runs, so it can only skip, never miss a change). 39 of 118 pushes in the week to 27 Oct touched no frontend file, and each
   deploy costs a screenshot sweep (~30 calls).

## Steps (depth-first: each ships and is measured before the next)

| Step | What | Done when |
|---|---|---|
| P0 | `ignoreCommand` (design 7). (The `--live` usage lines shipped 27 Oct: Vercel's API gives Fluid Active CPU only to paid Observability Plus, so they print the 30-day allowances and Sofix's last-hour function time, CPU's ceiling) | a backend-only push shows "Ignored Build Step" on Vercel |
| P1 | One page end to end: **Fixtures** (board, no clock): week path, rewrites, static + tags | second view `x-vercel-cache: HIT` on production, no function event in the request logs; `?w=` bookmark lands on the same week; publish shows new data within a minute; spec + 1440/390 look |
| P2 | Other board pages: Difficulty, Table, Season, Team | same checks for each |
| P3 | Clock pages: Play, Lineups, Scores, Home (countdowns to the client; clock pings at locks) | same, plus countdowns tick and the bare address rolls to the next week at the boundary without a deploy |
| P4 | Cards, Players, player pages, Stats, Prices, Missions, Arcade, Audit pages, Control | same checks; list pages keep pagination (12 a page) as client state |
| P5 | Measure 7 days | the usage page's Fluid Active CPU for Sofix under 1 min on a normal day, and the `--live` last-hour line under budget after normal use; result written under the roadmap's Results |

Each step: test-first where behavior changes (rewrites map every legacy parameter to the same week: a unit test over
`next.config` rewrites and `lib/weeks.ts`), `node scripts/check.mjs`, the page spec, the 1440/390 look on the local dev server,
`next build && next start` click-through (AGENTS.md "Pages"), then push and `--live`.

## Risks and how they are handled

- **A stale "current week" after a rollover:** the clock pings revalidate at each boundary; `revalidate = 3600` is the backstop.
- **Publish storms** (near-lock checks every 30 min in the last 3 h): each publish costs one build per page viewed afterwards,
  not per view; still far below today.
- **ISR limits** (Hobby: 1M ISR reads, 200K writes a month; 45K reads used on 27 Oct): ~20 pages x a few weeks x publishes a
  day stays in the low thousands of writes.
- **Next's 2 MB cache item limit:** already handled by reading big payloads in pieces (`readModelAt`).
- **Private data baked into a cached page:** Sofix has one user and pages already show only his data; a
  cached page is served under the same access rules as a rendered one. P1 confirms the bypass header still works on a HIT.

## Owner decisions

None needed to start. The visible URL of a non-current week becomes `/play/w/<weekId>` (old `?w=` links still work); say if you
want the query form kept in the address bar instead (possible with a rewrite in the other direction).
