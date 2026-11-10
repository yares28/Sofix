# Sofix · what's left

Two lists: what only you can do, and what I do. Updated 2026-10-03.

The phase plan lives in [docs/sorare_plan.md](docs/sorare_plan.md) and the audit in
[docs/research_report.md](docs/research_report.md); this file is only the open ends.

---

## Order of work

**Moved to [plans/roadmap.md](plans/roadmap.md) (2 Oct 2026); its "Next up" list is the one queue of what comes next.** It merges every plan with steps left into one order, with a
"done when" and a check for each step: T1's xScore plan, the Futbol Fantasy plan's checks, the overlay's live pass, the open
boxes of S4, S6, S7, S8 and S9, T3 to T7, the review's follow-ups and the small things. This file keeps the full text of each
item, what you said and why; the order, the steps and the results live in the roadmap.

---

## Arcade: six fixes and features (you, 9 Nov 2026)

Your words: "1. The 40% play and 30% hold is very misleading, isn't it better to have a 100% bar and have both fighting for more %?
2. Cards have no fdr 3. Have a switch button in the chain section that lets me switch current chain to show all lineups with +15% of
chance to beat current and future steps 4. Pick teams prepick the teams instead of letting me pick the games 5. Batch show national
games (Playable in arcade) and the other pages don't 6. A lot of inconsistency issues in the arcade page and all its tabs, find them
all and their edge cases". On point 3 you added: "I just want to see the closest best lineups I can actually play for that step to
maximise me hitting the step and getting rewards, sacrificing speed." On point 1 you chose "share of the win".

Found by reading `components/arcade/*`, `lib/arcade*.ts`, `lib/climbClient.ts`, `app/arcade/page.tsx` and your real page on
localhost (9 Nov 2026, Divination, step 4 of 6, 687 commons, set ends 6 Jan). Order: broken first (A to C), then D to F, then G.
Each step ships alone, with its regression test, the Arcade spec and the 1440 + 390 px look.

**A · Every card shows FDR "—" (point 2, broken)** · *done 9 Nov 2026: 376 of 377 board games rated on your page (the other has no
forecast on the EL board), 52 Nations League games say "no Sofix board"; club names like "N.E.C. Nijmegen" / "N.E.C." now match.*
- Cause: `app/arcade/page.tsx` loads board fixtures for `FDR_DAYS = 8` days ("the set's days left, at most"), but Divination runs to
  6 Jan and your first club game is Fri 20 Nov, 11 days away (international break). On the real page all 22 cards shown had "—".
- Fix: load each board's fixtures to the set's end (the grids already hold the season; read only `fixture_id`, kick-off and both
  sides, a few hundred rows). Keep it on the server, never in a client prop larger than what the cards draw.
- Edges: a game with no board (Nations League, cups) says "no board", not "—" as if missing; a postponed fixture moved outside the
  20-minute match window; Sorare's "English League Players" slug still maps to PL (`premier-league-gb-eng`, checked).
- Done when: every LaLiga, PL, Bundesliga, Ligue 1, CL, EL and Conference card on the page shows its FDR for its exact game.

**B · National-team games are in Batch but nowhere else (point 5, broken)** · *done 9 Nov 2026, extension 0.4.67: 243 of your 687
cards have a national team; 33 Nations League games now hold your cards in Pick teams (338 games, from 305), the plan weighs them
(1% at step 4 on Thu 12 Nov, so it waits), Batch builds a team for Thu 20:45. Sorare's own lineup page listed your players in those
games first (Bellingham, Alexander-Arnold, Livaković).*
- Cause: an Arcade card knows only its club (`ArcadeCard.teamSlug` from `anyTeam`), so `outlooks` in `ArcadeView` never match a
  national game. Real page: 52 Nations League games, 0 with a card of yours; the planner, Pick teams and Players filter them out, Batch
  lists every game (`batchesOf` keeps unowned games) and then says "not enough available players".
- Fix: read each card's national team in the extension's card read (`activeNationalTeam { slug }`, as `backend/app/sorare/sync.py`
  already does); outlooks include a card in its national team's games too. Check first with one read-only request that Sorare lets
  that national game count for Arcade (Batch shows it, so the board lists it; confirm a national game is pickable on the compose page).
- Edges: a player with a club game and a national game the same week (two outlooks, the card used once per window); national games
  have no Sofix start % or FDR (Sorare's start % and projection only, labelled so); a player not called up has no national game; the
  extension release needs the version gate and your one Reload.
- Done when: the chain, Pick teams, Players and Batch build lineups from national games, and Batch's national windows show teams.

**C · Dates that read wrong (point 6, broken)** · *done 9 Nov 2026: on your page the verdict, the bar's Hold side, "Enter before" and
the first chain step all say Fri 20 Nov 20:45 (they said "Fri 20:30" and 20:45); tickets and card titles carry the date too.*
- `when()` (`ArcadePlanner.tsx`) shows only the weekday for another day: the chain shows "Fri 20:30" for Fri 20 Nov and Fri 27 Nov
  alike. Fix: the date once a game is more than six days away ("Fri 20 Nov 20:30").
- The verdict says "Play now" for a window eleven days away. Fix: "Play now" only when the window opens today; else "Play Fri 20 Nov".
- The Play bar shows the window time (20:30) while "Enter before" shows the lineup's first kick-off (20:45). Fix: one time, the lineup's
  first kick-off, everywhere for the same move (bar, entry, chain node).

**D · One 100% Play | Hold bar (point 1)** · *done 9 Nov 2026. On your board it shows Hold 50.3% | Play 49.7% for step 5 (53% vs
52% by the set's end): Thursday's 1% lineup costs one life and keeps the Fri 20 Nov one, so the advice to wait is close, and the bar
now says so instead of 1% against 42%.*
- Today: two independent chances to clear the step (Play 40%, Hold 31%), drawn as widths that do not add up.
- New: one bar, Play and Hold sharing 100%, split by the number the advice actually decides on: `comparePrizes` reads the biggest prize
  first, so the share is each side's chance at the deciding prize, `now[k] / (now[k] + wait[k])`, with the prize named ("for the
  €1,000"). Each side's own chance to clear this step stays as small text beneath. The advised side is filled.
- Edges: no later window (Hold empty: Play 100%, "no later game"); both 0 at every prize (no bar, the verdict says why); a near tie
  (within `tie`, the advice plays): 50 | 50 with "near tie, play: speed first"; Spend verdict; waiting lineups on the step.

**E · Pick teams starts empty (point 4)** · *done 9 Nov 2026, after you found taps that changed nothing: the plan's 25 games were
picked on pages out of sight. Also: a Picked (n) view, a note when a tap leaves the five, taps that flip at once (the five follow; a
tap cost about 1 s with 240 games), and Easiest games limited to the first day with easy games (it had picked 239 over two months).*
- Today `ArcadePlanner` fills it with the plan's first move when you have not picked (`selection ?? plan.path[0]`).
- New: nothing picked until you tap a game; your picks still survive a refresh; "Edit in Pick teams" and "Add to Pick teams" still
  fill it on purpose. The empty state invites a tap, and "Easiest games" stays one tap away.
- Edges: saved picks whose games have kicked off drop out (already filtered); a saved aim on a step since cleared.

**F · Chain switch: Fastest | Surest (point 3)** · *done 10 Nov 2026. On your board Surest matches Fastest for steps 4 to 6 (no window
is 15 points likelier: step 4's best later window, Sat 28 Nov, is 45% against Friday's 42%), then the next climb waits for +21, +29 and
+16 at steps 1 to 3. When no window clears the bar Surest plays Fastest's own move (the "best window left" was 8 days later for 3
points). Also fixed: Edit in Pick teams on a step claimed before a restart aimed at step 4 (it keeps the move's step now), and the rail
kept the other chain's scroll.*
- Fastest is today's chain. Surest puts the chance of clearing each step (and its reward) ahead of speed: for each step from the one
  you are on, the nearest window you can actually play (lives, cards held by a running lineup, settle times) whose best lineup beats
  the fastest chain's chance for that step by at least 15 points, else the best window left before the set ends; then the next step.
- Worked out in the climb worker beside the plan (saved with it), never on the page. Same chain rail, the same move detail and
  "Edit in Pick teams"; a node shows its gain ("+18 vs fastest").
- Edges: no window clears the bar (Surest = Fastest for that step, marked); the surest window is after the set ends (not shown);
  a held card frees only after its lineup settles; top step reached starts again from step 1.

**G · Consistency across the tabs (point 6)**
1. *Done 10 Nov 2026: one form (`fdrOf`): out of 100 in its band colour on cards, Players, Batch and Teams to build around; a
   ticket's two dots carry the band, the number on hover (Tottenham 65, Brighton 43 on your page).* FDR in three forms: Pick teams tickets and Teams to build around show the 1-5 band; cards, Players and Batch show difficulty out of
   100. One form everywhere: the out-of-100 number in its band colour (the band alone where space is a chip).
2. *Done 10 Nov 2026: Teams to build around shows the next four days with games (Thu 12 to Sun 15 Nov on your board, was Thu and
   Fri). A far card keeps "xD —" (your choice: "Sorare's projection" did not fit the 66 px line); its hover names the number's source,
   which on your board is recent form, since Sorare does not project 10 days out.* Horizons disagree: Teams to build around looks 4 days ahead (empty during this break, so it vanishes), FDR 8 days (A), Sofix's
   start % and xD only for each player's next fixture (the `laliga` map is keyed by next kick-off), the plan to the set's end. Teams
   to build around shows the next days that have games; a far game says "Sorare's projection" instead of a blank xD.
3. Game lists differ: Batch lists every game, Pick teams and the chain only games with your cards, Players' day filter only next-game
   days. Batch marks windows with no card of yours and skips them by default.
4. Two "Aim at" pickers with separate saved values (Pick teams and Batch): one shared aim.
5. Chances on different bases side by side with no label: the ladder's "91%" (step 4 by the set's end) beside the bar's 40% (this
   lineup). Each says what it is in a word ("by 6 Jan", "this lineup").
6. "5 of 5 have no start % yet" eleven days out reads as an error: say when Sorare usually gives it (days before kick-off).
7. Batch's empty text blames "available players with scores" for windows with no card of yours.
8. Sorare's league names shown raw ("English League Players") beside Sofix's ("Premier League"): one name per league.
9. Old sets' saved data never leaves this browser (glitch extras 420 kB, old Pick teams and start % keys): localStorage was 2.5 M
   characters full, so the saved climb had to move to IndexedDB. Remove keys of ended sets on load.
10. Dev console: a hydration mismatch on /arcade (metadata boundary); find whether it is Arcade's and fix it if so.
- Done when: each item is fixed or answered on the real page at 1440 and 390 px, and the Arcade spec covers the date, FDR and
  aim rules.

---

## Overlay edge cases (you, 9 Nov 2026)

Your words: "it sometimes appear and other times do not appear, sometimes just 1 card has it instead of all of them, it uses
sofix starting % instead of ff for laliga, sometimes the crest doesnt appear". Found by reading the overlay end to end
(`extension/overlay.js`, `core.js`, `bridge.js`, `background.js`, `frontend/lib/overlay.ts`, the `/api/ext/overlay` route) and the
local copy of the blocks (8 Nov). Not yet watched live on sorare.com. Order: start %, then missing tiles, then crests.

**Start % shows Sofix's number instead of Futbol Fantasy's**
- S1. Any player outside your plan (cards you do not own, Arcade commons, other players in the builder's list) is answered from
  his market row by `marketEntry` (`lib/overlay.ts:664`), which drops the row's `pStart`, `startSource`, `sources`, `start`,
  `ffMatch` and `ffPlayer`. The chip then shows `p`, Sofix's chance he *plays* (not starts), with no source mark, and the live FF
  read never runs for him. Local data, 8 Nov: 251 of the 311 rows for the round being played had an FF start %; all would show Sofix's.
  **Fixed 9 Nov** (with S2): the answer keeps his start %, its source, FF's doubt/out and his FF match; another game's row never
  borrows the planned week's.
- S2. Those rows for the round being played (`now`, `backend/app/sorare/publish.py` ~2178) are published without `ffMatch`/`ffPlayer`,
  so even with S1 fixed the extension cannot read FF live for them. **Fixed 9 Nov:** `with_now` carries the game's FF match and sources.
- S3. ~~Your own cards during a round use a plan frozen before FF's numbers.~~ Not a bug: the 6-10 Nov frozen plan has FF's
  number and match for 78 of your 89 players, the same as the refresh's record (0 differ); after the lock the extension's live
  FF read updates them.
- S4. When the card's game has no start % of its own, the week's is used (`lib/overlay.ts:620-631`), which is his *first* game's:
  wrong on a double week (Champions League midweek, LaLiga at the weekend).
  **Dropped 9 Nov:** 2 of 150 players in the local data, and only for the second game of a double week; not worth the risk.
- S5. A player without the starts/bench split loses his source entirely and shows `p` (`lib/overlay.ts:629-650`).
  **Dropped 9 Nov:** never happens (0 of 150 players lack the split).
- S6. Sorare's own fresh start % (read from the page by the bridge) only flags a disagreement; it is never the fallback when FF
  has nothing, so the order FF → Sorare → Sofix is not kept on the card.
  **Dropped 9 Nov:** your 3 Nov design keeps Sofix's number and rings it amber when Sorare's page number is 30+ points apart;
  replacing it would undo that ring.

**Tiles missing on some cards or whole pages**
- A1. On the lineup pages (Pro, Pro step and Arcade step lineups) a card is drawn only when its whole team block matches one of
  your lineups exactly (`onLineupPage` → `lineupOf` → `teamOf`, `overlay.js:1590-1627`). One unidentified card, a card known only
  by name, a lineup the worker has not read yet (or does not read), or a block that is not exactly that lineup's cards blanks the
  whole lineup, silently. **Fixed 9 Nov (extension 0.4.64):** every card the block names must be in the lineup; cards the page
  never named no longer blank the rest. A lineup the worker does not read still draws nothing (by your 3 Nov rule).
- A2. A card is looked up 8 times over about 3½ minutes, then only when the bridge learns new cards (`overlay.js:23,143`). The
  bridge learns only from answers to the page's POST requests (`bridge.js:108`): cards Sorare draws from its own cache (back and
  forward, revisits) are never named. Past 2,000 cards its name index is wiped (`bridge.js:50`).
  **Fixed 9 Nov (extension 0.4.66):** the oldest names leave first instead of all of them. The cache part is dropped: the bridge's
  index lives as long as the tab, so back and forward reuse what it learned; unproven otherwise.
- A3. A card known only by its link asks by card slug, which the app answers only for cards you own (`lib/overlay.ts:861`).
  **Fixed 9 Nov:** a card you do not own is answered for the player its slug names (`<player>-<season>-<rarity>-<serial>`,
  105 of 105 of yours follow it).
- A4. "Sofix has nothing" is remembered for 10 minutes, in the tab (`overlay.js:313`) and in the worker (`background.js:546`): a
  card asked before its lineup's game was known, or during a refresh, stays blank that long. **Fixed 9 Nov:** asked again after 3
  minutes (not sooner: each ask is a Vercel call), without a loading flash.
- A5. One failed call (a 500, a slow cold start, a 429) blanks every sorare.com tab for 30 s (`overlayDown`, `background.js:511`):
  big cards say "Offline", small ones show nothing. **Fixed 9 Nov:** 10 s after a 500 or a timeout; 30 s stays for a 401 or a 429.
  Tiles already drawn were never affected.
- A6. Size rules: a card under 48 px wide, outside a 0.55-0.9 width/height ratio (a card mid hover tilt) or round counts as "not a
  card" (`core.js:119`); the start chip is left off cards under 80 px and once the game has kicked off or the numbers are 24 h old.
  **Dropped 9 Nov:** these are deliberate (no chip over a thumbnail, no stale number).
- A7. A player Sofix does not rate (other leagues, unknown position, no xScore) gets nothing, with nothing saying why.
  **Dropped 9 Nov:** a "no data" mark on every such card is clutter.

**Crest missing**
- C1. No stand-in when the crest picture fails to load (`overlay.js:1044`): a 404 or a refused hot-link leaves an empty button.
  The coloured shield shows only when there is no address at all. **Fixed 9 Nov (extension 0.4.65):** the shield takes its place.
- C2. Crests are drawn only on the builders and the lineup pages (your call, 4 Nov); the gallery, the market and Classic pages have none.
  **Kept as is:** your call.
- C3. The crest hides whenever anything outside the card's own box sits at its spot (`crestCovered`, `overlay.js:1170`); that box
  stops at 1.3× the card's width, so Sorare's own slot button or badge on the pitch can count as covering it. **Fixed 9 Nov:** only
  something wider than two cards (a sticky header or search bar) hides it.
- C4. Only the first game is looked at (`crestState`, `core.js:1018`): on a double week whose first game is over, the finished
  game's crest stays and a live second game gets no live dot. **Fixed 9 Nov:** a played game leaves once another is to come or on.
- C5. "Out" only for FF's `out`: a suspended player keeps an ordinary crest. **Fixed 9 Nov:** suspended says Out too.
- C6. Hidden while any Sorare dialog or drawer covers the card's column, even one that is not modal.
  **Dropped 9 Nov:** on a second read it hides only when the drawer's area holds the card's top edge, which is right.

---

## Nine issues after the points-needed pill (you, 2 Nov 2026)

Sent after the pill shipped (a3c45a0) and localhost was rebuilt from `main`. Order of work: broken first (A–E), then new
work (F–H). Each step: check, push, you check it on your page, then the next.

**A. Arcade read a 360 step as the 300 step (issue 4, broken; cost 2 lives).** Your words: "yesterday lineups were in the
360 step and it read them as the 300 step, so i lost 2 lives because the app thought i was playing the 300pts step and gave
me the wrong odds." Evidence (your saved board, 2 Nov 13:40): step 2 (300) CLAIMED with 1a61f8 = 372.04 SUCCESSFUL and three
FAILED; step 3 (360) holds 82aab8 = 331.63 and 0cb7b3 = 330.5, both FAILED (they would have cleared 300), plus today's test
lineup. Sorare files the lineups under the right step, and Sofix's lineup read keys them by step id (`lib/arcade.ts:333`).
Sorare's step states (its published schema, `enum StepState`): CLAIMABLE, CLAIMED, FAILED, LINEUP_SET, LIVE, LOCKED,
PLAYABLE, PRE_MATCHDAY_LOCKED. Two places disagree on "the step you are on": the hero, the captain bonus and the hero's lives
use Sorare's raw `myCurrentStep` (`components/arcade/ArcadeView.tsx:70,112-113`), which stays on a cleared step until its reward
is claimed, while the planner uses `climbStep` (`ArcadePlanner.tsx`), which moves on only for CLAIMABLE/CLAIMED. Hypothesis:
on 1 Nov step 2 was cleared but still named by Sorare, so the page said "Step 2 · 300" while Sorare's compose page was step 3.
**Fixed 2 Nov** (with B): one step everywhere (`climbStep` passes every cleared step; header, captain bonus, start % read and live view use it). Open question for you: which number said 300 (the header, Your move's bar, Pick teams' "Aim at", or Batch)?
Fix: one "step you are on" everywhere, Sorare's own word first (the lowest step not CLAIMED/CLAIMABLE that Sorare lets you
play: PLAYABLE, LINEUP_SET, LIVE), and every lineup and chance labelled with the step and target it is on.

**B. Arcade counts card bonuses twice in live lineups (found checking issue 4, broken).** Sorare's per-card score in an
Arcade lineup already holds the card's bonus: 331.63 = 48.4 + 45.68 + 42.3 + 118.95 + 76.3 (Mbappé 118.95 = 79.3 × 1.5, above
the raw 100 ceiling). `liveLineup` (`lib/arcadePlan.ts:376`) multiplies it by the bonus again, so "scored", "Dead", "chance
left" and the new live pills overstate (Mbappé counted 178). Fix: raw = score ÷ bonus; points = Sorare's score as given. **Fixed 2 Nov**: regression test from the 331.63 lineup (Sofix had 404.8).

**C. Your test lineup (issue 4, check).** Step 3, today 19:45–20:00 UTC: Horníček, Adjei, Cadiou (C, ×1.5), George,
Makengo. Check its live pills on Arcade's "Your lineups on Sorare" once B is fixed and its games run.

**D. Arcade freezes (issue 8, broken).** "The pages are not reactive and it bugs out a lot. Sometimes clicking chain games or
teams in pick teams, etc the page freezes and i can't do anything." Hypothesis: each click reruns the lineup search and its
simulations (`bestLineup`, `climbWindows`, `teamsInBatch`) on the page's main thread; measure each click first, then move the
work off the click path (cache by inputs, a worker, or precomputed results) so every tap answers at once. **Fixed 2 Nov**: measured on your page, a tap on a chain move blocked it 14 s (one 6.7 s freeze) while both outcomes were planned; the climb and the outcomes now run in a worker (`lib/climb.worker.ts`), taps block under 50 ms.

**E. My lineup scores missing on Play and Recap (issues 6, 7c, broken).** "/play doesn't get the my lineup scores (but gets
sofix's), doesn't get Actual points (but gets sofix's)". Seen 2 Nov: in your Chrome (with the extension) your rows have scores
and Actual; in a browser without the extension (the Claude pane) they show the last read saved in Sofix, made before the
games: every card "Not played yet", Actual "-". On localhost, saving a fresh read fails ("Sofix storage is unavailable": the
launcher blanks the database settings), so other browsers never get it. Sofix's own rows use the week's published scores
(`scores`, from the score job). Fix: your rows take each card's score from those published scores whenever the saved read has
none, and Actual is worked out from them (as for Sofix's rows), labelled "so far" until Sorare ranks it; save reads made on
localhost to the local copy. Also seen: one LaLiga lineup reads "Actual 0" beside "Rank 5,131". **Fixed 2 Nov** (cards and Actual): every card takes his own score from the published scores, and Actual is worked out from them (card bonuses, captain, substitutions) whenever Sorare's read has no score, "so far" until every game is in; checked in a browser without the extension (Play and Recap: 394 vs Sorare's 399, 523 vs 528). Not done: saving a fresh read made on localhost (needs a local store).

**F. Pro card art empty (issue 3, broken).** Play → Pro · once the teams are out shows initials. The week's plan block
(`sorare_plan:<week>`) drops pictures when it is frozen (`backend/app/sorare/frozen.py:28`); `restoreFrozenPlan`
(`frontend/lib/frozenPlan.ts:13`) puts them back for plan lineups but not for `pro` windows. Fix there. **Fixed 2 Nov**: the Pro groups' cards get their art back the same way (all three groups show five cards).

**G. Recap: "Your season" to Audit, rewards live (issue 7).** "In recap tab, move the 'Your season' card in audit; rewards
card does not update in real time." `components/recap/YourSeason.tsx` (already links to `/audit/rewards`) moves to the Audit
page; the rewards card (`components/recap/WeekRewards.tsx`) updates as scores come in, without a reload. **Done 2 Nov**: Your season is on Audit · Rewards (the Recap no longer reads saved weeks); the card's "You · Actual" is the prize each lineup reaches so far (as its row says, also from the worked-out scores), and Recap and Play read their data again every 5 minutes while the week is played and the tab is in front (`components/LiveRefresh.tsx`). The Sofix side still updates only with the published plan's checks.

**H. Ship Codex's "Gems and packs" (issue 9).** "I upgraded it in codex, make it live." Uncommitted in
`C:/Users/Yaya/.codex/worktrees/618b/FixtureDiff` (on 93f7477): ArcadePacks.tsx, arcadePacks.ts (+tests), new
arcadePackStore.ts and arcadePackRead.test.ts, arcade.ts, ArcadeView.tsx, arcade-canvas.css, arcade.e2e.ts, docs and
plans/arcade-packs.md. Bring onto `main`, run its tests, push. **Shipped 2 Nov**: applied onto main (docs hashes regenerated), Arcade spec 25/25, real odds read on your board.

**J. Extension: "App not reachable" (you, 2 Nov 2026).** "fix the extension not connecting to app ... i lost vercel so make
it work for both vercel and localhost". Cause: on localhost the check-in route answered 503 "No database configured" whenever it
had news to store, and the extension read that as unreachable; its config also lacked the main Vercel address. **Fixed 2 Nov**
(extension 0.4.22): the check-in answers OK without a database; configure.mjs always lists 127.0.0.1:3000 and every Vercel
address; the extension tries them in order and remembers the one that answers (`appFetch`, background.js).

**I. Points-needed pill in the Sorare overlay (issues 1, 2, 5).** "I want the pill in the extension, so I can see it in
Sorare, not in Sofix." On sorare.com's Arcade and Pro compose pages, each picked card gets the same pill (same calculation,
`lib/pointsNeeded.ts`), for the step and lineup on screen, live while the games run. Needs an extension release (configure.mjs,
then one Reload). Includes entered Pro cards: ask Sorare's Pro read for each card's level so they are priced (today "—"). **Built 2 Nov** (extension 0.4.24): the worker keeps the board, your card editions and club bonuses, and your open Arcade and Pro lineups (from Sofix's Arcade reads and its own read of your lineups every 2 minutes while a game is live); the overlay draws the pill on those cards wherever Sorare shows them, and on an Arcade compose page on every card of yours for that step. The Pro read now asks Sorare's own multiplier per card, so entered Pro pills on Play are priced too.

## All Neon projects into one, on 1 Nov 2026 (you, 28 Oct 2026)

"On Nov 1, have all the Neon databases converge to one so everything is in the same place." The five free projects (Sofix,
FDR, Sofix B, Sofix C, Sofix D) take turns as production, and rows written while one was live stay there when production moves
without a copy: every refresh from 19 Oct 23:26 to 25 Oct 16:04 UTC (GW25's strategy lineups, Sorare-numbers plan, score record,
refresh runs 165 on) sits on Sofix C only (plans/plan-algorithm-v2.md). On 1 Nov every project's monthly quota resets, so all
five answer again.

- Read every project (SELECT only) and list the `read_models` keys and table rows each holds that the live one lacks, or holds
  newer.
- Show you that list; on your yes, copy them into one project (the live one, or the one you pick), newest write wins per key,
  `neon_live`/`neon_status` untouched.
- **Done 2 Nov 2026** (owner's yes): Sofix D got 2,228 read models (newest write wins: 2,148 from Sofix C, 80 from Sofix),
  79 refresh runs (Sofix 12–14 Oct, Sofix C 20–25 Oct) and 837 player games (Sofix C, 24–26 Oct); the blocks were uploaded to
  R2. FDR and Sofix B held nothing D lacked; odds, predictions and absences were left (each refresh replaces them).
- Then the fix so it cannot split again (the separate task "Neon fallback dropped 5 days of rows"), and the strategy audit
  rerun so GW25 gets its lineups, hindsight and rewards.

## Arcade: the climb shows one path, packs need filters (you, 22 Oct 2026)

Seen on his page at 15:00 (step 3, 4 lives): days "Thu 22 · hold", "Fri–Sat · step 3, play 2" (23% + 29%, 45% together),
"Sun · step 3, play 2" (54% + 33%, 69%), "Mon · step 4, play 2" (3%, 0%).

1. **"Each pack, by new players": filters Bronze, Silver, Gold, Special.** Fifteen packs in one list (Gold/Silver/Bronze per league,
   Live Today, Goalkeeper Pack). Built 22 Oct: chips over the list; the Open next card follows the chip.
2. **"It added 2 teams in step 3 and expects them to pass; what if they don't?"** The climb drew only its likely path: a leg under 50%
   as a miss (Fri–Sat → Sun retries step 3), one over 50% as a clear (Sun → Mon on step 4). The other outcome (and a miss with the last
   lives: back to step 1) was in the odds but never shown. Built 22 Oct: every played leg has "If one clears" and "If all miss",
   each opening that path with its own days and lineups.
3. **"I can't see next step lineups."** Same cause: if Fri–Sat clears, step 4 starts Sunday, a path the page never drew. Fixed by 2.
4. **"It skipped today's games."** Thursday is a hold day (the look-ahead finds its European games' lineups weaker than Fri–Sat's and
   keeps the lives), but a hold day showed no lineup at all. Built 22 Oct: a hold day shows its best lineup and its chance, marked as not played.

## Arcade is not what was planned (you, 21 Oct 2026, evening)

Your words: "I feel its not how its supposed to be", "I told you that i need to climb fast, i need a good plan, there is only 4 days
left!", "the less user friction the better", "Why does it feel like you did the minimum possible to get a pass?". Found on review
(plans/set.md and the design canvas against the shipped page):

1. **Broken: no plan once a step's lives are used.** Step 2 had 0 of 4 left (4 waiting), so Pick a day planned nothing and said the
   day "cannot fill a lineup". It must plan the climb past the current step: if a waiting lineup clears, step 3 with 4 lives from
   when it settles; if all miss, back to step 1. And across days, not one day at a time, so the plan reaches as high as possible
   before the set ends.
2. **Start % without a visible tab.** "Read Arcade's start %" opens Sorare's compose page in a tab. Try asking Sorare the page's own
   question from your Sorare tab so nothing opens; keep the tab only if Sorare refuses.
3. **Every visit re-reads all 1,295 cards.** Keep them in this browser; re-read only what changes. Cards from packs you open must
   show up (ask Sorare for your card count and newest cards each visit, read the new ones).
4. **Missions give no player to pick.** The plan and canvas had Decisive Picker picks; never built. Today's two LaLiga Common
   streaks ("Score 400+") need Sofix's best five for that competition.
5. **The page ignores the canvas** (https://claude.ai/artifact/NcPHzXynH6oHiVLeTg3BFG): tower and departures board, tickets and
   pitch, live race with Dead, pack lab with mission rings. Build it, in white and Night.
6. **Reported ready when it was not.** Cuts were not said. Rule now: plan and canvas checked line by line, used in your real state,
   every cut named.

---

## Lineups, Scores and a mission (you, 13 Oct 2026, after the GW22 plan fixes)

Your words, in order; broken things first. Each is checked on your pages before the next.

**M1. "Big Chance Missed - Champions League" has no suggestion.** "shows 'No pre-kickoff recommendation recorded from the available
evidence.' for that one mission." Cause (read from `missions_day:2026-10-13:limited`): the mission counts one stat, `big_chance_missed`,
and the rule reader only knows six counted stats (`COUNTS` in `backend/app/sorare/missions.py`, `mission_form.py`, `frontend/lib/missions.ts`),
so it is marked `unsupported` and gets no chance. Fix: a seventh counted stat.

**M2. Sorare's starting % is not on Lineups, and the button is gone.** "starting chances still don't show up in lineups page. I had a
button that checked sorare starting % before, where did that go? We couldn't fetch sorare starting % so this was a solution." Cause: the
button and the kept numbers only show for a match tied to a Sorare game, and that tie came only from the start record of the week being
planned, and only for a player Futbol Fantasy gave a percentage. Champions League pages give an eleven and no percentage, and LaLiga round 9
was not the planned week, so nothing was tied: no numbers, no button. Fix: the job ties every Futbol Fantasy match to its Sorare game and
its players itself and writes it with the match (`sorare` on each match of `lineups`).

**M3. The week picker does not move Lineups and Scores, and GW22 shows the wrong round.** "I switch the Gw to the GW21 but scores and
lineups page didn't change to show that GW scores and lineups. They should be saved. It only works for GW 22 where its bugged and there are
laliga players for the wrong gw, the gw22 should only have the games on the dates of Gw22." Cause: the page holds only what Futbol Fantasy
lists now (a match leaves 12 hours after its kickoff, `STAYS`), and a week with no LaLiga round still to play falls back to the next match
with every round beside it. Fix: every match is kept by its day (`lineups_day:<date>`), the week picked decides the days shown, and a week
with nothing kept says so instead of showing another week.

---

**M4. Futbol Fantasy in Europe, and the audit by competition.** "You can find lineups for FF in champions league here
https://www.futbolfantasy.com/champions/equipos/atletico and for europa league here https://www.futbolfantasy.com/europa-league/equipos/real-sociedad.
When doing the accuracy audit, separate accuracy by competition for all of them." Read on 13 Oct: the Europa League team page has the eleven
with percentages (Remiro 90%, Oyarzabal 80%) while its round page still listed matchday 1 and the match page had no eleven, so nothing of the
Europa League was read; the Champions League team and match pages (Atlético, Real Madrid, Villarreal) have an eleven and `data-probabilidad=""`
for every player. Done: team pages are read in Europe; the Audit splits each source by competition. Open: what a place in a Champions League
eleven without a percentage is worth as a start chance (needs settled games to measure, not a guess).

**M5. Sorare's % for everyone in the match.** "working only on my players, it should work for all players in that match". Done 13 Oct: tied by name.

---

## Forgotten in past sessions (found 7 Oct 2026)

You asked on 7 Oct why the league history reads 40 players a refresh instead of everyone, and to find plans left unfinished.
Every session since 3 Oct was read for offers and questions left hanging; most were closed later (listed at the end).

**L. Every LaLiga player's past games, read daily in one run.** Done 7 Oct (`69171db`, roadmap Results). Your words, 6 Oct 09:51: "plan with me the scraping of the 40
requests per request ... to a job that does all the requests for all the players ... make it run each day ... so each player has
its latest game. I don't mind having games loading after the day." The session planned it at 09:52 (a daily workflow at about
05:30 Madrid, every player in one run, progress saved every 50 players, the refresh no longer writing the history, a line on
Control). Your next message, 09:54, began "You know what? I like how it is now", which was about the all-or-nothing rewards;
the session read it as dropping the daily job and only said so in its last line ("tell me if I misread that"). So the refresh
kept reading 40 players a run (`LEAGUE_BATCH`, `backend/app/sorare/sync.py`), never-read players in alphabetical order of their
Sorare slug, which is why Vinícius, Renato Veiga, Sergi Cardona, Sergio Gómez, Xavi Espart, Yoel Lago and Zaid Romero had no
Sofix % on 7 Oct (178 of 618 never read). The Control line was a question you never answered; the session's advice was yes.

**G. The grey countdown on Play.** On 6 Oct ("This week" redesign) the session asked: when a plan is built before Sorare's
projections, should the countdown and the hero's facts stay greyed with the plan, or only the projection-based figures? Not
answered. Today `PlayView.tsx` greys the whole intro (`pl-intro behind`), countdown included.

**R. The plan's own-form start chance does not know a red-card ban.** Built locally in data-keeping step 1 (8 Oct); deployment pending the single production migration. Since 7 Oct Sofix's own start % is 0 after a red card in his
last LaLiga game (`own_start`, `forecast.py`), but the form-based chance the plan falls back on when neither Futbol Fantasy nor
Sorare has a number (`_split`) does not. Futbol Fantasy lists bans for every LaLiga match, so it rarely matters; worth closing
when the forecast is next touched.

**K. Keep what Sofix reads** (8 Oct): items 1–6 and picked upgrades U1, U2, U3, U4, U6, U7, U8, U9 are implemented (9 Oct): your lineups and essence, every player's games, odds, projections, the expanded Audit, match forecasts, FF's eleven, full stats, injuries, last season, your season and health on Control. Owner Chrome archive check remains. Full plan and checks: [plans/data-keeping.md](plans/data-keeping.md).

**Closed since (checked 7 Oct):** the `source-map-js` advisory (`40f5288`); the old Sorare row on Home is gone; Missions reads your
picks (`taskAppearances`) and no longer says "none of your cards" wrongly; a removed Futbol Fantasy match is no failed read and
old friendlies are no longer re-read (`e0c63bc`, production's failed list is empty); the card-zoom, dead-home and missions-audit
branches are merged; the merged branches and stashes are gone; extension 0.3.8 is loaded; `gh` is signed in.

---

## Play deep dive (your message of 6 Oct 2026)

**What you said.** On /play the plan uses Sorare's expected score, not Sofix's xScore; you want to switch between a Sofix plan
and a Sorare plan, keep both numbers before every lock and see on the Audit who is more precise (the difference, how often each
is right, how often each plan pays). "Your Sorare lineups" never loads even when you are signed in with sorare.com open; there
are negative values; you want the chance of XP, essence and cash apart; you want to choose which essence you want most
(LaLiga gives LaLiga essence, Champion gives Champion essence, All Star gives All Star essence; default LaLiga › Champion › All
Star) and have Sofix fill those lineups first; the xScore looks outdated; the page has too much on it; plans are wrong.

**Your answers (6 Oct).** Your essence order always first (a lineup under 5% gets no priority). XP shown apart, never counted
as "paid". Rooms only when they pay back more than the fee on average; the fee is shown as "300 to enter", never as a minus.
The Sorare plan uses the same start chances as the Sofix plan; only the expected score differs.

**Hard date.** GW21 (LaLiga round 8) locks Fri 9 Oct 14:00 UTC; both numbers and both plans have to be written down before it.

**Status (7 Oct).** Shipped in PRs #62 to #64: B1 (the app wakes a sleeping extension; Check again and Load always there), B2 (Rooms only
when they pay back the fee, shown as "to enter"), B3 (Sorare's projection per game), B4, B5 (`ff_news` merges), N1 (each card says whose
number it uses), N2 (one joint simulation per plan), N3 (seeded dice), N4 (XP as its own tier), the Sofix/Sorare plan switch, the essence
order, and the Audit's Sorare vs Sofix record (`score_record`, `/audit/versus`). **Still open:** the frozen plans scored against the real
cut-offs, splitting the 439 KB `market` out of the `sorare` read model, and N5. The versus figures need about 100 settled starts
(from about 11-14 Oct).

### Broken
- **B1 · "Your Sorare lineups".** The wiring checks out (extension id, origins, slug, message names). Likely causes, to confirm
  live: Sorare refuses `SofixFixtureLineups` when the request goes out without your session (depth 8 > 7, complexity 686 > 500
  for a signed-out caller; `extension/bridge.js:113-126`, `knownEndpoint` :163); the check of the answer refuses `null` for
  `so5`, `so5Rankings`, `so5Appearances` (`frontend/lib/entered.ts:69-70,100`); any Sorare error throws the data away
  (`bridge.js:190`). The block says one thing for no tab, no bridge and signed out (`EnteredLineups.tsx:52`) and never retries.
  No test runs the real question.
- **B2 · Negative values.** GW21 Plan 1 (live, 6 Oct): "LaLiga · Cap 260" Room first, 34% chance, worth −4 essence, 300 to enter.
  Rooms come first because the chance of a top-3 place is high (`planner.py:466`); every re-check redraws the dice
  (`fill_bench`, `planner.py:376-378`) so a Room accepted at +EV drifts negative; the page takes the fee off the result:
  "−300 essence most likely" (`frontend/lib/play.ts:550`).
- **B3 · Sorare's number for the wrong week.** The week planned reads `nextClassicFixtureProjectedScore`/`…PlayingStatusOdds`
  (`publish.py:286-310`): a player's next game, which during GW20 (Nations League 6-9 Oct) is not GW21's. Sorare gives a
  projection per game before kickoff (`anyGame.playerGameScores.projection`: 94 of 94 players of a 7 Oct game).
- **B4 · A null in Sorare's starter odds crashes the run** (`publish.py:290`).
- **B5 · Two writers share the `ff_chances` read model** (`ff_news.KEY`, `ff_chances.KEY`); `ff_news.save` writes only
  `readings` and can wipe the start chances frozen at the lock.

### Wrong or misleading numbers
- **N1 · "Sorare's score instead of mine".** Sofix's xScore replaces Sorare's projection only when every game of his week is a
  LaLiga game it can model (`forecast.py:181-196`, `scores.py:58-71`); otherwise Sorare's, else form. The number under each card
  is the expected points (chance × score, `Lineup.tsx:265`), while Lineups and Players show "if he starts": Altay 10.5 on /play,
  48.7 elsewhere. Nothing says whose number a card uses.
- **N2 · Plan chance too high.** "Chance of a reward" multiplies the lineups as if independent (`planner.py:428`, `play.ts:537`),
  though the four LaLiga lineups share one cut-off and often the same games (GW21 Plan 1: about 81% from 10 lineups).
- **N3 · The same lineup shows different numbers** each time it is simulated (new dice every time).
- **N4 · Rewards left out.** XP rows (`LIMITED_XP`: LaLiga ranks 1,501-3,500, Room places 4-5) are dropped (`rules.py:44-58`);
  Rare essence counts as 0; a lineup that can only reach a card is never planned. Sorare's reward rows carry no essence type
  (only rarity, quantity, sharedPool): the kind comes from the competition.
- **N5 · Cut-offs from one past week**, cached once. To change only once the Audit can measure it.
- **N6 · Small.** A rotation player's number has no floor (`forecast.py:195`); a card shows `games[0]` in Sorare's order, not by
  kickoff (`publish.py:477`); the page's bonus rules hard-code +2%, +4%, 260 and 370 (`PlayView.tsx:580`, `Lineup.tsx:126`).

### The Audit cannot compare yet
The record (`sorare_forecasts`) holds only your players and the blended number; `starts.notes` and `audit._marked` score the
old formula (`starts.py:79`, `audit.py:250`). Nothing freezes Sofix's own number at the lock, no plan is made per source, and the
frozen plan `sorare_plan:*` is never scored. Offline, within 7 points: Sorare 33.1%, old Sofix 30.1%, new 30.6% (walk-forward
rows only are fair; Sofix's model uses Sorare's projection as one input).

### Too much
`sorare` read model 1.3 MB: GW21's 5 plans 496 KB (each card repeats three pictures and two crests), `market` 439 KB used only
by Players; Next's cache refuses over 2 MB. On the page: two prose banners, two allocation bars, rules with hard-coded numbers,
ten lineups a plan with four under 3%. Dead: `SorareTiles`' copy of the lineups block, `liveLine`.

### Outdated xScore: causes
The label (N1); weeks with a non-LaLiga game fall back to the old formula; refreshes run hours late and Sorare's projections
(Wed 18:00) wait for the next run; the models were fitted through 30 Sep and are never refit (listed only).

### Later, measured
Cut-off spread over several comparable weeks (N5) if the Audit's "said 30% → happened" improves with it; a periodic refit of the
xScore models; per-game odds in a two-game week; U23 with no birth date; the 18-candidate pruning; Hot Streak.

---

## To do, from your answers of 3 Oct

Items 4 to 9 of my list of 3 Oct. The three faults the live pass found (items 1 to 3) and your two new model issues (13 and 14) have
plans of their own: [plans/overlay.md](plans/overlay.md) O12 to O14 and [plans/xscore.md](plans/xscore.md) P7 and P8. The order is the
roadmap's batch 9.

### A · The extension updates itself, so you never press Reload again (item 4) · **done 3 Nov 2026, extension 0.4.32**
- **The issue.** Every new version waits for you to press Reload on Sofix in `chrome://extensions`. The Chrome tool I use only opens web
  pages: it turns `chrome://extensions` into `https://chrome//extensions`, and Chrome blocks automation on its own pages anyway.
- **The fix.** The extension looks at its own version file in your folder once a minute and reloads itself when the one on disk is newer
  than the one running. After a merge I update your folder (pull, then `node extension/scripts/configure.mjs`) and the new version runs
  within a minute. No new permission, nothing downloaded: Chrome loads it from your folder as it does today.
- **What it needs from you.** One last Reload, for the version that brings it. After that, none.
- **When.** Release 1 (roadmap 9.7).

### B · The big number on a tile follows his chance of starting (item 5, decided 3 Oct)
- **Your rule.** Futbol Fantasy's start % is the main one (else Sorare's, else Sofix's). Under 40%: the big number is his score if he comes
  on from the bench. 40% or more: his score if he starts. The panel keeps both.
- **What it needed.** A real "comes on" score: today's "benched" number was not one (a keeper's was 0.8). **Done in 0.3.2 (P7):** the refresh now writes
  `on`, a score near 40, and the panel's second tab shows it. Under 40% the tile should also show his chance of coming on, so a keeper at 5% who comes on
  2% of the time is not read as a good pick.
- **When.** Ready to build (roadmap 9.6), after the Reload of 0.3.2 has been looked at.

### C · Fresh numbers before a lock: why the near-lock refresh did not run (item 6)
- **The answer.** GitHub did not start it; our check never got the chance. It is set for every 30 minutes, so about 84 runs from its first
  one (1 Oct 06:21 UTC) to 2 Oct 23:56 UTC; GitHub started **9**, 3 to 7½ hours apart, none between 08:51 and 15:24 UTC on 2 Oct, and the
  lock was at 14:00. The regular refresh is late the same way: **every scheduled run since 22 Sep has started late, the night run 2 to 3½
  hours and the daytime runs 2 to 8 hours.** On 2 Oct the 12:07 UTC run, meant for two hours before the lock, started at 17:49, after it.
  GW19's frozen page was fresh only because the 07:17 morning run happened to start at 13:55 and I started one by hand at 13:25.
- **Why GitHub does this.** Its own documentation: scheduled runs are delayed when it is busy, and some are dropped. On a free public
  repository there is no guarantee. Its status page shows an "Actions Job Delays" incident on 1 Oct and nothing on 2 Oct, so this lateness
  is its normal service here, not a one-off.
- **The fix: decided 3 Oct, the first way.** The three free ways were:
  - **Recommended:** the extension asks the app to start a refresh when you open sorare.com in the last three hours before a lock and the
    numbers are over 25 minutes old, and the app does the same when you open Sofix then. That is exactly when you need fresh numbers,
    and it uses the same key as the Refresh button.
  - A free outside clock (for example cron-job.org) that calls the app every 30 minutes before a lock: on time even if you open nothing,
    but it needs an account that only you can create, holding a secret link.
  - Pressing Refresh on /control yourself before you lock.
  The cron minutes also move off the busy :00 and :30 (a small help, not a fix).
- **Until it ships** I start a refresh by hand before round 8's lock (Fri 9 Oct, 16:00 Madrid) and one after it.
- **When.** Release 1 (roadmap 9.8), built as the first way.
- **Future feature, added 7 Oct: the outside clock as well** (the second way above; you chose it as a later addition). A free cron-job.org
  job calls the app's refresh route on a fixed timetable (the cron times of `refresh.yml`, and every 30 minutes in the three hours before a
  lock), so the numbers are fresh even on a day you open nothing; the app starts `refresh.yml` exactly as the Refresh button does, so
  "one refresh at a time" and the ten-minute cooldown still hold. Needs from you: a free cron-job.org account and pasting the job's
  address once (it carries a secret, so it is never written in the repository or in chat). Needs from me: a route that accepts that
  secret (or reuse of `/api/refresh` with its token), a note in the manual, and checking a week of runs on the Audit's freshness. Roadmap 9.11.

- **The outside clock, chosen 27 Oct: a Cloudflare Worker, not cron-job.org** (roadmap 9.11). Measured 20-26 Oct from GitHub's public
  run list: every scheduled refresh still started 4 to 7 hours late (26 Oct: the 07:17 UTC run at 14:21, the 12:07 at 18:38) and near-lock
  ran about 6 times a day instead of 48. Runs started through GitHub's API (the Refresh button, 9.8) start within seconds, so only the
  clock moves; GitHub keeps running the jobs. Nothing in the repository causes the delay and GitHub cannot be set to keep time.
  - **How.** `clock/`: one Worker on a one-minute Cloudflare timer (free plan: 5 timers per account, 10 ms of CPU per run; waiting on
    the network is not counted). `clock/timetable.json` lists each workflow and its times; a time that passed in the last 10 minutes
    with no run of that workflow created since is started through GitHub's API (`refresh.yml` with trigger `schedule`), so a missed
    minute catches up and a run you started yourself counts. Near-lock keeps its own rule in `near_lock.py`; the clock starts it every
    30 minutes.
  - **No doubled runs.** Near-lock, score checks, league history, the games export and the conference recording lose their GitHub
    timer (GitHub's late copies would double their Neon reads). The refresh keeps its timer as a backup for a dead clock; its gate skips
    a GitHub-timed run when another refresh started in the last 3 hours, as it does for pushes. A test keeps the refresh's times in
    `refresh.yml` and the timetable equal.
  - **A dead clock is seen.** `node scripts/check.mjs --live` fails when no near-lock run started in the last 45 minutes.
  - **From you, once:** a fine-grained GitHub token for yares28/Sofix only, with Actions read and write, typed into
    `npx wrangler secret put GITHUB_TOKEN` (never into chat), and `npx wrangler login` in your browser. I deploy and check it.

### D · Pin GitHub's machine version before 19 Oct (item 7, approved 3 Oct) — *done 7 Oct*
- **The issue.** The three workflow files say `ubuntu-latest`, which becomes Ubuntu 26 on 19 Oct, so the refresh could break that day.
- **The fix.** `ubuntu-24.04` in `ci.yml`, `refresh.yml` and `near-lock.yml`. Free.
- **When.** Release 1 (roadmap 9.9), before 19 Oct.

### E · Your Apply result, and one press of Refresh (item 8) — *paused by you on 3 Oct*
- **What Apply is.** On Play, **Apply plan** puts Sofix's lineups into Sorare through your own signed-in tab, in three presses: **Check**
  (Sorare says whether the lineup is allowed; nothing is saved), **Save as a draft** (saved on Sorare as a draft, not entered), **Enter**
  (the only press that enters the competition).
- **What is missing.** On 2 Oct you said you had done it, but not what each press did. One line is enough: did all three work? If one did
  not, which one and what Sorare said, and what happened if your session had run out.
- **Why it matters.** It is the last check of the Apply flow (S6), and the old SorareExt extension can only be retired after it (7.6).
- **Refresh.** Press **Refresh** on /control once: a run starts in GitHub's Actions, the button waits out its 10-minute pause, and the page
  updates when the run ends. That closes the Futbol Fantasy plan's S6. I can press it from your Chrome instead if you prefer.
- **When.** Paused: nothing waits on it except retiring SorareExt (7.6), which is paused with it.

### F · The overlay answers only for your account, and an old extension says "reload" (item 9)
- **The issue.** The extension does not check that the Sorare account signed in on the tab is yours. And if the app's answer changes and the
  extension is older, the tiles could show wrong numbers without saying so.
- **The fix.** The extension reports the nickname and the account id of the signed-in Sorare account and the app answers only when it is
  yours (tested both ways: another account gets nothing, and your own tiles are never blanked by a wrong guess). The extension sends its
  version, and when it is older than the app needs, the tile reads "Reload" instead of numbers. With A, that should almost never show.
- **When.** Release 1 (roadmap 9.10, formerly 7.1 and 7.2).

### G · The new xScore: the score added up the way Sorare adds it (your four requests of 3 Oct, evening)
- **What you said.** Mix in form against the opponent, Elo-style: a good game against weak teams, or when his side was the favourite, is a
  small boost; otherwise a big one. Also the app's difficulty, his average when he starts and when he does not, what keepers (or any
  position) score against that team, and more. "xScore has to be intricate": a range of scores, and everything together says whether he
  lands in its low or high part. Then: "it feels very black and white": add Sorare's gameweek grade, a score if he makes a decisive action
  and one if he does not with the chance that he makes one, and more parts that make it finer but still accurate. Then, with Sorare's three
  scoring tables: show on the Audit page how often each number was right and in how many games (the expected decisive %, the expected
  all-around points, the scores within ±7 of the xScore, and so on); show each player's average points for every stat and use them to
  predict better; and say who is best for each daily mission, a card never in two missions at a time. Then: "I like all of them" (the ten
  upgrades proposed: bookmakers' goal markets, team news for both sides, chances not just goals, penalty and set-piece takers, lineups on
  the real spread with linked scores, official lineups for missions, self-correcting numbers, the next five gameweeks, a decision
  scorecard, his role tonight), with as many tracked statistics as possible.
- **The plan.** [plans/xscore.md](plans/xscore.md) P9. For each player and game: the chance of a decisive action (and of a negative one),
  his score with one and without, and from those the xScore, his range and the reasons in points ("decisive 28% → about 66 · none 72% →
  about 39"). Sixteen parts go in, each weighted by the backtest per position: form that knows the opponent, the game (the numbers behind
  the difficulty), starting or coming on, his share of his side's attack, what the opponent gives his position, shots, minutes, Sorare's
  projection and grade (Sorare keeps both for past games, checked), cards and errors, the rest, his stat sheet (his all-around points built
  stat by stat), the bookmakers' goal markets, team news for both sides, chances not just goals, penalty and set-piece takers, and his role
  tonight. The planner picks lineups and captains on the real spread, with linked scores. Each daily mission (Sorare's
  `DecisivePlayerPickerTask`, read only through the extension) gets its best cards, one card in one mission, re-ranked when the official
  elevens are out. The chances correct themselves every Monday. The next five gameweeks go on the Players page, with points per euro on
  the Cards page. Every number is written down before each lock for every LaLiga player and scored after the games; the Audit page shows a
  catalogue of twelve groups of figures (headline figures first) beside today's formula, and a decision scorecard. It takes in P8 (keepers
  first).
- **What it needs from you.** A choice on a design canvas before it shows on screen; and whether Sorare's projection still replaces the
  number near the lock until it is measured (recommended: no, it sits beside it; the replay on two seasons says it and today's formula
  are as good as each other).
- **When.** Roadmap batch 10: the data and today's formula scored on every LaLiga player are **done (4 Oct)**; next the live record
  (10.2b), then one refresh per position, the screens, lineups on the real spread, daily missions, the Monday corrections, then the next
  five gameweeks.

## Paused

Not buildable now. Each starts again when its data exists, and I ask you first.

- **The xScore's level** (item 10, roadmap 3.4). It says your players play 68% of the time (they play 71.5%) and score 48.1 when they play
  (49.7). A fix (starting points of about 70% and 49) beat today's on the weeks it was tuned on, and it ships only if it also wins on games
  from 1 Oct onward, of which there is almost none. P7 and P8 come first.
- **The Audit page's other figures** (item 11, roadmap 5.2): each needs 100 checked games per source. GW19 gives the first counts from
  Wed 7 Oct, round 8 the first figures from Wed 14 Oct. The page fills what it has by itself.
- **The frozen plan, scored** (item 12, roadmap 5.3 and 5.4): whether "30% reward chance" came true about 30% of the time. It needs the plan
  frozen at GW21's lock to have been played: from Wed 14 Oct.
- **T3 · Pro**: a + b shipped 20 Oct ([plans/pro.md](plans/pro.md)); Apply for Pro (c) left.

---

## Yours

### 1 · The live Apply acceptance test — blocks retiring SorareExt
The one thing no test can stand in for, because it needs your signed-in Sorare tab.

- sorare.com open and signed in, then in Sofix: **Play → Apply plan**.
- Walk it: **Check** → **Save as a draft** → **Enter the competition**. Check writes nothing, a draft is
  reversible, only Enter spends a slot.
- Write down what Sorare said if it refused anything, and what happened if the session had expired.

Until this passes, `SorareExt` stays. There is no data gate here — you can do it today.

**Reported done on 2 Oct.** What Check, Draft and Enter did is written down in the roadmap's step 0.1 once you say it (above,
"To do, from your answers of 3 Oct", E).

### 2 · A Refresh button — **done 2 Oct** (the button shows on /control; the roadmap's step 0.1 presses it once)
`GITHUB_TOKEN` is not missing from your `.env`; it never existed. It is a GitHub key you'd **create**,
and its only power is starting this repo's refresh workflow. Refreshes already run on a clock without it —
the key only adds a button that starts one early. The FF plan (step S6) counts on it, so that you can pull
Futbol Fantasy's latest lineups just before a lock.

The app walks you through it: **/control → "A Refresh button"**. Two steps, both pre-filled links (create the
key with repository access limited to Sofix, then add it to Vercel as `GITHUB_TOKEN` and redeploy).

### 3 · Install the PWA
Chrome address bar → install. Not blocking anything.

---

## Mine

### Now · fix what's broken (batch 1, planned 2026-09-29)
From your first live look at the overlay and the issues you listed with it. Each step ships on its own and only
on your go: local checks → push to `main` → one Sorare refresh → you look at it on your pages.

**Status 2026-09-30:** steps 0–6 are pushed (`b84c6ba`), Vercel's production deployment of that commit is READY, and
a refresh has written what they make (early plans `sorare_ahead:*`, the kept week `sorare_week:*`, `start_chances`,
`futbolfantasy`; all updated today). "Local", "Done, local" and "Fixed locally" in the notes below mean "as built, before
it was pushed". What is left is your look at the pages, and the overlay's second live pass.

0. This file: every other issue written down in full ("Next, one at a time", below).
1. **CI is red on `main`.** Two Play tests look for GW15 in the week panel, which shows one month at a time; near
   a month's end the week they want sits in the other month. A test fix; the app is right. *Done, local.*
2. **Play lists every week again.** Since `e5a7154` (28 Sep) Play lists only the weeks Sorare has opened, so the
   later ones vanished. *Done, local.*
3. **Past weeks are kept, and complete.** Wanted for every played week: the lineups you entered with their score and
   reward, what Sofix's plans expected, and the best lineups in hindsight with what they would have won.
   *Built, local:* every week of the season is in the picker (the sync pages Sorare's list back to Game Week 1);
   your entered lineups show their score, rank and rewards for any week, read from Sorare through the extension
   (0.2.2); a finished week is replayed once its scores are final, with its best lineups in hindsight, and written
   to its own row (`sorare_week:<slug>`) so it can be opened for as long as the season lasts. *Not built:*
   - **Weeks played before this** (GW1 to GW16 on 29 Sep) are "not recorded": Sofix has no plans or hindsight for
     them, only what Sorare says you entered and won. Rebuilding them from Sorare's history is possible but
     approximate (see "Old weeks, rebuilt", below); say if you want it.
   - **The plan as it stood at the lock.** A kept week's "expected" is a replay from form as it stood before the
     lock, not the Sorare-informed plan you saw then. Freezing the plan at the last run before the lock, and showing
     it beside what happened, is a follow-up (below).
4. **Plans for weeks Sorare hasn't opened yet**, any LaLiga round to the end of the season (you asked about GW36,
   16 May 2027): planned from form with the competitions of the last comparable week, and saying so. Sorare's own
   game weeks are only created a few weeks ahead (its furthest on 29 Sep is GW24, 20–23 Oct), so the calendar leads.
   *Built, local:* each such round opens as an early plan (one plan, a note saying what it is built from, no Apply);
   its window is the one Sorare will most likely draw, and Sorare's own numbers replace it when the week opens.
   *Limits:* only LaLiga cards are placed (a card at another league or a national team has no game there); the
   competitions are those of the week being planned, which Sorare may change; far-out dates are provisional.
5. **The overlay fixes your live test showed** (next entry): the odds row, the #1–#3 ranks, a start % on every
   tile, "No xG", and old weeks' pages showing this week's numbers. *Built, local:* the odds bar is found up to half a
   card's height down, the list title by its text, the start % on every tile, "No xG"; and a page whose address names a
   Sorare gameweek ("football-25-29-sep-2026") now gets that gameweek's numbers, or none. That last one is a guess about
   Sorare's addresses: the popup's new **Gameweek in the address** row tells you whether they carry it.
6. **Start collecting Futbol Fantasy's starting %** (nothing on screen yet), so T2 can compare it. *Built, local:*
   every run writes down, for each of your players with a game, what Sorare, Sofix (from form alone) and Futbol Fantasy
   say his chance of starting is; the site is asked at most every six hours (every 45 minutes just before a lock);
   numbers freeze at the lock and are settled a day after the week ends. `python -m app.jobs.starts` scores the sources.
   No table or migration: it is one read model, so nothing for the unattended refresh to trip over.

### Check the overlay on your own Sorare pages — *first live pass done 2026-09-29, second 2026-10-03*
Your Sofix numbers are drawn on Sorare's own cards (a tile with the score if he starts, plus difficulty or xG), and
an edge tab opens your gameweek's plan. Built from [plans/overlay.md](plans/overlay.md) (O7 to O11); automated proof
is `frontend/e2e/overlay.e2e.ts`.

**Second pass, 3 Oct (by me, in your Chrome, extension 0.3.1).** On round 8's "Select your Goalkeeper" list everything you asked for
works: a tile on every card with its FF or SF mark, amber and red chances, ticks, stars, #1 to #3, the panel with its chip, Starts /
Benched, "START · FF" and folded sources, "LaLiga only" outside LaLiga, no Spanish, and numbers equal to the database. Three faults, planned
as O12 to O14 (roadmap 9.1 to 9.3): the live Futbol Fantasy read finds no player (a matter of capital letters), the Sofix tab shows the
week being planned instead of the page's, and every Celta game shows "No odds" (Sorare's "Celta de Vigo" never meets the board's "Celta").
The old-week question is answered: Sorare's addresses carry the week. Details in the roadmap's Results (0.2) and in overlay.md.

**What your first pass showed** (six screenshots: "Select your Forward", "Select your Extra", the compose page, the
Classic All Star lineup, the gameweek sheet, the edge tab):

- **Worked.** Every card got a tile. The best plan's cards got ticks and its captain (Arda Güler) the star. The
  hover panel read "43 if he starts · 54% he starts · Expected goals 0.24 · Win chance 77%" for Oyarzabal.
- **No #1–#3 on "Select your Extra"** (seven cards). The ranking only trusts a real heading element (h1–h4); Sorare's
  "Select your ..." is probably styled text. Batch 1, step 5. *Fixed locally: the title is found by its text.*
- **No Sofix odds row anywhere.** It looks for Sorare's odds bar only 60 px under the card; on Sorare the bar is the
  third row of the block under the card, about 75 px down. The test page had put it 6 px under the card, which is
  why the tests passed. Batch 1, step 5. *Fixed locally: it looks half a card down, and the test page now has that block.*
- **The start % only on some tiles** (Espino 26%, Mumin 11%, but none on Rațiu): it was drawn only below 50%. You
  want it on every tile, from Sorare when it has one and the app's otherwise. Batch 1, step 5. *Fixed locally: the
  bottom row of every full tile; the tile is 44 × 50.*
- **"NO ODDS" on Gumbau** (Granada, Segunda) while Sorare showed odds for his game (37 / 29 / 34): the label meant
  "no expected goals", since Understat doesn't cover his league. You chose **"No xG"**. Batch 1, step 5. *Fixed
  locally.*
- **Old weeks' pages show this week's numbers**, and some cards there have none: the extension never tells the app
  which week a page is about. Batch 1, step 5. *Built locally, on a guess:* the extension reads a gameweek out of the
  page's address when it carries one ("football-25-29-sep-2026") and the app answers for that week, from the copy it
  kept, or with nothing. Whether Sorare's addresses carry it is what your pages will say: open an old week's page
  and read the popup's **Gameweek in the address** row. "none named" means they don't, and then the gameweek has to be
  read from the page itself.

To look again after a fix: `node extension/scripts/configure.mjs`, **Reload** Sofix in `chrome://extensions`, then
reload your sorare.com tab. The popup's **Cards recognised here** should read "N of N".

Not built (designed in S7, not in the plan): the big "Sofix panel" on a player page. Not enforced yet: matching the
signed-in Sorare account to the owner (numbers are gated by the extension's token).

### Calibrate reward probabilities and correlated outcomes — *planned in roadmap 10.6 (P9, 3 Oct)*
Whether the stated reward odds match what actually happens, and whether picks in one lineup move together. P9 simulates each match once
and scores every player from it, so linked scores are counted, and its tracking scores the reward chances by band.

### Retire SorareExt — *blocked on your item 1*
Only after the live acceptance test passes and the recovery steps are written down.

---

## Next, one at a time (after batch 1)

Each gets its own plan when its turn comes; they are written down in full here so nothing is lost.

### T1 · The xScore: find out why some predictions look wrong, then fix the model
Issue 2 of your list, with two of its edge cases (two games in a week, "doesn't start"). It replaces "Fit and
blind-test the Sorare xScore model".

**Plan: [plans/xscore.md](plans/xscore.md), started 2026-09-30.** *3 Oct: your two new issues are planned there.* **P7, the bench
score:** the panel's "Benched" number is the chance he comes on × a substitute's score (0.8 for a keeper), not the score he gets when he
comes on, which is about 40 (a substitute starts at 35, like a starter). **P8, the opponent:** Soria's "52 if he starts" against Barcelona
is the average of his own last five games; no score depends on the opponent today, and keepers this season scored 33 against Barcelona,
Real Madrid or Atlético and 51 against the rest. Findings so far, from the code and a read-only count of
production:

- **There is almost nothing to backtest on yet.** `sorare_forecasts` holds 3 gameweeks, 30 rows, 11 scored, and none of
  its rows has Sorare's starter/substitute odds. The backtest below therefore starts from Sorare's per-game history
  (form only, walk-forward) and adds the comparison with Sorare's projection when about 100 scored players exist. The
  record also lacked the competition, minutes and start/bench split; P1 now adds them in a read model, so no migration (2 Oct).
- **The big number on a tile is "if he starts", not the expected score.** That alone makes Giorgi 45 / Oyarzabal 43 look
  alike. Question for you (plan §6): should the big number be the expected score instead, or both?
- **Two leads are very likely:** a player with no start in his last five gets Sorare's projection as his start score
  (Giorgi's 45), and Oyarzabal's 54% is the form formula on five mixed club and national games (3 starts in 5 gives
  exactly 54%), not Sorare's odds. Both are to be confirmed in P0.
- **Correction to the edge case below:** plans already count a best-of-two bump for two games; the tile does not, says
  nothing about two games, and the bump reuses one game's numbers.
- **Confirmed from Sorare's help page:** a starter and a substitute who comes on both begin at 35; levels above 0 have
  a guaranteed minimum. Which of two games counts is not on that page ("Best score chosen" is what Sorare's lineup screen
  says) and is checked in P0.
- **P0 done on 2 Oct** (details and numbers in [plans/xscore.md](plans/xscore.md), "P0 findings"). The page's numbers for the two players
  were rebuilt from their game history and match to the decimal. (1) The two "very likely" leads are half right: Giorgi's 45 is **not**
  Sorare's projection (that is 47; his 45 is his own three recent starts pulled towards 51), but Oyarzabal's "% he starts" is the form
  formula (4 starts in 5, 68.6% now), and Sorare gave no starter odds at all (0 of 14 players in the last run). (2) The real reason the
  pair looks wrong: "if he starts" is Sorare's projection for a player who starts 75% of the time or more and his own smoothed starts for
  anyone else, so Oyarzabal shows Sorare's 52 (his four recent starts scored 37.2) and Giorgi his own 45: two different kinds of
  number, a cliff at 75%. (3) Club and country games are pooled: Oyarzabal's eight games for Spain this summer averaged 55, his LaLiga ones
  44. (4) Sorare publishes a projection for each game; the model reads one per week. (5) The bench score rests on one or two substitute
  appearances: one goal in 35 minutes puts Oyarzabal's at 48 and Giorgi's 30.6 at 38. Still open: the spread by role (needs the backtest)
  and which of two games Sorare counts (needs an entered lineup with a two-game player, or a keyed read).

**What you said.** "How does Giorgi have an xS of 45 and Oyarzabal 43? The xS has to have more depth: depending on
the competition a player can have different xGs. Oyarzabal has had a weird start of season, but with Spain he always
does something, and if he starts he can have a very good game. In LaLiga Giorgi rarely starts compared to
Oyarzabal, and often has worse games. We need a deep dive to find the issues and edge cases in the xS algorithm."

**The example** (GW19, an international break):

| Card | Sofix tile | Sorare's own number | Game(s) this gameweek |
|---|---|---|---|
| Giorgi Tsitaishvili, FW | 45, xG 0.31 | 45 | Georgia away at Hungary (Fri 20:45; Hungary 47%, draw 28%, Georgia 25%) and away at Northern Ireland. Sorare: "Best score chosen" |
| Mikel Oyarzabal, FW | 43, xG 0.24, 54% he starts | 43 | Spain v Czechia (Sat 20:45; Spain 77% to win) |

The other cards that week, Sofix / Sorare: Rațiu 47 / 50, Espino 45 / 46, Starfelt 46 / 45, David López 49 / 42,
Mumin 38 / 35, Gumbau 53 / 52, Mittelstädt 63 / 67, Radu 46 / 48, Grimaldo 65 / 52.

**First lead, to verify before anything else.** For Giorgi and Oyarzabal our number *is* Sorare's. The forecast
table marks a player's numbers `source = "sorare"` when they come from Sorare's projection, which suggests that when
Sorare projects a player, the tile's "if he starts" score is Sorare's projection passed straight through. If so, the
question for those players is "is Sorare's projection wrong, and should Sofix overrule it?" Check in
`backend/app/sorare/forecast.py` and `publish.py` (`player_weeks`).

**How Sorare scores**, as you described it (to confirm against Sorare's help centre before building on it):

- A player who plays gets a **decisive score** plus an **all-around (AA) score**. The decisive score starts at 35
  (level 0); each positive decisive action (goal, assist and the like) lifts it a level: 60, 70, 80, 90, 100.
  Negative decisive actions lower it.
- With a positive decisive level, the AA can't take him below that level: a goal means at least 60. At level 0,
  negative AA can take a 35 down to 0.
- The total stays between 0 and 100.
- A sub who comes on starts at 35 + AA, so even a last-minute sub who does nothing scores about 35.
- For a sub, what matters is his **AA per minute** and his **decisive actions per minute**: coming on at 70' leaves
  about 20 minutes to add AA, and a player with a high decisive rate may score and finish on 60 or more.
- When a player has two games in one gameweek, only his **best** score counts ("Best score chosen" on Sorare).

**Edge case · two games in one gameweek.** Sofix uses only one of his games and shows nothing to say there are two.
Wanted: the expected *best* of the two scores (always at least as high as either game alone), "2 games" on the tile,
both games in the panel, and plans that count the week that way.

**Edge case · "Doesn't start" is wrong.** Today it is one blended number from flat assumptions in `forecast.py`
(`PRIOR_SUB_SCORE = 42`; a 30% chance of coming on for an outfielder, 2% for a keeper). Wanted: his own chance of
coming on and, if he does, about 35 + his AA per minute × the minutes he usually gets + the chance of a decisive
action, with the floor rule. Shown as two plain numbers, e.g. "if he comes off the bench ≈38 · 60% he comes on".

**Competition matters.** A player's score, minutes and chance of starting can differ between his club and his
national team, and between league and cup. Keep them apart. Today a national-team game uses his club xG, unscaled.

**What there is to measure with.**
- `sorare_forecasts` (Neon): for every player and gameweek since recording began, what Sofix and Sorare predicted
  before the lock (our score if he plays, our chance he plays, Sorare's projection and play odds) and what he
  actually scored.
- Sorare's per-game history (`sync.py`, HISTORY): score, started, minutes. Not fetched yet: the decisive/AA split
  per game (the field names in Sorare's API are still to be confirmed).

**How.** (1) A backtest first: Sofix vs Sorare's projection vs simple baselines, on every recorded gameweek, with the
error split by club vs national team, starter vs sub, position, one vs two games, and how much history the player
had. (2) Fix what loses, one change at a time. (3) Ship only a change that beats today's numbers on weeks it wasn't
fitted to.

**To ask you when it starts.** Should Sofix overrule Sorare's projection when the backtest says ours is better? How
much should a player's national-team form count for a national-team game?

### Old weeks, rebuilt (follow-up to batch 1, step 3)
Only if you want them: GW1 to GW16 are "not recorded". Each could be rebuilt from Sorare's history: that week's
competitions and the scores that paid (about a hundred calls a week, so a few weeks per run over a couple of days),
your players' scores in it (their history is already fetched for the last ten weeks), and the **cards you own today**,
since which cards you owned then is not recoverable. The results are honest but approximate: "what these cards could
have won", not "what you could have won". Expected results would be a form-only replay, marked as rebuilt.

### The plan as it stood at the lock (follow-up to batch 1, step 3)
At the first run after a week locks, the page still holds the plan Sofix built for it before the lock, with Sorare's
projections. Freeze that as `sorare_plan:<slug>` and show it in the kept week's "Before the lock" view, beside the
replay, so "what Sofix said" and "what it would say from form" are both there. Scoring that frozen plan against the
real scores needs the planner's lineups rebuilt from the saved cards, which is the larger half of the work.

### T2 · Futbol Fantasy's lineups and start % in Sofix
**What you said (29 Sep).** "Get the starting % from Futbol Fantasy
(https://www.futbolfantasy.com/laliga/equipos/barcelona), add a scrape of every team's expected starting % to the
run workflow, and compare it with the app's and Sorare's to find the most accurate."

**What you said (30 Sep).** "The FF odds of starting only affect the next game for that team, and change about a day
after that team played. I want FF's full lineups to show on Sofix, and the players I have will get FF's starting % as
the main %, falling back to Sorare's and then the app's (statistically, Sofix has the least information on injuries and
starting of the three). You'll have to test it on their next LaLiga game. A new lineups page and a new section under
'Sorare' on the home page; I want to decide the styling before implementation using /design. The overlay has to work
the same way."

**Plan: [plans/futbolfantasy.md](plans/futbolfantasy.md), rewritten 2026-09-30 with your answers** (FF everywhere,
including xScore and plans; every match on the page; LaLiga, European and cup games; extra runs before locks, the Refresh
button and live reads in the extension). It lists 40-odd edge cases and the proof on round 8 (Fri 9 – Mon 12 Oct).

**Corrected on 30 Sep.** The earlier note here said FF's percentages were "for LaLiga's next round only". They are for
**each team's next game**, per competition: FF has its own Champions League, Europa League and Copa del Rey sections.
Its "Últ. act." times belong to the fantasy games' market values; a lineup has no time stamp.

**State in production, 2026-09-30** (read-only count): `start_chances` holds 1 gameweek, 15 players, none settled, with
Sofix's number for all 15, **Sorare's for none and Futbol Fantasy's for none.** Futbol Fantasy's none is because that
week is a national-team week, and FF only covers each team's next LaLiga (or European, cup) game. Sorare's none matches
the record above: its starter odds have never been stored; the plan's step S3 logs whether they arrive at all.

**Built on 30 Sep (S1 to S4 of the plan).** Futbol Fantasy is read match by match before each plan; its chance is the start
chance of each of your players in each game (else Sorare's, else Sofix's), and moves the chance he plays, so the expected
score, the plans and the captain follow it; the overlay's tile shows the shown game's own chance. The run's summary says what
was read, who could not be linked, which LaLiga games have no match and how many of your players have Sorare's starter
odds. `start_chances` now records one entry per player, game and source.

**Built on 30 Sep and 1 Oct (S5 to S8).** The Lineups page (`/lineups`): every match FF has published, both elevens as Sorare-style
cards on a pitch with their chance of starting, who else could play under each line (each club's squad page is read once a
week for that), injuries and bans as icons, your cards outlined. The Home's **Team news** under Sorare: your players split by
how likely FF makes them to start, the plan's starters under 70%, and what moved since yesterday (the job keeps a reading every
six hours for two days). Play's cards say "50% starts" with a mark for whose number it is (FF a filled dot, SO a ring, SF a
dashed ring). The overlay's tile and panel were cut down to what matters, with SOURCES behind one button; and while a sorare.com
page is open the extension reads FF's match pages itself, at most every ten minutes per match. What is not proven yet is on
the list in section 9 of the plan: a real read from GitHub's runners and from your browser, round 8's names, card art for
players you do not own.

**The collection** (batch 1, step 6, on `main`) stays: what each source said at the lock, settled by what happened, is
the Audit page's data (T7).

### T2b · Review of the live pages, 2026-10-01 (found in your Chrome on production)
Looked at `/lineups` (all 10 matches), `/`, `/play` (GW19, GW20, LaLiga GW8, 9, 10), `/cards`, `/players`, `/control`,
`/fixtures`, `/difficulty`, `/table` and the sorare.com lineup page with the overlay. Not seen: a phone-width screen
(the browser cannot go below about 500 px; the phone CSS was only read), a match that has kicked off, a failed or old
Futbol Fantasy read, a European or cup round. Per your rule: broken first, then one step at a time, each checked on
production. **Order, goals and checks: [plans/review-fixes.md](plans/review-fixes.md); all four batches (R1–R35) are fixed and
checked on production, 1–2 Oct, except the overlay's R26 which needs the extension reloaded and R32's call-up chip, which no club's squad
list lets appear yet (see the Results).** Corrected 1 Oct: FF only has each
club's next LaLiga game (today round 8), never older rounds, later rounds or national-team weeks; R1, R2 and R4 below are
narrowed accordingly.

**A · Broken or contradicting itself (fix first)**
- **R1 · Play's early plan for round 8 ignores FF, so it contradicts `/lineups`.** Round 8 is the one round FF covers
  (each club's next LaLiga game). All 21 start chances I read on LaLiga GW8 are Sofix's own (SF), taking only four values
  (83, 69, 54, 40%). Miguel Román is in a GW8 lineup at 83% while `/lineups` shows him out until early November at 0%.
  Early plans never get FF (`projected_weeks` in `backend/app/sorare/publish.py`). Fix: give FF's numbers to the early
  plan of the round FF has, and never put an out or suspended player in a plan. GW9 and GW10 are right to have none.
- **R2 · Home "Team news" says FF has "not published a lineup for your players *yet*".** GW19 is national-team games,
  which FF never covers, so "yet" is wrong. Say what is true: "GW19 is national-team games; Futbol Fantasy covers LaLiga
  only; round 8's lineups are on Lineups (n of your players)".
- **R3 · The early plans for GW8, GW9 and GW10 are identical** (3 lineups, 7%, ≈27, the same 24 cards, 418 / 392 / 378
  xScore). They stand on form alone and copy the open week's All Star competitions. Not about FF. **Your decision (1 Oct):**
  plan for the LaLiga competitions Sorare is going to open whenever a week has a full LaLiga round, open or not, and
  replace them with Sorare's own once listed (plan step 1.7).
- **R4 · `/lineups` gives no word when it cannot show the week you came from.** Showing round 8 for every week is right
  (FF has nothing else). What is missing: arriving with `?w=` for a past, national-team or later week shows round 8
  without saying why, and an unknown `?m=99999` silently shows the first match.
- **R5 · `/lineups` never says which Sorare week it feeds.** The header is "Who starts this round? LaLiga · Round 8 ·
  9–12 Oct". It should say "LaLiga round 8 · Sorare: not open yet" (then "Sorare GWnn · locks Fri 16:00" once Sorare
  opens it), with a link to plan that week.
- **R6 · Most photos of players you do not own never load.** On Elche–Celta 10 of 13 FF photo addresses fail (the page
  makes those requests on every view), so about three in four cards are a grey silhouette, next to the owner's full Sorare
  art. This is Q6 of the plan; it is the biggest visual flaw.
- **R7 · Injury text is stale and half Spanish.** "Out until late September" (Antañón) is in the past; "Out until enero
  2027"; "Disponible para la jornada 8", "Baja confirmada para la jornada 8", "Trabajo al margen", "Rotura de lig. cruzado
  anterior", "Roja directa" are FF's Spanish inside an English page. Translate the status words, turn past dates into
  "back from…", keep the diagnosis only if short.
- **R8 · "Called up" (the blue P) appears next to "Squad list not out. Until it is, nobody is assumed out."** Both cannot
  be true. Find out what FF's mark really means before round 8; label or hide it.
- **R9 · Home says "1 lineups".** Play says "1 lineup".
- **R10 · An entered lineup before its lock reads "0 · Still scoring"** with a 0 under every card (Play GW19, locks in 1 d
  3 h). Say "Locks in 1 d 3 h".
- **R11 · Home "Last gameweek: GW17"** while Control says GW18 was the last scored. Check which is right.
- **R12 · Control contradicts itself:** "2× board refreshes a day" under "How it runs" next to "6 runs left before the lock"
  and "4 of 6 on schedule".

**B · Inconsistent names, dates and freshness**
- **R13 · Four ways to say the week.** The bar says "GW8" on Home and the LaLiga pages, "GW19" on Play, "Sorare GW19" on
  Cards and Players; the picker says "LaLiga GW8 / GW9"; the early-plan note says "the competitions of GW19". Always show
  both, "LaLiga round 8 · Sorare GWnn" (or "Sorare not open").
- **R14 · One week, two ranges.** Play's GW8 says "Fri 9–13 Oct"; the picker, Home and Lineups say "9–12 Oct".
- **R15 · Five ways to say how fresh it is:** Control "Updated 9 h ago", Play "synced 9 h ago" and "updated Thu 03:33",
  Lineups "read today 03:33" and "Read 03:33", Home nothing. Use "9 h ago (03:33)" everywhere.
- **R16 · The picker's right column mixes units:** "≈9 · 3 plans", "2 cards play", "88 early plan"; and the gold chips say
  "15 cards", "2 cards", "88 cards" without saying playable.
- **R17 · The blue dot and number on each match tab** ("● 3") has no legend and only a hover title, and it counts your
  alternatives too: Málaga–Espanyol says 3, none of them in the eleven; Elche–Celta says 17 (9 in the eleven, 8 chips).
- **R18 · Names are written three ways:** surname in capitals on pitch cards, full names on alternative chips, and on your
  Sorare cards the name is half hidden under the % pill ("VICTOR CHUST", "IONUT RADU").
- **R19 · Kickoff times carry no time zone** (they are Madrid time; Control says so, the other pages do not).

**C · Usability and pain points**
- **R20 · Your players are the point of the page and are the hardest thing on it.** One match is about 2,200 px tall; your
  players sit in both columns and in the alternatives. Add a strip at the top of each match: "Your 9 here: Radu 95% ·
  Moriba 70% · Román 0% out…", and a "Only my players" switch; the tab count should say "6 likely to start".
- **R21 · Alternatives are full of players who cannot play** (0% out, 0% suspended, 0% doubt) and take two or three rows
  per line. Fold 0–5% into "n more", keep injured ones in the list below.
- **R22 · "Also in the squad, at 0%: Bambo Diaby, …"** gives no reason. Say why or drop it.
- **R23 · The injury list below each team repeats "Knock, but available"** (five for Athletic). Fold those; they are not news.
- **R24 · Nothing links the page to the rest.** A player on `/lineups` does not open his card or his Play row; a Play
  card does not open his match on `/lineups`.
- **R25 · Cards has no "next game, chance to start" column**, and Players shows "Projected —" for many.
- **R26 · The overlay panel on a lineup you entered shows five thumbnails of nine cards** and no FF number (GW19 is national
  teams, so none exists). When there is none, say "FF covers club games only".
- **R27 · A tab switch reloads the whole page (about 120 KB, 0.3 s).** It works; a quicker switch would make it feel
  like one page.
- **R28 · Tiny text.** On the phone the position is 7 px, the line above the name 6 px, names 9 px; on the desktop 8.5 px
  positions and 10.5 px names.

**D · Styling**
- **R29 · Blank gold (Limited) or red (Rare) rectangles for 3 to 10 seconds** while Sorare's art loads, with no name or
  position; Play's lineup rows have the same gaps. Show the name and position over a quiet skeleton, or preload.
- **R30 · Crests are missing on the first paint** (tabs, match header; 2 of 26 failed to load). Reserve the space and
  fall back to the club colour shield.
- **R31 · Two card styles side by side:** your full-art cards and flat silhouettes, and inside one row some real photos and some
  silhouettes (Bigas has one, Revivo does not). One style for everyone: a card in the club's colours with number, name
  and photo when there is one.
- **R32 · The blue "P" badge** reads like a parking sign; the legend explains it only at the foot of the page.
- **R33 · The % colours** (90 dark green, 60–70 light green, 50 yellow, 30 grey) are never explained.
- **R34 · Empty pitch rows** (up to 80 px between lines with no alternatives) make the page longer than it needs to be.
- **R35 · Home "Team news" is a full-width card holding one sentence;** "All Star · Ca…" is cut off in Last gameweek.

**E · Edge cases still to see** (none could be reached today): a match that has kicked off (score, "frozen"), the page
when FF fails or is over a day old, round 9 replacing round 8 (Q2), a European or cup match and the competition tabs, a
postponed game, a phone-width screen.

**Checked and fine:** `/lineups` shows all ten matches with elevens, chances, crests, injury list and your outlined
cards; Oyarzabal 90% and Take Kubo 40% match the plan's notes; no broken image on the owner's cards; no console error
or sideways scroll at desktop width; Control reads "All good" with the extension at v0.3.0; the sorare.com overlay opens
and shows GW19's xScore, reward chance and essence; the page refuses to load inside a frame.

### T3 · Pro in the best plan
**Paused by you on 2 Oct 2026.** Researched the same day: [plans/pro.md](plans/pro.md) (the rules, what the API shows, the gap table and
three questions for you), which wait until you say to go on.
**What you said.** "The app doesn't compute all game modes. It never gives me the Pro option when best lineups are
calculated per competition. Find detailed info on Pro and plan its integration into the best plan. Pro has future
levels, so it has to take into account whether it's even possible to reach the next step and fight for the upgraded
reward or not."

**Why Pro never shows today.** The sync lists only Classic gameweeks (`eventType: CLASSIC`, FIXTURES in
`backend/app/sorare/sync.py`) and keeps only Limited and Rare tracks (`_tracks`), so a Pro competition never reaches
the planner.

**Lead (unconfirmed).** Sorare's help centre, readable through its Zendesk API, describes Pro in "steps" with
"targets" and a "King's Step". Read it in full first: how steps work, the score a step needs, what each step pays,
which cards are allowed, how many lineups, and how Pro sits beside the Classic competitions of the same gameweek.

**Wanted.** Your current Pro level and progress, read from your signed-in Sorare through the extension. The planner
values a Pro lineup by the chance of reaching the next step times its reward, against what the same cards would win
elsewhere, and says plainly when the next step is out of reach.

### T4 · The "Your gameweek" sheet on sorare.com
**What you said.** "The 'Your gameweek XX' sheet is still not optimised and styled. Use /design before implementing
the design; maybe it doesn't need to be this big."

**Today** (`extension/drawer.js`, opened from the vertical "Sofix" tab on the right edge): a full-height 340 px
panel. "YOUR GAMEWEEK 19", then "427 xScore · All Star", five card pictures, "Reward chance 4%", "Essence expected
≈11", "Cards used 9 of 89", a large empty area, a green "Open Apply in Sofix" button and "Entering still takes three
presses in the app." It shows only the best plan's first lineup.

**Process.** A design canvas first, with a few options (its size, and what it shows: every lineup of the plan? what
is already entered?), you choose, then it is built.

### T5 · The expected score where you look at your lineups
**What you said.** "Maybe add somewhere where I can see the expected score": in the lineups, where you see all of
them, near the actual score; and the lineup's total on Sorare.

**Wanted.** (1) On sorare.com's page listing your lineups: Sofix's expected score beside each lineup's actual score.
(2) While you compose a lineup on sorare.com: its expected total, captain included, updating as you swap cards. Both
read what Sorare shows and add Sofix's numbers; nothing is written to Sorare.

### T6 · Sorare and Sofix hand in hand
**What you said.** "Sorare and Sofix have to go hand in hand: see everything that happens in Sorare in Sofix so we can
plan for it."

**First step.** An audit table: what Sorare shows you against what Sofix syncs. Gaps known today: game modes other
than Classic (Pro, T3); Super Rare and Unique competitions (filtered out); gameweeks beyond the ones Sorare has opened
(batch 1, steps 2–4); your entered lineups' scores, ranks and rewards (batch 1, step 3); levels and progress. Each
gap then becomes its own entry here.

### T7 · The Audit page (idea, 2026-09-30)
**Started 2 Oct 2026, at your request: `/audit` is built** ([plans/roadmap.md](plans/roadmap.md), batch 5 results). It leads with the one
xScore figure ([docs/xscore_success_rate.md](docs/xscore_success_rate.md): 66% of the time it picks the better of two players, a coin
flip is 50) and gives "who starts" per source (figure 1, without the splits by competition, position and team and without the big
misses), with what has been written down per gameweek (the first part of 13). Left: the rest of 2, 8, 9, 11, 12 and 13, and everything
that needs the plan frozen at the lock (3 to 7, 10, 14).

**What you said.** "A new page idea, called 'Audit'. It will get the % of correct start guesses from all 3 sources and
compare them; the score prediction difference for xScore in Sofix, to know how precise it is; the difference in plan
team score, to see how precise the team building is; the % of plans that correctly guessed the reward, and the % of
times it properly guessed the best lineup; and more that you'll have to think about."

**What it would show.** Each figure per gameweek and for the season, with how many cases stand behind it; under a
floor it says "too few to tell" instead of a number.

Your five:

1. **Who starts, three sources.** FF, Sorare and Sofix side by side:
   - how often each was right: said 50% or more and he started, or less and he didn't;
   - how far off each was (Brier score);
   - whether their % mean what they say: of the players each put at 80%, how many started.

   Split by competition, position and team. The big misses are listed: said 80% or more and he didn't start, said 20% or
   less and he did. FF's own season predictability per team sits beside ours.
2. **xScore precision.** Expected against actual score per player:
   - the average miss, and whether it runs high or low;
   - split by position, by role (started, came on, didn't play), by competition and by which source gave the %;
   - how often the actual landed inside the range shown.
3. **Plan team score.** The plan's expected lineup total against what the lineup scored: high or low, inside the
   range or not.
4. **Rewards guessed.** How often the reward the plan expected was reached, and whether "reward chance 30%" came true
   about 30% of the time.
5. **Best lineup guessed.** How often the plan's lineup was the best possible in hindsight, and how many of its five
   cards were. Also the points left on the table: the hindsight best minus the plan.

More:

6. **Captain.** How often the captain was the lineup's top scorer, and what the choice cost in points.
7. **You against the plan.** The lineups you entered against Sofix's plan, in points and rewards.
8. **Sorare's projection against Sofix's xScore**, on the same players and games.
9. **Two-game weeks.** How the best-of-two estimate did.
10. **Early plans.** How far a plan made weeks ahead was from the final plan and from what happened.
11. **FF's doubles.** When FF showed two names for one place, how often the first one started.
12. **The football board.** The model's season so far: its RPS against the 0.1947 baseline and the bookmakers, and its
    clean-sheet calls.
13. **Coverage and freshness.** For your players:
    - the share with an FF % and the share with Sorare odds;
    - FF names not linked, and FF reads that failed;
    - how old the FF number was at the lock.
14. **Money.** Essence and cash expected against won.

**What it needs first.** Already recorded:

- what each source said at the lock (`start_chances`);
- the forecasts and actual scores (`sorare_forecasts`);
- the kept weeks (`sorare_week:*`);
- your entered lineups with their scores and rewards (the extension reads them, batch 1 step 3).

Missing: the plan as it stood at the lock (the entry above). Figures 3 to 7 and 10 need it. So the page can open with
1, 2, 8, 9 and 11 to 13, and add the rest once each lock freezes the plan. It replaces the "is Futbol Fantasy
trustworthy?" comparison of T2's first draft.

**Where.** A new page, `/audit`, designed on a canvas first like the others.

### Small things the review before the first push left open
Found by an independent read of the batch-1 commits (2026-09-30); the ones that could cost you a page or a wrong
number were fixed (the Futbol Fantasy time budget, the page written last, a week made final only when complete,
early plans that belong to another season, the hindsight label, the no-plan wording). What is left is small:

- **A postponed game is its own early round** (LaLiga MD3 with one game left in December), and it takes one of the four
  six-hour refresh slots meant for the nearest rounds. Harmless; ordering those slots by date would fix it.
- **A fourth open Sorare week gets no plan.** Sofix plans the next three Sorare gameweeks; an early plan skips any
  round inside a week Sorare has opened. Play now says so and still shows your lineups. Rare: Sorare opens about three.
- **The overlay may rank any gallery of four or more cards** that sits under a short text starting "Select your". It only
  reads, at most twice a second, so the cost is nil; it would show as a stray #1 to #3.
