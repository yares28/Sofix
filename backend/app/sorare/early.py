"""Which early plans a run makes: the ones missing or gone stale, a few at a time, so a run stays well inside its time.

Every LaLiga round Sorare has not opened gets an early plan (`publish.projected_weeks`), and a season has thirty-odd of them
ahead. Planning one takes a few seconds with a real collection, so a run plans only the ones that need it: a round with no
plan yet, then the stalest, the next few rounds being kept current (six hours) and the far ones refreshed daily, at most
`PER_RUN` of them. The rest keep showing the plan they already have, so the page always lists every round that has one.
The round Futbol Fantasy has the games of (each club's next one: a round, or two while clubs are on different ones) is
the exception: its lineups move at every read, so that plan is made again every run and takes the site's chances.
"""

from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import ReadModel
from app.sorare import ff_use, projection, publish

PER_RUN = 8  # rounds planned in one run: about half a minute
NEAR_ROUNDS = 4  # the next few rounds change fastest (form, team news, who opens the week)
FRESH_NEAR = timedelta(hours=6)
FRESH_FAR = timedelta(hours=24)


@dataclass(frozen=True)
class Early:
    weeks: list[dict[str, Any]]  # every early plan to list, nearest round first: the new ones and the ones reused
    fresh: list[dict[str, Any]]  # the ones planned this run, to be written


def _aware(stamp: datetime) -> datetime:
    return stamp if stamp.tzinfo else stamp.replace(tzinfo=UTC)


def planned_for(week: dict[str, Any], round_: projection.Round) -> bool:
    """Whether a stored early plan is for this round as the calendar holds it now.

    A round that has moved, or a new season that reuses the round numbers, is planned again: the stored plan would show
    last season's opponents and dates under the new round. So is a plan made before it carried the competitions expected for it.
    """
    projected = week.get("projected") or {}
    # A plan made before the expected competitions existed has no `expected` and is made again, with them.
    return (
        "expected" in projected
        and (week.get("gameweek") or {}).get("start") == projection.window(round_.first)[0].isoformat()
    )


def choose(
    db: Session, rounds: list[projection.Round], now: datetime, live: Collection[int] = ()
) -> tuple[list[projection.Round], dict[int, dict[str, Any]]]:
    """(the rounds to plan this run, the stored plans to reuse for the others), each round once.

    `live` are the rounds Futbol Fantasy has the games of: its lineups change between runs, so those are planned again
    every run, first, whatever the age of their stored plan.
    """
    covered: list[projection.Round] = []
    missing: list[projection.Round] = []
    stale: list[tuple[timedelta, projection.Round]] = []
    kept: dict[int, dict[str, Any]] = {}
    # "The next few" are the next by date: a postponed game keeps its old round number but is played later, and by number it
    # would take one of the near slots away from a round that is a week off.
    for index, round_ in enumerate(sorted(rounds, key=lambda r: (r.first, r.number))):
        row = db.get(ReadModel, f"{publish.AHEAD_PREFIX}{round_.number}")
        if row is None or not isinstance(row.payload, dict) or not planned_for(row.payload, round_):
            missing.append(round_)
            continue
        kept[round_.number] = dict(row.payload)
        age = now - _aware(row.updated_at)
        if round_.number in live:
            covered.append(round_)
        elif age >= (FRESH_NEAR if index < NEAR_ROUNDS else FRESH_FAR):
            stale.append((age, round_))
    stale.sort(key=lambda pair: (-pair[0].total_seconds(), pair[1].number))
    wanted = [*covered, *missing, *(round_ for _, round_ in stale)][:PER_RUN]
    for round_ in wanted:
        kept.pop(round_.number, None)  # about to be replaced
    return wanted, kept


def plan(
    db: Session,
    snapshot: dict[str, Any],
    rounds: list[projection.Round],
    *,
    runs: int,
    now: datetime,
    ff: ff_use.Lineups | None = None,
) -> Early:
    live = {round_.number for round_ in rounds if ff and ff.covers(round_)}
    wanted, kept = choose(db, rounds, now, live)
    db.rollback()  # the reads are done and planning takes seconds: Neon closes a connection left inside a transaction
    fresh = publish.projected_weeks(snapshot, wanted, runs=runs, ff=ff.starts if ff else None) if wanted else []
    by_round = {**kept, **{week["projected"]["round"]: week for week in fresh}}
    weeks = [by_round[r.number] for r in sorted(rounds, key=lambda r: r.number) if r.number in by_round]
    return Early(weeks=weeks, fresh=fresh)
