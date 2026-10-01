# Sofix working guide

The authoritative contributor contract is [AGENTS.md](AGENTS.md). This file adds the visual/review rules most often
needed during implementation and was reconciled with the app on 2026-09-28.

Cost and engineering discipline (free-first, local verification before CI/deploy, production DB read-only, subagent and
tool budgets, truthful reporting) is defined in the "Engineering operating rules" section of
[AGENTS.md](AGENTS.md), backed by the global `~/.claude/rules/engineering-os.md`.

## Product

Sofix is a private white LaLiga fixture-difficulty board plus Sorare collection/planning companion. Production is
GitHub Actions → Neon read models → cached Next.js/Vercel; the local Chrome extension is the only authenticated bridge
to the owner's signed-in Sorare tab.

## Finding information

Do not guess or ask the owner for information that can be established from the project. Find it first:

1. Start with [AGENTS.md](AGENTS.md), the [user manual](docs/user_manual.md), the
   [research report](docs/research_report.md), [PLAN.md](PLAN.md), and the relevant document under `docs/`.
2. Confirm current behavior in the implementation, schemas, migrations, generated artifacts, tests, workflows and
   configuration examples. Search the repository with `rg`/`rg --files` before assuming something is absent.
3. For live or time-sensitive facts, inspect the appropriate authoritative source or service without exposing secrets.
4. If sources disagree, prefer executable/current evidence, record the contradiction, and update the affected docs.
5. Ask the owner only when the answer requires a private choice, unavailable credential, destructive approval or
   information that cannot be recovered safely from the repository and its configured sources.

Every material conclusion should be traceable to a file, test, generated artifact, browser observation or named
external source. Never fill a gap with an invented value.

## Design language

Use [docs/sorare/design/DESIGN.md](docs/sorare/design/DESIGN.md) and the real
[manual screenshots](docs/user_manual.md).

- Premium white shell, restrained semantic colour, near-black text, soft border/shadow.
- One clear hero/question per page; aligned tabular evidence; no wall of generic cards.
- Motion explains change, preserves contrast and respects reduced motion.
- **Players are always drawn as their Sorare card, and clubs as their real crest, wherever that is possible** (owner's rule, 2 Oct
  2026). A card is the real card art: yours for a card you own, else a real card of his from Sorare's public listing
  (`allCards`, Limited, current season). A face, silhouette or initials stand in only while the picture loads or when Sorare has
  none; a coloured shield stands in for a crest the same way. Never design a different, "simpler" look for players who are not yours.
- Text is never smaller than 11 px on a desktop or 10 px on a phone (checked by `npm run design` for previews, and by `smallText` in
  `frontend/e2e/helpers.ts` for Lineups, Cards and Players; SVG text and text only a screen reader gets are left out).
- Responsive behavior uses named containers where components are reused; centre beyond 1600 px.
- Sorare overlay is the dark-context exception but never copies the wordmark.
- Say fresh/waiting/stale/no odds/not signed in instead of optimistic empty placeholders.

## Semantics

Routes: `/`, `/play`, `/lineups`, `/fixtures`, `/difficulty`, `/table`, `/cards`, `/players`, `/control`, `/team/[code]`.
One date/week drives the app, while LaLiga and Sorare GW numbers remain distinct. Difficulty lenses are Overall,
Attack, Defence, Record, Vs odds and Odds. Cards/value are current snapshots; conditional projection differs from
xScore. Sorare fixture labels use the side actually playing, not a player's club during internationals; outside
LaLiga show Play/xScore and say match odds are unavailable. The home Sorare section and Play put the signed-in
owner's actual Sorare lineups at the top of their selected Sorare GW, including timeline weeks with no saved Sofix
plan. That private read is fixture-level through the extension; never infer it from the public plan. Apply is always
Check → Draft → explicit Enter.

## Done means

1. Compare behavior/copy with [PLAN.md](PLAN.md), [how_it_works.md](docs/how_it_works.md) and the
   [research report](docs/research_report.md).
2. Render backend decisions; do not re-derive them.
3. Run relevant unit/type/lint checks, design checks and browser journey at desktop/mobile widths.
4. Update the manual/status plan with behavior changes.
5. Preserve attribution, free-tier throttles and secret boundaries.

## Known blockers

The merge was resolved on `main` at `8c4ff20`. The 2026-09-27 audit's multi-round defect is fixed (2026-09-28): a
Sorare game week holding two LaLiga rounds is now one week per round, each with its own address and days, sharing the
one game week and its single plan, and each page lists only the weeks it can open (`lib/weeks.ts`, `pageWeeks`). The
full suite passes. The football baseline is settled at 0.1947 (canonical rerun, 2026-09-28; 0.1953 was the same
model without the shipped rating spread). Still open: a heuristic—not fitted—Sorare xScore, and extension/reward
-calibration acceptance.
