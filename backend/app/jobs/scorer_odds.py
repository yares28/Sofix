"""Bookmakers' player prices for each LaLiga game, saved once before kick-off (needs ODDS_API_KEY; skipped without it).

    python -m app.jobs.scorer_odds

Research record only, nothing reads it yet: the chance of a goal, an assist or a shot on target that bookmakers gave each
player, to test later whether it sharpens the xScore (plans/laliga-accuracy-evidence.md). The Odds API lists these
markets for LaLiga from US bookmakers only, one game per call. Listing the games is free; a game's prices cost one credit
per market returned (at most 3). Each game is saved once, at the first refresh within WINDOW of its kick-off that finds
prices, as `scorer_odds:<event id>`; a game with no prices yet costs nothing and is tried again at the next refresh.
RESERVE credits are always left for the match odds (jobs/sync_odds.py). The key travels in the query: never log a URL.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.logging_config import configure_logging
from app.models import ReadModel
from app.services import publish

BASE = "https://api.the-odds-api.com/v4/sports/soccer_spain_la_liga"
MARKETS = ("player_goal_scorer_anytime", "player_assists", "player_shots_on_target")
REGIONS = "us"
WINDOW = timedelta(hours=30)
RESERVE = 150  # the match odds use up to ~240 a month; 500 in all
PREFIX = "scorer_odds:"
logger = logging.getLogger(__name__)


async def _get(http: httpx.AsyncClient, url: str, params: dict[str, str]) -> tuple[Any, int | None]:
    try:
        response = await http.get(url, params=params)
    except httpx.HTTPError as exc:  # its message can carry the request URL, and with it the key
        raise RuntimeError(f"The Odds API request failed: {type(exc).__name__}") from None
    if response.status_code in (401, 403):
        raise PermissionError(f"The Odds API refused the key (HTTP {response.status_code}); check ODDS_API_KEY")
    if response.status_code == 429:
        raise RuntimeError("The Odds API: out of credits or rate limited (HTTP 429)")
    if response.is_error:  # not raise_for_status(): its message includes the URL with the key
        raise RuntimeError(f"The Odds API: HTTP {response.status_code}")
    remaining = response.headers.get("x-requests-remaining")
    return response.json(), int(float(remaining)) if remaining else None


def prices(event: dict[str, Any]) -> dict[str, dict[str, list[list[Any]]]]:
    """{market: {player: [[bookmaker, outcome, line, decimal price], ...]}}, as the bookmakers name the players."""
    found: dict[str, dict[str, list[list[Any]]]] = {}
    for book in event.get("bookmakers") or []:
        for market in book.get("markets") or []:
            for o in market.get("outcomes") or []:
                player, price = o.get("description"), o.get("price")
                if market.get("key") in MARKETS and player and isinstance(price, int | float):
                    row = [book.get("key"), o.get("name"), o.get("point"), float(price)]
                    found.setdefault(market["key"], {}).setdefault(player, []).append(row)
    return found


async def main(
    session_factory: Callable[[], Session] = SessionLocal,
    client: httpx.AsyncClient | None = None,
    now: datetime | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    key = settings.odds_api_key if api_key is None else api_key
    if not key:
        return {"skipped": "no ODDS_API_KEY"}
    now = now or datetime.now(UTC)
    http = client or httpx.AsyncClient(timeout=30)
    db = session_factory()
    saved: list[str] = []
    empty: list[str] = []
    held: list[str] = []
    try:
        events, remaining = await _get(http, f"{BASE}/events", {"apiKey": key, "dateFormat": "iso"})
        for event in events:
            name = f"{event.get('home_team')} v {event.get('away_team')}"
            kickoff = datetime.fromisoformat(str(event.get("commence_time")).replace("Z", "+00:00"))
            block = PREFIX + str(event.get("id"))
            if not (now < kickoff <= now + WINDOW) or db.query(ReadModel.key).filter(ReadModel.key == block).first():
                continue
            if remaining is not None and remaining - len(MARKETS) < RESERVE:
                held.append(name)
                continue
            params = {
                "apiKey": key,
                "regions": REGIONS,
                "markets": ",".join(MARKETS),
                "oddsFormat": "decimal",
                "dateFormat": "iso",
            }
            odds, remaining = await _get(http, f"{BASE}/events/{event['id']}/odds", params)
            found = prices(odds)
            if not found:
                empty.append(name)
                continue
            payload = {
                "eventId": event["id"],
                "home": event.get("home_team"),
                "away": event.get("away_team"),
                "kickoff": kickoff.isoformat(),
                "capturedAt": now.isoformat(),
                "hoursBefore": round((kickoff - now).total_seconds() / 3600, 1),
                "markets": found,
            }
            publish.put(db, block, payload, now)
            saved.append(name)
    finally:
        db.close()
        if client is None:
            await http.aclose()
    if held:
        logger.warning("scorer odds: %d games held back to keep %d credits for the match odds", len(held), RESERVE)
    logger.info("scorer odds: saved %d games, %d without prices yet", len(saved), len(empty))
    return {"saved": saved, "noPrices": empty, "held": held, "credits_remaining": remaining}


if __name__ == "__main__":
    configure_logging()
    print(asyncio.run(main()))
