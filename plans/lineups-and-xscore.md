# Plan · better lineups, and an Audit that says why (from the GW21 deep dive, 13 Oct 2026)

Self-contained: a new session can start from this file. Nothing below is built yet.
First step in the new session: copy this file to `plans/lineups-and-xscore.md` in the repo and add its
phases to "Next up" in `plans/roadmap.md`, in the same commit.

## Context

The Audit said Sofix's xScore was within 7 points for 25% of GW21 starters. A deep dive (read-only: Neon
SELECTs, `backend/data/raw/sorare_games.jsonl`, two seasons replayed week by week) found:

- **The xScore is not the weak link.** It is an average of two humps (about 40 with no goal or assist, about
  74 with one), so "within 7" is naturally about 30% (Sofix 30.5%, Sorare 33.1% over 8,728 starts; GW21:
  201 starts, Sofix 25.4%, Sorare 26.9%). No lean (said 49.3, scored 49.3).
- **Nothing beat it for picking.** 34 extra inputs, other averages, a "most likely score": none helped.
  Lineups picked by xScore scored 330 a week, by Sorare's projection 322, random 245, hindsight 463.
  The numbers that score best on "within 7" pick lineups 10 to 25 points worse.
- **Lineup building is where the points are.** GW21 (scores still under review, prizes not settled):

| | Lineups | Points | In-season LaLiga | Champion |
|---|---|---|---|---|
| Owner (entered) | 7 | 2,409 | 359, 308, 259, 251 | 599 (rank 195), 322, 310 |
| Sofix plan 1 | 10 | 3,308 | 451, 312, 272, 216 | 497 |
| Sorare-numbers plan 1 | 11 | 3,503 | 396, 290, 268, 217 | 606, 333 |

  - Start chances too low in the middle: Futbol Fantasy's "70%" started 86% (56 players), "80%" started 90%
    (49), "30%" started 20%. Sofix's lineups scored 18% over their expected total (2,807 said, 3,308 real).
  - Dead keeper slots: three All Star lineups had a keeper at 5–20% to start; all scored 0; the lineups made
    362, 326, 243 against 434 needed, with Grimaldo (100), Koke (89), Riquelme (70) inside.
  - Champion not loaded: the owner's had Courtois, Mittelstädt (C), Grimaldo, Isco (599); Sofix's had Yuri,
    Unai López, Moriba, Álvaro García (497). Mittelstädt and Becker sat at 40% to start, Koke at 30%; all started.
  - Sofix's best lineup (451) was luck: expected 263, range 182–342, no card with an xScore over 54
    (Chust 48 → 100, Isco 53 → 92 as captain, Toni Martínez 48 → 71).
  - Two-season replay (9,500 random pools of 30 starters): plain xScore with captain = best xScore is the best
    single rule (318 points, 20.0% reach a "good" total). Keeper with his defender, no attacker facing own
    keeper, favouring likely scorers: all 318 and 20.0%. Usual (safe) score: 310 and 15.2%. Four lineups from
    one pool: best cards together first gives 0.057 "great" lineups, equal strength 0.025.

**The owner's rules (13 Oct 2026):**
- The xScore is for building lineups. One number per player; two numbers judged after the game is cheating.
- Cap 260 (a Room with a 300 essence fee) is never entered. All Star is **not banned**: its lineup is built
  **last**, from the cards the other competitions left (and entered when it is all there is). Essence order:
  **LaLiga, Champion, All Star** (he never asked for Champion first). Spare cards can go to **Pro levels**
  (GW21: 2 lineups tried, 1 hit, 500 essence). Corrected 13 Oct after Phase 1 shipped the stricter reading.
- Keep strategy comparisons in the Audit, every gameweek, including his own: keeper with his own defender
  ("nothing or win big").
- Say whether a big lineup score was built on data or a fluke.

## Phase 1 · Lineup building (ship first)

1. **Board preferences.** No fee-paying Room (Cap 260); All Star built last; essence order LaLiga, Champion, All Star.
   `backend/app/sorare/planner.py` (`worth_entering`, `priority`, `PRIORITY_FLOOR`) and where the essence
   order is set (`rules.py` / `publish.py`). Check: GW21's frozen pool replanned has no All Star/Cap lineup
   and fees 0; the freed cards land in Champion and in-season lineups.
2. **Correct the start chances from the record.** Per source and band, said against happened
   (`starts.py` `compare`, `PlayerGame.ff_start` / `started`). Apply the correction in `forecast.py` before the
   expected score is made. A band is corrected only from 100 settled cases; log each correction; show it on
   the Audit. This is plans/xscore.md X8. Check: unit test on a fixture record; GW21 bands 70–80% move up.
3. **No dead slots.** A lineup that needs a high total is not entered with a starter under about 30% to play;
   its cards are freed. `planner.py` (`best_starters`, `worth_entering`). Check: GW21 replan has no keeper
   under 30% in an entered lineup.
4. **Best lineup of each competition first.** Confirm `planner.make_plan` loads the strongest lineup before
   the next; fix if the play-chance discount spreads the stars (GW21 Champion). Check with the replay job.
5. **Start chance outside LaLiga.** Find why Bundesliga regulars sat at 40% (source and default in
   `forecast.py` / `starts.py`); fix or widen.

## Phase 2 · Strategy lab, saved every gameweek

**Done 13 Oct 2026** (`strategies.py`, `strategy_audit.py`, `app/jobs/lineup_backtest.py`, `/audit/strategies`). As built: each strategy is
`planner.best_starters` with the players' numbers moved or one more `rule`; one best lineup per competition per strategy (not a whole plan,
so the same card may sit in several), no bench, priced with Sofix's own numbers; saved as `strategy_plans:<slug>` each run until the lock;
scored by `frozen_scores._score`, which now also gives each lineup a verdict (`lucky`, `good`, `expected`, `poor`, and the cards that
beat their own range). Not built: the verdict for your own lineups (no range was saved before the lock for them). Replay, 1,000 pools of 30
starters on the two seasons (random lineup 269 points; best in hindsight 418): xScore 314.2, Highest ceiling 314.4, Likely scorers 314.4
(the same, within noise), No attacker against the keeper 314.2, Sorare's projection 309.0, Usual score 307.6, Keeper with his
defender 307.4 (718 pools had one), Three from one club 305.7. Nothing beats the xScore; the keeper-and-defender and club-stack lineups
are 7 to 9 points worse on average, with a wider spread (their "great" rate is lower, not higher).

1. **Replay job** `backend/app/jobs/lineup_backtest.py` (new, prints only): the random-pool test on
   `sorare_games.jsonl`, reusing `outfield.fit`, `keeper.walk_forward`, `gamedata.load_joined`. Every planner
   change is judged here before it ships.
2. **Strategies written down before the lock.** In the refresh, beside the frozen plan, build the best lineup
   per competition from the owner's cards for each strategy and save them in one read model
   (`strategy_plans:<week>`; no migration):
   - xScore, captain = best xScore (today)
   - Sorare's projection
   - keeper with his own defender (the owner's)
   - full club stack (three from one club)
   - no attacker facing own keeper
   - favour likely scorers (chance of a decisive action)
   - highest ceiling (top of each range)
   - surest starters only (90%+)
   - favourites only (his side most likely to win)
   - usual (safe) score
   Reuse `planner.best_starters` with a different sort key or constraint; no second planner.
3. **Scored after the week** with `frozen_scores._score`, against the best lineup in hindsight from the same
   cards, and against the owner's entered lineups (`entered_week:<slug>`).
4. **Audit view** (new tab or section in `frontend/components/audit/`): per gameweek and for the season, each
   strategy's points, prize, how often it won big, how often it won nothing, and its share of the hindsight
   best. Too few weeks is said plainly, not hidden.
5. **Data or fluke.** Each lineup gets a plain label from numbers already saved (`x`, `lo`, `hi`, each card's
   `start`): "as expected", "good week" or "lucky" (above the top of its range), with the cards that beat
   their own range named. Applies to Sofix's, the strategies' and the owner's lineups.

## Phase 3 · Audit, Lineups: week rows open to a comparison

**Done 13 Oct 2026**, with the strategies in it (owner's request): `strategy_audit.py` scores Sofix's best plan, the strategy lab and your entered
lineups (`my_week` / `entered_week`) per leaderboard (matched by board slug); `WeekComparison.tsx` draws them on Audit > Strategies and
Audit > Lineups. Not done: cards of Sofix's and the strategies' lineups use the art of your collection, so a card you no longer own shows initials.

On /audit/lineups (`frontend/components/audit/LineupsAudit.tsx`), each week row opens to a per-competition
comparison: the owner's entered lineups from the saved weeks (`SavedWeek.lineups`: competition, board,
`result.score`, `result.essence`/`cash`/`card`) beside Sofix's frozen plan lineups for the same board
(`data.frozenPlans`: expected, score). Cards as real Sorare card art with the existing `ComparisonCards`.
Check with the audit e2e spec and a 1440 px + 390 px look on the local dev server.

## Phase 4 · Audit, xScore: a fair yardstick

1. **Picks test** as the headline, Sofix beside Sorare: "Sofix's best five scored X, Sorare's Y, random Z,
   perfect W" (best GK, DEF, MID, FWD and one more among players who started, by the number written before the
   lock). `versus.py` new `picks(rows)` in `figures`; `VersusAudit.tsx`.
2. **Within 7 stays**, with a per-position tolerance beside it (GK 13, DEF 12, MID 10, FWD 12: the distance
   half of all starts land within), labelled as such.
3. **Ranges:** hold 8 in 10 per position (today GK 79%, DEF 86%, MID 88%, FWD 87%): `SPREAD_SCALE` in
   `keeper.py`, per position in `outfield.py`; "landed inside the range" on the Audit.
4. The xScore formula itself does not change in this phase.

## Phase 5 · Research, each kept only if the replay says so

1. **"Often taken off early".** Share of his last 10 starts under 60 minutes, pulled towards the position's 9%
   while he has few. Test in the walk-forward replay (`outfield_fit.py`, no `--write`) whether lowering his
   xScore by that share times the gap (about 13 points between under-60 and 80+ minute starts) lowers the
   typical miss; keep only if the squared miss falls in most weeks. If it holds, a small "often off before the
   hour" note on the player panel. Note: his plain average minutes as an input was already tested and added
   nothing; this is a different measure.
2. **A non-linear model:** scikit-learn in the local `backend/.venv` only (free; not in the project's
   requirements unless it wins), same 34 inputs, same replay, judged on lineup total and typical miss.
3. **Bookmakers' scorer prices** for LaLiga: one check for a free source (plans/xscore.md P9 part 12). No paid
   plan, no new account.

## Phase 6 · Pro levels

`plans/pro.md` holds the research (steps 4.1, 4.2) and was paused at 4.3, a Stop where the owner chooses the
scope. Resume there: Pro is fixed targets, so the chance of a step is the chance a lineup's total reaches the
target, which the planner's simulation already gives. The cards freed in Phase 1 go here.

## How each phase is checked and shipped

- `CLAUDE.md` fast path: work on `main`, `node scripts/check.mjs` before the push, `--live` after, the doc the
  change touches updated in the same commit, "Test it" links at the end.
- Backend: `pytest`; planner changes also through `lineup_backtest.py` and a replan of GW21's frozen pool.
- Visible changes: the page's e2e spec and a 1440 px + 390 px look on the local dev server.
- A change to how lineups are picked ships only if the replay's "good" and "great" rates do not fall.
- Production database: read-only, as always. Local replays read
  `backend/data/raw/sorare_games.jsonl` and `backend/data/raw/sorare_league_history.json` (the docs say
  `sorare_history.json`; that file does not exist locally).

## Limits to keep in mind

- One gameweek: the start-chance finding rests on 105 players; the lineup comparisons on single lineups.
- GW21 scores were still under Sorare's review and prizes unsettled on 13 Oct; recheck once settled.
- The replay's pools are players who started, with no card bonuses and no "will he start".
- Real Pro targets and how the extension reads them: see `plans/pro.md`; not looked at in this dive.
- The owner's real pool of Champion-eligible cards was not replanned by hand; the replan check in Phase 1 does it.
