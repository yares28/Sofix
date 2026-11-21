"""Arcade loopholes and post-mortems (plans/arcade-trust.md step 12, owner 29 Oct 2026: "loopholes found", "learning after every lineup").

Each loophole is a yes or no with its evidence, or "not seen yet" when your lineup log has not met the case:
- does a cancelled insurance lineup cost one of the step's lineups (the step's lineups left either side of the cancellation);
- can a lineup be edited until its first kick-off (the last read it was editable, the first it was locked);
- how often a second window the same day was there after a clear (in the climb with every score known);
- captaining by certainty against by score, and whether edition bonuses changed the best five (on your windows);
- which kick-off slots reach each step's target most often.
The post-mortem names the card that cost your latest settled lineup and why: did not play, came on, or started and under-scored.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.sorare.arcade_audit import SETTLES, best_five

MADRID = ZoneInfo("Europe/Madrid")
CLOSE = 15  # minutes before kick-off: seen editable this late counts as "until kick-off"
UNDER = 10.0  # a starter this many points under what was said before kick-off "under-scored"


def insurance_cost(log: dict[str, Any] | None) -> dict[str, Any]:
    """For each cancelled lineup, the step's lineups left just before and just after it was cancelled."""
    history = sorted((log or {}).get("history") or [], key=lambda h: h["at"])
    seen = cost = 0
    for lineup in ((log or {}).get("lineups") or {}).values():
        if lineup.get("result") != "cancelled" or not lineup.get("resultAt"):
            continue
        at, step = lineup["resultAt"], lineup.get("step")
        before = [h for h in history if h["step"] == step and h["at"] <= at]
        after = [h for h in history if h["step"] == step and h["at"] > at]
        if not before or not after:
            continue
        seen += 1
        cost += after[0]["remaining"] < before[-1]["remaining"]
    answer = None if not seen else ("yes" if cost else "no")
    return {"answer": answer, "seen": seen, "cost": cost}


def edit_until(log: dict[str, Any] | None) -> dict[str, Any]:
    """The latest a lineup was seen editable before its first kick-off, and the earliest it was seen locked after."""
    editable: list[float] = []
    locked: list[float] = []
    for lineup in ((log or {}).get("lineups") or {}).values():
        first = lineup.get("firstKickoff")
        if not first:
            continue
        kick = datetime.fromisoformat(first).timestamp() * 1000
        if lineup.get("editableAt"):
            editable.append((kick - lineup["editableAt"]) / 60_000)
        if lineup.get("lockedAt"):
            locked.append((lineup["lockedAt"] - kick) / 60_000)
    if not editable and not locked:
        return {"answer": None, "lastEditableMinutes": None, "seen": 0}
    closest = min(editable) if editable else None
    # Locked before kick-off is a no; editable within 15 minutes of it a yes; anything else is not close enough to tell yet.
    answer = "no" if locked and min(locked) < 0 else "yes" if closest is not None and closest <= CLOSE else None
    return {
        "answer": answer,
        "lastEditableMinutes": round(closest) if closest is not None else None,
        "lockedAfterMinutes": round(min(locked)) if locked else None,
        "seen": len(editable) + len(locked),
    }


def second_window(wins: Sequence[tuple[datetime, datetime, float]], moves: Sequence[dict[str, Any]]) -> dict[str, int]:
    """Of the clears in the climb with every score known, how many had another window the same Madrid day after they settled."""
    later = 0
    for move in moves:
        start, last, _ = wins[move["window"]]
        day = start.astimezone(MADRID).date()
        later += any(w[0] >= last + SETTLES and w[0].astimezone(MADRID).date() == day for w in wins)
    return {"clears": len(moves), "withLater": later}


def slots(fives: Sequence[dict[str, Any]], targets: Sequence[float]) -> list[dict[str, Any]]:
    """Each kick-off slot (Madrid time; Tuesday to Thursday evenings as European nights) and how often its best five reached each step."""
    out: dict[str, dict[str, Any]] = {}
    for five in fives:
        at = datetime.fromisoformat(five["at"]).astimezone(MADRID)
        slot = "European night" if at.weekday() in (1, 2, 3) and at.hour >= 18 else at.strftime("%H:%M")
        entry = out.setdefault(slot, {"slot": slot, "windows": 0, "clears": {}})
        entry["windows"] += 1
        for n, target in enumerate(targets, start=1):
            if five["total"] >= target:
                entry["clears"][str(n)] = entry["clears"].get(str(n), 0) + 1
    return sorted(out.values(), key=lambda s: (-len(s["clears"]), -s["windows"]))


def captain_choice(windows: Sequence[Any], captain: float) -> dict[str, Any]:
    """On each window's five chosen before kick-off: the captain by score (Sofix's way) against the surest starter, on real scores."""
    by_score = by_start = 0.0
    score_better = start_better = counted = 0
    for w in windows:
        usable = [c for c in w.cards if c.score is not None and c.start is not None]
        said = {c.card: c.start * c.score for c in usable}
        best = best_five(
            [{"slug": c.card, "player": c.player, "positions": c.positions, "bonus": c.bonus} for c in usable],
            said,
            captain,
        )
        if not best:
            continue
        cards = {c.card: c for c in usable}
        picks = [cards[p["card"]] for p in best["picks"]]
        base = sum(c.real * c.bonus for c in picks)
        a = base + captain * next(cards[p["card"]] for p in best["picks"] if p["captain"]).real
        b = base + captain * max(picks, key=lambda c: c.start or 0).real
        by_score, by_start, counted = by_score + a, by_start + b, counted + 1
        score_better += a > b
        start_better += b > a
    if not counted:
        return {"windows": 0}
    return {
        "windows": counted,
        "byScore": round(by_score / counted, 1),
        "byStart": round(by_start / counted, 1),
        "scoreBetter": score_better,
        "startBetter": start_better,
    }


def bonuses_changed(
    cards: Sequence[dict[str, Any]], window_scores: Sequence[dict[str, float]], captain: float
) -> dict[str, int]:
    """In how many windows the best five with edition bonuses differs from the best five without them (club bonuses are not kept)."""
    plain = [{**c, "bonus": 1.0} for c in cards]
    changed = total = 0
    for scores in window_scores:
        a, b = best_five(cards, scores, captain), best_five(plain, scores, captain)
        if not a or not b:
            continue
        total += 1
        changed += {p["card"] for p in a["picks"]} != {p["card"] for p in b["picks"]}
    return {"windows": total, "changed": changed}


def post_mortem(
    log: dict[str, Any] | None, said: dict[tuple[str, str], dict[str, Any]], names: dict[str, str]
) -> dict[str, Any] | None:
    """Your latest settled lineup: for a miss, the card that cost most and why; for a clear, by how much."""
    settled = [
        lu
        for lu in ((log or {}).get("lineups") or {}).values()
        if lu.get("result") in ("cleared", "missed") and lu.get("resultAt")
    ]
    if not settled:
        return None
    lineup = max(settled, key=lambda lu: lu["resultAt"])
    out: dict[str, Any] = {
        "step": lineup["step"],
        "target": lineup["target"],
        "total": lineup.get("score"),
        "result": lineup["result"],
        "at": lineup["resultAt"],
    }
    worst: tuple[float, dict[str, Any]] | None = None
    for card in lineup.get("cards") or []:
        known = said.get((card.get("player") or "", card.get("game") or "")) or {}
        real = card.get("score") or 0.0
        expected = known.get("expected")
        if known.get("played") is False:
            reason = "did not play"
        elif known.get("started") is False:
            reason = "came on"
        elif expected is not None and real < expected - UNDER:
            reason = f"started and scored {round(real)} of the {round(expected)} expected"
        else:
            continue
        loss = ((expected or 40.0) - real) * (1.5 if card.get("captain") else 1.0)
        if worst is None or loss > worst[0]:
            worst = (
                loss,
                {
                    "card": card.get("slug"),
                    "name": names.get(card.get("slug") or "", card.get("slug")),
                    "reason": reason,
                    "captain": bool(card.get("captain")),
                },
            )
    if worst:
        out.update(worst[1])
    return out
