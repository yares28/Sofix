"""Read-only access to Sorare's public GraphQL API.

The key (SORARE_API_KEY) only raises the rate limit; everything this asks for is public: gameweeks, competitions
with their rules and rewards, past rankings, and a manager's cards by username. Nothing is ever written to Sorare —
saving a lineup needs the sorare.com session and belongs to the extension.

Limits Sorare documents and this respects: 200 requests a minute, and 30,000 "complexity" per query, which is why
the queries are small and paged.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

ENDPOINT = "https://api.sorare.com/federation/graphql"
PAUSE = 0.35  # seconds between calls: about 170 a minute, under Sorare's 200
TIMEOUT = 40.0
RETRIES = 3


class SorareError(RuntimeError):
    pass


class SorareClient:
    """One HTTP client for a job run. `query` returns the `data` object and raises on errors."""

    def __init__(self, api_key: str | None = None, pause: float = PAUSE, client: httpx.Client | None = None) -> None:
        self.api_key = api_key if api_key is not None else settings.sorare_api_key
        self.pause = pause
        self.calls = 0
        self._client = client or httpx.Client(
            timeout=TIMEOUT,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Sofix/1.0 (personal, read-only)",
                **({"APIKEY": self.api_key} if self.api_key else {}),
            },
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> SorareClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def query(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        last: Exception | None = None
        for attempt in range(RETRIES):
            if self.pause:
                time.sleep(self.pause)
            self.calls += 1
            try:
                response = self._client.post(ENDPOINT, json={"query": query, "variables": variables or {}})
            except httpx.HTTPError as exc:  # network trouble: back off and try again
                last = exc
                time.sleep(2 * (attempt + 1))
                continue
            if response.status_code == 429:
                time.sleep(5 * (attempt + 1))
                last = SorareError("rate limited")
                continue
            if response.status_code >= 500:
                time.sleep(2 * (attempt + 1))
                last = SorareError(f"HTTP {response.status_code}")
                continue
            body = response.json()
            if body.get("errors"):
                # One bad field should not kill a whole sync; the caller decides what to do without it.
                raise SorareError(str(body["errors"])[:400])
            data = body.get("data")
            if data is None:
                raise SorareError("no data in the answer")
            return data
        raise SorareError(f"gave up after {RETRIES} tries: {last}")
