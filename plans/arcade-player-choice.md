# Arcade: trustworthy xScore that learns from real results (plan, revised 29 Oct 2026; not started)

Owner, 29 Oct: "make xScore trustworthy and let the algorithm learn from real results", with four asks: an Arcade audit page (in
hindsight, how often each step could have been hit, which teams got there, strategies compared, loopholes found, simulated with the
cards you own, learning after every lineup), fast re-planning, real starting elevens in every plan, and a better upgrade list.
Product and standing rules in AGENTS.md are unchanged by this plan; no secret is read or shown by any step.

Contracts that bind it: ARCADE-CLIMB-001 (climb semantics, prize-chance objective), FORECAST-SOURCES-001 (source identity, zero is a
value), FORECAST-PRELOCK-001 (only pre-lock evidence counts), FORECAST-RAW-001 (raw kept, planning adjusted; correction gates),
AUDIT-EVIDENCE-001 (starters and substitutes apart, too few to tell below 100), EXTENSION-ACTIONS-001 (reads only, allowlists).

## 1 · What the code does today (checked 29 Oct)

| Piece | Where | What it does | Weakness |
|---|---|---|---|
| Score if he plays | `outlookOf`, `frontend/lib/arcade.ts` | Sofix xScore **only when Sofix's next fixture for that player is this game** (`laliga[slug:kickoff]`, built in `app/arcade/page.tsx` from each market player's single `fixture`), else Sorare's projection (read only for games in the next days, `readArcadeExtras`), else his average of his last 15 Sorare scores (`SofixArcadePast`, `playerGameScores(last: 15)`) | Any game after a player's next one falls to Sorare's projection or a plain average; no source is weighted by how good it has been, league by league |
| Sofix xScore quality | `plans/pl-bundesliga-xscore.md`, `plans/ligue-1-fdr-xscore.md`, `plans/score-engine.md` | Conditional on starting, held-out 2025/26: PL RMSE 17.46 vs form 18.38 (8,360 starts), BL1 17.88 vs 18.75 (6,732), FL1 17.86 vs 18.73 (6,710); LaLiga engine judged in `engine_check` | About 1 point better than form per start: real but small. Never measured on Arcade commons, on European games, or as a lineup choice |
| Start chance | `outlookOf` | Sofix's number for that same next fixture (LaLiga: FF → Sorare → Sofix), else Sorare's Arcade start % read from your tab, else unknown = starts | Outside LaLiga there is no FF; Sorare's start % comes only near kick-off; nothing reads the **announced eleven** for Arcade |
| Spread and correlation | `simulate`, `spread`, `arcadePlan.ts` / `arcadeClimb.ts` | His own past scores rescaled; under 3 games a third of his score (884 HyperGlitch commons); teammates correlated 0.09, measured on LaLiga only | One LaLiga number for every league; spread never checked against outcomes |
| Choice of the five | `bestLineup` (2,000 simulated games, 60 shortlisted lineups), `quickLineup` (normal approximation inside the climb planner) | Best chance at the step's target; likely starters first (≥50% or unknown) | The chance it prints has never been compared with what happened |
| What is kept | Browser only: board, cards and extras in `localStorage`; Sorare start % saved by `/api/arcade/chances`. Nothing in `backend/` knows Arcade | No record of the plan, the lineups entered or the outcomes: nothing to learn from |
| What already exists to reuse | `player_games` table (`backend/app/models.py`): per player and game, actual score, played, started, minutes, and pre-lock `ff_start / sorare_start / sofix_start / sofix_x / sorare_x / said_at`, written by `save_statements` | Built for Play's gameweek lock; Arcade needs the lock per game (its kick-off) |
| Official elevens | `frontend/lib/actualLineups*.ts`, `/api/lineups/actual`, `pro_rebuild` | Reads Sorare's `Game.homeFormation/awayFormation { startingLineupAvailable startingLineup bench }`: public, no key, no session. Measured 20 Oct: elevens appear 58 to 60 minutes before kick-off (`plans/load-from-sorare.md` §5). Checked again 29 Oct on all four Arcade leagues: filled for finished games, empty for games days away | Not wired into Arcade |
| Your commons for a job | `sync.py` already reads `user(slug).cards(rarities: …)` publicly | A job can list your commons (with their set) without the browser | Not used for commons |

## 2 · How xScore becomes trustworthy (the algorithm)

The unit of learning is **every game played by every player you hold a common of**, not only the lineups you enter: about 1,000
players play most weeks, so each week brings thousands of labelled games instead of a handful of lineups. Your lineups are a second,
smaller signal (the chance shown against what happened).

**2.1 Freeze what each source said before kick-off.** A job (`app/jobs/arcade_capture.py`, run inside each refresh and the near-lock
runs) writes, for every player of the Arcade leagues with a game in the next 48 hours, Sofix's xScore and start chance for **that
game** (not only his next one), Sorare's projection, and his form numbers, into `player_games` with `said_at`, accepted only while
`now < kickoff` (the FORECAST-PRELOCK-001 rule, with the game's kick-off as the lock). The extension's Sorare start % and projections
read in your browser are sent with the same rule when the page saves start % (`/api/arcade/chances`, one write per read, never polled).
No migration: the columns exist. After the game the existing score jobs fill score, played, started, minutes.

**2.2 One blended score per league and position, learned online.** For each league × position, predict the score if he starts as
`ŝ = Σ wₖ·xₖ` over the sources present (Sofix xScore, Sorare projection, his L5 and L15 averages of games played, his season average),
with weights fitted by **exponentially weighted ridge regression** on starts only (half-life 6 weeks, ridge toward equal weights). A
missing source drops out and the weights renormalise; the source mix is kept with the number so the card can say which sources it used.
Weights update after every finished game (the job above), so the model learns as the set goes, league by league.

**2.3 Thin records are shrunk, not trusted.** A player's form is shrunk toward his league × position × Sorare tier mean with
`k = σ²(within player) / σ²(between players)` estimated per league (empirical Bayes). A card with 2 games no longer counts as a sure
number nor as a third-of-score guess: it gets its peers' level and the measured spread.

**2.4 Calibrated, with the existing gates.** The blended score goes through a per-league `a + b·ŝ` correction only when
FORECAST-RAW-001's gates pass (≥200 settled starts, held-out weeks of ≥30, bootstrap slope excludes 1, held-out error improves); the
raw blend stays saved. Start chances before the eleven is out are calibrated per league and source by isotonic regression on
`player_games` (who really started), shown as "Sorare says 80% · started 71% of the time at 80% in Ligue 1".

**2.5 Spread and correlation measured per league.** Residual spread per league × position from the blend's own errors replaces
`THIN_SPREAD` and the rescaled-past heuristic; the teammate correlation (0.09 today, LaLiga only) is measured per league from the same
rows. Then a lineup's printed chance is checked by reliability: of lineups given 60–70%, how many cleared (bands of 10 points,
too-few-to-tell under 100).

**2.6 The trust signal on screen.** Each league carries its rolling held-out numbers: typical miss, share within 7 points, and how
often the blend's top five of a window was the real top five, against plain form. A league whose blend does not beat form on the last
four weeks falls back to form and says so. Every card shows its source mix and the league's trust in one line.

**2.7 The eleven overrides everything.** Once Sorare's eleven is out (about an hour before kick-off), a starter's start chance is 1
and a benched player's is his measured chance of coming on × minutes share; anyone else is 0 (section 4).

## 3 · The Arcade audit (a fourth view: Play now · Missions & packs · Players · Audit)

**Question it answers in five seconds:** "How much could this set have paid with my cards, and what would have got me there?"

**Data.** For the set: your commons (public read, set slug), every game in the set's leagues with each player's real score and
start (`player_games`), the pre-kick-off numbers frozen in 2.1, the board's steps and lives, and your entered lineups and results
(read from the board by the page and saved through one bounded route write per change, `arcade_log:<set>`). Computed by a Python job
(`app/jobs/arcade_audit.py`, after each refresh's score step) and published as a block; the page only draws it (heavy work in jobs,
AGENTS.md "Pages").

**Hindsight.** For each kick-off window, the best five you owned by real scores (captain included) and its total. Replaying the board
with perfect knowledge: how many times each step could have been cleared, how many tops (€1,000 each), the windows that did it, and
**which clubs and players** made those lineups (crests and cards, counted). Shown beside what you actually did.

**Strategies, replayed honestly.** Each strategy decides with only the pre-kick-off numbers of 2.1 and is scored with what happened,
over the same windows, from step 1 with 4 lives:

| Strategy | Rule |
|---|---|
| Current plan | `climbWindows` as shipped |
| Favourites only | Lineups only from sides Sofix makes favourite (difficulty 1–2) |
| Steady climb | Play only when the lineup's chance ≥ 60% |
| Rushed climb | One lineup in every window, best available |
| Batch per kick-off | Five from one window only (start % all known before entry) |
| Daily best | Best five of the whole day, games spread out |
| Weekly best, saved | Keep the week's best five for the hardest step; fillers below |
| Insurance stacks | 2–4 lineups on the same window on hard steps |
| Wait for the eleven | Enter only after elevens are out; unknowns excluded |
| Hard-step hoarding | Your top 10 cards reserved for steps 5–6 |

Results per strategy: tops reached, cash won, steps cleared, lives spent, median days to the top, each with a bootstrap band over windows
(a single set is a small sample: under 100 windows says "too few to tell", AUDIT-EVIDENCE-001's rule).

**Loopholes and edges it checks** (each a yes/no with its evidence): whether cancelled insurance lineups cost a life (the kept board's
`remainingLineupsCount` before and after 21 Oct's cancellations); whether a lineup can still be edited until its first kick-off
(Sorare's `updatable` on each lineup); how often a second window the same day was available after a clear; how much captaining by start
certainty versus by score gained; whether club and edition bonuses changed the best five; which kick-off slots (13:00, 16:15, 18:30,
21:00, European nights) clear most often per step.

**Learning after every lineup.** When a lineup settles, the job (next run) adds its windows to the audit, refits 2.2–2.5, and writes a
one-line post-mortem: which card missed and why (did not start, started and under-scored, captain). The planner reads the new weights
on the next page load. Strategy rankings update the same way; a strategy only replaces the shipped one after it wins on held-out
windows of a whole set.

**Design** (DESIGN.md): one hero fact ("This set could have paid €3,000 · you reached step 4"), then aligned evidence: a climb chart per
strategy on the same axis (steps against days), the clubs that got you there as crests with counts, then details folded. Real cards and
crests, tabular numbers, too-few-to-tell where the sample is small, 1:1 skeleton while it loads, mobile keeps hero → evidence → detail.

## 4 · Real starting elevens in every plan

- **Source:** Sorare's public `Game.homeFormation/awayFormation` (no key, no session), already parsed by `actualLineups.ts`. No paid
  or new API is needed. Fallbacks if Sorare is late on a game: Futbol Fantasy's live match page already read by the extension for
  LaLiga (AGENTS.md limits); for other leagues none is needed while Sorare publishes about an hour before.
- **When:** the page reads the elevens of the next window's games through the extension (Sorare GraphQL, not Vercel) from 65 minutes
  before kick-off, every 3 minutes while the tab is visible, until all are out; the read stops when every eleven is in.
- **Effect:** start chances become 1 / bench / 0 (2.7), the lineup and the Play | Hold bar are rebuilt at once, and the card shows
  "In the eleven" or "Benched".
- **To verify Friday 30 Oct** (first Arcade games 18:00 UTC, Le Havre and Nice): one read at 16:55 and one at 17:05 UTC confirms the
  hour on a league game, as `load-from-sorare.md` §5 asked.

## 5 · Re-planning fast

The planner already runs in the page in under a second; what is missing is the trigger. Re-plan at once when:

| Event | How it is seen |
|---|---|
| A lineup settles (step won or life lost) | Board re-read at each entered lineup's settle time + 5 minutes, while the tab is visible |
| You entered something other than the plan | The board read lists your entered lineups (`SofixArcadeLineups`): their cards are held and the plan starts from them |
| Elevens come out | Section 4 |
| You come back to the tab | Already built (3-minute guard) |
| A window passed with nothing entered | The plan simply starts from the next window; the audit records the skipped window, and 2.2 still learns from its games |

A re-plan that changes the advice shows one line on Your move: "Re-planned 18:02: step 3 won, 21:00 is now the move". Nothing is ever
entered on Sorare by Sofix (Check → Draft → Enter stays).

## 6 · Upgrade list (feature 3 kept; the others replaced)

1. **Next best card in each position** (kept): tap a card on Your move to see the alternatives for that position, with the chance each
   would give, so a doubtful starter is weighed against the next card.
2. **Pack value for the climb:** for each pack, simulate its draws (published odds) into your squad and re-run the climb: how much the
   chance of reaching €1,000 rises per 10 gems or per 1,000 essence. Packs are judged by the prize they buy, not by star counts.
3. **The climb calendar:** the whole set's windows on one strip, each with the best chance per step, so the hard steps are aimed at the
   strong days (a European night, a full Saturday) and the easy ones fill the gaps.
4. **Key cards:** the cards that appear in most simulated paths to the top. Sofix keeps them off the easy steps unless a step can only
   be cleared with them; shown as a small "save for step 5" mark.
5. **Post-mortem after every settled lineup:** what missed and why, and what the plan learned from it (section 3), on Your move until the
   next lineup.

## 7 · Order of work (depth first; each ships on its own)

| Phase | Delivers | Proof |
|---|---|---|
| A | Elevens in Arcade (section 4) | Spec with a mock formation; Friday's timing read on a real game |
| B | Pre-kick-off capture for Arcade players (2.1) | Regression test: a reading at kick-off is refused, a failed source keeps its last value |
| C | Hindsight audit and strategy replay on HyperGlitch's games (section 3) | Job tests on a fixed fixture; published block; page spec, 1440/390 look |
| D | Blend, shrinkage, spread, calibration (2.2–2.5) with the trust line (2.6) | Held-out tables per league in this file; only leagues that beat form switch |
| E | Re-plan triggers and the line on Your move (section 5) | Spec with a settled lineup and an off-plan entry |
| F | Upgrades 1–5, one at a time | Each with its spec and look |

## 8 · Blockers and decisions

- **No blocker without a solution found.** Elevens, your commons and every real score are public on Sorare; nothing paid is needed.
- **Decided (owner, 29 Oct): wait for Divination.** HyperGlitch has no numbers frozen before kick-off, so phase C shows only the
  hindsight on HyperGlitch; the strategy replay runs on numbers frozen by phase B from Divination on. Sorare's stored `projection` is
  not used as a stand-in.
- **Neon:** four of five projects are out of quota until 1 Nov; Sofix D has sent 1.1 GB of 5. Phase B adds a few thousand small rows a
  week; the audit job reads them from the GitHub cache mirror (`games_mirror.py`), not Neon, as the score jobs do.
- **Unverified Sorare rules** (settled on the live board, no decision needed): whether a cancelled insurance lineup costs a life, and
  until when a lineup can be edited (`updatable`).
