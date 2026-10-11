# Mission comparison repair — owner contract, 10 October 2026

Read this with AGENTS.md when resuming. This task follows the owner's Missions request; Sorare starting percentages remain parked.

## Follow-up requested 11 October

- Investigate the owner's real screenshots: the locked Pass mission has no saved picks; legacy best-card references and
  locked scouting form are empty. Verify publication and captured evidence separately, without fabricating past accuracy.
- Preserve Essence > clues > XP allocation, reserving a player for an Essence mission with any supported chance above
  zero, even if another mission has a larger chance (owner confirmed 11 October).
- Add an Actual option beside FF/Sorare/Sofix on Lineups, automatically showing the announced starting eleven (and
  supplied bench) for the exact selected match. Check Sorare first, existing APIs next, then other free sources if needed.
  Unannounced/missing/partial data must never become a guessed official eleven. No extra match-page visits or paid service.
- Acceptance: real current/legacy mission records, reward conflicts, no retrospective accuracy, announced versus unknown
  actual lineups, exact match/team/player identity, cold start/navigation, and desktop/phone presentation.
- Owner clarification: reconstruct what Sofix would have shown from pre-day facts and keep the comparison / success
  rate. Label these references and include them in Missions' paired comparison once settled; the Audit continues to
  use genuinely captured forecasts. Preserve original choices separately. When full historical eligibility was not
  saved, include the requested comparison as provisional against the recorded cards; expose that boundary beside the rate.
- Read-only evidence: 10 October Limited held 41 candidates but only one dated form, no Best cards selections and no
  Pass picks. The new pool had 89 dated forms. Replaying kept history yields 37 rated candidates, six with a positive
  Pass chance, and three Pass picks in both views. No mission-day result enters form.
- Actual source evidence: [Sorare official lineups](../docs/sorare/actual-lineups-evidence.md).

## Follow-up implementation and verification, 11 October

- Missing legacy references live in a separate `replay` beside the untouched captured record. The refresh builds
  both selection modes from pre-day history, applies Essence > clues > XP, and settles their exact player/game facts.
  Own corrections, source-ID reconciliation and later imports preserve that reference and its original eligibility boundary.
- Dated modern benchmarks are not replaced merely because a new card was first seen after kickoff. Undated or
  post-kickoff availability values never become pre-game evidence. Unsupported or insufficient samples remain unknown.
- The reported 10 October Limited records now produce three picks per mission in both modes, with Pass estimates,
  club-season/start/substitute averages and their samples. Four of 41 candidates still lack usable estimates.
- Regression tests cover missing Pass/Best references, same-day leakage, reward conflicts, original Audit isolation,
  settlement/idempotence, import aliases and provisional eligibility. Actual tests cover source identity, malformed or
  unannounced sheets, no predicted fallback, match navigation, returning after cache expiry, and the public route allowlist.
- The changed Missions/Lineups specs plus mobile passed 67/67; the final Missions rerun passed 12/12. Real saved read models and full kept history were
  inspected in Chrome at 1440 and 390 px, with no overflow or browser errors. Actual presentation replays the owner's
  approved public response; it does not claim another live diagnostic or exhaustive competition/announcement coverage.
  Local screenshots: `output/missions-final-*-pass-*.png`, `output/missions-repaired-*-form.png`, `output/lineups-actual-*.png`.
- Manual design review and existing accessibility checks passed; no `web-design-guidelines` skill was available.
  Authenticated imports/writes were not exercised. No new migration, paid service or manual Sorare page workflow.
- Final repository gate passed: ruff format/check, mypy, pytest, OpenAPI/type generation, eslint, TypeScript and vitest.
  The reward regression additionally verifies that Essence reserves a player despite a higher supported goal chance.

## Required outcome and workflow

- Show Sofix's full best selection beside the owner's picks for every loaded mission. Filling slots, importing picks,
  editing history or adding a local shortlist must not remove or change Sofix's independent benchmark.
- Keep pre-kickoff choices and their dated form evidence for settlement. Owner-approved legacy reconstruction uses
  pre-day facts only, never today's form or that day's results. Show which picks succeeded, and compare with Sofix's.
- Show the mission's relevant actual Sorare statistic, including accurate passes and shots on target, and recent,
  season, starting and substitute averages with sample sizes. Retain every supplied action for inspection.
- Card images open player profiles. No extra page visits, tabs or manual data collection to populate the feature.
- Preserve verified eligibility, actual playing teams, rarity and missing/zero distinctions. Use existing saved game
  history and the scheduled refresh; no new per-player API loop or production data edits.

## Owner choices confirmed

- Last 5 and last 10 appearances before the mission day, plus that season. Substitute appearances only in the
  non-starting average; DNPs counted separately. Every average shows its actual sample.
- Both views: best cards independently for each mission (repeats allowed between missions), and a mission plan
  using each card copy once across the day. Keep their saved choices and success figures separate.
- Card images open Sofix player profiles. Preserve selection buttons in the history editor as separate controls.
- Follow each club’s actual season cycle, including calendar-year leagues and Japan’s 2026 transition.

## Evidence

- `plan()` limits Sofix to `picks - made`, reserves imported selections, and the client recalculates after excluding
  shortlisted cards. That contradicts an independent comparison.
- `missions_pool` sheets contain only the previous 70 days of starts; their `season` is not a season average.
- The saved `player_games` store has 3,575 rows for current owned players, including 546 substitute appearances;
  complete saved actions include accurate passes and shots on target. Inspect dates chronologically, not lexically:
  the database driver returns Date objects. Some rows have no complete stats and must remain missing.
- Sorare's official API docs link the public schema (`PlayerGameScore.detailedScore`, `StatScore.statValue`,
  `PlayerGameStats.gameStarted` / `minsPlayed`). The one batched probe using `players { allPlayerGameScores }` was
  rejected because nested history under the list root is unsupported. Existing sync correctly queries a specific
  `anyPlayer`; reuse saved results rather than add calls or infer that the stats are unavailable.
- Session-start live check: deployment bb25ed3, all 13 routes, CI and refresh succeeded.

## Acceptance

- Regression: all own slots filled, a shared own/Sofix pick, local shortlist and history corrections never hide or
  alter the independent reference selection. Repeated reloads show the same frozen picks after kickoff.
- No result or stat from the mission day or later can enter its pre-day form. Season rollover, start/sub/DNP,
  incomplete readings, zero counts and short samples have explicit tests.
- Actual mission thresholds settle the same way as ranking/scouting. Compare matching missions with settled,
  non-void evidence; label pending and missing forecasts instead of presenting retrospective accuracy.
- Run the repository checks, Missions page spec (plus shared suites if the mock changes), and inspect real-data
  desktop (1440 px) and phone (390 px) screenshots before shipping. Record what was and was not verified.

## Implementation and verification

- Both independent choices are captured separately with card/game identity, target and dated form. Own picks and
  shortlist changes cannot allocate cards away from Sofix. Evidence survives kickoff and source-ID reconciliation.
- Last 5/10, club-season, starter/substitute averages and all supplied action names show actual samples. Missing stats
  stay unknown; zero stays zero; DNPs stay separate. The daily reader fills season history through its existing read.
- Supported targets settle even for eligible unrated cards or own picks without a forecast. Those actuals affect the
  best possible result, without inventing a prediction. Official own verdicts win; incomplete eligibility excludes accuracy.
- Paired history compares matching settled missions using the existing best-possible success definition. Best-card and
  mission-plan history remain separate. Player art opens Sofix profiles; all recorded stats are expandable.
- Regressions demonstrated before fixes include filled own slots, passes/thresholds, frozen evidence, same-day leakage,
  unknown stats, season cycles, missing-forecast settlement, unrated achievers, copy identity and task-ID aliases.
- Full browser suite: 212/214 passed initially; two navigation assertions timed out under concurrent checks/previews.
  Both passed unchanged on a dedicated rerun (214 unique cases covered). Missions/Audit/mobile also passed 39/39.
  The final page rerun passed 38/39; the unrelated Season navigation assertion timed out on its loading screen and
  passed unchanged on a dedicated rerun, alongside the new desktop expanded-stats overflow assertion (2/2).
- Final repository gate passed: ruff format/check, mypy, pytest, OpenAPI/type generation, eslint, TypeScript and vitest.
  The paired success regression also excludes a void game on either side.
- Real saved-data Chrome proof at 1440 px and 390 px: nine own slots filled with Sofix suggestions still visible;
  mission-specific and expanded stats, clickable profile art, no horizontal overflow or browser errors. Evidence is in
  `output/missions-final-{1440,390}-{top,form}.png` (local, ignored). This replays saved actuals with a fixed mission
  clock; it verifies presentation/calculations, not historical prediction accuracy or authenticated extension imports.
- Manual design review and the Missions accessibility spec passed. A `web-design-guidelines` skill was not available;
  no claim is made that its automated pass ran.
- The earlier part of a club season may be absent from kept games. Actual per-stat samples are shown; the existing daily
  reader fills that season once, with coverage saved only after a successful read. Publication is checked after shipping;
  no production data edits, speculative forecasts or extra Sorare calls. Sorare starting percentages remain parked.
