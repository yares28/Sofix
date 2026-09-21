# Sorare inside FixtureDiff — plan and tracker

Merge the SorareExt project (`C:\Users\Yaya\Desktop\PROJECTS\ExtentionSorare\SorareExt`) into FixtureDiff:
bento home page, My cards, Player search, Lineups & Optimize, Predicted vs actual, and an overlay on sorare.com
styled like SorareInside. LaLiga clubs only, plus their European games.

Every phase has two parts:
- **A · Think & show**: what is being done, what was found, the solution, and a design preview in
  `docs/sorare/design/` that the owner approves.
- **B · Build**: code, tests, docs. Starts only after A is approved.

**Status key:** ✅ done · 🟡 in progress · ⬜ to do.

## Decisions (answered 2026-09-21)

| Topic | Decision |
|---|---|
| Saving lineups | **Apply saves straight to Sorare** through the logged-in sorare.com session, one click per competition. Nothing saves on its own. |
| Where Sorare data lives | **Neon**, next to everything else. Written in batches, only when something changed. |
| Cash vs essence | **Both count, never converted into each other.** Cash stays in $, essence stays in essence. The optimizer shows both and balances them (see S6). |
| Login | No OAuth, no password. Public data uses the API key; private actions use the sorare.com session inside the extension. |

## Phase overview

| Phase | Theme | A · Think & show | B · Build |
|---|---|---|---|
| S0 | What Sorare allows | ✅ | ✅ (discovery only; nothing to build) |
| S1 | Foundation: always on, nothing to start (cloud) | 🟡 v2 | ⬜ |
| S2 | Home page (bento) | ⬜ | ⬜ |
| S3 | Data sync (public + your cards) | ⬜ | ⬜ |
| S4 | xScore model | ⬜ | ⬜ |
| S5 | My cards and Player search | ⬜ | ⬜ |
| S6 | Competitions and Optimize | ⬜ | ⬜ |
| S7 | Overlay on sorare.com | ⬜ | ⬜ |
| S8 | Predicted vs actual | ⬜ | ⬜ |
| S9 | Hardening and retiring SorareExt | ⬜ | ⬜ |

---

## S0 — What Sorare actually allows ✅ (2026-09-21)

**Done:** downloaded Sorare's full public schema (`https://api.sorare.com/federation/graphql/schema`, 1,067 types;
introspection itself is switched off) and ran live read-only queries with the existing API key (about 40 requests in total).
Nothing was written to Sorare.

### Findings

1. **Almost everything is public with the API key** (200 requests/min, max 30,000 complexity and depth 12 per query:
   one query that asked for all leagues with their rules hit 70,003 and was refused, so queries must be split).
   - Every competition of a gameweek, with its rules, scoring bonuses, lock type and reward table.
   - Your cards by username (`user(slug: "yares")`, 93 Limited/Rare cards): owned since, sealed, for sale
     (`liveSingleSaleOffer`), in an offer (`sentInLiveOffers`), bonus multiplier (`power`), level, in-season flag,
     and every competition each card can enter (`eligibleUpcomingLeagueTracks` with `canCompose`).
   - Past rankings with scores: e.g. LaLiga Limited, 15–18 Sep: 3,679 lineups; rank 51 = 440.9 pts,
     rank 151 = 406.6, rank 651 = 330.8, rank 1,501 = 268.9.
   - **Sorare's own projection for every game, kept after the game**: `PlayerGameScore.projection { score grade }`.
     It is a "score if he plays" (players who didn't play still carried 45). So its accuracy can be measured
     on past seasons before it is used.
   - Starting chances: `Player.nextClassicFixturePlayingStatusOdds` (starter / sub / not playing). Empty
     today because no LaLiga gameweek is open yet; recheck when GW21 opens (≈ 7 Oct).
   - Player photos (`avatarPictureUrl`, `squaredPictureUrl`), club crests, card images: free, hosted by Sorare.
2. **Needs your sorare.com session** (Sorare's docs say outside apps can't see future lineups or claim rewards):
   saving a lineup (`createOrUpdateSo5Lineup`, plus `previewSo5Lineup` that checks it first), your current
   lineups for upcoming gameweeks, Hot Streak progress (`myThresholdsStreakTasks`) and Arena room results.
   The extension does these from the sorare.com page, like SorareInside does. No OAuth needed.
3. **Competitions a LaLiga card can enter (GW21, 9–13 Oct):**

   | Sorare name | Short name | Cards | Key rules | Bonuses |
   |---|---|---|---|---|
   | LALIGA EA SPORTS – Limited/Rare/Super Rare (in-season) | **Pro · LaLiga** | 5 + 2 subs | min 4 in-season cards, LaLiga players only, whole lineup locks at gameweek start | captain +50%, in-season +5%, level +1%/level, rarity (Rare +10%, SR +40%), max 2 per club +2%, recent-average total ≤ 260 +4% |
   | Cap 260 (LaLiga, any season) | **Arena · LaLiga · Cap 260** | 5 | sum of recent averages ≤ 260, rooms of 10 | captain +20% only |
   | Champion – Limited/Rare/… | **Pro · Champion** | 7 + 2 subs | Big-5 league players | same as Pro LaLiga, total ≤ 370 +4% |
   | All Star – Limited/Rare/… | **Pro · All Star** | 7 + 2 subs | any league | same as Champion |
   | All Star Arena: Cap 260 / Cap 220 / Uncapped / Elite / Beginner | **Arena · All Star · …** | 5 | cap as named | captain +20% |
   | Under 23 (+ its Arena Cap 260) | **Pro · U23** / **Arena · U23** | 7+2 / 5 | age ≤ 23 | as above |

   - LaLiga has **no in-season Arena** this season (only MLS, J1 and K League do). "Arena out of season" = the
     any-season Arena competitions above; "Pro" = the non-Arena ones.
   - **Double gameweeks:** the scoring engine says `multiGameScoreAggregator: "max"`, so a player's best game counts.
   - **Lock times differ:** Pro locks the whole lineup at the gameweek cutoff (`FIXTURE_CUT_OFF`);
     some Arena competitions lock per lineup (`LINEUP_CUT_OFF`).
4. **Rewards:** tables are published a few days before the gameweek (GW21's are still empty).
   - Pro LaLiga Limited (15–18 Sep): ranks 1–50 cash ($2,000 → $10), ranks 51–1,500 essence (2,000 → 250 Limited),
     ranks 1,501–3,500 XP only.
   - Arena LaLiga Cap 260: rooms of 10; 1st 1,300 essence, 2nd 800, 3rd 500, 4th–5th XP.
   - Hot Streak thresholds (fixed score targets) are per manager and need the session.
5. **Calendar:** Sorare gameweeks 16–20 (22 Sep – 9 Oct) are an international break with no LaLiga competitions.
   The first LaLiga gameweek is GW21, cutoff 9 Oct 14:00 UTC. `nextGame` also returns Nations League games, so
   club and national-team games must be told apart.
6. **European games:** Sorare's game lists include every game of a LaLiga club; ClubElo (free, no key) rates the
   European opponents. No Odds API credits are used for Europe.
7. **How a lineup scores (checked on a real top-3 lineup, GW14):** total = Σ score × card bonus, captain bonus added to
   the captain's multiplier (1.12 + 0.50 = 1.62). The 2 subs only count when a starter doesn't play.
8. **Arena rooms** are separate leaderboards reachable through `so5Fixture.so5LeaderboardsPaginated` (GW14: 52 full
   LaLiga Cap 260 rooms). 3rd place (last essence spot) needed 239–313 points in the sampled rooms.
9. **Your cards (yares):** 76 LaLiga Limited/Rare cards; 2 sealed (Rodrygo) are excluded automatically. **No Rare
   goalkeeper**, so no Rare competition can be entered; your Rare cards still play in Limited competitions.
10. **Sorare gameweeks ≠ LaLiga matchdays:** GW14 held only 8 of matchday 6's games. Eligibility must use Sorare's own
    game list per gameweek, never the matchday.

### Edge cases found in S0 (carried into later phases)

- A card's eligibility list includes competitions whose cutoff has already passed: always filter by cutoff date.
- Sealed cards, cards for sale or in an offer, cards already in another lineup the same gameweek: excluded.
- The Pro "recent-average total ≤ 260" is a **bonus** (+4%), not a limit; Arena's "Cap 260" is a **limit**.
- Rarity mixing: a Limited competition also accepts higher rarities, but the rarity bonus is 0 there.
- Captain rarities are restricted per competition (`captainRarities`).
- Promoted clubs (e.g. Racing Santander) are already `laliga-es` in Sorare.
- Complexity limit: sync queries must be paged and kept under 30,000.

### Design

`docs/sorare/design/S0-competitions.html` (v2, 2026-09-21): the **Play** page built on real data. Gameweek
timeline (GW13–15, break, GW21), Limited/Rare switch, "best play" hero with reward chance, xScore range and the score
needed, a fan of the lineup's real cards, stats strip, every competition auto-optimized, lineup sheet with card art,
fixtures from FixtureDiff's model, and past gameweeks replayed (scored vs xScore vs Sorare's projection).
The preview optimizer (`scratchpad/build_preview.py`) is a throwaway prototype of S4/S6, not the shipped model.

---

## S1 — Foundation: always on, nothing to start

### A · Think & show (v2 cloud, 2026-09-21, waiting for approval)

v1 planned a Windows launcher on this PC. The owner found the design basic and asked whether GitHub + Vercel
would be simpler. **It is**, so v2 replaces the launcher.

**Found**
1. **No git remote, so the GitHub Actions schedule has never run.** All 13 refreshes in Neon were started by
   hand; the last 6 took 5.9–16.1 s. Pushing to a private GitHub repo makes the existing `refresh.yml` and
   `ci.yml` run as written.
2. **Vercel can lock the whole app to you for free.** Vercel Authentication covers *all* deployments,
   production included, on the Hobby plan with no add-on. Only your Vercel account can open it, and we write
   no login code. Protection Bypass for Automation (free on every plan) gives the jobs and the extension a
   revocable secret to reach it. Password Protection costs money and isn't needed.
3. **The Python API isn't needed in production.** Jobs already compute everything, so they write each page's
   finished data (the grid today, Sorare data later) into Neon, and the Next.js app reads it (cached,
   revalidated when a job ends). FastAPI stays for local development until S9.
4. **Free limits fit:**
   - GitHub Free has 2,000 Actions minutes a month for private repos. Planned use is about 900: board refreshes
     ≈ 70 runs, Sorare every 6 h ≈ 120 runs, plus CI.
   - Vercel Hobby covers a personal app.
   - Neon: 9.4 MB of 512 MB, awake 6.1 h this month. It gets woken less than today, because pages are served from cache.
   - Odds API: 486 of 500 credits left.
5. **SorareInside's session trick** stays the plan for private Sorare actions: a page script watches Sorare's
   own GraphQL requests and reuses their address and login headers, inside a sorare.com tab. No token is stored,
   no OAuth. The cloud app never sees your Sorare login.
6. **The one manual step left is Chrome's "Load unpacked"**, once. Chrome blocks store-less installs on
   personal PCs.
7. The old SorareExt engine isn't running. Its API key moves into GitHub secrets.
8. On this PC: Vercel CLI 50.1 is logged in as `yares28`. The GitHub CLI isn't installed. Git's author is the
   placeholder "Your Name" and needs your real name before anything is pushed.
9. The CSP only allows crest images: add `assets.sorare.com`.

**Design:** `docs/sorare/design/S1-foundation.html` (v2):
- "How it runs": an animated map of GitHub → Neon → Vercel → you, with the extension linking to sorare.com.
- **Control Center**, opened from the heartbeat pill in the top bar:
  - status orb with a heartbeat line;
  - a 24-hour dial of today's jobs;
  - bars for the last refreshes (real);
  - the connection chain;
  - "liquid" capsules for each free limit.
- **Get the app**: laptop and phone, the install flow, and a QR code.
- **The one Chrome step**: an animated walkthrough of `chrome://extensions` in sync with the steps.
- Extension popup in both states.

### B · Build (after approval)
- ⬜ **GitHub.** Private repo, first push, and secrets: app-role DB URL, football-data token, Odds key,
  Sorare key, revalidate secret, bypass secret. CI and the refresh schedule start running.
- ⬜ **Read models.** A `read_models` table (key, JSON payload, updated_at) via Alembic. The refresh job writes
  the grid payload there, then calls the app's revalidate route.
- ⬜ **Next.js reads Neon directly.** Serverless driver, cache tags, Zod validation as today.
- ⬜ **Refresh button.** Starts the GitHub workflow (fine-grained token, server-side only) and shows live
  progress. Actions `concurrency` keeps one run at a time; the 10-minute cooldown stays.
- ⬜ **Vercel project.** Root `frontend/`, env vars, Vercel Authentication on *all* deployments, and a bypass
  secret for the jobs and the extension.
- ⬜ **Installable app (PWA).** Manifest, icons and install prompt on the PC; "Add to Home Screen" on the phone.
- ⬜ **Control Center in the app.** Heartbeat pill plus a sheet built on real data: runs, schedule,
  connections, limits.
- ⬜ **Extension base (MV3, TypeScript + Vite).**
  - Fixed ID, the app's URL, its token and the bypass secret.
  - Popup as designed.
  - `externally_connectable` for the app.
  - Session watcher that keeps everything in memory only.
  - Check-ins only when something changes, at most every 30 min, so Neon isn't woken for nothing.
- ⬜ CSP adds `assets.sorare.com`. Tests (pytest + vitest), docs, and CLAUDE.md's architecture section rewritten.

**Edge cases:**
- A scheduled GitHub run starts a few minutes late or fails: the app keeps the last good data and the
  Control Center shows the failed step.
- Neon paused by a free limit: cached pages stay up, with a "database paused until 1 Oct" banner.
- Vercel login expires: Vercel asks you to sign in again.
- The bypass secret skips Vercel's login. It gets its own secret (revocable), and the app's extension routes
  still check their own token.
- The extension can't reach the app (offline): it retries later. Saving on sorare.com doesn't depend on the app.
- Jobs and pages must never mix model versions: a read model is replaced in one transaction.

## S2 — Home page (bento)
- ⬜ A: design. ⬜ B: `/` bento; Fixtures, Difficulty, Table move to their own routes; `?gw=` kept.

## S3 — Data sync
- ⬜ A: design of the sync status and data freshness.
- ⬜ B: public sync with the refresh: LaLiga players, Sorare scores + Sorare projections history, injuries,
  suspensions, gameweeks, competitions, rules, rewards, past rank cut-offs, your cards (by username).
- ⬜ B: extension sync: your current lineups, Hot Streak progress, Arena rooms.
- ⬜ B: ClubElo ratings for European opponents (once a day).

## S4 — xScore model
- ⬜ A: design of the xScore display (average + bad / average / good range).
- ⬜ B: chance of playing (Sorare starting chances + minutes history + injuries).
- ⬜ B: score if he plays, from Sorare's projection, the player's history and our match model (team goals,
  clean sheets), blended with weights fitted on past seasons.
- ⬜ B: blind replay vs real Sorare scores; ships only if it beats Sorare's own projection or matches it with a better range.

## S5 — My cards and Player search
- ⬜ A: designs. ⬜ B: pages.

## S6 — Competitions and Optimize
- ⬜ A: design, including how cash and essence are both shown without converting.
- ⬜ B: optimizer (rules from Sorare, each card once per gameweek, chance of reaching each reward rank from past cut-offs
  and simulated scores), Optimize button, Apply through the extension.

## S7 — Overlay on sorare.com
- ⬜ A: design matching SorareInside (ribbons, drawer). ⬜ B: build.

## S8 — Predicted vs actual
- ⬜ A: design. ⬜ B: per player and per lineup review, weekly summary, correction gate.

## S9 — Hardening
- ⬜ e2e with a fake Sorare, security review, CLAUDE.md and docs, retire SorareExt.
