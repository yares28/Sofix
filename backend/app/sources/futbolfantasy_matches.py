"""Futbol Fantasy's probable lineups, read match by match (plans/futbolfantasy.md, S1).

The site has no API, and its robots.txt blocks nothing, so this is polite by construction: a clear user agent, a pause
between pages, one retry on a server error, a time budget for the whole read and a stop after a few unreadable pages in a
row. What it gives, for each competition it is asked about:

* the **round page** (`/<competition>/posibles-alineaciones`): the matches of the current round with their kickoff;
* one **match page** per match (about 1-2 MB of HTML): both teams' probable eleven drawn on a pitch (each player with his
  chance of starting, 0 to 100 in steps of 5 or 10), the alternatives in order of likelihood, the injuries and
  suspensions, and each coach's rotation and predictability gauges;
* a team page's **next matches**, for the days after a team has played while its round is still under way.

Futbol Fantasy's chance is for each team's *next game only*, and the site moves on to the following one about a day after
the team plays. Nothing here guesses: a page that does not look like what it was written for gives nothing, a number that
cannot be read is left out, and a read that fails never stands in for an old answer (the caller decides how long a read
may be reused).

Two things in the markup are worth knowing because the first parser missed them: goalkeepers are drawn with the class
`portero` instead of `campo`, so players are found by their `data-onceff` attribute; and `data-lesion` is a small code,
-1 for nothing, 0 for injured (out), 1 for a doubt, 2 for a knock he is available despite (read against the injury list).
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable, Iterable, Iterator, Mapping
from dataclasses import dataclass, field, fields, is_dataclass
from datetime import UTC, date, datetime, timedelta
from html.parser import HTMLParser
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

logger = logging.getLogger(__name__)

BASE = "https://www.futbolfantasy.com"
USER_AGENT = "Sofix/1.0 (personal, read-only; one request per match page per read)"
TIMEOUT = 12.0  # for one request: a page that is not answering is not waited for
PAUSE = 2.0  # seconds between two pages
BUDGET = 240.0  # seconds for the whole read: a LaLiga round is about 11 pages, a European matchday a dozen more
GIVE_UP = 3  # pages in a row that could not be read: the site is not answering, so it is left alone

# Futbol Fantasy's own address for each competition's lineup page, and what it calls it on the match page.
COMPETITIONS: dict[str, tuple[str, str]] = {
    "laliga": ("laliga", "LaLiga"),
    "champions": ("champions", "Champions League"),
    "europa-league": ("europa-league", "Europa League"),
    "copa-del-rey": ("copa-del-rey", "Copa del Rey"),
    "supercopa": ("supercopa-espana", "Supercopa de España"),
}
_BY_NAME = {name.lower(): key for key, (_, name) in COMPETITIONS.items()}
_MONTHS = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}
_LEVELS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}
OUT, DOUBT, AVAILABLE = 0, 1, 2  # `data-lesion`; -1 is no injury at all


# ---------------------------------------------------------------------------------------------------- what it reads
@dataclass(frozen=True)
class Level:
    """One of Futbol Fantasy's five-step gauges (1 is the calmest: "Sin rotaciones", "Muy previsible")."""

    value: int
    label: str


@dataclass(frozen=True)
class Player:
    ff_id: str  # the number in his shirt's class, `jugador_2675`: stable, unlike his spelling
    name: str
    slug: str | None  # his profile address, when the page gives one
    chance: float | None  # 0 to 1: the chance it gives him of starting this game
    lesion: int  # -1 none, 0 out, 1 doubt, 2 a knock he is available despite
    international: bool  # in a national squad
    suspended: bool
    yellows: int | None  # the season count in the cards column, when it is there
    reds: int | None
    nationality: str | None
    age: int | None = None  # in years, as the site shows it: what tells two players of one surname apart
    x: float | None = None  # where the eleven draws him, 0 to 100 across and 0 (attack) to 100 (goal) down; eleven only
    y: float | None = None
    goalkeeper: bool = False
    news: bool = False  # the site has a news item on him (its "Más info" pop-up)
    next: tuple[str, ...] = ()  # the profile slugs of who can come in for him in his slot, in the page's order (eleven only)


@dataclass(frozen=True)
class Absence:
    kind: str  # "out", "doubt", "available" or "suspended"
    name: str
    slug: str | None
    cause: str | None  # "Molestias en los isquiotibiales", or the ban's reason ("Doble amarilla")
    since: str | None  # "Desde 12/09 (18 días)", as the site writes it
    note: str | None  # "Duda para la jornada 8", "Baja hasta octubre"
    news_url: str | None = None


@dataclass(frozen=True)
class Side:
    name: str
    slug: str | None
    club_id: str | None  # the number in the crest's address (`escudom/16.png`), the same in every competition
    coach: str | None
    rotations: Level | None
    predictability: Level | None  # for this round
    season_predictability: float | None  # how predictable his lineups have been all season, 0 to 1
    xi: tuple[Player, ...] = ()
    alternatives: tuple[Player, ...] = ()
    absences: tuple[Absence, ...] = ()
    squad_published: bool | None = None  # the match squad ("Convocatorias"), once the club names it


@dataclass(frozen=True)
class Match:
    match_id: int
    url: str
    competition: str  # our key: "laliga", "champions", ...
    competition_name: str
    round_label: str | None  # "Jornada 8"
    round_no: int | None
    kickoff: datetime | None  # UTC
    score: tuple[int, int] | None  # None until it is played
    home: Side
    away: Side

    @property
    def played(self) -> bool:
        return self.score is not None


@dataclass(frozen=True)
class RoundMatch:
    """One line of a round page: enough to decide whether to read the match, and to find it."""

    match_id: int
    url: str
    home: str
    away: str
    home_id: str | None
    away_id: str | None
    kickoff: datetime | None
    score: tuple[int, int] | None = None


@dataclass(frozen=True)
class Round:
    competition: str
    competition_name: str
    label: str | None
    number: int | None
    matches: tuple[RoundMatch, ...] = ()


@dataclass(frozen=True)
class Upcoming:
    """A team's next match as its team page lists it (the page gives no year: it is worked out)."""

    match_id: int
    url: str
    competition: str | None  # the logo's name: "LaLiga", "Amistoso", "Europa League"
    phase: str | None  # "Jornada 8"
    kickoff: datetime | None
    home: str
    away: str
    home_id: str | None
    away_id: str | None


@dataclass
class Reading:
    """What one read brought back, and what it could not."""

    at: datetime
    matches: list[Match] = field(default_factory=list)
    rounds: dict[str, Round] = field(default_factory=dict)
    failed: list[str] = field(default_factory=list)  # addresses not read, each with a short reason
    stopped: str | None = None  # why it stopped early, if it did
    gone: list[int] = field(default_factory=list)  # matches the site answered 404 for: no longer there, not a failure


# ------------------------------------------------------------------------------------------------------ storing them
def to_dict(value: Any) -> Any:
    """Any of the above as plain JSON for a read model: datetimes as ISO strings, tuples as lists."""
    if is_dataclass(value) and not isinstance(value, type):
        return {f.name: to_dict(getattr(value, f.name)) for f in fields(value)}
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [to_dict(item) for item in value]
    if isinstance(value, dict):
        return {key: to_dict(item) for key, item in value.items()}
    return value


def _build(cls: type, data: dict[str, Any], **changes: Any) -> Any:
    """`cls` from a stored dict, keeping only the fields it has (a payload from an older or newer build still loads)."""
    known = {f.name for f in fields(cls)}
    return cls(**{**{key: value for key, value in data.items() if key in known}, **changes})


def _time(value: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if value else None
    except (TypeError, ValueError):
        return None


def _pair(value: Any) -> tuple[int, int] | None:
    return (int(value[0]), int(value[1])) if isinstance(value, (list, tuple)) and len(value) == 2 else None


def _player_from(data: dict[str, Any]) -> Player:
    return _build(Player, data, next=tuple(data.get("next") or ()))


def _side_from(data: dict[str, Any]) -> Side:
    def level(item: Any) -> Level | None:
        return _build(Level, item) if isinstance(item, dict) else None

    return _build(
        Side,
        data,
        rotations=level(data.get("rotations")),
        predictability=level(data.get("predictability")),
        xi=tuple(_player_from(item) for item in data.get("xi") or []),
        alternatives=tuple(_player_from(item) for item in data.get("alternatives") or []),
        absences=tuple(_build(Absence, item) for item in data.get("absences") or []),
    )


def match_from_dict(data: dict[str, Any]) -> Match:
    return _build(
        Match,
        data,
        kickoff=_time(data.get("kickoff")),
        score=_pair(data.get("score")),
        home=_side_from(data["home"]),
        away=_side_from(data["away"]),
    )


def round_from_dict(data: dict[str, Any]) -> Round:
    return _build(
        Round,
        data,
        matches=tuple(
            _build(RoundMatch, item, kickoff=_time(item.get("kickoff")), score=_pair(item.get("score")))
            for item in data.get("matches") or []
        ),
    )


# ------------------------------------------------------------------------------------------------ a small HTML tree
class Node:
    """One element. The pages are big and loosely written, so this keeps only what the parser below asks for."""

    __slots__ = ("attrs", "children", "parent", "tag", "_classes")

    def __init__(self, tag: str, attrs: dict[str, str], parent: Node | None) -> None:
        self.tag = tag
        self.attrs = attrs
        self.children: list[Node | str] = []
        self.parent = parent
        self._classes: frozenset[str] | None = None

    @property
    def classes(self) -> frozenset[str]:
        if self._classes is None:
            self._classes = frozenset(self.attrs.get("class", "").split())
        return self._classes

    def get(self, name: str) -> str | None:
        return self.attrs.get(name)

    def elements(self) -> Iterator[Node]:
        """This node's descendants in document order (not the node itself)."""
        stack = [iter(self.children)]
        while stack:
            for child in stack[-1]:
                if isinstance(child, Node):
                    yield child
                    stack.append(iter(child.children))
                    break
            else:
                stack.pop()

    def text(self) -> str:
        parts: list[str] = []
        stack: list[Iterator[Node | str]] = [iter(self.children)]
        while stack:
            for child in stack[-1]:
                if isinstance(child, str):
                    parts.append(child)
                else:
                    stack.append(iter(child.children))
                    break
            else:
                stack.pop()
        return re.sub(r"\s+", " ", " ".join(parts)).strip()

    def ancestors(self) -> Iterator[Node]:
        node = self.parent
        while node is not None:
            yield node
            node = node.parent


_VOID = frozenset(
    {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
)


class _Builder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("#root", {}, None)
        self._open: list[Node] = [self.root]
        self._raw: str | None = None  # inside <script> or <style>, whose text is nobody's business

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag, {key: (value or "") for key, value in attrs}, self._open[-1])
        self._open[-1].children.append(node)
        if tag in _VOID:
            return
        self._open.append(node)
        if tag in ("script", "style"):
            self._raw = tag

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._open[-1].children.append(Node(tag, {key: (value or "") for key, value in attrs}, self._open[-1]))

    def handle_endtag(self, tag: str) -> None:
        if self._raw is not None:
            if tag != self._raw:
                return
            self._raw = None
        for index in range(len(self._open) - 1, 0, -1):
            if self._open[index].tag == tag:
                del self._open[index:]
                return  # a stray end tag closes nothing

    def handle_data(self, data: str) -> None:
        if self._raw is None and data.strip():
            self._open[-1].children.append(data)


def parse_html(html: str) -> Node:
    builder = _Builder()
    builder.feed(html)
    builder.close()
    return builder.root


def _find_all(node: Node, tag: str | None = None, cls: str | tuple[str, ...] = (), **attrs: str | None) -> list[Node]:
    wanted = (cls,) if isinstance(cls, str) else cls
    out = []
    for item in node.elements():
        if tag is not None and item.tag != tag:
            continue
        if any(name not in item.classes for name in wanted):
            continue
        if any((item.get(key.replace("_", "-")) != value) for key, value in attrs.items() if value is not None):
            continue
        out.append(item)
    return out


def _find(node: Node, tag: str | None = None, cls: str | tuple[str, ...] = (), **attrs: str | None) -> Node | None:
    found = _find_all(node, tag, cls, **attrs)
    return found[0] if found else None


# ------------------------------------------------------------------------------------------------ small readers
def _madrid() -> Any:
    try:
        return ZoneInfo("Europe/Madrid")
    except ZoneInfoNotFoundError:  # pragma: no cover - a machine with no tz database (tzdata is in the lockfile)
        return None


def madrid_to_utc(local: datetime) -> datetime:
    """The site writes Madrid's clock with no offset. CEST runs from the last Sunday of March to the last of October."""
    zone = _madrid()
    if zone is not None:
        return local.replace(tzinfo=zone).astimezone(UTC)

    def last_sunday(year: int, month: int) -> date:  # pragma: no cover
        day = date(year, month + 1, 1) - timedelta(days=1) if month < 12 else date(year, 12, 31)
        return day - timedelta(days=(day.weekday() + 1) % 7)

    start = datetime.combine(last_sunday(local.year, 3), datetime.min.time()).replace(hour=2)  # pragma: no cover
    end = datetime.combine(last_sunday(local.year, 10), datetime.min.time()).replace(hour=3)  # pragma: no cover
    offset = 2 if start <= local < end else 1  # pragma: no cover
    return (local - timedelta(hours=offset)).replace(tzinfo=UTC)  # pragma: no cover


def _chance(value: str | None) -> float | None:
    """`"80%"` is 0.8. Anything that is not a whole percentage from 0 to 100 is no chance at all."""
    if value is None:
        return None
    match = re.fullmatch(r"\s*(\d{1,3})\s*%?\s*", value)
    if not match or int(match.group(1)) > 100:
        return None
    return int(match.group(1)) / 100


def _int(value: str | None) -> int | None:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _percent(value: str | None) -> float | None:
    match = re.search(r"(\d{1,3}(?:[.,]\d+)?)\s*%", value or "")
    return min(1.0, float(match.group(1).replace(",", ".")) / 100) if match else None


def _club_id(text: str | None) -> str | None:
    match = re.search(r"escudom?/(\d+)\.", text or "") or re.search(r"escudo-(\d+)", text or "")
    return match.group(1) if match else None


def _slug_of(href: str | None, kind: str) -> str | None:
    """`/jugadores/mikel-oyarzabal/laliga-26-27` is `mikel-oyarzabal`; `/laliga/equipos/deportivo` is `deportivo`."""
    match = re.search(rf"/{kind}/([a-z0-9][a-z0-9-]*)", href or "")
    return match.group(1) if match else None


def _title(slug: str) -> str:
    return slug.replace("-", " ").title()


def competition_of(name: str | None) -> tuple[str, str]:
    """Our key and Futbol Fantasy's name for a competition heading ("LaLiga 2026/27", "Champions League")."""
    clean = re.sub(r"\s*\d{4}/\d{2,4}\s*$", "", (name or "").strip())
    key = _BY_NAME.get(clean.lower())
    if key is not None:
        return key, COMPETITIONS[key][1]
    return re.sub(r"[^a-z0-9]+", "-", clean.lower()).strip("-") or "unknown", clean


def _when(text: str) -> datetime | None:
    """`Domingo, 11 de octubre del 2026 a las 16:15h`, Madrid time."""
    match = re.search(r"(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de(?:l)?\s+(\d{4})\D+(\d{1,2}):(\d{2})", text.lower())
    if not match or match.group(2) not in _MONTHS:
        return None
    try:
        return madrid_to_utc(
            datetime(
                int(match.group(3)),
                _MONTHS[match.group(2)],
                int(match.group(1)),
                int(match.group(4)),
                int(match.group(5)),
            )
        )
    except ValueError:
        return None


def _stamp(value: str | None) -> datetime | None:
    """`2026-10-11 16:15:00`, the round page's microdata, Madrid time."""
    try:
        return madrid_to_utc(datetime.fromisoformat((value or "").strip()))
    except ValueError:
        return None


def _short_when(text: str, today: date) -> datetime | None:
    """`Dom 11/10 16:15h` (no year): the first such date from a month before `today` on."""
    match = re.search(r"(\d{1,2})/(\d{1,2})\D+(\d{1,2}):(\d{2})", text)
    if not match:
        return None
    day, month, hour, minute = (int(part) for part in match.groups())
    for year in (today.year - 1, today.year, today.year + 1):
        try:
            candidate = datetime(year, month, day, hour, minute)
        except ValueError:
            return None
        if candidate.date() >= today - timedelta(days=31):
            return madrid_to_utc(candidate)
    return None


# ------------------------------------------------------------------------------------------------------ round page
def _round_match(link: Node, kickoff: datetime | None) -> RoundMatch | None:
    href = link.get("href") or ""
    found = re.search(r"/partidos/(\d+)-", href)
    if not found:
        return None
    sides: dict[str, Node] = {}
    for image in _find_all(link, "img", "escudo"):
        if "local" in image.classes:
            sides["home"] = image
        elif "visitante" in image.classes:
            sides["away"] = image
    if "home" not in sides or "away" not in sides:
        return None
    score = None
    home_goals, away_goals = _find(link, cls="score-local"), _find(link, cls="score-visitante")
    if home_goals is not None and away_goals is not None:
        a, b = _int(home_goals.text()), _int(away_goals.text())
        score = (a, b) if a is not None and b is not None else None
    if kickoff is None:
        kickoff = _short_when(link.text(), datetime.now(UTC).date())
    return RoundMatch(
        match_id=int(found.group(1)),
        url=href,
        home=(sides["home"].get("alt") or "").strip(),
        away=(sides["away"].get("alt") or "").strip(),
        home_id=_club_id(sides["home"].get("data-src") or sides["home"].get("src")),
        away_id=_club_id(sides["away"].get("data-src") or sides["away"].get("src")),
        kickoff=kickoff,
        score=score,
    )


def parse_round(html: str) -> Round | None:
    """The matches of the round a competition's lineup page is showing, or None if this is not such a page."""
    root = parse_html(html)
    heading = _find(root, "title")
    title = heading.text() if heading is not None else ""
    named = re.search(r"Probables de (.+?)\s+\d{4}/\d{2}", title)
    if not named:
        return None
    key, name = competition_of(named.group(1))
    number = re.search(r"Jornada\s+(\d+)", title)
    label = re.search(r"((?:Jornada|Ronda|Octavos|Cuartos|Semifinal|Final)[^-|]*?)\s+-\s+Futbol", title, re.I)
    # The page's own area. Its sidebar (`aside`) has a "next round" widget of the same markup with other competitions' matches in
    # it, friendlies and internationals dated with no year, and a competition that has no round yet (the Copa del Rey before its
    # draw) has nothing else on the page: those were read as its matches, about fifty dead pages on every run.
    own = _find(root, "main")
    scope = root if own is None else own
    box = _find(scope, "div", "matches")
    matches: list[RoundMatch] = []
    if box is not None:
        kickoff: datetime | None = None
        for child in box.children:
            if not isinstance(child, Node):
                continue
            if child.tag == "time" and child.get("itemprop") == "startDate":
                kickoff = _stamp(child.get("content"))
            elif "partido-container" in child.classes:
                link = _find(child, "a", "partido")
                found = _round_match(link, kickoff) if link is not None else None
                if found is not None:
                    matches.append(found)
                kickoff = None
    if not matches:  # a layout without the flat list: every match link in the page's own area, in order
        for link in _find_all(scope, "a", "partido"):
            found = _round_match(link, None)
            if found is not None and found.match_id not in {m.match_id for m in matches}:
                matches.append(found)
    return Round(
        competition=key,
        competition_name=name,
        label=label.group(1).strip() if label else (f"Jornada {number.group(1)}" if number else None),
        number=int(number.group(1)) if number else None,
        matches=tuple(matches),
    )


# ------------------------------------------------------------------------------------------------------ match page
def _modals(root: Node) -> dict[str, tuple[str | None, str | None]]:
    """The news pop-ups by their id: the player's name as the pop-up titles it, and his profile's slug."""
    found: dict[str, tuple[str | None, str | None]] = {}
    for modal in _find_all(root, "div", "modal-jugador"):
        ident = modal.get("id")
        if not ident:
            continue
        title = _find(modal, cls="modal-title")
        slug = None
        for link in _find_all(modal, "a"):
            slug = _slug_of(link.get("href"), "jugadores")
            if slug:
                break
        found[ident] = (title.text() if title is not None else None, slug)
    return found


def _icon_count(shirt: Node, icon: str) -> int | None:
    """The number under a card icon in a shirt's (hidden) cards column: `<img ...apercibido_box_min.png><span>3</span>`."""
    for image in _find_all(shirt, "img"):
        if icon in (image.get("src") or ""):
            parent = image.parent
            if parent is None:
                continue
            for sibling in parent.children:
                if isinstance(sibling, Node) and sibling.tag == "span":
                    return _int(sibling.text())
    return None


def _player(block: Node, modals: dict[str, tuple[str | None, str | None]]) -> Player | None:
    found = re.search(r"jugador_(\d+)", block.get("class") or "")
    shirt = _find(block, "a", "camiseta")
    if found is None or shirt is None:
        return None
    slug = _slug_of(shirt.get("href"), "jugadores")
    name = None
    target = (shirt.get("data-target") or "").lstrip("#")
    news = target in modals
    if news:
        name, modal_slug = modals[target]
        slug = slug or modal_slug
    if not name:
        for image in _find_all(shirt, "img"):
            alt = (image.get("alt") or "").strip()
            if alt and alt.lower() not in ("más info", "icono", "flag"):
                name = alt
                break
    if not name and slug:
        name = _title(slug)
    if not name:
        return None
    eleven = block.get("data-onceff") == "titular"  # the alternatives sit on a grid below the pitch: no place to keep
    x = _percent_position(block.get("data-onceff-x")) if eleven else None
    y = _percent_position(block.get("data-onceff-y")) if eleven else None
    lesion = _int(shirt.get("data-lesion"))
    return Player(
        ff_id=found.group(1),
        name=name,
        slug=slug,
        chance=_chance(shirt.get("data-probabilidad")),
        lesion=lesion if lesion is not None else -1,
        international=shirt.get("data-internacional") == "1",
        suspended=shirt.get("data-sancionado") == "1",
        yellows=_icon_count(shirt, "apercibido_box_min"),
        reds=_icon_count(shirt, "sancionadoR_box_min"),
        nationality=shirt.get("data-nacionalidad") or None,
        age=_int(shirt.get("data-edad")),
        x=x,
        y=y,
        goalkeeper="portero" in block.classes,
        news=news,
        next=_next_in_line(block) if eleven else (),
    )


def _next_in_line(block: Node) -> tuple[str, ...]:
    """Who can come in for a starter: under him the page lists himself (`pos-0`) and then, in order, the alternatives for his slot."""
    box = _find(block, "div", "juggadores")
    if box is None:
        return ()
    slugs = (_slug_of(link.get("href"), "jugadores") for link in _find_all(box, "a", "juggador") if "pos-0" not in link.classes)
    return tuple(slug for slug in slugs if slug)


def _percent_position(value: str | None) -> float | None:
    """`50%` is 50. The alternatives' rows are in pixels (`44px`), which mean nothing on a pitch."""
    match = re.fullmatch(r"\s*(\d{1,3}(?:\.\d+)?)%\s*", value or "")
    return float(match.group(1)) if match else None


def _role(node: Node) -> str | None:
    for ancestor in node.ancestors():
        if "local" in ancestor.classes:
            return "home"
        if "visitante" in ancestor.classes:
            return "away"
    return None


def _level(row: Node) -> Level | None:
    bar = _find(row, cls="prevision")
    label = _find(row, cls="porcentaje")
    if bar is None or label is None:
        return None
    value = next((_LEVELS[name] for name in bar.classes if name in _LEVELS), None)
    return Level(value, label.text()) if value is not None else None


def _coach(box: Node | None) -> tuple[str | None, Level | None, Level | None, float | None]:
    if box is None:
        return None, None, None, None
    name = _find(box, cls="nombre-entrenador")
    rotations = predictability = None
    season: float | None = None
    for row in _find_all(box, "div", "row"):
        label = _find(row, cls="col-5")
        if label is None or _find(row, cls="prevision-wrapper") is None:
            continue
        what = label.text().lower()
        if what.startswith("rotaciones"):
            rotations = _level(row)
        elif what.startswith("previsib. temp"):
            share = _find(row, cls="porcentaje")
            season = _percent(share.text() if share is not None else None)
        elif what.startswith("previsib"):
            predictability = _level(row)
    return (name.text() if name is not None else None), rotations, predictability, season


def _absences(root: Node, role: str) -> tuple[Absence, ...]:
    out: list[Absence] = []
    for item in _find_all(root, "div", "elemento"):
        if _role(item) != role:
            continue
        name_link = _find(item, "a", "jugador")
        if name_link is None:
            continue
        slug = _slug_of(name_link.get("href"), "jugadores")
        if "sancionado" in item.classes:
            reason = _find(item, cls="sancion")
            out.append(
                Absence("suspended", name_link.text(), slug, reason.text() if reason is not None else None, None, None)
            )
            continue
        if "lesionado" not in item.classes:
            continue
        gravity = next((_int(n.split("-")[1]) for n in _classes_of(item, "gravedad-")), None)
        kind = {OUT: "out", DOUBT: "doubt", AVAILABLE: "available"}.get(gravity if gravity is not None else -1)
        if kind is None:
            continue
        cause = _find(item, "span", "lesion")
        comment = _find(item, cls="comentario")
        since = note = None
        if comment is not None:
            for span in _find_all(comment, "span"):
                if "lesion" in span.classes:
                    continue
                if any(c.startswith("gravedad-") for c in span.classes):
                    note = span.text()
                elif span.text().lower().startswith("desde"):
                    since = span.text()
        link = _find(item, "a", "link")
        out.append(
            Absence(
                kind,
                name_link.text(),
                slug,
                cause.text() if cause is not None else None,
                since,
                note,
                link.get("href") if link is not None else None,
            )
        )
    return tuple(out)


def _classes_of(node: Node, prefix: str) -> list[str]:
    """Every class of this node and its descendants that starts with `prefix` (the gravity sits on a nested element)."""
    found: list[str] = [c for c in node.classes if c.startswith(prefix)]
    for item in node.elements():
        found.extend(c for c in item.classes if c.startswith(prefix))
    return found


def _side(
    root: Node,
    role: str,
    name: str,
    link: Node | None,
    crest: str | None,
    modals: dict[str, tuple[str | None, str | None]],
) -> Side:
    wrappers = _find_all(root, None, ("alineacion_superwrapper", "local" if role == "home" else "visitante"))
    coach_box = next((box for box in (_find(w, cls="entrenador-widget") for w in wrappers) if box is not None), None)
    coach, rotations, predictability, season = _coach(coach_box)
    xi: list[Player] = []
    alternatives: list[Player] = []
    for block in _find_all(root, "div", "camiseta-wrapper"):
        if _role(block) != role or block.get("data-onceff") not in ("titular", "suplente"):
            continue
        player = _player(block, modals)
        if player is None:
            continue
        (xi if block.get("data-onceff") == "titular" else alternatives).append(player)
    squad_box = _find(root, "section", "convocados")
    squad: bool | None = None
    if squad_box is not None:
        squad = "no disponible" not in squad_box.text().lower()
    return Side(
        name=name,
        slug=_slug_of(link.get("href") if link is not None else None, "equipos"),
        club_id=crest,
        coach=coach,
        rotations=rotations,
        predictability=predictability,
        season_predictability=season,
        xi=tuple(xi),
        alternatives=tuple(alternatives),
        absences=_absences(root, role),
        squad_published=squad,
    )


def parse_match(html: str, url: str | None = None) -> Match | None:
    """One match page: the header, both probable elevens, the alternatives, the injuries and suspensions."""
    root = parse_html(html)
    header = _find(root, "header", "encabezado-partido")
    if header is None:
        return None
    dates = _find_all(header, None, "fecha")
    heading = _find(header, "strong")
    if heading is None:
        return None
    competition_text, _, round_text = heading.text().partition(" - ")
    key, name = competition_of(competition_text)
    number = re.search(r"(\d+)", round_text)
    teams: dict[str, tuple[str, Node | None, str | None]] = {}
    for role, cls in (("home", "local"), ("away", "visitante")):
        box = _find(header, "div", ("equipo", cls))
        if box is None:
            return None
        label, crest = _find(box, cls="nombre"), _find(box, "img")
        crest_text = f"{crest.get('src') or ''} {' '.join(sorted(crest.classes))}" if crest is not None else None
        teams[role] = (label.text() if label is not None else "", _find(box, "a"), _club_id(crest_text))
    goals = [_int(node.text()) for node in _find_all(header, None, ("score",))]
    score = (goals[0], goals[1]) if len(goals) >= 2 and goals[0] is not None and goals[1] is not None else None
    match_id = re.search(r"/partidos/(\d+)-", url or "")
    if match_id is None:
        return None
    modals = _modals(root)
    home = _side(root, "home", *teams["home"], modals)
    away = _side(root, "away", *teams["away"], modals)
    if not home.xi and not away.xi:
        return None  # a page with no eleven on it is not a lineup page
    return Match(
        match_id=int(match_id.group(1)),
        url=url or "",
        competition=key,
        competition_name=name,
        round_label=round_text.strip() or None,
        round_no=int(number.group(1)) if number and round_text.lower().startswith("jornada") else None,
        kickoff=_when(dates[1].text()) if len(dates) > 1 else None,
        score=score,
        home=home,
        away=away,
    )


# ------------------------------------------------------------------------------------------------------- team page
def parse_upcoming(html: str, today: date | None = None) -> list[Upcoming]:
    """The "Próximos partidos" list of a team page, nearest first: how to find a team's next match in any competition."""
    today = today or datetime.now(UTC).date()
    root = parse_html(html)
    box = _find(root, "section", ("proximos",))
    if box is None:
        return []
    out: list[Upcoming] = []
    for link in _find_all(box, "a", "partido"):
        found = re.search(r"/partidos/(\d+)-", link.get("href") or "")
        local, visitor = _find(link, None, "local"), _find(link, None, "visitante")
        if not found or local is None or visitor is None:
            continue
        home, away = _find(local, "img"), _find(visitor, "img")
        logo = _find(link, cls="logo")
        logo_image = _find(logo, "img") if logo is not None else None
        phase, date_node = _find(link, cls="fase"), _find(link, cls="date")
        out.append(
            Upcoming(
                match_id=int(found.group(1)),
                url=link.get("href") or "",
                competition=(logo_image.get("alt") or None) if logo_image is not None else None,
                phase=phase.text() if phase is not None else None,
                kickoff=_short_when(date_node.text(), today) if date_node is not None else None,
                home=(home.get("alt") or "").strip() if home is not None else "",
                away=(away.get("alt") or "").strip() if away is not None else "",
                home_id=_club_id(home.get("src") if home is not None else None),
                away_id=_club_id(away.get("src") if away is not None else None),
            )
        )
    return out


# ---------------------------------------------------------------------------------------------------------- reading
# ------------------------------------------------------------------------------------------------------ a squad page
LINES = {"Portero": "GK", "Defensa": "DEF", "Mediocampista": "MID", "Delantero": "FWD"}
_SQUAD_SECTIONS = {"porteros": "GK", "defensas": "DEF", "mediocampistas": "MID", "delanteros": "FWD", "cedidos": None}


@dataclass(frozen=True)
class SquadMember:
    ff_id: (
        str  # the number in his photo's address (`ficha/1975.png`): the one the match pages give him in `jugador_1975`
    )
    name: str
    slug: str | None
    line: str  # "GK", "DEF", "MID" or "FWD": the site's own position for him
    on_loan: bool = False


@dataclass(frozen=True)
class Squad:
    club_id: str | None
    members: tuple[SquadMember, ...]


def parse_squad(html: str) -> Squad | None:
    """A club's squad page (`/laliga/equipos/<club>/plantilla`): every player with his number, profile and position.

    The page groups them as goalkeepers, defenders, midfielders and forwards, then those out on loan; a man's position is what
    the site writes beside his name, else the group he is in. A page with no player in it is not a squad page.
    """
    root = parse_html(html)
    members: list[SquadMember] = []
    for section in _find_all(root, "div", cls="posicion"):
        group = next((key for key in _SQUAD_SECTIONS if key in section.classes), None)
        if group is None:
            continue
        for item in _find_all(section, "div", cls="wjugador"):
            link = _find(item, "a", cls="jugador")
            photo = _find(item, "img")
            found = re.search(r"ficha/(\d+)\.", (photo.get("data-src") or photo.get("src") or "") if photo else "")
            if link is None or found is None:
                continue
            written = _find(item, "span", cls="posicion")
            line = LINES.get(written.text()) if written is not None else None
            line = line or _SQUAD_SECTIONS[group]
            if line is None:
                continue
            name = re.sub(r"^\s*\d+\s*\.\s*", "", link.text()).strip()
            members.append(
                SquadMember(found.group(1), name, _slug_of(link.get("href"), "jugadores"), line, group == "cedidos")
            )
    if not members:
        return None
    ids = [node.get("data-equipo") for node in root.elements() if node.get("data-equipo")]
    return Squad(ids[0] if ids else None, tuple(members))


@dataclass
class SquadReading:
    """What one ask of the squad pages gave: each club's squad by the club's number, and what could not be read."""

    at: datetime
    squads: dict[str, Squad] = field(default_factory=dict)
    failed: list[str] = field(default_factory=list)
    stopped: str | None = None


class FutbolFantasyError(RuntimeError):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status  # the HTTP status the site answered with, when it answered


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
        except httpx.HTTPStatusError as exc:
            raise FutbolFantasyError(f"{url}: HTTP {exc.response.status_code}", exc.response.status_code) from exc
        except httpx.HTTPError as exc:
            raise FutbolFantasyError(f"{url}: {type(exc).__name__}") from exc
    raise FutbolFantasyError(f"{url}: no answer")


def round_url(competition: str) -> str:
    return f"{BASE}/{COMPETITIONS[competition][0]}/posibles-alineaciones"


class _Polite:
    """The site asked one page at a time: a pause between pages, a time budget, one retry, and a stop after a few failures in a row."""

    def __init__(
        self,
        client: httpx.Client,
        pause: float,
        budget: float,
        clock: Callable[[], float],
        sleep: Callable[[float], None],
        failed: list[str],
    ) -> None:
        self.client, self.pause, self.budget, self.clock, self.sleep, self.failed = (
            client,
            pause,
            budget,
            clock,
            sleep,
            failed,
        )
        self.started = clock()
        self.failures = 0
        self.requests = 0
        self.stopped: str | None = None
        self.gone: set[str] = set()  # pages asked with `may_be_gone` that the site answered 404 for

    def get(self, url: str, may_be_gone: bool = False) -> str | None:
        """The page, or None. A 404 for a page that `may_be_gone` is the site answering that it no longer has it: it is put
        in `gone`, is no failure, and does not count towards giving up. Any other trouble, or a 404 for any other page
        (a round or a squad page that moved is a redesign), is a failure named in `failed`."""
        if self.clock() - self.started >= self.budget:
            self.stopped = self.stopped or "out of time"
            return None
        if self.requests and self.pause:
            self.sleep(self.pause)
        self.requests += 1
        try:
            text = _get(self.client, url)
        except FutbolFantasyError as error:
            if may_be_gone and error.status == 404:
                self.failures = 0
                self.gone.add(url)
                logger.info("futbolfantasy: %s is no longer on the site (HTTP 404)", url)
                return None
            self.failures += 1
            self.failed.append(str(error))  # already "<address>: <what happened>"
            logger.warning("futbolfantasy: %s", error)
            if self.failures >= GIVE_UP:
                self.stopped = f"{self.failures} pages in a row could not be read"
            return None
        self.failures = 0
        return text


def read_matches(
    wanted: Callable[[str, RoundMatch], bool],
    competitions: Iterable[str] = ("laliga",),
    client: httpx.Client | None = None,
    pause: float = PAUSE,
    budget: float = BUDGET,
    clock: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] = time.sleep,
    now: datetime | None = None,
    include_played: bool = False,
) -> Reading:
    """Each competition's round page, then the match pages `wanted` picks from it (never one already played, unless asked).

    Stops where it is when the budget is spent or `GIVE_UP` pages in a row cannot be read, and says so; what it had by then
    is kept. A page that cannot be read is named in `failed` and leaves no trace in the matches. A match page the site answers
    404 for is a match that is gone from it: its number is in `gone`, not in `failed`.
    """
    reading = Reading(at=now or datetime.now(UTC))
    http = client or httpx.Client(timeout=TIMEOUT, follow_redirects=True, headers={"User-Agent": USER_AGENT})
    site = _Polite(http, pause, budget, clock, sleep, reading.failed)
    try:
        for competition in competitions:
            if site.stopped:
                break
            html = site.get(round_url(competition))
            found = parse_round(html) if html is not None else None
            if found is None:
                if html is not None:
                    reading.failed.append(f"{round_url(competition)}: not a lineup page")
                continue
            reading.rounds[competition] = found
            for item in found.matches:
                if site.stopped:
                    break
                if (item.score is not None and not include_played) or not wanted(competition, item):
                    continue
                page = site.get(item.url, may_be_gone=True)
                if page is None and item.url in site.gone:
                    reading.gone.append(item.match_id)
                    continue
                try:
                    match = parse_match(page, item.url) if page is not None else None
                except (
                    Exception
                ) as error:  # a page of a shape nobody expected costs that match, never the rest of the read
                    logger.exception("futbolfantasy: %s could not be parsed", item.url)
                    reading.failed.append(f"{item.url}: could not be parsed ({type(error).__name__})")
                    continue
                if match is None:
                    if page is not None:
                        reading.failed.append(f"{item.url}: not a lineup page")
                    continue
                reading.matches.append(match)
    finally:
        if client is None:
            http.close()
    reading.stopped = site.stopped
    if reading.stopped:
        logger.warning("futbolfantasy: stopped early (%s), %d match(es) read", reading.stopped, len(reading.matches))
    return reading


SQUAD_BUDGET = 90.0  # seconds for all the squad pages: twenty clubs, two seconds apart, once a week


def squad_url(slug: str) -> str:
    return f"{BASE}/laliga/equipos/{slug}/plantilla"


def read_squads(
    clubs: Mapping[str, str],
    client: httpx.Client | None = None,
    pause: float = PAUSE,
    budget: float = SQUAD_BUDGET,
    clock: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] = time.sleep,
    now: datetime | None = None,
) -> SquadReading:
    """The squad page of each club (`{club number: its address's name}`), as politely as the match pages are read.

    What it gives is where each player plays, which the match pages leave out for everyone not in the eleven. A page that
    cannot be read is named in `failed` and leaves that club out, to be asked again later.
    """
    reading = SquadReading(at=now or datetime.now(UTC))
    http = client or httpx.Client(timeout=TIMEOUT, follow_redirects=True, headers={"User-Agent": USER_AGENT})
    site = _Polite(http, pause, budget, clock, sleep, reading.failed)
    try:
        for club_id, slug in clubs.items():
            if site.stopped:
                break
            html = site.get(squad_url(slug))
            if html is None:
                continue
            try:
                squad = parse_squad(html)
            except Exception as error:  # a page of a shape nobody expected costs that club, never the rest
                logger.exception("futbolfantasy: %s could not be parsed", squad_url(slug))
                reading.failed.append(f"{squad_url(slug)}: could not be parsed ({type(error).__name__})")
                continue
            if squad is None:
                reading.failed.append(f"{squad_url(slug)}: not a squad page")
                continue
            reading.squads[club_id] = squad
    finally:
        if client is None:
            http.close()
    reading.stopped = site.stopped
    return reading
