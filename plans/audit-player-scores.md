# Audit: your players' xScore against their scores

Owner request, 11 October 2026: show the selected Sorare GW's owned players in Audit with their saved pre-lock
xScore, Sorare projection, actual score and difference. Read results automatically one hour after each game ends,
then read again one day after that game ends to catch corrections. No whole-GW delay or 100-case gate on these rows
or their clearly sampled GW summary. Browser tabs may be closed; no manual refresh or Sorare visit is required.

## Acceptance and implementation plan

1. Establish the source's completed-game timing and existing reads/schedule. Preserve source identity and frozen
   forecasts; do not estimate a final whistle from kickoff without the owner's agreement.
2. Write failing regression/acceptance tests for cold start, selected-GW coverage (including non-LaLiga and multiple
   games), no open tabs, one-hour initial read, day-later correction, failed/missing reads versus zero, unchanged
   predictions, and persisted check timestamps. Reuse existing storage; avoid a production schema migration.
3. Implement bounded automatic game reads, persisted initial/recheck state and server publication/revalidation.
   Show provisional versus rechecked results and pending reasons. Preserve fair starter-only model aggregates.
4. Add the selected-GW comparison to Audit with real card art, semantic controls and desktop/mobile layout.
   Update the manual/calculation guide; run repository checks, affected browser specs and real-data screenshots.
5. Read the diff, ship directly to main under the contributor contract, run production checks and verify the
   published comparison with one read-only SELECT. Record real-data evidence and any unverified criteria here.

## Evidence

- Existing Audit delays stored actuals until GW end + 24 hours (`player_audit._due`); the versus screen hides its
  summaries below 100 starts. The owner explicitly replaces those restrictions for this player comparison.
- Session-start production check passed: all 13 pages return 200; CI and last refresh successful.
- Official schema: https://api.sorare.com/graphql/schema (downloaded 11 October), documented at
  https://github.com/sorare/api. `Game` provides `date` (kickoff), `statusTyped`, `minute`, `scored` and
  `periodType`, with no end/finished timestamp. Credential-free reproduction:
  `query { anyGame(id: "Game:e15903b2-79d4-44ad-93fc-35d2761010d2") { ... on Game { id date statusTyped minute scored periodType } } }`
  returned kickoff `2026-10-09T07:30:00Z`, status `played`, minute `98`, scored `true`, period `PRE_MATCH`.
  A match minute/period is not a wall-clock final whistle. Asked the owner whether timers may start at the first
  automatic observation of `played`. Owner replied: “You have game times in the app, just use those”.
  Implemented interpretation communicated to the owner: kickoff +3h for the first read and +26h for the recheck,
  allowing about two hours for the match; still require `statusTyped=played`. Half-hourly scheduling can be late.

## Verification before shipping

- Test first: the initial comparison tests failed because `playerScores` was absent; scheduler tests then failed
  before the new service existed. The expiry regression reproduced a stale failure hiding expiry. The newly owned
  teammate regression reproduced a completed match skipping the new owner's player. All 11 targeted backend tests pass.
- `node scripts/check.mjs`: ruff format/check, mypy, pytest, OpenAPI export, generated types, eslint, typecheck and
  vitest pass. The complete gate passed again after the final coverage fix and on resuming before commit.
- Full browser suite: 215 passed, two existing navigation tests timed out while transitioning/loading. Focused
  rerun of every Audit and mobile spec plus the timed-out Play navigation: 31 passed, including both earlier failures.
  The populated player section also passes axe; zero/corrected/pending, selected GW, latest locked default, missing
  forecasts, source identity, closed-tab reopening and desktop/mobile text/overflow are covered.
- Real-data proof: one read-only snapshot of the published grid/system/Sorare/Audit and saved pre-lock records was
  rendered locally. The current locked GW has 84 owned player-game rows with saved forecasts and source game IDs;
  future GW selection also works. Screenshots inspected at 1440 and 390 px (`output/playwright/audit-real-desktop.png`
  and `audit-real-mobile.png`), with no horizontal overflow. Existing stored actuals were used only where genuinely
  present; no recheck was invented. The current GW initially has pending new score reads.
- Design/accessibility pass: existing premium white Audit styling, real owned card art, actual playing-side names,
  named container query, semantic table/section, explicit image dimensions, keyboard links, Madrid timestamps,
  no client polling. Reviewed the changed files against the repository's design skills and the current
  Vercel web-interface guidelines.
- The requested workflow is implemented and verified with deterministic source responses and saved real-data
  coverage. The first automatic production publication and full real next-day correction cycle remain unverified
  before deployment; no exact final-whistle timing is claimed. GitHub's repository is public, so its standard
  hosted runner does not consume a private-repository minute allowance; no paid service/cap change was made.
- Main checkout has an unrelated untracked `.codex/config.toml`; preserve it. The worktree's local preview is on
  port 3001. Follow the clean-checkout rule before synchronising the owner's main-folder localhost preview.

## First production publication and source correction

- `d611967` deployed successfully; all 13 standard production pages and both changed Audit routes return 200.
  The automatic refresh succeeded and published all 84 current-GW rows, but the read-only data check found all
  11 due matches unavailable with no accepted player result. This is not a completed real-data acceptance pass.
- Existing `sync.PROJECTION_BATCH = 1` documents the federation's rejection of repeated `anyGame` root fields,
  including aliases. The new reader had reused the legacy versus batch size of six instead. A regression client
  enforcing the federation restriction reproduced zero successful reads for two due matches.
- Corrected to one paced request per unique due match, reused for all owned players in that match. A query-version
  marker retries the previous invalid request immediately rather than waiting out its 30-minute failure cooldown.
  No extra direct Sorare development request was made; the automatically triggered production refresh supplies
  the real source verification. Browser behavior is unchanged and the existing 31-test rerun still applies.
