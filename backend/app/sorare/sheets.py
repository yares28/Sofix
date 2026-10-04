"""Each LaLiga player's stat sheet from the games export (plans/xscore.md P9 X5b; roadmap 10.5, the Players page).

For one player: what he does in a start (the average count of each action and the points Sorare gives for it) over his last ten starts and over
the whole season, his last ten starts as scores against whom (with the interceptions, assists and goals of each, which the daily missions count) and how often a start of his was decisive, and his clean sheets and penalties saved. The export is local (the refresh does not
read it), so this is written by hand into `frontend/lib/data/stat_sheets.json`, which the Players page reads; the page says "to <date>".

    cd backend
    python -m app.jobs.stat_sheets [--games data/raw/sorare_games.jsonl] [--write]
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from typing import Any

from app.services import team_registry

LAST = 10  # starts the "last ten" window holds
MIN_STARTS = 3  # fewer starts and there is no sheet worth drawing
DECISIVE = 60.0
MISSION_ACTIONS = (
    "interception_won",
    "goal_assist",
    "goals",
)  # counted per start in the last ten, for the daily missions
KEEP = 0.02  # an action he does less often than this per start is left out of the sheet


# Two names Sorare writes that the registry does not know.
ALIASES = {"D. Alavés": "ALA", "Real Club Deportivo de La Coruña": "DEP"}


def _code(game: dict[str, Any], side: str) -> str:
    name = game[side].get("name") or ""
    found = team_registry.by_odds_name(name)
    return found.code if found else ALIASES.get(name) or name.replace(".", "").replace(" ", "")[:3].upper() or "?"


def _average(starts: Sequence[dict[str, Any]]) -> dict[str, list[float]]:
    """The mean count and the mean points of each action per start; an action missing from a start counts as none."""
    total: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for row in starts:
        for key, (count, points) in row["stats"].items():
            total[key][0] += count
            total[key][1] += points
    n = len(starts) or 1
    return {key: [round(v[0] / n, 2), round(v[1] / n, 2)] for key, v in sorted(total.items()) if abs(v[0]) / n >= KEEP}


def sheets_from_games(games: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Every player with enough starts, from the export's games (any order)."""
    by_player: dict[str, list[dict[str, Any]]] = defaultdict(list)
    newest = ""
    for game in sorted(games, key=lambda g: g["date"]):
        newest = max(newest, game["date"][:10])
        for slug, row in game["players"].items():
            if row.get("played") and row.get("started") and row.get("score") is not None:
                home = row["team"] == game["home"]["slug"]
                by_player[slug].append(
                    {
                        **row,
                        "date": game["date"][:10],
                        "opp": _code(game, "away" if home else "home"),
                        "venue": "H" if home else "A",
                    }
                )
    out: dict[str, Any] = {}
    for slug, starts in by_player.items():
        if len(starts) < MIN_STARTS:
            continue
        season = starts  # every start in the export: 2025/26 and 2026/27 so far (the page says "two seasons")
        last = starts[-LAST:]
        out[slug] = {
            "pos": starts[-1]["pos"],
            "team": starts[-1]["team"],
            "starts": len(starts),
            "season": _average(season),
            "seasonStarts": len(season),
            "l10": _average(last),
            "last": [
                [
                    round(s["score"]),
                    s["opp"],
                    1 if float(s.get("level") or 0.0) >= DECISIVE else 0,
                    s["venue"],
                    *(int((s["stats"].get(key) or [0])[0]) for key in MISSION_ACTIONS),
                ]
                for s in last
            ],
            "decAll": round(sum(1 for s in starts if float(s.get("level") or 0.0) >= DECISIVE) / len(starts), 3),
            "cs": sum(1 for s in season if (s["stats"].get("clean_sheet_60") or [0])[0] > 0),
            "pens": int(sum((s["stats"].get("penalty_save") or [0])[0] for s in season)),
        }
    return {"asOf": newest, "players": out}
