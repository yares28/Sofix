# How Sofix works, number by number

**Verified 2026-09-27.** This is the calculation/data-flow reference. See the [manual](user_manual.md) for operation
and [research report](research_report.md) for caveats.

## 1. Source to screen

```text
football-data.org fixtures/results ─┐
football-data.co.uk history ────────┼─> GitHub refresh ─> Neon normalized rows + complete read_models
The Odds API prices ────────────────┤                                  │
Sorare public GraphQL ──────────────┘                                  v
                                                               cached Next.js/PWA
                                                                        │
signed-in Sorare session <─ local allowlisted extension <───────────────┘
```

Production has no always-running Python server. FastAPI is local/typed fallback. Refresh order:

1. verify Alembic head (unattended runs never migrate);
2. sync fixtures/results and the current CSV cache;
3. sync one batched odds call if last success is ≥6 hours old;
4. replace current football predictions;
5. sync/forecast/plan/replay Sorare;
6. replace `grid`, `system`, `sorare`, `sorare_references`;
7. authenticated cache revalidation.

A partial unique index permits one running refresh. Button retry is ten minutes. Steps record status/timing and publish
usable state where possible even when an optional source fails.

Schedule in UTC: daily 07:17 and 22:43, Tuesday 13:23, Friday 17:23. Control converts to Madrid time.

## 2. Football inputs

- **football-data.org:** calendar/results/team identity. UTC kickoff, Madrid display; unassigned is Date TBC.
- **football-data.co.uk:** five-season goals/shots/on-target/closing odds; production fit uses last 730 days. Old files
  stay cached; current season is conditionally refreshed; new-season 404 means not published.
- **The Odds API:** EU h2h + totals. Remove each bookmaker margin, then aggregate fair prices. Usable for blending only
  within seven days, age ≤48 hours and ≥3 bookmakers.
- **Team registry:** canonical join among codes/spellings/colours/stadiums/Sorare odds aliases.

Market scoring/CS/concede/BTS values are inferred by fitting goal rates to fair 1X2+totals. They are not direct quotes.

## 3. Dixon-Coles

Training target per side:

```text
target = 0.70 × goals + 0.30 × scaled shots on target
weight = exp(-0.001 × age_days)
```

The fit estimates club attack/defence, league home advantage and low-score `rho`, with ridge 1.0, 730-day window and
neutral promoted prior. Conceptually:

```text
log(lambda_home) = intercept + home + attack[home] - defence[away]
log(lambda_away) = intercept        + attack[away] - defence[home]
```

Strengths are stretched 1.10 around their mean to undo ridge compression. A 0–10 Poisson grid receives Dixon-Coles
adjustments at 0–0, 0–1, 1–0, 1–1, is renormalized, then summed for W/D/L, xG and score events.

Eligible W/D/L blend:

```text
P_final = 0.65 × P_model + 0.35 × P_market
```

Missing/stale/sparse market means model-only, not zero. Clean-sheet display is calibrated:

```text
logit(P_calibrated) = -0.1542058812 + 0.9321588120 × logit(P_raw)
```

Fit `n=22,334`, through 2026-09-17. Other probabilities are not silently passed through this correction.

## 4. Difficulty and labels

```text
expected points = 3 × P(win) + P(draw)
difficulty = 100 × (1 − expected_points / 3)
           = 100 × P(loss) + 66.7 × P(draw)
```

Lower is kinder. Current bands:

| Bucket | Label | Cut |
|---:|---|---|
| 1 | Very favourite | `<36.0` home, `<23.4` away |
| 2 | Favourite | then below 48.6 |
| 3 | Even | 48.6–61.1 |
| 4 | Underdog | 61.1–71.3 |
| 5 | Big underdog | 71.3+ |

The strict away top cut makes the strongest label mean roughly the same win promise at both venues. Backend publishes
bucket and all scales; frontend renders them.

## 5. Six lenses

| Lens | Tile | Window/ranking |
|---|---|---|
| Overall | Expected-result difficulty | Sum expected points |
| Attack | Expected team goals | Sum xG |
| Defence | Calibrated clean-sheet chance | Sum expected CS |
| Record | Club's five-season result edge at model price | Average shrunk edge per eligible game |
| Vs odds | Same at bookmaker price | Average shrunk edge per priced game |
| Odds | Fair market win chance | Average market expected points per priced game |

Record/Vs odds require at least five club games and shrink toward an eight-game league prior; they never feed the
forecast. Finished fixtures retain forecast/review but leave future totals and scale cuts. Blanks count no match;
doubles include both.

Overview picks: FWD by xG, DEF/GK by CS, MID by 65% attack + 35% defence standardized blend. Kindest/toughest uses
per-game value so doubles do not win automatically. Next is match cards; Next 3/5/8 is one selected-price tile per GW.

## 6. Tables and review

Current standings stop after selected GW. Head-to-head applies only after both mutual matches, then GD/goals. Predicted
table fixes played points and runs seeded remaining-fixture simulations; identical input means identical percentages.
The opening projection is a fixed preseason artifact.

Finished fixtures keep pre-kickoff belief and add surprise/performance-gap/verdict. Results never rewrite the forecast.

## 7. Sorare public sync

The read-only key fetches Sorare gameweeks/games/cutoffs, leaderboards/rules/rewards, public owner cards/exclusions,
eligible tracks, player scores/projections/play odds, and the LaLiga squad/market index. References are reused to respect
rate/complexity/depth limits. Sorare's own games decide eligibility; its GW number is not a LaLiga matchday key.

Every published player game carries the actual participating side and crest as well as the opponent. That distinction
matters during international windows: a Real Madrid card representing Türkiye is shown as Türkiye, never Real Madrid.
Outside LaLiga the app shows chance to play and xScore, explicitly not a fabricated match-win probability.

Cards/Players are latest-sync snapshots. Market value is cached valuation, not a live listing. A double gameweek uses
Sorare's best-game behavior.

Past games are kept permanently in `player_games`. `league-history.yml` reads the market and the owner's collection,
including players outside LaLiga, stalest first, saving every 50 players. First reads page back to the season's first
gameweek; later reads start three days before the newest played game, widening for unsettled scores, through now + eight
days. The refresh upserts its fresh owner history too. Actual-only upserts preserve frozen statements, unknown cards/stats
and newer reads. `cached_league` supplies the same 70-day form window with season-long yellow totals; the old
`sorare_league_history` row is retained but no longer written. Keyed reads keep teams, non-zero stats and scoring points.
Sofix's own start chance and form fallback exclude the next LaLiga game after a red card or the fifth season yellow
(RFEF's 3 March 2026 disciplinary code, articles 119–121). A second game in the week remains available; FF/Sorare evidence
still has priority over this fallback.

Each refresh also writes the planned week's pre-lock source statements for every indexed player and owner player into
the same rows (`player_games.save_statements`, from `publish.score_record`). It keeps each game's FF and Sofix start
chance, Sorare's next-game starter odds, the recorded Sofix score and Sorare projection, and FF's actual predicted-eleven
membership from `lineups`. The score columns retain the existing comparison's score-if-starting meaning; they are compared
on starts. Later pre-lock reads replace supplied numbers; a failed source never erases one, and no statement is first
created or changed after lock. Actuals and statements update separate columns. `score_record:*` now keeps the frozen
week, position and whole-week expected-score metadata; `start_chances` is a read-only historical fallback.

## 8. xScore

1. Last five with priors estimates P(play) and conditional score (priors 0.60 and 45).
2. Sorare conditional projection replaces score when present.
3. Sorare starter+sub odds replace P(play) when present.
4. For `g>1`, `P(any)=1-(1-p)^g` and conditional mean receives a best-of-two uplift.
5. `xScore=P(any)×conditional_mean`.

**The picture behind a number (plans/xscore.md P9 X5, `keeper.Outcome`, `outfield.OutfieldModel.outcome`).** Every number the game models make is also kept as the two games it adds up from: the chance of a decisive action (a clean sheet or a penalty saved for a keeper; a goal or an assist for the others, a logistic line on the same game numbers, fitted on the same starts, `chance` in `artifacts/outfield_score.json`), his score with one and without one (shifted so that chance times the first plus the rest times the second is exactly the number shown), how far each spreads (a standard deviation from the starts' leftovers, widened like the range) and where he lands 8 times in 10. A substitute's picture is the position's own (`artifacts/sub_shape.json`, from every substitute appearance of the export), centred on his "if he comes on". Each reason is a feature's weight times how far this game is from a typical one (the opponent: clean-sheet chance and goals against; attack: his side's goals for; form; home; Sorare's projection), in whole points, the two biggest shown. The refresh puts it on each of your cards as `shape` and `onShape` (`publish._shape_out`); the extension draws it (`core.shapeBars`, `shapeLabels`, `whyRows`).

**The Audit's league figures (plans/xscore.md P9 X5d, `app.sorare.league_audit`).** `python -m app.jobs.audit_league --write` replays every week of the local games export from the weeks before it (`keeper.walk_forward`, `outfield.walk_forward`), reads the per-position tables `keeper_fit` and `outfield_fit` wrote (`data/audit/*_walk_forward.json`: the new number, today's and Sorare's with 95% intervals from resampling whole gameweeks) and writes `frontend/lib/data/audit_league.json`: per position the share of pairs picked right now and before, the same per gameweek (all positions, a week needs 100 pairs), the misses in 28 bars of 3.5 points, the goalkeepers' chance of a decisive action against what happened in groups, Sofix's start chance against who started, and the share within 7 points for the new number, the old one and Sorare's. The page (`components/audit/LeagueAudit.tsx`, `lib/leagueAudit.ts`) only draws it; the refresh does not touch it.

**The Missions page (roadmap 10.7; repair 9 Oct 2026).** Extension 0.3.9 asks `currentUser.taskGroup(slug: "play").myTasks` for each football rarity, validates completeness and sends one version-2 import to the token-protected missions route. Passive nonempty reads remain compatible; they cannot confirm an empty list. Owner identity, request age and ordering are checked. A bounded, allowlisted task/game read checks `pickableCards`; missing or paginated eligibility stays unknown. `mission_pool.build` publishes `missions_pool` from the existing card/history reads, adding the active GW to their aliases, preserving card/game IDs and actual playing sides. Rolling sheets use only scored starts before the observation cutoff. No separate paid feed or new per-player call is added. Decisive probabilities include start/sub availability; count targets use a labelled Poisson approximation. SCORE/custom rules without a supported model have no probability.

**The missions ledger.** Browser imports and the scheduled refresh write per-day/rarity records under `missions_day:YYYY-MM-DD:rarity`, using optimistic compare-and-swap updates. Legacy `missions_log:YYYY-MM` rows are copied idempotently and retained as rollback evidence; readers prefer the daily copy. Gaps are explicit assumed Decisive Picker entries. Pre-kickoff forecasts freeze; a first capture after kickoff has no retrospective probability. Settlement uses kept games without additional source calls and declines to overwrite a concurrent import. Source task IDs identify instances; aliases preserve corrections and frozen evidence when an assumed/legacy mission is reconciled. Archived imports are grouped by their source date, with four independent day writes at a time. Undated tasks are not attributed to the fetch day.

Kept-game settlement updates the daily ledger with the same revision guard and leaves copied monthly rows alone.
The rolling mission sheets accept detailed saved action counts as well as older count dictionaries; sheet context is not an action.
Shot-on-target (`ontarget_scoring_att`) and tackle (`won_tackle`) targets use the same count-tail estimate as goals, assists and interceptions. Explicit source thresholds take precedence; otherwise the imported stat's count is read from its description, rather than defaulting every target to one. Rolling mission tuples append shot and tackle counts; older tuples leave those target samples unknown. Both browser capture and scheduled capture parse these rules, and settlement checks the same threshold. Zero-rate candidates stay in the scouting evidence but do not enter the allocation queue, so a higher-priority zero-rate target cannot consume a card that another target can use.

**Historical corrections.** Same-origin `POST /api/missions/history` validates slot count, rarity and optimistic revision, strips client verdict/lock claims, and stores overrides under `missions_edit:day:rarity`. Explicit empty picks differ from no override. Restoration and source changes retain provenance. Readers apply edits after merging the ledger, so a refresh cannot erase them. Matching official Sorare verdicts take precedence; an unmatched reported player/game stays pending. The Audit excludes missing/late forecast evidence and updates its visible personal results after a correction without replacing lifetime totals with a truncated window. Import success is returned after history persistence, then relevant caches are invalidated.

**Sofix's plan and Sorare's plan (the Play deep fix, 6 Oct).** Every week is planned twice with the same start chances: once on Sofix's xScore (`sorare`) and once on Sorare's own per-game projection (`sync.game_projections`, written to `sorare_alt:<slug>`, read on demand). Lineups are filled in the owner's essence order first (`sorare_settings`, set from Play through `POST /api/settings`; default LaLiga › Champion › All Star; a lineup under 5% gets no priority); a Room is played only when its expected essence beats the fee; XP is its own tier and never counts as paid. Each lineup's dice are seeded (`planner._seed`) so it shows the same numbers every time, and a plan's chance of a reward comes from one joint simulation (`planner.plan_outcomes`), not from multiplying lineups. Before each lock both numbers are written down for every LaLiga player with a game (`score_record:<week>`); a day after the week ends `player_audit.read` joins the stored results, and `/audit/versus` compares them on starts (under 100 starts: too few to tell).

**Start chances for every player on Lineups.** `lib/lineupChances.ts` joins the owner's forecasts to each match first, then every other LaLiga player through his Futbol Fantasy link in `market`, so Sofix's and Sorare's start chance shows beside Futbol Fantasy's for players he does not own too.

The history query reads decisive levels and detailed stats on the concrete `PlayerGameScore` type. Sorare's federation
rejects repeated `anyGame` roots even with aliases, so per-game projection reads run sequentially through the paced client.

**Finished owner weeks (data-keeping step 6).** `POST /api/my-week` requires the same-origin refresh header, validates
the bounded Zod body against a published week and waits until end + 24 hours with every entered lineup ranked. It stores
lineups, exact card slugs, known player identities, captain, scores, ranks and rewards in `my_week:<slug>` with
`ON CONFLICT DO NOTHING`; drafts are excluded and missing player identity stays null. Explicit empty reads can save
zero entries; a null Sorare fixture/list cannot. GET lists kept and pending weeks. Home and Rewards share a once-daily,
sequential, coalesced extension read queue; Home and Play's selected-week reads also save final results. Storage failures
preserve existing weeks and are distinct from an empty season. No extension release or new table is needed.

Home, Play and Rewards read these server records first; Rewards retains the old browser cache as a fallback. Recap's
season totals keep cash and essence separate. Cards credit each participating card with its lineup's whole reward and
explicitly prohibit adding these amounts across cards. The season runs from 1 July UTC to the next 1 July.
`sorare/frozen_scores.py` scores every saved pre-lock plan from `player_games`, using the frozen multipliers and rules
with the existing planner's captain/substitution calculation. All scheduled games must have known final outcomes;
the best played score is used for a double week and missing rows never trigger a substitute. Audit publishes these as
`frozenPlans`, separate from its existing replay/reward aggregate; final frozen-plan rewards are unknown without actual cut-offs.

**The Players page (plans/data-keeping.md step 4).** `/players/<slug>` draws this week's game from the same `shape` as the
panel. `lib/playerGames.ts` reads parameterized `player_games` and `player_absences` queries, cached for one hour under
the `sorare` tag. The local FastAPI equivalents are `/api/players/{slug}/games` and `/api/player-sheets`.
`lib/playerHistory.ts` selects the July-to-June season, counts known appearances and starts, averages known appearance
scores, sums LaLiga yellows separately, and computes each source's mean absolute miss on final starts with both numbers.
Unknown cards make the yellow count a lower bound and suppress the one-away claim. Source outages leave stored evidence
intact; the page reports the newest game and last read and distinguishes missing data from zero.

The daily `league_history` job publishes `player_sheets` using `sheets.from_kept`, which adapts final starts to the original
`sheets_from_games` calculation. The history query saves actual position, playing team, venue and decisive level in a
`_context` entry alongside non-zero `detailedScore` actions in `player_games.stats`; missing context or points excludes a
start rather than making it a zero. The sheet holds action counts/points for all saved complete starts and the last ten,
their scores/opponents, mission actions, decisive rate, clean sheets and penalties saved. Player pages, `missionLog` and
`missionsToday` all read this daily model; the manual JSON export is no longer a runtime input. `lib/playerSheet.ts` draws
the sheet, comparisons and bars; `lib/playerPage.ts` supplies identity and next games. "Next game" moves the saved-start
mean by `gameFactors`: goals for/against from the existing price over 1.3, clamped to 60% either way.

`python -m app.jobs.seed_player_games` validates and counts the local `data/raw/sorare_games.jsonl` export without
opening a database. After the one production migration and explicit owner approval, `--write` imports missing actuals
and rebuilds `player_sheets`; `--games <path>` selects another local export. Existing rows with an actual `read_at`
always win, even if the import runs later. Statement-only rows receive actuals without changing frozen statements;
repeat imports do not duplicate or replace readings. The import timestamp is its `read_at`. Export projections are
not pre-lock evidence and are never imported as forecasts. Invalid/truncated lines fail before any database write.

`player_absences.observe` runs on freshly read FF matches before `ff_feed` commits. It extends a continuous spell, updates
its reported kind/reason and closes it only on explicit availability. Cached, failed and absent pages do not advance or
close spells. FF shirt ids identify players; an absence-only profile without a shirt id uses a stable profile hash until
the id is read, then retains the same spell. Kept FF links attach Sorare slugs, including previously unlinked spells. The
small `ff_absence_ids` read model remembers profile-to-shirt identities even for players not linked to Sorare, so losing
the chance row cannot create a second spell. Delayed readings cannot reopen a spell already closed by newer evidence. The
page translates known reasons with the existing `absenceText` helper and attributes unrecognized wording to FF. Dates
are observation dates; this history is not an input to start chances.

**Goalkeepers (plans/xscore.md P9 X3, `app.sorare.keeper`).** A keeper's score is a clean sheet or not: a decisive action worth at least 60 (75 on average over two
seasons) or about 40, falling with the goals his side lets in. So his score if he starts is built from the game, not from his last five games, whose luck is most of what
they say: the chance of a decisive action times his score with one, plus the rest times his score without. The chance of a clean sheet is the football model's
(the predictions the board is built from, with the board's own correction taken off again, `keeper.raw_clean_sheet`), moved by the bookmakers' over/under 2.5 price
(it sets how many goals the game holds, the model how they are split), then corrected on the keepers' own starts (the model ran about five points high for them);
the chance of a penalty save is added. His score without a decisive action is a line in the goals his side is expected to concede and in Sorare's projection when it
is out, his score with one a level and the projection. The leftovers of the fitted lines give the range (where he lands 8 times in 10). The constants are fitted on every
keeper start of the games export (`python -m app.jobs.keeper_fit --fixtures-from <history file> --through 2026-09-30 --write`, into `artifacts/keeper_score.json`, with the
walk-forward table and `backend/data/audit/keeper_walk_forward.json`), and the same command tests them: each week of starts is predicted from the weeks before it only.
In the refresh, `keeper.numbers_for` reads the predictions and the goals line of the games to come from the database, `keeper.outcomes_for` works out each keeper's games, and
`publish.player_weeks` hands them to `forecast.forecast` (`PlayerWeek.keeper`), which makes the average of his games both his score if he plays and if he starts; a
second game in the gameweek keeps the best-of-two rule. A game the numbers cannot be found for (outside LaLiga, no prediction, a club the registry does not know), a missing
artifact or a failing step leaves that keeper's number as it was, and the step's failure is listed under `failed` as "keeper numbers". The record the Audit counts
(`sorare_record.rows`) uses the same numbers for the week being planned; a played gameweek's replay does not, since the football model's numbers for a played game are not kept.

**Outfield players (plans/xscore.md P9 X4, `app.sorare.outfield`).** The same idea for defenders, midfielders and forwards, as a line per position: his score if he
starts is fitted on his side's chance of a clean sheet and expected goals for and against (the football model with the bookmakers' goals line, `keeper.adjusted_goals`),
home or away, Sorare's projection when it is out, and his own record (how often his starts reached 60, and his mean score, pulled to the norm while he has few). A
past game's own record uses only the starts before it, so a test never sees the future. `scores.scores_for` is the one callback the refresh gives `publish.player_weeks`:
it sends a goalkeeper to `keeper.py` and the rest to their position's line (`artifacts/outfield_score.json`, from `python -m app.jobs.outfield_fit`), and answers one score
per game, which `forecast.forecast` makes his score if he starts (and his score if he plays, for a regular starter; for a player who often comes on it moves by his share of
starts). Anything it cannot tell leaves the number as it was.

**Linked scores and the captain (plans/xscore.md P9 X6, `app.sorare.links`, `planner.simulate`, `planner._captain`).** Players of one game score together, so the planner
no longer simulates a lineup's players independently: `publish.gameweek_payload` gives each forecast its games as (game id, home or away), `links.matrix` turns them into a correlation matrix by pair of
positions and side (a keeper and his defenders +0.29, a keeper against the other side's forwards −0.26, ...), and the simulation draws correlated scores. Reward chances, ranges and the plans ranked by them
follow. The captain is chosen among the three starters with the best expected points by the chance of a reward his captaincy gives, then by the expected score.

Common SD is 17.6. Source is published (“sorare”, “form”, “no game”). This is a transparent heuristic awaiting an S4
fitted/blind-tested replacement.

How it is checked (roadmap 3.1, `app.sorare.backtest`): for every game in the owner's players' exported history
(`app.jobs.export_history`, a git-ignored file, read only from Sorare's public API), what would the form formula have said
knowing only the games before the gameweek it was in? Four models are scored on what he actually scored, a game he did not play
counting as zero: always 45, his last five, his last five of the same kind (club or national team), and today's form formula
without Sorare's projection (Sorare's own number is not in the history; that comparison waits for `sorare_forecasts`). Error is
reported by slice (club or national, what he did, how much history, position, how often he had started, one game or two in the
week), with the order within a position and week, and "is today's model closer" is a bootstrap over whole weeks, by absolute
and by squared error (the score is zero or about sixty, so absolute error rewards the median and squared error the average
that an expected score is). A week is Sorare's own gameweek (the export keeps their windows in the file); a gameweek is also
scored as a whole, its expected score against the best of his games in it (Sorare's rule, `multiGameScoreAggregator` is
`max`), which is where the best-of-two logic is tested. Games from 1 Oct 2026 on are held out and reported apart. `python -m app.jobs.xscore_backtest`
prints it; nothing in it reaches the database or a page, except through `--summary` (below).

The one figure the xScore is judged by (`backtest.pair_accuracy`, [xscore_success_rate.md](xscore_success_rate.md)): over every pair of
the owner's players in one position and gameweek who scored differently, the share where the higher expected score scored more. A tie in
the expected score counts half, so saying the same for everyone is exactly 50%, and the interval is 95% from resampling whole
gameweeks. On the 84 players' games from August 2025 it is 66.0% (64.6% to 67.2%, 39,961 pairs, 99 gameweeks); his last five games'
average scores 66.1%, so the formula adds nothing to the order yet. `--summary` writes the numbers the Audit page shows to
`backend/data/audit/replay.json` (numbers only, committed, since the history it is made from is the owner's and is not).

**The Audit page** (`/audit`, `app.sorare.audit`, read model `audit`). `player_audit.read` joins frozen week metadata to
`player_games` for every indexed and owner player, with legacy settled records as a fallback and no duplicate cases.
New weeks wait until their end plus 24 hours; older records retain their day-after-last-game boundary. Unknown starts,
scores or mission stats remain pending. The replay file's numbers (the xScore success rate, and Sofix's chance of starting replayed on the past
in bands) beside the live record, which begins empty. `starts_record` scores each source (Sorare, Futbol Fantasy, Sofix) on the games
it had a number for once they are settled; `xscore_record` counts the same pairs on what the model noted before each lock (the
chance he plays times his score if he plays) against his best game once the gameweek is settled. A figure under `FLOOR` (100 cases)
is withheld by the job, which sends the counts and no rate, and the page says "too few to tell". The step is optional: if it
fails the Play page is still published and the run's summary names `audit` under `failed`.

`/audit/versus` compares the two saved conditional scores against the real score on starts (mean miss and how often each
was closer). `/audit/starts` also counts Futbol Fantasy's predicted eleven and the Sorare/Sofix elevens implied by the same
position-preserving swaps as `lib/lineups.ts::byChance`: ties keep FF's starter, out/suspended alternatives cannot come in,
and a historical reading without position data cannot invent an implied eleven. Counts are grouped by week and club;
rates need 100 checked starters in each group. `ff_chances` retains positions, absence kinds and crests at lock.
The refresh no longer calls `versus.settle`, `starts.settle`, `record.rows` or `missions.settle`: missions use the stored
non-zero stats (`missions.settle_kept`). Old records and functions remain for historical compatibility, without new source calls.

## 9. Optimizer/rewards

Seeded beam search (width 120), 3,000 score draws and repeated temperature-weighted whole-week searches enforce slots,
position/card/player uniqueness, rarity/in-season/club/cap rules, bonuses, captain and substitutes. A substitute is
used only when protection exceeds sacrificed value. Rewards are all or nothing (a lineup reaching a tier's score gets that
tier whole), so each step adds the lineup most likely to be paid and candidates are ranked by the chance of any reward;
normalized cash + normalized essence only breaks ties. They are filtered until card-set signatures differ by at least 20%;
at most five are published. Each published tier carries the score that reached it in the reference week (`need`). The two
reward units remain separate and are never converted by an exchange rate. The page shows no chance-weighted average: a
lineup shows its first tier's reward and score, a plan its most likely result (`likelyResult` in `frontend/lib/play.ts`,
lineups independent, a Room's fee always paid).

Cutoffs use current tables or comparable past gameweek/room samples. Probabilities use common spread and simplify
teammate/opponent/shared-lineup correlation; combined “any reward” treats plan misses as independent. They are aids,
not guarantees. `runs` controls repeated randomized searches; the fixed seed keeps identical input reproducible.

## 10. Replay

Pre-lock per-game forecasts are retained in `player_games`; the old `sorare_forecasts` rows remain historical. Actuals join without overwriting statements. Home/Play
compare submitted-lineup actual to original centre/range/reward threshold. Only rows captured before lock qualify for
fitting; one gameweek is not sufficient evidence.

Two read models keep plan and whole-week metadata alongside those per-game rows (roadmap 1.2 and 1.3):

- **The plan as it stood at the lock** (`sorare_plan:<gameweek slug>`, `app.sorare.frozen`). Every run replaces the page,
  so the first run after a lock writes the plan the page held, built by the last run before the lock: the week's lineups
  with their cards, captains, expected totals and reward chances, and each of the owner's players with the chance and
  expected score he had, game by game and from which source. It is written once and never touched again. A page built
  after the lock is not what was said before the team news and is not kept; pictures, and what could not be entered, are
  left out (`PICTURES`, `LEFT_OUT`) so a week is a fraction of the page. The run's summary names the weeks it kept under
  `frozenPlans`; a dry run says what it would keep.
- **What the model made of each player** (`score_record:<slug>`, `publish.score_record`): position, whole-week `mu` and
  `pPlay`, chosen start source, game ids, sides, kickoff and FF links. `player_games.save_record` freezes this at the same
  lock as the source columns. The Audit reconstructs its existing calculation inputs from these and the stored actuals.
  Old `start_chances` notes and settled cases remain readable. Run summaries count planned players under `recorded` and
  per-game source rows under `gameStatements`; Control's projection counts now come from the shared game store.

**Permanent match history (data-keeping step 7).** `predict_upcoming` first saves every available cached LaLiga CSV season
and its newly loaded matches into `match_odds`, including closing/pre-match prices, results and the selected price column.
Registry codes link clubs; historical clubs without a registry entry retain their source name. The
missing older seasons back to 2016/17 are fetched once with ordinary CSV caching, independently of the model's five-season
input. A failed archive read leaves normal predictions and already saved prices available. CSVs take priority and
saved rows fill gaps without counting a match twice (UTC/local dates may differ by one day). With no CSV source/cache,
the job fits from saved results; shots are unavailable in that fallback, so it uses goals. The normal model and five-season
odds record are unchanged. The run reports its history source and newest priced match; cached network failures retain an
outage signal. The Audit dates the saved odds.

Before live odds disappear, `sync_odds` and the prediction job copy only readings fetched before kick-off to `match_odds`
as margin-free fair decimal prices, including a pulled future market's last reading. Later fixture results supply their
score without changing the price. Each prediction
writes `match_forecasts` until kick-off, rejecting delayed older writes and all after-kick-off writes. The Audit joins
finished results to these frozen forecasts and one price per fixture (CSV first), using the canonical H/D/A RPS on identical
paired cases. Under 100 matches both scores stay null. Football publishing updates this section even if Sorare fails.

## 11. Apply and extension

Public key cannot read private future lineups or mutate them. The extension bridges the existing signed-in tab with
two independent allowlists for identity, gameweek lineups, competition entries/capacity, preview/check, draft and enter.
The home Sorare section and Play ask for `so5Fixture(slug)` and its `mySo5Lineups`, so the selected timeline GW owns
the result even when no optimized `GameweekPlan` is retained. Card art/names and leaderboard names come from that
private response; they are not reconstructed from the current collection snapshot. The same response carries what
each lineup scored (`so5Rankings`: its score, its rank and the rewards Sorare paid) and each card's score and captain
mark, so a week played long ago still shows what you entered and won. Applying always runs in this order:

```text
Check (read-only Sorare verdict) → Draft (saved, not entered) → Enter (separate confirmation)
```

The published `timeline` lists every gameweek of the season so far, not only the ones with a plan: the sync pages
Sorare's list back to this season's Game Week 1 (Sorare numbers its gameweeks all year, so last season's tail is left
out), and only the far future is held back until Sorare opens it. When a new season starts numbering from Game Week 1,
last season's weeks that are still to play, or were played in the last four days, stay in the list (`sync.this_season`),
so the last week of a season is still planned, replayed and kept.

A finished gameweek's replay never changes once its scores are final, so a run keeps it: the week just played is
replayed and planned once, at least 24 hours after it ended (`settled_replay`), together with its best lineups in
hindsight (the planner on `hindsight_forecasts`: who played, what each scored, no spread left, priced by that week's real
cut scores). The same run writes it whole to `read_models` under `sorare_week:<slug>`, once, and marks it `kept` in the
timeline, which later runs carry forward. Play reads such a week from there when it is opened.

Final also means complete. When a question to Sorare about that week got no answer (a competition that could not be read,
what a competition paid, a player whose scores could not be read), the snapshot lists it in `pastGaps`, the replay is marked
`complete: false`, and every run rebuilds it until nothing is missing; one still missing something seven days after the week
ended is kept as it is (`publish.is_final`, `GIVE_UP`). The run's summary names what was missing under `pastGaps`.

A run writes what the page points at (each early plan, the week just played) before the page, so a week it lists can
always be opened, and the optional steps after or around it (early plans, Futbol Fantasy, the start-chance record) are tried
so that a failure is logged and listed under `failed` in the summary instead of stopping the page from publishing. The
database connection is let go before each long step, since Neon closes one left inside a transaction.

**Who starts.** His chance of starting each game of the gameweek being planned is, in this order, Futbol Fantasy's for
that game, Sorare's own starter odds, and Sofix's from his last five games (`sorare.forecast`; plans/futbolfantasy.md). It
sets the chance he plays, so the expected score, the plans and the captain follow it; his score if he plays and if he
starts do not change. The chance of coming on from the bench is what Sorare's substitute odds say of the benched share,
else his form's, and nothing when Futbol Fantasy has him injured or suspended. Two games in a gameweek each take their own
source and combine as one minus the misses. A player Futbol Fantasy says nothing about is answered exactly as before it
existed, and each game of one it does carries its own `pStart`, `pOn` and `startSource` in the page.

**The two scores (plans/xscore.md, P7).** A player has a score if he starts (`start`) and a score if he comes on from the bench (`on`).
Sorare's rule is that a substitute who comes on starts at the same 35 points as a starter, so `on` is a score of about 40: his
substitute appearances pulled towards 42, each worth two (`forecast._split`, `score_on`). It is not multiplied by the chance of coming
on any more; that chance (`pOn` of the games he does not start, `benchedOn`) is shown beside it. `bench`, which is that chance times
the score, is still published for the pages and extensions that predate `on`, and means what it always did. The backtest
(`python -m app.jobs.xscore_backtest --conditional`) scores each number on the games of its own role: on 712 appearances off the bench no
candidate (the position's norm, his own appearances shrunk to it, the norm by minutes played) was clearly closer than today's, so `on` is
today's substitute score unchanged. On 2,589 games he started, his own starts shrunk towards the position's norm were closer than today's
`start` (squared error -25 points [-34, -16] over 107 weeks), a candidate that waits for the held-out weeks.

Futbol Fantasy is read before the page is planned (`app.sources.futbolfantasy_matches`, `app.sorare.ff_feed`): the round page
of LaLiga, Champions League, Europa League and Copa del Rey, then the match pages of every LaLiga match and of the others
that have a Spanish club or a club one of the owner's players is at, two seconds apart, inside a 240-second budget, giving up
after three unreadable pages in a row; a match read in the last 25 minutes is not asked for again. A page that cannot be read
(a 403, a 429, a server error, a time-out, a page that is not a lineup page, a round or squad page that is missing) is listed
under `failed`, which is what makes the Lineups header say the site could not be read, and the match keeps its last reading. A
match page the site answers 404 for is different: the site answered, and that match is no longer on it. It is dropped from the
stored feed (`Reading.gone`, `ff_feed.refresh`), is not a failure, and does not count towards giving up; if the round page
still links to it, the next run asks once more and gets the same answer. A round page's matches are read from the page's own
area only (`parse_round`, its `<main>`): the sidebar carries a "next round" widget with other competitions' matches in it
(summer friendlies and internationals, dated with no year), and a competition with no round yet, the Copa del Rey before its
draw, has nothing else on the page. Until 2 Oct 2026 those were read as its matches: about fifty dead pages on every run, each
a "failed read", which was about 100 seconds of the 240 and kept the Lineups header's "could not be read" one run away. Each match is kept with
the time it was read and used for a day at most, never after, and never once it has kicked off. The site gives no time for
its lineups, so each club's "changed at" is found by comparing one reading with the last. Its players are matched to the
owner's Sorare players inside one club's side of one match (`app.sorare.ff_link`: same name, one name inside the other's
words, a short form of the first name, or a surname alone only with both ages to check), never across the league; a player
that cannot be told is reported in the summary (`futbolfantasy.unlinked`) and keeps Sorare's number, and a game with no
match found is named under `noMatch`. The links found are kept in the `ff_links` read model.

Each LaLiga club's squad page (`/laliga/equipos/<club>/plantilla`) is read once a week (`ff_lineups.read_squads`, a 90-second
budget, the same politeness) for where each player plays, which the match pages do not say for anyone outside the eleven. The
memory of it, and of the line each player was last drawn in, is the `ff_positions` read model. The Lineups page's data is
written as soon as the site has been read (`ff_lineups.payload` into the `lineups` read model): the eleven drawn in rows from
the pitch coordinates (rows at fixed heights, read from the goal up), each alternative under the starter whose slot he could fill, the injury
lists, and which of the people are the owner's. The match page marks a starter's wrapper with the alternates of his slot (`a.juggador.pos-N`,
N >= 1, in the order FF gives them), so one player can be second in line for several slots; the parser keeps them as `Player.next`, the
payload as `next` on each starter (a payload from before 2 Oct has none, and the page then places the alternatives under each line, as it did).
The card of a player who is not the owner's is a real Sorare Limited card of the current season, found by the job through Sorare's public,
read-only `football.allCards(playerSlugs, rarities: [limited], seasonStartYears: [2026], first: 1)`, a few players to a query (aliases) so
the unkeyed complexity limit is never reached (`app.sorare.card_art`; the LaLiga roster is `club.activePlayers`). The result is kept in the
`sorare_card_art` read model and linked to the people of the page by the same name matching (`ff_link`), inside one club's side; the
payload carries it as the top-level `art` (player id to picture) and the page falls back to FF's photo, then a silhouette, for a player Sorare
has no card for. The country of a call-up (`nat`, two letters) travels in the player's status (`ff_use`). The Home's team news (`ff_news.team_news`, into the planned week as `teamNews`)
is built from the finished page: the owner's players split at 70% and 40%, the first plan's starters under 70%, and what moved by
10 points or more since a reading at least 16 hours old (`ff_chances` keeps one every six hours for two days). When the job has
nothing to put in `teamNews`, the tile says why (`teamNews.idleNote`): a week with no LaLiga game is not the site's to cover (national-team
games the bulk of it is a "break"; a few games of other leagues that play on, Segunda or Argentina, do not make it a club week), and the
note points to the LaLiga round the Lineups page holds (`lineups.lineupsGlance`, the owner's distinct players in
it); in a week of club games the site has simply not reached it yet.

The extension does the same arithmetic for a chance it reads live: his chance of coming on is what is left, at the rate he comes
on in the games he does not start (`benchedOn`, published with the player): `pOn = (1 - pStart) x benchedOn`, and nothing when he
is out. `forecast._per_game` and `extension/core.js` (`liveSplit`) both read `backend/tests/fixtures/live_start_cases.json`.

The injury lines on Lineups are translated in `frontend/lib/absence.ts`: a diagnosis is a kind (rotura, lesión, molestias, sobrecarga,
esguince, fractura, ...) plus a body part, so a new combination of known words needs no change; the notes are "Duda / Disponible / Baja
confirmada para la jornada N" and "Baja hasta ...". A "hasta" date without a year is the first such date on or after the day he
began missing games (April after a September injury is next April); one that is earlier than today is written "Was due back ...".
What it cannot translate is shown as written, flagged `causeFf` / `noteFf`.

A week is named in one place (`weekName` and `sorareName` in `frontend/lib/weeks.ts`): "LaLiga round 8 · Sorare GW21", "LaLiga round 9 · Sorare
not open", or for a week with no LaLiga round "Sorare GW19 · national teams" (`Week.national`: no LaLiga game in it and national teams' games the
bulk, `teamNews.nationalWeek`). The picker, the Play title, the Home head, the no-plan pages and the notes all read it.

Freshness is written in one place (`freshLabel` in `frontend/lib/fresh.ts`, and `core.freshLabel` in `extension/core.js` for the overlay, which
both tests pin to the same form): "9 h ago (03:33)", with the day added once the reading is over a day old.

A workflow (`near-lock.yml`) asks Sorare every 30 minutes when the next gameweek locks and, in the last three hours, starts the
refresh when none started in the last 25 minutes, so the team news is read often when it counts.

Every run also writes down who says each of the owner's players will start each game of the gameweek being planned
(`app.sorare.starts`): Sorare's own odds (against his first game), Sofix's model from form alone, and Futbol Fantasy's number
with the time it was read. The numbers are frozen at the lock and settled game by game by what happened a day after the
gameweek ends, so `python -m app.jobs.starts` can say which source to trust.

Sorare opens a gameweek only a few days ahead, but LaLiga's calendar is known for the whole season, so every round that
has not started and sits in no gameweek Sorare has opened is planned early (`projected_weeks`). Its window is the one
Sorare will most likely draw (weekend Friday 14:00 UTC to Tuesday 14:00, midweek Tuesday to Friday; `projection.window`),
which of your cards play comes from the calendar (`projection.games_for`, clubs matched through the team registry), the
competitions are the LaLiga ones Sorare is going to open (below), and the forecasts stand on form, since Sorare projects only a
player's next game. The one exception is Futbol Fantasy, which has each club's next game: for the round it holds (match
by the two clubs and the kickoff, `ff_use.Lineups.covers`) the early plan takes its chance to start, with its mark and read
time, and a player it has out or suspended is in no lineup. That round is planned again every run, because its lineups
move (`early.choose`, `live`); every later round has no Futbol Fantasy and stands on form. The same holds for a gameweek Sorare has opened but is not planning yet
(`build_payload` passes the reader to it): when the round the site holds sits in it, as the weekend round does during a break, those games
take its chance and the rest of the week stands on form. One plan per round; each is kept as its own
row (`sorare_ahead:<round>`).

**The competitions Sorare is going to open** (`app.sorare.expected`). Sorare opens a gameweek's competitions only a few days ahead, so
a round weeks away is planned for the ones it opened for the rounds before. Measured on gameweeks 1 to 21 of 2026/27 (Sorare's API,
22 read-only calls): LaLiga's own competitions (LALIGA EA SPORTS, Under 23, All Star with LaLiga in it) were opened in all 11 gameweeks
that held a LaLiga game, even one, and in none of the 10 that held none; the Champion league (the top five leagues together) in all 8
with five or more LaLiga games and in none of the 3 with fewer. So a round with a LaLiga game is a "thin" week (1 to 4 games) or a
"full" one (5 or more), and takes the competitions, rewards and reward cut-offs of the latest finished gameweek of its kind
(`sync.expected_templates`, kept in the `sorare_templates` row: a finished week never changes, so each is read once). Each such
competition is marked `expected` with the week it was copied from, is planned for like any other (one card is never in two
lineups of a plan, official or not) and cannot be entered: Apply only works for competitions Sorare lists. The same is added to a
gameweek Sorare has opened that holds a LaLiga game but lists no LaLiga competition for it yet; once it lists them the next run
shows only Sorare's own, never both (`publish.with_expected`). A gameweek opened ahead is judged by the cut-offs of the finished week of
its kind for its LaLiga competitions (`publish.reference_of_week`): the week being planned can be a break, and the finished week it
is judged by then has no LaLiga cut-off at all, which would leave the weekend round after it with no LaLiga lineup to plan. A round with no game, or no finished week of its kind yet, gets
none; a national-team week keeps its own competitions. Planning one takes a few
seconds with a real collection, so a run plans only the rounds with no plan yet, then the stalest (`app.sorare.early`): the
next four rounds by date (a postponed game keeps its old round number but is played later, so it does not take a near slot) are
kept current to six hours and the far ones to a day, at most eight a run, and the others keep showing the plan they have. A stored plan is reused only when it was made for the round's dates as the calendar holds them now
(`early.planned_for`), so a new season that reuses the round numbers is planned again rather than shown with last season's
opponents. Sorare's own numbers replace an early plan the moment it opens the week. It cannot be applied: nothing exists to
enter yet.

What Sorare's public API allows, read without a key on 2026-09-29. Its schema downloads from
`https://api.sorare.com/graphql/schema` (introspection itself is off), which is how a new operation is checked offline
before it runs against the real thing. Without a key a query may be 7 levels deep and cost 500 (13 and 30,000 with one),
so the sync's queries stay inside that. `so5Fixtures` lists newest first and pages with `after`/`endCursor`. Its default
list leaves out the gameweeks still `preparing` and the cancelled ones; `aasmStates: ["preparing"]` lists the coming ones
with their real windows (GW21 to GW24, 9 to 23 October, that day). The sync does not read them yet: an early plan's window is
the rhythm above, and the real gameweek replaces it once it opens.

The page bridge keeps captured request headers in its closure; credentials/cookies do not go to Sofix. Overlay numbers
are gated by the extension token, cached 15 minutes in session, and anchored by card-picture addresses and Sorare slugs
rather than generated CSS.
Check-in sends public account/version/build/revision on change or every six hours.

## 12. Published/API contract

Local FastAPI and production `grid` model share `ApiResponse<FixtureGrid>` (`success`, `data`, `error`, `meta`). Consumers:

- validate generated/Zod types;
- use bucket/scales unchanged;
- distinguish missing from zero and model from market-derived;
- handle every blank/double/finished cell;
- keep UTC input/Madrid display;
- never expose server/DB/GitHub/extension secrets.

Schema change: Pydantic → OpenAPI export → generated TS → Zod → typecheck. Never hand-edit generated artifacts.

## 13. Evidence/change gates

Football: tune 2019/20–2022/23, test 2023/24–2025/26 once; ship only with significant RPS improvement or calibration
gain without loss. The accepted baseline is RPS 0.1947, reproduced by a canonical rerun on 2026-09-28; 0.1953 is the
same model without the shipped rating spread.

Sorare: use pre-lock records, declared split, compare with Sorare baseline and report uncertainty. Never call replay
blind if it used post-lock data.

Schema/runtime: migrations owner-only, dev branch first; unattended schema check only; keep caches to protect Neon.

The data-keeping migration `3ce433a96bed` adds `player_games` (actuals and pre-lock statements), `match_odds`
(prices per match and source, with optional fixture links), `match_forecasts` (one forecast per fixture), and
`player_absences` (FF injury/ban spells, optionally linked to a Sorare player). Player-game actuals and statements
can remain null until read. Game and statement writers are built locally; page readers follow in
[the data-keeping plan](../plans/data-keeping.md). Production is migrated once before the table-dependent code deploys.
Nothing is seeded by the migration.

## 14. Code map

| Concern | Primary code |
|---|---|
| Football fit/matrix | `backend/app/modeling/dixon_coles.py` |
| Predict/blend/calibration | `backend/app/jobs/predict.py`, `services/rating_predictions.py` |
| Grid/labels/scales | `backend/app/services/fixture_grid.py` |
| Sorare forecast/planner | `backend/app/sorare/forecast.py`, `planner.py` |
| xScore backtest | `backend/app/sorare/backtest.py`, `app/jobs/export_history.py`, `app/jobs/xscore_backtest.py` |
| Audit page | `backend/app/sorare/audit.py`, `backend/data/audit/replay.json`, `frontend/app/audit`, `frontend/components/audit`, read model `audit` |
| Sorare sync/publish | `backend/app/sorare/sync.py`, `publish.py` |
| Web cache/load | `frontend/lib/api.ts`, `playData.ts`, `db.ts` |
| Football UI | `frontend/components/Overview.tsx`, `DifficultyGrid.tsx`, `FixtureBoard.tsx` |
| Sorare UI/Apply | `frontend/components/play/`, `components/cards/`, `lib/apply.ts` |
| Extension | `extension/background.js`, `core.js`, `bridge.js`, `content.js`, `overlay.js/css`, `drawer.js` |
| Operations | `.github/workflows/refresh.yml`, `league-history.yml`, `frontend/app/control/`, `frontend/lib/github.ts` |
