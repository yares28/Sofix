"""Start chances corrected from the record (plans/xscore.md X8).

Every source's chance that a player starts a game is written down before the lock and settled by whether he started
(`starts.py`, `PlayerGame`). Grouped in bands of five points per source, the record says how often "70%" really started. A
band is moved to what happened from its first settled case. Bands keep their own evidence instead of pooling to
reach a sample threshold. The forecast then makes the expected score from
the corrected chance, while the record keeps what the source really said, so the next measurement is not of its own work.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, load_only

from app.models import PlayerGame
from app.services import kept_blocks
from app.sorare import games_mirror

logger = logging.getLogger(__name__)

RECORD_KEY = "start_chances"  # `starts.START_KEY`
BAND = 0.05
MIN_CASES = 1
COLUMNS = {"futbolfantasy": "ff_start", "sorare": "sorare_start", "sofix": "sofix_start"}

Case = tuple[str, float, bool]  # source, the chance it gave, whether he started


class StartFixes:
    def __init__(self, cases: Iterable[Case] = ()) -> None:
        groups: dict[str, dict[int, list[tuple[float, bool]]]] = {}
        for source, said, started in cases:
            groups.setdefault(source, {}).setdefault(round(said / BAND), []).append((said, started))
        self._shift: dict[tuple[str, int], float] = {}
        self._table: dict[str, list[dict[str, Any]]] = {}
        for source, bands in groups.items():
            for key, made in sorted(bands.items()):
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
                    self._shift[source, key] = was - said

    def apply(self, source: str, chance: float) -> float:
        """The chance as the record says it should be: moved by how far its band was off, from the first checked case."""
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


def cases(db: Session, *, now: datetime | None = None) -> list[Case]:
    """Every settled game with what each source said before the lock: the game rows, and the older record beside them (a game is
    counted once per source, wherever it is found)."""
    from app.sorare.player_audit import start_result

    now = now or datetime.now(UTC)
    found: dict[tuple[str, str, str], tuple[float, bool]] = {}
    row = kept_blocks.read(db, RECORD_KEY)
    record = row.payload if row and isinstance(row.payload, dict) else {}
    for week in (record.get("weeks") or {}).values():
        for player, entry in (week.get("players") or {}).items():
            for game, cell in (entry.get("games") or {}).items():
                if not isinstance(cell.get("started"), bool):
                    continue
                for source in COLUMNS:
                    if source in cell:
                        found[player, game, source] = (float(cell[source]["chance"]), bool(cell["started"]))
    rows = games_mirror.view(db).scalars(
        select(PlayerGame)
        .options(
            load_only(
                PlayerGame.player,
                PlayerGame.game_id,
                PlayerGame.date,
                PlayerGame.status,
                PlayerGame.played,
                PlayerGame.started,
                PlayerGame.score,
                PlayerGame.mins,
                *(getattr(PlayerGame, col) for col in COLUMNS.values()),
            )
        )
        .where(PlayerGame.said_at.is_not(None))
    )
    for row in rows:
        result = start_result(row, now)
        if result is None:
            for source in COLUMNS:
                found.pop((row.player, row.game_id, source), None)
            continue
        for source, column in COLUMNS.items():
            chance = getattr(row, column)
            if chance is None and (kept := found.get((row.player, row.game_id, source))):
                chance = kept[0]
            if chance is not None:
                found[row.player, row.game_id, source] = (float(chance), result["started"])
    return [(source, said, started) for (_, _, source), (said, started) in found.items()]


def load(db: Session) -> StartFixes:
    fixes = StartFixes(cases(db))
    fixes.log()
    return fixes
