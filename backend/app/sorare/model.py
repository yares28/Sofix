"""The pieces a Sorare gameweek is made of: your cards, a competition's rules and rewards, a forecast per player.

Everything here is data only. `rules.py` builds competitions from Sorare's own rule payloads, `forecast.py`
fills the forecasts, `planner.py` turns the three into lineups and whole-gameweek plans.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

POSITIONS = ("GK", "DEF", "MID", "FWD")
SORARE_POSITION = {"Goalkeeper": "GK", "Defender": "DEF", "Midfielder": "MID", "Forward": "FWD"}
# The slot names Sorare uses in `rules.appearances`, mapped to the positions each slot accepts.
SLOT_POSITIONS: dict[str, tuple[str, ...]] = {
    "goalkeeper": ("GK",),
    "defender": ("DEF",),
    "midfielder": ("MID",),
    "forward": ("FWD",),
    "extra": ("DEF", "MID", "FWD"),
    "sub_goalkeeper": ("GK",),
    "sub_extra": ("DEF", "MID", "FWD"),
}
IN_SEASON = "In-season"
CLASSIC = "Classic"
ROOM = "Room"


@dataclass(frozen=True)
class Card:
    """One card you own. Sealed cards, cards for sale and cards inside an offer never get this far."""

    slug: str
    player: str
    name: str
    positions: tuple[str, ...]
    rarity: str
    in_season: bool
    level: int
    average: float  # Sorare's last-ten-played average, the number every cap and cap bonus counts
    birth_day: str | None = None
    league: str | None = None
    club: str | None = None
    club_name: str | None = None
    club_crest: str | None = None
    picture: str = ""
    avatar: str = ""

    def age_on(self, day: date) -> int | None:
        if not self.birth_day:
            return None
        born = date.fromisoformat(self.birth_day)
        return day.year - born.year - ((day.month, day.day) < (born.month, born.day))


@dataclass
class Forecast:
    """What a player is expected to do in one gameweek, from before its lock."""

    p_play: float  # chance he plays at least one of his games
    mu: float  # his score if he plays (the best of two games in a double gameweek)
    games: int = 1
    source: str = "form"  # "sorare" (its projection and starting odds) or "form" (his last five games)
    actual: float | None = None  # only for a gameweek that has been played: what he really scored


@dataclass(frozen=True)
class Tier:
    """One row of a competition's reward table: the ranks it covers and what they get."""

    lo: int
    hi: int
    cash: float = 0.0
    essence: int = 0
    card: bool = False

    @property
    def pays(self) -> bool:
        return bool(self.cash or self.essence or self.card)


@dataclass
class Competition:
    """A Sorare competition of one gameweek, with the rules the planner has to obey."""

    key: str  # "LALIGA EA SPORTS | Limited", stable across gameweeks
    slug: str  # this gameweek's leaderboard
    name: str  # what the app shows: "LaLiga", "All Star · Cap 260"
    group: str  # IN_SEASON | CLASSIC | ROOM
    rarity: str
    starters: list[tuple[str, ...]]
    subs: list[tuple[str, ...]]
    board_id: str = ""  # Sorare's own id for that leaderboard ("So5Leaderboard:…"), what entering one takes
    rarities: frozenset[str] = frozenset()
    min_in_season: int = 0
    leagues: frozenset[str] | None = None
    age_max: int | None = None
    age_on: str | None = None  # the date the age is taken on ("2026-07-01")
    cap: float | None = None  # rooms: the sum of averages may not go over this
    season_bonus: float = 0.0
    level_bonus: float = 0.0
    captain_bonus: float = 0.0
    scarcity_bonus: dict[str, float] = field(default_factory=dict)
    club_bonus: tuple[int, float] | None = None  # (most cards from one club, bonus)
    average_bonus: tuple[float, float] | None = None  # (cap on the sum of averages, bonus)
    teams_cap: int = 4  # lineups you may enter
    fee: int = 0  # essence to enter (rooms)
    room_size: int = 0
    tiers: list[Tier] = field(default_factory=list)
    entries: int = 0  # lineups entered so far
    lock_type: str = ""
    reference: dict[int, float] = field(default_factory=dict)  # rank -> score that paid, from a past gameweek
    reference_rooms: list[float] = field(default_factory=list)  # scores from real rooms of 10
    reference_from: str = ""  # which gameweek those came from

    @property
    def is_room(self) -> bool:
        return self.group == ROOM

    @property
    def size(self) -> int:
        return len(self.starters)

    @property
    def paying_tiers(self) -> list[Tier]:
        return [t for t in self.tiers if t.pays]

    def allows(self, card: Card, on_day: date | None = None) -> bool:
        if self.rarities and card.rarity not in self.rarities:
            return False
        if self.leagues is not None and card.league not in self.leagues:
            return False
        if self.age_max is not None:
            day = date.fromisoformat(self.age_on) if self.age_on else (on_day or date.today())
            age = card.age_on(day)
            if age is None or age > self.age_max:
                return False
        return True

    def multiplier(self, card: Card) -> float:
        """A card's bonus in this competition, before the captain's and the lineup's."""
        return (
            1.0
            + (self.season_bonus if card.in_season else 0.0)
            + self.level_bonus * card.level
            + self.scarcity_bonus.get(card.rarity, 0.0)
        )


@dataclass
class Gameweek:
    """One Sorare gameweek."""

    slug: str
    number: int
    name: str
    start: datetime
    end: datetime
    lock: datetime
    state: str  # "opened" | "started" | "closed"
    competitions: tuple[str, ...] = ()  # the football competitions whose games count
    projections_at: datetime | None = None
