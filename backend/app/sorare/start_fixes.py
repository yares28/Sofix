"""Start chances corrected from the record (plans/xscore.md X8).

Every source's chance that a player starts a game is written down before the lock and settled by whether he started
(`starts.py`, `PlayerGame`). Grouped in bands of five points per source, the record says how often "70%" really started. A
band with 100 settled cases or more is moved to what happened, the same distance for every chance inside it; a band with
fewer is left as it was, since a difference under 100 cases is mostly luck. The forecast then makes the expected score from
the corrected chance, while the record keeps what the source really said, so the next measurement is not of its own work.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PlayerGame, ReadModel

logger = logging.getLogger(__name__)

RECORD_KEY = "start_chances"  # `starts.START_KEY`
BAND = 0.05
MIN_CASES = 100
COLUMNS = {"futbolfantasy": "ff_start", "sorare": "sorare_start", "sofix": "sofix_start"}

MAX_GAP = 2  # bands: a sparse band only joins a neighbour within ten points
Case = tuple[str, float, bool]  # source, the chance it gave, whether he started


def _runs(bands: dict[int, list[tuple[float, bool]]]) -> list[list[int]]:
    """Group a source's bands: one with 100 cases stands alone; thinner neighbours (within ten points) pool until they have 100.
    What is left over below 100 joins the pooled group just before it (never a band that stands alone), else is listed and not used."""
    out: list[list[int]] = []
    run: list[int] = []
    for key in sorted(bands):
        if run and (key - run[-1] > MAX_GAP or len(bands[key]) >= MIN_CASES):
            out.append(run)
            run = []
        run.append(key)
        if sum(len(bands[k]) for k in run) >= MIN_CASES:
            out.append(run)
            run = []
    if run and out and len(out[-1]) > 1 and run[0] - out[-1][-1] <= MAX_GAP:
        out[-1] += run
        run = []
    return [*out, run] if run else out


class StartFixes:
    def __init__(self, cases: Iterable[Case] = ()) -> None:
        groups: dict[str, dict[int, list[tuple[float, bool]]]] = {}
        for source, said, started in cases:
            groups.setdefault(source, {}).setdefault(round(said / BAND), []).append((said, started))
        self._shift: dict[tuple[str, int], float] = {}
        self._table: dict[str, list[dict[str, Any]]] = {}
        for source, bands in groups.items():
            for keys in _runs(bands):
                made = [case for key in keys for case in bands[key]]
                said = sum(s for s, _ in made) / len(made)
                was = sum(started for _, started in made) / len(made)
                used = len(made) >= MIN_CASES
                self._table.setdefault(source, []).append(
                    {
                        "from": round(min(s for s, _ in made), 3),
                        "to": round(max(s for s, _ in made), 3),
                        "said": round(said, 3),
                        "was": round(was, 3),
                        "n": len(made),
                        "used": used,
                    }
                )
                if used:
                    self._shift.update({(source, key): was - said for key in keys})

    def apply(self, source: str, chance: float) -> float:
        """The chance as the record says it should be: moved by how far its band was off, once the band has 100 cases."""
        shift = self._shift.get((source, round(chance / BAND)))
        return chance if shift is None else round(min(1.0, max(0.0, chance + shift)), 4)

    def table(self) -> dict[str, list[dict[str, Any]]]:
        """Per source, each band's range and average chance, how often he started, the cases, and whether the band is used."""
        return self._table

    def log(self) -> None:
        for source, bands in self._table.items():
            for band in bands:
                if band["used"]:
                    logger.info(
                        "start chances: %s said %.0f%% to %.0f%%, %.0f%% started (%d cases): corrected",
                        source,
                        band["from"] * 100,
                        band["to"] * 100,
                        band["was"] * 100,
                        band["n"],
                    )


def cases(db: Session) -> list[Case]:
    """Every settled game with what each source said before the lock: the game rows, and the older record beside them (a game is
    counted once per source, wherever it is found)."""
    found: dict[tuple[str, str, str], tuple[float, bool]] = {}
    row = db.get(ReadModel, RECORD_KEY)
    record = row.payload if row and isinstance(row.payload, dict) else {}
    for week in (record.get("weeks") or {}).values():
        for player, entry in (week.get("players") or {}).items():
            for game, cell in (entry.get("games") or {}).items():
                if "started" not in cell:
                    continue
                for source in COLUMNS:
                    if source in cell:
                        found[player, game, source] = (float(cell[source]["chance"]), bool(cell["started"]))
    columns = [getattr(PlayerGame, column) for column in COLUMNS.values()]
    for player, game, started, *said in db.execute(
        select(PlayerGame.player, PlayerGame.game_id, PlayerGame.started, *columns).where(
            PlayerGame.said_at.is_not(None), PlayerGame.started.is_not(None), PlayerGame.status != "PENDING"
        )
    ):
        for source, chance in zip(COLUMNS, said, strict=True):
            if chance is not None:
                found[player, game, source] = (float(chance), bool(started))
    return [(source, said, started) for (_, _, source), (said, started) in found.items()]


def load(db: Session) -> StartFixes:
    fixes = StartFixes(cases(db))
    fixes.log()
    return fixes
