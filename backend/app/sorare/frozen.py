"""The plan as it stood at its lock, kept once (roadmap 1.2, plans/roadmap.md).

Every run replaces the page the app shows, so the moment a gameweek locks the plan Sofix had made for it is gone: the next
run plans the week after. What the Audit page will score (how right the plan's totals, rewards and best lineup were) is that
plan, so the first run after a lock writes it down: the week as the *previous* page held it, built by the last run before
the lock. It is a read model of its own, `sorare_plan:<gameweek slug>`, written once and never touched again, so a season
of them needs no migration for the unattended refresh to trip over.

What is kept is the numbers: the lineups with their cards, captain, expected totals and reward chances, and each of the
owner's players with the chance and expected score he had, game by game and from which source. Pictures are left out (the
page has them) and so is what could not be entered, which keeps a week to a fraction of the page.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services.publish import put

logger = logging.getLogger(__name__)

PLAN_PREFIX = "sorare_plan:"
PICTURES = {"pic", "avatar", "crest", "teamCrest", "opponentCrest"}
LEFT_OUT = {"playable", "blocked", "notWorth"}  # what could be entered: the page's, not the plan's


def _dt(value: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(UTC)
    except (TypeError, ValueError):
        return None


def _bare(value: Any) -> Any:
    """The same data with no picture addresses in it."""
    if isinstance(value, dict):
        return {key: _bare(item) for key, item in value.items() if key not in PICTURES}
    if isinstance(value, list):
        return [_bare(item) for item in value]
    return value


def of_week(week: dict[str, Any], built: datetime, now: datetime) -> dict[str, Any]:
    """One week of the page as it stood, ready to keep."""
    kept = {key: _bare(value) for key, value in week.items() if key not in LEFT_OUT}
    return {**kept, "builtAt": built.isoformat(), "frozenAt": now.isoformat()}


def freeze(db: Session, previous: dict[str, Any] | None, now: datetime, *, write: bool = True) -> list[str]:
    """Keep the plan of every week of the page the app was showing that has locked since that page was built.

    `previous` is that page and `now` the time of this run. A week counts only when the page was built *before* its lock (a
    page built after is not what was said before the team news), it has not been played, it has something to keep (a plan or
    players), and nothing is kept for it yet. Returns the slugs written (or, in a dry run, the ones that would be).
    """
    built = _dt((previous or {}).get("generatedAt"))
    if previous is None or built is None:
        return []
    kept: list[str] = []
    for week in previous.get("weeks") or []:
        info = week.get("gameweek") or {}
        slug, lock = info.get("slug"), _dt(info.get("lock"))
        if not slug or lock is None or week.get("played") or not (built < lock <= now):
            continue
        if not (week.get("plans") or (week.get("playing") or {}).get("players")):
            continue
        key = f"{PLAN_PREFIX}{slug}"
        if db.get(ReadModel, key) is not None:
            continue
        if write:
            put(db, key, of_week(week, built, now), now)
        kept.append(slug)
    return kept
