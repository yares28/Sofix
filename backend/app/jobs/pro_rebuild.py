"""Rebuild the plan's Pro lineups on the announced elevens (plans/load-from-sorare.md, step 1; the owner, 20 Oct 2026).

    python -m app.jobs.pro_rebuild <week slug> <plan rank> <starters> <bench>

`starters` and `bench` are the player slugs Sorare announced in the elevens and on the benches of the games the app read (comma
separated; the app's "Load from Sorare" button sends them through `pro-rebuild.yml`). Nothing is read from Sorare but the Pro boards
(one public request): the forecasts are the latest run's, kept in the `sorare` read model. An announced starter starts; a player on
a bench plays only with his chance of coming on (`benchedOn`) at his score if he does (`on`), and may take a slot only when no
announced starter of yours fits it, or when that is at least what the best announced starter for the slot is expected to make
(Pro has no sub slots); anyone else does not play. The result is one small read model, `pro_rebuild`, shown beside Sofix's
Pro lineup and never replacing it.
"""

from __future__ import annotations

import json
import sys
import time
from datetime import UTC, datetime
from typing import Any

import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.logging_config import configure_logging
from app.services.publish import notify_app, put
from app.sorare import pro
from app.sorare.client import SorareClient
from app.sorare.model import Card, Competition, Forecast
from app.sorare.planner import build
from app.sorare.publish import in_week, lineup_payload

KEY = "pro_rebuild"

_READ = text(
    "SELECT (p->'collection')::text,"
    " (SELECT (w->'playing'->'players')::text FROM json_array_elements(p->'weeks') w WHERE w->'gameweek'->>'slug' = :slug),"
    " (SELECT (pl->'lineups')::text FROM json_array_elements(p->'weeks') w, json_array_elements(w->'plans') pl"
    "  WHERE w->'gameweek'->>'slug' = :slug AND (pl->>'rank')::int = :rank)"
    " FROM (SELECT payload AS p FROM read_models WHERE key = 'sorare') s"
)


def on_elevens(players: list[dict[str, Any]], starters: set[str], bench: set[str]) -> dict[str, Forecast]:
    """Each player's forecast once the elevens are out: a starter plays at his score if he starts, a benched player at his chance of
    coming on and his score if he does, anyone else not at all."""
    out: dict[str, Forecast] = {}
    for p in players:
        slug, games = p["player"], tuple((g["id"], g["venue"]) for g in p.get("games") or [] if g.get("venue"))
        if slug in starters:
            mu = p.get("start") or (float(p["x"]) / float(p["p"]) if p.get("p") else 0.0)
            out[slug] = Forecast(p_play=1.0, mu=float(mu), links=games, xd=p.get("xd"))
        elif slug in bench:
            out[slug] = Forecast(p_play=float(p.get("benchedOn") or 0.0), mu=float(p.get("on") or 0.0), links=games)
        else:
            out[slug] = Forecast(p_play=0.0, mu=0.0, links=games)
    return out


def bench_allowed(
    comp: Competition, pool: list[Card], forecasts: dict[str, Forecast], starters: set[str]
) -> list[Card]:
    """The pool with each benched player kept only where the owner allows one (20 Oct 2026): a slot no announced starter of yours fits,
    or one where his chance of coming on times his score if he does reaches the best announced starter's expected score there."""

    def expected(card: Card) -> float:
        f = forecasts[card.player]
        return f.p_play * f.mu

    starting = [c for c in pool if c.player in starters and comp.allows(c)]
    out = []
    for card in pool:
        if card.player in starters:
            out.append(card)
            continue
        for slot in comp.starters:
            if card.positions[0] not in slot:
                continue
            rivals = [expected(c) for c in starting if c.positions[0] in slot]
            if not rivals or expected(card) >= max(rivals):
                out.append(card)
                break
    return out


def swaps(old: dict[str, Any], new: dict[str, Any], starters: set[str], bench: set[str]) -> list[dict[str, str]]:
    """Who leaves Sofix's lineup, who comes in (same position first) and why: "Pedri not in the eleven", then Gavi."""
    now = {c["player"] for c in new["starters"]}
    was = {c["player"] for c in old["starters"]}
    ins = [c for c in new["starters"] if c["player"] not in was]
    out = []
    for card in (c for c in old["starters"] if c["player"] not in now):
        pick = next((c for c in ins if c.get("pos") == card.get("pos")), ins[0] if ins else None)
        if pick is None:
            break
        ins.remove(pick)
        player = card["player"]
        why = (
            "on the bench"
            if player in bench
            else "starts, but scores less"
            if player in starters
            else "not in the eleven"
        )
        out.append({"out": card["name"], "in": pick["name"], "why": why})
    return out


def rebuild(
    comps: list[Competition],
    collection: list[dict[str, Any]],
    players: list[dict[str, Any]],
    planned: list[dict[str, Any]],
    starters: set[str],
    bench: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Each Pro lineup of the plan built again on the elevens, in the plan's order, no card in two lineups and none the plan's other
    lineups use (those are locked in Arena). Returns the lineups and the boards that cannot be filled."""
    games = {p["player"]: p.get("games") or [] for p in players}
    forecasts = on_elevens(players, starters, bench)
    taken = {c["slug"] for lu in planned if lu.get("pro") is None for c in lu["starters"] + lu.get("subs", [])}
    cards = in_week(
        [
            Card(
                slug=c["slug"], player=c["player"], name=c["name"], positions=(c["pos"],), rarity=c["rarity"],
                in_season=c["inSeason"], level=c["level"], average=float(c["average"]), club_name=c.get("club"),
                picture=c.get("pic") or "",
            )
            for c in collection
            if c["slug"] not in taken and c["player"] in forecasts
        ],
        games,
    )  # fmt: skip
    by_key = {c.key: c for c in comps}
    rule_for = pro.rules_for(games)
    rng = np.random.default_rng(11)
    out, missing = [], []
    for old in (lu for lu in planned if lu.get("pro") is not None):
        comp = by_key.get(old["key"])
        if comp is None:
            why = "its Pro board could not be read from Sorare" if not comps else "Sorare no longer shows this board"
            missing.append({"comp": old["comp"], "why": why})
            continue
        pool = bench_allowed(comp, [c for c in cards if c.slug not in taken], forecasts, starters)
        best = build(comp, pool, forecasts, rng, keep=1, rule=rule_for(comp))
        if not best:
            missing.append({"comp": old["comp"], "why": "not enough of your players start in games within an hour"})
            continue
        lineup = lineup_payload(best[0], forecasts, games)
        taken |= {c["slug"] for c in lineup["starters"]}
        out.append({**lineup, "swaps": swaps(old, lineup, starters, bench)})
    return out, missing


def read(db: Session, slug: str, rank: int) -> tuple[list[Any], list[Any], list[Any], int]:
    """The collection, the week's players and the plan's lineups, as text so the bytes Neon sends can be counted."""
    row = db.execute(_READ, {"slug": slug, "rank": rank}).one()
    collection, players, planned = (json.loads(part or "[]") for part in row)
    return collection, players, planned, sum(len(part or "") for part in row)


def main(argv: list[str]) -> int:
    configure_logging()
    slug, rank = argv[0], int(argv[1])
    starters = {x for x in argv[2].split(",") if x}
    bench = {x for x in argv[3].split(",") if x} - starters
    began = time.monotonic()
    with SessionLocal() as db:
        collection, players, planned, sent = read(db, slug, rank)
        db.rollback()
        with SorareClient() as client:
            comps = pro.competitions(pro.boards(client, settings.sorare_user))
        lineups, missing = rebuild(comps, collection, players, planned, starters, bench)
        now = datetime.now(UTC)
        seconds = round(time.monotonic() - began, 1)
        payload = {
            "week": slug, "plan": rank, "at": now.isoformat(), "starters": len(starters), "bench": len(bench),
            "lineups": lineups, "missing": missing, "run": {"neonKB": round(sent / 1024), "seconds": seconds},
        }  # fmt: skip
        put(db, KEY, payload, now)
    print(
        f"::notice title=Pro rebuild::{len(lineups)} lineups, {len(missing)} not filled; Neon sent {sent / 1024:.0f} KB; {seconds} s"
    )
    for lu in lineups:
        print(f"{lu['comp']}: {', '.join(c['name'] for c in lu['starters'])} | {lu['swaps']}")
    print("reload:", notify_app(settings.app_url, settings.revalidate_secret, settings.vercel_bypass_secret))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
