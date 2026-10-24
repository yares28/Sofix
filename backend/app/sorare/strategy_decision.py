"""Explain the recorded strategy results on identical competition/GW boards."""

from __future__ import annotations

import re
from typing import Any

from app.sorare import strategies
from app.sorare.planner import score_at_rank


def amounts(values: dict[str, Any], identity: dict[str, Any]) -> dict[str, Any] | None:
    if any(not isinstance(values.get(key), (int, float)) for key in ("cash", "essence")):
        return None
    name = str(identity.get("rarity") or identity.get("competition") or identity.get("comp") or "").lower()
    rarity = next(
        (
            key
            for key, label in (
                ("super_rare", r"super[ _-]?rare"),
                ("limited", "limited"),
                ("rare", "rare"),
                ("unique", "unique"),
                ("common", "common"),
            )
            if re.search(rf"\b{label}\b", name)
        ),
        None,
    )
    return {"cash": float(values["cash"]), "essence": float(values["essence"]), "rarity": rarity}


def tier_amounts(raw: dict[str, Any], score: float, won: str | None, cuts: dict[int, float]) -> dict[str, Any] | None:
    if won is None:
        return None
    if won == "none":
        return amounts({"cash": 0, "essence": 0}, raw)
    for tier in raw.get("tiers") or []:
        need = score_at_rank(cuts, tier["hi"])
        if need is not None and score >= need:
            return amounts(tier, raw)
    return None


def collect(total: dict[str, Any], value: dict[str, Any] | None) -> None:
    if value is None:
        return
    total["returnCases"] += 1
    total["cash"] += value["cash"]
    if value["rarity"]:
        bucket = total["essence"].setdefault(value["rarity"], {"total": 0.0, "cases": 0})
        bucket["total"] += value["essence"]
        bucket["cases"] += 1


def decision_of(weeks: list[dict[str, Any]]) -> dict[str, Any]:
    boards = [(week["slug"], board) for week in weeks for board in week.get("boards") or []]
    active = [s for s in strategies.STRATEGIES if any(any(r["who"] == s.key for r in b["rows"]) for _, b in boards)]
    matched = []
    ceilings = []
    for slug, board in boards:
        by_key = {s.key: [r for r in board["rows"] if r["who"] == s.key] for s in active}
        if active and all(len(rows) == 1 and rows[0]["score"] is not None for rows in by_key.values()):
            matched.append((slug, {key: rows[0] for key, rows in by_key.items()}))
            ceilings.append(board.get("best"))
    hindsight = [
        (rows, best)
        for (_, rows), best in zip(matched, ceilings, strict=True)
        if isinstance(best, (int, float)) and best >= 0
    ]
    best_total = sum(best for _, best in hindsight)
    rewarded = [(slug, rows) for slug, rows in matched if all(row.get("won") is not None for row in rows.values())]
    known = [(slug, rows) for slug, rows in rewarded if all(row.get("returns") is not None for row in rows.values())]
    currencies = {
        row["returns"]["rarity"] for _, board in known for row in board.values() if row["returns"].get("rarity")
    }
    essence_boards = {
        rarity: [board for _, board in known if all(row["returns"].get("rarity") == rarity for row in board.values())]
        for rarity in currencies
    }
    rows = []
    for strategy in active:
        key = strategy.key
        average = sum(b[key]["score"] for _, b in matched) / len(matched) if matched else None
        baseline = (
            sum(b["xscore"]["score"] for _, b in matched) / len(matched)
            if matched and "xscore" in matched[0][1]
            else None
        )
        got = {"returnCases": 0, "cash": 0.0, "essence": {}}
        for _, board in known:
            collect(got, board[key]["returns"])
        won = {
            kind: sum(b[key]["won"] == kind for _, b in rewarded) for kind in ("card", "cash", "essence", "xp", "none")
        }
        rows.append(
            {
                "key": key,
                "label": strategy.label,
                "note": strategy.note,
                "average": round(average, 2) if average is not None else None,
                "delta": round(average - baseline, 2) if average is not None and baseline is not None else None,
                "winsVsBaseline": sum(b[key]["score"] > b["xscore"]["score"] for _, b in matched)
                if baseline is not None
                else None,
                "hindsight": {
                    "average": round(sum(b[key]["score"] for b, _ in hindsight) / len(hindsight), 2),
                    "share": round(sum(b[key]["score"] for b, _ in hindsight) / best_total, 4)
                    if best_total > 0
                    else None,
                    "gap": round(sum(best - b[key]["score"] for b, best in hindsight) / len(hindsight), 2),
                }
                if hindsight
                else None,
                "rewardWins": won["card"] + won["cash"] + won["essence"],
                "won": won,
                "cashAverage": round(got["cash"] / got["returnCases"], 2) if got["returnCases"] else None,
                "essence": {
                    rarity: {
                        "average": round(sum(b[key]["returns"]["essence"] for b in boards) / len(boards), 2),
                        "cases": len(boards),
                    }
                    for rarity, boards in essence_boards.items()
                    if boards
                },
            }
        )
    top_points = max((row["average"] for row in rows if row["average"] is not None), default=None)
    top_rewards = max((row["rewardWins"] for row in rows), default=0)
    top_cash = max((row["cashAverage"] or 0 for row in rows), default=0)
    rarities = sorted({rarity for row in rows for rarity in row["essence"]})
    essence_leaders = {}
    for rarity in rarities:
        best = max(row["essence"].get(rarity, {}).get("average", 0) for row in rows)
        essence_leaders[rarity] = [
            row["key"] for row in rows if best > 0 and row["essence"].get(rarity, {}).get("average") == best
        ]
    return {
        "pointsCases": len(matched),
        "hindsight": {"cases": len(hindsight), "average": round(best_total / len(hindsight), 2) if hindsight else None},
        "rewardCases": len(rewarded),
        "amountCases": len(known),
        "weeks": len({slug for slug, _ in matched}),
        "active": len(active),
        "pointLeaders": [r["key"] for r in rows if top_points is not None and r["average"] == top_points],
        "rewardLeaders": [r["key"] for r in rows if rewarded and r["rewardWins"] == top_rewards],
        "essenceLeaders": essence_leaders,
        "cashLeaders": [r["key"] for r in rows if top_cash > 0 and r["cashAverage"] == top_cash],
        "rows": rows,
    }
