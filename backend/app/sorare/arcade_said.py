"""What every source said about each Arcade game before it kicked off (plans/arcade-trust.md step 7, owner 20 Nov 2026).

Arcade plays one game per card, so its evidence is frozen at each game's kick-off, not at Classic's gameweek lock. It is kept
apart from `player_games`' statement columns: those belong to the gameweek lock (FORECAST-PRELOCK-001), and the Classic Audit drops
a row whose capture time passes that lock, so a later Arcade reading there would erase a Classic statement.

One block per game, `arcade_said:<Game id>`: {game, kickoff, competition, players: {slug: {at, sofix, sorare, ff, sofixX, sofixStart,
sorareX}}}. Each refresh adds what the published markets say for every player whose next game is in the next 48 hours; a source
not read this time keeps its last number, an older delayed reading never replaces a newer one, and nothing is written once the
game has kicked off. Sorare's start % read in the owner's browser are kept by the app already (`sorare_chances:<Game id>`, with the
time each was seen). The step 9 calibration and the step 11 replay read both.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.services import kept_blocks
from app.services.publish import put

PREFIX = "arcade_said:"
AHEAD = timedelta(hours=48)
SOURCES = {"sofix": "sofix", "sorare": "sorare", "futbolfantasy": "ff"}


def collect(markets: Iterable[Iterable[dict[str, Any]]], at: datetime) -> dict[str, dict[str, Any]]:
    """The markets' numbers for each player's next game when it kicks off within 48 hours of `at`, grouped by game."""
    games: dict[str, dict[str, Any]] = {}
    for market in markets:
        for player in market:
            fixture = player.get("fixture") or {}
            game, kickoff = fixture.get("id"), fixture.get("kickoff")
            if not game or not kickoff or not player.get("slug"):
                continue
            kick = datetime.fromisoformat(kickoff)
            if not at < kick <= at + AHEAD:
                continue
            said: dict[str, Any] = {"at": at.isoformat()}
            for source, short in SOURCES.items():
                value = (player.get("sources") or {}).get(source)
                if value is not None:
                    said[short] = value
            for key, value in (
                ("sofixX", player.get("mu")),
                ("sofixStart", fixture.get("start")),
                ("sorareX", player.get("projection")),
            ):
                if value is not None:
                    said[key] = value
            entry = games.setdefault(
                game,
                {"game": game, "kickoff": kick.isoformat(), "competition": fixture.get("competition"), "players": {}},
            )
            entry["players"][player["slug"]] = said
    return games


def save(db: Session, games: dict[str, dict[str, Any]], now: datetime) -> int:
    """Merge into each game's block until its kick-off; returns the players written."""
    open_games = {game: block for game, block in games.items() if now < datetime.fromisoformat(block["kickoff"])}
    if not open_games:
        return 0
    kept = {row.key: row.payload for row in kept_blocks.read_many(db, [PREFIX + game for game in open_games])}
    written = 0
    for game, block in open_games.items():
        old = kept.get(PREFIX + game) or {}
        players = dict(old.get("players") or {})
        for slug, said in block["players"].items():
            before = players.get(slug) or {}
            if before.get("at") and datetime.fromisoformat(before["at"]) > datetime.fromisoformat(said["at"]):
                continue  # an older delayed reading never replaces a newer one
            players[slug] = {**before, **said}
            written += 1
        put(db, PREFIX + game, {**block, "players": players}, now)
    return written
