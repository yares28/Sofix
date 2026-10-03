# Plan · Futbol Fantasy's lineups and start % in Sofix (T2)

Written 2026-09-30. It replaces the first draft (`plans/starts.md`), which wanted to compare the three sources for
weeks before showing any of them. You decided Futbol Fantasy (FF) is the main source, so that comparison moves to the
Audit page idea in [TODO.md](../TODO.md). Sibling plan: [xscore.md](xscore.md).

**What is left of this plan is scheduled in [roadmap.md](roadmap.md) (2 Oct 2026):** the checks of section 9 that wait for round 8
are its batch 2 (dated), the rest of the live pass is its step 0.2. This file keeps the design, the rules and the results below.

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
  - **Each player:** a %, one of 0, 5, 10, 20 … 90, 95 (never 100); his age; an injury code (-1 nothing, 0 out, 1 a
    doubt, 2 a knock he is available despite); suspended; called up by his national team; and his yellow and red cards
    for the season. The eleven also says which one keeps goal; the alternatives do not.
  - **Each team:** the coach, and a rotations level (5 steps, "Sin rotaciones" to "Rotaciones extremas"). Also this
    round's predictability (5 steps, "Muy previsible" to "Muy imprevisible") and a season predictability, a share of how
    predictable its lineups have been this season (83% for both Real Sociedad and Deportivo). It is a gauge of the
    team, not a count of how often FF was right.
  - **Squad news:** the injury list, with cause, since when and "doubt for round 8"; the suspensions; the squad list
    once the club publishes it.
- **The alternatives are nearly the whole squad.** Below the eleven the page lists about 15 more players in order of
  likelihood, each with his %: on the ten round-8 pages the two lists together named 515 players (25 to 30 a club), so
  almost everyone at a club is found in them. The injury lists repeat players by their profile address (71 of 72 were
  also in the eleven or the alternatives), which is how an injury is joined to the person it is about.
- **Round pages.** They list the round's matches with kickoff and link. LaLiga round 8 has 10 matches, from Fri 9 Oct
  21:00 to Mon 12 Oct 21:00 Madrid. The Champions and Europa League pages list every match of the matchday (18 each, all
  clubs, Stuttgart included). On 30 Sep both still showed matchday 1, already played, so matchday 2's lineups are not
  out yet.
- **No FF at all for:** the Conference League, national teams outside tournaments, the Bundesliga, Croatia and
  Argentina. LaLiga 2 and the Premier League exist, but you chose not to use them.
- **Its own claim:** "over 86%" of its calls are right.
- **What production last read** with the old team-page reader (30 Sep, 14:56 UTC, read-only count): round 8, 515
  players from 20 teams. Of those, 251 are at 50% or more, 72 at 0%, 123 are called up by national teams and 2 are
  suspended.
- **Names and identities** (checked on the ten round-8 pages against your 84 cards):
  - A player's number is the one in his shirt's class and in his photo's address (`jugador_2675`, `.../ficha/2675.png`).
    It is stable; his spelling is not. Profile addresses lose accented letters (`lvaro-nunez`, `arda-gler`), so names
    are read from the page's own label, which keeps them (`Álvaro Núñez`).
  - FF writes names the way a fan does: `Isco Alarcón`, `Mat Ryan`, `Javi Galán`, `Álex Grimaldo`, `Georgiy Tsitaishvili`
    (Sorare: `Isco` over `francisco-roman-alarcon-suarez`, `Mathew Ryan`, `Javier Galán`, `Alejandro Grimaldo`,
    `heorhii-tsitaishvili`). Two Williams play at Athletic. "Racing" is Racing Santander and "Deportivo" is La Coruña.

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
  FF it also carries a status line: doubt, injured (cause, since when), suspended, called up, and his cards. "Not in the
  squad" needs the club's match squad, which the page lists only once the club names it: not read yet.
- **Plans, the captain and the xScore use the same number.** A plan can change when FF changes.
- **Unchanged:**
  - Early plans for rounds weeks away: FF only has each team's next game, so those rounds stand on form. The one
    exception is the round FF does hold (today round 8): its early plan takes FF's chance and leaves out anyone FF has
    out or suspended (1 Oct review, R1).
  - The replay of a kept week stays built from form. What FF said at the lock is kept in `start_chances` for the Audit.

## 3 · Steps

Two tracks run in parallel. The numbers switch first because they need no styling: the tile and Play already show the
published %. The page and the section wait for the design you choose.

**Status, 30 Sep, 1 Oct and 2 Oct (all on `main` and in production since 1 Oct):**

| Step | State |
|---|---|
| D · Design canvas | Done: the boards were chosen (Lineups A, Home, the % source B, the overlay, the states) |
| S1 · Read FF by match | Done: parser, reader and fixtures of the real pages; 240 s budget; one unparseable page costs only its match |
| S2 · Link FF to your players | Done: all 74 of your cards at the 20 LaLiga clubs link to the right person on the real pages (72 by name, 1 by a short first name, 1 by surname and age) |
| S3 · The numbers | Done in the job, the page and the overlay's answer |
| S4 · Near-lock runs | On main, listed in Actions as "Refresh near a lock"; the first lock it can act on is Fri 9 Oct (C9) |
| S5 · The pages | Done: `/lineups` (desktop and phone), the Home's team news, the FF / SO / SF marks on Play's cards, the overlay's new tile and panel. Also each LaLiga club's squad page, read once a week, so every alternative sits under his own line |
| S6 · Refresh button | Done: the button shows on /control (2 Oct), so the GitHub key is in Vercel; pressing it once is the roadmap's step 0.1 |
| S7 · The extension reads FF live | Built, but **it does not work on the live site** (found 3 Oct, C19): the real page writes `data-onceFF` with capitals and the extension's reader looks for small letters, so it finds no player. The fix is the overlay plan's O12 (roadmap 9.1). C18 passed |
| S8 · Docs | Done: AGENTS.md, the manual, `docs/how_it_works.md`, TODO.md |

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

**S2 · Link FF to our clubs and your players** (`sorare/ff_link.py`)

- **Clubs:** FF's club id (the number in its crest address; 16 is Real Sociedad) is in our team registry for the twenty
  LaLiga clubs, and the registry decides by identity whenever it knows either club. Clubs it does not know (abroad,
  the lower divisions of the cup) are told apart by their words ("Stuttgart" is "VfB Stuttgart"; "Real" alone is nobody).
- **Players:** inside one club's side of one match, never across the league, in this order, each step used only when the
  one before found nobody: a hand-checked override; a link found on an earlier run that still looks like him; the same
  name; one name inside the other's words, the Sorare slug's included; the same surname and a short form of the first
  name ("Mat", "Javi", "Álex"); and only with both ages to check, the surname alone. Age (a year either way) and the
  goalkeeper's gloves veto any step. Two candidates, or two of your cards coming out as one person, are left unlinked.
  The links found are kept (`ff_links`).
- **Reported, not guessed:** who could not be linked, and why, is in each run's summary (`futbolfantasy.unlinked`).
  /control shows it when the page work (S5) lands.
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
  - tabs per competition, and matches by kickoff; picking one switches on the client from the payload the page holds, with `?m=` kept in
    the address through `history.pushState` (`components/lineups/LineupsView.tsx`, `switchTo`; 1 Oct review, R27);
  - for each match, both XIs on the pitch with their %, the alternatives, the injuries, suspensions and warnings, the
    rotations and predictability; the alternatives sit under the starter's own card as the page draws them (`juggadores` inside his
    wrapper: `pos-0` himself, `pos-1`, `pos-2` who can come in for his slot, one player under several slots; `Player.next` in the parser,
    `next` ids in the payload, 2 Oct review follow-up);
  - every player drawn as his real Sorare card (yours with the blue ring, the others a real Limited card of this season kept by the job in
    `sorare_card_art` and sent as the payload's `art`; a skeleton with his name while it loads; FF's photo or a silhouette when Sorare has
    none), every club as its crest on a shield in its colour, the call-up as the country's two letters on a blue chip (`status.nat`), and a
    key to the colours of the % under the match head (2 Oct review, batch 4);
  - your players marked with their card, listed first on each match (a strip with the "Only my players" switch), and each one a link to his
    tile on /cards (`/cards#p-<player slug>`); in return a card in a Play lineup sheet links to its match here (`/lineups?m=<id>`, from the
    `ffMatch` of his game; none for a game FF has no page for);
  - "FF read 14:07 · this team changed 11:40", and a link to FF's match page ("Source: Futbol Fantasy").
- **Home, under "Sorare":** all teams' start %, compact; your players' next-game %, with what changed since the last
  read; the next matches, compact, opening /lineups.
- **Cards** shows under each card his next game and the three sources' chances (FF / SO / SF, the one in use darker), from the planned
  weeks' `sources`; **Players'** "Projected —" is Sorare's own number and says why it is empty.
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
| The second and third open Sorare gameweeks, and early plans for later rounds | FF only for the games it holds (each team's next game): a weekend round that sits in an opened week ahead during a break takes it, every other game stands on form |
| The early plan for the round FF holds (a round before Sorare opens its gameweek, e.g. round 8 during a break) | FF's chance, with its mark and read time; anyone out or suspended is in no lineup. That plan is made again every run, as FF's lineups move; rounds after it keep form |
| A Sorare gameweek with two LaLiga rounds | Already one week per round (since 28 Sep); FF is per match anyway |

**Timing and freshness**

| Case | What Sofix does |
|---|---|
| FF changes after the last read before the lock | Near-lock runs (S4), the Refresh button (S6), live reads on sorare.com (S7); every % shows when it was read |
| FF changes after the lock | /lineups keeps updating until each kickoff; the Audit keeps the number at the lock |
| FF cannot be read (blocked, 403/429, a redesign) | The last read is used up to 24 hours old, then the fallback; "Futbol Fantasy couldn't be read at 14:07" |
| A match page the site answers 404 for (no longer on the site; seen in the 1 Oct refresh run: `22568-compostela-deportivo` and `22371-celta-sporting-cp`) | The site answered, so it is not a failed read: the match leaves the stored feed (`Reading.gone`), nothing goes under `failed`, and the Lineups header does not say FF could not be read. It does not count towards the three-pages-in-a-row stop. A round page still linking to it costs one 404 at each run. Only a match page: a 404 on a round or squad page, and every 403, 429, 5xx, time-out or non-lineup page, stay failed reads |
| A competition with no round yet (the Copa del Rey before its draw: "El calendario aún no se ha sorteado"); its page still carries a sidebar of other competitions' matches | The round page's matches are read from its own area (`<main>`) only, so such a page lists none and nothing is asked for. Until 2 Oct 2026 the sidebar's 76 matches (July friendlies dated 2027 for want of a year) were read: 50 dead pages and a standing `failed` list in every run (seen in production's `futbolfantasy` read model) |
| A read that got only some matches (time budget) | The others keep their earlier read, with its age, until 24 hours |
| GitHub starts a scheduled run late | The Refresh button and the live reads cover it |
| A live read fails in your browser | The tile keeps the job's %, with its read time |

**Identity and matching**

| Case | What Sofix does |
|---|---|
| Club names that collide (Racing, Deportivo, Real, Atlético/Athletic) | Clubs matched by FF's id and our aliases, never by name alone |
| Player names: accents, nicknames (Angeliño), short names (Oyarzabal), one name at two clubs, two players of one surname (the Williams) | Matched within the club; confirmed links kept; overrides; an unmatched player falls back, never a guess |
| Sorare spells a name FF does not (Heorhii/Georgiy, Ionuț/Ionut, Take/Takefusa Kubo) | The slug's words count as well as the display name, then the surname with both ages; otherwise unlinked and reported |
| The injury list names a player the eleven and the alternatives do not (1 of 72 on the round-8 pages) | He stands alone, found by his profile address; a player only there has no % unless he is out |
| A transfer or loan (summer and January) | The link follows FF's player id; a club mismatch is flagged, not used silently |
| One player on several of your cards | One % per player |
| A new season (promoted clubs; FF's addresses carry the season, e.g. `laliga-26-27`) | The yearly rollover adds the new clubs' FF ids |
| A player FF does not list (youth, new signing, long injury) | Falls back; /lineups lists him under his club as "not in FF's list" if he is yours |

**What the % means**

| Case | What Sofix does |
|---|---|
| 0% and no flag | Won't start; can still come on |
| 0% and injured, suspended or out of the squad | Won't play at all |
| Two players of one place, each at about 50% | Each keeps his % |
| His yellow and red cards for the season | Kept and shown; nothing is inferred about a ban (the page says who is suspended) |
| Called up during a break | Already in FF's %; the flag (`data-internacional`, a national-squad call-up, not the club's match squad) is shown only once the club has named its squad, so it never sits beside "Squad list not out" (1 Oct review, R8) |
| A second goalkeeper at 0–5% | Almost no chance of coming on (a goalkeeper's prior is 2%) |
| Only the eleven says who keeps goal | The keeper check (a keeper is never an outfield card and the reverse) only applies to players of the eleven |
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
| /lineups and the week picked in the app (one date drives the app) | The page shows the next games; a past, later or national-team week (`?w=`) says FF only covers each team's next game and what that week is; an unknown `?m=` says the match is no longer on FF. The header names the LaLiga round, its days and the Sorare week it feeds, with a link to Play (1 Oct review, R4 R5) |
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

**Answered on 1 Oct while building S5 to S7:**

- **Where each player plays.** The match page does not say for anyone outside the eleven. Each club has a squad page,
  `/laliga/equipos/<club>/plantilla` (the club's address is the `slug` its match sides already carry), which lists every
  player by position (goalkeepers, defenders, mediocampistas, forwards, then those on loan) with the same number as the match
  pages (in his photo's address, `ficha/<number>.png`) and his profile address. It is read once a week (`ff_lineups`).
- **Photos and crests.** A player's photo is `https://static.futbolfantasy.com/uploads/images/jugadores/ficha/<number>.png`
  (checked: it answers 200, image/png; the site's own thumbnails sit on `media.futbolfantasy.com/thumb/150x150/v<version>/…`
  with a version that changes). A club's crest is `…/equipos/escudom/<club number>.png`. Both are hot-linked, and the
  Content-Security-Policy lets the page load them.
- **What a browser can read.** The extension's worker reads the match page with `host_permissions` for
  `futbolfantasy.com/partidos/*` and no credentials; the chance and the injury code are in attributes of each player's shirt
  (`data-probabilidad`, `data-lesion`), which `core.ffPlayersOf` reads without an HTML parser and which agrees with the job's
  parser on all 22 starters of the saved page.

## 8 · What the first draft planned that is gone, and why

- **Weeks of comparison before showing FF.** Your decision; the comparison lives on the Audit page instead.
- **Recalibration, weighted blends, gameweek resampling.** Audit material; not needed to hit the goal.
- **A shared migration with the xScore plan.** Not needed: everything here lives in read models.

## 9 · Checks still to run (for someone with access)

The session that built S1–S4 (30 Sep) could not reach Sorare's API, Futbol Fantasy, Sorare's image hosts or the owner's
browser from its container. These checks need that access. Each says what it proves, how to run it and what passes. Run
them against the branch `claude/amazing-lovelace-8pxz0r` (or main once it is merged), never write to production Neon
(read-only `SELECT`s only), and write each result under "Results" at the end of this section: the date, pass or fail,
and the numbers or output that show it.

**Before the round-8 lock (Fri 9 Oct)**

| # | What it proves | How | Passes when |
|---|---|---|---|
| C1 | The job reads Futbol Fantasy for real, all ten round-8 matches | With the backend's `.env` (`POSTGRES_URL`, `SORARE_API_KEY`): `cd backend && python -m app.jobs.sorare --dry-run --runs 3`. Read `futbolfantasy` in the printed summary | `read` is 10 (LaLiga round 8), `failed` is empty or only European/cup round pages with no match, no `stopped` |
| C2 | Sorare's names for the round-8 games meet Futbol Fantasy's matches | Same summary: `futbolfantasy.noMatch` and `futbolfantasy.games` | `noMatch` lists no round-8 LaLiga game; `games` equals the number of your players' LaLiga games in the gameweek being planned (the week must be round 8's: check `gameweek` in the summary) |
| C3 | Every one of your LaLiga players is linked | Same summary: `futbolfantasy.linked` and `futbolfantasy.unlinked` | `unlinked` is empty, or each entry is a player Futbol Fantasy really does not list (check on his club's match page). A wrong or missing link gets a hand-checked entry in `OVERRIDES` (`backend/app/sorare/ff_link.py`: Sorare slug → the number in his photo's address on the match page) |
| C4 | Whether Sorare ever gives starter odds for your players | Same summary: `sorareOdds` | Report the two numbers. If `withOdds` is 0 again, say so: the fallback is then Futbol Fantasy → Sofix in practice (section 4, "Fallbacks") |
| C5 | Five numbers by eye | Open Play for the gameweek of round 8 and five of your players' match pages on futbolfantasy.com (e.g. Oyarzabal, Take Kubo, Iago Aspas, Iñaki Williams, Ionuț Radu) | Each player's chance of starting on the overlay's hover / in the page payload (`games[].pStart`, `startSource: "futbolfantasy"`) equals the site's percentage read at the time in `startAt` |
| C6 | The plan moves with the site | Pick one of your players whom Futbol Fantasy has at 0–40% or out. Compare Play's plan before and after the switch (the last production run before the merge vs the first after) | His `p` fell with the site's number, and a player the site has out is in no lineup |
| C7 | The overlay shows the game's own number | On sorare.com with the extension on, a gameweek page with one of your round-8 players | The tile's start chance is Futbol Fantasy's for that game (compare with C5) |
| C8 | Futbol Fantasy answers GitHub's runners | After the merge, start "Scheduled refresh" by hand (Actions → Run workflow, trigger `cli`) and read the Sorare step's summary in the log | `futbolfantasy.read` ≥ 10 and no `HTTP 403`/`HTTP 429` in `failed`. If the site refuses the runners, say so: the numbers would then only come from the extension's live reads (S7) |
| C9 | The half-hourly check starts runs near a lock | After the merge, on Fri 9 Oct: Actions → "Refresh near a lock" and "Scheduled refresh" | "Refresh near a lock" runs every ~30 min all day; in the three hours before the lock its log says "Started a refresh" about every 30 minutes and a "Scheduled refresh" run follows each (trigger `schedule`); before that it says the lock is more than 3 h away. **Early result, 2 Oct 2026: it does not run that often.** GitHub started it 6 times in 26 hours (1 Oct 08:21, 15:44, 21:17; 2 Oct 01:20, 04:26, 10:51), none in the three hours before that day's 16:00 lock, and the 14:07 scheduled refresh did not run either. The page stayed the 10:30 one until a refresh was started by hand at 15:25. See roadmap 2.2b. |
| C10 | What was stored | Read-only SQL on Neon: `SELECT key, length(payload::text), updated_at FROM read_models WHERE key IN ('futbolfantasy','ff_links','start_chances');` then `SELECT jsonb_object_keys(payload->'matches') FROM read_models WHERE key='futbolfantasy';` | `futbolfantasy` has `"version": 2` and the ten round-8 match ids (22493–22502); `ff_links` has one entry per linked player; `start_chances` has `games` entries for the round-8 gameweek with `sorare`, `sofix` and `futbolfantasy` keys |

**During and after round 8**

| # | What it proves | How | Passes when |
|---|---|---|---|
| C11 | A game that has kicked off stops using the site | After Málaga–Espanyol (Fri 21:00 Madrid) and before the last game, look at a player of a finished match in the page payload | His finished game has no `startSource: "futbolfantasy"`; the games still ahead keep it |
| C12 | The record is settled game by game | A day after round 8 ends (Tue 13 Oct evening): `cd backend && python -m app.jobs.starts` | Settled rows for all three sources; `futbolfantasy` has n ≥ 30 |
| C13 | European games use the site once it publishes them | Thu 15 Oct (Real Sociedad plays in the Europa League): dry run as in C1 on Wed 14 or Thu 15 Oct | The Europa League match is in `futbolfantasy.read`; Real Sociedad players' Europa game has `startSource: "futbolfantasy"` |

**Added on 1 Oct, for S5 to S8 (run them after the merge and one real refresh)**

| # | What it proves | How | Passes when |
|---|---|---|---|
| C14 | The squad pages read from GitHub's runners, for all twenty clubs | The first refresh after the merge, then read-only SQL: `SELECT jsonb_object_length(payload->'squads'), jsonb_object_length(payload->'positions') FROM read_models WHERE key='ff_positions';` and the run's summary `lineupsPage` | 20 squads and at least 500 positions; `squadsFailed` absent. If the site refuses the runners (HTTP 403/429), say so: the Lineups page then places only players who have been in an eleven |
| C15 | The Lineups page on production | Open `/lineups` on a desktop and a phone after a run; the browser's console open | Ten round-8 matches in the bar; both elevens as cards with their chance; your players outlined with their Sorare art; alternatives under lines with few or none under "Others in the squad"; no Content-Security-Policy error in the console |
| C16 | Crests and photos load | The same page | LaLiga crests from football-data, a European opponent's from `static.futbolfantasy.com`, FF's photos on the cards you do not own; if any is refused or missing, say which host (Q7) |
| C17 | The Home's team news | Open `/` after the first real run, then again a day later | The tile shows the split (its numbers add up to "of your players have an FF chance"), the plan's starters under 70%, and, from the second day, "Moved since yesterday" with real moves (SQL: `SELECT jsonb_array_length(payload->'readings') FROM read_models WHERE key='ff_chances';` is 2 or more) |
| C18 | The overlay on a real Sorare page | sorare.com with the extension: a lineup page, a list to pick from, the compose page | Tiles show the mark (FF, SO or SF) and the amber or red row when it applies; the panel shows the plan chip, Starts / Benched, the chance with "START · FF", the three numbers, and SOURCES folded; nothing overlaps Sorare's own chips |
| C19 | The extension's live read | Rebuild and reload the extension (`node extension/scripts/configure.mjs`, then reload it in `chrome://extensions`, accepting the new site). Open Sorare's lineup page with a player of a round-8 match. In the service worker's Network panel, watch futbolfantasy.com | One request per match page, not more often than every 10 minutes per match and two seconds apart; the tile redraws and the panel says "FF live N min ago"; change the match's lineup on the site's side (or wait for it to change) and the tile follows within about 15 minutes. If the site answers the browser with an error or a block page, say what it returned |
| C20 | The refresh still fits its time | Actions → "Scheduled refresh" after the merge | The run ends well inside its 15-minute limit with the squad pages read on the first run and not on the next |
| C21 | Alternatives are under the right line | Five alternatives on `/lineups`, each against his club's squad page on Futbol Fantasy | Every one is under the line his squad page gives him |

**Questions about the site and Sorare (answers go into section 7)**

| # | Question | How |
|---|---|---|
| Q1 | What a match page shows after kickoff (the real XI? the same percentages?) | Open a round-8 match page during and after the game; save the HTML |
| Q2 | When the LaLiga round page moves to round 9, and what a team page shows in between | Open `https://www.futbolfantasy.com/laliga/posibles-alineaciones` on Sat 10, Mon 12 and Tue 13 Oct; note the round it shows. Open a team page that has played (e.g. Rayo's on Sat 10 evening): does "Próximos partidos" link to its round-9 match with lineups already? |
| Q3 | The cup and Supercopa addresses | Do `https://www.futbolfantasy.com/copa-del-rey/posibles-alineaciones` and `/supercopa-espana/posibles-alineaciones` exist, and which matches do they list? |
| Q4 | Conditional requests | `curl -sI` a match page twice: is there an `ETag` or `Last-Modified`, and does `If-None-Match` answer 304? **Answered 2 Oct 2026: no.** Two `HEAD` requests four seconds apart to the LaLiga round page: `200`, no `ETag`, no `Last-Modified`, `Cache-Control: no-cache, private` and `max-age=0`, `Expires` set to the second the answer was made. The pages are built on each request and say they may not be reused, so there is nothing to ask conditionally; the reads stay as throttled as they are. |
| Q5 | The match squad ("Convocatorias") | On a match page on matchday, where is the squad list once the club publishes it, and what markup holds it (needed for "not in the squad") |
| Q6 | A Sorare card picture for any player, not only the owner's (today the page draws a neutral card with FF's photo for the cards you do not own) | In Sorare's schema (`https://api.sorare.com/graphql/schema`), find a field that gives a player's card art without owning a card (for example a sample card per rarity or season). The Lineups page draws every starter as a card; today only the owner's cards have a picture (`collection[].pic`) |
| Q7 | Club crests for every club on the page | Sorare's club `pictureUrl` (already hot-linked by the app) for the 20 LaLiga clubs and any European opponent; or Futbol Fantasy's `escudom/<id>.png`. Say which is allowed to be hot-linked (AGENTS.md: third-party art is hot-linked, personal use) |

**Results**

Read on 2 Oct 2026 from refresh #42 (run by hand on `main`, GitHub's runner, 8 min 18 s; its log summary) and read-only `SELECT`s on the
read models.

| # | Result | What was seen |
|---|---|---|
| C1 | pass, with a finding | `futbolfantasy.matches` 10, no `stopped`. `read` was 30, not 10: the job also asked for about eighty pages of old pre-season friendlies, because the Copa del Rey page's sidebar was read as its matches (fixed 2 Oct: `parse_round` reads only the page's own area; the real page now gives 0 matches instead of 76, and LaLiga 10, Champions 18, Europa 18 as before). |
| C2 | pass | No `noMatch` in the summary. The planned week was GW19 (national teams), so `games` is 0 and the comparison with round 8's games waits for GW21's plan (calendar 2.3). |
| C3 | pass | `unlinked` is empty. |
| C4 | reported | `sorareOdds`: 14 players, 0 with Sorare's starter odds (a national-team week): the order is Futbol Fantasy → Sofix in practice. |
| C5–C7 | not run | They need a plan for a week with LaLiga games: GW21 (roadmap 2.3). |
| C8 | pass | The site answered GitHub's runner for the ten round-8 matches and the twenty squad pages; no 403 or 429 anywhere in `failed`. |
| C9 | not yet | Fri 9 Oct (roadmap 2.2). |
| C10 | pass | `futbolfantasy` version 2 with the ten match ids 22493–22502; `ff_links`, `start_chances` and `ff_positions` are there. |
| C11–C13 | not yet | During and after round 8, and Thu 15 Oct (roadmap 2.4, 2.6, 2.7). |
| C14 | pass | `ff_positions`: 20 squads, 592 positions, no `squadsFailed`. |
| C15 | pass | `/lineups` on production, 2 Oct (batch 4 of the review): ten matches, both elevens as Sorare cards, your players ringed, per-slot alternatives. |
| C16 | overtaken, partly seen | Every player is a Sorare card now (214 of 220 starters), the six without one use Futbol Fantasy's photo or a silhouette (not looked at live). Crests show beside each team's name (seen on production, 2 Oct). |
| C17 | not yet | There is no `ff_chances` row: the Team news tile had nothing to say in the national-team week. Round 8 (roadmap 2.3). |
| C18 | pass (3 Oct) | Round 8's "Select your Goalkeeper" list in your Chrome, extension 0.3.1: FF or SF on every tile, amber and red rows, the panel with the plan chip, Starts / Benched, "START · FF" and SOURCES folded; "LaLiga only" for a player outside LaLiga; nothing over Sorare's chips ([overlay.md](overlay.md), second live pass). |
| C19 | **fail** (3 Oct) | The panel never says "FF live": the extension's reader finds 0 of 45 players on the real page of match 22493, because the page writes `data-onceFF` and the reader looks for `data-onceff`. Ignoring capitals it finds all 45. Fix: overlay plan O12, roadmap 9.1. |
| C20 | pass | 8 min 18 s against the 15-minute limit, about 100 seconds of it on the dead pages above. The squad pages were not read again (`ff_positions` dates from 1 Oct, 14:33). |
| C21 | overtaken | The alternatives now come from Futbol Fantasy's own slots (`next`); seen against its pitch on 2 Oct: Aleñá under Denis Suárez, Mariano under Toni Martínez, Valentini under Jonny, Lookman under both Lee and Grimaldo. |

Questions: **Q6** is answered (`allCards`, a real Limited card for any player, see [review-fixes.md](review-fixes.md) 4.0) and **Q7**
(crests from football-data.org for the LaLiga clubs, Futbol Fantasy's for the others, both hot-linked) is in use. Q1 to Q5 wait for round 8.
