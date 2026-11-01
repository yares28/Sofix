# Commits outside main — 1 November 2026

## Requested outcome and review boundary

Explain every commit outside main, its effect for the owner, and whether to add, revise, hold or leave it out. Compare implementation and current main, not just titles or commit ancestry. Preserve all work and archives; a recommendation to leave a commit out does not authorize deleting its branch or backup. Do not integrate the multi-competition branch merely to produce this review. Resume Batch acceptance in the owner's already-open Google Chrome and preserve that browser rule for future sessions.

Reference main: 0879663. The 53 exclusive commit objects are 37 commits in the multi-competition worktree, one patch-equivalent Play fix, one delivery-note snapshot, four archived worktree snapshots, eight historical documentation commits, and two old feature commits. They are not 53 missing features. Main contains the Arcade redesign (25e844f, adb911b); both have successful 30 October deployment receipts. Current hosting failure is separate: Vercel reports Account is blocked and home returns 402.

This is source/patch inspection and an integration recommendation, not a claim that all 37 commits were run or tested against current main. Saved model figures below are read from the branch's artifacts/reports; no paid/source bulk calls or model fits were run for this review. The current model gates in AGENTS.md remain the shipping contract. Add means retain for integration with dependencies and current checks; it does not mean cherry-pick immediately without testing. Historical snapshots remain available as backups.

## The 37 multi-competition commits, oldest first

### 017a37c — Add, high priority

Stops an unchanged player-history reread from looking like new content every few minutes. Published read times and mirror fingerprints use a day, while Neon keeps the precise timestamp. Real score/stat changes still invalidate the data immediately. This directly reduces repeated database transfers and R2 uploads; verify the first two real refreshes and the one-time mirror rebuild rather than promising the old estimated savings as measured results.

### 3552fa0 — Add, high priority

Keeps foreign fixture-board payloads and timestamps stable when fixtures and displayed forecasts have not changed. Adds a small separate board_checks record so a freshly checked, unchanged European board does not become stale to xScore. It also suppresses tiny numerical fit drift, within 0.0005. Integrate the freshness consumer with the writer; taking only the timestamp suppression could disable European forecasts after six hours.

### fde1ae0 — Add

Removes the unconditional Validated model claim and repeated technical notes from foreign boards. Conference instead gets one backend-owned Early estimates note, with source credits preserved. This makes the UI more honest and quieter without changing predictions.

### 4b7e4e9 — Add after checking the current competition rules

Derives a European league phase's length from its board rather than assuming eight games. Conference's final tie-breaking therefore runs after its six games; Champions League/Europa League still use eight. This fixes a real structural bug. The ranking rules and season applicability should be verified against the official regulations during integration.

### 68b51f1 — Add

Publishes which lenses actually contain data, hides empty lens controls and falls back to Overall when an old link asks for an unavailable lens. On All, unpriced fixtures explicitly say No odds. Retains backward compatibility for older blocks. Ship backend schema, generated types and page consumers together; this is a payload change, not a database migration.

### 854e375 — Add, high priority

Scores each game separately in mixed weeks. A player with a Champions League game plus an unmodelled domestic game keeps Sofix's estimate for the covered game, rather than losing Sofix's forecast for the whole week. The other game's fallback remains separately attributed to Sorare or form. Preserve per-game sources in the frozen record and existing best-game double-week semantics.

### eaac1e4 — Add

Gives No odds text adequate contrast on fixture tiles. Small accessibility fix; verify it with the available-lenses change and both themes.

### f7284c8 — Add with its equality checks

Moves runtime imports away from research modules by copying only the definitions the app uses into app/live. Frozen research stays untouched for reproducibility; tests compare syntax trees. It adds roughly 1,400 lines because there are deliberately two copies, so future maintenance must keep a clear runtime owner rather than casually editing both.

### 8936007 — Add

Moves foreign-league exclusions, club aliases and presentation codes into small per-league JSON files, retaining their sources. Promoted clubs and corrected spellings become data edits instead of changes scattered through the model. Keep the equality tests so the refactor does not silently alter forecasts.

### af068cb — Add with 358e518, high priority

Introduces a near-lock quick refresh: skip unrelated football rebuilds, refresh chances and plans, reuse a complete recent same-week domestic squad index, and print refresh durations. It can save significant work near locks, but the old under-four-minute goal is not verified. Preserve FF reads, lock-time capture, current fixtures and coverage.

### 358e518 — Add with af068cb

Fixes that quick-refresh optimization so it never reuses compact European squad indexes that lack the games/odds the planner needs. Only complete domestic indexes may be reused. This is a required correctness follow-up, not an optional separate feature.

### aecf704 — Add with its capture/settlement checks

Computes Sofix/Sorare/source success counts by competition, club and player from saved pre-game forecasts and actual results. It is the data layer for the broader Audit, not a new model. Verify that late/missing predictions stay excluded and that owner-only Audit figures retain their existing meaning.

### 12c2ff0 — Add

Combines the match-related Attack and Opponent explanation terms into one reason named after the opponent. The predicted score stays the same; the breakdown becomes easier to interpret and still sums correctly. Keep the numeric reconciliation tests.

### 55c1e9f — Add with 12c2ff0

Updates mocked foreign-game outcomes to include explanation terms, as real outcomes do. It changes tests only and prevents tests from masking a missing explanation. No visible feature by itself.

### ead250d — Add

Labels a player's fallback estimate Waiting for the board when the European fixture board is stale, and identifies the stale competition in Control. This prevents an unexplained switch from Sofix to another source. Depends on the separate board-check freshness and per-game scoring changes.

### f89647b — Revise, then add

Adds the Audit's Who was right UI with source summaries, club/player comparisons, counts and twelve-row pages. Useful, but rateView hard-caps the player list at 240 (PLAYERS_SENT) even though the feature promises every covered player. Provide access to the remaining players through a bounded server-side search/page or published pieces; do not send all player detail blindly to the client.

### 2574d92 — Keep the fitter; hold the feature claim until fitted

Adds per-competition substitute-score fitting and loading, including use in double weeks. Missing artifacts correctly mean no substitute estimate. No foreign_subs artifacts are included, so this commit alone does not deliver the promised comes-on scores. Run the bounded cached-data fit and validate its outputs before presenting it as complete.

### 506f19e — Revise/validate with d7bf675 before activating

Introduces foreign clean-sheet calibration and separate raw/corrected chances. Board clean-sheet displays change, while xScore deliberately retains raw probabilities until its own comparison passes. The final branch's calibration follow-up has a partially in-sample validation path, described below. Preserve this useful separation, but do not accept the headline calibration claim without an independent replay.

### 1ab2e1c — Add

Adds observed decisive-action rates by competition and position, grouped into probability bands, with sample counts and warnings for sizeable misses. It measures the existing forecasts without correcting them yet. Small samples must remain visible; a warning is not proof that a model is wrong.

### 64a88a6 — Keep as research context; no standalone release

Documents what historical European cases and domestic player histories are missing for the league-form experiment. It adds no forecast behavior. Carry relevant limitations forward with d06c5e5 rather than treating this as an unfinished app feature.

### 8d78570 — Keep as research context; no standalone release

Records which Conference clubs have domestic results available from free sources. It helps bound the proposed Conference improvement but does not add data or a model. Retain the source findings with the research rather than shipping a docs-only change.

### 6f167ed — Add with the budget safeguards and a small live-read check

Adds daily bookmaker batches for Premier League, Bundesliga and Ligue 1. Reads only leagues with upcoming games, stores separate odds blocks and reserves credits for LaLiga; missing/low credit information skips calls. The code's nominal maximum is 186 extra credits in a 31-day month, still gated by the reserve. Validate provider response/name matching once in a representative batch; this review did not spend odds credits.

### 41365dd — Add, retaining the actual forecast date

Adds frozen season projections for the three foreign leagues and expands yearly rollover instructions. These artifacts were made on 27 October, not before the season: the UI correctly dates them instead of pretending they were preseason predictions. Verify current-season matching and label them as October projections; next season can have genuine preseason files.

### cc4940b — Revise the season rules, then add

Marks Champions League, Europa League, Conference, relegation and playoff places with a shared legend. The idea is useful, but its rules cite a 2024–27 access list and hard-code cup-dependent places. Recheck the actual 2026/27 season's access/performance/cup rules before integration; static position bands must not pretend every European spot is settled.

### 735c947 — Fold into 126f6a9

Explains why adding league names to an index map was insufficient: Lineups did not have those matches to open. It is the investigation behind the next commit, with no behavior of its own. Preserve the reasoning in the final feature plan.

### 126f6a9 — Add

Adds Premier League, Bundesliga, Ligue 1 and Conference matches to Lineups from Sorare's existing schedule reads. Such games open on Actual, with no invented Futbol Fantasy lineup, link or attribution. It fixes coverage rather than pretending an absent source exists. Needs a post-refresh real-game check; the original branch only had fixture-based browser proof for the newly added matches.

### 179344d — Hold the live boost; keep the experiment

Boosts Conference clubs from England, Spain, Germany and France using a country-group adjustment, leaving other matches unchanged. The saved artifact improves held-out RPS from 0.2148 to 0.1951 on only 44 games, but its 95% gain interval is -0.0476 to +0.0098, crossing zero. It is promising, not a proven improvement under the current statistical gate. Keep the candidate separate until stronger evidence or an explicit owner decision changes that gate.

### 0068b00 — Split/revise before adding

Contains three unrelated fixes: stronger bookmaker-name matching (keep), historical Audit club backfill (revise), and extra local build directories in TypeScript config (make local/scoped). The club backfill uses a player's latest known side if it is either side of an old fixture; after a transfer between those clubs that can assign his old appearance to the wrong club. Membership in the fixture is not evidence of which side he played for. Keep the side unknown unless game-specific evidence proves it.

### d7bf675 — Revise the validation, then judge the artifacts

Extends clean-sheet correction with rolling domestic checks and extra Europa League adjustments. There is a concrete validation problem: own_shifts reuses a pooled UEFA correction fitted through 2024/25 while calling 2024/25 part of its test set; its docstring acknowledges this is not fully held out. Refit every pooled stage strictly before each test season, then rerun the calibration/no-loss gate. Do not scrap the calibration idea; hold these artifacts until that comparison is clean.

### 0f839ab — Add after reproducing the recorded comparison

Blends eligible foreign-league bookmaker win/draw/loss probabilities into fixture difficulty, using LaLiga's existing blend and freshness/bookmaker limits. The branch records about 0.0033 RPS improvement with a week-bootstrap interval below zero in all three leagues. Preserve the comparison evidence and replay it during integration. Goals, clean sheets and player scores deliberately remain on their own model path.

### fd52163 — Hold automatic activation; keep the measurement path

Automatically corrects decisive-action probability bands using older weeks and a check on the newest third, without changing the mean xScore. The minimum check is only ten new starts, and the branch reports no real settled correction yet. That is too little to call reliable. First ship/observe 1ab2e1c's measurements; validate prospective correction performance and add robust sample/uncertainty guards before switching adjustments on.

### 7e53837 — Add, high priority

Records write time by block family during refresh and shows the slowest writes in the live check. Helps identify whether players, boards or other publication steps consume the budget. It measures job work rather than adding page polling; inspect logging overhead and avoid exposing payloads/secrets.

### def4463 — Revise, then add

Improves date-independent browser assertions and warms local mock routes before the suite to avoid cold compilation failures. Good direction, but the warm helper catches every failure and accepts any response, so failed preparation can be hidden until later tests. Surface preparation failures, enforce mock-only use, keep parallel runs' artifacts separate and fix actual missing-link assertions rather than merely waiting longer.

### d06c5e5 — Keep the experiment; hold live activation until its run passes

Adds a resumable one-off workflow to test whether domestic starts improve European xScore, plus substitute fitting. Selects weights before the held-out season and requires a week-bootstrap interval below zero; a failed/missing artifact leaves the feature off. The code is useful research infrastructure, but its large historical Sorare read and resulting fit have not run. Do not call the model improvement delivered or dispatch those reads as part of this review.

### 927b55c — Add after compatibility checks

Gives a club one All competitions view with a strip for its own competitions. A manifest maps the club to one All-board piece, so the server reads that piece instead of assembling every club. This improves the user's view and limits the payload. Publish the manifest index before its consumer and verify old/missing-index behavior.

### f2b8cf3 — Add the layout; revise colour extraction

Uses the competition icon strip consistently, gives foreign leagues the same fixture-week design as LaLiga and derives club colours from crests. The UI changes are useful. The extractor already misidentifies Coventry's colour and retries failed crest reads on every refresh; retain a manual override and bounded retry/cache policy. Keep crest reads out of page renders and prove the final desktop/mobile layout in the owner's Chrome.

### a10d6a5 — Keep the owner decisions, fold into the final plan

Records that Sofix must not blend Sorare's projection into its own xScore, broad non-owned-player start correction was dropped, and action-specific forecasts belong in the score engine after its prerequisites. It adds no runtime behavior. Preserve these decisions; do not reintroduce the dropped feature by applying an older plan.

## The other 16 commits

### 7c07777 — Already in main; do not add again

Adds the same-origin refresh header to Play's Load from Sorare request and its test. git cherry marks it patch-equivalent to main, where fc17c51 already contains the fix. The earlier inventory's implication that this was still missing was wrong.

### 6ecaf94 — Keep as historical evidence; no runtime feature

An eight-line delivery note about the already-shipped data-keeping release 2c0fd95 and its checks. Fold any useful receipt into the current plan; it does not require an application release.

### 1e78929 — Leave out of the release; retain archive

Archived September Audit/S8 visual prototype, recorded sample data and acceptance notes. Today's Audit already has a later implementation. Treat it as design history, not a missing results feature or evidence of current live accuracy.

### 6568429 — Leave out of the release; retain archive

Archived board-toolbar, grid and table restyling plus browser tests. Current boards have evolved substantially since this snapshot. Importing it wholesale would restore an old layout and conflict with current navigation.

### a7f4e49 — Leave out of the release; retain archive

Archived early overlay implementation, API/token handling, tests and debug screenshots. Current main already has the overlay and subsequent security/source/layout fixes. Do not reapply the old trust-boundary code or commit its debug artifacts as a new release.

### 2ce091e — Leave out of the release; retain archive

Archived home-card layout, position shelves, hover zoom and mobile edits. Some concepts are useful, but the snapshot also changes which cards the header selects. A future design request should extract a specific improvement against current behavior; merging the snapshot would revive stale selection/layout decisions.

### c1dedf6 — Historical note; do not merge wholesale

Updates TODO to the 30 September live state and first overlay observations. Those statuses are now stale. Preserve the dated evidence and reconcile only any still-open item with today's roadmap.

### 19c037f — Historical note; check any surviving issue separately

Records a second live overlay look, missing rank/odds rows and repeated start percentages. It is not a fix. Current extension behavior must be checked in Chrome rather than assuming a September observation still applies.

### 5c34396 — Historical design decision; no standalone addition

Discusses when a list should display a Sofix rank, recommending a minimum of two cards rather than four. It changes TODO only. Apply only through a current ranking requirement and test, not by restoring the old task list.

### 8902251 — Historical clarification; no standalone addition

Clarifies that the owner's missing number referred to the win/clean-sheet row, not the rank badge. Useful context for that old bug, with no runtime change. Retain the distinction in any current issue that still reproduces.

### c65bb03 — Historical diagnosis; do not reapply old TODO

Explains that Sorare's percent symbols are SVG icons, which the old odds-row detector missed. Keep this source clue for a fresh reproduction; the code has changed repeatedly since, and this commit itself fixes no detector.

### c14026f — Keep the Chrome rule in current instructions

Adds the owner's already-open Chrome/profile rule and notes where the old rank badges appeared. Current AGENTS.md now preserves the rule without obsolete tooling instructions. No need to merge the old CLAUDE.md/TODO versions.

### a951573 — Reconcile useful reminders; leave old TODO out

Adds forgotten follow-ups: FF predicted elevens, a rescheduled round, source coverage and extension reload. Several now have implementations or newer plans. Check surviving requirements against today's roadmap rather than reinstating every old task as unfinished.

### 9e84e80 — No application change to add

Removes obsolete connector notes from that historical TODO branch. Current connectivity and instructions supersede them. Leave this cleanup out of the shipping queue.

### 459954e — Old implementation already superseded; leave out

Broad September overlay, board/navigation, home and Play integration. Main already contains later implementations of those features, including the production overlay. Reapplying it could replace current eligibility, source, navigation and authentication behavior with old versions.

### 0d18314 — Feature already exists; leave out

The original My cards/player-search implementation. Main's Gallery and Players pages already provide it with later card art, filtering, forecasting and source fixes. This hash's absence from main does not mean the feature is missing.

## Integration recommendation

First retain the budget/freshness fixes and their correctness follow-ups (017a37c, 3552fa0, af068cb + 358e518, 7e53837), then mixed-game/source honesty, then complete the useful page work. Integrate dependency groups against current main and run their actual page/source tests; do not apply the whole old branch unchanged. Split 0068b00, repair d7bf675's validation, keep 179344d/fd52163's live model changes held, and finish the missing fits before advertising 2574d92/d06c5e5 as delivered. Leave the sixteen historical/duplicate commits out of the shipping queue while preserving their backups and useful decisions.

No branch deletion, model activation, historical bulk read or integration of these 37 commits was performed for this review.
