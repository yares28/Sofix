# Sofix · what's left

Two lists: what only you can do, and what I do. Updated 2026-09-28.

The phase plan lives in [docs/sorare_plan.md](docs/sorare_plan.md) and the audit in
[docs/research_report.md](docs/research_report.md); this file is only the open ends.

---

## Yours

### 1 · The live Apply acceptance test — blocks retiring SorareExt
The one thing no test can stand in for, because it needs your signed-in Sorare tab.

- sorare.com open and signed in, then in Sofix: **Play → Apply plan**.
- Walk it: **Check** → **Save as a draft** → **Enter the competition**. Check writes nothing, a draft is
  reversible, only Enter spends a slot.
- Write down what Sorare said if it refused anything, and what happened if the session had expired.

Until this passes, `SorareExt` stays. There is no data gate here — you can do it today.

### 2 · A Refresh button — optional, and you don't have the key yet
`GITHUB_TOKEN` is not missing from your `.env`; it never existed. It is a GitHub key you'd **create**,
and its only power is starting this repo's refresh workflow. Refreshes already run on a clock without it —
the key only adds a button that starts one early.

The app walks you through it: **/control → "A Refresh button"**. Two steps, both pre-filled links (create the
key with repository access limited to Sofix, then add it to Vercel as `GITHUB_TOKEN` and redeploy).
Skip it entirely if you don't want the button.

### 3 · Install the PWA
Chrome address bar → install. Not blocking anything.

---

## Mine

### Build the overlay on sorare.com — *planned, not started*
Your Sofix numbers drawn on Sorare's own cards and lineups. The switch in the popup has always been wired to
nothing — that is why reloading the extension showed you nothing. The feature was never built.

**The plan is written: [plans/overlay.md](plans/overlay.md).** Five phases (O1 identity → O2 one endpoint →
O3 the ribbon → O4 the switch and drawer → O5 proof), built on the approved S7 design and on the mechanics
of the SorareInside reference extension — its card-finding, sizing and anchoring, in Sofix's own colours and
class names, with none of its branding.

Next: O1.

### Fit and blind-test the Sorare xScore model — *blocked on data*
Today's xScore is a transparent heuristic, not a fitted model. Needs enough scored pre-lock gameweeks in
`sorare_forecasts` before there is anything to fit or to blind-test against.

### Calibrate reward probabilities and correlated outcomes — *blocked on the same data*
Whether the stated reward odds match what actually happens, and whether picks in one lineup move together.

### Retire SorareExt — *blocked on your item 1*
Only after the live acceptance test passes and the recovery steps are written down.

---

## Not blocked, not started

Nothing. Everything open is waiting on either your browser, your decision on the overlay, or more recorded
gameweeks.
