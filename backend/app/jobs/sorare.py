"""Sync Sorare and publish the finished Play page into `read_models`.

    python -m app.jobs.sorare [--user yares] [--runs 30] [--dry-run]

Read-only against Sorare (the API key only raises the rate limit), then the whole gameweek is planned here and
stored as one payload the web app renders as it is. The scores that paid in past gameweeks are kept in
`read_models` between runs, so a run only fetches what it doesn't already know.

What the page points at (each early plan, the week just played) is written before it, so a week it lists can always be
opened; and what it can do without (early plans, Futbol Fantasy, the start-chance record) is tried in a way that a failure
only leaves it out, reported in the summary, instead of stopping the page from publishing. Futbol Fantasy is read before the
page is planned, since its chances are what the plans are built on, but inside a time budget of its own: a site that is slow
or down costs its numbers (yesterday's reading is used for a day), never the page.

Without SORARE_API_KEY the step is skipped, exactly like the odds step without its key.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, TypeVar

from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.logging_config import configure_logging
from app.models import ReadModel
from app.services.publish import notify_app, put
from app.sorare import (
    audit,
    card_art,
    early,
    ff_chances,
    ff_feed,
    ff_lineups,
    ff_link,
    ff_news,
    ff_use,
    frozen,
    keeper,
    outfield,
    projection,
    scores,
    starts,
)
from app.sorare import publish as sorare_publish
from app.sorare import record as sorare_record
from app.sorare import sync as sorare_sync
from app.sorare.client import SorareClient
from app.sources import understat

logger = logging.getLogger(__name__)

SORARE_KEY = "sorare"
REFERENCES_KEY = "sorare_references"
TEMPLATES_KEY = (
    "sorare_templates"  # the finished gameweeks whose LaLiga competitions stand in for the ones Sorare has not opened
)

T = TypeVar("T")


def cached_references(db: Session) -> dict[str, Any]:
    row = db.get(ReadModel, REFERENCES_KEY)
    return dict(row.payload) if row and isinstance(row.payload, dict) else {}


def cached_templates(db: Session) -> dict[str, Any]:
    row = db.get(ReadModel, TEMPLATES_KEY)
    return dict(row.payload) if row and isinstance(row.payload, dict) else {}


def published(db: Session) -> dict[str, Any]:
    """What the app is showing now: its replay of the last gameweek can be kept instead of rebuilt."""
    row = db.get(ReadModel, SORARE_KEY)
    return dict(row.payload) if row and isinstance(row.payload, dict) else {}


def optional(db: Session, failed: dict[str, str], step: str, work: Callable[[], T], fallback: T) -> T:
    """A step the page can publish without: when it fails it is logged, noted in the run's summary and left out.

    The session is let go too, since a statement that failed leaves it unusable until it is.
    """
    try:
        return work()
    except Exception as exc:
        logger.exception("sorare: %s failed, carrying on without it", step)
        db.rollback()
        failed[step] = f"{type(exc).__name__}: {exc}"[:200]
        return fallback


def read_lineups(
    db: Session, failed: dict[str, str], snapshot: dict[str, Any], fetched: datetime, *, write: bool
) -> tuple[ff_feed.Feed | None, ff_use.Lineups | None]:
    """Futbol Fantasy's match pages, read now (what could not be read keeps its last reading for a day), and each of the
    owner's players linked to the people on them. A read that breaks outright falls back to what was kept."""
    feed = optional(
        db, failed, "futbol fantasy", lambda: ff_feed.refresh(db, snapshot["cards"], fetched, write=write), None
    )
    if feed is None:
        feed = optional(db, failed, "futbol fantasy (kept)", lambda: ff_feed.load(db), None)
    if feed is None:
        return None, None

    def link() -> ff_use.Lineups:
        lineups = ff_use.Lineups(feed, snapshot["cards"], fetched, ff_link.load_kept(db))
        if write:
            ff_link.save_kept(db, lineups.links.links, fetched)
        return lineups

    return feed, optional(db, failed, "futbol fantasy links", link, None)


def publish_lineups(
    db: Session,
    failed: dict[str, str],
    snapshot: dict[str, Any],
    feed: ff_feed.Feed | None,
    lineups: ff_use.Lineups | None,
    at: datetime,
    *,
    write: bool,
    art: card_art.Art | None = None,
) -> dict[str, Any]:
    """The Lineups page's data, written as soon as the site has been read: it does not wait for the plans, which take minutes.

    Also brings up to date the memory of where each player plays (the squad pages, read a week apart, and the lines the elevens
    draw), which the page places the alternatives by.
    """
    if feed is None:
        return {}

    def work() -> dict[str, Any]:
        cards, _ = sorare_publish.read_cards(snapshot["cards"])
        memory = ff_lineups.load_memory(db)
        db.rollback()  # the squad pages are read over a minute or more, and Neon closes a connection left inside a transaction
        memory, squads = ff_lineups.read_squads(memory, feed, at)
        memory = ff_lineups.Memory(ff_lineups.remember(memory.positions, feed, lineups), memory.squads)
        page = ff_lineups.payload(feed, lineups, cards, memory.positions, at, art)
        if write:
            ff_lineups.save_memory(db, memory, at)
            put(db, ff_lineups.LINEUPS_KEY, page, at)
        out: dict[str, Any] = {"matches": len(page["matches"]), "bytes": len(json.dumps(page, separators=(",", ":")))}
        if write:
            # Every player's chance, kept at the lock and before the kick-off (roadmap 10.2b); a failure leaves it out, not the page.
            nothing: dict[str, int] = {}
            out["chances"] = optional(
                db, failed, "ff chances", lambda: ff_chances.save(db, page, snapshot.get("gameweeks"), at), nothing
            )
        if squads is not None:
            out["squads"] = len(squads.squads)
            if squads.failed:
                out["squadsFailed"] = squads.failed[:5]
        return out

    return optional(db, failed, "lineups page", work, {})


def team_news(
    db: Session, failed: dict[str, str], week: dict[str, Any], at: datetime
) -> tuple[dict[str, Any] | None, list[ff_news.Reading]]:
    """The Home's team news for the planned gameweek, and the earlier readings it was compared with."""
    readings: list[ff_news.Reading] = optional(db, failed, "team news history", lambda: ff_news.load(db), [])
    news = optional(db, failed, "team news", lambda: ff_news.team_news(week, at, readings), None)
    return news, readings


def record_starts(
    db: Session,
    failed: dict[str, str],
    snapshot: dict[str, Any],
    lineups: ff_use.Lineups | None,
    now: datetime,
    *,
    write: bool,
) -> dict[str, Any]:
    """Who says he will start (Sorare, Sofix, Futbol Fantasy), game by game, written down to be scored against what happens.

    A run that is not writing (a dry run) asks and reports but remembers nothing.
    """
    if not write:
        return {}
    ff = lineups.starts if lineups else None
    rows: list[starts.Row] = optional(db, failed, "start rows", lambda: starts.rows(snapshot, ff), [])
    # What the model made of each player and what his games are, beside the chances: what a backtest of the xScore needs.
    extra: list[starts.Note] = optional(db, failed, "start notes", lambda: starts.notes(snapshot, ff), [])
    record: dict[str, int] = optional(
        db, failed, "start record", lambda: {**starts.save(db, rows, now, extra), **starts.settle(db, snapshot)}, {}
    )
    return {"starts": record}


def sorare_odds(snapshot: dict[str, Any]) -> dict[str, int]:
    """How many of the owner's players with a game in the gameweek being planned have Sorare's starter odds: the record
    held none in its first 30 rows, so this says every run whether Sorare's number is ever the fallback in practice."""
    players = {
        row["player"]["slug"]: bool(row["player"].get("nextClassicFixturePlayingStatusOdds"))
        for row in snapshot["cards"]
        if row["player"].get("plan")
    }
    return {"players": len(players), "withOdds": sum(players.values())}


def lineups_summary(feed: ff_feed.Feed | None, lineups: ff_use.Lineups | None, week: dict[str, Any]) -> dict[str, Any]:
    """What Futbol Fantasy gave this run: matches held and read, who is linked, who could not be and how many games have a number."""
    if feed is None:
        return {"matches": 0, "read": 0}
    out: dict[str, Any] = ff_feed.stamp(feed)
    if lineups is not None:
        players = week.get("playing", {}).get("players", [])
        out.update(lineups.report([p["player"] for p in players if p.get("player")]))
        games = [g for p in players for g in p.get("games", [])]
        out["games"] = sum(1 for g in games if g.get("startSource") == "futbolfantasy")
        if gaps := lineups.missing(games):
            out["noMatch"] = gaps[:10]
    return out


def run(
    db: Session, user: str | None = None, runs: int = 30, dry_run: bool = False, standalone: bool = False
) -> dict[str, Any]:
    if not settings.sorare_api_key:
        logger.info("sorare: no API key, step skipped")
        return {"skipped": "no SORARE_API_KEY"}
    started = datetime.now(UTC)
    references = cached_references(db)
    templates = cached_templates(db)
    previous = published(db)
    # A finished gameweek's replay never changes once its scores are final: keep it, and fetch nothing for it.
    kept = sorare_publish.settled_replay(previous)
    replayed = kept["gameweek"]["slug"] if kept else None
    # Sorare and the planner take a few minutes; Neon closes a connection that sits inside an open
    # transaction, so the session is let go here and picked up again to write the result.
    db.rollback()
    failed: dict[str, str] = {}
    with SorareClient() as client:
        snapshot = sorare_sync.snapshot(
            client,
            user or settings.sorare_user,
            started,
            cached_references=references,
            replayed=replayed,
            cached_templates=templates,
        )
        # A real Sorare card for every LaLiga player, owned or not: the Lineups page draws everyone as his card. Without it a
        # player is drawn as he was before, so a step that fails costs only that.
        art: card_art.Art | None = optional(
            db, failed, "card art", lambda: card_art.refresh(db, client, started, write=not dry_run), None
        )
    if art is None:
        art = optional(db, failed, "card art (kept)", lambda: card_art.load(db), None)
    # Understat's xG for the midfielders and forwards, for the leagues the owner has players in: one request each, and a
    # league that cannot be read is left out, so its players simply show no xG.
    leagues = sorted(
        {
            slug
            for row in snapshot["cards"]
            if (slug := ((row["player"].get("activeClub") or {}).get("domesticLeague") or {}).get("slug"))
        }
    )
    snapshot["understat"] = understat.fetch_leagues(leagues, understat.season_of(started.date()))
    fetched = datetime.fromisoformat(snapshot["fetchedAt"])
    # Futbol Fantasy's expected lineups, before anything is planned: its chance that each player starts each game is what
    # the expected scores, the plans and the captain are built on. Only the gameweek being planned uses it.
    feed, lineups = read_lineups(db, failed, snapshot, fetched, write=not dry_run)
    lineups_page = publish_lineups(db, failed, snapshot, feed, lineups, fetched, write=not dry_run, art=art)
    db.rollback()
    # A player's score if he starts is worked out from his game (the football model's numbers and the bookmakers' goals line, scores.py)
    # instead of only his last five games. A step that fails, or a game it cannot tell, leaves that player's number as it was.
    scores_of: sorare_publish.ScoresOf | None = optional(
        db,
        failed,
        "game scores",
        lambda: scores.scores_for(
            keeper.load(), outfield.load(), keeper.numbers_for(db, fetched), outfield.load_subs()
        ),
        None,
    )
    db.rollback()
    # Every LaLiga round Sorare has not opened a gameweek for is planned early, from the calendar the app already holds. A
    # run plans only the few that are missing or stale, so it stays well inside its time; the rest keep their last plan.
    # If planning fails the page keeps the list of early weeks it had.
    rounds: list[projection.Round] = optional(db, failed, "calendar", lambda: projection.calendar(db, fetched), [])
    db.rollback()  # the calendar was a read, and what follows takes a while: the connection is not left inside a transaction
    made = optional(
        db,
        failed,
        "early plans",
        lambda: early.plan(
            db,
            snapshot,
            projection.unopened(rounds, snapshot["gameweeks"], now=fetched),
            runs=runs,
            now=fetched,
            ff=lineups,
            scores=scores_of,
        ),
        None,
    )
    early_weeks = made.weeks if made else []
    fresh_weeks = made.fresh if made else []
    heads = sorare_publish.projected_heads(early_weeks) if made else list(previous.get("projected") or [])
    payload = sorare_publish.build_payload(
        snapshot,
        runs=runs,
        previous=previous,
        projected=heads,
        ff=lineups.starts if lineups else None,
        scores=scores_of,
    )
    planned_week = sorare_publish.week_of(payload) or {}
    news, readings = team_news(db, failed, planned_week, fetched)
    if news:
        planned_week["teamNews"] = news  # the Home's team news belongs to the week the site's numbers are about
    size = len(json.dumps(payload, separators=(",", ":")))
    summary: dict[str, Any] = {
        "gameweek": planned_week.get("gameweek", {}).get("number"),
        "state": planned_week.get("state"),
        "plans": len(planned_week.get("plans", [])),
        "playing": planned_week.get("playing", {}).get("cards"),
        "xg": sum(1 for p in planned_week.get("playing", {}).get("players", []) if "xg" in p),
        "playable": len(planned_week.get("playable", [])),
        "weeks": [w["gameweek"]["number"] for w in payload.get("weeks", [])],
        "projected": [h["round"] for h in heads],
        "planned": [w["projected"]["round"] for w in fresh_weeks],
        "calls": snapshot["calls"],
        "bytes": size,
        "futbolfantasy": lineups_summary(feed, lineups, planned_week),
        "lineupsPage": lineups_page,
        "teamNews": {"players": news["players"], "atRisk": news["atRisk"]["total"]} if news else None,
        "sorareOdds": sorare_odds(snapshot),
        "seconds": round((datetime.now(UTC) - started).total_seconds()),
    }
    if snapshot.get("pastGaps"):
        # Sorare did not answer everything the week just played was built from: it is not made final, and is rebuilt next run.
        summary["pastGaps"] = snapshot["pastGaps"]
    if dry_run:
        would: list[str] = optional(
            db, failed, "frozen plan", lambda: frozen.freeze(db, previous, fetched, write=False), []
        )
        if would:
            summary["frozenPlans"] = would
        if failed:
            summary["failed"] = failed
        logger.info("sorare (dry run): %s", summary)
        return {**summary, "dryRun": True}
    now = datetime.now(UTC)
    # Sorare's projections only exist for a player's next game, so they are written down before they are lost.
    planned = sorare_record.rows(snapshot, "plan", scores_of)
    summary["moved"] = sorare_record.moved(db, planned)
    summary["kept"] = sorare_record.save(db, planned, now)
    sorare_record.save(db, sorare_record.rows(snapshot, "past"), now, final=True)
    payload = sorare_publish.with_status(
        payload,
        where="cloud" if os.environ.get("GITHUB_ACTIONS") == "true" else "pc",
        moved=summary["moved"],
        kept=sorare_record.summary(db),
        previous=previous,
    )
    # What the page points at is written before the page, so a week it lists is always there to open. Each early plan is a
    # page of its own, read only when that week is opened (written again when it has gone stale); the week just played, once
    # final, is kept whole on its own so it can be opened long after it leaves the page.
    for week in fresh_weeks:
        put(db, f"{sorare_publish.AHEAD_PREFIX}{week['projected']['round']}", week, now)
    archived = sorare_publish.archive_of(payload)
    if archived and db.get(ReadModel, archived[0]) is None:
        put(db, archived[0], archived[1], now)
        summary["archived"] = archived[0]
    put(db, SORARE_KEY, payload, now)
    # The plan the page held when a week locked is kept once, before it is lost to the next run's page (roadmap 1.2).
    kept_plans: list[str] = optional(db, failed, "frozen plan", lambda: frozen.freeze(db, previous, fetched), [])
    if kept_plans:
        summary["frozenPlans"] = kept_plans
    put(db, REFERENCES_KEY, snapshot["references"], now)
    if (
        snapshot.get("expected") or {}
    ) != templates:  # a finished week never changes: write only when a new one became the template
        put(db, TEMPLATES_KEY, snapshot.get("expected") or {}, now)
    optional(
        db,
        failed,
        "team news history",
        lambda: ff_news.save(db, ff_news.record(readings, ff_news.chances(planned_week), fetched), fetched),
        False,
    )
    summary.update(record_starts(db, failed, snapshot, lineups, fetched, write=True))
    # The Audit page, from the record as it now stands: after this run's own rows and settlements, so it says what they say.
    audited: dict[str, int] = optional(db, failed, "audit", lambda: audit.publish(db, now), {})
    if audited:
        summary["audit"] = audited
    if failed:
        summary["failed"] = failed
    if standalone:
        # run by hand: ask the app to reload its cached pages, the way the refresh job does at the end
        summary["revalidate"] = notify_app(settings.app_url, settings.revalidate_secret, settings.vercel_bypass_secret)
    logger.info("sorare: %s", summary)
    return summary


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    parser = argparse.ArgumentParser(description="Sync Sorare and publish the Play page data.")
    parser.add_argument("--user", default=None, help="the Sorare manager to plan for (default: SORARE_USER)")
    parser.add_argument("--runs", type=int, default=30, help="how many plan searches to run (more = steadier)")
    parser.add_argument("--dry-run", action="store_true", help="build everything but write nothing")
    args = parser.parse_args(argv)
    with SessionLocal() as db:
        result = run(db, args.user, args.runs, args.dry_run, standalone=True)
    print(json.dumps(result, indent=2))
    return 0 if "error" not in result else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
