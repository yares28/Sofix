"""Who is who between Futbol Fantasy and Sorare: its players, clubs and matches against the owner's (plans/futbolfantasy.md, S2).

Futbol Fantasy names a player the way a fan does ("Isco Alarcón", "Mat Ryan", "Georgiy Tsitaishvili") and Sorare the way his
registry does (`Isco` over the slug `francisco-roman-alarcon-suarez`, `Mathew Ryan`, `heorhii-tsitaishvili`). Nothing else
ties them, so a number is only shown on a card when this says with confidence that the two are the same person: a wrong
start chance on a card is worse than none, and a card that cannot be linked simply keeps Sorare's number.

The work is done inside one club's side of one match, never across the league, and a name is only ever compared with the
few dozen people of that squad. What decides, in order, each step used only when the one before it found nobody:

1. `override`: a link checked by hand (`OVERRIDES`), and `kept`: the link found on an earlier run, which survives a change
   in how either site spells him, provided it still looks like him.
2. `name`: the same name, accents and case aside; `part`: one of the two names is inside the other's words, the slug's
   included (`Iñaki Williams` inside `inaki-williams-arthuer`, `Isco Alarcón` inside `Isco` + `francisco-roman-alarcon-suarez`).
3. `first`: the same surname and a first name that is the other's short form (`Mat` for `Mathew`, `Javi` for `Javier`).
4. `surname`: only a surname in common, which needs him to be the one person of that squad with it and both sites to agree
   on his age (`Georgiy` and `Heorhii` Tsitaishvili).

A person no step can name, or two a step cannot tell apart, is reported and left alone. Age (a year either way) and the
goalkeeper's gloves veto any step. Nothing here reads a page or the database except `load_kept` and `save_kept`.
"""

from __future__ import annotations

import copy
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services import team_registry
from app.services.publish import put
from app.sorare import xg
from app.sorare.model import SORARE_POSITION
from app.sources.futbolfantasy_matches import Absence, Match, Player, Side

KEPT_KEY = "ff_links"
# Sorare player slug -> Futbol Fantasy id, for a player the two sides spell too differently for the steps below. Checked by hand.
OVERRIDES: dict[str, str] = {}
AGE_SLACK = 1  # years: the two sites turn a year older on different days
KICKOFF_SLACK = timedelta(hours=36)  # a match moved by a day is the same match; the two legs of a tie are a week apart
MIN_SURNAME = 4  # a shorter word ("de", "kim", "li") says too little to name a person alone
# First names the two sites shorten that are not the start of the full one ("Mat" and "Javi" are, so they need no entry).
SHORT_FORMS = {
    **xg.NICKNAMES,
    "alex": "alejandro",
    "nacho": "ignacio",
    "chus": "jesus",
    "kiko": "francisco",
    "manolo": "manuel",
}


@dataclass(frozen=True)
class Person:
    """One person of a squad as the match page lists him: in the eleven, among the alternatives, or only as absent."""

    key: str  # his Futbol Fantasy id; his profile address (or name) when only an absence names him
    name: str
    ff_id: str | None
    slug: str | None
    age: int | None
    keeper: (
        bool | None
    )  # True or False for the eleven (the pitch draws the keeper apart); None when the page does not say
    player: Player | None  # his row in the eleven or the alternatives: the chance, the injury field
    absence: Absence | None  # his entry in the injured/doubtful/suspended lists

    @property
    def words(self) -> list[str]:
        return xg.words(self.name)


@dataclass(frozen=True)
class Wanted:
    """A Sorare player as the linking needs him: every way his name is written, his age and his place."""

    slug: str
    display: str
    words: frozenset[str]  # the words of his display name and of his slug together
    born: date | None
    position: str | None  # "GK", "DEF", "MID" or "FWD"
    clubs: tuple[str, ...]  # the names Sorare gives his club

    @property
    def display_key(self) -> str:
        return xg.name_key(self.display)

    @property
    def full_key(self) -> str:
        return xg.name_key(_slug_words(self.slug))


@dataclass(frozen=True)
class Link:
    sorare: str  # the Sorare player slug
    person: Person
    how: str  # "override", "kept", "name", "part", "first" or "surname"


@dataclass(frozen=True)
class Miss:
    sorare: str
    reason: str  # "nobody of that name", "more than one", "same person as another of yours", ...
    candidates: tuple[str, ...] = ()  # who it could have been, as the page writes them


@dataclass
class Linked:
    links: dict[str, Link] = field(default_factory=dict)
    misses: dict[str, Miss] = field(default_factory=dict)


# ------------------------------------------------------------------------------------------------------- the two sides
def _slug_words(slug: str) -> str:
    return re.sub(r"-\d+$", "", slug or "").replace("-", " ")  # "carlos-martin-2" is a second Carlos Martín


def _born(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10]) if value else None
    except ValueError:
        return None


def age_on(born: date | None, day: date) -> int | None:
    if born is None:
        return None
    return day.year - born.year - ((day.month, day.day) < (born.month, born.day))


def wanted(row: Mapping[str, Any]) -> Wanted | None:
    """A card row of the Sorare snapshot as `Wanted`; None for a row with no player slug."""
    player = row.get("player") or {}
    slug = player.get("slug")
    if not slug:
        return None
    club = player.get("activeClub") or {}
    display = player.get("displayName") or ""
    return Wanted(
        slug=slug,
        display=display,
        words=frozenset(xg.words(display)) | frozenset(xg.words(_slug_words(slug))),
        born=_born(player.get("birthDay")),
        position=SORARE_POSITION.get(player.get("position") or ""),
        clubs=tuple(name for name in (club.get("shortName"), club.get("name")) if name),
    )


def _key(ff_id: str | None, slug: str | None, name: str) -> str:
    return ff_id or (f"slug:{slug}" if slug else f"name:{xg.name_key(name)}")


def people(side: Side) -> list[Person]:
    """Everyone the page lists for a side, once each: the eleven, then the alternatives, with the injury lists joined on.

    The injury lists name a player by his profile address only, so each entry is joined to the same person in the eleven
    or the alternatives (all but a rare squad member who has no chance row are), and a man who is only there stands alone.
    """
    found: dict[str, Person] = {}
    by_slug: dict[str, str] = {}
    for group, keeper_known in ((side.xi, True), (side.alternatives, False)):
        for player in group:
            key = _key(player.ff_id, player.slug, player.name)
            if key in found:
                continue
            found[key] = Person(
                key=key,
                name=player.name,
                ff_id=player.ff_id,
                slug=player.slug,
                age=player.age,
                keeper=player.goalkeeper if keeper_known else None,
                player=player,
                absence=None,
            )
            if player.slug:
                by_slug.setdefault(player.slug, key)
    for absence in side.absences:
        known = by_slug.get(absence.slug or "")
        if known is not None:
            found[known] = replace(found[known], absence=absence)
            continue
        alone = _key(None, absence.slug, absence.name)
        if alone not in found:
            found[alone] = Person(
                key=alone,
                name=absence.name,
                ff_id=None,
                slug=absence.slug,
                age=None,
                keeper=None,
                player=None,
                absence=absence,
            )
    return list(found.values())


# ------------------------------------------------------------------------------------------------------------- clubs
def _club_of_side(side: Side) -> team_registry.TeamInfo | None:
    """The registry's club for a side: by the number in its crest when known (the same in every competition), else by name."""
    return team_registry.by_ff_id(side.club_id) or team_registry.by_odds_name(side.name)


def _same_words(ours: str, theirs: str) -> bool:
    """Two club names of clubs the registry does not know: equal, or the shorter's words all inside the longer's."""
    if not ours or not theirs:
        return False
    if ours == theirs:
        return True
    small, large = sorted((set(ours.split()), set(theirs.split())), key=len)
    return small <= large and (len(small) >= 2 or max(map(len, small)) >= 5)  # "real" alone names half of Spain


def same_club(names: Iterable[str], side: Side) -> bool:
    """Is one of these Sorare club names the club of a match side?

    The registry decides whenever either side is a club it knows, by identity and never by words: "Deportivo" is La Coruña
    and "Deportivo Alavés" is not, "Racing Club" is not "Racing Santander". Clubs it does not know (abroad, the lower
    divisions of the cup) are told apart by their words.
    """
    names = [name for name in names if name]
    known = _club_of_side(side)
    ours = {info for name in names if (info := team_registry.by_odds_name(name))}
    if known is not None or ours:
        return known is not None and known in ours
    theirs = xg.club_key(side.name)
    return any(_same_words(xg.club_key(name), theirs) for name in names)


def match_of_game(team: str, opponent: str, kickoff: datetime, matches: Iterable[Match]) -> tuple[Match, Side] | None:
    """The Futbol Fantasy match a Sorare game is, and the side of it that is `team`; None when none is that game.

    The two clubs and the day must agree. Which one plays at home is not compared (a final on neutral ground is
    "home" for one site and "away" for the other), and neither is the name of the competition.
    """
    best: tuple[timedelta, Match, Side] | None = None
    for match in matches:
        if match.kickoff is None or abs(match.kickoff - kickoff) > KICKOFF_SLACK:
            continue
        for mine, theirs in ((match.home, match.away), (match.away, match.home)):
            if same_club([team], mine) and same_club([opponent], theirs):
                gap = abs(match.kickoff - kickoff)
                if best is None or gap < best[0]:
                    best = (gap, match, mine)
    return (best[1], best[2]) if best else None


# ----------------------------------------------------------------------------------------------------------- people
def _veto(w: Wanted, person: Person, on: date) -> str | None:
    """Why he cannot be this player, or None when nothing says he is not."""
    ours, theirs = age_on(w.born, on), person.age
    if ours is not None and theirs is not None and abs(ours - theirs) > AGE_SLACK:
        return "age differs"
    if w.position == "GK" and person.keeper is False:
        return "a keeper on Sorare, not in goal on the page"
    if w.position in ("DEF", "MID", "FWD") and person.keeper is True:
        return "a keeper on the page"
    return None


def _first_names(a: str, b: str) -> bool:
    """One first name is the other's short form: "mat" of "mathew", "javi" of "javier", "toni" of "antonio", "a" of "abde"."""
    if a == b:
        return True
    if len(a) == 1 or len(b) == 1:
        return a[0] == b[0]
    if SHORT_FORMS.get(a) == b or SHORT_FORMS.get(b) == a:
        return True
    return min(len(a), len(b)) >= 3 and (a.startswith(b) or b.startswith(a))


def _name(w: Wanted, person: Person, on: date) -> bool:
    key = xg.name_key(person.name)
    return bool(key) and key in {w.display_key, w.full_key}


def _part(w: Wanted, person: Person, on: date) -> bool:
    theirs = set(person.words)
    if len(theirs) >= 2 and theirs <= w.words:
        return True
    return any(
        len(words) >= 2 and words <= theirs for words in (set(xg.words(w.display)), set(xg.words(_slug_words(w.slug))))
    )


def _first(w: Wanted, person: Person, on: date) -> bool:
    words = person.words
    if len(words) < 2 or len(words[-1]) < 3 or words[-1] not in w.words:
        return False
    return any(_first_names(words[0], other) for other in w.words - {words[-1]})


def _shares_surname(w: Wanted, person: Person) -> bool:
    words = person.words
    return bool(words) and len(words[-1]) >= MIN_SURNAME and words[-1] in w.words


def _surname(w: Wanted, person: Person, on: date) -> bool:
    """Only a surname in common, which is trusted with both ages to check: the vetoes already rejected a wrong one."""
    return _shares_surname(w, person) and age_on(w.born, on) is not None and person.age is not None


STEPS = (("name", _name), ("part", _part), ("first", _first), ("surname", _surname))


def _override(w: Wanted, pool: list[Person], overrides: Mapping[str, str]) -> Link | None:
    """The person a hand-checked link names, if he is in this squad."""
    person = next((p for p in pool if p.ff_id == overrides.get(w.slug)), None)
    return Link(w.slug, person, "override") if person else None


def _kept(w: Wanted, pool: list[Person], on: date, kept: Mapping[str, Mapping[str, Any]]) -> Link | None:
    """The person an earlier run linked him to, if he is in this squad and is still plausibly the same man.

    A link found before outlives a change in how a site spells a name, but not a change that leaves the two names with no
    word in common, nor an age or position that no longer fits.
    """
    old = kept.get(w.slug)
    if not old:
        return None
    person = next((p for p in pool if (p.ff_id == old["ffId"] if old.get("ffId") else p.slug == old.get("slug"))), None)
    if person is None or _veto(w, person, on):
        return None
    if not any(len(word) >= 3 and word in w.words for word in person.words):
        return None
    return Link(w.slug, person, "kept")


def choose(w: Wanted, pool: list[Person], on: date) -> Link | Miss:
    """The one person of a squad this player is, or why nobody is. See the module text for the steps."""
    fits = [person for person in pool if _veto(w, person, on) is None]
    for how, step in STEPS:
        found = [person for person in fits if step(w, person, on)]
        if len(found) == 1:
            return Link(w.slug, found[0], how)
        if len(found) > 1:
            return Miss(w.slug, "more than one of that name", tuple(person.name for person in found))
    # Nobody: say what there was, so the owner can tell whether a hand-checked link would settle it.
    near = [person.name for person in fits if _shares_surname(w, person)]
    if near:
        return Miss(w.slug, "only a surname is in common, and there is no age to say it is him", tuple(near))
    ruled_out = [
        person.name
        for person in pool
        if _veto(w, person, on) is not None
        and (_shares_surname(w, person) or any(step(w, person, on) for _, step in STEPS[:3]))
    ]
    if ruled_out:
        return Miss(w.slug, "a name like his is there, but not his age or position", tuple(ruled_out))
    return Miss(w.slug, "nobody of that name")


def link_side(
    side: Side,
    cards: Iterable[Wanted],
    on: date,
    kept: Mapping[str, Mapping[str, Any]] | None = None,
    overrides: Mapping[str, str] | None = None,
) -> Linked:
    """Each card linked to a person of one side of a match. Only cards of that club are tried, plus those already linked.

    A card with a hand-checked link gets that person or nobody, never a guess by name. One person is one card's: when two
    cards come out as the same person neither is believed (a hand-checked one excepted), since one of them is wrong.
    """
    kept, overrides = kept or {}, overrides or {}
    pool = people(side)
    out = Linked()
    for w in cards:
        if w.slug in overrides:
            link = _override(w, pool, overrides)
            if link is not None:
                out.links[w.slug] = link
            continue
        link = _kept(w, pool, on, kept)
        if link is None and same_club(w.clubs, side):
            result = choose(w, pool, on)
            if isinstance(result, Miss):
                out.misses[w.slug] = result
                continue
            link = result
        if link is not None:
            out.links[w.slug] = link
    by_person: dict[str, list[str]] = {}
    for slug, link in out.links.items():
        by_person.setdefault(link.person.key, []).append(slug)
    for slugs in by_person.values():
        if len(slugs) < 2:
            continue
        for slug in slugs:
            if out.links[slug].how != "override":  # somebody decided that one; the others cannot both be him
                person = out.links.pop(slug).person
                out.misses[slug] = Miss(slug, "the same person as another of yours", (person.name,))
    return out


def find_person(side: Side, link: Link) -> Person | None:
    """The person a link names on another match's side of the same club (by his number, else his profile address)."""
    for person in people(side):
        if link.person.ff_id and person.ff_id == link.person.ff_id:
            return person
        if not link.person.ff_id and link.person.slug and person.slug == link.person.slug:
            return person
    return None


def link_cards(
    cards: Iterable[Wanted],
    matches: Iterable[Match],
    on: date,
    kept: Mapping[str, Mapping[str, Any]] | None = None,
    overrides: Mapping[str, str] | None = None,
) -> Linked:
    """Every card linked over every side of every match read; a miss is only reported for a card whose club was read."""
    cards = list(cards)
    out = Linked()
    seen: dict[str, dict[str, Link]] = {}
    for match in matches:
        for side in (match.home, match.away):
            found = link_side(side, cards, on, kept, overrides)
            for slug, link in found.links.items():
                seen.setdefault(slug, {})[link.person.key] = link
            for slug, miss in found.misses.items():
                out.misses.setdefault(slug, miss)
    for slug, by_key in seen.items():
        out.misses.pop(slug, None)
        if len(by_key) == 1:
            out.links[slug] = next(iter(by_key.values()))
        else:  # two different people on two sides: neither is believed
            people_ = tuple(link.person.name for link in by_key.values())
            out.misses[slug] = Miss(slug, "a different person on each side", people_)
    return out


# ------------------------------------------------------------------------------------------------------ kept links
def load_kept(db: Session) -> dict[str, dict[str, Any]]:
    """The links found on earlier runs: `{sorare slug: {ffId, slug, name, how, at}}`."""
    row = db.get(ReadModel, KEPT_KEY)
    links = row.payload.get("links") if row and isinstance(row.payload, dict) else None
    if not isinstance(links, dict):
        return {}
    return {
        slug: dict(entry)
        for slug, entry in links.items()
        if isinstance(entry, dict) and (entry.get("ffId") or entry.get("slug"))
    }


def save_kept(db: Session, links: Mapping[str, Link], now: datetime) -> int:
    """Write down the links that are new or now point at someone else; how many. A link set by hand is its own record."""
    kept = copy.deepcopy(load_kept(db))
    changed = 0
    for slug, link in links.items():
        if link.how == "override":
            continue
        entry = {
            "ffId": link.person.ff_id,
            "slug": link.person.slug,
            "name": link.person.name,
            "how": link.how,
            "at": now.isoformat(),
        }
        old = kept.get(slug)
        if old and old.get("ffId") == entry["ffId"] and old.get("slug") == entry["slug"]:
            continue
        kept[slug] = entry
        changed += 1
    if changed:
        put(db, KEPT_KEY, {"links": kept}, now)
    return changed
