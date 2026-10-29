# Documentation audit and AI optimization plan

## Contents

- [Audit contract](#audit-contract)
- [Inventory and results](#results)
- [Where to find everything](#where-to-find-everything)
- [Correctness problems](#correctness-problems--correct-these-first)
- [Missing references and maintenance gaps](#missing-references-and-maintenance-gaps)
- [Existing strengths](#what-is-already-documented-well)
- [Outstanding acceptance evidence](#work-that-documentation-alone-cannot-close)
- [Initial priorities](#initial-audit-priorities)
- [Initial verification](#initial-audit-verification-and-limitations)
- [Deeper review](#what-the-deeper-review-establishes)
- [Ten upgrades for coding agents](#the-ten-upgrades--optimized-for-coding-agents)
- [Proposed repository shape](#proposed-repository-shape)
- [Delivery order](#delivery-order)
- [Verification and status](#verification-and-status)
- [Implementation record](#implementation-record--first-domain)

## Audit contract

Requested outcome: identify where Sofix is documented, audit its correctness and depth, and propose ten upgrades optimized primarily for AI coding agents. This file consolidates the initial audit, deeper implementation traces and the revised upgrade plan.

Coverage: tracked Markdown, README and contributor entry points; page and API routes; storage/schema and published blocks; refresh/workflow scheduling; extension setup; model/research evidence; operational recovery. Compare documentation with the checked-out implementation and record reproducible file/line evidence. Do not change application behavior, credentials, production state or existing documentation during this audit.

Primary reader: an AI coding agent retrieving constraints, tracing implementation, choosing checks and resuming work. Human manuals and screenshots remain supporting references. Optimize for correct execution and complete constraint retrieval with minimal irrelevant context. The owner can use the evidence and acceptance criteria to choose deliveries.

Verification: inventory tracked files, check local Markdown links, compare selected claims with authoritative implementation, and distinguish confirmed contradictions from documentation that was not found. Runtime acceptance and external source terms are outside this documentation audit.

## Results

Sofix has substantial documentation, but no single dependable current reference. The main problem is inconsistent updates: newer behavior is explained in task plans or appended paragraphs while older, contradictory statements remain in the documents readers are told to trust.

Baseline: checked-out commit `72d5fed9a9558dedd3f2fd9e3fa868b1f7416778`, 28 October 2026. Counts below exclude this new audit.

- 75 tracked Markdown files: 5 root guides, 16 under `docs/`, 53 under `plans/`, and 1 generated backend report.
- 14,899 lines across those files, counting trailing empty lines.
- 25 page implementations and 18 Next.js API route implementations. The generated FastAPI schema separately contains 25 paths.
- 246 local Markdown link/image occurrences checked outside fenced code blocks; no missing file targets found. Seven links to Markdown heading fragments checked; no missing heading targets found.
- Nine Markdown documents are unreachable through Markdown links from the five root guides. Some are mentioned as plain text or code paths; this is a navigation finding, not a claim that the files are wholly unmentioned.
- Fourteen findings below: eight correctness problems to correct first, followed by six reference/navigation/maintenance gaps.

This was a repository documentation audit, with inventory/link checks and targeted implementation comparisons. It was not a line-by-line certification of all 14,899 lines or a new model/runtime acceptance test.

The [deeper review](#what-the-deeper-review-establishes) traces decision, lifecycle, publication and evidence paths. The [ten upgrades](#the-ten-upgrades--optimized-for-coding-agents) define the active proposal and acceptance criteria.

## Where to find everything

### Starting points and authority

- [README](../README.md): introduction, a partial route list, repository map, local setup and test commands. Useful entry point; its architecture section is stale (D01).
- [AGENTS.md](../AGENTS.md): current operating contract, shipping, free-tier limits, database projects, local-data isolation, source budgets, extension boundaries and owner decisions. This contains operational information missing from the architecture guide. It is the highest-priority contributor contract.
- [CLAUDE.md](../CLAUDE.md): finding information, design bar, contributor workflow and definition of done; defers to AGENTS.md.
- [PLAN.md](../PLAN.md): compact product/model contract, subsequently extended with other leagues. Several core claims are stale (D02, D03, D07).
- [Roadmap](../plans/roadmap.md): authoritative work queue under **Next up**, followed by historical decisions/results. [TODO](../TODO.md) retains the owner's requests and detailed open ends. These supersede the older execution plan for deciding what comes next (D11).

### Using the product

- [User manual](user_manual.md): Home/Recap, Fixtures, Difficulty, Table, Team, Play, Lineups/Scores, Audit and its views, Apply, Cards, Stats, Prices, Missions, Arcade, Players/player detail, Control, extension setup and troubleshooting. This is the broadest user reference; newer additions coexist with old statements/screenshots (D02, D14).
- [Design language](sorare/design/DESIGN.md): visual principles, tokens, layout, accessibility and an index of historical HTML previews under `docs/sorare/design/`. The actual implementation and manual take precedence over previews.
- [Actual-lineups evidence](sorare/actual-lineups-evidence.md): focused source and verification evidence for announced starting elevens. This is evidence, not a general user guide.

### Architecture, data and calculations

- [Architecture](architecture.md): runtime ownership, refresh lifecycle, cache boundary, storage and security. Intended architecture reference; currently behind the R2 and clock changes (D01, D03).
- [Data dictionary](data_dictionary.md): source meanings, tables, published models, derived fields, time and environment names. It needs a material refresh (D04–D06).
- [How it works](how_it_works.md): source-to-screen pipeline, football calculations, six lenses, Sorare history, forecasts, missions, planner/rewards, replay, extension and code map. It contains many of the newest rules, but also contradictory older descriptions (D03, D08, D13).
- [Data keeping](../plans/data-keeping.md): history tables, capture/freeze rules, archival workflows and dataset coverage. It explicitly records that weekly backup was not selected; an audit should not silently turn that into a new product requirement.
- [Neon egress](../plans/neon-egress.md) and [Neon write-mostly](../plans/neon-write-mostly.md): incidents, byte-saving measures, GitHub cache, R2 page blocks, local block copies and deliberate production reads. The latter's section 4 explains the current page-read architecture much better than `architecture.md`.
- [Cacheable pages](../plans/cacheable-pages.md): requested CDN/caching changes and their implementation plan. A plan is not proof that every planned phase is already deployed.

### Model evidence and validation

- [Fixture-difficulty research](fixture_difficulty.md): detailed football-model research, comparisons, calibration, limitations and reproduction instructions.
- [Generated LaLiga backtest](../backend/reports/backtest_laliga.md): reproducible numeric results. Scripts under `backend/reports/` and deployed coefficients under `backend/artifacts/` are executable evidence.
- [Backtesting guide](backtesting.md): choosing lineup, keeper/outfield, owner-history and frozen-week replays; inputs and limits. Its local-vs-cloud data paths and production-read instructions need updating (D06).
- [xScore success rate](xscore_success_rate.md): meaning, denominators, start-source comparison and update path for accuracy figures.
- [PL/Bundesliga FDR validation](pl-bundesliga-fdr-validation.md), [PL/Bundesliga xScore validation](pl-bundesliga-xscore-validation.md), and [Ligue 1 validation](ligue-1-validation.md): per-release data coverage, gates, exclusions, evidence and limitations.
- [European validation plan](../plans/european-model-validation.md), [European delivery](../plans/european-fdr-xscore.md), and JSON receipts under `docs/european_validation/`: European model evidence. [Conference release](../plans/conference-release.md) is the subsequent provisional product-release decision and explicitly preserves the failed independent gates.
- [Score engine](../plans/score-engine.md), [FDR tuning](../plans/fdr-tuning.md), and [xScore plan](../plans/xscore.md): current model development contracts and historical decisions. They must not be read as descriptions of completed work without checking their results/status.

### Feature work, extension and past audits

- [Futbol Fantasy](../plans/futbolfantasy.md): source behavior, match/squad reads, throttles, freshness, attribution and start-chance integration.
- [Sorare start chances](../plans/sorare-start-chances.md), [overlay](../plans/overlay.md), and [overlay bridge](../plans/overlay-bridge.md): browser capture, live-page evidence, extension behavior and remaining work.
- [Single Play plan](../plans/single-play-plan.md), [plan algorithm](../plans/plan-algorithm-v2.md), [Play reward comparison](../plans/mission-outcomes-and-play-comparison.md), and the other task-named plans: detailed feature contracts and acceptance evidence.
- [Missions repair](../plans/missions-repair.md), [mission picker](../plans/mission-picker-phase1.md), [mission audit](../plans/missions-audit-overview.md), and [Arcade/Set](../plans/set.md): mission eligibility/history/probabilities and Arcade workflows.
- [Research report](research_report.md): the September whole-app audit, with selective later fixes. Valuable historical evidence; not a current exhaustive issue list.
- [Upgrade audit](upgrade_audit.md): another dated audit snapshot, currently outside the root Markdown navigation graph.
- [Execution plan](next_features_plan.md) and [Sorare plan](sorare_plan.md): September phase trackers with later amendments. Useful history, but not the current work queue.

## Correctness problems — correct these first

### D01. Main architecture references describe the old production read path

**Evidence:** [README](../README.md#L35) says Python publishes to Neon and Next.js uses one-hour caches. [Architecture](architecture.md#L40) says `DATABASE_URL` controls page reads and describes one-hour tags and Neon-read failure behavior. The opening diagram in [How it works](how_it_works.md#L6) also leaves out R2.

**Current implementation:** [frontend/lib/r2.ts](../frontend/lib/r2.ts#L5) and [frontend/lib/db.ts](../frontend/lib/db.ts#L119) read published page blocks from R2, or the local block copy, keyed by ETag. `cachedBlock` has a 24-hour cache lifetime under that version; other application caches have their own lifetimes. [publish_to_r2](../backend/app/services/publish.py#L106) and [R2 sync](../backend/app/services/r2.py#L168) publish/copy blocks. Neon remains relevant for jobs and write routes; it is not the production page reader.

Deeper-review clarification: [playData.ts](../frontend/lib/playData.ts#L28) still caches the Sorare version lookup for one hour, while payload pieces cache for 24 hours under that version. The problem is the missing distinction between cache layers and the old Neon read path, not that every one-hour cache statement is false.

**Why it matters:** the current guides lead a maintainer toward the wrong credentials, cache assumptions, failure diagnosis and egress costs.

**Correction:** replace the main diagrams and web/cache/failure sections with one current description covering jobs, Neon, GitHub history cache, R2, web writes and local copies; link historical migrations to plans.

### D02. Conference is both unavailable and available in the same reference set

**Evidence:** [PLAN.md](../PLAN.md#L124) says Conference remains disabled. [Manual](user_manual.md#L57) says it remains unavailable, while [the same manual's later paragraph](user_manual.md#L1129) says it is available provisionally.

**Current implementation:** [competition definitions](../frontend/lib/competitions.ts#L3) include `CONF`; [CompetitionPicker](../frontend/components/CompetitionPicker.tsx#L37) displays the provisional notice. [Conference release](../plans/conference-release.md) records the owner-directed release and its evidence without claiming the failed independent gates passed.

**Why it matters:** readers receive contradictory answers about available competitions and what their validation means.

**Correction:** state the current provisional availability in the canonical scope/manual; retain the rejected gate history in the validation record, labelled as history.

### D03. The core schedule and scheduler ownership are outdated

**Evidence:** [PLAN.md](../PLAN.md#L90) and [How it works](how_it_works.md#L31) list only daily 07:17/22:43 UTC and Tuesday/Friday additions. The architecture describes GitHub scheduling without explaining the outside clock. The [manual's Control section](user_manual.md#L883) has the newer refresh times.

**Current implementation:** [clock/timetable.json](../clock/timetable.json) adds daily 12:07, weekday pre-lock refreshes and five other timed workflows. [clock/src/clock.js](../clock/src/clock.js) implements a ten-minute catch-up window and existing-run suppression. [refresh.yml](../.github/workflows/refresh.yml#L12) retains GitHub scheduling as backup; the other timed workflows refer to the outside clock rather than their own GitHub cron.

**Why it matters:** a reader cannot reliably determine which service starts a job or whether a silent Worker also stops score checks/history/export. Source configuration alone does not prove the Worker is deployed or healthy.

**Correction:** publish one schedule/ownership reference generated from the timetable, explain catch-up/duplicate suppression and the limited GitHub backup, and link a clock recovery procedure. Verify deployed status separately.

### D04. The data dictionary does not describe the current storage contract

**Evidence:** [Data dictionary](data_dictionary.md#L19) lists 10 tables and [payload version 7](data_dictionary.md#L44). [models.py](../backend/app/models.py#L189) contains four additional tables: `player_games`, `match_odds`, `match_forecasts`, `player_absences`. [Sorare publisher](../backend/app/sorare/publish.py#L48) uses `PAYLOAD_VERSION = 8`. The [Sorare phase tracker](sorare_plan.md#L88) still describes version 5 **at review**, which is historical rather than a current contract.

The dictionary's published-key list omits major families such as `grid:<competition>`, `audit`, `score_record:<week>`, `player_games:<slug>`, `missions_pool`, `my_week:<slug>`, `play_rewards:<slug>`, `strategy_audit`, and the switch's reserved keys. Several are described elsewhere, so they are not wholly undocumented.

**Why it matters:** the intended schema reference is insufficient for tracing a page's source, writer, lifetime or null/frozen-field semantics.

**Correction:** document all 14 tables at purpose/key/retention level and add a maintained block registry: key/prefix, writer, readers, schema/version, freshness, overwrite/freeze policy and private-data classification. Keep migrations and validators authoritative for exact fields.

### D05. The Futbol Fantasy dictionary entry describes a superseded collector

**Evidence:** [Data dictionary](data_dictionary.md#L13) says 20 team-page reads every six hours, numbers stored but **not shown**, and failure leaves the column empty.

**Current implementation:** [futbolfantasy_matches.py](../backend/app/sources/futbolfantasy_matches.py#L1) reads round and match pages, with a two-second pause, 240-second budget and stop after three unreadable pages. [Forecasts](../backend/app/sorare/forecast.py#L1), [the manual](user_manual.md#L446), [AGENTS.md](../AGENTS.md) and [the source plan](../plans/futbolfantasy.md) document visible start chances, source precedence and bounded reuse/fallback.

**Why it matters:** the central source reference contradicts what supplies the most prominent start percentage and how failures should be interpreted.

**Correction:** replace the entry with match-level coverage, source priority, freshness/fallback, failure semantics, weekly squad reads and live-extension attribution; link the detailed plan rather than duplicate every parser detail.

### D06. Clean-machine setup and environment documentation are incomplete

**Evidence:** [README local setup](../README.md#L61) mentions the block copy but provides no complete example of `frontend/.env.local` or R2 read settings. [.env.example](../.env.example) is deliberately football-only, while [the dictionary's environment section](data_dictionary.md#L90) calls its own production list complete despite omitting R2, spare-project, mirror and local-isolation settings.

The [backtesting guide](backtesting.md#L80) instructs loading a production database URL for `replan_frozen`, but omits the explicit local-production guard required by [db.py](../backend/app/db.py#L103). Its local `data/raw/sorare_games.jsonl` snapshot should also be distinguished from the daily cloud export into `.cache/sorare_games.jsonl` in [games-export.yml](../.github/workflows/games-export.yml).

**Why it matters:** following the docs on a clean machine does not fully explain how to start the app with real local blocks, how to diagnose a missing copy or how the replay input relates to scheduled exports.

**Correction:** add credential-free examples for local-block, mock/API and production configurations; specify supported Node runtime, required/optional settings, Windows commands, worktree block reuse and expected failure states. Link deliberate read-only database procedures instead of suggesting permanent local production credentials.

### D07. The compact model contract still describes older Sorare inputs and ranking

**Evidence:** [PLAN.md's Sorare contract](../PLAN.md#L77) says Sorare projection/play odds are preferred, describes cash/essence normalization and a common 17.6 spread. [Sorare S4](sorare_plan.md#L90) still begins with a last-five heuristic description despite later fitted-model amendments.

**Current implementation:** [forecast.py](../backend/app/sorare/forecast.py#L245) removes Sorare projection from Sofix's own fitted-score path; [planner.py](../backend/app/sorare/planner.py#L272) weights essence by the owner's leagues; [publish.py](../backend/app/sorare/publish.py#L1622) contests candidate strategies; [score_fixes.py](../backend/app/sorare/score_fixes.py#L1) defines gated planner-only score correction and measured spread. The latest explanations are concentrated in [How it works, optimizer](how_it_works.md#L347) and [the algorithm plan](../plans/plan-algorithm-v2.md). Sorare/form fallbacks still exist where the fitted game score is absent; the correction must preserve that distinction.

**Why it matters:** the compact product/model contract gives an incorrect answer to what produces the recommendation today.

**Correction:** replace the old summary with separate definitions for fitted conditional score, start/play chance, fallback, planner-only correction, spread and ranking. Mark phase descriptions as dated snapshots.

### D08. Reward documentation mixes joint simulation with older independence assumptions

**Evidence:** [How it works](how_it_works.md#L200) says plan reward chance comes from joint simulation, while [the optimizer section](how_it_works.md#L365) says combined any-reward chance treats plan misses independently. [Research report](research_report.md#L107) also says miss probabilities are multiplied.

**Current implementation:** [planner.plan_outcomes](../backend/app/sorare/planner.py#L608) draws each player once across the whole plan, shares those draws across lineups and computes whether any paid reward occurs. [_draw](../backend/app/sorare/planner.py#L110) also applies modeled match links. Separately, [frontend likelyResult](../frontend/lib/play.ts#L664) describes an independent-lineup display fallback.

**Why it matters:** users cannot tell which probability is being approximated or which correlations are modeled versus omitted.

**Correction:** name each quantity and its fallback separately: per-lineup chance, job-produced plan `pAny`, sampled result distribution, display-only fallback and portfolio expectation. Retain genuine remaining assumptions, rather than attributing the old formula to every result.

## Missing references and maintenance gaps

### D09. There is no complete contract index for the Next.js API

**Evidence:** all 18 Next.js API route files were inventoried. Five paths have no literal endpoint reference in any of the 75 tracked Markdown files: `/api/arcade/chances`, `/api/league-history`, `/api/lineups/actual`, `/api/sorare-image`, `/api/stat-charts`. Their product features may still be described without naming the route. The generated [OpenAPI](../frontend/lib/openapi.json) contains FastAPI paths; 17 of the 18 Next.js paths are absent from it. Only `/api/stat-charts` overlaps by path, which does not establish identical behavior.

Examples: [settings](../frontend/app/api/settings/route.ts) is a same-origin persisted write that can dispatch refresh; [my-week](../frontend/app/api/my-week/route.ts) has separate read/save semantics and payload limits; [stat-charts](../frontend/app/api/stat-charts/route.ts) has explicit browser/edge caching. Those contracts cannot be inferred from the football OpenAPI envelope.

**Correction:** add a small Next.js route registry with method, caller, authorization, request/response validator, side effects, size/rate limits, error states, cache behavior and source tests. Link existing code schemas instead of copying field definitions manually.

### D10. Operational recovery knowledge is scattered rather than a usable runbook

**Evidence:** the manual has a useful [error table](user_manual.md#L1088), AGENTS.md has extensive Neon/free-tier rules, and plans retain individual R2/Neon incidents. No dedicated end-to-end recovery guide was found among tracked Markdown for a silent clock, failed R2 publication, divergent database projects or credential rotation.

**Correction:** assemble the already-agreed procedures into one symptom-led operations guide with safe read-only checks, expected state, owner-required actions, verification and rollback boundaries. Explicitly document current recovery capabilities and what cannot be reconstructed. Weekly backup was explicitly not selected in [data-keeping](../plans/data-keeping.md#L20); documenting recovery does not authorize adding it, running copies or changing production.

This is a missing consolidated reference, not proof that the system lacks recovery code or that no manual recovery has ever succeeded.

### D11. Entry-point authority and product inventories disagree

**Evidence:** [README](../README.md#L6) points readers to the September research report for current implementation and to the old execution plan for current work. [Research report's authority map](research_report.md#L256) also calls those phase trackers the next-work references. [CLAUDE.md](../CLAUDE.md#L73) and AGENTS.md instead identify `plans/roadmap.md` as the one queue.

README lists 9 routes, while the implementation has 25 page files, including Lineups, Scores, Missions, Arcade, Stats, Prices, player detail and Audit subpages. Some are alternate views rather than new top-level products; the current list is nevertheless not a complete surface inventory.

**Correction:** provide one short documentation index defining current guide, contract, work queue, historical audit, plan and evidence receipt; link it from README. List route families and their canonical manual sections. Label historical audits explicitly rather than presenting them as an exhaustive current issue list.

### D12. Nine documents are outside root Markdown navigation

Starting from `README.md`, `AGENTS.md`, `CLAUDE.md`, `PLAN.md`, and `TODO.md`, recursively following local Markdown links does not reach:

- `docs/upgrade_audit.md`
- `plans/audit-player-comparisons.md`
- `plans/audit-result-cards.md`
- `plans/difficulty-all.md`
- `plans/home-week-rewards.md`
- `plans/plan-algorithm-v2.md`
- `plans/recap-lineup-scores.md`
- `plans/restructure.md`
- `plans/sorare-repair-2026-10-09.md`

**Why it matters:** important recent contracts can only be found through text search or knowing their filename. A bare filename mentioned in prose is not traversable documentation navigation.

**Correction:** index active plans by topic and mark completed/superseded plans with a successor link. Do not rewrite away the owner decisions or acceptance evidence. This audit's new links deliberately improve access but are excluded from the baseline measurement.

### D13. Source-code references can be broken even when Markdown links pass

**Evidence:** [How it works' code map](how_it_works.md#L640) and [Sorare S7](sorare_plan.md#L130) point to `extension/drawer.js`, which does not exist in the checkout. [manifest.template.json](../extension/manifest.template.json#L21) loads `dock.js`. The [architecture security section](architecture.md#L70) describes only Sorare/configured-app hosts, while the manifest also allows bounded Futbol Fantasy match URLs. Its six-operation summary predates the mission/Arcade operations in [background.js](../extension/background.js#L608) and [bridge.js](../extension/bridge.js#L175).

**Correction:** refresh the code map and extension permission/operation inventory from the manifest and allowlists. Add a lightweight check for source paths written in code spans as well as Markdown link targets. A passing link check currently cannot catch this class of stale reference.

### D14. The manual mixes current instructions with release history and obsolete visual evidence

**Evidence:** [manual opening](user_manual.md#L3) starts with dated change paragraphs before the still-September edition marker. Numbering includes 7a/7b, 10a/10b followed by 10, and there is no linked table of contents. It has 1,133 lines. Some current behavior is appended after **What Sofix cannot promise**, including the Conference release and decisive missions.

The manual contains 11 Markdown image references. The Cards and Play screenshots last changed in commit `f258d0e`, 28 September 2026; their sections now describe materially newer layouts. Lineups, Scores, Missions, Arcade, Stats, Prices and the separate Audit views lack dedicated screenshots in this illustrated manual. The manual correctly discloses deterministic demo imagery; the problem is coverage/current layout, not the use of safe demo data itself.

**Correction:** lead with a table of contents and current user tasks, fold each change into its relevant section, move dated history to a changelog, use stable section numbering and date screenshots by represented UI version. Update safe representative illustrations when layouts change.

## What is already documented well

- Football-model baseline, blind/tuning separation, calibrated-versus-raw fields and important release limitations have concrete numerical evidence and reproduction paths.
- Missing versus zero, current snapshots versus historical claims, actual playing-side identity, Madrid display time and captured-before-lock requirements are repeatedly explicit.
- Apply's Check → Draft → explicit Enter boundary and lost-response recovery are covered in the manual. It would be inaccurate to call all recovery documentation absent.
- Recent feature plans often preserve the requested outcome, edge cases, test evidence and limits of real-data verification. The weakness is their discoverability and the failure to reconcile summary docs afterward.
- The manual covers most current product features in prose. README omissions do not mean those features are wholly undocumented.
- Historical design previews are explicitly labelled as historical evidence rather than current UI specifications.

## Work that documentation alone cannot close

The [Sorare plan](sorare_plan.md#L114) still records the real-owner Check/Draft/update/undo/Enter acceptance and fee/recovery evidence as open. Other live extension/model evidence is also qualified in its relevant plans. A refreshed guide must preserve those qualifications, not mark acceptance complete because mocked tests or documentation exist.

This audit did not use Sorare credentials, run an entry/draft, query production Neon, open production pages in a browser, retrain a model or re-verify historical source/validation receipts. It does not claim those acceptance criteria passed.

## Initial audit priorities

These priorities identify the original defect groups. The later [delivery order](#delivery-order) governs implementation under the AI-first objective; human manual restructuring is supporting work.

1. Reconcile current architecture, Conference availability, schedules, source priority, model inputs and reward semantics (D01–D08). These can change what a reader believes the product does.
2. Add the current documentation index, route/block contract indexes, configuration examples and operations guide (D04, D06, D09–D12). Reuse existing evidence and keep secrets out.
3. Restructure the manual and update visual/code references (D13–D14), preserving dated evidence in history sections.
4. Add inexpensive documentation drift checks: local link/heading targets, source-file references, route inventory, payload version and timetable-derived schedule. Run these locally; they need no paid service or production page visits.

## Initial audit verification and limitations

- Inventoried tracked Markdown with `git ls-files`, not dependency/tool directories or private local files. New/untracked audit output is excluded from baseline counts.
- Checked inline local Markdown link/image file targets outside fenced blocks, plus seven Markdown heading-fragment targets. Reference-style links, HTML links, external URL availability and arbitrary code-span paths were not exhaustively validated. D13 was established separately by source comparison.
- Derived page/API inventory from tracked `page.tsx` and `app/api/**/route.ts` files, excluding API tests and metadata routes. Compared route paths with generated FastAPI OpenAPI paths; path overlap alone does not establish equivalent contracts.
- Compared targeted claims with the implementation, table declarations, publisher version, manifest/allowlists, scheduling configuration, local isolation guard, model/planner functions, and newer delivery evidence. Historical source receipts were read as repository evidence rather than rerun.
- Ran `node scripts/check.mjs --live --no-wait`. It exited 1 during setup: Git could not write the shared worktree `FETCH_HEAD` because filesystem access was denied. The command reported fetch failure and could not establish deployment, CI or refresh state. This is a verification limitation, not evidence of broken production.
- Ran `node scripts/check.mjs`: exit 0 using the last fetched `origin/main` after the same fetch denial. It correctly skipped application checks because only Markdown changed. Separately validated all 111 local evidence links in this report and their cited line bounds; no missing files or out-of-range lines remain.
- Application test/build/browser suites were not run: this audit changes no executable behavior or product UI. Existing product/contributor guides were not rewritten. No commit/push was made, consistent with the repository rule against documentation-only pushes.

## What the deeper review establishes

### 1. The main weakness is the path from a claim to its evidence

The repository contains considerable detailed knowledge. What is unreliable is the connection between a current claim, its definition, implementation, tests, release evidence and the decision it superseded. Counting pages or valid links does not measure that connection.

The six documents required before changing behavior contain **2,517 lines and approximately 38,334 whitespace-delimited words**, before AGENTS.md, CLAUDE.md or the relevant feature plan. This is measured reading load, not a proposed word limit. Readers face both a large burden and conflicting answers. The remedy is progressive disclosure with dependable authority, not indiscriminate deletion.

Evidence: [the required reading instruction](../AGENTS.md#L6), the six files named there, and [CLAUDE.md's finding-information procedure](../CLAUDE.md#L9). The baseline numerical RPS string appears in ten tracked Markdown files; the literal spread `17.6` appears in seven. These are search counts, not ten/seven verified current assertions: repetition is a maintenance exposure, and some occurrences correctly belong to history.

### 2. A recommendation has more stages than the central explanations make easy to follow

Trace inspected:

1. [The Sorare job](../backend/app/jobs/sorare.py) obtains inputs, strategy contenders and optional score correction.
2. [Publisher forecast construction](../backend/app/sorare/publish.py#L1315) builds owner/league forecasts and the score record.
3. [Planner-specific copying](../backend/app/sorare/publish.py#L1340) can apply `score_fix` to the planning mean/spread while retaining raw forecast evidence in the record.
4. [The planner](../backend/app/sorare/planner.py) handles eligibility, weighted essence, captain choice, substitutions, simulations and polishing.
5. [The strategy contest](../backend/app/sorare/publish.py#L1622) may replace the leading recommendation with a contender evaluated on Sofix's numbers.
6. [Selected-week loaders](../frontend/lib/playData.ts#L127) can restore independently retained plan, score and reward blocks when a week leaves the current optimizer payload.

The stage distinction is intentional code behavior; it is not a discovered bug. A reader still needs to assemble the answer to: “Why did the planner use a different number from the one the Audit measures?” The compact model summary does not supply that explanation, and the current details are distributed across the calculation guide and task plans.

### 3. Temporal correctness is a product contract of its own

[save_statements](../backend/app/sorare/player_games.py#L221) rejects a capture at/after the GW lock and updates only available statement fields. Actual-game upserts preserve those statements. [Player Audit](../backend/app/sorare/player_audit.py#L94) separately checks saved evidence against a lock. [Score correction](../backend/app/sorare/score_fixes.py#L107) consumes the retained statements and settled actuals.

Other lifecycles differ: [saved owner weeks](../frontend/lib/myWeeks.ts#L7) use end-plus-24-hours and exact lineup metadata rules; [play rewards](../backend/app/sorare/play_rewards.py#L1) first observe relevant games finished, wait an hour, retry, and check corrections later. Source observation time is not a final-whistle timestamp. A mission day has yet another cutoff. A blanket “freeze at lock” or “settled after a day” is insufficient to specify all these records.

The deeper documentation gap is a cross-feature account of clocks, identities and transitions, including which guarantees depend on upstream writers. This review traced those boundaries; it did not certify every reader/writer or discover a new leakage defect.

### 4. Successful computation and successful publication are different outcomes

[publish.put](../backend/app/services/publish.py#L33) commits the database update before attempting R2 upload. [publish_to_r2](../backend/app/services/publish.py#L106) catches publication failures, and [notify_app](../backend/app/services/publish.py#L130) performs synchronization then revalidation. Individual web writes also have their own upload path. There is no single transaction spanning the database and bucket in these inspected paths.

The frontend caches the Sorare **version lookup for one hour** in [playData.ts](../frontend/lib/playData.ts#L28), while pieces of the **payload cache for 24 hours under that version** in the same file. R2's ETag and local-copy index provide version selection. Thus, “the cache is one hour” is incomplete, but “all cache lifetimes changed to 24 hours” would also be wrong.

Documentation must distinguish data computed, persisted, copied, version-discovered and rendered. A completed job alone does not prove that every intended block is visible. This is a documented-behavior/diagnosis problem, not evidence that publication is currently broken.

The same distinction applies to database fallback: [neon_switch](../backend/app/jobs/neon_switch.py#L43) chooses the latest-written answering project; [the algorithm plan](../plans/plan-algorithm-v2.md#L35) separately records missing historical rows after production moved. Availability of a database is not proof of complete history.

### 5. Evidence quality varies, but the summaries do not consistently signal its strength

The [PL/Bundesliga xScore validation](pl-bundesliga-xscore-validation.md) is a strong pattern: target, split, comparators, complete cohort, exclusions before metrics, paired intervals, source gap and runtime limitations are explicit. [European model loading](../backend/app/sorare/european_models.py#L43) checks release evidence and keeps the Conference provisional authorization separate from passed gates.

By comparison, [the 28 October algorithm plan](../plans/plan-algorithm-v2.md#L21) says “start chances are right” from two quoted rates and “reward chances are right in total” from 6.2 expected versus 8 paid among 32 judged lineups. These are useful observations, but do not by themselves establish calibrated probabilities across bands, positions or weeks. The document gives neither an uncertainty interval nor a full cohort/reproduction specification for those claims. That wording is stronger than the evidence shown there.

[Conference release proof](european_validation/CONF-release-proof.json) preserves a commit, publication run, coverage and verification descriptions; [runtime proof](european_validation/CONF-runtime-proof.json) names archived source evidence and its scope. Those are valuable receipts. A typed common format could make the connection from claim to test/source/hash more repeatable without pretending that private inputs are publicly distributable or historical evidence was rerun today.

### 6. The delivery gate protects generated schemas but scarcely protects prose

[scripts/check.mjs](../scripts/check.mjs#L60) excludes Markdown when deciding whether application checks should run. [CI](../.github/workflows/ci.yml) checks OpenAPI/type drift and [design-check](../frontend/scripts/design-check.mjs) inspects historical previews; no general documentation contract/link/claim drift step was found in those inspected checks.

The local command's successful exit on this audit is therefore **not** evidence that documentation is correct. The repository has a rule to update docs in the same commit, but no cheap check that a changed fact has been reconciled with its current reference. This explains why the same failure can recur after a careful rewrite.

This includes documentation inside the code: [publish.py's opening docstring](../backend/app/services/publish.py#L1) still says the web app reads Neon directly, although its own current publication functions and the frontend implement the R2 path. Implementation behavior, comments and prose must be compared separately; a source-file reference alone is not proof that a claim is correct.

## The ten upgrades — optimized for coding agents

Optimize for retrieving the correct constraints and completing a task reliably with little irrelevant context. Shorter context is useful only when it preserves requirements. Use concise Markdown for meaning and structured indexes for lookup; converting every paragraph to JSON would not resolve conflicting authority.

### 1. Small mandatory bootstrap, then task-directed retrieval

Replace the six-document blanket reading requirement with a compact AGENTS.md containing authority, non-negotiable owner rules, action boundaries, shipping rules and a task router. Keep CLAUDE.md as a thin adapter to the same source. Route by request intent, affected paths, routes and symbols. A planner task loads score, reward, identity and temporal contracts; a UI task loads selected-GW, page-read, design and browser-proof contracts. Cross-domain tasks load the union; unknown tasks fall back to repository search.

**Acceptance:** representative tasks retrieve every critical constraint with materially less context than the approximately 38,334-word mandatory-reference baseline. Target roughly 1,000–1,500 tokens for the bootstrap if all essential rules fit; never truncate requirements to meet a budget. Existing mandatory-reading instructions remain in force until migrated with a preserved-rule check.

### 2. Stable contract IDs and self-contained retrieval units

Give each invariant a stable ID, title, scope, rule, exceptions, reason, implementation and test references. Group them by cohesive domain. Each section must make sense when retrieved alone: define its entity, timing boundary and vocabulary locally. Use aliases so queries for start chance, starting percentage, pStart and FF reach the relevant common contract. Add explicit requires/related links rather than relying on document order.

For example, a proposed FORECAST-PRELOCK-001 would specify a particular record's capture boundary. Reward settlement needs its own contract rather than inheriting a generic “freeze at lock” rule.

**Acceptance:** contract IDs survive file moves; a retrieved rule includes all exceptions and dependencies. No duplicate IDs or conflicting active versions. Chunk sizes follow semantic boundaries rather than arbitrary token cuts.

### 3. Explicit authority, status and supersession

Separate normative owner requirements from observed implementation, tested behavior and historical evidence. Mark records required, implemented, verified, proposed, superseded or known divergence, as applicable. Identify authority, scope, revision and successor. Code establishes what happens; it does not silently override what the owner requested. A mismatch stays visible until resolved.

Historical plans, copied source material and tool outputs are evidence, not new instructions merely because retrieval surfaced them. Exclude obsolete procedures from the active router while preserving their history and successor links.

**Acceptance:** Conference resolves to available provisionally with independent gates still unpassed. An old Neon diagram cannot override the active page-read contract. A deliberate code/requirement mismatch produces an unresolved divergence rather than rewriting the requirement to bless the code.

### 4. Generated symbol and change-impact index

Generate a small index of routes, API methods, tables, block families, extension operations, artifacts, symbols and tests. Overlay authored links to contract IDs, consumers and required validation. Use file-plus-symbol identities; line numbers are convenience links, not stable identifiers. Represent direction: writer → block → reader → page.

A read-only topic/path lookup should return the relevant bundle, why each item matched and its cross-cutting constraints. Dynamic keys that cannot be discovered reliably get explicit entries. Plain local files and search are sufficient; no external retrieval service is required.

**Acceptance:** a publish.put change identifies R2 synchronization, cache contracts and publication tests. A forecast change identifies the raw/planning boundary and comparison consumers. Baseline routes/tables are covered; missing mappings and unresolved symbols fail a local check. Generated output is reproducible from the checkout.

### 5. Explicit temporal, identity and state contracts

Describe each record through its identity, states, triggers, guards, permitted writes and forbidden transitions. Distinguish player/card, club/actual playing side, fixture/GW, board/step, lineup signature and source. Define lock, kickoff, observation, capture, expiry, finality and correction independently. Give absent, empty, zero, failed, provisional and expired distinct meanings.

Supply structured cases for cold start, double GWs, national teams, delayed results, failed sources after successful reads, navigation/tab closure and historical restoration. State when a reader relies on a guarantee supplied by an upstream writer.

**Acceptance:** each case has an expected result and enforcing implementation/test, or a visible gap. The agent can identify legal transitions before editing. Forecast-capture boundaries cannot accidentally become reward-settlement rules; intentionally week-independent Audit views remain explicit exceptions.

### 6. Executable examples and counterexamples

Reuse deterministic fixtures and existing tests to show the complete recommendation calculation, raw versus adjusted forecasts, joint reward probabilities, late-capture rejection and missing versus zero. Provide inputs, intermediate values, outputs and a narrow command. Add counterexamples for plausible mistakes, such as filling an old GW with next week's forecast.

Use actual implementation for generated results, but independently stated contracts for acceptance assertions. A snapshot of whatever current code returns is not proof of correctness. Link numeric claims to cohorts, cutoffs, comparators, artifacts and uncertainty. Distinguish historical reproduction, diagnostic replay and prospective evidence; do not describe a few aggregate observations as calibrated probabilities.

**Acceptance:** an agent can run a production-free example and locate the regression to extend. Changed output requires reconciling the contract rather than blindly updating a snapshot. Private inputs stay private; unavailable evidence is explicit.

### 7. Bounded development and recovery recipes

Each recipe specifies purpose, cwd, prerequisites, exact command/arguments, environment names, inputs, outputs, expected result, failure branch and side effects. Cover mock setup, local blocks, focused checks, model replay, extension rebuild, clock diagnosis and stale publication. Put query/cost limits beside the step that incurs them. Distinguish read, write, dispatch and owner-only actions without introducing extra approval gates.

A stale-page recipe follows computation → persistence → upload → version discovery → render. An answering database does not establish complete history. A lost Enter response requires reading status before another explicit action. Retrieved shell snippets are reviewed against the current task and permissions, never blindly executed.

**Acceptance:** ordinary development needs no production credentials. Mocked failure cases reach the correct next step. Recipes preserve production migration/copy boundaries, source budgets and explicit entry; they contain no secrets or automated write retries.

### 8. One resumable task record preserving the full request

Add a concise current-state section to the existing task plan: requested outcome, coverage, user actions, invariants, decisions, completed work, changed files, checks/evidence, open gaps and next concrete action. Keep original requirements unchanged unless the owner changes them. Link durable files/commits rather than “already checked” conversational assertions.

Update at meaningful phase boundaries, not after every command. The roadmap remains the sole queue. The record is a resume aid, not competing authority or a private-data dump. Distinguish implementation complete, verification complete and owner acceptance complete.

**Acceptance:** after context reduction or interruption, the agent resumes without rereading chat or repeating expensive completed work. Automatic coverage cannot disappear into a manual substitute, and unavailable proof remains open.

### 9. Source-linked verification freshness

For critical contracts, record supporting source symbols/files, tests and artifacts plus the revision checked. A lightweight dependency comparison flags affected evidence after relevant source changes. Normative requirements remain active even when implementation evidence becomes stale; stale evidence is not a revoked rule.

Track implemented, locally tested, published, real-data checked and owner accepted independently. Evidence includes what ran, input scope, outcome and limitations. A document edit timestamp is not a verification timestamp. Freshness flags never launch production polling automatically.

**Acceptance:** relevant code changes invalidate affected evidence; unrelated changes do not mark everything stale. Old passing tests cannot be claimed as verification of new code. Live verification remains within the existing authorized workflow.

### 10. Documentation drift checks and task-based evaluation

Add offline checks for contract IDs, links/symbols, registry coverage, supersession, versions, generated schedules and evidence dependencies. Run them for Markdown-only changes through the existing shipping check. For code changes, report which contracts need review; do not force unrelated documentation edits.

Maintain a small frozen benchmark of real task prompts with independently reviewed expected contracts, sources, safe actions and forbidden errors. Include past-GW restoration, reward explanation, missing start chance, failed publication, Conference status and a UI-only change. Measure critical-constraint recall, irrelevant context, stale-claim use, retrieval size and correct next action. Compare routed retrieval with blanket reading. Static checks do not constitute an agent-performance benchmark: record actual task trials separately, using authorized sessions without paid inference or unsolicited loops.

**Acceptance:** seeded bad links, missing route contracts, stale versions and incorrect supersession fail locally. Representative retrieval keeps every critical invariant while reducing irrelevant context. Shorter output that misses a requirement fails. Checks are fast and offline; prose edits do not invoke the full browser suite.

## Proposed repository shape

- AGENTS.md: small mandatory rules and routing entry point, preserving all owner constraints.
- CLAUDE.md: thin adapter to the same contract.
- docs/index.md: task/domain routing and authority map.
- docs/contracts/: self-contained domain contracts with stable IDs; no file-per-sentence fragmentation.
- docs/reference/: generated route/block/symbol indexes and useful executable-example outputs.
- docs/recipes/: bounded execution and recovery procedures.
- Existing feature plans: original requirements plus a short current-state/resume section.
- plans/roadmap.md: the single queue.
- Existing manuals, screenshots and historical reports: supporting evidence retrieved for relevant UX/history tasks.

These remain proposed paths for a broader migration. The first implementation combines routing, contracts, recipes, inventory and source-review registry in [one operational reference](context.md), rather than creating those directories. Migrate incrementally and retain forwarding links. New material should replace duplicated active prose or answer a concrete retrieval need rather than create another parallel documentation tree.

## Delivery order

Start with one complete domain: Play recommendations. Establish its task route and active authority, raw/planning-score contracts, reward/identity/time dependencies, source symbols and existing tests. Include boundary examples and cheap drift checks before calling the domain complete.

Then apply the pattern to publication/recovery, forecast capture/Audit, extension/session actions, missions/Arcade and UI/navigation. Add execution recipes, resume state and source-linked freshness as each domain migrates. Evaluate the first domain against the existing reading baseline before broad rollout; preserve all critical constraints rather than optimize solely for context size.

The human manual remains useful product evidence. Rewriting it for easier reading and updating screenshots are secondary to reliable retrieval and execution for the primary reader.

## Verification and status

The code/evidence traces above remain grounded in the recorded baseline. The owner's audience clarification supersedes the earlier human-first organization and acceptance criteria; these ten upgrades replace that proposal.

The audit above records findings and line citations at the inspected baseline, not a claim that every defect is still open; later edits can shift those lines. The current reference uses file-plus-symbol identities. The first implementation below adds a usable Play context bundle and offline tooling. The broader ten-upgrade rollout is still open; no full-repository migration or task-performance improvement is claimed.

No application behavior or service configuration changed. Documentation tooling now runs in the local shipping gate and CI. Static retrieval checks are measured below; actual task-performance improvements remain unmeasured.

## Implementation record — first domain

- Requested outcome: make repository documentation reliable for coding agents, beginning with the complete Play recommendation path; preserve the consolidated audit and ten-upgrade proposal above.
- Coverage: task routing, active contracts, raw/planning scores, shared reward probabilities, exact-week restoration, pre-lock capture, publication dependencies, source/test references, deterministic lookup and drift checks. Other domains retain existing reading requirements until migrated.
- User actions: none for ordinary lookup and local verification; no new service, production credential or manual product step. Existing explicit-entry, migration and shipping boundaries remain unchanged.
- Constraints: preserve owner rules and existing guides; one operational Markdown reference for this slice; no application behavior change. Documentation claims must distinguish implementation evidence, local test results and unavailable real-data proof.
- Current state: implementation and local verification complete for the first context bundle; commit/push and post-push confirmation pending. Next action: ship the checked bundle, then extend publication/recovery coverage according to the delivery order.
- Completion boundary: a usable, checked Play context bundle plus adoption in the local gate; broader domain migration and actual task-performance trials remain separately open.

### Implemented scope and remaining rollout

| Upgrade | First implementation | Remaining work |
|---|---|---|
| 1. Bootstrap/router | Play tasks use targeted retrieval; AGENTS.md owner rules and CLAUDE.md design rules preserved | Compact the always-loaded files only after full rule migration; other domains still use legacy reading |
| 2. Stable contracts | Eight self-contained contracts with dependencies, aliases, exceptions and source/test references | Extend to other domains |
| 3. Authority/status | Required versus observed behavior explained; superseded entries need a current successor; old reward descriptions reconciled | Resolve the remaining audit contradictions and apply status to other historical plans |
| 4. Impact index | Path/symbol lookup, dependency closure and deterministic page/API/table discovery; dynamic Play block families authored explicitly | Full API methods, extension operations, artifacts and writer/reader graphs for other domains |
| 5. Time/identity | Exact GW, source identity, pre-lock capture, zero/null, receipt and publication state boundaries | Full Audit, extension, mission and Arcade state contracts |
| 6. Executable evidence | Existing boundary regressions referenced and focused backend/frontend suites executed | Add a publisher regression for raw-before-planning ordering; real-account workflow proof remains separate |
| 7. Recipes | Offline lookup/tests, source-review maintenance and bounded stale-publication diagnosis | Broader recovery, replay, extension and clock procedures |
| 8. Resume record | Original request, coverage, user actions, checks and open gaps in this section | Apply the format to ongoing feature plans when touched |
| 9. Freshness | LF-normalized file hashes per contract; stale evidence fails without revoking requirements | Finer dependency granularity if conservative whole-file reviews become expensive |
| 10. Gate/evaluation | Local and CI drift checks, 16 tool regressions and eight frozen retrieval cases | Reviewed task trials for safe actions, completion and stale-claim use; no inference benchmark claimed |

### Verification receipt — 28 October 2026

- Source baseline: `72d5fed9a9558dedd3f2fd9e3fa868b1f7416778`; current per-contract file fingerprints are in [the reference registry](context.md#contract-registry-and-source-review-fingerprints).
- Test-first: lookup/checker tests initially failed with the module absent; later fallback and comment-only evidence regressions also failed before their fixes. Final `node --test scripts/tests/docs.test.mjs`: **16 passed**.
- `node scripts/docs.mjs check`: eight contracts, references/symbols, dependencies, freshness, retrieval assertions, scoped local links and generated inventory passed. Link coverage is the routed reference, this audit, AGENTS.md and CLAUDE.md; it is not an external-URL or all-Markdown parser.
- `node scripts/docs.mjs benchmark`: eight cases passed; every expected contract retrieved, zero extra contracts. Play recommendation: 2,316 returned words including evidence references; prior six-guide baseline approximately 38,334 words. Both exclude always-loaded owner instructions. Two unmigrated cases correctly return legacy fallback, not a claim of zero required reading. Static routing is not a task-success benchmark.
- Backend: from `backend/`, main-checkout virtualenv Python, `POSTGRES_URL=sqlite://`, empty `POSTGRES_MIGRATION_URL`, `-m pytest -q tests/test_player_statements.py tests/test_player_games.py tests/test_score_fixes.py tests/test_sorare_ff_forecast.py tests/test_sorare_plan_math.py tests/test_play_rewards.py tests/test_publish.py`: **70 passed**, two dependency deprecation warnings.
- Frontend: from `frontend/`, `npm test -- lib/playerForecasts.test.ts lib/play.test.ts lib/r2.test.ts`: **46 passed across three files**. Locked dependencies were installed in the worktree after the offline cache lacked Zod; package manifests/lockfile unchanged.
- `node scripts/check.mjs`: documentation tests, documentation drift and clock tests passed. Initial sandbox fetch denied shared Git metadata writes; a subsequent authorized fetch succeeded.
- Pre-push `node scripts/check.mjs --live --no-wait`: deployed revision `2a4e1b6`, home HTTP 200, latest refresh success, backend/frontend CI success; one historical end-to-end run cancelled. Overall command **failed** because Neon status was absent in R2 (null). No production data repair or project switch was attempted. This predates the documentation change.
- No UI change: no browser screenshots or end-to-end suite added. No new live Sorare/entry/data acceptance proof, model retraining, production database query/write or manual refresh dispatch. Referenced tests beyond the listed commands were inspected, not claimed as executed.

### Resume boundaries

The audit findings outside this first slice remain open. Do not mark all ten upgrades complete, reduce owner rules to a word budget, or treat source hashes as proof of correctness. Shipping this tooling does not close prospective S4 validation, real-data source coverage or the raw/planning publisher regression gap. Keep the existing roadmap as the sole priority queue.

## Continuation contract - 29 October 2026

Resume the full documentation overhaul, not just the first shipped Play bundle. Preserve all owner requirements and the single operational reference. First complete publication/recovery, then Audit, extension, missions, Arcade and UI/navigation. Reconcile stale prose, add routing and source/test evidence, and verify each addition offline. No new manual product steps or production repair actions are authorized by a documentation recipe. The first bundle shipped as 7978519; its deployment and home HTTP 200 passed, while missing Neon status remained a pre-existing diagnostic failure. Current work: publication, local isolation, database selection and scheduling contracts.

### Continuation implementation and verification

Expanded the operational reference from eight to eighteen contracts: publication reconciliation, database selection, local isolation, clock scheduling, Audit evidence, extension actions, mission records, Arcade climb, UI navigation and Conference release authority. Existing guides remain mandatory outside the exact contract scopes; no owner rule was removed. Corrected the production diagrams/cache description, duplicate schedule lists, old Conference-unavailable claims, dictionary payload version and FF source policy, partial environment index and removed drawer.js references. Schedule rows now derive from the timetable, with a regression that failed before implementation.

Verification: 17 documentation-tool tests passed; 20 publication/R2/Neon-selection tests passed; 20 Audit/Conference tests passed; 151 frontend tests across Apply, extension bridge/background, mission store/recovery/replay, Arcade climb/plan and shared weeks passed. Backend runs used SQLite and empty migration URL; two dependency deprecation warnings remain. New source inspections and static retrieval cases do not constitute real-account or prospective accuracy proof. The initial live check still reported missing Neon status; no production repair was performed.

Still open: complete endpoint-method/auth/input/error contracts; comprehensive block/artifact ownership inventory; remaining historical/manual organization and evidence gaps; safe slimming of always-loaded rules; actual task-performance trials; the raw-before-planning publisher regression. The broad architecture and source corrections do not mark every original finding resolved. Next work follows these open items rather than restarting the audit.

### API and ownership continuation

Requested outcome remains the complete overhaul. Current slice: document every Next route method, request guard, input boundary, response/cache behavior and side effect; make uncovered methods fail offline. Distinguish route-specific database reads and GitHub dispatch from page reads. No endpoint is invoked during documentation inspection, and endpoint availability is not authorization to run its side effects.

API continuation result: all 18 Next handlers now have guarded input/response/cache/side-effect contracts, separate from FastAPI OpenAPI. Offline coverage rejects new methods, removed handlers and unrelated contract references. Existing nine route test files passed 42 tests; remaining routes have no invented test coverage. Artifact filenames are inventoried and an authored primary block ownership table is available, explicitly non-exhaustive for dynamic keys. The raw/planning publisher evidence gap is now closed by test_planning_correction_changes_planner_inputs_but_preserves_raw_record (passed on SQLite); application behavior unchanged. Full ownership coverage, mandatory-context migration and actual task-performance trials remain open.

Discovery now links repository Markdown (including previously unreachable plans) and lists artifact files in the same generated reference. Explicit Next handler methods are checked; implicit framework HEAD/OPTIONS behavior is not inferred. Static retrieval has 18 reviewed cases; they all retrieved their required contracts with zero extra contracts in this run. That remains a routing check, not an independent model-performance benchmark. The session health check reported deployed home 200 and successful refresh, with existing missing Neon status and hourly CPU-budget failures.

Shipping verification for this slice: node scripts/check.mjs passed documentation tests, ruff format/check, mypy, full pytest, OpenAPI export and final documentation drift (pytest step 146 seconds). No generated API drift remained. The new publisher regression passed separately; all 42 existing Next route tests passed. No production handler was invoked for this audit.
