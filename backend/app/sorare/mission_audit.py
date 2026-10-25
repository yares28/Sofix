"""Compact mission outcomes, with explicit coverage and independent owner verdicts."""

from __future__ import annotations

import re
from typing import Any


def reward_terms(description: str, slots: int) -> dict[str, Any] | None:
    """Value only explicit per-choice terms; flattened reward configs do not preserve bonus conditions."""
    found = re.search(
        r"(?:win|earn)\s+(\d[\d,]*)\s+([\w -]+?)\s+(?:per correct choice|for each player)", description, re.I
    )
    if not found:
        return None
    unit = found[2].strip()
    each = int(found[1].replace(",", ""))
    bonus = re.search(
        r"win up to\s+(\d[\d,]*)\s+" + re.escape(unit) + r"s?\s+if all picks are successful", description, re.I
    )
    return {
        "unit": re.sub(r"\bClue\b", "Clues", unit, flags=re.I),
        "each": each,
        "full": int(bonus[1].replace(",", "")) if bonus else each * slots,
    }


def _actual(pick: dict[str, Any], cands: list[dict[str, Any]]) -> dict[str, Any] | None:
    return next(
        (
            c
            for c in cands
            if c["s"] == pick["player"]
            and (not pick.get("game") or c.get("g") == pick["game"])
            and (not pick.get("card") or c.get("card") == pick["card"])
        ),
        None,
    )


def own_result(mission: dict[str, Any], cands: list[dict[str, Any]]) -> int | None:
    override = mission.get("override")
    picks = override.get("picks", []) if override else mission.get("yours") or []
    if not picks:
        settled = bool(cands) and all(
            c.get("r", {}).get("void") or mission["key"] in c.get("r", {}).get("did", {}) for c in cands
        )
        return 0 if settled and (override or "appearances" in (mission.get("source") or {})) else None
    got = checked = 0
    for pick in picks:
        imported = (
            next(
                (
                    p
                    for p in mission.get("yours", [])
                    if all(p.get(k) == pick.get(k) for k in ("player", "game", "card"))
                ),
                {},
            )
            if override
            else pick
        )
        verdict = imported.get("status")
        if verdict in ("SUCCESS", "FAILURE"):
            checked += 1
            got += verdict == "SUCCESS"
            continue
        actual = _actual(pick, cands) if pick.get("game") else None
        result = (actual or {}).get("r") or {}
        if result.get("void"):
            continue
        if mission["key"] not in result.get("did", {}):
            return None
        checked += 1
        got += bool(result["did"][mission["key"]])
    return got if checked else None


def overview(logs: list[dict[str, Any]]) -> dict[str, Any]:
    combined: dict[str, Any] = {}
    for log in logs:
        for day, rarities in (log.get("days") or {}).items():
            combined.setdefault(day, {}).update(rarities)
    rows: list[dict[str, Any]] = []
    empty = 0
    for day, rarities in combined.items():
        for rarity, entry in rarities.items():
            empty += int(not entry.get("missions") and bool(entry.get("loaded")))
            for mission in entry.get("missions", []):
                key = mission["key"]
                cands = [c for c in entry.get("cands", []) if key in c.get("c", {}) or key in c.get("eligible", [])]
                slots = int(mission.get("picks") or 3)
                own = own_result(mission, entry.get("cands", []))
                identities = mission.get("sofixPicks") or [{"player": s} for s in mission.get("sofix", [])]
                chosen = [_actual(p, cands) for p in identities]
                empty_plan = bool(entry.get("captured") and any(key in c.get("c", {}) for c in cands))
                complete = (
                    entry.get("coverage") != "missing"
                    and (mission.get("source") or {}).get("eligibilityComplete") is not False
                )
                settled = bool(cands) and all(
                    c.get("r", {}).get("void") or key in c.get("r", {}).get("did", {}) for c in cands
                )
                state = "checked"
                if entry.get("reconstructed"):
                    state = "reconstructed"
                elif (mission.get("rule") or {}).get("kind") == "unsupported":
                    state = "unsupported"
                elif not cands or (not identities and not empty_plan):
                    state = "unrecorded"
                elif not complete or any(c.get("late") for c in cands) or any(c is None for c in chosen):
                    state = "incomplete"
                elif not settled:
                    state = "pending"
                best = sofix = None
                if state == "checked":
                    achievers = {
                        c["s"] for c in cands if not c.get("r", {}).get("void") and c["r"].get("did", {}).get(key)
                    }
                    best = min(slots, len(achievers))
                    sofix = len(
                        {
                            c["s"]
                            for c in chosen
                            if c and not c.get("r", {}).get("void") and c["r"].get("did", {}).get(key)
                        }
                    )
                    if own is not None and own > best:
                        state, best, sofix = "incomplete", None, None
                rows.append(
                    {
                        "id": f"{day}:{rarity}:{key}",
                        "day": day,
                        "rarity": rarity,
                        "mission": mission.get("title") or key,
                        "state": state,
                        "slots": slots,
                        "sofix": sofix,
                        "yours": own,
                        "best": best,
                        "replay": bool(entry.get("replay")),
                        "corrected": bool(mission.get("override")),
                        "reward": reward_terms(
                            mission.get("description") or (mission.get("source") or {}).get("description") or "", slots
                        ),
                    }
                )
    rows.sort(key=lambda r: (r["day"], r["rarity"], r["mission"]), reverse=True)
    return {"rows": rows, "emptyDays": empty}
