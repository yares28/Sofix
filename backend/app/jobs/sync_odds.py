"""Bookmaker odds for upcoming LaLiga fixtures, from The Odds API (needs ODDS_API_KEY; skipped without it).

    python -m app.jobs.sync_odds [--force]

Context for the board, not an input to the rating model. One API call (2 credits) returns every priced
game; runs closer together than MIN_INTERVAL are skipped so the free 500 credits/month last (at most 4 calls a
day ≈ 240 credits; the schedule alone makes ~68 calls a month). Each successful sync replaces every row: games
that left the feed (kicked off, re-dated, market pulled) lose their old prices.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.logging_config import configure_logging
from app.models import Fixture, MarketOdds, Team
from app.services.market_odds import consensus, fit_goal_rates
from app.services.team_registry import by_odds_name
from app.services.timeutil import as_utc
from app.sources.the_odds_api import EventOdds, fetch_laliga_odds

SOURCE = "the-odds-api"
MIN_INTERVAL = timedelta(hours=6)
MATCH_WINDOW = timedelta(hours=36)  # an event's start vs our kickoff (late time changes)
MIN_CREDITS = 10  # leave a margin on the monthly allowance
logger = logging.getLogger(__name__)


def match_fixture(event: EventOdds, fixtures: list[Fixture], codes: dict[int, str]) -> Fixture | None:
    """Our fixture for a bookmaker event: both clubs by name, kickoff within MATCH_WINDOW."""
    home, away = by_odds_name(event.home_team), by_odds_name(event.away_team)
    if home is None or away is None:
        return None
    for fx in fixtures:
        if (
            codes.get(fx.home_team_id) == home.code
            and codes.get(fx.away_team_id) == away.code
            and abs(as_utc(fx.kickoff_utc) - event.commence_time) <= MATCH_WINDOW
        ):
            return fx
    return None


async def main(
    session_factory: Callable[[], Session] = SessionLocal,
    client: httpx.AsyncClient | None = None,
    now: datetime | None = None,
    api_key: str | None = None,
    force: bool = False,
) -> dict:
    key = settings.odds_api_key if api_key is None else api_key
    if not key:
        logger.info("odds skipped: ODDS_API_KEY is not set")
        return {"skipped": "no ODDS_API_KEY"}
    now = now or datetime.now(UTC)
    db = session_factory()
    try:
        last = db.query(MarketOdds.fetched_at).order_by(MarketOdds.fetched_at.desc()).limit(1).scalar()
        if last is not None and not force and now - as_utc(last) < MIN_INTERVAL:
            hours = (now - as_utc(last)).total_seconds() / 3600
            logger.info("odds skipped: fetched %.1f h ago", hours)
            return {"skipped": f"fetched {hours:.1f} h ago"}

        http = client or httpx.AsyncClient(timeout=30)
        try:
            response = await fetch_laliga_odds(key, http)
        finally:
            if client is None:
                await http.aclose()

        upcoming = db.query(Fixture).filter(Fixture.kickoff_utc > now - timedelta(hours=3)).all()
        codes = {team.id: team.code or "" for team in db.query(Team).all()}
        written, unmatched = 0, []
        skipped = 0
        written_ids: set[int] = set()
        for event in response.events:
            fx = match_fixture(event, upcoming, codes)
            line = consensus(event.h2h, event.totals)
            if fx is None:
                unmatched.append(f"{event.home_team} v {event.away_team}")
                continue
            if line is None:
                continue
            try:
                home_goals, away_goals = fit_goal_rates(line)
            except (ValueError, ArithmeticError) as exc:  # one odd market must not cost the whole sync
                logger.warning("odds: skipped %s v %s: %s", event.home_team, event.away_team, exc)
                skipped += 1
                continue
            db.query(MarketOdds).filter(MarketOdds.fixture_id == fx.id).delete(synchronize_session=False)
            db.add(
                MarketOdds(
                    fixture_id=fx.id,
                    fetched_at=now,
                    source=SOURCE,
                    bookmakers=line.bookmakers,
                    p_home=line.home,
                    p_draw=line.draw,
                    p_away=line.away,
                    p_over_2_5=line.over_2_5,
                    home_goals=home_goals,
                    away_goals=away_goals,
                )
            )
            written += 1
            written_ids.add(fx.id)

        # Everything this sync didn't write is gone from the feed (kicked off, re-dated, market pulled).
        stale = db.query(MarketOdds).filter(MarketOdds.fixture_id.notin_(written_ids or {-1}))
        removed = stale.delete(synchronize_session=False)
        db.commit()
        if unmatched:
            logger.warning(
                "odds: %d events not matched to fixtures (add names to team_registry odds_names): %s",
                len(unmatched),
                "; ".join(unmatched),
            )
        if response.credits_remaining is not None and response.credits_remaining < MIN_CREDITS:
            logger.warning("odds: only %d API credits left this month", response.credits_remaining)
        logger.info("odds rows %d from %d events (%d removed)", written, len(response.events), removed)
        return {
            "events": len(response.events),
            "rows": written,
            "unmatched": unmatched,
            "removed": removed,
            "skipped": skipped,
            "credits_remaining": response.credits_remaining,
        }
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch LaLiga bookmaker odds.")
    parser.add_argument("--force", action="store_true", help=f"ignore the {MIN_INTERVAL} throttle")
    configure_logging()
    print(asyncio.run(main(force=parser.parse_args().force)))
