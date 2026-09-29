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

### Check the overlay on your own Sorare pages — *built, live acceptance is yours*
Your Sofix numbers are now drawn on Sorare's own cards (one chip: expected score and chance of playing) and
an edge tab opens your gameweek's plan. Built from [plans/overlay.md](plans/overlay.md); automated proof is
`frontend/e2e/overlay.e2e.ts`, and the card-finding was checked against real public sorare.com pages.

**The look was redone (O6)** after your first live look: one solid chip on the card's left edge in Sorare's own colours,
no game detail, clear of Sorare's own chips ([plans/overlay.md, O6](plans/overlay.md)). O7 will mark the cards in your
plan. What no test can do is look at **your** signed-in pages:

1. `node extension/scripts/configure.mjs`, then **Reload** Sofix in `chrome://extensions` (it is now 0.2.1) and
   reload your sorare.com tab.
2. ~~Let one Sorare refresh finish~~ — done (run #21, 2026-09-29): the published gameweek now names every player by
   his Sorare slug, which is how a card is matched to its numbers. Only players with a game in the planned
   gameweek get a ribbon, so few cards will show one during an international break.
3. Look at: a lineup page, the compose page, a gallery, a player page, signed out, and with the popup switch off.
   The popup's **Cards recognised here** should read "N of N"; "0 of N" means Sorare changed its pictures.

Not built (designed in S7, not in the plan): the big "Sofix panel" on a player page. Not enforced yet: matching the
signed-in Sorare account to the owner (numbers are gated by the extension's token).

### Fit and blind-test the Sorare xScore model — *blocked on data*
Today's xScore is a transparent heuristic, not a fitted model. Needs enough scored pre-lock gameweeks in
`sorare_forecasts` before there is anything to fit or to blind-test against.

### Calibrate reward probabilities and correlated outcomes — *blocked on the same data*
Whether the stated reward odds match what actually happens, and whether picks in one lineup move together.

### Retire SorareExt — *blocked on your item 1*
Only after the live acceptance test passes and the recovery steps are written down.

---

## Not blocked, not started

Nothing. Everything open is waiting on either your browser (including the overlay's live check), or more
recorded gameweeks.
