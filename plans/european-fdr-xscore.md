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
- [ ] Freeze European FDR and xScore protocols before inspecting accuracy metrics. Never tune on holdout.
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
