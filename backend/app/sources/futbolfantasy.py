"""Futbol Fantasy's expected starting chances for LaLiga, kept to compare with Sorare's and Sofix's own (TODO.md, T2).

The site lists, for each LaLiga team, every player with the chance it gives him of starting the next round
(`data-probabilidad="80%"` on his row). It has no API and its robots.txt blocks nothing, so this is polite by
construction: a clear user agent, one request per team page (twenty, plus the page that names them), a pause between them,
one retry on a server error, and the caller reads it only a few times a day. A team that fails is left out; nothing stands
in for a page that could not be read. It also never holds the refresh it is part of: the whole read has a time budget,
and a site that stops answering is left alone after a few pages in a row fail.

These numbers are only stored and compared for now. Nothing on screen uses them until they have proved themselves.
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from html.parser import HTMLParser

import httpx

from app.sources.understat import League, Player

logger = logging.getLogger(__name__)

BASE = "https://www.futbolfantasy.com"
LINEUPS = f"{BASE}/laliga/posibles-alineaciones"
USER_AGENT = "Sofix/1.0 (personal, read-only; one request per team per fetch)"
PAUSE = 2.0  # seconds between two team pages
TIMEOUT = 12.0  # for one request: a page that is not answering is not waited for
BUDGET = 150.0  # seconds for the whole read; a normal one takes about a minute, and the refresh has fifteen
GIVE_UP = 3  # team pages in a row that could not be read: the site is not answering, so it is left alone


class FutbolFantasyError(RuntimeError):
    pass


@dataclass(frozen=True)
class Chance:
    team: str  # "Real Sociedad"
    slug: str  # "mikel-oyarzabal"
    name: str  # "Mikel Oyarzabal": the slug with accents lost, which is enough to match by
    chance: float  # 0 to 1: the chance it gives him of starting the next round
    international: bool  # called up by his national team
    lesion: int  # the site's own injury field, kept as it is: its scale is not known (-1 for most players)
    suspended: bool


@dataclass(frozen=True)
class Snapshot:
    round: int | None  # the LaLiga round all of it is about ("Jornada 8")
    chances: list[Chance] = field(default_factory=list)

    def as_league(self) -> League:
        """The same players in the shape the name matching already reads (Understat's), so it is not written twice."""
        return League(
            players=[
                Player(id=c.slug, name=c.name, team=c.team, games=0, minutes=0.0, xg=0.0, npxg=0.0, position="M")
                for c in self.chances
            ]
        )

    def by_id(self) -> dict[str, Chance]:
        return {c.slug: c for c in self.chances}


_TEAM_LINK = re.compile(r'href="(?:https://www\.futbolfantasy\.com)?/laliga/equipos/([a-z0-9-]+)(?=["/?#])')
_ROUND = re.compile(r"<title>[^<]*?Jornada\s+(\d+)", re.I)


def team_slugs(html: str) -> list[str]:
    """The teams the lineups page links to, in its order, each once."""
    return list(dict.fromkeys(_TEAM_LINK.findall(html)))


def round_of(html: str) -> int | None:
    match = _ROUND.search(html)
    return int(match.group(1)) if match else None


def _flag(value: str | None) -> int:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return 0


class _Rows(HTMLParser):
    """Every tag that carries both a player's name and his chance, whatever else is on it or in which order."""

    def __init__(self) -> None:
        super().__init__()
        self.rows: list[dict[str, str | None]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        wanted = dict(attrs)
        if wanted.get("data-nombre") and wanted.get("data-probabilidad"):
            self.rows.append(wanted)


def parse_team(html: str, slug: str) -> list[Chance]:
    """One team page's players. A row whose chance cannot be read, or is not between 0 and 100, is skipped."""
    parser = _Rows()
    parser.feed(html)
    team = slug.replace("-", " ").title()
    out: list[Chance] = []
    for row in parser.rows:
        try:
            chance = int(str(row["data-probabilidad"]).strip().rstrip("%")) / 100
        except ValueError:
            continue
        if not 0 <= chance <= 1:
            continue
        name = str(row["data-nombre"])
        out.append(
            Chance(
                team=team,
                slug=name,
                name=name.replace("-", " ").title(),
                chance=chance,
                international=_flag(row.get("data-internacional")) == 1,
                lesion=_flag(row.get("data-lesion")),
                suspended=_flag(row.get("data-sancionado")) == 1,
            )
        )
    return out


def _get(client: httpx.Client, url: str) -> str:
    """One page. One retry on a server error or a timeout, none on anything else."""
    for attempt in range(2):
        try:
            response = client.get(url)
            if response.status_code >= 500 and attempt == 0:
                continue
            response.raise_for_status()
            return response.text
        except httpx.TimeoutException as exc:
            if attempt == 0:
                continue
            raise FutbolFantasyError(f"{url}: timed out") from exc
        except httpx.HTTPError as exc:
            raise FutbolFantasyError(f"{url}: {exc}") from exc
    raise FutbolFantasyError(f"{url}: no answer")


def fetch_all(
    client: httpx.Client | None = None,
    pause: float = PAUSE,
    budget: float = BUDGET,
    clock: Callable[[], float] = time.monotonic,
) -> Snapshot | None:
    """Every team's chances for the next round, or None when the page that names the teams cannot be read.

    A read that runs out of time, or meets `GIVE_UP` unreadable pages in a row, stops where it is and returns the teams it
    has; the others are left out like any team that failed.
    """
    started = clock()
    http = client or httpx.Client(timeout=TIMEOUT, follow_redirects=True, headers={"User-Agent": USER_AGENT})
    try:
        try:
            lineups = _get(http, LINEUPS)
        except FutbolFantasyError as error:
            logger.warning("futbolfantasy: the lineups page could not be read, no chances this time (%s)", error)
            return None
        slugs = team_slugs(lineups)
        if not slugs:
            logger.warning("futbolfantasy: the lineups page names no teams, no chances this time")
            return None
        chances: list[Chance] = []
        failed = 0  # team pages in a row that could not be read
        for index, slug in enumerate(slugs):
            if clock() - started >= budget:
                logger.warning("futbolfantasy: out of time after %d of %d teams, the rest left out", index, len(slugs))
                break
            if index and pause:
                time.sleep(pause)
            try:
                chances.extend(parse_team(_get(http, f"{BASE}/laliga/equipos/{slug}"), slug))
                failed = 0
            except FutbolFantasyError as error:
                logger.warning("futbolfantasy: %s left out (%s)", slug, error)
                failed += 1
                if failed >= GIVE_UP:
                    logger.warning("futbolfantasy: %d pages in a row could not be read, the rest left out", failed)
                    break
        return Snapshot(round=round_of(lineups), chances=chances)
    finally:
        if client is None:
            http.close()
