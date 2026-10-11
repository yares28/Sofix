"""Explicit counterfactual references for legacy gaps. Never overwrite a captured forecast."""

import copy
from datetime import datetime
from typing import Any

from app.sorare import mission_form
from app.sorare.mission_seasons import CALENDAR, JAPAN, SUMMER


def reconstruct(entry: dict[str, Any], history: dict[str, Any], rarity: str, day: str, now: datetime) -> dict[str, Any]:
    from app.sorare.missions import daily_entry

    before = datetime.fromisoformat(f"{day}T08:00:00+00:00")
    players, sheets = [], {}
    for cand in entry.get("cands", []):
        # The day's kept inventory, not today's collection. Results never participate in ranking.
        game = copy.deepcopy(cand.get("match") or {"id": cand.get("g"), "kickoff": cand["k"]})
        game.update(id=cand.get("g"), kickoff=cand["k"])
        if (
            not cand.get("match")
            or cand.get("late")
            or not cand.get("captured")
            or game.get("pStart") is None
            or game.get("pOn") is None
            or (
                cand.get("captured")
                and datetime.fromisoformat(cand["captured"].replace("Z", "+00:00"))
                >= datetime.fromisoformat(cand["k"].replace("Z", "+00:00"))
            )
        ):
            game = {k: v for k, v in game.items() if k not in ("pStart", "pOn", "sources", "startSource", "ffMatch")}
            game["availabilityKnown"] = False
        games = history.get(cand["s"], {}).get("games", [])
        domestic = SUMMER | CALENDAR | JAPAN
        league = (
            game.get("competition")
            if game.get("competition") in domestic
            else next(
                (
                    g.get("competition")
                    for g in games
                    if g.get("competition") in domestic
                    and datetime.fromisoformat(g["date"].replace("Z", "+00:00")) < before
                ),
                None,
            )
        )
        sheets[cand["s"]] = {"form": mission_form.build(games, cand["pos"], before, league=league)}
        players.append(
            {
                "player": cand["s"],
                "name": cand["n"],
                "pic": cand.get("pic", ""),
                "pos": cand["pos"],
                "card": cand.get("card"),
                "rarity": rarity,
                "p": 0,
                "games": [game],
            }
        )
    tasks = [
        {
            **(m.get("source") or {}),
            "id": m["key"],
            "title": m.get("title", m["key"]),
            "description": m["description"],
            "mode": m["mode"],
            "picks": m["picks"],
            "appearances": m.get("yours", []),
        }
        for m in entry.get("missions", [])
    ]
    replay = daily_entry(
        None,
        tasks,
        {"players": players, "sheets": {"players": sheets}, "complete": entry.get("coverage") != "missing"},
        rarity,
        before,
    )
    # Source inventory may fill metadata but must not import a post-lock availability estimate.
    replay.update(reconstructed=True, reconstructedAt=entry.get("replay", {}).get("reconstructedAt", now.isoformat()))
    for m in replay["missions"]:
        original = next(x for x in entry["missions"] if x["key"] == m["key"])
        for key in ("override", "editRevision", "aliases"):
            if key in original:
                m[key] = copy.deepcopy(original[key])
    return replay


def needed(entry: dict[str, Any], now: datetime) -> bool:
    """Only legacy records lacking the new dated capture format qualify; empty supported forecasts can be genuine."""
    # Very old/minimal records cannot identify the task or player form reliably. Keep their original settlement working.
    if (
        not entry.get("missions")
        or any(not all(k in m for k in ("key", "description", "mode", "picks")) for m in entry["missions"])
        or any(not all(k in c for k in ("s", "n", "pos", "k")) for c in entry.get("cands", []))
    ):
        return False
    locked = [c for c in entry.get("cands", []) if datetime.fromisoformat(c["k"].replace("Z", "+00:00")) <= now]
    captured = [c for c in locked if not c.get("late")]
    return bool(locked and any(not (c.get("sheet") or {}).get("form") for c in (captured or locked)))
