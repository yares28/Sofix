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

## Open: Arcade's data

Options for the owner: (a) the Arcade page hands its plan to the extension each time it works it out, and the dock shows that (as
fresh as the last time Arcade was open); (b) the plan moves into a Python job and is published like the others (every refresh,
bigger change); (c) the extension works it out itself from its own reads (most code).
