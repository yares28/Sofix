"""Squads, two clubs (plans/squad-prices.md, Q4): every pair of a league's clubs, one team from both, each night.

A pair's search takes about a second and a league has up to 190 pairs, too long for the refresh: the League history workflow
runs it after the night's games are read, one league a job. It reads what the refresh published (the market, your cards, the
card art, the day's prices, the Pro board) and writes R2 only: `squads_pairs:<code>` for the picker and
`squads_pair:<code>:<pair id>` for each pair's teams. The pages pick them up within the hour (their cache's lifetime).
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import UTC, datetime
from typing import Any

from app.db import SessionLocal
from app.logging_config import configure_logging
from app.services import kept_blocks, r2
from app.sorare import card_art, squads
from app.sorare.player_games import season_start

logger = logging.getLogger(__name__)


def prices_of(record: dict[str, Any] | None) -> dict[str, squads.Price]:
    """The last day of a league's price record (`squads.record`) as prices."""
    if not record or not record.get("days"):
        return {}
    out: dict[str, squads.Price] = {}
    for slug, series in (record.get("in") or {}).items():
        cents = series[-1] if series else None
        listed = ((record.get("listed") or {}).get(slug) or [None])[-1]
        cl = ((record.get("cl") or {}).get(slug) or [None])[-1]
        if cents is None:
            continue
        out[slug] = {
            "in": cents / 100 if listed else None,
            "inEst": None if listed else cents / 100,
            "cl": cl / 100 if cl is not None else None,
        }
    return out


def run(code: str, now: datetime, *, start: bool = False, write: bool = True) -> dict[str, Any]:
    league = next(slug for slug, (c, _, _) in squads.LEAGUES.items() if c == code)
    with SessionLocal() as db:
        sorare = kept_blocks.read(db, "sorare")
        payload = sorare.payload if sorare and isinstance(sorare.payload, dict) else {}
        if code in squads.FOREIGN:
            kept = kept_blocks.read(db, f"league_squads:{code}")
            rows = squads.foreign_rows(kept.payload if kept else None)
        else:
            rows = payload.get("market") or []
        now_block = kept_blocks.read(db, f"{squads.PREFIX}{code}")
        head = now_block.payload if now_block and isinstance(now_block.payload, dict) else {}
        record = kept_blocks.read(db, f"{squads.PRICES}{code}")
        art = card_art.load(db).urls
        since = season_start(now)
        if start:  # last season's record too
            since = since.replace(year=since.year - 1)
        games = squads.load_games(db, {r["slug"] for r in rows if r.get("slug")}, since)
        db.rollback()
    limited = [c for c in payload.get("collection") or [] if c.get("rarity") == "limited" and c.get("player")]
    owned = frozenset(c["player"] for c in limited if c.get("inSeason"))
    board = [(s["target"], s["cash"], s["essence"]) for s in head.get("board") or []] or None
    started = time.perf_counter()
    built = squads.pairs_blocks(
        league,
        rows,
        games,
        now,
        owned=owned,
        art=art,
        board=board,
        lines=head.get("arenaLines") or [],
        captain=float(head.get("captain") or squads.CAPTAIN),
        season=float(head.get("seasonBonus") or squads.SEASON),
        logo=head.get("logo"),
        prices=prices_of(record.payload if record else None),
        owned_classic=frozenset(c["player"] for c in limited if not c.get("inSeason")) - owned,
        start_of_season=start,
    )
    if built is None:
        return {"pairs": 0, "note": "last season's games are not kept for this league"}
    picker, details = built
    pair_key, pairs_key = (squads.PAIR_NEXT, squads.PAIRS_NEXT) if start else (squads.PAIR, squads.PAIRS)
    summary: dict[str, Any] = {"pairs": len(picker["pairs"]), "seconds": round(time.perf_counter() - started, 1)}
    if write:
        failed = 0
        for pid, block in details.items():
            failed += not r2.put_block(f"{pair_key}{code}:{pid}", block, now)
        failed += not r2.put_block(f"{pairs_key}{code}", picker, now)  # last: the picker never names a pair not written
        summary["failed"] = failed
    return summary


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--league", required=True, choices=[c for c, _, _ in squads.LEAGUES.values()])
    parser.add_argument("--start", action="store_true", help="the start of season: each club picked from last season")
    args = parser.parse_args(argv)
    if not r2.configured():
        print("R2 is not configured: nothing to write the pairs to.")
        return 1
    summary = run(args.league, datetime.now(UTC), start=args.start)
    print(f"Squads two clubs, {args.league}{' start of season' if args.start else ''}: {summary}")
    return 0 if not summary.get("failed") else 1


if __name__ == "__main__":
    raise SystemExit(main())
