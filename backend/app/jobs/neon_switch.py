"""Keep production on whichever free Neon project still has room (owner's ask, 14 Oct 2026).

    python -m app.jobs.neon_switch          # pick the live project
    python -m app.jobs.neon_switch --move   # the refresh job: also move when the live one nears its limit

POSTGRES_URL and POSTGRES_URL_SPARE (one or more URLs, separated by spaces or new lines) point at the projects (Sofix,
FDR, Sofix B); all hold the same tables. The live one is the one whose `read_models` was written last, the same rule the
app uses (frontend/lib/db.ts), so nothing has to be stored about which is live. With --move and NEON_API_KEY, when the
live project has sent LIMIT_BYTES this month, every table is copied to the answering project that has sent the least
(under the limit) and that one becomes live. The live URL goes to $GITHUB_ENV as
POSTGRES_URL for the next steps. Only the app login (rows only) is needed: sequences are moved on with nextval.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

import httpx
import psycopg
from psycopg import sql

from app.logging_config import configure_logging
from app.services import r2

logger = logging.getLogger(__name__)

# Neon's free plan sends 5 GB a month per project, then suspends it until the 1st. Its counter lags by hours and a busy
# day has sent 3.5 GB, so the move starts at 4 GB while the old project still answers (it has to, to be copied).
LIMIT_BYTES = 4 * 1024**3
NEON_API = "https://console.neon.tech/api/v2"


def dsn(url: str) -> str:
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


def endpoint_id(url: str) -> str:
    """`ep-cold-cloud-b9akf8sh` from `...@ep-cold-cloud-b9akf8sh-pooler.c-7.eu-central-1.aws.neon.tech/...`."""
    return (urlsplit(dsn(url)).hostname or "").split(".")[0].removesuffix("-pooler")


def last_write(url: str) -> float | None:
    """When `read_models` was last written, or None when the project does not answer (out of quota, unreachable)."""
    try:
        with psycopg.connect(dsn(url), connect_timeout=15) as conn:
            row = conn.execute("SELECT extract(epoch FROM max(updated_at)) FROM read_models").fetchone()
            return float(row[0]) if row and row[0] is not None else 0.0
    except psycopg.Error as error:
        logger.warning("%s does not answer: %s", endpoint_id(url), str(error).splitlines()[0][:120])
        return None


def pick(stamps: list[float | None]) -> int | None:
    """The project written last among those that answer."""
    answering = [i for i, at in enumerate(stamps) if at is not None]
    return max(answering, key=lambda i: stamps[i] or 0.0) if answering else None


def move_to(live: int, sent: list[int | None], stamps: list[float | None], limit: int = LIMIT_BYTES) -> int | None:
    """The project to move to: none while the live one is under the limit, else the answering one that sent least."""
    if (sent[live] or 0) < limit:
        return None
    room = [i for i, b in enumerate(sent) if i != live and b is not None and b < limit and stamps[i] is not None]
    return min(room, key=lambda i: sent[i] or 0) if room else None


def sent_bytes(
    urls: list[str], key: str, transport: httpx.BaseTransport | None = None
) -> tuple[list[int | None], str | None]:
    """Data each project sent this month, from Neon's API (matched by the endpoint in its URL). None where it is unknown:
    a failing API only means no move this run, never a failed job. An organization key sees the projects directly; a
    personal key sees them through its organizations. The note says why the usage is missing, for neon_status."""
    wanted = {endpoint_id(url): i for i, url in enumerate(urls)}
    out: list[int | None] = [None] * len(urls)
    note: str | None = None
    try:
        with httpx.Client(
            base_url=NEON_API, headers={"Authorization": f"Bearer {key}"}, timeout=20, transport=transport
        ) as api:
            # A personal key must name the organization (Neon answers 400 without it, 14 Oct 2026); an organization
            # key cannot list the user's organizations and lists its projects directly.
            orgs = api.get("/users/me/organizations")
            ids = [org["id"] for org in orgs.json().get("organizations", [])] if orgs.is_success else []
            projects: list[dict[str, Any]] = []
            for params in [{"org_id": org_id} for org_id in ids] or [{}]:
                projects += api.get("/projects", params=params).raise_for_status().json()["projects"]
            for project in projects:
                endpoints = api.get(f"/projects/{project['id']}/endpoints").raise_for_status().json()["endpoints"]
                for endpoint in endpoints:
                    if endpoint["id"] in wanted:
                        detail = api.get(f"/projects/{project['id']}").raise_for_status().json()["project"]
                        sent = int(detail.get("data_transfer_bytes") or 0)
                        out[wanted[endpoint["id"]]] = sent
                        logger.info("%s (%s): %.2f GB sent this month", project["name"], endpoint["id"], sent / 1024**3)
    except (httpx.HTTPError, KeyError, ValueError) as error:
        status = error.response.status_code if isinstance(error, httpx.HTTPStatusError) else type(error).__name__
        note = f"Neon's API answered {status}: check NEON_API_KEY"
    if note is None and not any(sent is not None for sent in out):
        note = "NEON_API_KEY sees none of these projects: make it an organization key for all projects"
    if note:
        logger.warning("%s; no move this run", note)
    return out, note


def table_order(tables: list[str], references: list[tuple[str, str]]) -> list[str]:
    """Tables with every referenced table first, so rows can be loaded in this order and deleted in reverse."""
    ordered: list[str] = []

    def visit(table: str, path: tuple[str, ...] = ()) -> None:
        if table in ordered or table in path:
            return
        for child, parent in references:
            if child == table and parent != table:
                visit(parent, (*path, table))
        ordered.append(table)

    for table in sorted(tables):
        visit(table)
    return ordered


def copy_all(source: str, target: str) -> None:
    """Replace every table in `target` with `source`'s rows, in one transaction on the target."""
    with psycopg.connect(dsn(source)) as src, psycopg.connect(dsn(target)) as dst:
        versions = [conn.execute("SELECT version_num FROM alembic_version").fetchall() for conn in (src, dst)]
        if versions[0] != versions[1]:
            raise RuntimeError(f"schemas differ ({versions[0]} vs {versions[1]}): apply the migrations to both first")
        tables = [r[0] for r in src.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")]
        references = [
            (r[0], r[1])
            for r in src.execute(
                "SELECT conrelid::regclass::text, confrelid::regclass::text FROM pg_constraint "
                "WHERE contype = 'f' AND connamespace = 'public'::regnamespace"
            )
        ]
        order = table_order(tables, references)
        with dst.transaction():
            for table in reversed(order):
                dst.execute(sql.SQL("DELETE FROM {}").format(sql.Identifier(table)))
            for table in order:
                columns = [
                    r[0]
                    for r in src.execute(
                        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = %s "
                        "ORDER BY ordinal_position",
                        (table,),
                    )
                ]
                cols = sql.SQL(", ").join(sql.Identifier(c) for c in columns)
                with (
                    src.cursor().copy(sql.SQL("COPY {} ({}) TO STDOUT").format(sql.Identifier(table), cols)) as out,
                    dst.cursor().copy(sql.SQL("COPY {} ({}) FROM STDIN").format(sql.Identifier(table), cols)) as into,
                ):
                    for chunk in out:
                        into.write(chunk)
                if "id" in columns:
                    advance_sequence(dst, table)
                logger.info("copied %s", table)
            # The copy carries the old write times; this row makes the target the one written last, so it is live.
            dst.execute(
                "INSERT INTO read_models (key, payload, updated_at) VALUES ('neon_live', '{}', now()) "
                "ON CONFLICT (key) DO UPDATE SET updated_at = now()"
            )


def advance_sequence(conn: psycopg.Connection, table: str) -> None:
    """Move the id sequence past the copied rows with nextval (setval needs the owner login)."""
    seq = conn.execute("SELECT pg_get_serial_sequence(%s, 'id')", (table,)).fetchone()
    if not seq or not seq[0]:
        return
    top = conn.execute(sql.SQL("SELECT coalesce(max(id), 0) FROM {}").format(sql.Identifier(table))).fetchone()
    state = conn.execute(sql.SQL("SELECT last_value, is_called FROM {}").format(sql.SQL(seq[0]))).fetchone()
    assert top and state
    behind = int(top[0]) - (int(state[0]) if state[1] else int(state[0]) - 1)
    if behind > 0:
        conn.execute("SELECT max(nextval(%s)) FROM generate_series(1, %s)", (seq[0], behind))


STATUS_KEY = "neon_status"


def write_status(
    urls: list[str], live: int, stamps: list[float | None], sent: list[int | None], note: str | None
) -> None:
    """What the refresh saw, kept in the live project for `node scripts/check.mjs --live` (every session's first look)."""
    projects = [
        {"endpoint": endpoint_id(url), "answers": stamps[i] is not None, "sentBytes": sent[i]}
        for i, url in enumerate(urls)
    ]
    if note is None and all(p["sentBytes"] is None for p in projects):
        note = "NEON_API_KEY did not give the usage"
    payload = {"live": endpoint_id(urls[live]), "projects": projects, "limitBytes": LIMIT_BYTES, "note": note}
    try:
        with psycopg.connect(dsn(urls[live]), connect_timeout=15) as conn:
            conn.execute(
                "INSERT INTO read_models (key, payload, updated_at) VALUES (%s, %s, now()) "
                "ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()",
                (STATUS_KEY, json.dumps(payload)),
            )
    except psycopg.Error as error:
        logger.warning("could not keep the Neon status: %s", str(error).splitlines()[0][:120])
    # `node scripts/check.mjs --live` reads it from R2, so no local session asks Neon.
    r2.put_block(STATUS_KEY, payload, datetime.now(UTC))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--move", action="store_true", help="copy to the other project when the live one nears its limit"
    )
    args = parser.parse_args()
    configure_logging()
    urls = [u for u in [os.environ.get("POSTGRES_URL", ""), *os.environ.get("POSTGRES_URL_SPARE", "").split()] if u]
    if not urls:
        logger.error("POSTGRES_URL is not set")
        return 1
    stamps: list[float | None] = [last_write(url) for url in urls] if len(urls) > 1 else [0.0]
    live = pick(stamps)
    if live is None:
        logger.error("no Neon project answers (all out of quota until the 1st?)")
        return 1
    key = os.environ.get("NEON_API_KEY", "")
    if args.move and len(urls) > 1:
        unknown: list[int | None] = [None] * len(urls)
        sent, note = sent_bytes(urls, key) if key else (unknown, "NEON_API_KEY is not set")
        target = move_to(live, sent, stamps)
        if target is not None:
            # ponytail: a job writing to the old project during the copy loses that write; jobs run minutes apart.
            logger.info(
                "moving to %s: %s has sent %d GB",
                endpoint_id(urls[target]),
                endpoint_id(urls[live]),
                LIMIT_BYTES // 1024**3,
            )
            copy_all(urls[live], urls[target])
            live = target
        write_status(urls, live, stamps, sent, note)
    logger.info("live project: %s", endpoint_id(urls[live]))
    if path := os.environ.get("GITHUB_ENV"):
        with open(path, "a", encoding="utf-8") as env:
            env.write(f"POSTGRES_URL={urls[live]}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
