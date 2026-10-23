# Sofix working guide

@AGENTS.md

AGENTS.md above is the contract (shipping, product rules, the owner's standing rules, Neon, limits, secrets). This file
adds how to find information, the design bar, which skills to use and what done means. Precedence: AGENTS.md → this file
→ [docs/sorare/design/DESIGN.md](docs/sorare/design/DESIGN.md) → skills → global rules.

## Finding information

Do not guess or ask the owner for information that can be established from the project. Find it first:

1. Start with AGENTS.md, the [user manual](docs/user_manual.md), the [research report](docs/research_report.md),
   [PLAN.md](PLAN.md), and the relevant document under `docs/`.
2. Confirm current behavior in the implementation, schemas, migrations, generated artifacts, tests, workflows and
   configuration examples. Search the repository with `rg`/`rg --files` before assuming something is absent.
3. For live or time-sensitive facts, inspect the appropriate authoritative source or service without exposing secrets.
4. If sources disagree, prefer executable/current evidence, record the contradiction, and update the affected docs.
5. Ask the owner only when the answer requires a private choice, unavailable credential, destructive approval or
   information that cannot be recovered safely from the repository and its configured sources.

Every material conclusion should be traceable to a file, test, generated artifact, browser observation or named
external source. Never fill a gap with an invented value.

## Design bar

Use [docs/sorare/design/DESIGN.md](docs/sorare/design/DESIGN.md), the real [manual screenshots](docs/user_manual.md) and
AGENTS.md "Owner's standing rules" (page design). On top of those:

- Premium white shell, restrained semantic colour, near-black text, soft border/shadow.
- One clear hero/question per page; evidence aligned in clean columns, never a spreadsheet or a wall of generic cards.
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

Sofix already has a design system, so the design skills serve it; they never replace it.

- **UI changes (new or restyled page/component, not fixes or tweaks):** load `design-taste-frontend` and `minimalist-ui` for
  craft (hierarchy, typography, spacing, motion), keeping the white shell, semantic colour, card/crest rules and the text
  floor above. Ignore any skill rule that conflicts (dark themes, gradients, generic hero layouts).
- **Components:** shadcn/ui and 21st.dev (registries, GitHub, skills) first, restyled to the design bar; shader effects from
  https://github.com/shader-effects-inc/shaders.
- **Redesigning an existing screen:** `redesign-existing-projects` (audit first, no behavior changes).
- **Design-system documentation:** `stitch-design-taste` only to extend `docs/sorare/design/DESIGN.md`, not to replace it.
- **Before calling UI done:** every visible change gets its page spec and the 1440 px + 390 px look (AGENTS.md "Shipping"
  step 3); a new or restyled screen also gets `web-design-guidelines` on its files, fixing real findings.
- **All code:** `ponytail` for lean code; read your own diff before the commit instead of a review skill or subagent. Lean
  code never means a smaller product: the feature is built to its fullest; tests for business rules still required.
- **Long outputs:** `full-output-enforcement` when a full file or table must be emitted without placeholders.
- **References:** `awesome-claude-design` (`~/.claude/skills/awesome-claude-design`) for layout/interaction references when
  extending the design; extract principles, never clone.
- **Not used for Sofix:** `industrial-brutalist-ui`, `gpt-taste`, `high-end-visual-design`, `brandkit`, `image-to-code`,
  `imagegen-frontend-web/-mobile`. They target marketing sites, dark/brutalist styles or paid image generation. Use only if
  the owner explicitly asks for a landing page or brand work.

## Done means

1. Behavior/copy matches [PLAN.md](PLAN.md), [how_it_works.md](docs/how_it_works.md) and the
   [research report](docs/research_report.md); the frontend renders backend decisions instead of re-deriving them.
2. `node scripts/check.mjs` passes; a visible change also passed its page spec and the desktop + phone look.
3. The doc the change affects (manual or plan) is updated in the same commit, in a line or two.
4. Pushed to `main`, and `node scripts/check.mjs --live` says all clear; the reply ends with its "Test it" links.
5. Source credits (Futbol Fantasy links, hot-linked art), free-tier throttles and secret boundaries are intact.

## What's next

One queue: "Next up" at the top of [plans/roadmap.md](plans/roadmap.md). [TODO.md](TODO.md) keeps each item's full text
(the owner's words, the evidence); the roadmap keeps the order and the Results. A Sorare game week holding two LaLiga rounds
is one week per round (`lib/weeks.ts`, `pageWeeks`).
