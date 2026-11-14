# Plan · the dock, rethought (13 Nov 2026)

The owner's brief, in his words: the dock is barely used; it should be the middleman between Sofix and Sorare, smaller closed and
compact open, original dark styling, no features he does not use (risk alarm, to-do, Guide me), each lineup with its own reward %
(rewards only, XP is not one), enter more than one lineup, load missions from the dock with a button that works and see who to
play where with the numbers, and Arcade lineups. Data in real time. Design canvas, approved after three rounds of comments:
https://claude.ai/artifact/4daWa7gp7cLGswDmu3MxgJ (boards 1–8).

## What ships, in order

1. **Lineups** (boards 1–3). A 22 px closed tag ("3/7 · 21:00", "400 live"). Open: 316 px panel, tabs Lineups · Missions. Each
   lineup a ticket: its own reward % (the plan's `pReturn`: essence, cash or a card, never XP), name, its cards, score against what
   pays. Tap opens the lineup as a 5- or 7-card field (captain, score and start %). Tick several (a ticket punch) and one button runs
   Check, then Draft, then Enter for all of them, one press per step (Sorare safety). Pro lineups are shown, never ticked.
   - **Bug found (the owner's "can only enter 1 lineup"):** Apply's progress was kept per competition (`row.board`), and four
     lineups of one plan share LaLiga Limited, so entering one marked the others. Progress is now kept per lineup, and each draft is
     named apart.
2. **Missions** (boards 4–6). Not read yet: one **Load missions** button that reads Sorare's missions from the open tab (the
   worker's `loadMissions`, as the Missions page's button does), saves them, then asks the app for today's plan again: a 1:1
   skeleton while it reads, no page to open, no wait for a job. Loaded: each mission's reward and Sofix's picks, each with the chance
   he does it if he plays and his start %. Tap a mission: every candidate with both numbers, Sofix's picks marked. No swaps, no
   Guide me.
3. **Arcade** (boards 7–8): next batch of players, and the best lineup to clear the step (tap: four more). Its plan is worked out
   in the browser on Sofix's Arcade page, not by a job; the data route is the owner's call before it is built (see below).

## Removed

Guide me (and the green ring it drew), the alarm and its Swap, the mission swap badge, the hero total, Load from Sorare for Pro,
the ⋯ menu, the lineup-page total. Live scores stay (the tag and each lineup after the lock).

## Real time

Sorare is read live through the open tab (missions, what is entered, Check/Draft/Enter, live scores). Sofix's numbers come from
the app, asked again when the dock opens and at most every two minutes while it is open (Vercel CPU rule in AGENTS.md).

## Arcade's data (owner's choice, 14 Nov 2026)

The extension runs Arcade's own code (`lib/arcade*.ts`, bundled by `configure.mjs` into `extension/arcade.js` and `climb.js`) in a
hidden extension page with a worker, so the sorare.com page never freezes and there is one copy of the logic. Sorare is read through
the open tab as the Arcade page does; the app gives Sofix's numbers and the saved start % in one call (`/api/ext/arcade`), at most
every 10 minutes. The dock reads the result from the extension's storage, so it shows the last plan at once and follows each stage.

### Acceptance (each has a test with a failing mock)

The dock never shows a number without what it rests on and when, and never hides a failure behind an old plan.

It doesn't run
- Chrome stops the engine mid-way: past the plan's deadline with no answer, "Calculation stopped · Retry"; the last plan stays, greyed, with its time.
- A crash or a Sorare answer in an unknown shape: the step that failed is named ("Couldn't read your cards from Sorare"); last plan greyed.
- Too long: stage line ("Reading Sorare · 2 of 4"); at the limit, the best lineup for the step on its own, labelled "Rough".
- Engine files missing (configure.mjs not run since this release): "Run configure", not a silent nothing.
- Sofix unreachable: the plan on Sorare's numbers, labelled "Sorare's numbers only".
- No sorare.com tab, signed out, rate limited, no set running: each in words.

It runs but gets no lineups
- "Not out yet (checked 19:05)" apart from "Couldn't read Getafe–Betis (Sorare busy) · retry 19:07".
- One side announced: that side counts, the other keeps its forecast; each card says Lineup, FF, Sorare or Sofix.
- From 75 minutes before a kick-off of the plan or of an entered lineup, read again every 5 minutes while a sorare.com tab is open,
  and at once when the dock opens; until kick-off, so a late change is caught.
- A card of an announced side on neither the starting XI nor the bench: "Not in squad", apart from "Benched".
- Kick-off moved: saved elevens for that game are dropped.
- 429: stop, say when it tries again.

It calculates but you're not told
- A changed plan says why in one line ("Lineups out: Mayoral benched → Ünal in · 41% → 47%"), and the closed tag shows it.
- An entered lineup with a benched card: a red mark on the closed tag and the lineup named in the panel (no alarm, no notification).
- Working: a 1:1 skeleton and the stage line; a half-made plan is never shown as done.
- The popup keeps the last 10 errors with their times.
