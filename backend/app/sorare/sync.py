"""Fetch everything a Sorare gameweek needs, read-only, and hand it over as one plain snapshot.

What it reads: the gameweeks, the competitions of the gameweek being planned (rules, rewards, entry fees), your
cards and which competitions each can enter, your players' games, Sorare's projection and starting chances for
them, their scores this season, and — to turn a score into a chance of a reward — the scores that paid in a
comparable gameweek and a sample of real rooms of 10.

Calls are kept down: only competitions in leagues where you hold a card are read in full, and the reference
scores are cached between runs (they only change when a gameweek finishes).
"""

from __future__ import annotations

import logging
import re
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from app.sorare import expected
from app.sorare.client import SorareClient, SorareError
from app.sorare.model import SORARE_POSITION

logger = logging.getLogger(__name__)

REWARD_FRAGMENT = """
fragment R on AnyRewardConfigInterface { __typename
  ... on MonetaryRewardConfig { amount { usdCents } }
  ... on CardShardRewardConfig { rarity quantity }
  ... on InGameCurrencyRewardConfig { amount currency }
  ... on CoinRewardConfig { amount currency }
  ... on CardRewardConfig { rarity quality }
}
"""

FIXTURES = """
query($first:Int!,$after:String){ so5 { so5Fixtures(first: $first, after: $after, eventType: CLASSIC, sport: FOOTBALL) {
  pageInfo { hasNextPage endCursor }
  nodes { slug gameWeek displayName aasmState startDate endDate cutOffDate } } } }
"""

LEAGUES = """
query($s:String!){ so5 { so5Fixture(slug:$s){
  competitions { slug }
  so5Leagues { displayName competitions { slug }
    so5LeagueTracks { displayName seasonality entrySo5Leaderboard { slug mainRarityType } } } } } }
"""

LEADERBOARD = (
    REWARD_FRAGMENT
    + """
query($s:String!){ so5 { so5Leaderboard(slug:$s){
  id slug mainRarityType so5LineupsCount teamsCap projectedLineupsReadyAt
  format { title entryItem { __typename ... on So5CardShardsEntryItem { quantity rarity } } }
  roomsConfig { roomsSize }
  rules { lockType rarities sumOfAverageScores age { min max cutOffDate } competitions { slug }
          appearances(includeSubs: true) { name positions sub } }
  engineConfiguration { season captain grade scarcity sameActiveClub averageScores multiGameScoreAggregator }
  displayedTypedRules { key }
  rewardsConfig { ranking { fromRank toRank rewardConfigs { ...R } } }
} } }
"""
)

_GAME_ODDS = "winOddsBasisPoints drawOddsBasisPoints loseOddsBasisPoints cleanSheetOdds"
GAMES_FOR = (
    "{alias}: anyGamesForFixture(so5FixtureSlug: ${alias}) {{ id date competition {{ slug }} "
    "homeTeam {{ slug name pictureUrl ... on Club {{ shortName }} }} "
    "awayTeam {{ slug name pictureUrl ... on Club {{ shortName }} }} "
    "homeStats {{ ... on FootballTeamGameStats {{ " + _GAME_ODDS + " }} }} "
    "awayStats {{ ... on FootballTeamGameStats {{ " + _GAME_ODDS + " }} }} }}"
)
"""One gameweek's games for a player, with each side's odds. Sorare fills the odds only in the last few days before
a game, so they are often null. A run asks for several gameweeks at once — aliases cost nothing, a second page does."""

CARDS = """
query($a:String$ARGS){ user(slug:$USER){ cards(first: 10, after: $a, sport: FOOTBALL, rarities: [limited, rare]) {
  pageInfo { hasNextPage endCursor }
  nodes { ... on Card {
    slug rarityTyped seasonYear inSeasonEligible sealed grade power pictureUrl anyPositions
    liveSingleSaleOffer { id } sentInLiveOffers { id }
    player { slug displayName position birthDay avatarPictureUrl
      activeClub { slug name shortName pictureUrl domesticLeague { slug } }
      activeNationalTeam { slug name }
      average: averageScore(type: LAST_TEN_PLAYED_SO5_AVERAGE_SCORE)
      l5: averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE)
      l40: averageScore(type: LAST_FORTY_SO5_AVERAGE_SCORE)
      lastFiveSo5Appearances lastTenSo5Appearances lastFortySo5Appearances
      gameplayTier
      nextClassicFixtureProjectedScore
      nextClassicFixturePlayingStatusOdds { starterOddsBasisPoints substituteOddsBasisPoints nonPlayingOddsBasisPoints }
      $GAMES
    } } } } } }
"""

HISTORY = """
query($p:String!,$from:ISO8601DateTime!,$to:ISO8601DateTime!){ anyPlayer(slug:$p){
  ... on Player { allPlayerGameScores(from:$from, to:$to, first: 40) { nodes {
    score scoreStatus
    anyGame { id date competition { slug } }
    anyPlayerGameStats { playedInGame ... on PlayerGameStats { gameStarted minsPlayed } } } } } } }
"""
# With his cards: a red card (a second yellow counts as one) bans him from the next game of that competition. Its complexity (about
# 1,300) is over the keyless limit of 500, so it is only asked with an API key (the scheduled refresh has one).
HISTORY_CARDS = HISTORY.replace("score scoreStatus", "score scoreStatus detailedScore { stat statValue }")

GAMES = """
query($s:String!){ so5 { so5Fixture(slug:$s){ games { id competition { slug } } } } }
"""

RANK = """
query($s:String!,$p:Int!){ so5 { so5Leaderboard(slug:$s){ so5RankingsPaginated(page:$p, pageSize:1){
  so5Rankings { ranking score } } } } }
"""

ROOMS_PAGE = """
query($s:String!,$a:String){ so5 { so5Fixture(slug:$s){ so5LeaderboardsPaginated(first: 100, after: $a){
  pageInfo { hasNextPage endCursor }
  nodes { slug isArena so5LeaderboardType mainRarityType so5LineupsCount displayName so5League { displayName } } } } } }
"""

ROOM_SCORES = """
query($s:String!){ so5 { so5Leaderboard(slug:$s){ so5RankingsPaginated(page:0, pageSize:10){
  so5Rankings { ranking score } } } } }
"""


# The LaLiga price index for the Player search page (S5). Built from the league's squads, not a live name
# search, so browsing is free and instant on the page. Sorare will not return activePlayers on the clubs
# list, and a Limited in-season price is eurCents on MonetaryAmount (there is no `eur` field).
CLUBS = """
query($s:String!){ football { competition(slug:$s){ clubs { nodes { slug } } } } }
"""

SQUAD = """
query($s:String!,$a:String$ARGS){ football { club(slug:$s){ activePlayers(first: 50, after: $a) {
  pageInfo { hasNextPage endCursor }
  nodes {
    slug displayName position pictureUrl avatarPictureUrl
    activeClub { slug name shortName pictureUrl }
    average: averageScore(type: LAST_TEN_PLAYED_SO5_AVERAGE_SCORE)
    nextClassicFixtureProjectedScore
    nextClassicFixturePlayingStatusOdds { starterOddsBasisPoints substituteOddsBasisPoints nonPlayingOddsBasisPoints }
    activeNationalTeam { slug name }
    commonPlayer(rarity: limited) {
      marketValue(rarity: limited, seasonEligibility: IN_SEASON) { eurCents }
    }
    $GAMES
  } } } } }
"""
"""Every LaLiga player, with what the planner needs to give him a start chance and an xScore: Sorare's odds, his projection
and his games in the gameweek being planned (asked as `plan`, the alias the cards use)."""


def _market_price(node: dict[str, Any]) -> float | None:
    """Euros for a Limited in-season card. Sorare sends the price in cents."""
    common = node.get("commonPlayer") or {}
    value = common.get("marketValue") if isinstance(common, dict) else None
    if not isinstance(value, dict) or value.get("eurCents") is None:
        return None
    try:
        return float(value["eurCents"]) / 100
    except (TypeError, ValueError):
        return None


def _squad(client: SorareClient, club: str, fixture: str | None = None) -> list[dict[str, Any]]:
    """One club's active players, paged. A club Sorare will not read is skipped, not fatal."""
    query = SQUAD.replace("$ARGS", ",$plan:String!" if fixture else "").replace(
        "$GAMES", GAMES_FOR.format(alias="plan") if fixture else ""
    )
    players: list[dict[str, Any]] = []
    after: str | None = None
    for _ in range(4):  # 50 a page: a squad fits in one, the cap is only a runaway guard
        variables = {"s": club, "a": after, **({"plan": fixture} if fixture else {})}
        page = client.query(query, variables)["football"]["club"]["activePlayers"]
        players.extend(page.get("nodes") or [])
        info = page.get("pageInfo") or {}
        after = info.get("endCursor")
        if not info.get("hasNextPage") or not after:
            break
    return players


def laliga_index(
    client: SorareClient, competition: str = "laliga-es", fixture: str | None = None
) -> list[dict[str, Any]]:
    """Every LaLiga player, one row per player, with his Limited price when Sorare quotes one (else `eur` is None).

    With `fixture` (the gameweek being planned) each row also keeps Sorare's player as `player`, games included, so the
    job can give every LaLiga player a start chance and an xScore, not only the owner's.

    One call for the club list, then one call per club. Best-effort: a schema change leaves the index empty,
    and one club that fails is skipped, rather than breaking the whole Sorare step.
    """
    try:
        clubs = client.query(CLUBS, {"s": competition})["football"]["competition"]["clubs"]["nodes"]
    except (SorareError, KeyError, TypeError) as error:
        logger.warning("laliga index unavailable, player search will be empty: %s", error)
        return []
    seen: set[str] = set()
    rows: list[dict[str, Any]] = []
    for club in clubs:
        club_slug = club.get("slug")
        if not club_slug:
            continue
        try:
            players = _squad(client, club_slug, fixture)
        except (SorareError, KeyError, TypeError) as error:
            logger.warning("laliga index skipped %s: %s", club_slug, error)
            continue
        for player in players:
            slug = player.get("slug")
            if not slug or slug in seen:
                continue
            eur = _market_price(player)
            seen.add(slug)
            active = player.get("activeClub") or {}
            rows.append(
                {
                    "slug": slug,
                    "name": player.get("displayName") or slug,
                    "pos": SORARE_POSITION.get(player.get("position", ""), "MID"),
                    "club": active.get("shortName") or active.get("name"),
                    "crest": active.get("pictureUrl"),
                    "average": float(player.get("average") or 0.0),
                    "projection": player.get("nextClassicFixtureProjectedScore"),
                    "eur": eur,
                    "pic": player.get("pictureUrl") or player.get("avatarPictureUrl") or "",
                    **({"player": player} if fixture else {}),
                }
            )
    return rows


def display_number(name: str, fallback: int) -> int:
    """Sorare counts gameweeks from the start of the game ("gameWeek": 716) but shows "Game Week 17"."""
    digits = re.findall(r"\d+", name or "")
    return int(digits[-1]) if digits else fallback


ROLLOVER = timedelta(days=4)
"""How long a week of the last season is kept after it ends, once the new season is being numbered: long enough for the run
that follows it to replay it and, a day later, keep it (`publish.SETTLE`)."""


def this_season(weeks: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    """This season's gameweeks from a list (oldest first) that may reach back into the last one.

    The season starts at the latest week numbered 1 or, when there is none in the list, where the numbers last go back
    down. A week of the season before that is kept all the same while it is still to be played, or has only just been
    played (`ROLLOVER`): a new season being numbered does not end it, and it is still there to plan, replay and keep.
    """
    first = next((i for i in range(len(weeks) - 1, -1, -1) if weeks[i]["number"] == 1), None)
    if first is None:
        first = next((i for i in range(len(weeks) - 1, 0, -1) if weeks[i]["number"] < weeks[i - 1]["number"]), 0)
    since = now - ROLLOVER
    return [w for i, w in enumerate(weeks) if i >= first or datetime.fromisoformat(w["end"]) > since]


def gameweeks(
    client: SorareClient, page: int = 30, max_pages: int = 5, now: datetime | None = None
) -> list[dict[str, Any]]:
    """Every gameweek of this season so far, oldest first, plus the ones Sorare has opened.

    Sorare lists them newest first and runs them all year, numbering from "Game Week 1" again when a season
    starts, so the list is read page by page until that Game Week 1 turns up: everything after it is this
    season's, everything before it is last season's (`this_season`). If it never turns up (a schema change) a few pages
    are read and the run carries on with what it has, rather than paging without end.
    """
    nodes: list[dict[str, Any]] = []
    after: str | None = None
    for _ in range(max_pages):
        connection = client.query(FIXTURES, {"first": page, "after": after})["so5"]["so5Fixtures"]
        nodes.extend(connection["nodes"])
        info = connection.get("pageInfo") or {}
        after = info.get("endCursor")
        if any(display_number(n["displayName"], n["gameWeek"]) == 1 for n in connection["nodes"]):
            break  # this season's first gameweek: nothing older is this season's
        if not info.get("hasNextPage") or not after:
            break
    out = [
        {
            "slug": n["slug"],
            "number": display_number(n["displayName"], n["gameWeek"]),
            "internal": n["gameWeek"],
            "name": n["displayName"],
            "state": n["aasmState"],
            "start": n["startDate"],
            "end": n["endDate"],
            "lock": n["cutOffDate"],
        }
        for n in nodes
    ]
    out.sort(key=lambda g: g["start"])
    return this_season(out, now or datetime.now(UTC))


def history_players(cards: list[dict[str, Any]], played_in: tuple[str, ...], league: str = "laliga-es") -> list[str]:
    """The players whose past scores a run reads: anyone with a game in a gameweek it plans, and every LaLiga player.

    A LaLiga player with no game this gameweek (an international break, say) is still in the early plans for the rounds
    ahead, and those stand on his form.
    """
    return sorted(
        {
            c["player"]["slug"]
            for c in cards
            if any(c["player"].get(k) for k in played_in)
            or ((c["player"].get("activeClub") or {}).get("domesticLeague") or {}).get("slug") == league
        }
    )


def past_gaps(
    past_comps: list[dict[str, Any]],
    cards: list[dict[str, Any]],
    scores: dict[str, list[dict[str, Any]]],
    unanswered: int,
) -> list[str]:
    """What the replay of the week just played lacks because Sorare did not answer, in words; empty when nothing is missing.

    A replay is only made final (kept, archived, never read again) once this is empty, so a call that failed on the one run
    that mattered is asked again on the next instead of being written down as the truth. `unanswered` counts the questions
    about that week's competitions and what they paid that got no answer; a player with a game that week whose scores could
    not be read is named too, since he would count as not having played.
    """
    gaps = [
        f"{c['league']} | {c['track']}: could not be read"
        for c in past_comps
        if c.get("skipped") == "could not be read"
    ]
    played = {c["player"]["slug"] for c in cards if c["player"].get("past")}
    gaps += [f"{slug}: his scores could not be read" for slug in sorted(played - scores.keys())]
    if unanswered:
        gaps.append(f"{unanswered} question(s) about the week's competitions and what they paid got no answer")
    return gaps


def recent_weeks(weeks: list[dict[str, Any]], now: datetime, days: int = 45) -> list[dict[str, Any]]:
    """The weeks worth counting games in: the last `days` days and everything coming.

    Counting a week's games is one call each, and only a recent finished week is ever compared with the one being
    planned (`pick_reference`), so the older ones of a season are not counted.
    """
    since = now - timedelta(days=days)
    return [w for w in weeks if datetime.fromisoformat(w["end"]) > since]


def pick_gameweeks(weeks: list[dict[str, Any]], now: datetime, ahead: int = 2) -> dict[str, Any]:
    """Which gameweeks a run covers: the one being planned, the next few, and the last one played.

    The ones after the next are planned too, but from form only — Sorare publishes a projection for a player's
    *next* fixture and nothing further, so a lineup that far out is the best guess from his last five games.
    """
    open_weeks = [g for g in weeks if datetime.fromisoformat(g["lock"]) > now]
    done = [g for g in weeks if datetime.fromisoformat(g["end"]) < now]
    if not open_weeks:
        raise SorareError("no gameweek is open")
    return {"plan": open_weeks[0], "ahead": open_weeks[1 : 1 + ahead], "past": done[-1] if done else None}


def _tracks(client: SorareClient, fixture: str) -> tuple[list[str], list[dict[str, Any]]]:
    data = client.query(LEAGUES, {"s": fixture})["so5"]["so5Fixture"]
    competitions = [c["slug"] for c in data.get("competitions") or []]
    tracks = []
    for league in data["so5Leagues"]:
        for track in league["so5LeagueTracks"]:
            entry = track["entrySo5Leaderboard"]
            if entry["mainRarityType"] not in ("limited", "rare"):
                continue
            tracks.append(
                {
                    "league": league["displayName"],
                    "leagueCompetitions": [c["slug"] for c in league.get("competitions") or []],
                    "track": track["displayName"],
                    "seasonality": track["seasonality"],
                    "slug": entry["slug"],
                    "rarity": entry["mainRarityType"],
                }
            )
    return competitions, tracks


def competitions(
    client: SorareClient, fixture: str, my_leagues: set[str], keep_all: bool = False
) -> list[dict[str, Any]]:
    """Every competition of the gameweek, in full, for the leagues where you hold a card.

    A league you have no card in can never be playable, so its rules are not worth a call: the name and the
    reason ("No MLS cards") are enough.
    """
    _, tracks = _tracks(client, fixture)
    out = []
    for track in tracks:
        restricted = track["leagueCompetitions"]
        playable = keep_all or not restricted or bool(set(restricted) & my_leagues)
        if not playable:
            out.append({**track, "skipped": "no cards in this league"})
            continue
        try:
            payload = client.query(LEADERBOARD, {"s": track["slug"]})["so5"]["so5Leaderboard"]
        except SorareError as exc:  # one competition should not stop the sync
            logger.warning("sorare: could not read %s (%s)", track["slug"], exc)
            out.append({**track, "skipped": "could not be read"})
            continue
        rules = payload.get("rules") or {}
        out.append(
            {
                **track,
                **payload,
                "appearances": rules.get("appearances") or [],
                "projectionsAt": payload.get("projectedLineupsReadyAt"),
            }
        )
    return out


def cards(client: SorareClient, user: str, fixtures: dict[str, str]) -> list[dict[str, Any]]:
    """Every card, with each player's games in each of these gameweeks (`{alias: fixture slug}`)."""
    args = "".join(f",${alias}:String!" for alias in fixtures)
    query = (
        CARDS.replace("$USER", f'"{user}"')
        .replace("$ARGS", args)
        .replace("$GAMES", "\n      ".join(GAMES_FOR.format(alias=alias) for alias in fixtures))
    )
    out: list[dict[str, Any]] = []
    after: str | None = None
    while True:
        page = client.query(query, {"a": after, **fixtures})["user"]["cards"]
        out.extend(page["nodes"])
        if not page["pageInfo"]["hasNextPage"]:
            return out
        after = page["pageInfo"]["endCursor"]


def _sent_off(stats: list[dict[str, Any]] | None) -> bool:
    return any(one.get("stat") == "red_card" and (one.get("statValue") or 0) > 0 for one in stats or [])


def history(
    client: SorareClient, players: list[str], before: datetime, days: int = 70
) -> dict[str, list[dict[str, Any]]]:
    """Every score of these players over the weeks before the gameweek (their form, and a played gameweek's result)."""
    out: dict[str, list[dict[str, Any]]] = {}
    start = (before - timedelta(days=days)).astimezone(UTC).isoformat()
    end = (before + timedelta(days=8)).astimezone(UTC).isoformat()
    query = HISTORY_CARDS if getattr(client, "api_key", "") else HISTORY
    for player in players:
        try:
            data = client.query(query, {"p": player, "from": start, "to": end})
        except SorareError as exc:
            logger.warning("sorare: no history for %s (%s)", player, exc)
            continue
        scores = ((data.get("anyPlayer") or {}).get("allPlayerGameScores") or {}).get("nodes") or []
        out[player] = [
            {
                "date": row["anyGame"]["date"],
                "competition": row["anyGame"]["competition"]["slug"],
                "gameId": row["anyGame"]["id"],
                "score": row["score"],
                "played": bool((row.get("anyPlayerGameStats") or {}).get("playedInGame")),
                "started": bool((row.get("anyPlayerGameStats") or {}).get("gameStarted")),
                "mins": (row.get("anyPlayerGameStats") or {}).get("minsPlayed"),
                "status": row["scoreStatus"],
                **({"red": _sent_off(row["detailedScore"])} if "detailedScore" in row else {}),
                **(
                    {
                        "stats": {
                            s["stat"]: s["statValue"] for s in row["detailedScore"] if s.get("statValue") is not None
                        }
                    }
                    if "detailedScore" in row
                    else {}
                ),
            }
            for row in scores
        ]
    return out


GAME_ID = re.compile(r"^Game:[0-9a-f-]{36}$")
GAME_PROJECTIONS = '{alias}: anyGame(id: "{id}") {{ ... on Game {{ id playerGameScores {{ projection {{ score grade }} anyPlayer {{ slug }} }} }} }}'
PROJECTION_BATCH = 8  # games per question: about 700 players, well inside the keyed complexity limit


def game_projections(client: SorareClient, game_ids: list[str]) -> dict[str, dict[str, dict[str, Any]]]:
    """Sorare's projection for every player of these games, game by game: `{game id: {player slug: {score, grade}}}`.

    `nextClassicFixtureProjectedScore` is a player's *next* game, which can sit in a week still being played rather than the one
    being planned; this is the number for the game itself (Sorare publishes it about two days before the lock). A game Sorare has
    not projected yet answers with no players; a question that fails leaves its games out, and those players fall back.
    """
    wanted = sorted({g for g in game_ids if GAME_ID.match(g)})
    out: dict[str, dict[str, dict[str, Any]]] = {}
    for i in range(0, len(wanted), PROJECTION_BATCH):
        batch = wanted[i : i + PROJECTION_BATCH]
        query = (
            "query { " + " ".join(GAME_PROJECTIONS.format(alias=f"g{n}", id=gid) for n, gid in enumerate(batch)) + " }"
        )
        try:
            data = client.query(query)
        except SorareError as exc:
            logger.warning("sorare: no projections for %d games (%s)", len(batch), exc)
            continue
        for n, gid in enumerate(batch):
            game = data.get(f"g{n}") or {}
            found = {
                row["anyPlayer"]["slug"]: {"score": float(proj["score"]), "grade": proj.get("grade")}
                for row in game.get("playerGameScores") or []
                if (row.get("anyPlayer") or {}).get("slug")
                and (proj := row.get("projection") or {}).get("score") is not None
            }
            out[gid] = found
    return out


def plan_game_ids(rows: list[dict[str, Any]], alias: str = "plan") -> list[str]:
    """The games of the planned week, of every player in these rows (your cards, or the LaLiga index)."""
    return [game["id"] for row in rows for game in (row.get("player") or {}).get(alias) or [] if game.get("id")]


LEAGUE_SAVE_EVERY = 50  # players read between saves: a run cut off midway keeps what it read


def league_history(
    client: SorareClient,
    slugs: list[str],
    cached: dict[str, Any] | None,
    now: datetime,
    save: Callable[[dict[str, Any]], None],
    every: int = LEAGUE_SAVE_EVERY,
) -> dict[str, Any]:
    """Every LaLiga player's past games, all read in one run (the daily `league-history` workflow, owner's ask of 6 Oct 2026):
    `{slug: {"at": when read, "games": rows as history() gives}}`.

    The stalest reading goes first and the result is saved every `every` players, so a run Sorare or GitHub cuts off keeps what
    it read and the next one starts where it stopped. A player Sorare does not answer keeps his last reading; one no longer in
    LaLiga drops out.
    """
    current = set(slugs)
    out = {slug: entry for slug, entry in (cached or {}).items() if slug in current}
    order = sorted(current, key=lambda slug: ((out.get(slug) or {}).get("at") or "", slug))
    for start in range(0, len(order), every):
        for slug, games in history(client, order[start : start + every], now).items():
            out[slug] = {"at": now.isoformat(), "games": games}
        save(out)
    return out


def cut_offs(client: SorareClient, leaderboard: str, ranks: list[int], entries: int) -> dict[str, float]:
    """The score that finished at each of those ranks — what a reward tier really needed."""
    out: dict[str, float] = {}
    for rank in sorted(set(ranks)):
        page = min(rank, entries) - 1
        if page < 0:
            continue
        try:
            rows = client.query(RANK, {"s": leaderboard, "p": page})["so5"]["so5Leaderboard"]["so5RankingsPaginated"][
                "so5Rankings"
            ]
        except SorareError:
            continue
        if rows:
            out[str(rank)] = rows[0]["score"]
    return out


def sample_rooms(client: SorareClient, fixture: str, wanted: set[str], per_type: int = 10) -> dict[str, list[float]]:
    """Scores from real rooms of 10, to judge what it takes to finish in a room's top three."""
    found: dict[str, list[str]] = {name: [] for name in wanted}
    after: str | None = None
    while True:
        page = client.query(ROOMS_PAGE, {"s": fixture, "a": after})["so5"]["so5Fixture"]["so5LeaderboardsPaginated"]
        for node in page["nodes"]:
            if not node["isArena"] or node["mainRarityType"] != "limited" or node["so5LineupsCount"] < 10:
                continue
            name = f"{node['so5League']['displayName']} | {node['displayName']}"
            if name in found and len(found[name]) < per_type:
                found[name].append(node["slug"])
        if not page["pageInfo"]["hasNextPage"] or all(len(v) >= per_type for v in found.values()):
            break
        after = page["pageInfo"]["endCursor"]
    out: dict[str, list[float]] = {}
    for name, slugs in found.items():
        scores: list[float] = []
        for slug in slugs:
            try:
                rows = client.query(ROOM_SCORES, {"s": slug})["so5"]["so5Leaderboard"]["so5RankingsPaginated"][
                    "so5Rankings"
                ]
            except SorareError:
                continue
            scores.extend(row["score"] for row in rows)
        if scores:
            out[name] = scores
    return out


def games_summary(client: SorareClient, fixture: str) -> tuple[int, int]:
    """How much football a gameweek holds, and how much of it is LaLiga: (all games, LaLiga games).

    A break week has a fraction of a full weekend's games; the LaLiga count is what decides whether Sorare opens LaLiga's
    competitions for it (`expected`).
    """
    try:
        games = client.query(GAMES, {"s": fixture})["so5"]["so5Fixture"]["games"]
    except SorareError:
        return 0, 0
    return len(games), sum(1 for game in games if (game.get("competition") or {}).get("slug") == expected.LALIGA)


def expected_templates(
    client: SorareClient,
    weeks: list[dict[str, Any]],
    now: datetime,
    my_leagues: set[str],
    cached: dict[str, Any] | None,
) -> dict[str, dict[str, Any]]:
    """The finished gameweeks whose LaLiga competitions stand in for the ones Sorare has not opened (`expected.pick_templates`).

    Each is read once, when it becomes the latest of its kind, and kept: a finished gameweek never changes.
    """
    out: dict[str, dict[str, Any]] = {}
    for kind, week in expected.pick_templates(weeks, now).items():
        stored = (cached or {}).get(kind)
        if stored and stored.get("slug") == week["slug"] and stored.get("competitions"):
            out[kind] = stored
            continue
        try:
            comps = expected.laliga_competitions(competitions(client, week["slug"], my_leagues))
        except SorareError as exc:  # the plans can do without it: keep the one read before, if any
            logger.warning("sorare: no template %s (%s)", week["slug"], exc)
            if stored and stored.get("competitions"):
                out[kind] = stored
            continue
        if comps:
            out[kind] = {
                "slug": week["slug"],
                "number": week["number"],
                "name": week["name"],
                "laliga": week["laliga"],
                "competitions": comps,
            }
    return out


def pick_reference(done: list[dict[str, Any]], target: dict[str, Any], spread: float = 0.45) -> dict[str, Any] | None:
    """The finished gameweek to judge scores by — one with about as much football in it as this one.

    Sorare alternates full weekends with midweek rounds, and an international break has almost no club games at
    all; the same score is worth a very different rank in each. When no finished gameweek is close enough,
    this returns nothing and the app says the chances aren't known yet rather than inventing them.
    """
    target_games = target.get("games") or 0
    if not done or not target_games:
        return None
    close = [g for g in done if g.get("games") and abs(g["games"] - target_games) / target_games <= spread]
    return close[-1] if close else None


def reference_scores(
    client: SorareClient,
    fixture: str,
    number: int,
    comps: list[dict[str, Any]],
    cached: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """What it took to be paid in one gameweek: the score at each reward rank, and real rooms of 10.

    That is how a lineup's score becomes a chance of a reward. It only changes when a gameweek finishes, so
    every run passes the previous answer back in and only the missing competitions are fetched.
    """
    out = dict(cached or {})
    wanted = {f"{c['league']} | {c['track']}": c for c in comps if not c.get("skipped")}
    missing = {k: c for k, c in wanted.items() if k not in out}
    if not missing:
        return out
    try:
        _, tracks = _tracks(client, fixture)
    except SorareError as exc:
        logger.warning("sorare: no reference gameweek %s (%s)", fixture, exc)
        return out
    by_key = {f"{t['league']} | {t['track']}": t for t in tracks}
    rooms_wanted: set[str] = set()
    for key, comp in missing.items():
        match = by_key.get(key)
        if match is None:
            continue
        if comp.get("roomsConfig") or (comp.get("format") or {}).get("entryItem"):
            rooms_wanted.add(key)
            continue
        try:
            board = client.query(LEADERBOARD, {"s": match["slug"]})["so5"]["so5Leaderboard"]
        except SorareError:
            continue
        entries = int(board.get("so5LineupsCount") or 0)
        # the ranks that paid then, plus the ones this gameweek pays, so nothing has to be extrapolated
        ranks = {t["toRank"] for t in ((board.get("rewardsConfig") or {}).get("ranking") or [])}
        ranks |= {t["toRank"] for t in ((comp.get("rewardsConfig") or {}).get("ranking") or [])}
        ranks = {r for r in ranks if r <= entries} | ({entries} if entries else set())
        cuts = cut_offs(client, match["slug"], sorted(ranks), entries) if ranks else {}
        if cuts:
            out[key] = {"from": fixture, "gameweek": number, "entries": entries, "cuts": cuts}
    if rooms_wanted:
        for key, scores in sample_rooms(client, fixture, rooms_wanted).items():
            out[key] = {"from": fixture, "gameweek": number, "rooms": scores}
    return out


def snapshot(
    client: SorareClient,
    user: str,
    now: datetime | None = None,
    cached_references: dict[str, Any] | None = None,
    replayed: str | None = None,
    ahead: int = 2,
    cached_templates: dict[str, Any] | None = None,
    cached_league: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """One run's worth of Sorare: the gameweek to plan, the last one played, and everything about both.

    `replayed` is the gameweek the app has already replayed; that one is skipped, since a finished gameweek
    never changes.
    """
    now = now or datetime.now(UTC)
    weeks = gameweeks(client, now=now)
    picked = pick_gameweeks(weeks, now, ahead=ahead)
    plan_gw, past_gw, ahead_gws = picked["plan"], picked["past"], picked["ahead"]
    for week in recent_weeks(weeks, now):  # how much football each gameweek holds, to compare like with like
        week["games"], week["laliga"] = games_summary(client, week["slug"])
    past_slug = past_gw["slug"] if past_gw else plan_gw["slug"]
    # One alias per gameweek: the games of all of them come back in the same pages of cards.
    aliases = {"plan": plan_gw["slug"], "past": past_slug}
    active_gws = [w for w in weeks if datetime.fromisoformat(w["lock"]) <= now <= datetime.fromisoformat(w["end"])]
    for i, week in enumerate(active_gws):
        aliases[f"live{i}"] = week["slug"]
    for i, week in enumerate(ahead_gws):
        aliases[f"a{i}"] = week["slug"]
    mission_mark = client.errors
    my_cards = cards(client, user, aliases)
    mission_complete = client.errors == mission_mark and all(
        all(alias in c.get("player", {}) for alias in aliases) for c in my_cards
    )
    my_leagues = {
        ((c["player"].get("activeClub") or {}).get("domesticLeague") or {}).get("slug")
        for c in my_cards
        if c["player"].get("activeClub")
    }
    my_leagues.discard(None)
    planned = competitions(client, plan_gw["slug"], my_leagues)  # type: ignore[arg-type]
    # A finished gameweek's replay never changes, so when the app already holds it nothing is fetched for it.
    replaying = bool(past_gw) and past_slug != replayed
    mark = client.errors
    past_comps = competitions(client, past_slug, my_leagues) if replaying else []  # type: ignore[arg-type]
    unanswered = client.errors - mark  # questions about the week just played that got no answer, counted from here
    # A gameweek further ahead is only worth reading for the players who actually have a game in it.
    ahead_comps = {
        week["slug"]: competitions(client, week["slug"], my_leagues)  # type: ignore[arg-type]
        if any(c["player"].get(f"a{i}") for c in my_cards)
        else []
        for i, week in enumerate(ahead_gws)
    }

    played_in = tuple(aliases)
    scores = history(client, history_players(my_cards, played_in), datetime.fromisoformat(plan_gw["lock"]))

    # Reward chances come from a gameweek that has already been played. The gameweek being planned looks at the
    # last one finished; the replay of a played gameweek may only look at the one before it, and is scored
    # against its own results.
    done = [g for g in weeks if datetime.fromisoformat(g["end"]) < now]
    references: dict[str, Any] = dict(cached_references or {})
    reference_for: dict[str, str] = {}
    latest = pick_reference(done, plan_gw)
    if latest:
        reference_for["plan"] = latest["slug"]
        references[latest["slug"]] = reference_scores(
            client, latest["slug"], latest["number"], planned, references.get(latest["slug"])
        )
    if past_gw and past_comps:
        mark = client.errors
        earlier = [g for g in done if g["end"] < past_gw["start"]]
        before = pick_reference(earlier, past_gw)
        if before:
            reference_for["pastBefore"] = before["slug"]
            references[before["slug"]] = reference_scores(
                client, before["slug"], before["number"], past_comps, references.get(before["slug"])
            )
        reference_for["pastActual"] = past_gw["slug"]
        references[past_gw["slug"]] = reference_scores(
            client, past_gw["slug"], past_gw["number"], past_comps, references.get(past_gw["slug"])
        )
        unanswered += client.errors - mark

    # The LaLiga competitions of the latest finished week of each kind, to plan the weeks Sorare has not opened them for.
    templates = expected_templates(client, done, now, my_leagues, cached_templates)  # type: ignore[arg-type]
    for template in templates.values():
        references[template["slug"]] = reference_scores(
            client, template["slug"], template["number"], template["competitions"], references.get(template["slug"])
        )

    gaps = past_gaps(past_comps, my_cards, scores, unanswered) if replaying else []
    # Every LaLiga player with his odds and games this week (S5, and his start chance and xScore); empty if the fetch fails
    market = laliga_index(client, fixture=plan_gw["slug"])
    # Sorare's projection game by game for the planned week, yours and every LaLiga player's (the record keeps both numbers)
    projections = game_projections(client, plan_game_ids(my_cards) + plan_game_ids(market))
    # Every other LaLiga player's past games, so his form counts too (yours are read in full above): only read here, the daily
    # `league-history` job is the one that fetches and saves them, so a refresh never writes back an older copy.
    league = cached_league or {}

    return {
        "fetchedAt": now.isoformat(),
        "user": user,
        "gameweeks": weeks,
        "planGameweek": plan_gw,
        "pastGameweek": past_gw,
        "aheadGameweeks": ahead_gws,
        "missionAliases": list(aliases),
        "missionComplete": mission_complete,
        "pastGaps": gaps,
        "cards": my_cards,
        "competitions": {plan_gw["slug"]: planned, past_slug: past_comps, **ahead_comps},
        "history": scores,
        "references": references,
        "referenceFor": reference_for,
        "expected": templates,
        "market": market,
        "projections": projections,
        "leagueHistory": league,
        "calls": client.calls,
    }
