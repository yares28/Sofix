# Data dictionary

**Verified 2026-09-27.** This separates sources, database state, published page models and browser-derived values.

## External sources

| Source | Used for | Refresh/limit |
|---|---|---|
| football-data.org | LaLiga fixtures/results/teams/kickoffs/crests; Champions League where needed | One matches call; 10 requests/min |
| football-data.co.uk | Five-season goals, shots/on-target, closing 1X2 | Historic cache; current season conditional download |
| The Odds API | Current EU h2h + totals | One batch, skipped <6 h; 2 credits/call, 500/month |
| Sorare public GraphQL | GW/games/rules/rewards/cards/scores/projections/squads/values | Batched read-only sync; rate/complexity/depth limits |
| Futbol Fantasy | Each LaLiga player's expected chance of starting the next round, per team page (`data-probabilidad`), plus the round it is about; stored and compared with Sorare's and Sofix's own, not shown | Twenty team pages at most every six hours, more often just before a lock; unofficial, so a failure leaves its column empty |
| Understat | Players' season xG, non-penalty xG and minutes, teams' xG per game (LaLiga, Premier League, Bundesliga, Serie A, Ligue 1, Russia); the overlay's xG | One request per league per refresh; unofficial, so a failure drops xG ("xG —") |
| GitHub Actions API | Dispatch/latest workflow status | Control/Refresh only; fine-grained repo Actions token |

Not used: Open-Meteo/weather (removed), Transfermarkt (scraping prohibited), live events, and StatsBomb production.

## Database tables

| Table | Purpose | Retention |
|---|---|---|
| `competitions` | Canonical competition identity | Upsert |
| `stadiums` | Venue reference | Maintained |
| `teams` | Canonical clubs/codes/metadata | Upsert |
| `source_entity_map` | Source identity/name mapping | Upsert |
| `fixtures` | Match/status/UTC kickoff/result | Upsert |
| `predictions` | Fixture + model-version pre-match forecast | Replace per version |
| `market_odds` | Fair outcome/totals fit and source age/count | Replace current |
| `read_models` | JSON `grid`, `system`, `sorare`, `sorare_references`, `extension`, one `sorare_week:<slug>` per finished gameweek, one `sorare_ahead:<round>` per LaLiga round Sorare has not opened, `start_chances` (who said he would start) and `futbolfantasy` (its last page, kept between reads) | Atomic key replace; a `sorare_week:` row is written once and never replaced, a `sorare_ahead:` row is rewritten when it has gone stale (six hours for the next four rounds, a day for the rest) |
| `refresh_runs` | Operational run/step audit | Append; one running |
| `sorare_forecasts` | Pre-lock forecast plus later actual | Retain for replay/fitting |

Migrations are authoritative for exact columns/indexes.

## Published football model

`grid` uses the same `ApiResponse<FixtureGrid>` envelope as local `/api/fixture-grid`: season/week/team/cells,
model/market probabilities, xG/CS/concede/BTS fields, backend-chosen bucket/label, six lens scales, standings/opening
projection and timestamps. Consumers must use `prediction.bucket` and `lens_scales` unchanged.

## Published Sorare model

Payload version 7 contains account/freshness, gameweek mapping, card collection/exclusions, forecasts
(`pPlay`, conditional `mu`, xScore/range/source/history), competition rules/rewards, diverse optimized plans, submitted replay
with the best lineups in hindsight (`hindsight`: one plan built knowing every score, priced by what really paid, no Rooms)
and cached LaLiga player/market index. `timeline` lists every gameweek of the season so far; an item carries `kept`
(with `playing` and `won`, its headline) once the job wrote that week whole to its `sorare_week:<slug>` row, which
happens once its scores are final (24 hours after it ends) and nothing it was built from was missing: a replay carries
`complete: false` while Sorare left a question about that week unanswered, and is rebuilt until it does not (or seven
days have passed). `projected` lists a headline (`round`, `from`, `to`, `cards`,
`plans`) for each LaLiga round Sorare has not opened a gameweek for; the early plan itself (`sorare_ahead:<round>`, a
gameweek payload with `projected: {round, basedOn}`) is read only when that week is opened. Each player game names both the actual participating side and opponent, so a
national-team fixture is never labelled with the player's club. `sorare_references` preserves reusable rule/calendar structures. `extension`
stores only version, public account and last-seen time.

## Who said he would start

`read_models` key `start_chances`: `{"weeks": {<gameweek slug>: {"lock": <iso>, "players": {<Sorare player slug>: {"sorare":
{"chance", "at"}, "sofix": {...}, "futbolfantasy": {...}, "started": true|false}}}}}`. For each of the owner's players with a
game in the gameweek being planned, each source that has a number writes its chance of starting (0 to 1): **sorare** its
own starter odds, **sofix** the model's chance from form alone (Sorare's numbers taken away, so it is a second opinion, not a
copy), **futbolfantasy** the site's chance, only when the player can be named with confidence and the round the site
means is the round he plays in. While the gameweek is open a later run replaces the number; at the lock it is frozen, and
one first seen after the lock is not made up. A day after the gameweek ends `started` is filled in from his scored games
(`python -m app.jobs.starts` compares the sources).

## Derived values

| Value | Meaning |
|---|---|
| Expected points | `3×P(win)+P(draw)` |
| Difficulty | `100×(1−expected_points/3)`; lower is kinder |
| Attack/Defence | Expected goals / calibrated clean-sheet chance |
| Record/Vs odds | Five-season club result in model/market price band; min 5, shrunk with 8-game prior |
| Market secondary fields | Implied by fitted fair 1X2+totals rates, not direct quoted bets |
| Run totals | Model values sum; record/odds comparisons average eligible future games |
| Current table | Results through selected GW, LaLiga tie-break logic |
| Predicted table | Expected remaining points plus seeded simulations |
| Sorare xScore | `P(play)×conditional score`, with double-GW adjustment |
| Reward chance | Seeded simulated score versus sampled/historical cutoff |
| Market value | Last-sync Sorare valuation, not live listing/executable price |

## Time/freshness

UTC is stored; Madrid time displayed; unknown kickoff is “Date TBC”. Finished fixtures keep pre-match forecast. Cards
and player values are latest synced snapshots, not reconstructed for every selected week. Replay is honest only when
the forecast was captured before lock.

## Environment names

| Location | Names |
|---|---|
| Root/Python | `POSTGRES_URL`, owner-only `POSTGRES_MIGRATION_URL`, `FOOTBALL_DATA_ORG_TOKEN`, optional `ODDS_API_KEY`, `SORARE_API_KEY`, `SORARE_USER`, `APP_URL`, `REVALIDATE_SECRET`, `VERCEL_BYPASS_SECRET`, local `REFRESH_TOKEN` |
| Vercel | `DATABASE_URL`, `GITHUB_TOKEN`, optional `GITHUB_REPO`, `REVALIDATE_SECRET`, `EXTENSION_TOKEN`, optional `EXTENSION_DIR`, `NEXT_PUBLIC_SHOW_CLUB_CRESTS` |
| Extension build | root `APP_URL`, `EXTENSION_TOKEN`, `VERCEL_BYPASS_SECRET` → ignored `config.js`/`manifest.json` |

Never print values. `.env.example` is a minimal local football template; the complete production contract is above.
