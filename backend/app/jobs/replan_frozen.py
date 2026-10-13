"""Replan a frozen gameweek with today's planner, to see what a change to lineup building does.

    python -m app.jobs.replan_frozen [gameweek slug]        (default: the newest frozen week)

Reads the plan kept at the lock (`sorare_plan:<slug>`) and the owner's cards from the `sorare` read model, rebuilds the
competitions, cards and forecasts from them, and plans the week again. Read only, prints only. The rebuild is close, not
exact: a card's league is guessed from whether his player has a LaLiga game, and a competition's rewards come from the
scores it needed at the lock.
"""

from __future__ import annotations

import sys
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.logging_config import configure_logging
from app.models import ReadModel
from app.sorare import frozen, planner
from app.sorare.model import ESSENCE_ORDER, Card, Competition, Forecast, Tier

SLOTS = {"GK": ("GK",), "DEF": ("DEF",), "MID": ("MID",), "FWD": ("FWD",), "EXT": ("DEF", "MID", "FWD")}


def _comp(lines: list[dict[str, Any]]) -> Competition:
    """One competition from every kept lineup of it (they share rules; the cards say what a bonus is worth)."""
    first = lines[0]
    rows = [(float(c["inSeason"]), float(c["level"]), c["mult"] - 1) for line in lines for c in line["starters"]]
    season, level = np.linalg.lstsq(np.array([r[:2] for r in rows]), np.array([r[2] for r in rows]), rcond=None)[0]
    tiers = [
        Tier(t["lo"], t["hi"], t["cash"], t["essence"], t["card"], t.get("xp", 0))
        for t in first.get("tiers") or []
        if "lo" in t
    ]
    return Competition(
        key=first["key"],
        slug=first["board"],
        name=first["comp"],
        group=first["group"],
        rarity=first["rarity"],
        starters=[SLOTS[c["slot"]] for c in first["starters"]],
        subs=[("GK",) if c["slot"] == "GK" else ("DEF", "MID", "FWD") for c in first["subs"]],
        leagues=frozenset({"laliga-es"}) if first["key"].startswith("LALIGA") else None,
        min_in_season=first["minInSeason"],
        cap=first["cap"],
        season_bonus=round(float(season), 3),
        level_bonus=round(float(level), 3),
        captain_bonus=first["captainBonus"],
        club_bonus=tuple(first["clubBonus"]) if first["clubBonus"] else None,
        average_bonus=tuple(first["averageBonus"]) if first["averageBonus"] else None,
        fee=first["fee"],
        room_size=10 if first["group"] == "Room" else 0,
        tiers=tiers,
        reference={t["hi"]: float(t["need"]) for t in first.get("tiers") or [] if t.get("need")},
    )


def rebuild(
    week: dict[str, Any], collection: list[dict[str, Any]]
) -> tuple[list[Competition], list[Card], dict[str, Forecast]]:
    by_key: dict[str, list[dict[str, Any]]] = {}
    for plan in week["plans"]:
        for line in plan["lineups"]:
            by_key.setdefault(line["key"], []).append(line)
    comps = [_comp(lines) for lines in by_key.values()]
    people = {p["player"]: p for p in week["playing"]["players"]}
    forecasts: dict[str, Forecast] = {}
    for player, p in people.items():
        chance = float(p["p"])
        forecasts[player] = Forecast(
            p_play=chance,
            mu=round(float(p["x"]) / chance, 2) if chance > 0 else 0.0,
            links=tuple((g["id"], g["venue"]) for g in p["games"]),
        )
    cards = []
    for c in collection:
        p = people.get(c["player"])
        league = "laliga-es" if p and any(g["competition"] == "laliga-es" for g in p["games"]) else "other"
        cards.append(
            Card(
                slug=c["slug"], player=c["player"], name=c["name"], positions=(c["pos"],), rarity=c["rarity"],
                in_season=c["inSeason"], level=c["level"], average=float(c["average"]), league=league, club=c["club"],
            )
        )  # fmt: skip
    return comps, cards, forecasts


def show(plan: planner.Plan) -> str:
    out = [f"essence {plan.essence:.0f}  fees {plan.fees}  any {plan.chance_of_any():.0%}  cards {plan.cards_used}"]
    for lu in plan.lineups:
        out.append(
            f"  {lu.comp.name:<16} x {lu.expected:5.0f}  p {lu.p_return:5.1%}  "
            + ", ".join(
                f"{c.name.split()[-1]}{'*' if i == lu.captain else ''}:{forecasts_p(c):.0%}"
                for i, c in enumerate(lu.starters)
            )
        )
    return "\n".join(out)


_FORECASTS: dict[str, Forecast] = {}


def forecasts_p(card: Card) -> float:
    return _FORECASTS[card.player].p_play


def replan(db: Session, slug: str | None, count: int = 5) -> list[planner.Plan]:
    if slug is None:
        keys = list(db.scalars(select(ReadModel.key).where(ReadModel.key.like(f"{frozen.PLAN_PREFIX}%"))))
        slug = max(keys, key=lambda k: db.get(ReadModel, k).payload["gameweek"]["end"]).removeprefix(frozen.PLAN_PREFIX)
    week = db.get(ReadModel, f"{frozen.PLAN_PREFIX}{slug}").payload
    collection = db.get(ReadModel, "sorare").payload["collection"]
    comps, cards, forecasts = rebuild(week, collection)
    _FORECASTS.update(forecasts)
    print(f"{slug}: {len(cards)} cards, {len(comps)} competitions, {len(forecasts)} players")
    return planner.plans(comps, cards, forecasts, count=count, order=ESSENCE_ORDER)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    with SessionLocal() as db:
        for i, plan in enumerate(replan(db, (argv or [None])[0]), 1):
            print(f"plan {i}: {show(plan)}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
