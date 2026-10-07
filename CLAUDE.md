# Sofix working guide

The authoritative contributor contract is [AGENTS.md](AGENTS.md). This file adds the visual/review rules most often
needed during implementation and was reconciled with the app on 2026-09-28.

Cost and engineering discipline (free-first, local verification before CI/deploy, production DB read-only, subagent and
tool budgets, truthful reporting) is defined in the "Engineering operating rules" section of
[AGENTS.md](AGENTS.md), backed by the global `~/.claude/rules/engineering-os.md`.

## Session fast path

One owner, one computer, one user: ship straight to `main` (details and exceptions: [AGENTS.md](AGENTS.md) "Shipping").
This overrides any global habit of branches, pull requests, CI waits or review subagents.

1. Start: a hook runs `node scripts/check.mjs --live --no-wait` when the session opens; read its result. A red CI, failed
   refresh or broken page is fixed first. What to work on next: "Next up" at the top of [plans/roadmap.md](plans/roadmap.md).
2. Work on `main` in the main folder (a parallel session: its own worktree, then `git push origin HEAD:main`).
3. Before the push: `node scripts/check.mjs`. A visible change also gets its page spec and a 1440 px + 390 px look on the
   local dev server (real data), checked against the design bar below.
4. Commit, `git push origin main`, then `node scripts/check.mjs --live /<changed page> ...`. Never wait for CI or the
   refresh, never open a pull request, never drive GitHub through Chrome to merge.
5. End the reply with the "Test it" links the script prints (localhost:3000 and production) for every page that changed,
   so the owner can try it straight away.
6. Production broken by a push (a page not 200, or the owner says it broke): `git revert <commit>` and push that first, so
   the app is back in about two minutes; then find the cause and ship the fix as a new commit.
7. Shipped an item from "Next up": move it to the roadmap's Results and off the list, in the same commit.

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

## Skills for Sofix work

Sofix already has a design system, so the design skills serve it; they never replace it. Precedence: AGENTS.md → this file
→ `docs/sorare/design/DESIGN.md` → skills.

- **UI changes (new or restyled page/component, not fixes or tweaks):** load `design-taste-frontend` and `minimalist-ui` for craft (hierarchy,
  typography, spacing, restrained motion), but keep the white shell, semantic colour, Sorare card/crest rules and the
  11 px / 10 px text floor above. Ignore any skill rule that conflicts (dark themes, gradients, heavy GSAP motion,
  generic hero layouts).
- **Redesigning an existing screen:** `redesign-existing-projects` (audit first, no behavior changes).
- **Design-system documentation:** `stitch-design-taste` only to extend `docs/sorare/design/DESIGN.md`, not to replace it.
- **Before calling UI done:** every visible change gets its page spec and the desktop + phone look (fast path step 3); a new or
  restyled screen also gets `web-design-guidelines` on its files, fixing real findings (accessibility, focus, labels, contrast).
- **All code:** `ponytail`; read your own diff before the commit instead of a review skill or subagent. Smallest correct change;
  tests for business rules still required.
- **Long outputs:** `full-output-enforcement` when a full file or table must be emitted without placeholders.
- **References:** `awesome-claude-design` (`~/.claude/skills/awesome-claude-design`) for layout/interaction references when
  extending the design; extract principles, never clone.
- **Not used for Sofix:** `industrial-brutalist-ui`, `gpt-taste`, `high-end-visual-design`, `brandkit`, `image-to-code`,
  `imagegen-frontend-web/-mobile`. They target marketing sites, dark/brutalist styles or paid image generation, which
  clash with the product's identity and the free-first rule. Use only if the owner explicitly asks for a landing page or brand work.

## Semantics

Routes: `/`, `/play`, `/lineups`, `/fixtures`, `/difficulty`, `/table`, `/audit`, `/cards`, `/players`, `/control`, `/team/[code]`.
`/audit` checks Sofix's numbers against what happened (the xScore success rate; who starts, per source) and is not tied to the
week in the top bar; a figure under 100 cases says "too few to tell" instead of a number.
One date/week drives the app, while LaLiga and Sorare GW numbers remain distinct. Difficulty lenses are Overall,
Attack, Defence, Record, Vs odds and Odds. Cards/value are current snapshots; conditional projection differs from
xScore. Sorare fixture labels use the side actually playing, not a player's club during internationals; outside
LaLiga show Play/xScore and say match odds are unavailable. The home Sorare section and Play put the signed-in
owner's actual Sorare lineups at the top of their selected Sorare GW, including timeline weeks with no saved Sofix
plan. That private read is fixture-level through the extension; never infer it from the public plan. Apply is always
Check → Draft → explicit Enter.

## Done means

1. Behavior/copy matches [PLAN.md](PLAN.md), [how_it_works.md](docs/how_it_works.md) and the
   [research report](docs/research_report.md); the frontend renders backend decisions instead of re-deriving them.
2. `node scripts/check.mjs` passes; a visible change also passed its page spec and the desktop + phone look.
3. The doc the change affects (manual or plan) is updated in the same commit, in a line or two.
4. Pushed to `main`, and `node scripts/check.mjs --live` says all clear.
5. Attribution, free-tier throttles and secret boundaries are intact.

## What's next

One queue: "Next up" at the top of [plans/roadmap.md](plans/roadmap.md). [TODO.md](TODO.md) keeps each item's full text
(the owner's words, the evidence); the roadmap keeps the order and the Results. A Sorare game week holding two LaLiga rounds
is one week per round (`lib/weeks.ts`, `pageWeeks`); the football baseline is in AGENTS.md "Model rules".
