"""Audit · Lineups: the plans saved before each lock, Sofix's and Sorare's, judged once the week is over.

Sofix's plans are the page as it stood at the lock (`sorare_plan:<slug>`), Sorare's the same week planned on Sorare's own
projections (`sorare_alt:<slug>`). Each lineup is scored from the kept games with its saved rules (`frozen_scores`), then asked
two things: did the real score land within `BAND` points of the expected one, and which prize did it reach against the scores
that really paid that week. A lineup counts once, by its best prize: a card, cash, essence, XP only, or nothing.

A week's counts are kept in a small read model of their own once nothing in them can change, so a refresh only opens the plans of
a week still being settled: the two plans of one week are about a megabyte, and Neon's free plan counts every byte it sends.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services import kept_blocks
from app.services.publish import put
from app.services.timeutil import as_utc
from app.sorare.frozen import PLAN_PREFIX
from app.sorare.frozen_scores import _score, games_of, results
from app.sorare.planner import score_at_rank
from app.sorare.publish import ALT_PREFIX, SETTLE

KEY = "lineup_audit"
REFERENCES_KEY = "sorare_references"  # the scores that paid each week (app.jobs.sorare writes it)
BAND = 15  # points either side of the expected score that still count as hitting it
CACHE_VERSION = 2
KINDS = ("card", "cash", "essence", "xp")  # best first
SOURCES = {"sofix": PLAN_PREFIX, "sorare": ALT_PREFIX}


def _tally() -> dict[str, Any]:
    return {"lineups": 0, "scored": 0, "hit": 0, "judged": 0, "won": {**dict.fromkeys(KINDS, 0), "none": 0}}


def _add(total: dict[str, Any], part: dict[str, Any]) -> None:
    for key in ("lineups", "scored", "hit", "judged"):
        total[key] += part[key]
    for kind, count in part["won"].items():
        total["won"][kind] += count


def prize(raw: dict[str, Any], score: float, cuts: dict[int, float]) -> str | None:
    """The best prize the score reached, or None when it cannot be said (a room, or a week whose paying scores were not kept)."""
    tiers = raw.get("tiers") or []
    if not cuts or not tiers or any("hi" not in tier for tier in tiers):
        return None
    for tier in tiers:  # best first, as Sorare lists them
        need = score_at_rank(cuts, tier["hi"])
        if need is not None and score >= need:
            return next((kind for kind in KINDS if tier.get(kind)), "none")
    return "none"


def plan_tally(
    plan: dict[str, Any], games: dict[str, list[str]], actuals: dict[tuple[str, str], Any], reference: dict[str, Any]
) -> tuple[dict[str, Any], bool]:
    """One plan's counts, and whether every lineup of it is settled."""
    tally, settled = _tally(), True
    for raw in plan.get("lineups") or []:
        tally["lineups"] += 1
        line = _score(raw, games, actuals)
        if line["score"] is None:
            settled = settled and line.get("reason") == "incomplete-plan"
            continue
        if line["expected"] is not None:
            tally["scored"] += 1
            tally["hit"] += abs(line["score"] - line["expected"]) <= BAND
        cuts = {int(r): float(v) for r, v in ((reference.get(raw.get("key")) or {}).get("cuts") or {}).items()}
        won = prize(raw, line["score"], cuts)
        if won is not None:
            tally["judged"] += 1
            tally["won"][won] += 1
        elif raw.get("tiers"):
            settled = False  # another board having cuts does not settle this board's prize
    return tally, settled


def kept_references(db: Session) -> dict[str, Any]:
    """The scores that paid each week."""
    row = kept_blocks.read(db, REFERENCES_KEY)
    return dict(row.payload) if row and isinstance(row.payload, dict) else {}


def read(db: Session, now: datetime, *, write: bool = True) -> dict[str, Any]:
    kept_row = kept_blocks.read(db, KEY)
    kept: dict[str, Any] = dict(kept_row.payload) if kept_row and isinstance(kept_row.payload, dict) else {}
    plans = {
        key.removeprefix(PLAN_PREFIX)
        for key in db.scalars(select(ReadModel.key).where(ReadModel.key.like(f"{PLAN_PREFIX}%")))
    }
    weeks: dict[str, Any] = {
        slug: week
        for slug, week in (kept.get("weeks") or {}).items()
        if week.get("final") and (kept.get("version") == CACHE_VERSION or slug not in plans)
    }
    have = set(db.scalars(select(ReadModel.key).where(ReadModel.key.like(f"{ALT_PREFIX}%"))))
    slugs = sorted(plans - weeks.keys())
    references: dict[str, Any] | None = None
    for slug in slugs:
        plan_row = kept_blocks.read(db, f"{PLAN_PREFIX}{slug}")
        plan = dict(plan_row.payload) if plan_row and isinstance(plan_row.payload, dict) else {}
        info = plan.get("gameweek") or {}
        if not info.get("end"):
            continue
        end = as_utc(datetime.fromisoformat(info["end"]))
        if now <= end:
            continue
        if references is None:
            references = kept_references(db)
        games = games_of(plan)
        other = kept_blocks.read(db, f"{ALT_PREFIX}{slug}") if f"{ALT_PREFIX}{slug}" in have else None
        payloads = {"sofix": plan, "sorare": other.payload if other else {}}
        maps = {source: {**games, **games_of(payload)} for source, payload in payloads.items()}
        every: dict[str, list[str]] = {}
        for source_games in maps.values():
            for player, ids in source_games.items():
                every[player] = sorted(set(every.get(player, [])) | set(ids))
        actuals = results(db, every)
        reference = references.get(slug) or {}
        week: dict[str, Any] = {
            "slug": slug,
            "number": info.get("number"),
            "end": info["end"],
            "final": bool(reference),
        }
        for source, payload in payloads.items():
            week[source] = []
            for i, raw in enumerate(payload.get("plans") or []):
                tally, settled = plan_tally(raw, maps[source], actuals, reference)
                week[source].append({"rank": raw.get("rank", i + 1), **tally})
                week["final"] = week["final"] and settled
        week["final"] = week["final"] and now >= end + SETTLE
        weeks[slug] = week
    if write and (weeks != (kept.get("weeks") or {}) or kept.get("version") != CACHE_VERSION):
        put(db, KEY, {"version": CACHE_VERSION, "weeks": weeks}, now)
    return page(list(weeks.values()))


def page(weeks: list[dict[str, Any]]) -> dict[str, Any]:
    """What the Audit shows: each plan's counts over the season for both sources (rank 1 is the best plan), and week by week."""
    weeks = sorted(weeks, key=lambda week: week["end"], reverse=True)
    plans: dict[str, list[dict[str, Any]]] = {}
    for source in SOURCES:
        by_rank: dict[int, dict[str, Any]] = {}
        for week in weeks:
            for plan in week.get(source) or []:
                _add(by_rank.setdefault(plan["rank"], {"rank": plan["rank"], **_tally()}), plan)
        plans[source] = [by_rank[rank] for rank in sorted(by_rank)]
    return {"band": BAND, "plans": plans, "weeks": weeks}
