"""Understat's season player and team xG, for the sorare.com overlay (plans/overlay.md, O11).

Understat publishes each league's players (games, minutes, xG, non-penalty xG) and each team's game-by-game xG for free
and without a key, but has no official API, so this is polite by construction: one request per league per refresh, only
for leagues the owner has players in, a clear user agent, and one retry on a server error. A league that fails is left out
and its players show no xG: an old number is never made to stand in for it.

It covers the big five leagues and the Russian league. Nothing free and official covers MLS, Brazil or national teams.
"""

from __future__ import annotations

import gzip
import json
import logging
import time
import zlib
from dataclasses import dataclass, field
from datetime import date
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE = "https://understat.com/getLeagueData"
USER_AGENT = "Sofix/1.0 (personal, read-only; one request per league per refresh)"
PAUSE = 1.0  # seconds between two leagues
TIMEOUT = 30.0

# Sorare's domestic league slug -> Understat's league name.
LEAGUES = {
    "laliga-es": "La_liga",
    "premier-league-gb-eng": "EPL",
    "bundesliga-de": "Bundesliga",
    "serie-a-it": "Serie_A",
    "ligue-1-fr": "Ligue_1",
    "russian-premier-league": "RFPL",
}


class UnderstatError(RuntimeError):
    pass


@dataclass(frozen=True)
class Player:
    id: str
    name: str
    team: str  # a player who moved mid-season lists both clubs: "Atletico Madrid,Deportivo La Coruna"
    games: int
    minutes: float
    xg: float
    npxg: float
    position: str  # Understat's letters, "F", "M S", "D", "GK"


@dataclass(frozen=True)
class League:
    players: list[Player] = field(default_factory=list)
    team_xg: dict[str, float] = field(default_factory=dict)  # a team's average xG per game so far


def season_of(day: date) -> int:
    """The year the season started: 2026 is 2026/27, and a new one opens in July."""
    return day.year if day.month >= 7 else day.year - 1


def parse(payload: Any) -> League:
    """The players and team averages out of one getLeagueData answer. Raises UnderstatError if it is not one."""
    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("players"), list)
        or not isinstance(payload.get("teams"), dict)
    ):
        raise UnderstatError("not league data")
    players: list[Player] = []
    for row in payload["players"]:
        try:
            players.append(
                Player(
                    id=str(row["id"]),
                    name=str(row["player_name"]),
                    team=str(row["team_title"]),
                    games=int(row["games"]),
                    minutes=float(row["time"]),
                    xg=float(row["xG"]),
                    npxg=float(row["npxG"]),
                    position=str(row["position"]),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue  # one player Understat wrote badly is skipped, not the league
    team_xg: dict[str, float] = {}
    for team in payload["teams"].values():
        try:
            games = [float(game["xG"]) for game in team["history"]]
            if games:
                team_xg[str(team["title"])] = sum(games) / len(games)
        except (KeyError, TypeError, ValueError):
            continue
    return League(players=players, team_xg=team_xg)


def _decode(response: httpx.Response) -> Any:
    raw = response.content
    if raw[:2] == b"\x1f\x8b":  # a gzip body that was not announced as one
        raw = gzip.decompress(raw)
    return json.loads(raw)


def fetch(client: httpx.Client, league: str, season: int) -> League:
    """One league's season so far. One retry on a server error or a timeout, none on anything else."""
    url = f"{BASE}/{league}/{season}"
    headers = {"X-Requested-With": "XMLHttpRequest", "Accept": "application/json"}
    for attempt in range(2):
        try:
            response = client.get(url, headers=headers)
            if response.status_code >= 500 and attempt == 0:
                continue
            response.raise_for_status()
            return parse(_decode(response))
        except httpx.TimeoutException as exc:
            if attempt == 0:
                continue
            raise UnderstatError(f"{league}: timed out") from exc
        except (httpx.HTTPError, ValueError, OSError, zlib.error) as exc:
            raise UnderstatError(f"{league}: {exc}") from exc
    raise UnderstatError(f"{league}: no answer")


def fetch_leagues(
    slugs: list[str], season: int, client: httpx.Client | None = None, pause: float = PAUSE
) -> dict[str, League]:
    """The leagues among `slugs` that Understat covers, keyed by Sorare's slug. One that fails is left out."""
    wanted = [slug for slug in dict.fromkeys(slugs) if slug in LEAGUES]
    if not wanted:
        return {}
    http = client or httpx.Client(timeout=TIMEOUT, follow_redirects=True, headers={"User-Agent": USER_AGENT})
    found: dict[str, League] = {}
    try:
        for index, slug in enumerate(wanted):
            if index and pause:
                time.sleep(pause)
            try:
                found[slug] = fetch(http, LEAGUES[slug], season)
            except UnderstatError as error:
                logger.warning("understat: %s left out, its players show no xG (%s)", slug, error)
    finally:
        if client is None:
            http.close()
    return found
