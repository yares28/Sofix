"""Plan the Pro weeks again on the announced elevens (plans/pro-page.md, "Teamsheet watch").

    python -m app.jobs.pro_sheets

Started by the clock when a side of a watched game is newly out, or by the Pro page's "Check now" (`pro-sheets.yml`). Reads the Pro
block and its inputs as the last refresh wrote them (R2, Neon only if R2 is behind), asks Sorare for the elevens of the games kicking
off within 75 minutes (public, one request a game), plans each week with an announced game again and writes `sorare_pro` and
`pro_watch`. A week with nothing announced is left as it was.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.logging_config import configure_logging
from app.services import r2
from app.services.publish import notify_app, put
from app.services.timeutil import as_utc
from app.sorare import pro_sheets
from app.sorare.client import SorareClient
from app.sorare.publish import PRO_KEY, in_week, pro_week


def read_block(db: Session, key: str) -> dict[str, Any] | None:
    row = db.execute(text("SELECT updated_at FROM read_models WHERE key = :key"), {"key": key}).first()
    if row is None:
        return None
    block = r2.get_block(key, as_utc(row[0]))
    if block is not None:
        return dict(block["payload"])
    payload = db.execute(text("SELECT payload FROM read_models WHERE key = :key"), {"key": key}).scalar()
    return dict(payload) if payload else None


def replan(
    block: dict[str, Any], saved: dict[str, Any], read: pro_sheets.ReadSheets, now: datetime
) -> tuple[dict[str, Any], int]:
    """The Pro block with every week that has an announced game planned again on the elevens, and how many weeks changed."""
    weeks, changed = [], 0
    for week in block.get("weeks") or []:
        inputs = (saved.get("weeks") or {}).get(week.get("slug"))
        if not inputs:
            weeks.append(week)
            continue
        comps, cards, forecasts, games, history = pro_sheets.load(inputs)
        later = {
            p: kept for p, listed in games.items() if (kept := [g for g in listed if pro_sheets.not_started(g, now)])
        }
        fresh = read(pro_sheets.due(later, now))
        if not fresh:
            weeks.append(week)
            continue
        sheets = {**(week.get("sheets") or {}), **fresh}  # a reading Sorare does not repeat this time is kept
        boards, extra = pro_week(comps, in_week(cards, later), forecasts, later, history, sheets)
        extra.pop("_inputs")
        weeks.append({**week, "boards": boards, **extra})
        changed += 1
    return {**block, "weeks": weeks, **({"sheetsAt": now.isoformat()} if changed else {})}, changed


def main() -> int:
    configure_logging()
    began = time.monotonic()
    now = datetime.now(UTC)
    with SessionLocal() as db:
        block, saved = read_block(db, PRO_KEY), read_block(db, pro_sheets.INPUTS_KEY)
        db.rollback()
        if not block or not saved:
            print("::notice title=Pro teamsheets::no Pro week to plan yet (the refresh writes it)")
            return 0
        with SorareClient() as client:
            new, changed = replan(block, saved, lambda ids: pro_sheets.read(client.query, ids, now), now)
            calls = client.calls
        if changed:
            put(db, PRO_KEY, new, now)
        put(db, pro_sheets.WATCH_KEY, pro_sheets.watch(new, now), now)
    seconds = round(time.monotonic() - began, 1)
    print(
        f"::notice title=Pro teamsheets::{changed} week(s) planned on the elevens; {calls} Sorare requests; {seconds} s"
    )
    print("reload:", notify_app(settings.app_url, settings.revalidate_secret, settings.vercel_bypass_secret))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
