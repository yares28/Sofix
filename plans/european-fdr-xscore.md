# Champions League, Europa League and Conference League FDR / xScore

Started 23 October 2026. Status: source-complete retrospective validation finished; CL/EL passed, CONF rejected.
No European production model enabled yet. Continue automatic CL/EL runtime publication and product proof below.

## Requested outcome

The owner asked for all three UEFA men's club competitions after Ligue 1. Deliver independently validated
FDR and Sofix FDR-based xScore, automatically refreshed while the computer is off, for every participating
club and current football player, including unowned players. Preserve the selected date window, search,
bookmarks, team/player identity and all existing planning, owned-card and overlay consumers. No extra source
tabs, manual squad maintenance or Sorare-projection replacement for an unvalidated Sofix model.

**Owner's first-release decision, 23 October:** release validated league phase and knockouts first, all 36 clubs
in each competition; qualifying rounds remain pending and do not block this first release. Historic group stages
remain the corresponding training population before the format change. Keep qualifying source evidence separately.
Unresolved draws remain unresolved;
do not invent participants, dates, odds or results. One club/player/game remains one identity across domestic
and European views. A week containing domestic and European games must use each game's actual competition.
FDR describes regulation time; extra time, penalties, aggregate state, administrative awards and neutral
venues remain explicit. xScore uses authentic Sorare scoring semantics, including any extra-time outcomes.

## Work and release gates

- [x] Read the original expansion contract and existing UEFA audit without copying its unresolved labels into training.
- [x] Verify production health before implementation (23 Oct: all 15 routes, CI and last scheduled refresh passed).
- [x] Verify free current/historical fixture feeds and Sorare competition identity/coverage for CL, EL, CONF.
- [x] Test and build a bounded, resumable UEFA source inventory retaining raw evidence and source conflicts.
- [x] Reconcile 2023/24-2025/26 authentic outcomes and the current full calendar; explicitly account for qualifiers.
- [x] Freeze European FDR and xScore protocols before inspecting accuracy metrics. Never tune on holdout.
- [x] Validate FDR chronology, cold clubs, connected club strength, phases, neutral venues and regulation outcomes.
- [ ] Independently pass each competition's xScore gates against form and the no-FDR ablation, per position (CL/EL passed; CONF failed).
- [ ] Implement bounded automatic calendar/squad/history publication and per-game forecast selection.
- [ ] Add fixtures/difficulty/team/table behavior appropriate to UEFA phases and tiebreak rules.
- [ ] Verify cold starts, selected-GW coverage, closed tabs, expiry, missing versus zero and actual source identity.
- [ ] Run local shipping checks, affected browser specs and real-data desktop/mobile proof; ship and verify publication.

Existing domestic artifacts/protocols are unchanged. Earlier 2000–2026 UEFA research remains historical evidence;
its forecasts and reported metrics are not corrected or promoted implicitly. No approval to drop incomplete games
or qualifiers is inferred from the domestic training-only exceptions. Future blind confirmation remains distinct
from retrospective held-out validation. No new schema, subscription or paid source is planned.

## Source evidence / resumption

Original plan: `C:/Users/Yaya/.codex/worktrees/7e4a/FixtureDiff/plans/multi-competition-expansion.md`.
Its v67 research archive has 17,430 raw UEFA records, unresolved identities/venues/score periods, and two
evaluated administrative outcomes that must never become regulation training targets.

Official [football-data.org coverage](https://www.football-data.org/coverage) lists Champions League in its
free 12 competitions; EL/Conference are absent from that free list. This is not proof of the owner's actual
entitlement or of unavailability from other free sources. Verify representative reads before drawing conclusions.

UEFA's 2026/27 Article 17 describes 36-club league phases: eight opponents in
[CL](https://documents.uefa.com/r/Regulations-of-the-UEFA-Champions-League-2026/27/Article-17-Match-system-league-phase-Online)
and [EL](https://documents.uefa.com/r/Regulations-of-the-UEFA-Europa-League-2026/27/Article-17-Match-system-league-phase-Online),
six in [Conference](https://documents.uefa.com/r/Regulations-of-the-UEFA-Conference-League-2026/27/Article-17-Match-system-league-phase-Online).
The domestic adapter's full double-round-robin assertions cannot be reused for these schedules.

Source inventory is a prerequisite, not feature completion. Keep raw snapshots in ignored local/Actions caches,
never in Neon. Record exact commands, source denominators, unresolved cases and verification below as work proceeds.

### 23 October source checkpoint

Three credential-free current UEFA batch reads succeeded. Published league-phase schedules have exactly
36 clubs and four home/four away distinct opponents in CL/EL (144 fixtures each); Conference has three home/three
away opponents (108 fixtures). Current published qualifying entries: CL 90, EL 80, CONF 258. Later knockout draws
are not yet published; their absence is not a completed-season denominator.

Recovered the original hash-pinned 2019/20–2025/26 CL/EL and 2021/22–2025/26 Conference raw pages, including
the two-page 2019/20 Europa edition, into ignored `backend/data/raw/european/`. The original archive and
its predictions/metrics are untouched. Source manifests preserve exact response hashes; raw scores remain
unadmitted. All 2024/25 and 2025/26 league-phase schedules pass distinct-opponent/home-away coverage checks.

One representative Sorare batch confirmed exact competition slugs `uefa-champions-league`, `uefa-europa-league`,
`uefa-europa-conference-league` and actual recent opponents. The initial alias-at-root query was rejected by Sorare;
the corrected request uses one `football` root. All three `teams` lists returned exactly 50 entries, demonstrating
the need for explicit connection pagination rather than domestic fixed-size assumptions. Those lists may include
qualifiers; they are not asserted to be the current 36 league-phase clubs.

New source-only collectors and `european-xscore.yml` retain official XI/bench, authentic score versions,
null scores, statuses, minutes and actual sides, with actual Sorare cutoffs. Source completeness is explicitly
separate from UEFA alignment and model eligibility. No historical projection is requested. Cache pages are
content-addressed and the manifest switches atomically; a later-page failure leaves the prior edition readable.

Verified so far: 28 new acceptance tests pass; focused Ruff and mypy pass; official Sorare schema check reads
53 queries and six fragments with zero issues. `node scripts/check.mjs` passed Ruff formatting/check,
mypy, the complete backend pytest suite (76 seconds), and OpenAPI export. No UI or serving behavior changes
in this source-collection checkpoint. Cloud source collection is next; no accuracy metrics have been opened.

Source checkpoint shipped as `49fb92c`; automatic cloud run `39866649996` is collecting CL/EL, with Conference
next under the two-reader budget. Post-push `--live` passed deployment and all 15 routes; backend/frontend CI passed.
Production model behavior remains unchanged. The research source collector uses Actions' existing Sorare key;
no credential was extracted or requested from the owner.

Further source audit found late-June CL preliminary qualifiers: the European source index and actual Sorare-window
reader must start 1 June 2023 rather than reuse the domestic 1 July bound. Regression tests first reproduced both
omissions; a period-stamped cache now re-enumerates that index while retaining downloaded game responses. A source
index artifact is uploaded before the longer game reads so alignment can proceed without waiting for all outcomes.

The fixed research candidate/protocol is in [european-model-validation.md](european-model-validation.md).
The research-only fitter models neutral home exposure in both fit and prediction, requires reviewed regulation
goals/venue/availability, rejects repeated games and excludes results at/after lock. It has no production registration.
Exact fixture alignment preserves the complete UEFA denominator and exposes missing qualifiers and conflicting totals.
Names match exact published English labels or an unambiguous oriented opponent at the exact kickoff; no fuzzy bridge.

Offline reuse of the original period-audit function (no network/old-archive writes/model metrics) identified six source
review cases in 2023/24–2025/26: CL `2041692` PAOK–Malmö and `2041694` Bodø/Glimt–Jagiellonia have reported-period
conflicts; CONF `2041907` Celje–Pyunik and `2041763` Mornar–Paksi have scorer-total conflicts; CONF `2041175` / `2041126`
Puskás Akadémia–Dnipro-1 are marked abandoned. Preserve those source fields and obtain independent official match
or disciplinary evidence before any admission/exclusion. Missing scorer arrays (mostly scoreless games) also remain
unreviewed; do not call their absence a zero-event proof.

First cloud artifacts downloaded: CL has 771 game responses and 81 paginated club identities; EL has 715 responses
and 76 club identities. CL's three June 2023 preliminary fixtures explain its index bound shortfall; the revised
collector re-enumerates from June before deciding coverage. All CL tournament-phase games have authentic 22-player
XI and 22 FINAL version-7 starts, including all 189 completed holdout tournament games. CL qualifiers include
REVIEWING scores and several 21-player source gaps, which remain explicit blockers.

EL's 715 source games equal the complete three-edition UEFA entry count. Actual formations have 22 unique players
in every game; 595 games have 22 FINAL version-7 starts and 120 have REVIEWING scores. Those 120 are qualifying
games. Three exact-kickoff joins remain flagged: Union SG–Toulouse 21 Sep 2023 (16:45 UEFA / 16:55 Sorare),
Maccabi Tel Aviv–Dynamo Kyiv 21 Aug 2025 (18:00 / 18:15), Utrecht–Genk 22 Jan 2026 (20:00 / 20:50).
Keep both timestamps; no fixture or player outcome has been dropped. Conference collection is still running.

The initial collector diagnostic incorrectly counted formation rows as players, marking all XIs incomplete. A real
nested-formation regression reproduced this; flattening now requires 11 distinct nonempty slugs per team. Raw
responses were always retained correctly. Re-auditing EL confirms zero genuinely missing XIs. Cold CLI/resume tests
also verify period migrations keep authentic cached games and do not re-download outcomes unnecessarily.

Latest local checkpoint: 52 new European tests; `node scripts/check.mjs` passed Ruff, mypy, full backend pytest
(71 seconds) and OpenAPI export after the source/formation fixes. No UI changes or model accuracy claim.

Second source/research checkpoint shipped as `e0ae32f`. Owner explicitly approved main stages first after the
CL/EL source audit exposed non-final/incomplete qualifying outcomes. This changes the release population, not
the metrics gates. No metrics were opened before that decision. See the protocol amendment below.

### Complete source read and Conference training gaps (before metrics)

First cloud run `39866649996` completed all three collectors successfully. Conference retained 1,251 source
responses and 165 paginated club identities, including qualifying entries outside the first-release population.
Every main-stage fixture across all three editions is present. Rijeka–Sparta (`2046324`, Sorare
`Game:65c06d8a-da06-4481-8c75-ceab14c182cc`) began on 23 Oct 2025 and resumed on 24 Oct, as confirmed by
[Rijeka's contemporary report](https://nk-rijeka.hr/rijeka-sparta-10-adu-adjei-odlucio-utakmicu-koja-je-trajala-1325-minuta/).
UEFA retains 23 Oct 16:45; Sorare has 24 Oct 14:00. Sorare's **actual** game fixture remains
`football-21-24-oct-2025`, cutoff **21 Oct 14:00**, despite the game's later date being outside that window.
Never assign it the later Friday lock by calendar inference. Keep this completed holdout match and all 153 holdout
Conference main-stage fixtures; no held-out source exception is proposed.

Conference has ten incomplete **training-only** games:

- HJK–PAOK 21 Sep 2023 (`2039295`) and Frankfurt–HJK 26 Oct 2023 (`2039335`): missing Përparim Hetemaj score.
- Plzeň–Ballkani 21 Sep (`2039302`), Ballkani–Dinamo 5 Oct (`2039311`), Ballkani–Astana 26 Oct (`2039326`),
  Ballkani–Plzeň 30 Nov (`2039358`) and Dinamo–Ballkani 14 Dec 2023 (`2039383`): missing Armend Thaqi,
  whose official Sorare profile identifies slug `armend-qazim-thaqi` (never inferred from spelling).
- Noah–Víkingur 28 Nov (`2042294`), Víkingur–Djurgården 12 Dec (`2042311`) and LASK–Víkingur 19 Dec 2024
  (`2042314`): missing Jón Guðni Fjóluson score.

All ten whole-game responses have only 21 authentic starter scores. Five Ballkani formations also omit the missing
player; official UEFA lineup PDFs independently name Armend Thaqi. A bounded `nodes` batch asked the singular
`playerGameScore` for the missing identities; every exact game returned null. Each player's fully paged bounded
`allPlayerGameScores` history returned an empty terminal page. The first large anonymous batch exceeded its
500-complexity cap and was reduced, not retried unchanged or upgraded. Successful packets are kept under ignored
`backend/data/raw/european-probe/{training-gaps-and-rijeka,fjoluson-history,thaqi-training-gaps}.json`.
These reads establish the selected source gaps, not global absence from every possible feed. A documented
training-only exception is being requested before metrics; no approval inferred yet. Preserve all ten real results
in football history and every current squad.

**Owner approved the documented training-only exception on 23 October, before metrics.** Exclude exactly those
ten Conference games from xScore training targets and its own-score history; keep their actual results in football
history. Training cohorts therefore require CL 314 games / 6,908 starters, EL 330 / 7,260, CONF 284 / 6,248.
Holdout still requires CL 189 / 4,158, EL 189 / 4,158 and CONF 153 / 3,366. No held-out exception and no current-club
exception. This approval supersedes the pending wording immediately above.

The Rijeka probe also demonstrated why actual `Game.so5Fixture` must be retained for **every** source game:
its reported date is outside its assigned window. New metadata-only `nodes` reads are batched (25 games, no nested
bulk player-score field), joined by ID despite the provider returning a different order, and cached separately from
raw score responses. No calendar-inferred later lock can replace an actual assignment. Source-schema check now
reads 54 queries and six fragments with zero issues. Metadata collection is running locally against the public
read-only API; the five new acceptance tests pass.

The remaining UEFA score/venue review code has test-first proofs for stoppage time versus extra time, own-goal
actor identity, explicit scoreless results, nonplayed awards and the exact independently corroborated Anderlecht
training-history correction. Venue context distinguishes ordinary home games, neutral finals, documented displaced
home policies, four exact foreign relocations and TNS's local English groundshare. Foreign country alone is never
classified as neutral. Four current 2026/27 main league-phase regular-field conflicts retain their raw fields;
complete goal-phase inventories reproduce full totals, and league phases cannot have extra time, so the derivation
is explicit and remains separate from knockout period handling. New validation metrics remain unopened.


### Frozen replay result, 23 October 2026

All 531 completed holdout games passed source alignment, all 11,682 authentic starters included. The only
player-source exclusions are the ten approved Conference training games. Football fit retained their results.
Metadata collection completed for all 771 CL, 715 EL and 1,251 Conference source games; actual deadlines,
including the Rijeka resumption, were used. Source cases, features, protocol and implementation hashes were
frozen in `plans/european-validation-freeze.json` before opening the first new metrics. The replay contains
2,280 reviewed football-history games, 1,469 evaluated football games and 32,098 admitted player starts.

The full reports are committed in `docs/european_validation/`. These are retrospective held-out results,
not a new blind sample. No tuning or re-selection is authorized after seeing these results.

- CL passed FDR: RPS 0.195781 versus base 0.236334; paired weekly CI for difference [-0.050397, -0.030876].
  xScore RMSE 18.653779 versus form 19.823903 and no-FDR 19.124547. Both improvement CIs below zero;
  every position improves on form, with no within-7 or pair-ordering loss.
- EL passed FDR: RPS 0.208142 versus base 0.230160; paired weekly CI [-0.033495, -0.010133].
  xScore RMSE 17.959952 versus form 18.890877 and no-FDR 18.272720. Both improvement CIs below zero;
  every position improves on form, with no within-7 or pair-ordering loss.
- CONF failed FDR: RPS 0.237738 versus base 0.232819; difference CI [-0.009726, 0.018788], with Brier and
  log-loss losses. Its xScore also failed the independent FDR-contribution gate: RMSE 17.795778 versus no-FDR
  17.822220, difference CI [-0.173588, 0.098363]. Improvement versus form alone does not authorize release.

CL/EL production integration may proceed independently, using the exact validated architecture and history
population, automatic 36-club squads and per-game mixed-week model selection. Conference forecasts remain
unavailable. Its factual source history can still inform the validated pooled football model, as in the frozen
replay. A separately developed candidate would need prospective confirmation; do not tune on this holdout.
No known feature substitution is accepted as completion. Current all-squad publication, browser workflow and
production payload proof remain outstanding; neither HTTP 200 nor the replay claims those acceptance criteria.

Local checkpoint: `node scripts/check.mjs` passed Ruff formatting/checks, mypy, full backend pytest (108s) and
OpenAPI export. Focused European tests passed with temporary-file access; the sandbox alone blocked three
atomic file-replacement tests, which passed outside that restriction. No UI behavior changed at this checkpoint.


### Current product foundations (in progress, not enabled)

The complete real 2026/27 fixture packets produced CL and EL boards locally: each has 36 clubs, 144 published
league-phase games, eight rounds, 36 real UEFA crests and 90 future fixture forecasts at the verification time.
No knockout pair was invented. Real source abbreviations include AZ (two letters) and LASK (four); a failing
regression established the need to preserve these instead of requiring domestic three-letter abbreviations.
A reviewed source registry covers all 72 current clubs. New CL alias Como was established from its exact
21 October 2026 fixture against the already-known Manchester United identity, retaining both source IDs.
Other new EL identities follow exact labels or unique oriented fixture evidence; no score-selected mapping.

Current runtime foundations include explicit neutral/phase fields, guarded artifact loading (CL/EL only),
per-game mixed domestic/European model selection, and a shared 70-day main-stage history collector. The collector
requires complete final v7 starter evidence per admitted game and uses the same two-day availability bound.
It retains no qualifying player history. Automatic squad coverage takes the verified 36-club main calendar,
not Sorare's larger list containing qualifiers, and reuses shared club reads. The fallback identity cache is
compacted and expired instead of persisting a second archive of old forecasts.

`european-current.yml` is a read-only source/product verification job using the existing Actions key. It records
all current squads, fixture boards and authentic recent starts without database settings, publication, deployment
or model promotion. Its full real-data outcome is still pending. Runtime refresh/publishing and visible selectors
are not connected yet; this checkpoint does not claim the acceptance workflow is complete.


Current-data run `39875858709` did not pass: CL indexed 36 clubs / 1,086 players, EL indexed 34 clubs /
1,069 players, with unknown positions in Omonia and Torreense. Current history linked all expected games
(CL 45, EL 36, CONF 18), but the first admitted CL game failed starter evidence. No new exclusion is approved
or inferred. The diagnostic collector now retains exact raw game and squad packets and names the failing
source identity/position; this evidence is needed before deciding whether the failure is a source gap or parser bug.
The local gate for that diagnostic change passed Ruff, mypy, backend pytest (69s) and OpenAPI export.
