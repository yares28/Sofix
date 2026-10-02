"""The Audit page: how often Sofix's numbers were right, scored on what really happened (roadmap batch 5, TODO T7, docs/xscore_success_rate.md).

Two questions, each answered from two records.

**The xScore.** The figure the page leads with is how often it picks the better of two players: of every pair of the owner's players in
one position and gameweek, the share where the one with the higher expected score scored more (`backtest.pair_accuracy`; a coin flip
is 50%). It is read off the games the history holds, replayed with the form formula alone (`replay`, written once to
`data/audit/replay.json` by `python -m app.jobs.xscore_backtest --summary`, because the history is the owner's and stays on his machine;
only numbers go in the file). The same count then runs on what the app really said before each lock (`start_chances`, the model's notes
and the settled scores), which is the live record: it begins empty and fills as gameweeks are played.

**Who starts.** Sorare, Futbol Fantasy and Sofix each give a chance that a player starts a game. The record keeps what each said before the
lock and, a day after the gameweek, whether he started (`starts.py`). `starts_record` scores each source on its own games. Only Sofix's
can be replayed on the past, since the others are not kept anywhere once the game is over.

A figure under `FLOOR` cases is not given: the page says "too few to tell" rather than a number that is mostly luck. The page itself
is one read model (`audit`), written by the refresh after the start record and served as it is.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services.publish import put
from app.sorare import backtest, starts

AUDIT_KEY = "audit"
VERSION = 1
# Written by `python -m app.jobs.xscore_backtest --summary`; numbers only, so it can sit in the public repository.
REPLAY_FILE = Path(__file__).resolve().parents[2] / "data" / "audit" / "replay.json"
FLOOR = 100  # cases (settled games, or pairs of players) a figure needs before it is shown: under it, too few to tell
POSITIONS = ("GK", "DEF", "MID", "FWD")
WITHIN = (10, 15, 20)  # "within this many points", the other way of counting a hit that the explanation compares with
EDGES = (0.0, 0.2, 0.5, 0.8, 1.01)  # the chances are grouped into these four bands to see whether "80%" means 80%
SOURCES = starts.SOURCES
WEEKS_KEPT = 8  # gameweeks of the record the page lists


def _r(value: float | None, digits: int = 4) -> float | None:
    return None if value is None else round(float(value), digits)


def _lock(value: Any) -> datetime | None:
    """A gameweek's lock as the record wrote it, or None when it is missing or not a date: that gameweek is left out, not an error."""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------------------------------- the replay of the past
def _pairs(found: dict[str, Any]) -> dict[str, Any]:
    """What `pair_accuracy` found, as the file keeps it: the rate and its 95% interval, and how many pairs and gameweeks stand behind it."""
    return {
        "rate": _r(found["rate"]),
        "lo": _r(found["lo"]),
        "hi": _r(found["hi"]),
        "pairs": found["pairs"],
        "weeks": found["weeks"],
    }


def _buckets(chance: np.ndarray, started: np.ndarray) -> list[dict[str, Any]]:
    """What was said against what happened, band by band; an empty band is left out."""
    out = []
    for low, high in zip(EDGES, EDGES[1:], strict=False):
        inside = (chance >= low) & (chance < high)
        if inside.any():
            out.append(
                {
                    "from": low,
                    "to": min(high, 1.0),
                    "n": int(inside.sum()),
                    "said": _r(float(chance[inside].mean())),
                    "was": _r(float(started[inside].mean())),
                }
            )
    return out


def _scores(pairs: list[tuple[float, bool]]) -> dict[str, Any]:
    """How a source's chances did on games that were played: how often calling it at 50% was right, how far off it was on average
    (0 is perfect, 0.25 is saying 50% every time), the chance it gave on average against how often he really started, and the bands."""
    chance = np.array([said for said, _ in pairs], dtype=float)
    started = np.array([did for _, did in pairs], dtype=float)
    return {
        "right": _r(float(np.mean((chance >= 0.5) == (started == 1)))),
        "brier": _r(float(np.mean((chance - started) ** 2))),
        "mean": _r(float(chance.mean())),
        "started": _r(float(started.mean())),
        "buckets": _buckets(chance, started),
    }


def replay(players: dict[str, dict[str, Any]], fixtures: list[dict[str, str]], now: datetime) -> dict[str, Any]:
    """The history scored: how often the form formula's expected score picked the better of two players in a Sorare gameweek, what a
    plain average of his last five games and a flat guess would get, how far off it ran, and how right Sofix's chance of starting was
    on the games it replays. Numbers only: nothing in it names a player."""
    weeks = backtest.walk_gameweeks(players, fixtures)
    today = [row for row in weeks if row.model == "today"]
    by_position = {}
    for pos in POSITIONS:
        found = backtest.pair_accuracy([row for row in weeks if row.pos == pos], "today")
        if found["pairs"]:
            by_position[pos] = _pairs(found)
    miss = backtest.scores(today, [])[0] if today else None
    dates = sorted(row.date for row in today)
    games = [
        row
        for row in backtest.walk_forward(players, fixtures=fixtures)
        if row.model == "today" and row.p_start is not None
    ]
    sofix = [(float(row.p_start or 0.0), bool(row.started)) for row in games]
    return {
        "version": VERSION,
        "builtAt": now.isoformat(),
        "from": dates[0].date().isoformat() if dates else None,
        "to": dates[-1].date().isoformat() if dates else None,
        "players": len({row.player for row in today}),
        "xscore": {
            "games": len(today),
            "pairs": _pairs(backtest.pair_accuracy(weeks, "today")),
            "last5": _pairs(backtest.pair_accuracy(weeks, "last5")),
            "flat": _pairs(backtest.pair_accuracy(weeks, "flat45")),
            "byPosition": by_position,
            "typicalMiss": _r(miss["mae"], 1) if miss else None,
            "bias": _r(miss["bias"], 1) if miss else None,
            "said": _r(float(np.mean([row.expected for row in today])), 1) if today else None,
            "was": _r(float(np.mean([row.score for row in today])), 1) if today else None,
            "within": {
                str(points): _r(float(np.mean([abs(row.expected - row.score) <= points for row in today])))
                if today
                else None
                for points in WITHIN
            },
        },
        "starts": {
            "sofix": {
                "games": len(sofix),
                **_scores(sofix),
                "always": _r(
                    max(float(np.mean([did for _, did in sofix])), 1 - float(np.mean([did for _, did in sofix])))
                ),
            }
        }
        if sofix
        else {},
    }


def read_replay(path: Path | None = None) -> dict[str, Any] | None:
    """The replay file, or None when it is missing, unreadable or not the shape this build writes: the page then says there is none."""
    try:
        raw = json.loads((path or REPLAY_FILE).read_text("utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(raw, dict) or raw.get("version") != VERSION or not isinstance(raw.get("xscore"), dict):
        return None
    return raw


# ---------------------------------------------------------------------------------------------------- who starts, as recorded
def _cells(entry: dict[str, Any]) -> list[dict[str, Any]]:
    """A player's games in the record: one entry per game, or, in the older entries, the player's own entry for the whole gameweek."""
    games = entry.get("games")
    if isinstance(games, dict) and games:
        return [cell for cell in games.values() if isinstance(cell, dict)]
    return [entry] if any(source in entry for source in SOURCES) else []


def _state(recorded: int, settled: int) -> str:
    """Nothing written, written but not played yet, played but under the floor, or enough to give a figure."""
    if not recorded:
        return "none"
    if not settled:
        return "waiting"
    return "few" if settled < FLOOR else "enough"


def starts_record(record: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """How each source did on the games it had a number for, once they were settled; a source under the floor shows its counts only."""
    recorded = dict.fromkeys(SOURCES, 0)
    said: dict[str, list[tuple[float, bool]]] = {source: [] for source in SOURCES}
    for week in (record.get("weeks") or {}).values():
        for entry in (week.get("players") or {}).values():
            for cell in _cells(entry):
                for source in SOURCES:
                    if source not in cell:
                        continue
                    recorded[source] += 1
                    if "started" in cell:
                        said[source].append((float(cell[source]["chance"]), bool(cell["started"])))
    out: dict[str, dict[str, Any]] = {}
    for source in SOURCES:
        state = _state(recorded[source], len(said[source]))
        shown = (
            _scores(said[source])
            if state == "enough"
            else {"right": None, "brier": None, "mean": None, "started": None, "buckets": None}
        )
        out[source] = {"state": state, "recorded": recorded[source], "settled": len(said[source]), **shown}
    return out


def weeks_record(record: dict[str, Any]) -> list[dict[str, Any]]:
    """The gameweeks the record holds, newest first: the games written down before the lock, those since scored, and how many each source gave."""
    out = []
    for slug, week in (record.get("weeks") or {}).items():
        sources = dict.fromkeys(SOURCES, 0)
        games = settled = 0
        for entry in (week.get("players") or {}).values():
            for cell in _cells(entry):
                games += 1
                settled += "started" in cell
                for source in SOURCES:
                    sources[source] += source in cell
        out.append({"slug": slug, "lock": week.get("lock"), "games": games, "settled": settled, "sources": sources})
    out.sort(key=lambda item: _lock(item["lock"]) or datetime.min.replace(tzinfo=UTC), reverse=True)
    return out[:WEEKS_KEPT]


# ---------------------------------------------------------------------------------------------------- the xScore, as recorded
def _marked(record: dict[str, Any]) -> tuple[list[backtest.Row], int]:
    """One row per player and gameweek the model noted and whose games are all settled: what it expected (the chance he plays times his
    score if he plays, as the replay does) against his best game, zero if he played none. And how many players were noted at all."""
    rows: list[backtest.Row] = []
    noted = 0
    for slug, week in (record.get("weeks") or {}).items():
        lock = _lock(week.get("lock"))
        if lock is None:
            continue
        for who, entry in (week.get("players") or {}).items():
            note, games = entry.get("model"), entry.get("games")
            if not isinstance(note, dict) or not isinstance(games, dict) or not games:
                continue
            try:
                expected = float(note["pPlay"]) * float(note["mu"])
            except (KeyError, TypeError, ValueError):
                continue
            noted += 1
            results = [cell for cell in games.values() if isinstance(cell, dict) and "started" in cell]
            if len(results) < len(games):
                continue  # a game still to be scored: he is marked when the gameweek is
            played = [cell for cell in results if cell.get("played")]
            rows.append(
                backtest.Row(
                    model="live",
                    player=who,
                    pos=note.get("pos"),
                    date=lock,
                    week=slug,
                    competition="",
                    klass="club",
                    before=0,
                    score=max((float(cell.get("score") or 0.0) for cell in played), default=0.0),
                    played=bool(played),
                    started=any(cell.get("started") for cell in results),
                    expected=expected,
                )
            )
    return rows, noted


def live_rows(record: dict[str, Any]) -> list[backtest.Row]:
    return _marked(record)[0]


def xscore_record(record: dict[str, Any]) -> dict[str, Any]:
    """The same count as the replay's, on what the app really said before each lock: how often the higher expected score went with
    the higher real one. Under the floor it gives the counts and no rate."""
    rows, noted = _marked(record)
    found = backtest.pair_accuracy(rows, "live")
    pairs = int(found["pairs"])
    state = "none" if not noted else "waiting" if not pairs else "few" if pairs < FLOOR else "enough"
    shown = state == "enough"
    return {
        "state": state,
        "floor": FLOOR,
        "noted": noted,
        "marked": len(rows),
        "pairs": pairs,
        "weeks": found["weeks"],
        "rate": _r(found["rate"]) if shown else None,
        "lo": _r(found["lo"]) if shown else None,
        "hi": _r(found["hi"]) if shown else None,
    }


# ---------------------------------------------------------------------------------------------------- the page
def build(record: dict[str, Any], replayed: dict[str, Any] | None, now: datetime) -> dict[str, Any]:
    """The page: the replay of the past beside the live record, for the xScore and for who starts."""
    return {
        "version": VERSION,
        "generatedAt": now.isoformat(),
        "floor": FLOOR,
        "replay": ({key: replayed.get(key) for key in ("builtAt", "from", "to", "players")} if replayed else None),
        "xscore": {"replay": replayed.get("xscore") if replayed else None, "live": xscore_record(record)},
        "starts": {
            "replay": replayed.get("starts") if replayed else None,
            "live": starts_record(record),
            "weeks": weeks_record(record),
        },
    }


def record_of(db: Session) -> dict[str, Any]:
    row = db.get(ReadModel, starts.START_KEY)
    return dict(row.payload) if row and isinstance(row.payload, dict) else {}


def publish(db: Session, now: datetime) -> dict[str, int]:
    """Write the page, from the start record as it stands and the replay file. Called by the refresh once the record is up to date."""
    page = build(record_of(db), read_replay(), now)
    put(db, AUDIT_KEY, page, now)
    return {
        "bytes": len(json.dumps(page, separators=(",", ":"))),
        "settled": sum(figures["settled"] for figures in page["starts"]["live"].values()),
        "pairs": page["xscore"]["live"]["pairs"],
    }
