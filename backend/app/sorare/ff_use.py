"""Futbol Fantasy's chance for each of the owner's players in each of his games (plans/futbolfantasy.md, S3).

Joins three things: the owner's cards and their games (Sorare's side), the matches Futbol Fantasy's pages were last read
for (`ff_feed`), and the linking between the two (`ff_link`). A game gets a number when all of these hold, and never a
guess when one does not:

- the player is linked to a person of a squad (`ff_link`);
- one of the matches read is that game: the same two clubs on the same day;
- that match was read under a day ago and has not kicked off (a game that has started is no longer guessed);
- the club's side of the page has a lineup (an empty one is a team whose next game the site has not published yet);
- he is in that lineup or its alternatives with a percentage, or the page says he will not play at all.

Anything else gives no entry for that game, and the forecast falls back to Sorare's number and then to the app's own.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import datetime
from typing import Any

from app.services import team_registry
from app.sorare import ff_link
from app.sorare.ff_feed import Feed, Stored
from app.sorare.forecast import GameStart
from app.sources.futbolfantasy_matches import AVAILABLE, DOUBT, OUT

_LESION = {OUT: "out", DOUBT: "doubt", AVAILABLE: "available"}
_NOT_PLAYING = ("out", "suspended")


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def status(person: ff_link.Person) -> dict[str, Any] | None:
    """What the page says about him apart from his chance: out, doubtful, suspended, why and since when, called up, cards."""
    player, absence = person.player, person.absence
    kind: str | None = None
    if (player and player.suspended) or (absence and absence.kind == "suspended"):
        kind = "suspended"
    elif absence:
        kind = absence.kind
    elif player:
        kind = _LESION.get(player.lesion)
    out: dict[str, Any] = {}
    if kind:
        out["kind"] = kind
    if absence:
        for key, value in (("cause", absence.cause), ("since", absence.since), ("note", absence.note)):
            if value:
                out[key] = value
    if player and player.international:
        out["international"] = True
    if player and player.yellows:
        out["yellows"] = player.yellows
    return out or None


class Lineups:
    """What Futbol Fantasy says about each of the owner's players, game by game, at `now`."""

    def __init__(
        self,
        feed: Feed,
        cards: Iterable[dict[str, Any]],
        now: datetime,
        kept: Mapping[str, Mapping[str, Any]] | None = None,
        overrides: Mapping[str, str] | None = None,
    ) -> None:
        self.now = now
        self.usable: list[Stored] = feed.usable(now)
        wanted = {w.slug: w for row in cards if (w := ff_link.wanted(row))}
        # Who is who does not depend on how fresh a reading is, so every match held is used to find it.
        self.links = ff_link.link_cards(
            wanted.values(),
            [item.match for item in feed.matches.values()],
            now.date(),
            kept,
            ff_link.OVERRIDES if overrides is None else overrides,
        )
        self._stored = {item.match.match_id: item for item in self.usable}
        self._all = list(feed.matches.values())

    def starts(self, player: str, games: list[dict[str, Any]]) -> list[GameStart]:
        """Futbol Fantasy's number for each of these games of his (Sorare's game dicts) that it has one for."""
        link = self.links.links.get(player)
        if link is None:
            return []
        out: list[GameStart] = []
        for game in games:
            kickoff = _dt(game["kickoff"])
            if kickoff <= self.now:
                continue
            found = ff_link.match_of_game(game.get("team") or "", game.get("opponent") or "", kickoff, self._matches())
            if found is None:
                continue
            match, side = found
            person = ff_link.find_person(side, link) if side.xi else None
            if person is None:
                continue
            told = self._told(game["id"], person, self._stored[match.match_id], side.club_id)
            if told is not None:
                out.append(told)
        return out

    def _matches(self) -> list[Any]:
        return [item.match for item in self.usable]

    @staticmethod
    def _told(game: str, person: ff_link.Person, item: Stored, club_id: str | None) -> GameStart | None:
        said = status(person)
        out = bool(said and said.get("kind") in _NOT_PLAYING)
        chance = person.player.chance if person.player else None
        if chance is None and not out:
            return None
        info: dict[str, Any] = {
            "startAt": item.read_at.isoformat(),
            "ffMatch": {"id": item.match.match_id, "url": item.match.url},
        }
        if person.ff_id:
            info["ffPlayer"] = person.ff_id
        if said:
            info["ffStatus"] = said
        changed = item.changed.get(club_id or "")
        if changed:
            info["ffChanged"] = changed.isoformat()
        return GameStart(game=game, p_start=0.0 if out else float(chance or 0.0), out=out, info=info)

    def missing(self, games: Iterable[dict[str, Any]]) -> list[str]:
        """The upcoming games of a LaLiga club for which no match was read at all, as "Team - Opponent 10 Oct".

        That is a game the site has not published yet (a European matchday, a team that has not played its last game), or one
        whose clubs or day the two sites do not agree on: either way the players in it fall back, and the run says so.
        """
        held = [item.match for item in self._all]
        found: set[str] = set()
        for game in games:
            kickoff = _dt(game["kickoff"])
            team, opponent = game.get("team") or "", game.get("opponent") or ""
            clubs = (team_registry.by_odds_name(team), team_registry.by_odds_name(opponent))
            if kickoff <= self.now or not any(club and club.ff_id for club in clubs):
                continue
            if ff_link.match_of_game(team, opponent, kickoff, held) is None:
                found.add(f"{team} - {opponent} {kickoff:%d %b}")
        return sorted(found)

    def report(self, players: Iterable[str]) -> dict[str, Any]:
        """For the run's summary and /control: how many players are linked, and who could not be and why."""
        wanted = list(players)
        return {
            "linked": sum(1 for slug in wanted if slug in self.links.links),
            "unlinked": {
                slug: {"why": miss.reason, "could": list(miss.candidates)}
                for slug, miss in sorted(self.links.misses.items())
                if slug in wanted
            },
        }
