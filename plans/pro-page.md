# Plan · Pro page (This week → Pro)

Requested 25 Nov 2026. Canvas: https://claude.ai/artifact/3KANFBKxpeQmLumRhTjcyr (private until shared). Not built yet.

## Owner's contract (his words, kept here so no session drops them)

- A new **Pro** view in the "This week" switch (`/pro`, beside Recap, Sorare, Targets, LaLiga, Lineups, Scores, Missions).
- Boards: every board Sofix can fill (`pro.competitions`; Inferno boards stay out).
- A **batch** is a group of games starting close together, as in Arcade: teamsheets come out about an hour before kickoff, sometimes more, sometimes less.
- The page shows all his cards as batches and builds the Pro lineups from them.
- If Pro beats Arena this GW, build Pro first and give the rest to Arena; if Arena wins, the reverse. A card used in Pro for a match cannot be in Arena for that match, and the other way round (Sorare, "What are the 3 game modes", updated 20 Nov 2026).
- A visual walk-through of the GW in Pro; then the cards not in In-Season competitions (Champion, All-Star, Pro), then the remaining players. **One view at a time behind a switch, never stacked.**
- Five features that cut friction. Design bar: AGENTS.md "Owner's standing rules" (minimalist, original, no clutter).
- Do not infer what he did not say: ask.

## User flow

1. Open Pro. Hero question: which batch moves my board up? Board chips (LaLiga, Europe, Contenders ...) each say the step and its target.
2. Pick a batch on the rail (time, games, "Teams out" / "Teams in 1h 12m" / "Locked", chance to reach the step).
3. Read the five cards (captain marked, expected score, start chance), the score track against the ladder, the Pro against Arena verdict and the climb chance.
4. Enter on Sorare (Apply never writes Pro): Open board, Copy five names.
5. Switch to **Arena leftovers** (In-Season Arena, Champion, All-Star behind a second switch), then **Not placed** (no game or not expected to start).
6. Queue the next step from batches not used.

What he wants to see: which batch, which five, whether it clears the step, whether Arena would pay more, and when to act. What he takes away: five names to enter, or the decision to wait or send them to Arena.

## Research (Sorare help centre, public Zendesk API, articles updated 20 Nov 2026)

Articles: What is Pro? (28894302069661), the 3 game modes (17629357197341), scoring validation (38144599039005), pre-set lineups (38310497456413), postponed matches (40811155796509), when competitions open (4402887483025).

- **Entry:** any time before the lineup's first player kicks off; a board is open once a licensed domestic league game is being played. Waiting for confirmed teamsheets is allowed.
- **Step clock:** 4 lives, 4 tries per step. Submitting a lineup starts the clock; the step must be cleared by the end of that league's matchday (38 in LaLiga), else failed. Skipping a matchday is free. Clearing a step early lets you play the next one, and its deadline is the end of the following matchday. This is the app's "Your level is unlocked. Set a lineup to lock it in and start your clock. Every win pushes your deadline to the end of the next match day." Grouped boards (Contender) run to the latest matchday end of their leagues.
- **Validation:** above target 5 minutes after the last whistle: validated for good. Below: failed but reviewable until scores lock (Tue/Fri 20:00 Paris); a correction can validate it. Restarting the board ends that protection.
- **Pre-set lineups (beta):** queue only for the **next** step, only once a lineup is submitted in the current step; submitted automatically on validation, in queue order; refused if a player's game already started or a card is in a submitted Pro or Arena lineup, or the card was sold or listed. Queued cards are not reserved.
- **Cards:** In-Season boards need at least 4 In-Season cards, at most 1 Classic. Rare Reward Bonus: +15% per In-Season Rare, +40% captain, five In-Season Rares double the base pool. Cap 260 and Multi-Club do not apply; scarcity bonus does not apply; New Season, XP, Collection and Captain do.
- **Postponed or suspended:** free cancel for 48 hours returns the life; a suspended match blocks validation until it ends or scores lock.
- **Per board:** rules differ (competitions, rarities, slots, season bonus, targets, prizes). Sofix reads each from `displayedTypedRules` (`pro.py`). LaLiga ladder on 20 Oct: 320 (500 essence), 360 ($5), 380 ($10), 420 ($50), 440 ($300), 470 ($1,500), 550 ($8,000); read the live one at build time. Hot Streaks in MLB (3 lineups per GW) is a different game; not used.

## Advanced questions

- **Better or worse than Arena?** Neither always. Pro pays a fixed prize for reaching a target (all or nothing, no rivals, no substitutes); Arena pays by rank and protects with substitutes. Pro wins when the five are likely to clear a high step; Arena wins when the same five are weak against the target or the board's prize is small. The planner already prices both in one currency (`worth`, $1 = 300 essence) and the page shows the difference per batch.
- **Gambling on who starts?** Not if the lineup is entered after the teamsheet: Pro accepts edits until the first kickoff, so the rule stays "enter only if all five start" (owner, 20 Oct). Before the sheets Sofix uses the chance all five start; after them an announced starter is certain and a benched player only fills a slot no starter fits.
- **How lineups are decided:** per batch, the best five among players who start, ranked by chance to clear the board's current step times its prize, minus what the same cards win in Arena; the rest go to Arena; then to Champion / All-Star.
- **Start % cutoff:** Sorare sets none. Sofix's existing rule is the owner's: no DNP risk for a slightly higher score. Not invented anew.

## Mixing batches (research, 25 Nov; owner: "find the cutoff point where it should mix and match batches")

Today Pro never mixes: `pro.WINDOW` keeps a lineup's games within 60 minutes. Arcade does mix (`arcadeClimb.ts`: next 3 h,
same day, up to 26 h, kept only when 2 points better, `LEG_TIE`). Sorare allows it: a Pro lineup locks at its first kickoff,
so players from later games go in blind and score 0 if they do not start (no subs in Pro).

Method (scratchpad `mix2.py`, GW35 real data): for each first batch, 100 teamsheets drawn from FF start %; only starters of
the first batch are picked; later players carry their start %; best legal five (>= 4 in-season) per teamsheet; average chance.

| First batch (LaLiga, 360) | Alone | +3 h | Same day | +26 h | +26 h, later starters >= 80% |
|---|---|---|---|---|---|
| Fri 21:00 | 0 (no FWD) | 0 | 0 | 27.3 | 30.5 |
| Sat 16:15 | 0 (no GK) | 25.5 | 24.8 | 26.1 | 28.6 |
| Sat 18:30 | 1.3 | 18.5 | 17.7 | 24.4 | 25.6 |
| Sat 21:00 | 0.9 | 0.8 | 0.9 | 8.1 | 8.6 |
| Sun 18:30 | 9.1 | 12.3 | 10.1 | 12.9 | 10.4 |
| Thu 18:45 (Europa, 340) | 4.1 | 3.3 | 3.0 | 4.4 | 5.5 |

Findings: the "if all five start" chance hides that a legal five with 4 in-season cards rarely survives the teamsheet
(Sat 18:30: 16% if all start, 1.3% for real). Cutoff to ship: try the batch alone, then +3 h, same day, +26 h; keep the
shortest span within 2 points of the best (Arcade's `LEG_TIE`); no fixed start % floor (the simulation already scores a blind
non-starter 0, and an 80% floor helped on 26 h spans but cost 10 points at Sat 18:30 +3 h). The week Hold/Play bar uses these.

## Canvas v5 (25 Nov, owner's comments on v4)

- Every Pro lineup obeys the boards' rule read from `displayedTypedRules`: at least 4 in-season cards (v4 had three classic
  cards in one five). The Champions board has no legal lineup this week (one in-season card on Wednesday).
- Five slots, not four: GK, DEF, MID, FWD and one extra outfield; a batch without a legal five shows the missing slot and
  its in-season count (n / 4).
- Start % becomes "XI" once the teamsheet is out; a benched player is swapped and the five recomputed.
- Cleared / Missed are labelled buttons; the chance sits in a coloured target block (step, prize, ten cells, %).

## Canvas v4 (25 Nov, the owner's answers after v3 was rejected)

His words: "I want to see what are the best teams to put in PRO, this is the main point. ONLY PRO when PRO is selected";
Arena leftovers = cards still unassigned after the Sorare page's LaLiga in-season lineups; Not placed = cards left after
all the Sorare page's lineups. Each player: Sofix xS for that game, FF start %, opponent + difficulty, last five as
coloured bars with numbers; no explanatory text, it must read visually. The steps are a chain: mark a lineup cleared or
missed and see the next lineups' odds at the step they would then play. Original look on the white shell.

Built in the canvas: board switch (LaLiga S1, Champions S0, Europa S0); a staircase of the board's steps with the chance
of reaching each this matchday; a day switch (dots = batches, hollow = cannot field five); per batch the best five with
start %, xS hexagon in Sorare's colours, opponent crest with difficulty bar and H/A, last five coloured bars, a ring with
the chance at the step it plays, and a not played / cleared / missed switch that re-plays the chain. Unplayable batches
show the missing position as a red dashed slot.

## Five features (canvas v3, 25 Nov, after the owner rated v1 and v2 1/10)

v2 was rejected: gauges unclear, xS small, start % missing, no game stats, copied styling with unfinished data, basic
features, useless buttons and clock card. v3 is drawn from the real week (GW34, 25-30 Nov) and drops all of that.

1. **The week as batches:** every group of his games within the hour, Wed to Mon, with crests, the positions he can fill
   and the chance at the board's step. 8 of 14 batches cannot field five (mostly no keeper).
2. **The climb:** a numbered run across boards (Wed 21:00 Champions, Thu 18:45 Europa, Sat 18:30 LaLiga step 1,
   Sun 18:30 step 2) and each batch's chance at every step of its board, not only the current one.
3. **Entered-lineup check:** Thursday's lineup on Sorare (Radu, Alonso, Febas, Driouech, Jutglà) is 6% all start / 13%
   at 340; Sofix's five (Moriba for Febas, Aspas for Driouech) is 17% / 22%.
4. **Bench tree:** each slot's replacement if he is benched, ready for the teamsheet.
5. **Arena hold-back:** the 10 cards the LaLiga climb needs, kept out of Arena GW35 before Friday 16:00.

Per card: start % (large, coloured), average as a starter (last 15), last 5 scores (minutes shown), bench fallback.
Per game: win and clean-sheet chance. Script that produced the canvas numbers: scratchpad `week.py` (30,000 draws from
each player's last 15 starts; captain +50%, other bonuses +6% until the build reads card levels).

## Open questions for the owner

- Batch window: Pro uses 60 minutes (`pro.WINDOW`), Arcade 75 (`arcadeClimb.WINDOW_MS`). One window for both?
- Pre-set queue is new since 20 Oct. In scope for this page?

## Built (25 Nov 2026, first slice, committed locally)

- Backend: `pro.week_plan` (by batch with the span cutoff, best five, every card once, at most 4 lineups, teamsheets drawn, blind
  later players) and `publish.pro_plan_payload` (steps, batches, both plans, each card's xS, start, fixture with difficulty, last
  five, legal subs); the Sorare job writes block `sorare_pro` for the planned week and the next one (hold or play), out of `sorare`.
  Cost measured at about 9 s per board per week. Tests: `backend/tests/test_pro_week.py`.
- Frontend: `/pro` in This week (`lib/proWeek.ts` chain, reach, moves, matchday hold, with tests; `components/pro/ProView.tsx`;
  `app/pro.css`; skeleton), spec `e2e/pro.e2e.ts` on a fixture built from GW35's real data.
- Not built yet: the Arena leftovers and Not placed views (they need the Sorare page's chosen lineups in the block), the phone
  board's final look check in the owner's Chrome at 390 px (checked by the spec at 390 px: no overflow, no small text, axe clean).

## Build notes

New route `frontend/app/(board)/pro`, view added in `frontend/lib/places.ts`; read from the existing `sorare` block (`pro.windows`) and the extension's entered Pro lineups; reuse `arcadeBatch.batchesOf` grouping if the window is unified; skeleton 1:1; page spec before ship (AGENTS.md "Shipping" step 3).
