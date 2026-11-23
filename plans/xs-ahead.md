# Plan · Sofix's xS for every upcoming game (app-wide)

Written 24 Nov 2026. Owner: "For the xS upgrade I need an actual upgrade and not an Arcade-only fallback. The app could profit from
having a glimpse of the future games for a new feature I want in the future that builds lineups for Pro to maximise Pro. So I need an
actual upgrade app wide."

## Requested outcome

- Every player Sofix tracks (LaLiga, Premier League, Bundesliga, Ligue 1, and the Champions, Europa and Conference League) gets Sofix's
  own xS (his score if he starts, from the same model as the next game, opponent included) for **every** game of his club in the next
  45 days, not only his next one.
- One published source, read by every page and job that needs a later game: Arcade (Play now, Surest, ladder, Batch, Players, dock),
  Pro's early plans, and the future Pro lineup maximiser.
- The fitted recent form (`formFit`, 23 Nov 2026) stays only for games no board covers (national teams, domestic cups).
- No user action: it is published by the refresh like every other block.

## What was found (23-24 Nov 2026)

- `scores.scores_for` / `foreign_scores.scores_for` can score any game on a competition's board; the boards hold a prediction for every
  remaining fixture (LaLiga, PL, BL1, FL1 to end of May; CL, EL to end of January; Conference to 17 Dec), 104-180 fixtures per league in
  the next 45 days.
- What limited it: the market rows publish each player's next fixture only (`arcade_outlook`'s `laliga` map, `players:<code>`), so a
  later game fell back to his last five starts, which ran hot (a five of 64 scored 54 next, 3,291 held-out starts).
- Player side of the horizon, measured on 416 LaLiga starts after the model's training (history cut N days before kick-off): Sofix's miss
  goes 18.6 (2 days) → 18.7 (7) → 18.8 (14) → 18.8 (21) → 18.9 (35); the fitted form drifts the same way (18.0 → 18.4). The team side
  (a board's forecast made weeks earlier) cannot be replayed: the boards keep only the latest forecast. It is measured from now on (step 4).

## Steps (depth-first, each ships)

1. **Job: `xs_ahead`.** `backend/app/sorare/ahead.py` lists each club's board fixtures in the next 45 days, scores every tracked player in
   each with the job's own scorer (`forecastBefore` = the run's time), and publishes one block per league,
   `xs_ahead:<LL|PL|BL1|FL1>` = {at, horizonDays, players: {slug: [[kickoff, competition, venue, opponent, xs, xsOn, pDecisive]]}},
   European games under the player's league. A European board not checked in six hours leaves its games out (as the next game does).
   Acceptance: a player's next game in `xs_ahead` equals his published next-game xS (same model, same inputs); games are in kick-off
   order, one per fixture; a club off every board gets nothing (never a guessed number).
2. **Arcade.** `/api/arcade/chances` returns the asked players' `xs_ahead` rows; `outlookOf` takes them as the "sofix" score for that exact
   game. Acceptance: a card's game two weeks away shows Sofix's number (source "Sofix"), the fitted form only where no board has the game.
3. **Pro.** Early plans and the cards' weeks ahead read the same numbers (they already use the same scorer; a test holds them equal),
   and `xs_ahead` is the input the Pro maximiser will plan from.
4. **Record and audit.** Each game's xS said 35, 21, 14 and 7 days ahead is kept (`xs_ahead_said`), so the Audit can show the miss by
   distance once games settle; under 100 settled games it says too few to tell.

## Status (24 Nov 2026)

- Step 1 built: on the local copy 664 LaLiga players, 3,455 games scored in 7.6 s (284 kB); each player's next game in `xs_ahead`
  equals the published one (Champions, Europa, Conference League: identical on 267 games; LaLiga within 0.2 points on 638, the local
  copy reading the board's forecasts instead of the database's).
- Step 2 built: `loadArcadeRecords` carries `ahead` (and the start calibration, which it had dropped since 21 Nov) to the page and
  the dock; Step 4 surest lineups on the owner's board read 7-8% on Sofix's numbers.
- Step 3: Pro's early plans and weeks ahead already score with the same scorer; the maximiser reads `xs_ahead`.
- Step 4 collecting: `xs_ahead_said` from the first refresh after the push. The Audit view of the miss by distance follows once 100
  games have settled at each mark.

## Not in this plan

The Pro maximiser itself (a later feature that reads `xs_ahead`); national-team and cup games (no board, no model).
