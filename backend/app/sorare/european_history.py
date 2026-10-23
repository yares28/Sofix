"""Complete, deduplicated 70-day UEFA main-stage history shared by CL and EL models."""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from app.research.european_alignment import align
from app.research.european_cases import admitted_starters, digest, is_main
from app.research.european_data import COMPETITIONS
from app.research.european_xscore_data import INDEX_QUERY, game_snapshot
from app.research.league_xscore_data import when
from app.services import european_sources
from app.sorare import foreign_history
from app.sorare.client import SorareError


def recent_index(client: Any, code: str, now: datetime) -> list[dict[str, Any]]:
    after = None
    cursors = set()
    found = {}
    previous_date = None
    for _ in range(20):
        comp = client.query(INDEX_QUERY, {"slug": COMPETITIONS[code].sorare, "after": after})["football"]["competition"]
        if not comp or comp["slug"] != COMPETITIONS[code].sorare:
            raise ValueError("Wrong current European competition")
        page = comp["pastGames"]
        for row in page["nodes"]:
            date = when(row["date"])
            if previous_date is not None and date > previous_date:
                raise ValueError("Current source order changed; cannot stop pagination by date")
            previous_date = date
            if now - timedelta(days=72) <= when(row["date"]) < now:
                if row["id"] in found:
                    raise ValueError("Repeated current European source identity")
                found[row["id"]] = row
        if (
            any(when(r["date"]) < now - timedelta(days=72) for r in page["nodes"])
            or not page["pageInfo"]["hasNextPage"]
        ):
            return list(found.values())
        after = page["pageInfo"].get("endCursor")
        if not after or after in cursors:
            raise ValueError("Repeated or missing current source cursor")
        cursors.add(after)
    raise ValueError("Current European source pagination budget exceeded")


def link_games(
    native: list[dict[str, Any]], source: list[dict[str, Any]], bindings: dict[str, str]
) -> dict[str, dict[str, Any]]:
    found = {}
    used = set()
    for game in source:
        home = bindings.get((game.get("homeTeam") or {}).get("slug", ""))
        away = bindings.get((game.get("awayTeam") or {}).get("slug", ""))
        options = [
            r
            for r in native
            if home
            and away
            and r["homeTeam"]["id"] == home
            and r["awayTeam"]["id"] == away
            and abs(when(r["kickOffTime"]["dateTime"]) - when(game["date"])) <= timedelta(hours=2)
        ]
        if len(options) != 1:
            continue
        ident = options[0]["id"]
        if ident in used:
            raise ValueError("Two current source games name one UEFA fixture")
        used.add(ident)
        found[ident] = game
    return found


def context_of(code: str, native: dict[str, Any], saved: dict[str, Any]) -> dict[str, Any]:
    starters = admitted_starters(saved)
    date = when(native["kickOffTime"]["dateTime"])
    source_date = when(saved["raw"]["date"])
    return {
        "version": 1,
        "mainStage": True,
        "competition": code,
        "nativeId": native["id"],
        "sourceDate": source_date.isoformat(),
        "date": date.isoformat(),
        "availableAt": (max(date, source_date) + timedelta(days=2)).isoformat(),
        "sourceSha256": digest(saved["raw"]),
        "starts": {p["slug"]: float(p["score"]) for p in starters},
        "settled": True,
    }


def collect(
    client: Any, now: datetime, previous: dict[str, Any], *, seconds: float = 900, capture: Path | None = None
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, Any]]:
    started = time.monotonic()
    calendars = european_sources.calendars(now)
    bindings = json.loads(european_sources.REGISTRY.read_text(encoding="utf-8"))["bindings"]
    out: dict[str, list[dict[str, Any]]] = defaultdict(list)
    state: dict[str, Any] = {"version": 1, "at": now.isoformat(), "games": {}, "errors": [], "coverage": {}}
    known = previous.get("games") or {}
    if capture is not None:
        capture.mkdir(parents=True, exist_ok=True)
    for code, editions in calendars.items():
        current_id = None
        try:
            source = recent_index(client, code, now)
            source_bindings = dict(bindings)
            for season, edition in editions.items():
                selected = [r for r in source if f"{season}-07-01" <= r["date"][:10] < f"{season + 1}-07-01"]
                derived = align(code, season, edition, selected)["bindings"]
                for slug, ident in derived.items():
                    if slug in source_bindings and source_bindings[slug] != ident:
                        raise ValueError("Current club identity conflicts with reviewed source registry")
                    source_bindings[slug] = ident
            native = [
                r
                for rows in editions.values()
                for r in rows
                if is_main(r)
                and r.get("status") == "FINISHED"
                and now - timedelta(days=70) <= when(r["kickOffTime"]["dateTime"]) < now - timedelta(days=2)
            ]
            links = link_games(native, source, source_bindings)
            missing = sorted(r["id"] for r in native if r["id"] not in links)
            state["coverage"][code] = {"expected": len(native), "linked": len(links), "missing": missing}
            if missing:
                raise ValueError(f"Missing current main-stage source fixtures: {','.join(missing)}")
            for row in native:
                game = links[row["id"]]
                ident = game["id"]
                current_id = ident
                old = known.get(ident)
                if (
                    old
                    and old.get("version") == 1
                    and old.get("mainStage") is True
                    and old.get("settled")
                    and when(game["date"]) < now - timedelta(days=3)
                    and old.get("sourceDate") == when(game["date"]).isoformat()
                ):
                    if (
                        old.get("nativeId") != row["id"]
                        or old.get("competition") != code
                        or len(old.get("starts", {})) != 22
                    ):
                        raise ValueError("Invalid retained current history identity")
                    state["games"][ident] = old
                    continue
                if time.monotonic() - started >= seconds:
                    raise ValueError("Current European history time budget exhausted; resume next refresh")
                raw = client.query(foreign_history.QUERY, {"id": ident})["anyGame"]
                if capture is not None:
                    (capture / (hashlib.sha256(ident.encode()).hexdigest() + ".json")).write_text(
                        json.dumps(raw, separators=(",", ":")), encoding="utf-8"
                    )
                saved = game_snapshot(code, game, raw)
                if raw.get("statusTyped") != "played":
                    raise ValueError("Unsettled current European game")
                total = (row.get("score") or {}).get("total") or {}
                if any(raw.get(s + "Goals") != total.get(s) for s in ("home", "away")):
                    raise ValueError("Current official/source result disagreement")
                context = context_of(code, row, saved)
                if when(context["availableAt"]) >= now:
                    # A resumed result has not reached the replay's availability bound.
                    continue
                state["games"][ident] = context
                # Reuse existing actual-score storage; model history uses the bounded context above.
                for slug, games in foreign_history.history_of_slug(COMPETITIONS[code].sorare, raw).items():
                    out[slug].extend(games)
        except (SorareError, ValueError, KeyError, TypeError) as error:
            state["errors"].append({"competition": code, "game": current_id, "reason": str(error)[:240]})
    state["complete"] = not state["errors"]
    return dict(out), state
