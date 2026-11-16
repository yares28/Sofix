"""Each starter's role tonight, from the lines of the official eleven (plans/score-engine.md E1.1).

Sorare lists the eleven line by line, keeper first, each line from right to left (Real Madrid on 25 Oct 2026: Valverde, Konaté,
Huijsen, Cucurella). Checked on all 1,238 LaLiga games of the export (28 Oct 2026): of the 218 players with ten starts in a back four,
193 are always at an end or always in the middle, and 103 of the 111 at an end keep the same side. So the ends of a back four are its
full-backs.
"""

from __future__ import annotations

from collections.abc import Sequence

ROLES = ("GK", "CB", "FB", "CM", "AM", "ST")
# A player with no start yet plays his Sorare position's usual role.
DEFAULT = {"GK": "GK", "DEF": "CB", "MID": "CM", "FWD": "ST"}


def _ends(line: Sequence[str], end: str, middle: str) -> dict[str, str]:
    """A line of four or more: `end` at both ends, `middle` between."""
    if len(line) < 4:
        return {p: middle for p in line}
    return {p: end if i in (0, len(line) - 1) else middle for i, p in enumerate(line)}


def roles_of(lines: Sequence[Sequence[str]]) -> dict[str, str]:
    """keeper → GK; the back line: full-backs at the ends of four or five, centre-backs inside; the first midfield line: central, its ends
    wide (wing-backs, FB, behind a back three); later midfield lines: attacking, central inside a line of four; the last line: strikers,
    its ends wingers (AM) when it holds three."""
    found: dict[str, str] = {}
    if not lines:
        return found
    found.update({p: "GK" for p in lines[0]})
    if len(lines) < 2:
        return found
    back = lines[1]
    found.update(_ends(back, "FB", "CB"))
    rest = list(lines[2:])
    if not rest:
        return found
    *middles, last = rest if len(rest) > 1 else [*rest, []]
    for i, line in enumerate(middles):
        if i == 0:
            found.update(_ends(line, "FB" if len(back) == 3 else "AM", "CM"))
        else:
            found.update(_ends(line, "AM", "CM") if len(line) >= 4 else {p: "AM" for p in line})
    if len(last) == 3:
        found.update({p: "AM" if i != 1 else "ST" for i, p in enumerate(last)})
    else:
        found.update({p: "ST" for p in last})
    return found
