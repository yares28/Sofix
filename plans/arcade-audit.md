# Arcade audit and upgrade proposal (29 Oct 2026)

Audit only: no code changed. The rework that followed is [arcade-rework.md](arcade-rework.md).

**Name.** The page is **Arcade** everywhere in the project (`/arcade`, top bar, manual §10b, plans/set.md). "Arena" in the repo is
Sorare's Classic Arena competition (Play, Pro, the extension's dock), a different thing. Same page as you meant.

**How it was checked.**
- Code: `frontend/app/arcade/page.tsx`, `components/arcade/*`, `lib/arcade.ts`, `lib/arcadePlan.ts`, `lib/arcadeFdr.ts`, `app/arcade*.css`, `e2e/arcade.e2e.ts`.
- Browser: localhost:3000 in your Chrome. No Arcade set runs today (HyperGlitch ended 27 Oct; Sorare's public API returns
  `currentSet: null`), so the page shows only "No Arcade set is running". To walk it, your board kept in that browser (read 22 Oct 13:44,
  step 3, 4 lives, 1,323 commons, 74 games) was replayed with the tab's clock set to 22 Oct 11:50. Nothing was written to Sorare.
- **Not verifiable in the replay** (marked ⚠ below): Sofix's own xScore, start % and FDR for that week. The server now serves this
  week's numbers, so the replay fell back to Sorare's projections and your saved readings. Phone layout: read from the CSS only (your
  Chrome window would not resize). Screenshots of your tab timed out, so layout was measured in the page instead.

## 1. The user flow, step by step

**What you do today**

1. Open Arcade. The page reads Sorare through the extension (board, cards, bonuses, past scores, projections, start %).
2. Hero: set and end time, "Step 3 of 6 · 360 pts", wallet, four icon buttons (board, start %, scores, info).
3. Your lineups on Sorare (only while some are waiting or live).
4. Your climb, Pick a day (default): a big % for the highest step with 25% or more, the day strip, the tower, "Departures", "On deck".
5. Switch to **Pick teams**: aim select, Easiest games, Clear, 50 game tickets in a box that scrolls inside the page, then below
   it the pitch, "Where it lands" and "Each card's numbers".
6. Leave Sofix and find the five cards one by one in Sorare's own lineup picker.
7. Further down: Packs, Today's missions, Your cards (12 a page).
8. Later: live race, Dead, Cut losses.

**What you should do (proposed order)**

1. Open Arcade → see **one answer**: the next lineup to enter, its chance, its deadline and its five cards.
2. Accept it, or tap **Edit in builder**: Pick teams opens already holding that lineup's games, with the result beside the games.
3. Tick games, swap a card or change the aim; the % and five cards change in view. Fill the remaining lives without reusing cards.
4. Enter on Sorare. Come back for the live race.
5. Packs, missions and the gallery stay below for when you have time.

**Forward:** the next lineup (it is the "On deck" panel, today third level down), Pick teams (your most used tool, today a hidden
second tab), the chance at the step you aim at, when a lineup settles, what a % assumes.
**Back:** the tower and its card fans (fold into a compact ladder), the airport look (flip tiles, "Departures", "boards"), the
refresh toolbar (one status chip and "Read again"), the wallet (one line), Packs and missions.

## 2. Findings

Broken or misleading first. Each points to a file or to what was seen.

| # | Finding | Evidence |
|---|---|---|
| F1 | Pick teams ignores cards already in your waiting or live lineups: it can suggest a card that is busy. Pick a day holds them. | `ArcadePlanner.tsx:159` builds from every chosen game's outlooks; `climbStart` holds busy cards only for Pick a day (`:234`) |
| F2 | A % hides what it assumes. A card with no start % counts as starting (your answer 10), but the chance shows no warning. On 22 Oct Lineup 1 (64%) had 4 of 5 cards with "no start % yet", and its captain was one of them. ⚠ some were unknown only in the replay | seen: deck cards; `arcadePlan.ts:55`, `:116` |
| F3 | A card with under 3 past games scores its exact number in every simulated game, no spread. That makes thin-record cards look safe and favours them for captain (Patouillet: 106, no range, captain). | `arcadePlan.ts:117`, `:129`; seen in Lineup 1 |
| F4 | The hero says two different things: the title says "Step 3 of 6 · 360 pts" while the big number is "78% to clear step 4". | `ArcadeView.tsx:118`, `ArcadePlanner.tsx:323`; seen |
| F5 | Pick teams starts on the first 8 games by kick-off, not on anything useful: on 22 Oct that was eight Europa games, one with 5 of your cards. | `ArcadePlanner.tsx:156`; seen |
| F6 | Switching Pick a day ↔ Pick teams throws your game selection away (back to the first 8). | seen: 50 picked → 8 after the switch |
| F7 | Pick teams does not say when the lineup settles. Ticking every game gave 74% at step 4, but that five plays Thursday to Monday, so it would block the climb for days. The plan limits a lineup to 3 days; the builder has no limit and no warning. | `ArcadePlanner.tsx:155`; `arcadePlan.ts:287`; seen |
| F8 | Slow: each ticket tap froze the page 0.5–1.0 s, Pick a day took 3.0 s to open. | measured in your Chrome on the replay (2,000 simulated games per lineup tried) |
| F9 | The result sits below the games: the 50 tickets are in a 470 px box that scrolls inside the page (1,436 px of content), and the pitch starts at 898 px, below the fold. You tick a game and cannot see what changed. | measured |
| F10 | 50 tickets, unsorted, not paged (rule: more than 12 is paged), no day or league filter. | seen; `arcade-canvas.css:77` |
| F11 | "Aim at" lists steps already cleared (1 and 2). | seen |
| F12 | Two difficulty scales on one page: tickets and lineup chips show 1–5, the card gallery shows 0–100. | `ArcadePlanner.tsx:195`, `ArcadeCards.tsx:36`; manual §10b says both |
| F13 | "Easiest games" says it covers LaLiga, Premier League and Bundesliga; it also uses Ligue 1, Champions, Europa and Conference boards. Same stale wording in `Fdr.tsx:19` ("nothing for Ligue 1, Europe"), the comment at `arcade.ts:747` and the manual line 803 ("those three leagues"). | code and manual |
| F14 | Day strip mixes label formats: "Thu–Fri" next to "Sat 24 Oct". | `ArcadePlanner.tsx:348`; seen |
| F15 | Jargon: "Departures", "Lineup 1 boards Thu 18:45", "On deck", and flip tiles that split "18:45" into five boxes. You asked for plain words. | seen |
| F16 | 4 of 50 tickets had no crest (initials on a shield) for Europe clubs you own no card of. | seen; `ArcadePlanner.tsx:85` |
| F17 | Today's missions: L5/L10/L20/L40 only change Decisive Picker missions; on 22 Oct there were only two streaks, so the buttons did nothing. The streaks count Sorare's LaLiga Common competition, not Arcade. | `ArcadeMissions.tsx:114`; seen |
| F18 | Between sets the page is one sentence. Your cards, the last set's result and when the next set opens are not shown. | seen today |
| F19 | Dead code: `lifeAdvice` (the "when to spend a life" rule) is only used by its test; the climb replaced it. | `arcadePlan.ts:408` |
| F20 | No way to lock a card in, leave one out, or see the next best for a slot. The builder makes one lineup only. | `ArcadePlanner.tsx:150-214` |

## 3. Deep dive: other leagues' xScores

Where each card's number comes from (`lib/arcade.ts:751` `outlookOf`):

1. **Sofix's xScore** when the game is that player's **next** game in a league Sofix rates (LaLiga, Premier League, Bundesliga,
   Ligue 1, and their Champions, Europa or Conference games). The server sends one game per player (`page.tsx:22`, `p.fixture`).
2. Else **Sorare's projection**, read only for games in the next **3 days**, at most 60 games (`arcade.ts:647-649`).
3. Else **his average** of past games he played: no opponent, no home or away.

What this means:

- **X1. The plan compares days on different rulers.** A player's second game in the set (a Thursday Europa game, then Sunday's league
  game) never gets Sofix's number. Days more than 3 days away fall to the plain average. The climb then weighs Thursday (Sofix or
  Sorare numbers) against Monday (averages), which biases play-or-hold. Fix: publish Sofix's xScore and start % for **every game in
  the set's window** for each rated player, not only the next one (backend `loadLeagueMarket` / market payload), and ask Sorare's
  projection for every game as soon as Sorare has one.
- **X2. The source is hidden in a tooltip.** Show a small mark on each number (SF Sofix, SO Sorare, Form), as Lineups already does
  for start % (FF / SO / SF).
- **X3. Conference numbers are provisional** (roadmap, 23 Oct); the card should say so where it shows one.
- **X4. Leagues with no Sofix model** (none in HyperGlitch, but a new set may bring others): they run on Sorare's projection and form
  only; say so on the card rather than mix silently.
- ⚠ The replay could not show Sofix's numbers for 22 Oct, so how often each source was used that week is not measured.

## 4. Deep dive: lineup planning and building (Pick teams kept, made the centre)

- **B1. Side by side.** Games on the left, the five cards and the % on the right, in view while you tick (F9). Canvas: desktop and phone.
- **B2. Starts where the plan is.** Opening the builder loads the next lineup's games and aim; "Plan's games" puts them back (F5, F6).
- **B3. Games by day**, sorted by how many of your cards play, 6 a page, crests always (F10, F16).
- **B4. Aim shows only steps still to clear** (F11).
- **B5. The % says what it assumes**: "4 of 5 have no start % yet: counted as starting", and no captain on a card with no start % unless
  none has one (F2). A thin record gets a spread, not a fixed score (F3).
- **B6. Settles at, and the 3-day cap**: shows when it settles and warns when it holds the climb past the next leg (F7).
- **B7. Busy cards left out** (F1); **Fill my lives** builds up to the lives left, no card twice, in settle order (reusing `planDay`).
- **B8. Swap a card**: tap a card to see the next 3 for its slot with the % each gives; lock or leave out a player.
- **B9. Faster**: run the lineup search off the main thread (a Web Worker) and reuse simulated results between taps (F8).

## 5. Ranked upgrades

Impact on "decide in seconds, climb fast, bet on high chances" against the work it takes.

| Rank | Upgrade | Impact | Effort | Why | Canvas? |
|---|---|---|---|---|---|
| 1 | Hero = next lineup to enter: its %, deadline, settle time, five cards, "Edit in builder" (F4) | High | Low | The one question you open the page for, answered at the top | Yes |
| 2 | Builder beside its result, opened from the plan (B1, B2, F6) | High | Low–Med | Your most used tool, no scrolling to see the effect of a tap | Yes |
| 3 | Busy cards out, settle time, 3-day warning (B6, B7, F1, F7) | High | Low | Stops a lineup you cannot enter or one that blocks the climb | Yes (copy) |
| 4 | Honest %: assumptions shown, spread for thin records, captain rule (B5, F2, F3) | High | Med | The % is what you bet on; today it can be optimistic | Yes (chips) |
| 5 | Speed: Web Worker, cached simulations (B9, F8) | High | Med | 0.5–3 s freezes make trying games painful | No |
| 6 | Games by day, sorted, paged, crests (B3, F10, F16) | Med | Low | Finds the right games in seconds | Yes |
| 7 | Fill my lives, swap a card (B7, B8, F20) | Med–High | Med | Builds all of a day's lineups in one go; tunes one without starting over | Yes |
| 8 | Sofix numbers for every game in the set, source marks (X1, X2) | Med–High | Med–High (backend) | Plan decisions compare like with like | Marks only |
| 9 | One difficulty scale, one day-label format, plain words, fixed stale copy (F12–F15) | Med | Low | Reads the same everywhere | Yes |
| 10 | Compact plan strip and ladder replacing the tower and departures (F15) | Med | Low–Med | Same plan, half the height | Yes |
| 11 | Between sets: next set date, last set's result, your cards (F18) | Low–Med | Low | Today the page is empty for days | No |
| 12 | Missions: hide L5–L40 when no Decisive mission; label streaks as LaLiga Common (F17) | Low | Low | Removes buttons that do nothing | No |
| 13 | Remove `lifeAdvice` and stale comments (F19, F13) | Low | Low | Less to read | No |

Suggested order to ship, depth first: 1+2 together, then 3, 4, 5, 6, 7, 9+10, 8, 11–13.

## 6. Questions only you can answer

1. **Cards with no start %:** keep counting them as starting (your answer 10) with a visible warning, or count them lower, or never
   captain them?
2. **Pick teams across days:** cap a lineup at 3 days like the plan, or allow any span with a warning?
3. **Help entering on Sorare:** Sofix never enters lineups (answer 14). Should the extension mark the five planned cards on Sorare's own
   lineup picker so you find them faster (still entered by you)?
4. **Difficulty scale on Arcade:** 1–5 bands (as on the board) or 0–100?
5. **Airport look** (flip tiles, Departures): drop it for the plain plan strip in the canvas, or keep it somewhere?
6. **LaLiga Common streaks** (not Arcade): keep them on Arcade or move them to Missions?
7. **When does the next set open?** Sorare shows none today; nothing on this page can be checked live until then.
