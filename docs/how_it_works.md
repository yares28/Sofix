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

## 8. xScore

1. Last five with priors estimates P(play) and conditional score (priors 0.60 and 45).
2. Sorare conditional projection replaces score when present.
3. Sorare starter+sub odds replace P(play) when present.
4. For `g>1`, `P(any)=1-(1-p)^g` and conditional mean receives a best-of-two uplift.
5. `xScore=P(any)×conditional_mean`.

Common SD is 17.6. Source is published (“sorare”, “form”, “no game”). This is a transparent heuristic awaiting an S4
fitted/blind-tested replacement.

## 9. Optimizer/rewards

Seeded beam search (width 120), 3,000 score draws and repeated temperature-weighted whole-week searches enforce slots,
position/card/player uniqueness, rarity/in-season/club/cap rules, bonuses, captain and substitutes. A substitute is
used only when protection exceeds sacrificed value. Candidates are ranked by normalized cash + normalized essence and
filtered until card-set signatures differ by at least 20%; at most five are published. The two reward units remain
separate and are never converted by an exchange rate.

Cutoffs use current tables or comparable past gameweek/room samples. Probabilities use common spread and simplify
teammate/opponent/shared-lineup correlation; combined “any reward” treats plan misses as independent. They are aids,
not guarantees. `runs` controls repeated randomized searches; the fixed seed keeps identical input reproducible.

## 10. Replay

Pre-lock player forecasts are retained in `sorare_forecasts`; post-game actuals join without overwriting. Home/Play
compare submitted-lineup actual to original centre/range/reward threshold. Only rows captured before lock qualify for
fitting; one gameweek is not sufficient evidence.

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

Futbol Fantasy is read before the page is planned (`app.sources.futbolfantasy_matches`, `app.sorare.ff_feed`): the round page
of LaLiga, Champions League, Europa League and Copa del Rey, then the match pages of every LaLiga match and of the others
that have a Spanish club or a club one of the owner's players is at, two seconds apart, inside a 240-second budget, giving up
after three unreadable pages in a row; a match read in the last 25 minutes is not asked for again. Each match is kept with
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
the pitch coordinates (rows at fixed heights, read from the goal up), each alternative under the line he covers, the injury
lists, and which of the people are the owner's. The Home's team news (`ff_news.team_news`, into the planned week as `teamNews`)
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
next four rounds are kept current to six hours and the far ones to a day, at most eight a run, and the others keep showing
the plan they have. A stored plan is reused only when it was made for the round's dates as the calendar holds them now
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

## 14. Code map

| Concern | Primary code |
|---|---|
| Football fit/matrix | `backend/app/modeling/dixon_coles.py` |
| Predict/blend/calibration | `backend/app/jobs/predict.py`, `services/rating_predictions.py` |
| Grid/labels/scales | `backend/app/services/fixture_grid.py` |
| Sorare forecast/planner | `backend/app/sorare/forecast.py`, `planner.py` |
| Sorare sync/publish | `backend/app/sorare/sync.py`, `publish.py` |
| Web cache/load | `frontend/lib/api.ts`, `playData.ts`, `db.ts` |
| Football UI | `frontend/components/Overview.tsx`, `DifficultyGrid.tsx`, `FixtureBoard.tsx` |
| Sorare UI/Apply | `frontend/components/play/`, `components/cards/`, `lib/apply.ts` |
| Extension | `extension/background.js`, `core.js`, `bridge.js`, `content.js`, `overlay.js/css`, `drawer.js` |
| Operations | `.github/workflows/refresh.yml`, `frontend/app/control/`, `frontend/lib/github.ts` |
