"""football-data.org v4 client: typed payloads, retries within the free tier (10 requests/minute)."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import date, datetime

import httpx
from pydantic import BaseModel, ConfigDict

from app.config import settings

BASE = "https://api.football-data.org/v4"
RETRY_STATUSES = {429, 500, 502, 503, 504}
MAX_WAIT_SECONDS = 65  # the free tier's counter resets every minute

logger = logging.getLogger(__name__)


class TeamRef(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: int | None = None  # null for undecided knockout slots (e.g. Champions League)
    name: str | None = None
    shortName: str | None = None  # camelCase: field names match the API
    tla: str | None = None


class FullTime(BaseModel):
    model_config = ConfigDict(extra="ignore")
    home: int | None = None
    away: int | None = None


class Score(BaseModel):
    model_config = ConfigDict(extra="ignore")
    fullTime: FullTime = FullTime()


class Season(BaseModel):
    model_config = ConfigDict(extra="ignore")
    startDate: date | None = None


class MatchPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: int
    utcDate: datetime
    status: str | None = None
    matchday: int | None = None
    homeTeam: TeamRef
    awayTeam: TeamRef
    score: Score = Score()
    season: Season = Season()

    @property
    def teams_known(self) -> bool:
        return self.homeTeam.id is not None and self.awayTeam.id is not None


Sleep = Callable[[float], Awaitable[None]]


class FootballDataOrg:
    def __init__(self, token: str | None = None, client: httpx.AsyncClient | None = None, sleep: Sleep = asyncio.sleep):
        token = token if token is not None else settings.football_data_org_token
        if not token:
            raise RuntimeError("FOOTBALL_DATA_ORG_TOKEN required")
        self.headers = {"X-Auth-Token": token}
        self.client = client
        self.sleep = sleep

    async def matches(self, season: int | None = None, competition: str | None = None, max_attempts: int = 3) -> dict:
        """One competition's matches. Retries rate limits and server errors, never more than 3 calls."""
        competition = competition or settings.football_data_org_competition
        url = f"{BASE}/competitions/{competition}/matches"
        params = {} if season is None else {"season": season}
        client = self.client or httpx.AsyncClient(timeout=30)
        try:
            for attempt in range(1, max_attempts + 1):
                try:
                    response = await client.get(url, headers=self.headers, params=params)
                except httpx.TransportError as exc:  # timeouts, connection resets
                    if attempt == max_attempts:
                        raise
                    wait = 2.0**attempt
                    logger.warning("football-data.org %s; retrying in %.0fs", type(exc).__name__, wait)
                    await self.sleep(wait)
                    continue
                if response.status_code in RETRY_STATUSES and attempt < max_attempts:
                    wait = retry_after(response, attempt)
                    logger.warning("football-data.org returned %d; retrying in %.0fs", response.status_code, wait)
                    await self.sleep(wait)
                    continue
                response.raise_for_status()
                return response.json()
            raise RuntimeError("unreachable")  # pragma: no cover
        finally:
            if self.client is None:
                await client.aclose()


def retry_after(response: httpx.Response, attempt: int) -> float:
    """Seconds to wait: the API's counter-reset header when present, else exponential backoff."""
    for header in ("X-RequestCounter-Reset", "Retry-After"):
        value = response.headers.get(header)
        if value and value.strip().isdigit():
            return min(float(value), MAX_WAIT_SECONDS)
    return min(2.0**attempt, MAX_WAIT_SECONDS)


def parse_matches(payload: dict) -> tuple[list[MatchPayload], int]:
    """Valid matches with both teams known, and how many were skipped."""
    parsed: list[MatchPayload] = []
    skipped = 0
    for raw in payload.get("matches", []):
        try:
            match = MatchPayload.model_validate(raw)
        except ValueError:
            skipped += 1
            continue
        if not match.teams_known:
            skipped += 1
            continue
        parsed.append(match)
    return parsed, skipped
