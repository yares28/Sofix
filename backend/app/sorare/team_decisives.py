"""How many decisive actions each club gets per goal, for the board's xD (expected decisives).

    cd backend
    python -m app.sorare.team_decisives [--games data/raw/sorare_games.jsonl] [--out artifacts/team_decisives.json]

A decisive action is one of Sorare's positive ones (a goal, an assist, a penalty won, a clearance off the line, a last-man tackle,
a penalty saved). The games export keeps, for every played game, what each player did, so a club's decisive actions and its goals
over the season give its rate. The board's xD is the club's xG times that rate. A club with few games is pulled toward the league's
rate (`PRIOR_GOALS` goals' worth), so one busy week does not move it far. The result is a small committed file: the refresh does
not read the export, which only exists on the owner's computer.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.services.team_registry import by_odds_name
from app.sorare.gamedata import DEFAULT_GAMES, read_games

# The positive decisive actions as `detailedScore` names them: the list in sorare/missions.py, repeated here because that module
# reaches this one through the grid and an import would loop.
DECISIVE_STATS = ("goals", "goal_assist", "assist_penalty_won", "clearance_off_line", "last_man_tackle", "penalty_save")
BACKEND = Path(__file__).resolve().parents[2]
DEFAULT_OUT = BACKEND / "artifacts" / "team_decisives.json"
PRIOR_GOALS = 10.0  # a club's own goals count this many times more than the league's rate until it has scored this many


def build(games: list[dict[str, Any]]) -> dict[str, Any]:
    """Each club's decisive actions and goals over these games, its rate, and the league's."""
    totals: dict[str, dict[str, float]] = defaultdict(lambda: {"decisives": 0.0, "goals": 0.0, "games": 0.0})
    for game in games:
        for side, goals in (("home", game.get("homeGoals")), ("away", game.get("awayGoals"))):
            info = by_odds_name(game[side]["name"])
            if info is None or goals is None:
                continue
            decisives = sum(
                float(player["stats"][stat][0])
                for player in game["players"].values()
                if player.get("team") == game[side]["slug"]
                for stat in DECISIVE_STATS
                if stat in player.get("stats", {})
            )
            row = totals[info.code]
            row["decisives"] += decisives
            row["goals"] += goals
            row["games"] += 1
    goals_all = sum(row["goals"] for row in totals.values())
    league = sum(row["decisives"] for row in totals.values()) / goals_all if goals_all else 0.0
    teams = {
        code: {
            "decisives": int(row["decisives"]),
            "goals": int(row["goals"]),
            "games": int(row["games"]),
            "rate": round((row["decisives"] + PRIOR_GOALS * league) / (row["goals"] + PRIOR_GOALS), 3),
        }
        for code, row in sorted(totals.items())
    }
    through = max((game["date"] for game in games), default=None)
    return {"league": round(league, 3), "prior_goals": PRIOR_GOALS, "through": through, "teams": teams}


@lru_cache(maxsize=4)
def load(path: str) -> dict[str, float]:
    """Club code -> decisive actions per goal, plus the league's under "*" for a club the file does not know. Empty when there is no file."""
    try:
        data = json.loads(Path(path).read_text("utf-8"))
    except (OSError, ValueError):
        return {}
    rates = {code: float(row["rate"]) for code, row in data.get("teams", {}).items()}
    if data.get("league"):
        rates["*"] = float(data["league"])
    return rates


def expected_decisives(xg: float | None, code: str, rates: dict[str, float]) -> float | None:
    """xD: the club's xG times its decisive actions per goal; None when there is no xG or no rate to use."""
    rate = rates.get(code, rates.get("*"))
    return None if xg is None or rate is None else round(xg * rate, 2)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write each club's decisive actions per goal from the games export.")
    parser.add_argument("--games", type=Path, default=DEFAULT_GAMES)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)
    result = build(read_games(args.games))
    args.out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", "utf-8")
    print(f"{len(result['teams'])} clubs, league rate {result['league']}, through {result['through']} -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
