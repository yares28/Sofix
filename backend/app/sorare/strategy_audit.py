"""Audit · Strategies: the lineups each strategy wrote down before the lock (`strategy_plans:<slug>`, `strategies.py`), scored once the
week is over, and what you entered beside them (`my_week:<slug>`).

A lineup is scored from the kept games with its saved rules (`frozen_scores._score`), as the Lineups view does, and asked what it won
against the scores that really paid that week and how it did against the best lineup in hindsight for the same competition (the
replay the archive keeps, `sorare_week:<slug>`). Each also gets a plain verdict, built on the numbers or on luck.

A week's counts are kept in a read model of their own once they cannot change, so a refresh only opens the lineups of a week still
being settled (the same reason as `lineup_audit`).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services.publish import put
from app.services.timeutil import as_utc
from app.sorare import strategies
from app.sorare.frozen_scores import _score
from app.sorare.lineup_audit import GIVE_UP, KINDS, kept_results, prize
from app.sorare.publish import ARCHIVE_PREFIX, SETTLE, STRATEGY_PREFIX

KEY = "strategy_audit"
MY_WEEK = "my_week:"
VERDICTS = ("lucky", "good", "expected", "poor")


def _tally() -> dict[str, Any]:
    return {
        "lineups": 0,
        "scored": 0,
        "points": 0.0,
        "best": 0.0,  # what the best lineup in hindsight scored in the same competitions, for the lineups that have one
        "pointsVs": 0.0,  # what those lineups scored: the share of the best is this over `best`
        "against": 0,  # how many of the scored lineups that is
        "judged": 0,
        "won": {**dict.fromkeys(KINDS, 0), "none": 0},
        "verdicts": dict.fromkeys(VERDICTS, 0),
    }


def _add(total: dict[str, Any], part: dict[str, Any]) -> None:
    for key in ("lineups", "scored", "points", "best", "pointsVs", "against", "judged"):
        total[key] += part[key]
    for kind, count in part["won"].items():
        total["won"][kind] += count
    for verdict, count in part["verdicts"].items():
        total["verdicts"][verdict] += count


def hindsight_best(db: Session, slug: str) -> dict[str, float]:
    """The score of the best lineup in hindsight for each competition of the week, from the archived replay (empty until it is kept)."""
    row = db.get(ReadModel, f"{ARCHIVE_PREFIX}{slug}")
    hindsight = ((row.payload if row else None) or {}).get("hindsight") or {}
    best: dict[str, float] = {}
    for lineup in hindsight.get("lineups") or []:
        total = (lineup.get("actual") or {}).get("total")
        if total is not None and lineup.get("key"):
            best[lineup["key"]] = max(best.get(lineup["key"], 0.0), float(total))
    return best


def yours(db: Session, slug: str) -> dict[str, Any] | None:
    """The lineups you entered that week and were ranked: their points and best prizes. None when the week was not saved."""
    row = db.get(ReadModel, f"{MY_WEEK}{slug}")
    if row is None or not isinstance(row.payload, dict):
        return None
    tally = _tally()
    for line in row.payload.get("lineups") or []:
        result = line.get("result")
        if line.get("draft") or not result or result.get("rank") is None:
            continue
        tally["lineups"] += 1
        tally["scored"] += 1
        tally["points"] += float(result.get("score") or 0)
        tally["judged"] += 1
        kind = (
            "card"
            if result.get("card")
            else "cash"
            if (result.get("cash") or 0) > 0
            else "essence"
            if (result.get("essence") or 0) > 0
            else "xp"
            if (result.get("xp") or 0) > 0
            else "none"
        )
        tally["won"][kind] += 1
    return tally if tally["lineups"] else None


def week_of(
    db: Session, slug: str, plan: dict[str, Any], now: datetime, actuals: Any, references: dict[str, Any]
) -> dict[str, Any]:
    info = plan.get("gameweek") or {}
    games = plan.get("games") or {}
    reference = references.get(slug) or {}
    best = hindsight_best(db, slug)
    week: dict[str, Any] = {
        "slug": slug,
        "number": info.get("number"),
        "end": info["end"],
        "strategies": {},
        "lines": [],
    }
    settled = True
    for entry in plan.get("strategies") or []:
        tally = _tally()
        for raw in entry.get("lineups") or []:
            tally["lineups"] += 1
            line = _score(raw, games, actuals)
            if line["score"] is None:
                settled = settled and line.get("reason") == "incomplete-plan"
                continue
            tally["scored"] += 1
            tally["points"] += line["score"]
            if raw.get("key") in best:
                tally["best"] += best[raw["key"]]
                tally["pointsVs"] += line["score"]
                tally["against"] += 1
            cuts = {int(r): float(v) for r, v in ((reference.get(raw.get("key")) or {}).get("cuts") or {}).items()}
            won = prize(raw, line["score"], cuts)
            if won is not None:
                tally["judged"] += 1
                tally["won"][won] += 1
            said = line.get("verdict")
            if said:
                tally["verdicts"][said["label"]] += 1
            week["lines"].append(
                {
                    "strategy": entry["key"],
                    "comp": raw.get("comp"),
                    "score": line["score"],
                    "x": raw.get("x"),
                    "lo": raw.get("lo"),
                    "hi": raw.get("hi"),
                    "verdict": said["label"] if said else None,
                    "beat": said["beat"] if said else [],
                    "won": won,
                }
            )
        week["strategies"][entry["key"]] = tally
    week["you"] = yours(db, slug)
    week["final"] = (bool(reference) and settled and bool(best)) or now > as_utc(
        datetime.fromisoformat(info["end"])
    ) + GIVE_UP
    return week


def read(db: Session, now: datetime, *, write: bool = True) -> dict[str, Any]:
    row = db.get(ReadModel, KEY)
    kept: dict[str, Any] = dict(row.payload) if row and isinstance(row.payload, dict) else {}
    weeks: dict[str, Any] = {slug: w for slug, w in (kept.get("weeks") or {}).items() if w.get("final")}
    slugs = [
        key.removeprefix(STRATEGY_PREFIX)
        for key in db.scalars(select(ReadModel.key).where(ReadModel.key.like(f"{STRATEGY_PREFIX}%")))
        if key.removeprefix(STRATEGY_PREFIX) not in weeks
    ]
    loaded: tuple[Any, dict[str, Any]] | None = None
    for slug in slugs:
        plan_row = db.get(ReadModel, f"{STRATEGY_PREFIX}{slug}")
        plan = dict(plan_row.payload) if plan_row and isinstance(plan_row.payload, dict) else {}
        end = (plan.get("gameweek") or {}).get("end")
        if not end or now <= as_utc(datetime.fromisoformat(end)) + SETTLE:
            continue
        loaded = loaded or kept_results(db)
        weeks[slug] = week_of(db, slug, plan, now, *loaded)
    if write and weeks != (kept.get("weeks") or {}):
        put(db, KEY, {"weeks": weeks}, now)
    return page(list(weeks.values()))


def page(weeks: list[dict[str, Any]]) -> dict[str, Any]:
    """What the Audit shows: each strategy's sums over the season, yours beside them, and week by week (newest first)."""
    weeks = sorted(weeks, key=lambda w: w["end"], reverse=True)
    season: dict[str, dict[str, Any]] = {}
    mine = _tally()
    played = 0
    for week in weeks:
        for key, tally in week["strategies"].items():
            _add(season.setdefault(key, {**_tally(), "weeks": 0}), tally)
            season[key]["weeks"] += 1
        if week.get("you"):
            _add(mine, week["you"])
            played += 1
    listed = [
        {"key": s.key, "label": s.label, "note": s.note, **season[s.key]}
        for s in strategies.STRATEGIES
        if s.key in season
    ]
    return {"strategies": listed, "you": {**mine, "weeks": played}, "weeks": weeks}
