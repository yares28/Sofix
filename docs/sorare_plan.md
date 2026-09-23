# Sorare inside Sofix — plan and tracker

Merge the SorareExt project (`C:\Users\Yaya\Desktop\PROJECTS\ExtentionSorare\SorareExt`) into Sofix:
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
| S1 | Foundation: always on, nothing to start (cloud) | ✅ | ✅ (3 owner steps left) |
| S2 | Home page (bento) · v2: the whole gameweek | ✅ v1 · ✅ v2 | ✅ v1 · ✅ v2 |
| S3 | Data sync (public + your cards) | 🟡 waiting for approval | ⬜ (public sync moved into S2 v2) |
| S4 | xScore model | ⬜ | ⬜ |
| S5 | My cards and Player search | ⬜ | ⬜ |
| S6 | Apply (save lineups to Sorare) | 🟡 waiting for approval | ⬜ (the optimizer shipped in S2 v2) |
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
fixtures from Sofix's model, and past gameweeks replayed (scored vs xScore vs Sorare's projection).
The preview optimizer (`scratchpad/build_preview.py`) is a throwaway prototype of S4/S6, not the shipped model.

---

## S1 — Foundation: always on, nothing to start

### A · Think & show (v2 cloud, approved 2026-09-21)

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

### B · Build ✅ (2026-09-21)
- ✅ **GitHub**: public repo `yares28/Sofix`, all earlier work committed, Actions secrets set (app-role DB URL,
  football-data token, Odds key, app address, revalidate secret, Vercel bypass, Sorare key). CI and the
  refresh schedule now run on GitHub; CI's Python setup fixed (the runner has no system 3.11).
- ✅ **Read models**: `read_models` table (tested on Neon `dev`, then production); the refresh job's `publish`
  step writes the board and the status numbers, then pings the app's `/api/revalidate`.
- ✅ **Next.js reads Neon directly** (`lib/db.ts`); FastAPI only for local dev.
- ✅ **Refresh button → GitHub workflow** (`lib/github.ts`); needs a fine-grained `GITHUB_TOKEN` on Vercel (owner step).
- ✅ **Vercel** project `sofix` (root `frontend/`, auto-deploy on push) at https://sofix-yares.vercel.app,
  locked to the owner's Vercel login (all deployments), bypass secret for the jobs and the extension.
- ✅ **Installable app**: manifest, stripe icons, iPhone home-screen icon.
- ✅ **Control Center** in the nav, built from real data (runs, schedule, connections, limits).
- ✅ **Extension base**: fixed ID, session bridge (memory only), check-ins on change / every 6 h, popup,
  `ping` for the app; `node extension/scripts/configure.mjs` generates its config.
- ✅ Renamed to **Sofix** everywhere (the local folder keeps its old name).
- ✅ Found and fixed on the way: the published "last synced" time lagged one run behind.

**Second pass (2026-09-21, after the owner found S1 unfinished).** Screenshots of the live app showed:
1. **The Control Center opened off-screen.** The nav's `backdrop-filter` makes it the containing block for fixed
   elements, so the sheet was centred on the 52 px bar: cut off on the PC, invisible on the phone. The browser test
   only checked that the dialog existed. Now it is a page, `/control`, opened by the pill.
2. **Installing the app could not work.** Vercel's login also guards `/manifest.webmanifest`, and browsers fetch a
   manifest without cookies unless its link says `crossorigin="use-credentials"`, which Next adds only on preview
   deployments. The manifest is now a route, linked with credentials by the layout.
3. **Half the approved design was missing:** the "1 step left" state, the Chrome step, Get the app and How it runs.
   All are built now:
   - the Chrome step: acted out, with Copy buttons, and live: the page pings the extension, so it turns to "done"
     when you come back to the tab;
   - Get the app: Chrome's own Install button where it exists, the right words elsewhere, and a QR code of the
     address, checked by decoding it;
   - How it runs: the map, drawn as a column on phones.
4. **Also:** the refresh-bar dates overlapped (now "16/9"); "0 of 8 on schedule" counted runs the bars didn't show;
   the Refresh key has a pre-filled GitHub link; a paused Neon (free limit) now says "Database paused, back on 1 Oct"
   instead of failing silently.
- ⬜ Owner: load the extension once, install the app on PC and phone, create the GitHub key for the button
  (all three are cards in the Control Center).

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

### A · Think & show (2026-09-22, approved)

**Done:** read the live app's numbers (standings, predicted table, the ranking, the gameweek's forecasts) and
Sofix's grid as published to Neon; reused the Sorare data from S0; built the page on them.

**Found**
1. **The board needs nothing new.** Everything the three big tiles show is already in the cached grid the board
   reads, so the home costs no extra Neon reads. The ranking behind the Difficulty tile matches the live app
   exactly (Barcelona 10.5 expected points over GW8–GW12, Málaga 4.4).
2. **LaLiga stops for an international break, 21 Sep – 8 Oct.** GW8 is on 9–12 Oct. The gameweek timeline shows
   the gap as a hatched block, like S0's.
3. **Sorare's gameweek numbers aren't LaLiga's.** LaLiga GW8 is Sorare GW21. The home keeps LaLiga's numbers
   everywhere; the Play tile names the Sorare gameweek. Sorare's lock time only arrives with S3, so until then
   the countdown runs to the first kickoff.
4. **The bottom three isn't the likeliest relegation three.** On points it's Elche, Valencia and Málaga. On chance
   it's Málaga 97%, Racing Santander 76% and Valencia 30%. The Table tile shows the chances.
5. **The Sorare tiles have no data before S3, S6 and S8.** They are built now, in a waiting state that says what
   fills them. No invented numbers.
6. **S0's rough xScore missed by more than Sorare's own projection** (replaying GW13–14: 44 points a lineup
   against 25). The Predicted vs actual tile makes that comparison visible, and S4 has to win it.
7. **Sorare opens competitions only a few days ahead**, so for GW9 and later the Play tile says "Not open yet".
8. **Five pages need a way around on the phone.** The installed app has no browser bar, so phones get a bottom tab bar.

**Design:** `docs/sorare/design/S2-home.html`. Switch "After S2 / All phases" to see the Sorare tiles waiting or filled.
- Head: "Gameweek 8", dates and match count. The one hero number is the days to the Sorare lock (to kickoff
  before S3). On a played gameweek it becomes the number of shocks (results we gave under 30%).
- The gameweek timeline from S0: every gameweek, played ones grey, the next one blue, the break hatched.
- **Fixtures**: the gameweek by day, crests, a win/draw/win bar and the favourite's chance. On a played
  gameweek: scores, the chance we gave each result, "shock" under 30%.
- **Difficulty**: the easiest run as the tile's number, then every club's next five games as one colour mosaic,
  easiest first, the hardest named at the bottom.
- **Table**: the title favourite's chance, the title race as one bar, the top four with form, and the three
  likeliest to go down.
- **Sorare** row: Play (reward chance ring, lineups, essence and cash side by side, the best competition with its
  chance and a fan of the real cards), My cards (playable count, Limited and Rare as foil chips, cards by
  position, why Rare is locked), Predicted vs actual (inside the range or not, per lineup, against Sorare's projection).
- Each tile opens its page. The phone stacks the tiles and adds the tab bar.

### B · Build ✅ (2026-09-22)
- ✅ `/` Home: head with the hero number, gameweek timeline (`?gw=`, every gameweek, breaks hatched), the three
  board tiles from the cached grid (no extra database reads; the title and relegation chances are cached per grid).
- ✅ Sorare row in its waiting state (filled by S3, S6 and S8).
- ✅ Board views moved to `/fixtures`, `/difficulty` and `/table`, keeping every other URL setting; old
  `/?view=…` links redirect. Switching tabs stays instant: the board rewrites its own address.
- ✅ Nav: links on the PC, tab bar on the phone.
- ✅ Tests: unit (head states, timeline, fixtures, mosaic, table, old links), e2e (home, timeline, tiles open
  their pages, old links redirect, top-bar links follow the tabs, phone tab bar, accessibility).

**Changed from the design while building (from the real data):**
- A shock is the board's own definition (a surprise under 0.2, the same as the grid's "shock" mark), not "a
  result we gave under 30%". GW7 had 0 by that rule, where the preview's rule counted 4.
- "Played" follows the backend's matchday flag, and "under way" starts at the gameweek's first regular kickoff.
  Otherwise one game moved weeks later (Levante v Athletic, GW6, now 21 Oct) would keep GW6 "live" for a month.
- Breaks are labelled "Break", not "International break": the data doesn't say why LaLiga pauses. A second one
  (9–21 Nov) is on the timeline too.

**Edge cases:**
- A played gameweek shows results, not forecasts.
- Kickoff times TBC.
- Postponed games: Athletic and Levante have played 6. A club with two games in a gameweek gets both in its cell.
- A club with no game that gameweek gets an empty cell.
- The last gameweeks of the season have fewer than five columns.
- Before any game is played, the Table tile shows the pre-season projection.
- While a gameweek is live, the head says "Live" instead of the countdown.

### A · Think & show (v2, 2026-09-22) — the whole gameweek, every competition you can play

The owner: *"I didn't mean show me only LaLiga competitions… show me a full gameweek, the best lineups for LaLiga
and the rest in out-of-season competitions by the chance of a reward, the top 5 full-gameweek lineups. Don't show
competitions I can't play. Substitutions in Arena have to be in-season cards, and check how they get subbed in.
The mobile layout feels bare bones."* LaLiga stays the board's subject; the Sorare side plays everything it can.

**Done:** read-only Sorare calls with the existing key (about 350): every competition of GW15–GW21 with its rules
(sub slots included), rewards and entry fees; the owner's 93 cards with what each can enter; every game score and
Sorare projection of his players this season; past reward cut-offs; 200 sampled rooms of 10. Then a prototype of the
planner (`scratchpad/planner_proto.py`, moves to `backend/app/sorare/` in B) built the plans on that data.

**Found**
1. **Sorare changed the game this season ("Sorare 27").** Three shapes, all read from the API's own rules:
   - **In-season** (LaLiga, Contender, Premier League…, and the MLS/J1/K-League arenas): 5 cards **+ 2 subs**,
     at least 4 in-season cards (so at most 1 Classic), up to **4 lineups** each, cash + essence by rank.
   - **Classic** (All Star, Champion, U23): 7 cards **+ 2 subs**, any season, up to 4 lineups, essence and cards.
   - **Rooms of 10**: 5 cards, **no subs**, an entry fee in essence (Beginner 100, Cap 220 200, Cap 260 and
     Uncapped 300, Elite 800), paying the top 3 of the room.
2. **Subs: how they actually come in.** One goalkeeper sub and one outfield sub. A sub only replaces a starter who
   **did not play at all** (a late cameo counts as playing): goalkeeper for goalkeeper, outfield for the same
   position or for anyone in the Extra slot. Checked against Sorare's own rule checker
   (`lineupLiveFeedbacksRules`): it *accepts* a Classic card as a sub in an in-season lineup, but the "4 in-season"
   rule is checked on the lineup, so a Classic sub can only come in while 4 in-season cards remain — which is why
   Sofix only picks **in-season subs** there, exactly as the owner said. When a sub comes in the lineup loses its
   multi-club (+2%) and average-cap (+4%) bonuses, and a sub never inherits the captain's +50%. All of it is
   simulated, so the chance of a reward already contains it.
3. **What the owner can actually play, gameweek by gameweek.** GW15 (the last LaLiga weekend): 9 competitions;
   GW17 (this international break): 6, all All Star, because only 13 of his 84 cards have a game (10 on Nations
   League duty, 3 in Segunda); GW21 (LaLiga back, 9–13 Oct): 9 again, every card playing. Hidden with the reason:
   every Rare competition (no Rare goalkeeper), U23 (no goalkeeper aged 23 or under), Premier League and Bundesliga
   (no goalkeeper or midfielder there), Contender (no goalkeeper in its leagues).
4. **Rooms are usually a bad deal for these cards.** All six open in GW15 were playable, and all six lose essence on
   average (Cap 260 −163, Elite −435, LaLiga Cap 260 −12): the entry fee is higher than what the lineup can expect
   to win back. They are shown in "Also open, not worth it" with the number, never hidden.
5. **A full gameweek is a trade-off, not a list.** Each card plays once per gameweek, so a LaLiga in-season lineup
   and an All Star one fight over the same players. The planner searches lineups per competition under every rule,
   then builds whole-gameweek plans and keeps the **5 best that differ from each other**. Plan 1 for GW15: three
   LaLiga lineups plus two All Star, 38 of 84 cards, ≈511 essence and ≈$1.47 expected, 83% chance of at least one
   reward.
6. **Cash and essence are never converted.** Plans are ranked on both at once: each plan is scored against the best
   cash and the best essence any plan reaches that gameweek, equally weighted.
7. **Timing, and why the home can't show GW17's plan yet.** Sorare publishes its projections about two days before
   the lock (GW17: Wed 23 Sep, 20:00) and the rewards a few days before that. Reward chances also need the scores
   that paid in a comparable gameweek — GW16 is the first break week under the new rules, so GW17's chances arrive
   with GW16's results. The home says so with the countdown instead of inventing numbers.
8. **The replay is honest about the forecast.** GW15 was planned with only what was known before its lock (each
   player's last five games), which misses by 17.6 points a player. Four of plan 1's five lineups landed inside the
   predicted range, but all five fell short of the bar (282 against the 313 that paid), so it would have won
   nothing; plans 2 and 3 would have won 250 essence. The live app will use Sorare's own projections and starting
   chances instead, and S4 has to beat them.

**Design:** `docs/sorare/design/S2-home-v2.html` (toggles: Home / Play, Today / Plan ready, PC / Phone).
- **Home, plans ready:** the gameweek and the time to the lock as the one hero number, then one wide Play tile —
  ring with the chance of any reward, essence and cash side by side, where the cards go, plans 2–5 as chips, and
  plan 1's lineups with their xScore and chance.
- **Home, today:** the same tile in its waiting state — 13 cards play, who they are and against whom, the six
  competitions with their fees and how many lineups each allows, and when the plans arrive — beside "Last
  gameweek", the predicted-vs-actual strip for GW15.
- **Play page:** the Sorare gameweek timeline, a plan switch (five plans, each with its chance and essence), the
  plan hero, and a card per lineup: xScore with the bad–good range, the score that pays, the chance, the reward
  chips, the cards with the captain and the in-season marks, the subs. Tapping one opens the lineup sheet: card
  art, each player's fixture, chance of playing, multiplier, the rules ticked off and the reward ladder with the
  chance of each step. "After the games" replays the same page with real scores, who came in for whom and what it
  won. "Also open, not worth it", "Not playable" and "How subs and plans work" are folded underneath.
- **Phone:** everything reflows — the lineup cards hold the whole lineup as overlapping card art, the plans become
  a swipe row, LaLiga's three tiles become one card with a Fixtures / Difficulty / Table switch, and the tab bar
  gains Play.

### B · Build (v2)
- ✅ Sorare sync in the refresh job (public API, key only): gameweeks, competitions with rules/rewards/fees, past
  cut-offs, sampled rooms, the owner's cards, his players' scores, Sorare projections and starting chances →
  `read_models` (pulled forward from S3). `backend/app/sorare/{client,sync,forecast}.py`,
  step `sorare` in `app.jobs.refresh`, or `python -m app.jobs.sorare` on its own.
- ✅ Planner in `backend/app/sorare/{model,rules,planner}.py`: beam search per competition under Sorare's own
  rules, 3,000 simulated gameweeks with the substitution logic, reward chances read from a comparable finished
  gameweek, then whole-gameweek plans (each card once) ranked on cash and essence side by side. Benches are
  optional: a card only sits on one when the lineup is worth more with it than the bonuses it risks.
  38 unit tests (`backend/tests/test_sorare_planner.py`, `test_sorare_publish.py`).
- ✅ `/play` page and the home's Sorare row (Play, Last gameweek, My cards), the phone layout, and the whole page
  server-rendered from one cached read (`frontend/lib/play.ts` + `playData.ts`, 19 unit tests).
- ✅ Browser tests: `frontend/e2e/play.e2e.ts` (10) and two phone tests, against a recorded gameweek
  (`e2e/fixtures/sorare-response.json`) served by `e2e/mock-api.mjs` — no Sorare, no Neon.
- ⬜ Apply (saving lineups to Sorare) stays in S6/S7 with the extension.

**What the job costs.** A warm run is 135–180 calls in 65–175 s: the cut-offs of past gameweeks are kept in
`read_models` key `sorare_references`, and a finished gameweek's replay is kept from the payload the app is
already showing (gated by `publish.PAYLOAD_VERSION`, so a change to the payload rebuilds it once).

## S3 — Data sync

### A · Think & show (2026-09-23)

**Done:** took stock of what Sofix already holds after S2 v2, how often each piece really changes, what a run
costs, and what Sorare will still hand over later — and what it won't.

1. **Most of the public side is already synced**, by the `sorare` step: gameweeks, competitions with their rules,
   fees and rewards, past rank cut-offs, sampled rooms of 10, the 96 cards of `yares` (87 playable), and each of
   his players' recent scores, Sorare's projection and its starting chances. The whole Sorare state is **172 KiB**
   in two `read_models` rows; the database is 9.6 MiB of 512, so 98% of Neon is still free.
2. **Freshness has five clocks, not one.** Cards change when he buys or sells; competitions once a gameweek;
   projections and starting chances from about two days before the lock and then right up to it; scores while the
   games are on; reward cut-offs only when a comparable gameweek finishes. One "last synced at" would be
   misleading, because the only clock that decides whether a plan is still the best one is the third.
3. **Sorare's projections can't be recovered later.** The API serves a player's *next* fixture projection only
   (`nextClassicFixtureProjectedScore`), so once a gameweek is played the numbers it was planned against are gone.
   That is why the GW15 replay had to fall back to the last five games and missed by 17.6 points a player. Every
   run that doesn't record them loses them for good, and S4 cannot be proven against them without a record. It
   costs about **2 MB a season**, so this is the one piece that shouldn't wait.
4. **The cloud has never run the Sorare step.** It shipped today at 16:29 Madrid; the scheduled runs are 09:17 and
   00:43 daily (plus Tue 15:23 and Fri 19:23). The first attempt is 00:43 tonight — and if `SORARE_API_KEY` is not
   in the repository secrets the step logs "skipped" and the page keeps serving the plan this PC wrote, silently.
   A line saying "updated 2 h ago" cannot tell those two cases apart; the status has to name **who wrote it**.
5. **Four runs land before GW17 locks** (Thu 00:43, Thu 09:17, Fri 00:43, Fri 09:17), the last one 6 h before it.
   That is the question worth answering on screen — "will this be rebuilt before I have to act" — not "how old is it".
6. **The private half can't start yet:** the extension has never checked in (no `extension` row), so the lineups
   already saved on Sorare, Hot Streak progress and his own Arena rooms are out of reach. Rooms are sampled
   publicly instead, which is enough for the reward chances but not for "what did I actually enter".
7. **Injuries and suspensions stay out.** Sorare's starting chances already price them in, and the planner reads
   those, so a separate feed would add a second opinion without a way to judge it.
8. **What a run costs:** 140–180 calls in 1–3 minutes warm; about 1,000 calls in 10 minutes cold (first run, or
   after `publish.PAYLOAD_VERSION` changes and the replay has to be rebuilt).

**Design:** `docs/sorare/design/S3-sync.html` — one page, one control (Now / Fresh / Moved), responsive.
- **The Control Center's Sorare panel** answers one question with one 76 px number: minutes since the gameweek was
  built, rebuilds left before the lock, or hours until the next one. Under it, who wrote it — the cloud or this PC.
- **The run line** runs from that moment to the lock, a dot per scheduled run, filled up to the last one that
  happened, an ink tick for the lock. It is the answer to "will this be rebuilt before I have to act".
- **Five clocks** underneath, each a label, a number and two or three words on when it changes next. No paragraphs.
- **Play** carries the same state: a chip in the head and, when the data is behind, an alert with the one action
  that fixes it. The plans stay on screen but dimmed — readable, impossible to mistake for current.
- The state sets `--tone` and everything follows it, including a radial glow on the panel. The preview opens on
  **what is true right now** — never run in the cloud — not on the happy state.

### B · Build
- ✅ Record Sorare's projections and starting chances on every run: table `sorare_forecasts`, one row per player
  per gameweek, overwritten while the gameweek is open and frozen at the lock, with what he then scored filled in
  afterwards (`app/sorare/record.py`, 8 tests). Players with no game in the gameweek are left out. The first run
  kept 83 rows for GW17, 11 of them with a Sorare projection — it is an international break, so most of the squad
  has no game. A gameweek nobody recorded before its lock stays a gap: rebuilding one from form would look like a
  record of what Sorare said, and it isn't.
- ✅ The Sorare panel in the Control Center and the chip + alert on Play, from a `status` block inside the same
  `sorare` payload (who built it, when the cloud last managed it, how many players Sorare moved, what the record
  holds). `lib/sorareStatus.ts` turns that into the state, the hero and the run line — 12 unit tests — and the run
  line's dots come from `lib/schedule.ts`, which already mirrors the workflow's crons.
  **One correction to A:** "Sorare has moved its numbers since this plan" cannot be known by the app, because every
  run rebuilds the plan from the numbers it just fetched. The middle state is therefore the one that *is* knowable —
  the plan was built **before Sorare published**, on each player's last five games — and `status.moved` is kept as
  what the last run found had changed, which measures churn rather than warning about anything. A plan the PC built
  minutes ago is also no longer dimmed: the warning is about tomorrow, not about that plan.
  **And a second one:** "the cloud has never synced Sorare" is not a fault until the cloud has actually had a turn.
  Until the first scheduled run after a build, the panel simply says whose turn is next (state `pending`, no alarm);
  only a run that came and went without writing is worth pointing at the repository secret, which is a different
  thing from the key in the local `.env` — that one only reaches runs started on this machine.
- ⬜ Players beyond your own cards — with S5, where they are first used.
- ⬜ Extension sync (your saved lineups, Hot Streak, your rooms) — with Apply in S6/S7, same session.
- ⬜ ClubElo ratings for European opponents (once a day) — with S4, where they feed the model.

## S4 — xScore model
- ⬜ A: design of the xScore display (average + bad / average / good range).
- ⬜ B: chance of playing (Sorare starting chances + minutes history + injuries).
- ⬜ B: score if he plays, from Sorare's projection, the player's history and our match model (team goals,
  clean sheets), blended with weights fitted on past seasons.
- ⬜ B: blind replay vs real Sorare scores; ships only if it beats Sorare's own projection or matches it with a better range.

## S5 — My cards and Player search
- ⬜ A: designs. ⬜ B: pages.

## S6 — Apply (the optimizer shipped in S2 v2)

### A · Think & show (2026-09-23)

**Done:** read Sorare's public schema for what saving a lineup actually takes, and checked what the extension can
already do. Nothing was written to Sorare.

1. **The extension already has the only thing Apply needs.** `bridge.js` notices the address and headers of
   sorare.com's own GraphQL calls, keeps them in memory inside its closure, and can ask Sorare a question as the
   signed-in manager (`SofixWhoAmI`). Saving a lineup is the same path with a mutation instead of a query. It
   checked in for the first time on 23 Sep at 21:42 (v0.1.0, `Yares`).
2. **Sorare's own API makes a safe Apply possible, in three steps:**
   - `previewSo5Lineup(appearances)` returns Sorare's verdict *before* anything is written: `feedbackRules`
     (rule name, state, message), the bonuses it will really apply, and `rewardMultiplier`.
   - `createOrUpdateSo5Lineup(input: { so5LeaderboardId, so5Appearances, draft, … })` — **`draft: true` saves the
     lineup without entering the competition.**
   - `confirmSo5Lineups(so5LineupIds)` enters the drafts.
   So the design is: preview, save as a draft, show Sorare's own words, and only enter on a second, explicit
   click. The first click can be undone; the second is the one that costs a card slot or an entry fee.
3. **What one lineup needs:** `so5LeaderboardId` — an ID, while the sync keeps the leaderboard *slug*, so one more
   field on the LEADERBOARD query — and per card `cardSlug`, `captain` and `index` (the slot), plus
   `composeTeamBenchObjectId` for a substitute. A room also takes `entryItemId`, its essence entry fee.
4. **Sorare will say when we are wrong, and that is worth showing.** The mutation returns
   `UserError { code, message, path }`, the preview returns a state per rule, and a leaderboard carries
   `canCompose: Validity` (missing cards, positions, rarities, and a reason). Our planner's rules and Sorare's
   have to agree; the preview is the proof, and a disagreement is a bug to show, never to hide.
5. **Only the browser can do it.** The API key is read-only; entering a lineup needs the sorare.com session, which
   only exists inside Chrome on the owner's machine. Apply is therefore the one thing in Sofix that cannot happen
   in the cloud, and the page has to say so when Chrome isn't there.
6. **A gameweek can't be entered twice by accident.** `createOrUpdateSo5Lineup` takes `so5LineupId` to update one
   that exists, and each competition has its own `teamsCap`. Apply has to read what is already entered and offer
   to update it rather than quietly adding another.
7. **Freshness matters here more than anywhere.** Applying a plan built before Sorare published its projections
   (S3's `waiting` state) means entering a lineup chosen on last-five-games form. The Apply sheet has to carry
   that state, not just the Play page's head.

### B · Build — planned
- ⬜ `so5LeaderboardId` in the sync and the payload.
- ⬜ Extension: preview → draft → confirm, each an explicit step, with Sorare's own errors surfaced.
- ⬜ The Apply sheet on Play: what will be entered, Sorare's verdict, what it costs, and what is already entered.
- ⬜ Never automatic: no lineup is ever saved or entered without a click for that competition.

## S7 — Overlay on sorare.com
- ⬜ A: design matching SorareInside (ribbons, drawer). ⬜ B: build.

## S8 — Predicted vs actual
- ⬜ A: design. ⬜ B: per player and per lineup review, weekly summary, correction gate.

## S9 — Hardening
- ⬜ e2e with a fake Sorare, security review, CLAUDE.md and docs, retire SorareExt.
