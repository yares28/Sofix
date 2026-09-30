# Plan · Futbol Fantasy's lineups and start % in Sofix (T2)

Written 2026-09-30. It replaces the first draft (`plans/starts.md`), which wanted to compare the three sources for
weeks before showing any of them. You decided Futbol Fantasy (FF) is the main source, so that comparison moves to the
Audit page idea in [TODO.md](../TODO.md). Sibling plan: [xscore.md](xscore.md).

**Goal.** For every player you own, the "% he starts" that Sofix and the sorare.com overlay show is FF's, for the game
it is about. Where FF has nothing, it is Sorare's, then Sofix's own. The xScore, plans and captain are built on that
number. FF's full probable lineups get a new page and a new section on the home page, styled first on a design canvas
(/design). It is proven on the first LaLiga round after it ships; round 8 runs Fri 9 to Mon 12 Oct.

## Your decisions (2026-09-30)

| Question | Answer |
|---|---|
| Where FF's % is used | Everywhere: the % shown, the xScore, the plans, the captain |
| Fallback order | FF → Sorare → Sofix (Sofix knows least about injuries and team news) |
| Lineups page | Every match of the round, your players marked |
| Home section, under "Sorare" | All teams and their start %; your players' next-game %; the next matches, compact |
| Competitions | LaLiga, Champions League, Europa League, Copa del Rey (and the Supercopa when it is on). Not LaLiga 2 or the Premier League |
| European matches read and shown | Those with a LaLiga club or one of your players |
| Freshness | Extra runs before each lock, the Refresh button, and the extension reading FF live |
| Styling | Chosen on a design canvas before anything new on screen is built |

---

## 1 · What Futbol Fantasy gives (checked on its pages, 30 Sep)

- **Each team's next game only, per competition.** The LaLiga section is about each team's next LaLiga game. On 30 Sep
  Real Sociedad's page gave its percentages for round 8 at home to Deportivo (Sun 11 Oct), and listed its friendly
  (Fri 2 Oct) and its Europa League matchday 2 (Thu 15 Oct) separately. The Champions League, Europa League and Copa del
  Rey have their own sections, with their own pages and percentages.
- **When it changes.** The lineups are made by hand. FF's guide says a round's first lineups go up early in its week and
  change daily "as news, injuries, training, rehearsals or press conferences appear" until minutes before the round's
  first kickoff. You have seen a team's next lineup appear about a day after it played. Over an international break it
  is out early: round 8 was already up on 30 Sep, nine days ahead.
- **No time stamp for the lineup.** The "Últ. act." times on its pages belong to the fantasy games' market values. Sofix
  has to note for itself when a team's lineup changed, by comparing one read with the next.
- **One page per match, both teams** (`/partidos/<id>-<home>-<away>`):
  - **Lineup:** the XI placed on a pitch (x and y), then "Alternativas al once", ranked.
  - **Each player:** a %, one of 0, 5, 10, 20 … 90, 95 (never 100). Plus flags: an injury code, doubt, suspended,
    warned (4 yellows, with the count shown) and called up by his national team.
  - **Each team:** the coach, and a rotations level (5 steps, "Sin rotaciones" to "Rotaciones extremas"). Also this
    round's predictability (5 steps, "Muy previsible" to "Muy imprevisible") and its season predictability (how often FF
    has been right, e.g. 83% for both Real Sociedad and Deportivo).
  - **Squad news:** the injury list, with cause, since when and "doubt for round 8"; the suspensions; the squad list
    once the club publishes it.
- **Doubles.** A second name in grey under a starter means both may start, as much as 50/50 (33% if three). The %
  already says it.
- **Round pages.** They list the round's matches with kickoff and link. LaLiga round 8 has 10 matches, from Fri 9 Oct
  21:00 to Mon 12 Oct 21:00 Madrid. The Champions and Europa League pages list every match of the matchday (18 each, all
  clubs, Stuttgart included). On 30 Sep both still showed matchday 1, already played, so matchday 2's lineups are not
  out yet.
- **No FF at all for:** the Conference League, national teams outside tournaments, the Bundesliga, Croatia and
  Argentina. LaLiga 2 and the Premier League exist, but you chose not to use them.
- **Its own claim:** "over 86%" of its calls are right.
- **What production last read** (30 Sep, 14:56 UTC, read-only count): round 8, 515 players from 20 teams. Of those, 251
  are at 50% or more, 72 at 0%, 123 are called up by national teams and 2 are suspended.

## 2 · The rule for "% he starts"

For each of your players, and each of his games:

1. **FF**, when it has this exact game (same two teams, same competition, kickoff within a day of ours), its read of
   that game is under 24 hours old, and the game has not kicked off.
2. **Sorare's starter odds**, only for the game they are about (his next Classic fixture).
3. **Sofix's own**, from his form.

Around that:

- **Coming on as a substitute.** FF does not give this. It comes from Sorare's substitute odds, else from his form, for
  the part of the chance where he does not start. It is zero when FF has him injured, suspended or left out of the squad.
- **FF's 0% is an answer, not a gap.** 0% with no flag means he won't start but can still come on; 0% with an injury,
  a ban or no place in the squad means he won't play at all.
- **Two games in one gameweek** (LaLiga and the Europa League, say). Each game has its own chance and its own source.
  "Plays at least one" is 1 − (1 − p₁)(1 − p₂). The best-of-two lift uses the chance of playing both (p₁ × p₂), where
  `forecast.py` squares one number today.
- **The source goes with the number.** Every % carries its source (FF, Sorare or Sofix) and the time it was read. From
  FF it also carries a status line: doubt with X, injured (cause), suspended, warned, or not in the squad.
- **Plans, the captain and the xScore use the same number.** A plan can change when FF changes.
- **Unchanged:**
  - Early plans for rounds weeks away: FF only has each team's next game.
  - The replay of a kept week stays built from form. What FF said at the lock is kept in `start_chances` for the Audit.

## 3 · Steps

Two tracks run in parallel. The numbers switch first because they need no styling: the tile and Play already show the
published %. The page and the section wait for the design you choose.

### Now

**D · Design canvas (/design).** A claude.ai design canvas, as the overlay's was (O10). Boards:

- the Lineups page, desktop and phone;
- the home section, with its three parts;
- the % with its source on Play, Cards and the overlay hover;
- every state in section 4 that changes what you see.

You choose; the chosen look is saved as `docs/sorare/design/lineups.html`. Nothing new on screen (the page, the section,
the source labels) is built before that; only the numbers behind today's % change earlier.

**S1 · Read FF by match** (`backend/app/sources/futbolfantasy.py`)

- **What is read:**
  - the LaLiga round page and its 10 match pages;
  - the Champions and Europa League matchday pages, plus only the matches with a LaLiga club or one of your players'
    clubs;
  - the Copa del Rey pages (the Supercopa in January), plus the matches with a LaLiga club.
- **Mid-round.** A team whose listed game is already played is found through its team page's next-match link, which
  costs one extra page for that team.
- **Parsed per match:**
  - the FF match id, competition, round, kickoff, and both teams (FF's club id and name);
  - per team: the coach, rotations and predictability;
  - the XI (FF player id, name, x, y, %), the ranked alternatives, the flags, the injuries, the suspensions and the
    squad list.
- **Stored.** The `futbolfantasy` read model holds each match with its read time, plus each team's "changed at" (when
  this read differs from the last). It replaces today's 20 team-page reads: a LaLiga-only week is 11 pages instead of 21,
  lighter and tied to a game.
- **Unchanged limits:** a clear user agent, 2 s between pages, one retry, a time budget, stopping after three failures
  in a row. A read that fails never holds the run.
- **Tests:** trimmed copies of the real pages (round page, match page, team page, European page) as fixtures. A page
  without the expected attributes gives nothing, never a guess.
- **Done when** the fixtures give all 10 round-8 matches with 22 starters and their alternatives, and a real read gives
  the same shape.

**S2 · Link FF to our clubs and your players**

- **Clubs:** FF's club id (the number in its crest address; 16 is Real Sociedad) maps to our team registry through an
  alias table. European clubs are mapped only where needed.
- **Players:** FF's player id is linked to the Sorare slug by name within the club (the Understat matcher, `xg.find`,
  restricted to the club). A confirmed link is kept, so a player stays linked. Misses get hand-checked overrides.
  Unmatched names are listed on /control.
- **Traps already in your collection:**
  - FF's "Racing" is Racing Santander, not your Racing Club (Argentina) player.
  - FF's "Deportivo" is Deportivo de La Coruña, while Deportivo Alavés is "Alavés".
  - FF tells some players apart by nickname (`adama-traore-cachas`).
- **Done when** each of your players at a club FF covers is linked, or listed with the reason.

**S3 · Use it in the numbers** (`sorare/publish.py` `player_weeks`, `sorare/forecast.py`, `sorare/starts.py`)

- **The rule.** `PlayerWeek` carries a start chance per game, with its source; `forecast` applies section 2's rule; two
  games are combined per game.
- **Payloads.** Per player and per game: `pStart`, `startSource`, `startAt`, `ffStatus` and `ffMatch` (id and link).
  The overlay's answer gives the % of the game the tile shows. Today it is one % per week (`lib/overlay.ts`,
  `shownGame`); that has to become per game.
- **The record.** `start_chances` keeps one row per player, game and source, with FF's read time, frozen at the lock as
  today. That is the Audit's data. No migration: it all lives in read models.
- **Rules.** AGENTS.md's Futbol Fantasy row changes: FF is now on screen.
- **Tests first:**
  - FF beats Sorare, which beats form.
  - A European game FF has not published falls back while his LaLiga game uses FF.
  - 0% when injured gives no chance of coming on.
  - A read over 24 hours old falls back.
  - A game that has kicked off does not use FF.
  - Two games with different sources combine correctly.
  - A plan changes when FF changes.
- **Done when** a run's payload has FF's % for each of your players with a round-8 game, and Play and the overlay show
  it (the numbers, not yet the labels).

**S4 · Extra runs before locks** (`.github/workflows/near-lock.yml`)

- **What it does.** Every 30 minutes a small job asks Sorare's public API for the next lock: one query, no database
  wake-up. When the lock is under 3 hours away and no refresh started in the last 25 minutes, it starts the refresh
  workflow. It uses a manual start with the workflow's own token, which GitHub allows between workflows.
- **Cost.** The repo is public, so the minutes are free. The odds call stays throttled to 6 hours, so no extra Odds API
  credits. Each extra run costs a little Neon compute.
- **Done when** a lock day shows runs about every 30 minutes over the last 3 hours.

Target: S1 to S4 before round 8's lock (Fri 9 Oct), so the numbers switch for round 8; D runs alongside.

### After the design is chosen

**S5 · The pages**

- **`/lineups`**, a new page in the top bar:
  - tabs per competition, and matches by kickoff;
  - for each match, both XIs on the pitch with their %, the alternatives, the injuries, suspensions and warnings, the
    rotations and predictability;
  - your players marked with their card;
  - "FF read 14:07 · this team changed 11:40", and a link to FF's match page ("Source: Futbol Fantasy").
- **Home, under "Sorare":** all teams' start %, compact; your players' next-game %, with what changed since the last
  read; the next matches, compact, opening /lineups.
- **Play, Cards, Players:** the % with its source wherever a start chance shows. Play's cards say "plays 80%" today
  (starting or coming on); the design decides how FF's "starts" sits beside it.
- **The overlay:** the tile keeps its place. The hover names the source and when it was read, and gives FF's status
  line.
- **Checks:** vitest for the page's helpers, the overlay e2e, `npm run design`, and desktop and phone screenshots of each
  state.

**S6 · Refresh button.** The button and its walkthrough on /control already exist (`frontend/app/api/refresh/route.ts`,
10-minute cooldown). It needs the GitHub key in Vercel (your item 2). Check that it starts a run.

**S7 · The extension reads FF live**

- **What it does.** While a sorare.com page is open, the extension reads the FF match pages of the players on screen, at
  most once every 10 minutes per match. The job publishes each player's FF match and FF player id for this. The tile
  redraws with the new %.
- **What stays.** The plan's marks (ticks, captain) stay from the last run, and the hover says so: "FF live 3 min ago ·
  plan from 14:07".
- **One formula.** The % → xScore arithmetic has to match the job's exactly: one file of test cases that both the
  Python and the JavaScript tests read.
- **Permissions.** futbolfantasy.com joins the extension's host permissions (`manifest.template.json`). The MV3 worker
  has no HTML parser, so it reads the same attributes the job reads.
- **Limits.** It only reads, and it stops when the overlay switch is off.
- **Done when** an FF change reaches the tile within 10 minutes with the page open.

**S8 · Docs.** AGENTS.md (the Futbol Fantasy row: on screen, pages read, how often, the extension's reads), the manual
(the %'s source, the Lineups page, the home section), `docs/how_it_works.md` (the rule), TODO.md.

## 4 · Edge cases

**Which game FF means**

| Case | What Sofix does |
|---|---|
| A friendly, a national-team game, a Conference League game | No FF: Sorare, then form |
| Two games in one gameweek (LaLiga and Europe) | Each game its own chance and source; FF for each game it has |
| FF has not published a team's next game yet (about a day after its last one; European pages move on around their matchday) | "Not published yet" on /lineups; the % falls back |
| Mid-round, some teams already on their next game | Their next match comes from their team page |
| A weekend round then a midweek round, with a lock between | A team that plays on Monday night may have no FF for Wednesday before a Tuesday lock: falls back, visibly |
| A postponed or moved game (round 6's single game on 21 Oct) | Matched by teams and competition with the kickoff within a day; our date is the one shown |
| Kickoff "Date TBC" (rounds 11 and 12 still sit at 00:00 in our fixtures) | Matched by teams and round |
| The game has kicked off | FF no longer used; /lineups marks it started, then played |
| International break | FF already has the next LaLiga round; the gameweek's national games use Sorare, then form; /lineups and home show the LaLiga round ahead with its date |
| A cup game Sorare does not count | Shown on /lineups only; plans follow Sorare's own game list (the existing rule) |
| The second and third open Sorare gameweeks, and early plans for later rounds | No FF: it only has each team's next game |
| A Sorare gameweek with two LaLiga rounds | Already one week per round (since 28 Sep); FF is per match anyway |

**Timing and freshness**

| Case | What Sofix does |
|---|---|
| FF changes after the last read before the lock | Near-lock runs (S4), the Refresh button (S6), live reads on sorare.com (S7); every % shows when it was read |
| FF changes after the lock | /lineups keeps updating until each kickoff; the Audit keeps the number at the lock |
| FF cannot be read (blocked, 403/429, a redesign) | The last read is used up to 24 hours old, then the fallback; "Futbol Fantasy couldn't be read at 14:07" |
| A read that got only some matches (time budget) | The others keep their earlier read, with its age, until 24 hours |
| GitHub starts a scheduled run late | The Refresh button and the live reads cover it |
| A live read fails in your browser | The tile keeps the job's %, with its read time |

**Identity and matching**

| Case | What Sofix does |
|---|---|
| Club names that collide (Racing, Deportivo, Real, Atlético/Athletic) | Clubs matched by FF's id and our aliases, never by name alone |
| Player names: accents, nicknames (Angeliño), short names (Oyarzabal), one name at two clubs | Matched within the club; confirmed links kept; overrides; an unmatched player falls back, never a guess |
| A transfer or loan (summer and January) | The link follows FF's player id; a club mismatch is flagged, not used silently |
| One player on several of your cards | One % per player |
| A new season (promoted clubs; FF's addresses carry the season, e.g. `laliga-26-27`) | The yearly rollover adds the new clubs' FF ids |
| A player FF does not list (youth, new signing, long injury) | Falls back; /lineups lists him under his club as "not in FF's list" if he is yours |

**What the % means**

| Case | What Sofix does |
|---|---|
| 0% and no flag | Won't start; can still come on |
| 0% and injured, suspended or out of the squad | Won't play at all |
| A double (two players about 50%) | Each keeps his %; "doubt with X" |
| Warned (one yellow from a ban) | No change now; shown, since a card could cost the next gameweek |
| Called up during a break | Already in FF's %; the flag is shown |
| A second goalkeeper at 0–5% | Almost no chance of coming on |
| FF never says 100% | 95% is used as it is |
| A captain choice that FF moves | The plan's captain can change between runs |

**Fallbacks**

| Case | What Sofix does |
|---|---|
| Sorare's starter odds have never reached the record (0 of 30 rows) | S3 logs, every run, how many of your players have Sorare odds. If Sorare never gives them, the fallback is in practice FF → Sofix. The first run answers it (the session that wrote this plan could not reach Sorare's API) |
| Sorare's odds cover his next Classic fixture only | Used for that game only |
| One lineup mixing sources | Each card shows its own source |

**Display**

| Case | What Sofix does |
|---|---|
| /lineups and the week picked in the app (one date drives the app) | The page shows the next games; a past or far week says FF only covers each team's next game |
| A big page (10 matches, two XIs, alternatives, injuries) | The design decides what folds away, above all on a phone |
| The overlay on an old gameweek's page | No FF (those games are over), as today |
| The overlay's tile | The % of the game the tile shows |
| Attribution | Every FF number links to FF's match page; "Source: Futbol Fantasy" |

**Load and politeness**

| Case | What Sofix does |
|---|---|
| Pages of about 2.2 MB | 11 per LaLiga read, down from 21; up to about 9 European and a few cup pages in those weeks |
| More reads than today | About 6 scheduled runs a day, up to 6 more before each lock, and the live reads (at most one per match every 10 minutes, only with a sorare.com page open). A few hundred pages a week; conditional requests if FF supports them |
| FF redesigns its pages | No numbers rather than wrong ones; /control says "FF read: 0 matches"; the fixtures pin today's format |
| The unattended job cannot change the schema | Nothing needs a migration |

**The record, for the Audit**

| Case | What Sofix does |
|---|---|
| What each source said at the lock | `start_chances`: one row per player, game and source, with FF's read time |
| Whether he started, with two games in the week | Settled per game, not per gameweek window |

## 5 · Proof on the next LaLiga round

**Round 8** runs from Fri 9 Oct 21:00 Madrid (Málaga–Espanyol) to Mon 12 Oct 21:00 (Levante–Sevilla). If S1–S4 are not
live before its gameweek locks, the test moves to round 9 (Fri 16 – Mon 19 Oct).

Before the lock:

1. Play and the overlay give FF's % for each of your players with a round-8 game. Check five by eye against FF's
   pages; on 30 Sep Oyarzabal was at 90%.
2. /control lists any FF name not linked, and none of your LaLiga players is missing without a reason.
3. Your players FF does not cover (Bundesliga, Premier League, LaLiga 2, Croatia, Argentina) show Sorare's or Sofix's
   %, with the source.
4. The near-lock runs fired over the last 3 hours, and each % shows its read time.
5. Where FF's % differs from the old one, the plan differs too.

During and after:

6. A game that has kicked off stops using FF.
7. A day after the round, `python -m app.jobs.starts` shows settled rows for FF, Sorare and Sofix.

In midweek, FF's % is used for the Champions and Europa League matchday 2 games once FF publishes them (Real Sociedad
plays on Thu 15 Oct).

- **After S5:** the page and the section are checked against the chosen design on the next round.
- **After S7:** an FF change reaches the tile within 10 minutes.

## 6 · What it costs

| | Today | With this plan |
|---|---|---|
| FF pages per read | 21 (team pages) | 11 on LaLiga-only weeks; up to about 25 with European and cup matches |
| FF reads | At most every 6 h (45 min near a lock) | Every run, plus the near-lock runs, plus live reads from your browser |
| GitHub Actions | About 6 runs a day | Up to 6 more per lock day, plus a 30-minute check; free (public repo) |
| The Odds API | 6-hour throttle | The same; no extra credits |
| Neon | Current use | A few more CU-hours a month (limit 100) |
| Sorare API | One sync per run | The same per run, more runs; a single query for each 30-minute check |
| Vercel | No change | No change (the live reads run in your browser) |

## 7 · Still to find out while building

These are questions for FF's and Sorare's pages, not for you:

- What a match page shows after kickoff (the real XI?).
- How the round page moves to the next round, and the team page's next-match link.
- The Copa del Rey and Supercopa addresses, and which matches they cover.
- Whether Sorare gives starter odds for your players at all (0 of 30 so far).
- Whether FF answers conditional requests (ETag / Last-Modified).
- Whether FF answers GitHub's runners and your browser the same way.

## 8 · What the first draft planned that is gone, and why

- **Weeks of comparison before showing FF.** Your decision; the comparison lives on the Audit page instead.
- **Recalibration, weighted blends, gameweek resampling.** Audit material; not needed to hit the goal.
- **A shared migration with the xScore plan.** Not needed: everything here lives in read models.
