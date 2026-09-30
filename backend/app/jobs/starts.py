"""Score the sources of "will he start?" against what happened.

    python -m app.jobs.starts

Reads the `start_chances` read model the Sorare job fills (Sorare's own odds, Sofix's model from form, Futbol Fantasy's
expected lineups) and prints, for each source, how it did on the players it had a number for. Read only.
"""

from __future__ import annotations

import sys
from typing import Any

from app.db import SessionLocal
from app.logging_config import configure_logging
from app.models import ReadModel
from app.sorare import starts

MIN_TO_TRUST = 100  # below this many settled players a difference between sources is mostly luck


def table(scores: dict[str, dict[str, float]]) -> str:
    """The comparison as plain text, best (lowest Brier score) first."""
    if not scores:
        return "Nothing is settled yet: a gameweek is scored a day after it ends."
    lines = [f"{'source':<14}{'players':>8}{'brier':>8}{'right':>8}{'mean':>8}"]
    for source, score in sorted(scores.items(), key=lambda item: item[1]["brier"]):
        lines.append(
            f"{source:<14}{int(score['n']):>8}{score['brier']:>8.3f}{score['right']:>8.0%}{score['mean']:>8.0%}"
        )
    few = [source for source, score in scores.items() if score["n"] < MIN_TO_TRUST]
    lines.append("")
    lines.append("brier: how far from what happened, 0 is perfect and 0.25 is saying 50% every time (lower is better).")
    lines.append(
        "right: how often calling it at 50% was right. mean: the chance it gave on average, which should sit near"
    )
    lines.append("how often players really start.")
    if few:
        lines.append(
            f"Fewer than {MIN_TO_TRUST} players for {', '.join(sorted(few))}: too few to tell the sources apart yet."
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    with SessionLocal() as db:
        row = db.get(ReadModel, starts.START_KEY)
        payload: dict[str, Any] = dict(row.payload) if row and isinstance(row.payload, dict) else {}
    print(table(starts.compare(payload)))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
