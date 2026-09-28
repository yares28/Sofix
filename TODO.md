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

### Decide what the "Scores on sorare.com" switch means — *this is the overlay you couldn't find*
You were right, and it isn't hidden. **The overlay was never built.**
`popup.js` writes an `overlay` key to `chrome.storage.sync`, and nothing anywhere reads it:
`content.js` only asks who is signed in and relays Apply's questions. So reloading the extension changed
nothing on sorare.com, on cards or on lineups — there is no code that draws there.

A decision I shouldn't make alone, because one is a feature and one is a deletion:

- **Build it** — inject Sofix difficulty/xScore next to cards and lineups on sorare.com. Needs a new content
  script, its own CSS under the dark-context exception, and the design bar. Real work, and new surface.
- **Remove the switch** — one honest popup, no promise of a thing that isn't there.

Until you pick, the switch is a lie in the UI, so if you'd rather I just choose, I'll remove it.

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
