"""Weeks Sorare has not opened yet: every LaLiga round still to play, laid out the way Sorare will lay it out.

Sorare opens a gameweek only a few days ahead, but the LaLiga calendar is known for the whole season. So a round far
ahead can already be planned: which of your cards play comes from the calendar, its window from the rhythm Sorare has
kept all season, and the competitions from the week being planned, as a stand-in for the ones Sorare will publish.
Nothing here calls Sorare; it reads the fixtures the app already holds.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, aliased

from app.models import Fixture, Team
from app.services import team_registry
from app.sorare.model import Card

LALIGA = "laliga-es"
LOCK_HOUR = 14  # UTC: the hour a Sorare gameweek opens, and locks


@dataclass(frozen=True)
class Side:
    code: str
    name: str
    crest: str | None


@dataclass(frozen=True)
class Match:
    id: str
    kickoff: datetime
    home: Side
    away: Side


@dataclass(frozen=True)
class Round:
    number: int
    matches: tuple[Match, ...]

    @property
    def first(self) -> datetime:
        return min(match.kickoff for match in self.matches)


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def window(kickoff: datetime) -> tuple[datetime, datetime, datetime]:
    """The Sorare gameweek a kickoff falls in: (start, end, lock).

    All season Sorare has alternated a weekend gameweek (Friday 14:00 UTC to Tuesday 14:00) with a midweek one (Tuesday
    to Friday 14:00), and locks each when it opens. A round far ahead is given the window Sorare will most likely draw.
    """
    when = kickoff.astimezone(UTC)
    for back in range(8):
        opens = datetime.combine(when.date() - timedelta(days=back), datetime.min.time(), tzinfo=UTC).replace(
            hour=LOCK_HOUR
        )
        if opens <= when and opens.weekday() in (1, 4):  # a Tuesday or a Friday
            days = 4 if opens.weekday() == 4 else 3
            return opens, opens + timedelta(days=days), opens
    raise ValueError(
        f"no gameweek window found around {kickoff}"
    )  # pragma: no cover  (every day is within a week of one)


def unopened(rounds: list[Round], gameweeks: list[dict[str, Any]], now: datetime | None = None) -> list[Round]:
    """The rounds worth planning early: still to start, and not inside a gameweek Sorare has already opened.

    An opened gameweek is planned for real, from Sorare's own projections and competitions, so a round that falls in
    one is left to it.
    """
    spans = [(_dt(week["start"]), _dt(week["end"])) for week in gameweeks]
    out = []
    for round_ in sorted(rounds, key=lambda r: r.number):
        first = round_.first
        if now is not None and first <= now:
            continue
        if any(start <= first < end for start, end in spans):
            continue
        out.append(round_)
    return out


def games_for(cards: list[Card], round_: Round) -> dict[str, list[dict[str, Any]]]:
    """Each LaLiga player's games in the round, as a played gameweek lists them (his side, the opponent, the venue).

    A card at a club outside LaLiga, or whose club the registry cannot name, has no game here.
    """
    plays: dict[str, list[tuple[Match, bool]]] = {}
    for match in round_.matches:
        plays.setdefault(match.home.code, []).append((match, True))
        plays.setdefault(match.away.code, []).append((match, False))
    out: dict[str, list[dict[str, Any]]] = {}
    for card in cards:
        if card.league != LALIGA or card.player in out:
            continue
        team = team_registry.by_odds_name(card.club_name or "")
        if team is None:
            continue
        listed = [_game(match, at_home) for match, at_home in plays.get(team.code, [])]
        if listed:
            out[card.player] = sorted(listed, key=lambda g: g["kickoff"])
    return out


def _game(match: Match, at_home: bool) -> dict[str, Any]:
    mine, other = (match.home, match.away) if at_home else (match.away, match.home)
    return {
        "id": f"projected-{match.id}",
        "kickoff": match.kickoff.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "competition": LALIGA,
        "team": mine.name,
        "teamCrest": mine.crest,
        "opponent": other.name,
        "opponentCrest": other.crest,
        "venue": "H" if at_home else "A",
    }


def calendar(db: Session, now: datetime) -> list[Round]:
    """The LaLiga rounds with a game still to come, from the fixtures the app holds."""
    home, away = aliased(Team), aliased(Team)
    rows = db.execute(
        select(Fixture, home, away)
        .join(home, Fixture.home_team_id == home.id)
        .join(away, Fixture.away_team_id == away.id)
        .where(Fixture.matchday.is_not(None), Fixture.kickoff_utc > now - timedelta(days=1))
        .order_by(Fixture.matchday, Fixture.kickoff_utc)
    ).all()
    by_round: dict[int, list[Match]] = {}
    for fixture, home_team, away_team in rows:
        if not home_team.code or not away_team.code:
            continue
        kickoff = fixture.kickoff_utc if fixture.kickoff_utc.tzinfo else fixture.kickoff_utc.replace(tzinfo=UTC)
        by_round.setdefault(int(fixture.matchday), []).append(
            Match(
                id=str(fixture.id),
                kickoff=kickoff,
                home=Side(home_team.code, home_team.short_name or home_team.canonical_name, home_team.crest_url),
                away=Side(away_team.code, away_team.short_name or away_team.canonical_name, away_team.crest_url),
            )
        )
    return [Round(number, tuple(matches)) for number, matches in sorted(by_round.items())]
