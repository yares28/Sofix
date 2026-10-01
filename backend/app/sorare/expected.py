"""The LaLiga competitions Sorare is going to open, before it lists them (plans/review-fixes.md, step 1.7).

Sorare opens a gameweek a few days ahead, so a LaLiga round weeks away has no competitions yet, and the plan for it has to
stand on the ones it opened for the rounds before. Read from its API on gameweeks 1 to 21 of 2026/27 (21 weeks, 22 calls):

- LaLiga's own competitions (LALIGA EA SPORTS, Under 23, All Star with LaLiga in it) were opened in all 11 gameweeks that held
  a LaLiga game, even one (week 10), and in none of the 10 that held none (weeks 1 to 4, 12, 16 to 20);
- the Champion league, which counts the top five leagues together, was opened in all 8 gameweeks with five or more LaLiga
  games and in none of the 3 with fewer (weeks 6, 8 and 10 had 2, 4 and 1).

So a week with a LaLiga game is planned for LaLiga's competitions, and a week with five or more also for Champion: each kind
of week copies the competitions, rewards and cut-offs of the latest finished week of its kind (`pick_templates`).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

LALIGA = "laliga-es"
FULL_ROUND = 5  # LaLiga games from which Sorare also opens the top-five-leagues competitions


def band(laliga_games: int) -> str:
    """The kind of week: "full" from five LaLiga games, "thin" below."""
    return "full" if laliga_games >= FULL_ROUND else "thin"


def gets_laliga(laliga_games: int) -> bool:
    """Whether Sorare opens LaLiga's competitions for a gameweek holding this many LaLiga games."""
    return laliga_games >= 1


def pick_templates(done: list[dict[str, Any]], now: datetime) -> dict[str, dict[str, Any]]:
    """For each kind of week, the latest finished gameweek of that kind: the one whose competitions are copied.

    `done` are gameweeks with their `laliga` count (a week without one was not counted and is no template).
    """
    out: dict[str, dict[str, Any]] = {}
    finished = [w for w in done if datetime.fromisoformat(w["end"]) < now and w.get("laliga")]
    for week in sorted(finished, key=lambda w: w["end"]):
        out[band(int(week["laliga"]))] = week  # later ones overwrite earlier ones
    return out


def laliga_competitions(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The competitions of a gameweek that count LaLiga games, without the ones Sorare was not asked about in full."""
    return [c for c in raw if not c.get("skipped") and LALIGA in (c.get("leagueCompetitions") or [])]
