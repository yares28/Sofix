"""Today's xScore against Sorare's own projection, on every LaLiga player (plans/xscore.md P9 X2 and P6; roadmap 10.2).

The games export (`app.jobs.export_games`) keeps, for every player of every game, the projection and grade Sorare gave before
kick-off. So the question P6 waited for 100 recorded players to ask can be asked of two seasons now: on the games a player started,
whose number was nearer to what he scored, today's "if he starts" or Sorare's projection?

Numbers only: nothing here names a player, so what it returns can be committed beside the Audit page's other replay figures.
"""

from __future__ import annotations

import dataclasses
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

import numpy as np

from app.sorare import backtest

WITHIN = (3, 7, 10, 15)  # "within this many points": how often a number landed that close to the score
MIN_BEFORE = 3  # games of form the formula needs before its number means anything


def _when(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def projections(games: list[dict[str, Any]]) -> dict[tuple[str, datetime], float]:
    """Sorare's projection for each player and game it gave one for, by the player and the time of his game."""
    found: dict[tuple[str, datetime], float] = {}
    for game in games:
        when = _when(game["date"])
        for slug, player in game["players"].items():
            if player.get("proj") is not None:
                found[(slug, when)] = float(player["proj"])
    return found


def _misses(said: np.ndarray, score: np.ndarray) -> dict[str, Any]:
    error = said - score
    return {
        "mae": float(np.abs(error).mean()),
        "rmse": float(np.sqrt((error**2).mean())),
        "bias": float(error.mean()),
        "within": {str(points): float((np.abs(error) <= points).mean()) for points in WITHIN},
    }


def _closer(today: np.ndarray, sorare: np.ndarray, score: np.ndarray) -> float:
    """The share of games where today's number was nearer to the score than Sorare's; a tie counts half."""
    mine, theirs = np.abs(today - score), np.abs(sorare - score)
    return float(((mine < theirs).sum() + 0.5 * (mine == theirs).sum()) / len(score))


def versus_sorare(
    rows: list[backtest.Row], projected: dict[tuple[str, datetime], float], *, min_before: int = MIN_BEFORE
) -> dict[str, Any]:
    """Today's "if he starts" against Sorare's projection, on the games a player started with at least `min_before` games of form
    behind him and a projection from Sorare.

    `rows` are today's model's rows (`backtest.walk_forward`). `diff` is today's miss minus Sorare's on average, in points ("absolute")
    and in squared points ("squared"), each with a 95% interval from resampling whole weeks (`backtest.compare`): below zero with an
    interval under zero is today's number being the closer one. `closer` is the share of games it was nearer in.
    """
    cases = [
        (row, row.start, projected[(row.player, row.date)])
        for row in rows
        if row.model == "today"
        and row.started
        and row.start is not None
        and row.before >= min_before
        and (row.player, row.date) in projected
    ]
    if not cases:
        return {"games": 0, "weeks": 0, "today": None, "sorare": None, "closer": None, "diff": None, "byPosition": {}}
    score = np.array([row.score for row, _, _ in cases], dtype=float)
    today = np.array([start for _, start, _ in cases], dtype=float)
    sorare = np.array([theirs for _, _, theirs in cases], dtype=float)
    pooled = [
        dataclasses.replace(row, model=name, expected=float(value))
        for row, start, theirs in cases
        for name, value in (("start", start), ("sorare", theirs))
    ]
    by_position: dict[str, dict[str, Any]] = {}
    for pos in sorted({str(row.pos) for row, _, _ in cases}):
        mine = np.array([str(row.pos) == pos for row, _, _ in cases])
        by_position[pos] = {
            "games": int(mine.sum()),
            "today": _misses(today[mine], score[mine]),
            "sorare": _misses(sorare[mine], score[mine]),
            "closer": _closer(today[mine], sorare[mine], score[mine]),
        }
    weeks: dict[str, int] = defaultdict(int)
    for row, _, _ in cases:
        weeks[row.week] += 1
    return {
        "games": len(cases),
        "weeks": len(weeks),
        "today": _misses(today, score),
        "sorare": _misses(sorare, score),
        "closer": _closer(today, sorare, score),
        "diff": {
            metric: backtest.compare(pooled, "start", "sorare", metric=metric) for metric in ("absolute", "squared")
        },
        "byPosition": by_position,
    }


def _group_misses(said: list[float], score: list[float]) -> dict[str, Any] | None:
    if not said:
        return None
    return {"games": len(said), **_misses(np.array(said, dtype=float), np.array(score, dtype=float))}


def xscore_misses(rows: list[backtest.Row]) -> dict[str, Any]:
    """How far today's xScore was from what each player scored, told two ways, each with how many games, the typical miss, the lean and
    how often it was within 3, 7, 10 and 15 points (a group with no game is None).

    `shown` is the number the tile shows, on the games it is about: his score if he starts on the games he started, his score if he
    comes on on his appearances off the bench. `expected` is the expected score, the chance of not playing included, which is what
    plans add up: on every game, on the games he played and on the games he started.
    """
    today = [row for row in rows if row.model == "today"]
    played = [row for row in today if row.played]
    started = [row for row in today if row.started]
    came_on = [row for row in played if not row.started and row.on is not None]
    shown_start = [row for row in started if row.start is not None]
    return {
        "expected": {
            name: _group_misses([row.expected for row in group], [row.score for row in group])
            for name, group in (("all", today), ("played", played), ("started", started))
        },
        "shown": {
            "started": _group_misses([row.start or 0.0 for row in shown_start], [row.score for row in shown_start]),
            "cameOn": _group_misses([row.on or 0.0 for row in came_on], [row.score for row in came_on]),
        },
    }


def _pair_figure(found: dict[str, Any]) -> dict[str, Any]:
    keep = ("lo", "hi") if found["rate"] is not None else ()
    return {
        "rate": None if found["rate"] is None else round(found["rate"], 4),
        **{key: round(found[key], 4) for key in keep},
        "pairs": found["pairs"],
        "weeks": found["weeks"],
    }


def replay(games: list[dict[str, Any]], fixtures: list[dict[str, str]], now: datetime) -> dict[str, Any]:
    """Today's xScore replayed on every LaLiga player of the export: the figures the Audit's catalogue starts from.

    Each game is predicted from the games the player had before its Sorare gameweek (`backtest.walk_forward`, LaLiga games only, so
    his form is his LaLiga form). It gives how far the xScore was from the score and how often within a few points, how often it put
    the better of two players first (a coin flip is 50%), and how it did against Sorare's projection, all and by season. Numbers only.
    """
    from app.sorare import gamedata

    players = gamedata.players_of(games)
    rows = backtest.walk_forward(players, fixtures=fixtures)
    weeks = backtest.walk_gameweeks(players, fixtures)
    projected = projections(games)
    today = [row for row in rows if row.model == "today"]
    dates = sorted(row.date for row in today)
    seasons = sorted({gamedata.season_of(row.date.isoformat()) for row in today})
    positions = sorted({str(row.pos) for row in weeks if row.pos})
    return {
        "version": 1,
        "builtAt": now.isoformat(),
        "from": dates[0].date().isoformat() if dates else None,
        "to": dates[-1].date().isoformat() if dates else None,
        "games": len(games),
        "players": len({row.player for row in today}),
        "xscore": xscore_misses(rows),
        "pairs": {
            "today": _pair_figure(backtest.pair_accuracy(weeks, "today")),
            "last5": _pair_figure(backtest.pair_accuracy(weeks, "last5")),
            "flat": _pair_figure(backtest.pair_accuracy(weeks, "flat45")),
            "byPosition": {
                pos: _pair_figure(backtest.pair_accuracy([r for r in weeks if r.pos == pos], "today"))
                for pos in positions
            },
        },
        "vsSorare": versus_sorare(rows, projected),
        "bySeason": {
            season: {
                "xscore": xscore_misses([r for r in rows if gamedata.season_of(r.date.isoformat()) == season]),
                "vsSorare": versus_sorare(
                    [r for r in rows if gamedata.season_of(r.date.isoformat()) == season], projected
                ),
            }
            for season in seasons
        },
    }
