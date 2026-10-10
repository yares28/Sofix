"""Dated appearance form from kept Sorare facts; no network reads or synthetic DNP scores."""

import math
from datetime import datetime
from typing import Any

from app.services.timeutil import as_utc
from app.sorare.mission_seasons import season as club_season

DECISIVE = ("goals", "goal_assist", "assist_penalty_won", "clearance_off_line", "last_man_tackle", "penalty_save")
COUNTS = ("interception_won", "goal_assist", "goals", "ontarget_scoring_att", "won_tackle", "accurate_pass")
METRICS = dict(zip(("interception", "assist", "goal", "shot", "tackle", "pass"), COUNTS, strict=True))


def chance(
    rule: dict[str, Any], p: dict[str, Any], game: dict[str, Any], form: dict[str, Any], target: float | None = None
) -> float | None:
    kind = rule["kind"]
    key = "decisive" if kind == "decisive" else "score" if kind == "score" else METRICS.get(kind)
    if key is None:
        return None
    values = [g["values"][key] for g in form["recent"] if g["values"].get(key) is not None]
    threshold = target if kind == "score" else rule.get("atLeast", 1)
    if kind == "score" or game.get("availabilityKnown", p.get("availabilityKnown")) is False:
        return sum(v >= threshold for v in values) / len(values) if threshold is not None and len(values) >= 5 else None

    def rate(started: bool) -> float | None:
        ns = [g["values"][key] for g in form["recent"] if g["started"] is started and g["values"].get(key) is not None]
        return sum(ns) / len(ns) if ns else form["windows"]["starts" if started else "subs"]["means"].get(key)

    def tail(lam: float) -> float:
        if kind == "decisive":
            return lam
        term = below = math.exp(-max(0, lam))
        for n in range(1, math.ceil(threshold)):
            term *= lam / n
            below += term
        return max(0, min(1, 1 - below))

    start, sub = rate(True), rate(False)
    ps, po = game.get("pStart", p.get("pStart")), game.get("pOn", p.get("pOn"))
    if ps is not None and po is not None:
        if (ps > 0 and start is None) or (po > 0 and sub is None):
            return None
        return min(1, ps * tail(start or 0) + po * tail(sub or 0))
    return min(1, max(0, p.get("p", 0))) * tail(sum(values) / len(values)) if values else None


def build(games: list[dict[str, Any]], pos: str, before: datetime, *, league: str | None = None) -> dict[str, Any]:
    unique = {g.get("gameId", g["date"]): g for g in games}
    past = sorted(
        [
            g
            for g in unique.values()
            if g.get("status") == "FINAL" and as_utc(datetime.fromisoformat(g["date"])) < before
        ],
        key=lambda g: as_utc(datetime.fromisoformat(g["date"])),
        reverse=True,
    )
    cycle = club_season(league, before)
    since = cycle[0] if cycle else None
    current = [g for g in past if since is not None and as_utc(datetime.fromisoformat(g["date"])) >= since]
    keys = set(COUNTS) | {"decisive", "score", "minutes"}

    def values(g: dict[str, Any]) -> dict[str, float | None]:
        raw = g.get("stats")
        counts = (
            {s["stat"]: s.get("statValue") for s in raw if s.get("stat") != "_context"}
            if isinstance(raw, list)
            else raw
        )
        out: dict[str, float | None] = {}
        if counts is not None:
            if isinstance(raw, list):
                keys.update(k for s in raw if s.get("stat") == "_context" for k in s.get("zeros", []))
            out.update({k: float(v) if isinstance(v, (int, float)) else None for k, v in counts.items()})
            decisive = (*DECISIVE, "clean_sheet_60") if pos == "GK" else DECISIVE
            positive = any((out.get(k) or 0) > 0 for k in decisive)
            out["decisive"] = float(positive) if positive or all(out.get(k, 0) is not None for k in decisive) else None
            keys.update(out)
        out.update(score=g.get("score"), minutes=g.get("mins"))
        return out

    appearances = [
        {
            "game": g.get("gameId"),
            "date": g["date"],
            "started": g.get("started"),
            "complete": g.get("stats") is not None,
            "values": values(g),
        }
        for g in past
        if g.get("played") is True
    ]
    season = [a for a in appearances if since is not None and as_utc(datetime.fromisoformat(a["date"])) >= since]

    def window(rows: list[dict[str, Any]]) -> dict[str, Any]:
        means, samples = {}, {}
        for key in sorted(keys):
            numbers = [
                a["values"].get(key, 0 if a["complete"] and key not in ("score", "minutes") else None) for a in rows
            ]
            known = [v for v in numbers if v is not None]
            if known:
                means[key] = round(sum(known) / len(known), 4)
                samples[key] = len(known)
        return {"n": len(rows), "means": means, "samples": samples}

    # Keep the ten individual readings for exact target hit rates; season summaries keep all supplied actions.
    recent = [{**a, "values": dict(a["values"])} for a in appearances[:10]]
    for a in recent:
        for key in keys:
            a["values"].setdefault(key, 0 if a["complete"] and key not in ("score", "minutes") else None)
        a.pop("complete")
    return {
        "before": before.isoformat(),
        "season": cycle[1] if cycle else "Season unavailable",
        "seasonFrom": since.isoformat() if since else None,
        "league": league,
        "dnp": sum(g.get("played") is False for g in current),
        "missing": sum(g.get("played") is True and g.get("stats") is None for g in current),
        "windows": {
            "l5": window(appearances[:5]),
            "l10": window(appearances[:10]),
            "season": window(season),
            "starts": window([a for a in season if a["started"] is True]),
            "subs": window([a for a in season if a["started"] is False]),
        },
        "recent": recent,
    }
