"""LaLiga match odds from The Odds API (https://the-odds-api.com, free Starter plan: 500 credits/month).

One call returns every upcoming LaLiga event with win/draw/loss (`h2h`) and over/under (`totals`) prices
from EU bookmakers. It costs 2 credits (2 markets × 1 region); jobs/sync_odds.py throttles how often it runs.
The key travels as a query parameter, so never log the request URL (httpx is kept at WARNING).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx

URL = "https://api.the-odds-api.com/v4/sports/soccer_spain_la_liga/odds"
MARKETS = "h2h,totals"
REGIONS = "eu"
TOTAL_LINE = 2.5


@dataclass(frozen=True)
class EventOdds:
    home_team: str
    away_team: str
    commence_time: datetime
    h2h: list[tuple[float, float, float]]  # per bookmaker: home, draw, away
    totals: list[tuple[float, float]]  # per bookmaker: over 2.5, under 2.5


@dataclass(frozen=True)
class OddsResponse:
    events: list[EventOdds]
    credits_remaining: int | None


def parse_event(event: dict[str, Any]) -> EventOdds | None:
    home, away = event.get("home_team"), event.get("away_team")
    commence = event.get("commence_time")
    if not home or not away or not commence:
        return None
    h2h: list[tuple[float, float, float]] = []
    totals: list[tuple[float, float]] = []
    for bookmaker in event.get("bookmakers") or []:
        for market in bookmaker.get("markets") or []:
            outcomes = market.get("outcomes") or []
            if market.get("key") == "h2h":
                prices = {o.get("name"): o.get("price") for o in outcomes}
                row = (prices.get(home), prices.get("Draw"), prices.get(away))
                if all(isinstance(p, int | float) for p in row):
                    h2h.append((float(row[0]), float(row[1]), float(row[2])))  # type: ignore[arg-type]
            elif market.get("key") == "totals":
                line = {o.get("name"): o.get("price") for o in outcomes if o.get("point") == TOTAL_LINE}
                over, under = line.get("Over"), line.get("Under")
                if isinstance(over, int | float) and isinstance(under, int | float):
                    totals.append((float(over), float(under)))
    return EventOdds(
        home_team=home,
        away_team=away,
        commence_time=datetime.fromisoformat(str(commence).replace("Z", "+00:00")),
        h2h=h2h,
        totals=totals,
    )


async def fetch_laliga_odds(api_key: str, client: httpx.AsyncClient) -> OddsResponse:
    params = {"apiKey": api_key, "regions": REGIONS, "markets": MARKETS, "oddsFormat": "decimal", "dateFormat": "iso"}
    try:
        response = await client.get(URL, params=params)
    except httpx.HTTPError as exc:  # its message can carry the request URL, and with it the key
        raise RuntimeError(f"The Odds API request failed: {type(exc).__name__}") from None
    if response.status_code in (401, 403):
        raise PermissionError(f"The Odds API refused the key (HTTP {response.status_code}); check ODDS_API_KEY")
    if response.status_code == 429:
        raise RuntimeError("The Odds API: out of credits or rate limited (HTTP 429)")
    if response.is_error:  # not raise_for_status(): its message includes the URL with the key
        raise RuntimeError(f"The Odds API: HTTP {response.status_code}")
    remaining = response.headers.get("x-requests-remaining")
    events = []
    for event in response.json():
        try:
            parsed = parse_event(event)
        except (ValueError, TypeError):  # one malformed event must not cost the whole sync
            continue
        if parsed:
            events.append(parsed)
    return OddsResponse(events=events, credits_remaining=int(float(remaining)) if remaining else None)
