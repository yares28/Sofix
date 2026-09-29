"""His expected goals if he starts, for the tile on a midfielder or forward (plans/overlay.md, O11).

Understat's season numbers are matched to Sorare's players by name (inside the player's own league, told apart by club when
two share a name), turned into a rate per game that is steadied while his minutes are few, and scaled by the minutes he
plays when he starts. What comes out is the xG of an *average* game for his side; the app scales it to the game itself
(his side's goals in that game against its own average) when it answers the overlay, because the game's odds live there.

A player who cannot be matched with confidence, or has not played a full game, gets nothing: the tile says "xG —".
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.sorare.model import SORARE_POSITION
from app.sources.understat import League, Player

# Understat player id for a Sorare player slug, for a name the two sides write differently. Checked by hand.
OVERRIDES: dict[str, str] = {}

# Non-penalty xG per 90 for a typical player, measured on 29 Sep 2026 over the six leagues Understat covers (players with at
# least 450 minutes): 61 forwards averaged 0.32 and 102 midfielders 0.12. They only steady a short record.
PRIOR_NP90 = {"FWD": 0.32, "MID": 0.12}
PRIOR_GAMES = 5.0  # the norm counts as this many games of his own
PENALTY_GAMES = 10.0  # penalties are rare: the rate is pulled hard towards none
MIN_MINUTES = 90.0  # under a full game there is nothing to go on
DEFAULT_START_MINUTES = 80.0
# First names Sorare shortens that are not a start of the full one ("Javi" and "Nico" are, so they need no entry).
NICKNAMES = {
    "toni": "antonio",
    "kike": "enrique",
    "quique": "enrique",
    "pepe": "jose",
    "paco": "francisco",
    "chema": "jose",
}
CLUB_WORDS = {
    "fc",
    "cf",
    "ud",
    "rc",
    "cd",
    "ac",
    "sc",
    "sad",
    "de",
    "club",
    "afc",
    "fk",
    "sv",
    "ssc",
    "as",
    "us",
    "ogc",
    "rcd",
}


# Letters with no accent form: the accent-stripping below leaves them alone, so they are written out.
LETTERS = str.maketrans(
    {
        "ø": "o",
        "Ø": "O",
        "ß": "ss",
        "ł": "l",
        "Ł": "L",
        "đ": "d",
        "Đ": "D",
        "æ": "ae",
        "Æ": "AE",
        "œ": "oe",
        "Œ": "OE",
        "ð": "d",
        "þ": "th",
    }
)


def words(text: str) -> list[str]:
    plain = unicodedata.normalize("NFD", (text or "").translate(LETTERS))
    plain = "".join(char for char in plain if not unicodedata.combining(char)).lower()
    return [word for word in re.sub(r"[^a-z0-9]+", " ", plain).split() if word]


def name_key(text: str) -> str:
    return " ".join(words(text))


def club_key(text: str) -> str:
    kept = [word for word in words(text) if word not in CLUB_WORDS]
    return " ".join(kept or words(text))


def same_club(team_title: str, club_names: list[str]) -> bool:
    """Does one of the clubs Understat lists for him ("A,B" after a move) look like his club on Sorare?"""
    ours = [club_key(name) for name in club_names if name]
    for part in team_title.split(","):
        theirs = club_key(part)
        if theirs and any(one and (one == theirs or one in theirs or theirs in one) for one in ours):
            return True
    return False


def _club_names(player: dict[str, Any]) -> list[str]:
    club = player.get("activeClub") or {}
    return [name for name in (club.get("name"), club.get("shortName")) if name]


def find(row: dict[str, Any], league: League, overrides: dict[str, str] | None = None) -> Player | None:
    """The Understat player this Sorare player is, or None when it cannot be told with confidence."""
    player = row["player"]
    fixed = (OVERRIDES if overrides is None else overrides).get(player["slug"])
    if fixed is not None:
        return next((one for one in league.players if one.id == fixed), None)
    clubs = _club_names(player)
    wanted = name_key(player.get("displayName") or "")
    if not wanted:
        return None

    def pick(found: list[Player]) -> Player | None:
        if len(found) == 1:
            return found[0]
        if len(found) > 1:  # the same name twice: the club decides, and if it cannot, nobody is guessed
            at_club = [one for one in found if same_club(one.team, clubs)]
            return at_club[0] if len(at_club) == 1 else None
        return None

    exact = [one for one in league.players if name_key(one.name) == wanted]
    if exact:
        return pick(exact)
    ours = set(wanted.split())
    contained = []
    for one in league.players:
        theirs = set(name_key(one.name).split())
        small, large = (ours, theirs) if len(ours) <= len(theirs) else (theirs, ours)
        if (
            len(small) >= 2 and small <= large
        ):  # "Cristian Romero" is inside "Cristian Gabriel Romero"; one word never is
            contained.append(one)
    found = pick(contained)
    if found or contained:
        return found
    # The two sides write a name with a different number of words ("Fermín" for "Fermín López", "Mariano Díaz" for
    # "Mariano") or shorten a first name ("Javi Puado", "Toni Martínez"). Each of those matches only a teammate the name is
    # unique among, and never someone who only defends or keeps goal: a wrong xG on a card is worse than none.
    at_club = [one for one in league.players if same_club(one.team, clubs) and _could_play_forward(one)]
    for agrees in (_one_word, _nickname):
        hits = [one for one in at_club if agrees(ours, name_key(one.name).split())]
        if hits:
            return hits[0] if len(hits) == 1 else None
    return None


def _could_play_forward(one: Player) -> bool:
    """Not a keeper and not a pure defender: Understat files a player who came off the bench last game as "S"."""
    letters = set(one.position.split())
    return "GK" not in letters and letters not in ({"D"}, {"D", "S"})


def _one_word(ours: set[str], theirs: list[str]) -> bool:
    """One side has a single word and it is one of the other side's words."""
    return (len(ours) == 1 and ours <= set(theirs)) or (len(theirs) == 1 and set(theirs) <= ours)


def _nickname(ours: set[str], theirs: list[str]) -> bool:
    """The same surname, and a first name that is the other's short form ("javi" of "javier", "toni" of "antonio")."""
    if len(ours) < 2 or len(theirs) < 2 or theirs[-1] not in ours:
        return False
    first_theirs = theirs[0]
    return any(
        word == first_theirs
        or (len(word) >= 3 and first_theirs.startswith(word))
        or (len(first_theirs) >= 3 and word.startswith(first_theirs))
        or NICKNAMES.get(word) == first_theirs
        for word in ours - {theirs[-1]}
    )


def start_minutes(history: list[dict[str, Any]]) -> float:
    """What he plays when he starts: the minutes of his last five starts, never over ninety, else a typical eighty."""
    rows = sorted((h for h in history if h.get("status") != "PENDING"), key=lambda h: h["date"], reverse=True)
    starts = [float(h["mins"]) for h in rows if h.get("started") and h.get("mins")][:5]
    if not starts:
        return DEFAULT_START_MINUTES
    return min(90.0, max(30.0, sum(starts) / len(starts)))


def _team_average(found: Player, clubs: list[str], league: League) -> float | None:
    titles = [part.strip() for part in found.team.split(",") if part.strip()]
    chosen = next((title for title in titles if same_club(title, clubs)), titles[-1] if titles else None)
    average = league.team_xg.get(chosen) if chosen else None
    return round(average, 2) if average else None


def build(
    rows: list[dict[str, Any]], history: dict[str, list[dict[str, Any]]], understat: dict[str, League]
) -> dict[str, dict[str, Any]]:
    """`{sorare player slug: {np, pen, team}}` for every midfielder or forward Understat can name.

    `np` and `pen` are the non-penalty and penalty xG of one game he starts, for an average game of his side; `team` is his
    team's own average xG per game so far, which the app scales the game by.
    """
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        player = row["player"]
        slug = player["slug"]
        position = SORARE_POSITION.get(player.get("position") or "")
        if slug in out or position not in PRIOR_NP90:
            continue
        league = understat.get(((player.get("activeClub") or {}).get("domesticLeague") or {}).get("slug") or "")
        found = find(row, league) if league else None
        if not league or not found or found.minutes < MIN_MINUTES:
            continue
        games = found.minutes / 90.0
        np90 = (found.npxg + PRIOR_NP90[position] * PRIOR_GAMES) / (games + PRIOR_GAMES)
        pen90 = max(0.0, found.xg - found.npxg) / (games + PENALTY_GAMES)
        share = start_minutes(history.get(slug, [])) / 90.0
        out[slug] = {
            "np": round(np90 * share, 3),
            "pen": round(pen90 * share, 3),
            "team": _team_average(found, _club_names(player), league),
        }
    return out
