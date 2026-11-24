"""Sofix's xS for every upcoming game of every tracked player, not only his next one (plans/xs-ahead.md, owner 24 Nov 2026).

Each club's games come from the competitions' boards (LaLiga, Premier League, Bundesliga, Ligue 1, Champions, Europa and Conference
League), which forecast every remaining fixture. Each game is scored by the job's own scorer, the one that gives the next game its
number, with the run's time as its forecast time: game +1 and game +5 stand on the same model. A game no board has (a national team,
a domestic cup) is not listed: whoever needs it falls back on his form and says so.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from datetime import datetime, timedelta
from typing import Any

from app.research.league_xscore_data import LEAGUES
from app.research.league_xscore_identity import club_name
from app.services import team_registry
from app.sorare.foreign_scores import COMPETITIONS
from app.sorare.keeper import LALIGA
from app.sorare.publish import v3_shape
from app.sorare.scores import Made

HORIZON_DAYS = 45  # an Arcade set runs about six weeks; a Pro gameweek ahead is inside it
PREFIX = "xs_ahead:"
EUROPE = ("CL", "EL", "CONF")
_SIDES = {"sorare_slug": ("teamSlug", "opponentSlug"), "history_name": ("teamName", "opponentName")}

Scorer = Callable[[dict[str, Any], list[dict[str, Any]], float | None, list[dict[str, Any]]], Made]


def _at(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def _games(
    board: dict[str, Any], team: dict[str, Any], competition: str, now: datetime, key: str | None
) -> list[dict[str, Any]]:
    """One side's scheduled, forecast games on one board within the horizon, as the scorer reads a game. `key` names how the scorer
    finds the side on that board: by Sorare slug (Europe), by the board's history name (the other leagues), or by club name (LaLiga)."""
    names = {t["code"]: t for t in board.get("teams") or []}
    out = []
    for column in team.get("cells") or []:
        for c in column:
            kickoff = c.get("kickoff_utc")
            other = names.get(c.get("opponent_code") or "")
            if not kickoff or other is None or c.get("status") != "scheduled" or not (c.get("prediction") or {}):
                continue
            if not now < _at(kickoff) <= now + timedelta(days=HORIZON_DAYS):
                continue
            out.append(
                {
                    "kickoff": kickoff,
                    "competition": competition,
                    "venue": c.get("venue"),
                    "opponent": other.get("name"),
                    "forecastBefore": now.isoformat(),
                    **({_SIDES[key][0]: team.get(key), _SIDES[key][1]: other.get(key)} if key else {}),
                }
            )
    return out


def club_games(
    player: dict[str, Any], laliga: dict[str, Any] | None, grids: dict[str, dict[str, Any]], now: datetime
) -> list[dict[str, Any]]:
    """Every game of the player's club on every board, in kick-off order."""
    club = player.get("activeClub") or {}
    names = [n for n in (club.get("name"), club.get("shortName")) if n]
    found: list[dict[str, Any]] = []
    if laliga:
        info = next((t for n in names if (t := team_registry.by_odds_name(n)) is not None), None)
        team = next((t for t in laliga.get("teams") or [] if info and t.get("code") == info.code), None)
        if team:
            found += _games(laliga, team, LALIGA, now, None)
    for code, grid in grids.items():
        teams = grid.get("teams") or []
        if code in EUROPE:
            if grid.get("_fresh") is not True or not club.get("slug"):
                continue
            team = next((t for t in teams if t.get("sorare_slug") == club["slug"]), None)
            if team:
                found += _games(grid, team, COMPETITIONS[code], now, "sorare_slug")
        elif code in LEAGUES:
            known = {t["history_name"] for t in teams if t.get("history_name")}
            try:
                own = club_name({"name": club.get("name")}, known) if club.get("name") else None
            except ValueError:  # a club the board does not know is no club of this league
                own = None
            team = next((t for t in teams if own and t.get("history_name") == own), None)
            if team:
                found += _games(grid, team, LEAGUES[code], now, "history_name")
    return sorted(found, key=lambda g: g["kickoff"])


def _league(player: dict[str, Any]) -> str | None:
    slug = (((player.get("activeClub") or {}).get("domesticLeague")) or {}).get("slug")
    if slug == LALIGA:
        return "LL"
    return next((code for code, league in LEAGUES.items() if league == slug), None)


def build(
    rows: Iterable[dict[str, Any]],
    history: dict[str, list[dict[str, Any]]],
    scorer: Scorer,
    laliga: dict[str, Any] | None,
    grids: dict[str, dict[str, Any]],
    now: datetime,
) -> dict[str, dict[str, Any]]:
    """{league code: {horizonDays, players: {slug: [[kickoff, competition, venue, opponent, xs, xs if he comes on, decisive chance, v3 shape]]}}}."""
    out: dict[str, dict[str, Any]] = {}
    seen: set[str] = set()
    for row in rows:
        player = row.get("player") or {}
        # A league no board covers (Liga Portugal, Eredivisie...) still has its European games: they go under "EU".
        slug, league = player.get("slug"), _league(player) or "EU"
        if not slug or slug in seen:
            continue
        seen.add(slug)
        listed = []
        for game in club_games(player, laliga, grids, now):
            made = scorer(player, [game], None, history.get(slug) or [])
            found = made.outcomes[0] if len(made.outcomes) == 1 else None
            if found is None:
                continue
            # v3's whole model (publish.v3_shape): v0's game, kept beside Sofix v1's number or as the number itself
            before = getattr(found, "previous_outcome", None) or (None if hasattr(found, "previous_outcome") else found)
            sub = getattr(found, "sub", None)
            on = getattr(getattr(sub, "outcome", None), "start", None)
            listed.append(
                [
                    game["kickoff"],
                    game["competition"],
                    game["venue"],
                    game["opponent"],
                    round(found.start, 1),
                    round(on, 1) if on is not None else None,
                    round(found.p_decisive, 3),
                    v3_shape(before) if before is not None else None,
                ]
            )
        if listed:
            out.setdefault(league, {"horizonDays": HORIZON_DAYS, "players": {}})["players"][slug] = listed
    return out


MARKS = (
    35,
    21,
    14,
    7,
    2,
)  # days before kick-off at which each game's xS is kept, to measure the miss by distance (plans/xs-ahead.md 4)
SAID = "xs_ahead_said"
KEEP_DAYS = 30  # a settled game stays this long, for the Audit to score it against what he really did


def remember(
    said: dict[str, dict[str, float]], blocks: dict[str, dict[str, Any]], now: datetime
) -> dict[str, dict[str, float]]:
    """{player|competition|day: {mark: xS}}: each game's number the first run it was at most that many days away; nothing is rewritten.
    LaLiga players and the owner's cards only (the LL block), which keeps it near half a megabyte."""
    out = {
        key: marks
        for key, marks in said.items()
        if _at(key.rsplit("|", 1)[1] + "T00:00:00+00:00") >= now - timedelta(days=KEEP_DAYS)
    }
    for slug, games in (blocks.get("LL") or {}).get("players", {}).items():
        for kickoff, competition, *_rest in games:
            xs = _rest[2]
            days = (_at(kickoff) - now).total_seconds() / 86_400
            key = f"{slug}|{competition}|{kickoff[:10]}"
            marks = dict(out.get(key) or {})
            for mark in MARKS:
                if days <= mark and str(mark) not in marks:
                    marks[str(mark)] = xs
            if marks:
                out[key] = marks
    return out


def publish(
    db: Any,
    snapshot: dict[str, Any],
    scorer: Scorer,
    grids: dict[str, dict[str, Any]],
    now: datetime,
    *,
    write: bool = True,
) -> dict[str, int]:
    """One block per league (`xs_ahead:<code>`): the owner's cards, every LaLiga player and every player of the indexed leagues."""
    from app.services import kept_blocks
    from app.services.publish import put
    from app.sorare.foreign_coverage import rows as indexed

    kept = kept_blocks.read(db, "grid")
    laliga = (kept.payload or {}).get("data") if kept and isinstance(kept.payload, dict) else None
    rows = [
        *(snapshot.get("cards") or []),
        *(snapshot.get("market") or []),
        *(p for index in (snapshot.get("foreign") or {}).values() for p in indexed(index)),
    ]
    history = {slug: entry.get("games") or [] for slug, entry in (snapshot.get("leagueHistory") or {}).items()}
    history.update(snapshot.get("history") or {})
    blocks = build(rows, history, scorer, laliga, grids, now)
    if write:
        for code, block in blocks.items():
            put(db, f"{PREFIX}{code}", block, now)
        before = kept_blocks.read(db, SAID)
        kept_said = before.payload.get("games") if before and isinstance(before.payload, dict) else None
        put(db, SAID, {"games": remember(kept_said or {}, blocks, now)}, now)
    return {code: len(block["players"]) for code, block in blocks.items()}
