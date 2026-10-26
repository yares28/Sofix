"""Who reads how much from Neon: each job writes one row when it ends (plans/neon-write-mostly.md, step 1).

Neon's free plan sends 5 GB a month per project and every project ran out in October 2026. GitHub keeps a job's log
behind a sign-in and Vercel keeps its logs an hour, so each process writes down its own reads instead: one `read_models`
row, `neon_ledger:<day>:<run>`, with the bytes it was sent and its biggest readers by table (a page block by its kind).
A write is not counted by Neon's limit; reading a day of rows back is a few kB.

The row's `updated_at` is 1970: the live project is the one written last (`neon_switch`, `frontend/lib/db.ts`), and a
ledger row must never decide that. Nothing here may fail a job: a refused or missing database leaves no row.
"""

from __future__ import annotations

import os
import re
from collections import defaultdict
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

PREFIX = "neon_ledger:"
TOP = 12  # readers kept per row
KEEP_DAYS = 14  # rows older than this are deleted by the next write
EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
_FROM = re.compile(r"\bfrom\s+\"?([a-z_]+)")


def label_of(statement: str, parameters: Any) -> str:
    """The table a statement reads; for `read_models`, the kind of block (the key up to its first colon)."""
    text = " ".join(statement.split()).lower()
    if not text.startswith(("select", "with")):
        return "write"
    found = _FROM.search(text)
    table = found.group(1) if found else text[:24]
    if table == "read_models" and isinstance(parameters, Mapping):
        key = next((v for v in parameters.values() if isinstance(v, str)), None)
        if key:
            return f"read_models:{key.split(':')[0]}"
    return table


def row(
    total: int, labels: Mapping[str, int], env: Mapping[str, str], now: datetime, *, pid: int, command: str
) -> tuple[str, dict[str, Any]]:
    """The ledger row of one process: its key (64 characters at most) and payload."""
    run = env.get("GITHUB_RUN_ID")
    who = f"{run}-{env.get('GITHUB_RUN_ATTEMPT', '1')}-{pid}" if run else f"local-{pid}"
    top = dict(sorted(labels.items(), key=lambda item: -item[1])[:TOP])
    return f"{PREFIX}{now:%Y%m%d}:{who}"[:64], {
        "at": now.isoformat(),
        "workflow": env.get("GITHUB_WORKFLOW", "local"),
        "job": env.get("GITHUB_JOB", ""),
        "command": Path(command).name,
        "bytes": total,
        "top": top,
    }


def write(engine: Any, total: int, labels: Mapping[str, int]) -> None:
    """Write this process's row; any failure is swallowed (the job's own work is done by now)."""
    import sys

    from sqlalchemy import delete
    from sqlalchemy.dialects import postgresql, sqlite

    from app.models import ReadModel

    try:
        key, payload = row(total, labels, os.environ, datetime.now(UTC), pid=os.getpid(), command=sys.argv[0])
        dialect = postgresql if engine.dialect.name == "postgresql" else sqlite
        statement = dialect.insert(ReadModel).values(key=key, payload=payload, updated_at=EPOCH)
        oldest = f"{PREFIX}{datetime.now(UTC) - timedelta(days=KEEP_DAYS):%Y%m%d}"
        with engine.begin() as conn:
            conn.execute(statement.on_conflict_do_update(index_elements=["key"], set_={"payload": payload}))
            conn.execute(delete(ReadModel).where(ReadModel.key.like(f"{PREFIX}%"), ReadModel.key < oldest))
    except Exception:  # noqa: BLE001 - a ledger row is never worth failing a job for
        return


def report(rows: list[tuple[str, dict[str, Any]]]) -> str:
    """A day of rows, added up: by workflow and command, then by reader, biggest first, in MB."""
    by_who: dict[str, float] = defaultdict(float)
    by_reader: dict[str, float] = defaultdict(float)
    runs: dict[str, int] = defaultdict(int)
    for _, payload in rows:
        who = f"{payload.get('workflow')} · {payload.get('command') or payload.get('job')}"
        by_who[who] += payload.get("bytes", 0) / 1e6
        runs[who] += 1
        for reader, size in (payload.get("top") or {}).items():
            by_reader[reader] += size / 1e6
    total = sum(by_who.values())
    lines = [f"{total:.1f} MB in {len(rows)} rows", "", "| who | rows | MB |", "|---|---|---|"]
    lines += [f"| {who} | {runs[who]} | {mb:.1f} |" for who, mb in sorted(by_who.items(), key=lambda item: -item[1])]
    lines += ["", "| reader | MB |", "|---|---|"]
    lines += [f"| {reader} | {mb:.1f} |" for reader, mb in sorted(by_reader.items(), key=lambda item: -item[1])[:25]]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    """`python -m app.services.neon_ledger [--day 20261027]`: the day's ledger from the live project (a few kB)."""
    import argparse

    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import ReadModel

    parser = argparse.ArgumentParser(description=main.__doc__)
    parser.add_argument("--day", default=f"{datetime.now(UTC):%Y%m%d}")
    args = parser.parse_args(argv)
    with SessionLocal() as db:
        rows = [
            (r.key, r.payload) for r in db.scalars(select(ReadModel).where(ReadModel.key.like(f"{PREFIX}{args.day}:%")))
        ]
    print(report(rows))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
