# Champions League, Europa League and Conference League FDR / xScore

Started 23 October 2026. Status: source verification and acceptance tests; no European model enabled.

## Requested outcome

The owner asked for all three UEFA men's club competitions after Ligue 1. Deliver independently validated
FDR and Sofix FDR-based xScore, automatically refreshed while the computer is off, for every participating
club and current football player, including unowned players. Preserve the selected date window, search,
bookmarks, team/player identity and all existing planning, owned-card and overlay consumers. No extra source
tabs, manual squad maintenance or Sorare-projection replacement for an unvalidated Sofix model.

Coverage includes qualifying, group/league phase and knockout fixtures. Unresolved draws remain unresolved;
do not invent participants, dates, odds or results. One club/player/game remains one identity across domestic
and European views. A week containing domestic and European games must use each game's actual competition.
FDR describes regulation time; extra time, penalties, aggregate state, administrative awards and neutral
venues remain explicit. xScore uses authentic Sorare scoring semantics, including any extra-time outcomes.

## Work and release gates

- [x] Read the original expansion contract and existing UEFA audit without copying its unresolved labels into training.
- [x] Verify production health before implementation (23 Oct: all 15 routes, CI and last scheduled refresh passed).
- [ ] Verify free current/historical fixture feeds and Sorare competition identity/coverage for CL, EL, CONF.
- [x] Test and build a bounded, resumable UEFA source inventory retaining raw evidence and source conflicts.
- [ ] Reconcile 2023/24–2025/26 authentic outcomes and the current full calendar; explicitly account for qualifiers.
- [x] Freeze European FDR and xScore protocols before inspecting accuracy metrics. Never tune on holdout.
- [ ] Validate FDR chronology, cold clubs, connected club strength, phases, neutral venues and regulation outcomes.
- [ ] Independently pass each competition's xScore gates against form and the no-FDR ablation, per position.
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
