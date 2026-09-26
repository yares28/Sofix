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
from datetime import UTC, datetime, timedelta
from typing import Any

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
{ so5 { so5Fixtures(first: 14, eventType: CLASSIC, sport: FOOTBALL) { nodes {
  slug gameWeek displayName aasmState startDate endDate cutOffDate } } } }
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

GAMES_FOR = (
    "{alias}: anyGamesForFixture(so5FixtureSlug: ${alias}) {{ id date competition {{ slug }} "
    "homeTeam {{ slug name pictureUrl ... on Club {{ shortName }} }} "
    "awayTeam {{ slug name pictureUrl ... on Club {{ shortName }} }} }}"
)
"""One gameweek's games for a player. A run asks for several at once — aliases cost nothing, a second page does."""

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
    anyPlayerGameStats { playedInGame } } } } } }
"""

GAMES = """
query($s:String!){ so5 { so5Fixture(slug:$s){ games { id } } } }
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
# search, so browsing is free and instant on the page. Field shapes are from the S0/S5 findings
# (docs/sorare_plan.md); the fetch is best-effort — any error leaves the index empty and the run carries on.
MARKET = """
query($s:String!){ football { competition(slug:$s){ clubs { nodes {
  activePlayers(first: 40) { nodes {
    slug displayName position pictureUrl avatarPictureUrl
    activeClub { slug name shortName pictureUrl }
    average: averageScore(type: LAST_TEN_PLAYED_SO5_AVERAGE_SCORE)
    nextClassicFixtureProjectedScore
    marketValue: commonPlayer { marketValue(rarity: limited) { eur } }
  } }
} } } } }
"""


def _market_price(node: dict[str, Any]) -> float | None:
    """The euro price of a Limited card for this player, from whichever shape Sorare returns it in."""
    holder = node.get("marketValue") or {}
    value = holder.get("marketValue") if isinstance(holder, dict) else None
    if isinstance(value, dict):
        for key in ("eur", "value", "amount"):
            if value.get(key) is not None:
                try:
                    return float(value[key])
                except (TypeError, ValueError):
                    return None
    return None


def laliga_index(client: SorareClient, competition: str = "laliga-es") -> list[dict[str, Any]]:
    """Every LaLiga player Sorare is quoting a Limited price for, one row per player, priced players only.

    Read from the league's clubs and their active players (1 + one call per club). Best-effort: a schema change
    or a single missing field leaves the index empty rather than breaking the whole Sorare step.
    """
    try:
        clubs = client.query(MARKET, {"s": competition})["football"]["competition"]["clubs"]["nodes"]
    except (SorareError, KeyError, TypeError) as error:
        logger.warning("laliga index unavailable, player search will be empty: %s", error)
        return []
    seen: set[str] = set()
    rows: list[dict[str, Any]] = []
    for club in clubs:
        for player in (club.get("activePlayers") or {}).get("nodes") or []:
            slug = player.get("slug")
            if not slug or slug in seen:
                continue
            eur = _market_price(player)
            if eur is None:
                continue
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
                }
            )
    return rows


def display_number(name: str, fallback: int) -> int:
    """Sorare counts gameweeks from the start of the game ("gameWeek": 716) but shows "Game Week 17"."""
    digits = re.findall(r"\d+", name or "")
    return int(digits[-1]) if digits else fallback


def gameweeks(client: SorareClient) -> list[dict[str, Any]]:
    nodes = client.query(FIXTURES)["so5"]["so5Fixtures"]["nodes"]
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
    return sorted(out, key=lambda g: g["start"])


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


def history(
    client: SorareClient, players: list[str], before: datetime, days: int = 70
) -> dict[str, list[dict[str, Any]]]:
    """Every score of these players over the weeks before the gameweek (their form, and a played gameweek's result)."""
    out: dict[str, list[dict[str, Any]]] = {}
    start = (before - timedelta(days=days)).astimezone(UTC).isoformat()
    end = (before + timedelta(days=8)).astimezone(UTC).isoformat()
    for player in players:
        try:
            data = client.query(HISTORY, {"p": player, "from": start, "to": end})
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
                "status": row["scoreStatus"],
            }
            for row in scores
        ]
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


def games_count(client: SorareClient, fixture: str) -> int:
    """How much football a gameweek holds. A break week has a fraction of a full weekend's games."""
    try:
        return len(client.query(GAMES, {"s": fixture})["so5"]["so5Fixture"]["games"])
    except SorareError:
        return 0


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
) -> dict[str, Any]:
    """One run's worth of Sorare: the gameweek to plan, the last one played, and everything about both.

    `replayed` is the gameweek the app has already replayed; that one is skipped, since a finished gameweek
    never changes.
    """
    now = now or datetime.now(UTC)
    weeks = gameweeks(client)
    picked = pick_gameweeks(weeks, now, ahead=ahead)
    plan_gw, past_gw, ahead_gws = picked["plan"], picked["past"], picked["ahead"]
    for week in weeks:  # how much football each gameweek holds, to compare like with like
        week["games"] = games_count(client, week["slug"])
    past_slug = past_gw["slug"] if past_gw else plan_gw["slug"]
    # One alias per gameweek: the games of all of them come back in the same pages of cards.
    aliases = {"plan": plan_gw["slug"], "past": past_slug}
    for i, week in enumerate(ahead_gws):
        aliases[f"a{i}"] = week["slug"]
    my_cards = cards(client, user, aliases)
    my_leagues = {
        ((c["player"].get("activeClub") or {}).get("domesticLeague") or {}).get("slug")
        for c in my_cards
        if c["player"].get("activeClub")
    }
    my_leagues.discard(None)
    planned = competitions(client, plan_gw["slug"], my_leagues)  # type: ignore[arg-type]
    # A finished gameweek's replay never changes, so when the app already holds it nothing is fetched for it.
    past_comps = (
        competitions(client, past_slug, my_leagues)  # type: ignore[arg-type]
        if past_gw and past_slug != replayed
        else []
    )
    # A gameweek further ahead is only worth reading for the players who actually have a game in it.
    ahead_comps = {
        week["slug"]: competitions(client, week["slug"], my_leagues)  # type: ignore[arg-type]
        if any(c["player"].get(f"a{i}") for c in my_cards)
        else []
        for i, week in enumerate(ahead_gws)
    }

    played_in = ("plan", "past", *[f"a{i}" for i in range(len(ahead_gws))])
    players = sorted({c["player"]["slug"] for c in my_cards if any(c["player"].get(k) for k in played_in)})
    scores = history(client, players, datetime.fromisoformat(plan_gw["lock"]))

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

    market = laliga_index(client)  # the Player search index (S5); empty if the fetch fails

    return {
        "fetchedAt": now.isoformat(),
        "user": user,
        "gameweeks": weeks,
        "planGameweek": plan_gw,
        "pastGameweek": past_gw,
        "aheadGameweeks": ahead_gws,
        "cards": my_cards,
        "competitions": {plan_gw["slug"]: planned, past_slug: past_comps, **ahead_comps},
        "history": scores,
        "references": references,
        "referenceFor": reference_for,
        "market": market,
        "calls": client.calls,
    }
