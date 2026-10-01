# Plan · Fix the 1 Oct review of the live pages (T2b)

The issues are listed in full in [TODO.md](../TODO.md) under **T2b** (R1 to R35), with what was seen on production. This
file gives them an order, a goal and a check, so a session can work through them on its own and stop only where you have
to choose.

## The rule about Futbol Fantasy (your correction, 1 Oct)

Futbol Fantasy publishes probable lineups only for **each LaLiga club's next game**. Today that is round 8: its page
reads "Jornada 8", the same ten matches as `/lineups` (22493–22502, Fri 9 – Mon 12 Oct). Weeks before FF was added have
none. Later rounds (9, 10, …) have none until FF moves on, about a day after each club plays. National-team weeks (GW19,
GW20) never have any.

What that changes in the review:

- **R4 is not a bug.** `/lineups` always showing round 8 is right. Two things are still missing: a note when you arrive
  from a week FF does not cover, and a message for an unknown match address.
- **R2 is about the words.** GW19 is national-team games, so FF has nothing for it. The tile is wrong only in saying FF
  has "not published a lineup *yet*": for those games it never will.
- **R1 stays, narrowed.** The early plan for round 8 is the one early plan FF *does* cover, and it still uses Sofix's
  own estimate (Miguel Román, out until early November on FF, sits in a GW8 lineup at 83%). The early plans for rounds 9
  and 10 are right to have no FF.
- **R3 stays** (GW8, GW9 and GW10 plans identical), but it has nothing to do with FF.

## Your decisions (1 Oct)

1. **Plan for the LaLiga competitions Sorare is going to open (step 1.7).** Early plans today copy the open gameweek's
   competitions (All Star during this break), and that is wrong. When a week has a full set of LaLiga games, Sorare opens
   LaLiga competitions for it, so plan for them before they are official. This holds for a week Sorare has not opened,
   and also for an open week whose LaLiga competitions are not listed yet. A week whose LaLiga games were moved or played
   early probably gets none. When Sorare publishes the real competitions, the next run replaces the expected ones.
2. **"Called up" (step 1.4):** do what was recommended. Show it only once the club's squad list is out, with no stop.
3. **The design board (batch 4):** stop there and let you choose.

## Goals

The work is done when all of these hold **on production**, checked in the browser at desktop and phone width:

| # | Goal | How it is checked |
|---|---|---|
| G1 | No two pages disagree about the same player in the same game | Five of your round-8 players: the chance and status on `/lineups`, on Play (LaLiga GW8) and on the overlay are the same number from the same source |
| G2 | Every page that shows a week says which LaLiga round and which Sorare gameweek it is, and how fresh it is, in one wording | Home, Play, Lineups, Cards, Players, Control and the overlay use the same week name and the same "9 h ago (03:33)" form |
| G3 | Everything you read is English, and nothing is in the past tense of the future ("out until" a date gone by) | No Spanish word on `/lineups` except names; no "until" date earlier than today |
| G4 | On each match, your players are visible without scrolling | A strip at the top of each match lists them with their chance and status |
| G5 | Every player card looks like the same product | Owned and not-owned cards follow the design you choose in batch 4; no blank rectangle, no failed photo request |
| G6 | A week with a full LaLiga round is planned for its LaLiga competitions, official or expected | LaLiga GW8's plan has LaLiga lineups marked "expected" until Sorare lists them, then Sorare's own |
| G7 | All checks pass | Backend `pytest -q`, `ruff check .`, `mypy`; frontend `npm test`, `npm run typecheck`, `npm run lint`, `npm run e2e`, `npm run design` |

## How the run works

- **One step at a time, in the order below, broken things first.** Before each step, read the code it names. Write the test
  that fails first, make the smallest change, run that test, then the checks in G7.
- **Commit each step** (`fix:` / `feat:` / `docs:`), **push once per batch**, wait for Vercel, then check every step of
  the batch on production: desktop in the browser, phone width with `npm run e2e` (its mobile project) and `npm run
  design`. Write the result under "Results" at the end of this file: date, pass or fail, what was seen.
- **Production Neon is read-only** (`SELECT` only). Nothing paid, no new dependency without a reason, no unrelated
  refactors.
- **Keep the docs true:** update [docs/user_manual.md](../docs/user_manual.md), [docs/how_it_works.md](../docs/how_it_works.md)
  and [plans/futbolfantasy.md](futbolfantasy.md) whenever behaviour changes.
- **Stop and ask** only at the points marked **Stop**.

## Batch 1 · Wrong numbers and wrong words

### 1.1 · The early plan for FF's round uses FF (R1)

- **Where.** `backend/app/sorare/publish.py`, `projected_weeks` (about line 764), calls
  `player_weeks(..., use_sorare=False)` with no FF reader, so no early plan ever sees FF. The reader the planned week
  uses is in `backend/app/sorare/ff_use.py`. The rule to change is the "early plans for later rounds" row of section 4 in
  [plans/futbolfantasy.md](futbolfantasy.md).
- **Change.** For the round whose games FF has, matched by teams and kickoff the same way the planned week matches them,
  pass the FF reader. A player FF has out, suspended or at 0% does not start in that early plan. The card shows the FF mark
  and the read time. Rounds FF does not have keep Sofix's estimate.
- **Test first.** A backend test with a stubbed FF reading: the early plan for round N takes FF's chance, a player FF
  has out is in no lineup, and round N+1 has no FF.
- **Done when.** Play's LaLiga GW8 shows the FF mark for players in round 8, Miguel Román is in no lineup, and LaLiga
  GW9 and GW10 still show SF.

### 1.2 · Team news says why there is no FF (R2)

- **Where.** `frontend/components/home/TeamNewsTile.tsx` (the idle text, about line 45), plus whatever tells it that the
  planned week has no LaLiga games.
- **Change.**
  - In a national-team week: "GW19 is national-team games. Futbol Fantasy covers LaLiga only. Round 8's lineups are on
    Lineups (n of your players)."
  - In a LaLiga week FF has not reached yet: "Futbol Fantasy publishes each club's next game about a day after its last one."
- **Done when.** Home in GW19 shows the national-team wording with the round-8 count and link. The existing
  `teamnews.e2e.ts` passes, plus a new test for a national-team week.

### 1.3 · Injury and status text in English, never in the past (R7)

- **Where.** `frontend/lib/lineups.ts`, `absenceText` (about lines 284–302), and its tests in `lineups.test.ts`.
- **Change.**
  - Status phrases:
    - "Disponible para la jornada N" becomes "Available for round N".
    - "Baja confirmada para la jornada N" becomes "Out for round N".
    - A month with a year: "enero 2027" becomes "January 2027".
  - An "until" that has already passed becomes "Was due back late September".
  - A short table of FF's common diagnoses:
    - ACL tear
    - hamstring injury
    - knee arthroscopy
    - ankle sprain
    - muscle overload
    - muscle discomfort
    - straight red card
    - training apart
    - tibia fracture
    - knee injury
  - Anything not in the table keeps FF's words, marked as FF's.
- **Done when.** There is a unit test for every phrase seen on 1 Oct, and `/lineups` shows no Spanish except names.

### 1.4 · "Called up" next to "Squad list not out" (R8)

- **Where.** `backend/app/sources/futbolfantasy_matches.py` (the squad box, about line 768), and what a real match page
  marks before its club publishes the squad.
- **Change (your decision).** Show "Called up" only once the club's squad list is out. Before that, hide the badge. If FF's
  mark means something else (for example the last game's squad), say what in the plan's Results and still hide it until
  the squad list is out. There is no stop here.
- **Done when.** No match shows both.

### 1.5 · Small wrong words (R9, R10, R11, R12, R14)

- **R9.** "1 lineups": `frontend/components/home/SorareTiles.tsx` (lines 72 and 173).
- **R10.** "Still scoring" before the lock: `frontend/lib/entered.ts` (about line 153). It should say "Locks in 1 d 3 h"
  before the lock and "Not started" between the lock and the first game.
- **R11.** "Last gameweek GW17" while Control says GW18 is live. Check `lastWeek` in `frontend/lib/play.ts` and the job's
  `lastId`.
  - If GW18 is simply still scoring, say "GW17 · GW18 still scoring".
  - If not, fix the job.
- **R12.** Control's "2× board refreshes a day": `frontend/components/control/HowItRuns.tsx` (about line 113). Take the
  number from the real schedule.
- **R14.** Play says "9–13 Oct" where the picker, Home and Lineups say "9–12 Oct". Use one rule, the day of the last
  kickoff, for every week label.
- **Done when.** Each has a unit test and reads right on production.

### 1.6 · Lineups says which week it is, and handles other weeks (R4, R5)

- **Where.** `frontend/app/lineups/page.tsx`, the header in `frontend/components/lineups/LineupsView.tsx`, and
  `pickMatch` in `frontend/lib/lineups.ts`.
- **Change.**
  - The header reads "LaLiga round 8 · Fri 9 – Mon 12 Oct · Sorare: not open yet". Once Sorare opens the week it reads
    "Sorare GWnn · locks Fri 16:00". Either way it links to Play for that week.
  - Arriving with `?w=` for a week FF does not cover shows one line: "Futbol Fantasy only has each club's next LaLiga
    game: round 8. GW19 is national-team games."
  - An unknown `?m=` shows "That match is no longer on Futbol Fantasy" above the first match.
- **Done when.** There are e2e tests for a past `?w=`, a national-team `?w=` and an unknown `?m=`.

### 1.7 · Plan for the LaLiga competitions Sorare is going to open (R3, your decision 1)

This is the largest step. Give it its own push.

- **What is wrong.** `projected_weeks` in `backend/app/sorare/publish.py` (about line 777) gives every early plan the
  competitions of the gameweek being planned (`snapshot["competitions"][planGameweek.slug]`), which is All Star during
  this international break. LaLiga GW8, GW9 and GW10 therefore come out identical, and none of them has the LaLiga
  competitions Sorare will open. An open gameweek that holds a LaLiga round before Sorare lists its LaLiga competitions
  has the same gap.
- **Find out first (read-only, Sorare's API and the stored read models).**
  - Which LaLiga competitions Sorare opens in a LaLiga week: Limited and Rare, Classic and in-season, cap, and how many
    games the lineup needs.
  - What their rewards and reference cuts look like. `references`, `referenceFor` and `pick_reference` in
    `backend/app/sorare/sync.py` already keep a played week's cut-offs.
  - How many LaLiga games a gameweek had when Sorare did, or did not, open them. This gives the rule for "enough games",
    measured on past gameweeks rather than guessed. Write the numbers in Results.
- **Change.**
  - **Expected competitions.** For any week, open or not, where the LaLiga round is "full enough" by that rule and Sorare
    lists no LaLiga competition yet, add the expected ones.
    - Copy their definitions from the last played gameweek that had them, and take their reward cut-offs from it too.
    - Mark them `expected: true` with the week they were copied from.
  - **Sharing out cards.** The plan shares cards out across the official and expected competitions together, so it no
    longer puts a card into All Star that is better kept for LaLiga.
  - **On screen.** An expected competition's lineup says "Expected · Sorare has not opened it yet" and has no Apply
    button: Check → Draft → Enter only works for competitions Sorare lists.
  - **Replacement.** On the first run after Sorare lists the real LaLiga competitions for that week, they replace the
    expected ones. They are never shown twice.
  - **Weeks without a full round.** A week whose LaLiga games were moved or played early (below the rule) gets no
    expected competition.
  - **What stays as it was.** National-team weeks keep their own competitions.
- **Also (the recommended note).** Early forecasts still stand on form alone. Add one line to the early-plan note: "Built
  on form, so later weeks look alike until Sorare opens them." Fixture difficulty in early forecasts belongs to T1.
- **Test first.**
  - A full round with no LaLiga competition listed gets the expected ones, and a thin round does not.
  - An expected competition disappears when the real one is listed.
  - The plan never sends one card to two lineups.
  - An expected lineup cannot be applied.
- **Done when.**
  - LaLiga GW8 on Play shows LaLiga lineups marked "Expected", alongside any official competitions.
  - Cards are shared out across both.
  - The picker and Home say "expected" where it applies.
  - [docs/how_it_works.md](../docs/how_it_works.md) and the manual explain it in one paragraph each.

## Batch 2 · One way to say each thing

- **2.1 · Week names (R13).**
  - **Where.** `frontend/components/WeekPicker.tsx` (line 15) and the Home and Play headers.
  - **Rule.**
    - When both exist: "LaLiga round 8 · Sorare GWnn".
    - Before Sorare opens the week: "LaLiga round 8 · Sorare not open".
    - In an international week: "Sorare GW19 · national teams".
  - The early-plan note stops naming another week's number.
- **2.2 · Freshness (R15).** One helper giving "9 h ago (03:33)", used by Control, Play, Lineups, Home and the overlay.
- **2.3 · The picker's columns (R16).**
  - The chip says "n playable".
  - The right column always says what its number is: "≈9 essence · 3 plans", "early plan", "2 cards play".
- **2.4 · The match tab count (R17).** "3 yours · 0 starting", with a line in the legend.
- **2.5 · Names (R18).**
  - Pitch cards and chips use the same short name, with the full name on hover.
  - Your card's name is no longer hidden under the % pill.
- **2.6 · Time zone (R19).** "Madrid time" once in the Lineups header and on Fixtures.

## Batch 3 · Easier to use

- **3.1 · Your players first (R20).**
  - At the top of each match, a strip lists your players in it with their chance, mark and status.
  - An "Only my players" switch dims everyone else.
- **3.2 · Fewer dead names (R21–R23).**
  - Alternatives at 0–5% and anyone out or suspended fold into "+3 more".
  - "Also in the squad, at 0%" gets its reason, or goes.
  - "Knock, but available" folds into "4 more fit to play".
- **3.3 · Links (R24).** A player on `/lineups` opens his card or Play row, and a Play card opens his match on `/lineups`.
- **3.4 · Cards and Players (R25).**
  - Cards gets a "Next game · chance (FF / SO / SF)" column.
  - Players' "Projected —" is explained or filled.
- **3.5 · The overlay (R26).**
  - With no FF number, it says "FF covers LaLiga only".
  - The panel shows every card of the lineup, or "+4".
- **3.6 · Quicker match switch (R27).** Switch matches on the client from the payload the page already has (all ten), and
  keep `?m=` in the address.
- **3.7 · Readable sizes (R28).** At least 11 px on the desktop and 10 px on the phone for any text, checked in
  `npm run design`.

## Batch 4 · Looks: design first · **Stop: your choice**

- **4.0 · Research Q6 first (free, read-only).** Is there a field in Sorare's schema that gives a card picture for a
  player you do not own? The answer decides the options in 4.1.
- **4.1 · A design canvas** (`/design`, as for the overlay and the first Lineups board):
  - **One card for every player (R6, R31):**
    - (A) Sorare art for everyone, if Q6 allows it.
    - (B) A card in the club's colours with FF's photo when it exists, and the shirt number and name when it does not.
  - Also on the canvas:
    - the loading state (R29)
    - the crest fallback (R30)
    - the called-up mark (R32)
    - the colour key (R33)
    - a tighter pitch (R34)
    - the Team news tile and the "All Star · Ca…" cut-off (R35)
  - **Stop** until you choose. Save the chosen look as `docs/sorare/design/lineups-v2.html`.
- **4.2 · Build the chosen look,** then compare it with the board on production at desktop and phone width.

## Results

### Batch 1 · 1 Oct 2026 · **pass**, with three corrections found on production and made

Merged as #10 (1.1–1.6), #11 (1.7) and #12 (a correction to 1.7); two refreshes run by hand on `main` (#37, #38) so the backend steps
could be read; Vercel was live within about a minute of each merge. Checked in your Chrome on https://sofix-yares.vercel.app.

| Step | Result | What was seen |
|---|---|---|
| 1.1 R1 | pass | GW21 (round 8, which Sorare opened after the review) takes Futbol Fantasy's chance: 51 FF marks against 4 SF in its lineups. Miguel Román is in none of its 9 lineups. LaLiga GW9 and GW10 keep SF, as intended. |
| 1.2 R2 | pass after a fix | Home first showed the club-week wording: GW19 holds 15 national-team games **and** 4 of other leagues (Segunda, Argentina), so "every game national" was false. Now: no LaLiga game and national games the bulk. It reads "GW19 is national-team games. Futbol Fantasy covers LaLiga only. Round 8's lineups are on Lineups (75 of your players)." |
| 1.3 R7 | pass | No Spanish word in any injury list of the ten matches (all causes, notes and dates read). "Was due back late September", "Out until January 2027", "Out until November–December" all seen. |
| 1.4 R8 | pass | 10 of 10 matches say "Squad list not out" and none shows a call-up mark. |
| 1.5 R9–R12, R14 | pass | "1 lineup"; entered lineup "Locks in 1 d 0 h" with a dash for its score; "Sorare GW17 · GW18 still scoring"; Control "3–5× board refreshes a day"; Play's header "Fri 9–12 Oct" equals the picker's "9–12 Oct". |
| 1.6 R4, R5 | pass | Header "LaLiga round 8 · Fri 9 – Mon 12 Oct · Sorare GW21 · locks Fri 16:00" (it read "Sorare: not open yet" before GW21 opened), linked to Play. A past week, a later week, a national-team week and an unknown `?m=` each get their one line; the round's own week gets none. |
| 1.7 R3 | pass after a fix | LaLiga GW9 and GW10 early plans have LaLiga lineups marked "Expected · Sorare has not opened it yet", a 47% reward chance against GW15's cut-off of 313, no Apply, picker "early plan · expected". GW21 first showed All Star lineups only: it was judged by the week being planned (a break) whose reference week had no LaLiga cut-off; #12 fixes that, and after refresh #38 it has LaLiga, All Star and Champion lineups, official, sharing the cards. |

**The rule for "enough LaLiga games", measured** (Sorare's API, read-only, gameweeks 1–21 of 2026/27, 22 calls): LaLiga's own competitions
(LALIGA EA SPORTS, Under 23, All Star with LaLiga in it) were opened in all 11 gameweeks that held a LaLiga game, even one (week 10), and in
none of the 10 that held none (weeks 1–4, 12, 16–20). The Champion league (top five leagues) was opened in all 8 gameweeks with 5 or more LaLiga
games and in none of the 3 with fewer (weeks 6, 8, 10: 2, 4 and 1 games). So the rule is **at least one LaLiga game** for LaLiga's
competitions, and **five or more** for Champion, a little looser than the plan guessed ("a full set of games"). Each kind of week copies the
latest finished week of its kind (`backend/app/sorare/expected.py`).

**What FF's call-up mark means** (1.4): `data-internacional="1"` on a shirt, 14 of 54 players on the Real Sociedad–Deportivo page of 30 Sep
(Guedes, Portuguese and not called up, is not flagged): a **national-team call-up**, a different list from the club's match squad. It is
hidden until the club's squad list is out, as decided.

**Not checked on production:** phone width (Chrome cannot be made narrower than its window here; the mobile e2e project, 129 tests with the
desktop ones, and `npm run design` passed locally); G1 on the sorare.com overlay (it needs a sorare.com page; Play and Lineups agree for 12
round-8 players: Ryan 95, Güler 70, Vicente 80, Oblak 95, Alonso 80, Olasagasti 90, Diomande 50, de Haas 70, Soria 95, Saliba 60, Akhomach 70,
Valera 80); the overlay still shows FF's Spanish diagnosis when a status has no "since" date (`extension/core.js`, step 3.5).

Goals after batch 1: **G1** holds between Play and Lineups; **G6** holds (GW21 has official LaLiga lineups, GW9 and GW10 expected ones);
**G3** holds on Lineups; G2, G4, G5 and G7's browser part follow in the next batches.

## To start a run

The prompt to paste into a new session is the one given in the chat on 1 Oct. In short: work through this file from the
first step not marked done in Results, one step at a time, following "How the run works" and "Your decisions". Use the
branch `claude/review-fixes`; push and merge once per batch (step 1.7 on its own), check on production, write Results.
Stop only at batch 4's design board or for money, credentials, destructive actions or an unsettled choice.
