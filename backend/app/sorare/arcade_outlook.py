"""Arcade's sources ranked by measured accuracy, and each player's start record (plans/arcade-trust.md §4, owner 20 Nov 2026).

The owner's rule: "put the one with the best accuracy at the top and each time fallback to the second, third, etc." For each
competition, the start sources (Sorare, Futbol Fantasy, Sofix, the record) and the score-if-he-starts sources (Sofix, Sorare, his
last starts) are ranked by their error on settled games, from `player_games`' pre-kick-off statements. The page takes, for each card
and game, the best-ranked source that has a number, then the next. Every player's record makes sure something honest is always last:
never "counts as starting".
"""

from __future__ import annotations

import logging
import math
import os
from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PlayerGame
from app.services.timeutil import as_utc
from app.sorare.forecast import PRIOR_START_SCORE, PRIOR_SUB_SCORE

logger = logging.getLogger(__name__)

KEY = "arcade_outlook"
# A national team's games say nothing about his club's eleven.
NATIONAL = frozenset({"uefa-nations-league", "global-cup"})
SETTLED = frozenset({"FINAL", "DID_NOT_PLAY"})
RECORD_GAMES = (
    10  # measured 20 Nov 2026: the last ten told who starts with an error score of 0.142 (everyone starts: 0.624)
)
SHORT = 5  # fewer settled games than this: "short record"
LAST_STARTS = 5  # his score if he starts, from his last five starts
MIN_STARTS = 3  # fewer starts than this: no score of his own
FLOOR = 100  # the Audit's floor: fewer settled games in a competition ranks a source by its figure over all of them
MEASURE_DAYS = 90
START_SOURCES = {"sorare": "sorare_start", "futbolfantasy": "ff_start", "sofix": "sofix_start"}
SCORE_SOURCES = {"sofix": "sofix_x", "sorare": "sorare_x"}

Row = tuple[datetime, str, str | None, bool | None, bool | None, float | None, dict[str, float | None]]


def record(games: Iterable[Row]) -> dict[str, Any] | None:
    """His last ten settled club games, newest first: chance to start, to come on, and his score in each case.

    The chances are smoothed as Sofix's own forecast does (`forecast._split`: a prior of 0.6 to play, split two to one), so ten
    starts in ten say 90% and none in ten 7%, close to what happened (90-99% → 88% started, 0-9% → 3%; 20 Nov 2026).
    """
    last: list[Row] = []
    for g in games:
        if g[1] not in NATIONAL and g[2] in SETTLED and (g[2] == "DID_NOT_PLAY" or g[4] is not None):
            last.append(g)
            if len(last) == RECORD_GAMES:
                break
    n = len(last)
    if not n:
        return None
    started = [g for g in last if g[2] == "FINAL" and g[4]]
    came_on = [g for g in last if g[2] == "FINAL" and g[3] and not g[4]]
    start_scores = [g[5] for g in started if g[5] is not None][:LAST_STARTS]
    bench_scores = [g[5] for g in came_on if g[5] is not None]
    out: dict[str, Any] = {
        "n": n,
        "s": round((len(started) + 0.8) / (n + 2), 3),
        "o": round((len(came_on) + 0.4) / (n + 2), 3),
        "x": round(sum(start_scores) / len(start_scores), 1) if len(start_scores) >= MIN_STARTS else None,
        "b": round((sum(bench_scores) + 2 * PRIOR_SUB_SCORE) / (len(bench_scores) + 2), 1),
    }
    if n < SHORT:
        out["short"] = True
    return out


def _rank(errors: dict[str, dict[str, list[float]]], kind: str) -> dict[str, Any]:
    """Each competition's sources, best first: Brier score for starts, typical miss (root mean square) for scores."""

    def figure(values: list[float]) -> float:
        mean = sum(values) / len(values)
        return round(mean if kind == "start" else math.sqrt(mean), 4 if kind == "start" else 2)

    overall: dict[str, list[float]] = defaultdict(list)
    for by_source in errors.values():
        for source, values in by_source.items():
            overall[source].extend(values)
    everywhere = {source: (figure(v), len(v)) for source, v in overall.items() if v}
    ranked: dict[str, Any] = {}
    for competition, by_source in sorted(errors.items()):
        rows = []
        for source, (all_figure, all_n) in everywhere.items():
            here = by_source.get(source) or []
            if len(here) >= FLOOR:
                rows.append({"source": source, "error": figure(here), "n": len(here)})
            elif all_n >= FLOOR:
                rows.append({"source": source, "error": all_figure, "n": len(here), "here": False})
        # Ties go to the source with more settled games here (plans/arcade-trust.md §4).
        ranked[competition] = sorted(rows, key=lambda r: (r["error"], -r["n"]))
    ranked["*"] = sorted(
        ({"source": s, "error": f, "n": n} for s, (f, n) in everywhere.items() if n >= FLOOR),
        key=lambda r: (r["error"], -r["n"]),
    )
    return ranked


CALIBRATE_MIN = 200  # settled cases before a source's chances are corrected (FORECAST-RAW-001's floor)
HELD_OUT_MIN = 30  # newest games kept apart to check the correction, at least this many
HELD_OUT_SHARE = 1 / 3
GAIN_MIN = 0.01  # the held-out error must fall by at least 1%, or the raw chance stays (Ligue 1's record, 21 Nov: 0.2%)
SURE = 0.98  # no forecast is ever certain: a corrected chance stays between 2% and 98%

Pair = tuple[float, float, datetime]  # (what the source said, whether he started, the game's date)


def _isotonic(pairs: list[tuple[float, float]]) -> list[list[float]]:
    """Pool-adjacent-violators: the share who started, never falling as the source's chance rises. Points [said, started]."""
    same: dict[
        float, list[float]
    ] = {}  # games with the same chance said are one point first, so no two points share a chance
    for said, started in pairs:
        group = same.setdefault(said, [0.0, 0.0])
        group[0] += started
        group[1] += 1
    blocks: list[list[float]] = []  # [sum of said, sum of started, count]
    for said, (started, count) in sorted(same.items()):
        blocks.append([said * count, started, count])
        while len(blocks) > 1 and blocks[-2][1] / blocks[-2][2] > blocks[-1][1] / blocks[-1][2]:
            last = blocks.pop()
            blocks[-1] = [blocks[-1][0] + last[0], blocks[-1][1] + last[1], blocks[-1][2] + last[2]]
    return [[round(s / n, 4), round(min(SURE, max(1 - SURE, y / n)), 4)] for s, y, n in blocks]


def apply(points: list[list[float]], said: float) -> float:
    """A source's chance corrected by its points, straight lines between them, flat beyond the ends."""
    if not points:
        return said
    if said <= points[0][0]:
        return points[0][1] if said > 0 else 0.0
    for (x0, y0), (x1, y1) in zip(points, points[1:], strict=False):
        if said <= x1:
            return round(y0 + (y1 - y0) * (said - x0) / (x1 - x0), 4) if x1 > x0 else y1
    return points[-1][1]


def calibrate(pairs: list[Pair]) -> dict[str, Any] | None:
    """A correction for one source in one competition, or None when it is not earned: under 200 cases, under 30 held-out games,
    or no better than the raw chance on the newest third of the games (fitted on the older two thirds). Shipped fitted on all."""
    if len(pairs) < CALIBRATE_MIN:
        return None
    ordered = sorted(pairs, key=lambda p: p[2])
    cut = len(ordered) - max(HELD_OUT_MIN, round(len(ordered) * HELD_OUT_SHARE))
    train, test = ordered[:cut], ordered[cut:]
    if len(test) < HELD_OUT_MIN or len(train) < HELD_OUT_MIN:
        return None
    fit = _isotonic([(s, y) for s, y, _ in train])
    raw = sum((s - y) ** 2 for s, y, _ in test) / len(test)
    corrected = sum((apply(fit, s) - y) ** 2 for s, y, _ in test) / len(test)
    if corrected >= raw * (1 - GAIN_MIN):
        return None
    return {
        "points": _isotonic([(s, y) for s, y, _ in ordered]),
        "n": len(ordered),
        "heldOut": len(test),
        "brierRaw": round(raw, 4),
        "brierCalibrated": round(corrected, 4),
    }


def build(rows: Iterable[tuple[Any, ...]], now: datetime) -> dict[str, Any]:
    """`rows`: (player, date, competition, status, played, started, score, sorare_start, ff_start, sofix_start, sofix_x,
    sorare_x), newest first per player. The record of every player, and the ranking measured over the last 90 days."""
    by_player: dict[str, list[tuple[datetime, str, Row]]] = defaultdict(list)
    for player, date, competition, status, played, started, score, sorare_s, ff_s, sofix_s, sofix_x, sorare_x in rows:
        when = as_utc(date)
        if when is None or when > now:
            continue
        said = {
            "sorare_start": sorare_s,
            "ff_start": ff_s,
            "sofix_start": sofix_s,
            "sofix_x": sofix_x,
            "sorare_x": sorare_x,
        }
        by_player[player].append((when, competition, (when, competition, status, played, started, score, said)))
    start_errors: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    start_pairs: dict[str, dict[str, list[Pair]]] = defaultdict(lambda: defaultdict(list))
    score_errors: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    since = now - timedelta(days=MEASURE_DAYS)
    players: dict[str, Any] = {}
    for player, games in by_player.items():
        games.sort(key=lambda g: g[0], reverse=True)
        history = [g[2] for g in games]
        mine = record(history)
        if mine:
            players[player] = mine
        for i, (when, competition, status, _played, started, score, said) in enumerate(history):
            if when < since or competition in NATIONAL or status not in SETTLED:
                continue
            if status == "FINAL" and started is None:
                continue
            truth = 1.0 if status == "FINAL" and started else 0.0
            before = record(history[i + 1 :])
            if before and before["n"] >= SHORT:
                start_errors[competition]["record"].append((before["s"] - truth) ** 2)
                start_pairs[competition]["record"].append((before["s"], truth, when))
            for source, column in START_SOURCES.items():
                if (value := said[column]) is not None:
                    start_errors[competition][source].append((float(value) - truth) ** 2)
                    start_pairs[competition][source].append((float(value), truth, when))
            if truth and score is not None:
                if before and before["x"] is not None:
                    score_errors[competition]["form"].append((score - before["x"]) ** 2)
                for source, column in SCORE_SOURCES.items():
                    if (value := said[column]) is not None:
                        score_errors[competition][source].append((score - float(value)) ** 2)
    return {
        "ranking": {"start": _rank(start_errors, "start"), "score": _rank(score_errors, "score")},
        # Each start source's chances corrected to what happened, per competition, only where the correction earned it (step 9).
        "calibration": {
            competition: fits
            for competition, by_source in sorted(start_pairs.items())
            if (fits := {s: fit for s, pairs in by_source.items() if (fit := calibrate(pairs))})
        },
        "priors": {"start": PRIOR_START_SCORE, "bench": PRIOR_SUB_SCORE},
        "players": players,
    }


def rows_of(db: Session) -> Iterable[tuple[Any, ...]]:
    query = select(
        PlayerGame.player,
        PlayerGame.date,
        PlayerGame.competition,
        PlayerGame.status,
        PlayerGame.played,
        PlayerGame.started,
        PlayerGame.score,
        PlayerGame.sorare_start,
        PlayerGame.ff_start,
        PlayerGame.sofix_start,
        PlayerGame.sofix_x,
        PlayerGame.sorare_x,
    ).order_by(PlayerGame.player, PlayerGame.date.desc())
    return db.execute(query).tuples()


def publish(db: Session, now: datetime) -> dict[str, int]:
    """Written with the Audit. Its games come from the local copy (`PLAYER_GAMES_MIRROR`), never in full from Neon."""
    from app.services.publish import put
    from app.sorare import games_mirror

    if db.get_bind().dialect.name == "postgresql" and not os.environ.get("PLAYER_GAMES_MIRROR"):
        logger.info("arcade outlook: no game history copy, left as it was")
        return {}
    games = games_mirror.view(db)
    payload = build(rows_of(games), now)
    put(db, KEY, payload, now)
    return {"players": len(payload["players"]), "competitions": len(payload["ranking"]["start"]) - 1}
