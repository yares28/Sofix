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
from datetime import UTC, datetime, timedelta
from functools import partial
from typing import Any, TypeVar

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.logging_config import configure_logging
from app.models import ReadModel
from app.services import kept_blocks
from app.services.publish import notify_app, put
from app.services.timeutil import Laps
from app.sorare import (
    audit,
    card_art,
    early,
    european_history,
    ff_chances,
    ff_feed,
    ff_lineups,
    ff_link,
    ff_news,
    ff_use,
    foreign_coverage,
    foreign_history,
    foreign_scores,
    frozen,
    keeper,
    mission_pool,
    outfield,
    player_games,
    projection,
    score_checks,
    scores,
    start_fixes,
    starts,
)
from app.sorare import missions as sorare_missions
from app.sorare import publish as sorare_publish
from app.sorare import strategies as sorare_strategies
from app.sorare import strategy_audit as sorare_strategy_audit
from app.sorare import sync as sorare_sync
from app.sorare.client import SorareClient
from app.sorare.model import ESSENCE_ORDER
from app.sources import understat

logger = logging.getLogger(__name__)

SORARE_KEY = "sorare"
SETTINGS_KEY = (
    "sorare_settings"  # the owner's choices the plans follow: the essence order (written by the app's /api/settings)
)
REFERENCES_KEY = "sorare_references"
TEMPLATES_KEY = (
    "sorare_templates"  # the finished gameweeks whose LaLiga competitions stand in for the ones Sorare has not opened
)

LEAGUE_HISTORY_KEY = (
    "sorare_league_history"  # every LaLiga player's past games: the daily job writes it, the refresh reads it
)
LEAGUE_STATUS_KEY = "league_history_status"  # the daily job's last run, for Control: players, read, when

T = TypeVar("T")


def cached_references(db: Session) -> dict[str, Any]:
    row = db.get(ReadModel, REFERENCES_KEY)
    return dict(row.payload) if row and isinstance(row.payload, dict) else {}


def cached_templates(db: Session) -> dict[str, Any]:
    row = db.get(ReadModel, TEMPLATES_KEY)
    return dict(row.payload) if row and isinstance(row.payload, dict) else {}


def cached_league(db: Session, now: datetime | None = None) -> dict[str, Any]:
    return player_games.load(db, now=now, days=70)


def essence_order(db: Session) -> tuple[str, ...]:
    """The essence kinds the owner wants first, as he saved them on the Play page; the default when he never did."""
    row = db.get(ReadModel, SETTINGS_KEY)
    saved = row.payload.get("essenceOrder") if row and isinstance(row.payload, dict) else None
    if isinstance(saved, list) and saved and all(isinstance(kind, str) and kind for kind in saved):
        return tuple(dict.fromkeys(saved))
    return ESSENCE_ORDER


PUBLISHED_HEAD = ("version", "generatedAt", "nextId", "lastId", "timeline", "projected", "status")
WEEK_HEAD = ("gameweek", "played", "complete")
_HEAD_SQL = text(
    "SELECT json_build_object("
    + ", ".join(f"'{key}', p->'{key}'" for key in PUBLISHED_HEAD)
    + ", 'weeks', (SELECT json_agg(json_build_object("
    + ", ".join(f"'{key}', w->'{key}'" for key in WEEK_HEAD)
    + ") ORDER BY i) FROM json_array_elements(p->'weeks') WITH ORDINALITY AS t(w, i)))"
    " FROM (SELECT payload AS p FROM read_models WHERE key = :key) AS s"
)
_WEEK_SQL = text("SELECT payload->'weeks'->CAST(:i AS integer) FROM read_models WHERE key = :key")


def published(db: Session, now: datetime) -> dict[str, Any]:
    """What the app is showing now, as far as this run uses it: its replay of the last gameweek can be kept instead of
    rebuilt, and a week that locked since it was built has its plan kept (`frozen.freeze`, with this same `now`).

    Every other week is only its `gameweek`, `played` and `complete`, and the market and collection stay in Neon: about
    2 MB the run never used. On Postgres the rest is never sent; elsewhere (the tests' SQLite) it is dropped here."""
    if db.get_bind().dialect.name == "postgresql":
        found = db.execute(_HEAD_SQL, {"key": SORARE_KEY}).scalar()
        if not isinstance(found, dict):
            return {}
        head = {key: value for key, value in found.items() if value is not None}
        head["weeks"] = [{k: v for k, v in week.items() if v is not None} for week in head.get("weeks") or []]

        def week(i: int) -> Any:
            return db.execute(_WEEK_SQL, {"key": SORARE_KEY, "i": i}).scalar()
    else:
        row = db.get(ReadModel, SORARE_KEY)
        if not row or not isinstance(row.payload, dict):
            return {}
        payload = row.payload
        head = {key: payload[key] for key in PUBLISHED_HEAD if key in payload}
        head["weeks"] = [{k: w[k] for k in WEEK_HEAD if k in w} for w in payload.get("weeks") or []]

        def week(i: int) -> Any:
            return payload["weeks"][i]

    built = frozen._dt(head.get("generatedAt"))
    last = sorare_publish.settled_replay(head)
    for i, stub in enumerate(head["weeks"]):
        lock = frozen._dt((stub.get("gameweek") or {}).get("lock"))
        locked = built is not None and lock is not None and not stub.get("played") and built < lock <= now
        if stub is last or locked:
            head["weeks"][i] = week(i)
    return head


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
    db: Session,
    failed: dict[str, str],
    snapshot: dict[str, Any],
    fetched: datetime,
    *,
    write: bool,
    fixes: start_fixes.StartFixes | None = None,
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
        lineups = ff_use.Lineups(feed, snapshot["cards"], fetched, ff_link.load_kept(db), fixes=fixes)
        if write:
            ff_link.save_kept(db, lineups.links.links, fetched)
        return lineups

    return feed, optional(db, failed, "futbol fantasy links", link, None)


GAME_ALIASES = (
    "plan",
    "past",
    "live0",
    "live1",
    "a0",
    "a1",
    "a2",
)  # the gameweeks a run reads each player's games for (`sync.snapshot`)


def sorare_links(
    snapshot: dict[str, Any], lineups: ff_use.Lineups | None, league: ff_use.Lineups | None
) -> dict[int, dict[str, Any]]:
    """Which Sorare game each Futbol Fantasy match is, and who is who in it: Lineups shows Sorare's number (and reads it with one
    button) only for a match tied this way. The owner's cards first, then every LaLiga player the squad index holds."""
    out: dict[int, dict[str, Any]] = {}
    market = [{"player": row["player"]} for row in snapshot.get("market") or [] if row.get("player")]
    for rows, held in ((snapshot["cards"], lineups), (market, league)):
        if held is None:
            continue
        for alias in GAME_ALIASES:
            for slug, games in sorare_publish.card_games(rows, alias).items():
                for game, match, person in held.joins(slug, games):
                    entry = out.setdefault(match, {"id": game, "players": {}})
                    if entry["id"] == game:
                        entry["players"].setdefault(slug, person)
    return out


TIES_KEY = (
    "lineup_ties"  # {match id: {"id": Sorare's game, "players": {...}, "at": when last seen}}: small, read each run
)
TIES_KEPT = timedelta(days=10)


def remembered_ties(
    db: Session, fresh: dict[int, dict[str, Any]], at: datetime, *, write: bool
) -> dict[int, dict[str, Any]]:
    """This run's ties with the ones kept from earlier runs. A run only sees the games of the gameweeks it reads, so a match
    tied while its week was being planned would lose its tie (or all but the owner's players) once the week locks."""
    row = db.get(ReadModel, TIES_KEY)
    kept = row.payload if row and isinstance(row.payload, dict) else {}
    out: dict[int, dict[str, Any]] = {}
    for key, old in kept.items():
        seen = old.get("at") if isinstance(old, dict) else None
        if seen and datetime.fromisoformat(seen) > at - TIES_KEPT and old.get("id"):
            out[int(key)] = old
    for match, tie in fresh.items():
        old = out.get(match)
        players = {**(old["players"] if old and old["id"] == tie["id"] else {}), **tie["players"]}
        out[match] = {"id": tie["id"], "players": players, "at": at.isoformat()}
    if write:
        put(db, TIES_KEY, {str(match): tie for match, tie in out.items()}, at)
    db.rollback()
    return out


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
    league: ff_use.Lineups | None = None,
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
        links = remembered_ties(db, sorare_links(snapshot, lineups, league), at, write=write)
        page = ff_lineups.payload(feed, lineups, cards, memory.positions, at, art, links)
        if write:
            ff_lineups.save_memory(db, memory, at)
            put(db, ff_lineups.LINEUPS_KEY, page, at)
            # Each match is also kept by its day, for the weeks the site no longer lists; a failure leaves only that out.
            optional(
                db,
                failed,
                "lineups kept by day",
                lambda: ff_lineups.save_days(
                    db, ff_lineups.kept_days(feed, lineups, cards, memory.positions, at, art, links), at
                ),
                0,
            )
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


def _has_start(row: dict[str, Any], seen: dict[str, dict[str, Any]]) -> bool:
    player = row["player"]
    return bool(player.get("nextClassicFixturePlayingStatusOdds")) or any(
        player["slug"] in (seen.get(game.get("id") or "") or {}) for game in player.get("plan") or []
    )


def sorare_odds(snapshot: dict[str, Any]) -> dict[str, int]:
    """How many of the owner's players with a game in the gameweek being planned have Sorare's starter odds: the record
    held none in its first 30 rows, so this says every run whether Sorare's number is ever the fallback in practice."""
    players = {
        row["player"]["slug"]: _has_start(row, snapshot.get("sorareStarts") or {})
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


def foreign_inputs(kept: dict[str, Any], now: datetime) -> tuple[dict[str, Any], dict[str, Any], dict[str, list[str]]]:
    grids, models, clubs = {}, {}, {}
    for code in foreign_scores.COMPETITIONS:
        envelope = kept.get(f"grid:{code}") or {}
        grid = dict(envelope.get("data") or {})
        grids[code] = grid
        if code in {"CL", "EL", "CONF"}:
            stamp = frozen._dt((envelope.get("meta") or {}).get("last_predicted_at"))
            names = [t.get("sorare_slug") for t in grid.get("teams") or []]
            grid["_fresh"] = bool(stamp and timedelta(0) <= now - stamp <= timedelta(hours=6))
            if not grid["_fresh"] or len(names) != 36 or len(set(names)) != 36 or not all(names):
                continue
            clubs[code] = names
        model = foreign_scores.load(code)
        if model is not None and grid.get("model_version") == foreign_scores.expected_version(code):
            models[code] = model
    return grids, models, clubs


def run(
    db: Session, user: str | None = None, runs: int = 30, dry_run: bool = False, standalone: bool = False
) -> dict[str, Any]:
    if not settings.sorare_api_key:
        logger.info("sorare: no API key, step skipped")
        return {"skipped": "no SORARE_API_KEY"}
    started = datetime.now(UTC)
    laps = Laps()  # where the step's time goes, part by part, kept in the run's summary
    references = cached_references(db)
    templates = cached_templates(db)
    # The sync only asks this who has been read before; the games themselves are loaded once, after this run's are saved.
    # A dry run saves nothing, so it plans on the full history from here.
    league = cached_league(db) if dry_run else player_games.read_times(db, days=70)
    order = essence_order(db)
    # the three strategies that won most over the audited weeks build a plan each to compete with Sofix's (plans/plan-algorithm-v2.md 6)
    strategy_record = kept_blocks.read(db, "strategy_audit")
    contenders = sorare_strategies.contenders(
        strategy_record.payload if strategy_record and isinstance(strategy_record.payload, dict) else None
    )
    previous = published(db, started)
    foreign_kept = {
        r.key: r.payload for r in kept_blocks.rows(db, "grid:", "league_squads:", "league_games:", "player_index")
    }
    foreign_grids, foreign_models, foreign_clubs = foreign_inputs(foreign_kept, started)
    # A finished gameweek's replay never changes once its scores are final: keep it, and fetch nothing for it.
    kept = sorare_publish.settled_replay(previous)
    replayed = kept["gameweek"]["slug"] if kept else None
    # Sorare and the planner take a few minutes; Neon closes a connection that sits inside an open
    # transaction, so the session is let go here and picked up again to write the result.
    db.rollback()
    laps("cached reads")
    failed: dict[str, str] = {}
    with SorareClient() as client:
        if not dry_run:
            no_checks: dict[str, int] = {}
            optional(db, failed, "score checks", lambda: score_checks.run(db, client, started), no_checks)
        laps("score checks")
        foreign_states: dict[str, dict[str, Any]] = {}
        european_state: dict[str, Any] | None = None
        if any(c in foreign_models for c in ("CL", "EL", "CONF")):
            prior_europe = foreign_kept.get("league_games:EUROPE") or {}
            no_europe_games: dict[str, list[dict[str, Any]]] = {}
            no_europe_state: dict[str, Any] = {
                "complete": False,
                "games": {},
                "errors": [{"reason": "current history unavailable"}],
            }
            current_europe, european_state = optional(
                db,
                failed,
                "European game history",
                partial(european_history.collect, client, started, prior_europe),
                (no_europe_games, no_europe_state),
            )
            foreign_states["EUROPE"] = european_state
            if not dry_run:
                player_games.save(db, current_europe, started)
                put(db, "league_games:EUROPE", european_state, started)
            db.rollback()
        for code in (c for c in foreign_models if c not in {"CL", "EL", "CONF"}):
            prior = foreign_kept.get(f"league_games:{code}") or {}
            empty_history: dict[str, list[dict[str, Any]]] = {}
            current, state = optional(
                db,
                failed,
                f"{code} game history",
                partial(foreign_history.collect, client, code, started, prior),
                (empty_history, prior),
            )
            foreign_states[code] = state
            if not dry_run:
                player_games.save(db, current, started)
                put(db, f"league_games:{code}", state, started)
            db.rollback()
        active_models = {
            c: m
            for c, m in foreign_models.items()
            if (
                (european_state or {}).get("complete") is True
                if c in {"CL", "EL", "CONF"}
                else not any(
                    "scoring version" in str(e.get("reason", "")) for e in (foreign_states[c].get("errors") or [])
                )
            )
        }
        foreign_kwargs: dict[str, Any] = (
            {
                "foreign_codes": tuple(foreign_models),
                "foreign_indexes": {c: foreign_kept.get(f"league_squads:{c}") or {} for c in foreign_models},
                "foreign_clubs": foreign_clubs,
            }
            if foreign_models
            else {}
        )
        snapshot = sorare_sync.snapshot(
            client,
            user or settings.sorare_user,
            started,
            cached_references=references,
            replayed=replayed,
            cached_templates=templates,
            cached_league=league,
            **foreign_kwargs,
        )
        snapshot["scoreModels"] = {c: foreign_scores.version(c) for c in active_models}
        if not dry_run:
            for code, index in (snapshot.get("foreign") or {}).items():
                put(
                    db,
                    f"league_squads:{code}",
                    foreign_coverage.compact_index(index) if code in {"CL", "EL", "CONF"} else index,
                    started,
                )
            db.rollback()
        laps("sorare")
        # A real Sorare card for every LaLiga player, owned or not: the Lineups page draws everyone as his card. Without it a
        # player is drawn as he was before, so a step that fails costs only that.
        art: card_art.Art | None = optional(
            db, failed, "card art", lambda: card_art.refresh(db, client, started, write=not dry_run), None
        )
    if art is None:
        art = optional(db, failed, "card art (kept)", lambda: card_art.load(db), None)
    laps("card art")
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
    laps("understat")
    # Sorare's starting chances as its page showed them in the owner's browser: the public API gives none (13 Oct 2026).
    no_readings: dict[str, dict[str, Any]] = {}
    snapshot["sorareStarts"] = optional(
        db, failed, "sorare start chances", lambda: starts.seen_on_sorare(db, started), no_readings
    )
    db.rollback()
    fetched = datetime.fromisoformat(snapshot["fetchedAt"])
    owners = {row["player"]["slug"] for row in snapshot["cards"]}
    mine: dict[str, Any] = {}
    if not dry_run:
        player_games.save(db, snapshot["history"], fetched)
        # Every game of the owner's players, read once: their last 70 days are the plans' history, all of it the missions'.
        # Lean: only the detailed-score parts those readers use (`player_games.lean_stats`), a third of the bytes.
        mine = player_games.load(db, players=owners, lean=True)
        # Everyone else's form needs only his decisive actions out of each game's detailed score (`publish.own_decisive`).
        snapshot["leagueHistory"] = player_games.load(
            db, now=fetched, days=70, stats=(*sorare_publish.DECISIVE_STATS, "clean_sheet_60")
        )
        # A source outage only stops new reads: the owner's saved games remain available for form and replay.
        cutoff = fetched - timedelta(days=70)
        snapshot["history"] = {
            slug: games
            for slug, entry in mine.items()
            if (games := [g for g in entry["games"] if datetime.fromisoformat(g["date"]) >= cutoff])
        }
        db.rollback()
    laps("games saved")
    # Futbol Fantasy's expected lineups, before anything is planned: its chance that each player starts each game is what
    # the expected scores, the plans and the captain are built on. Only the gameweek being planned uses it.
    # Each source's start chances moved to what the record says happened, band by band, from 100 settled cases (plans/xscore.md X8).
    fixes = optional(db, failed, "start chance corrections", lambda: start_fixes.load(db), None)
    feed, lineups = read_lineups(db, failed, snapshot, fetched, write=not dry_run, fixes=fixes)
    laps("futbol fantasy")
    # Every LaLiga player linked to Futbol Fantasy's pages too, apart from the owner's cards (whose links the Lineups page marks as his):
    # every player then gets FF's start chance, not only his (7 Oct 2026). A failure leaves the others on Sorare's odds or their form.
    league_lineups: ff_use.Lineups | None = (
        optional(
            db,
            failed,
            "futbol fantasy league links",
            lambda: ff_use.Lineups(
                feed,
                [{"player": row["player"]} for row in snapshot.get("market") or [] if row.get("player")],
                fetched,
                ff_link.load_kept(db),
                fixes=fixes,
            ),
            None,
        )
        if feed is not None
        else None
    )
    lineups_page = publish_lineups(
        db, failed, snapshot, feed, lineups, fetched, write=not dry_run, art=art, league=league_lineups
    )
    db.rollback()
    laps("lineups page")
    # A player's score if he starts is worked out from his game (the football model's numbers and the bookmakers' goals line, scores.py)
    # instead of only his last five games. A step that fails, or a game it cannot tell, leaves that player's number as it was.
    scores_of: sorare_publish.ScoresOf | None = optional(
        db,
        failed,
        "game scores",
        lambda: (
            foreign_scores.scores_for(
                active_models,
                foreign_grids,
                scores.scores_for(
                    keeper.load(), outfield.load(), keeper.numbers_for(db, fetched), outfield.load_subs()
                ),
                european_games=(european_state or {}).get("games")
                if (european_state or {}).get("complete") is True
                else None,
            )
            if foreign_models
            else scores.scores_for(
                keeper.load(), outfield.load(), keeper.numbers_for(db, fetched), outfield.load_subs()
            )
        ),
        None,
    )
    db.rollback()
    laps("game scores")
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
    laps("early plans")
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
        order=order,
        league_ff=league_lineups.starts if league_lineups else None,
        contenders=contenders,
    )
    # Sofix's plan against what happened, beside its forecast on Play (plans/plan-algorithm-v2.md step 8)
    payload["trackRecord"] = sorare_strategy_audit.track_record(
        strategy_record.payload if strategy_record and isinstance(strategy_record.payload, dict) else None
    )
    foreign_markets = payload.pop("_foreignMarkets", {})
    alt, record = payload.pop("_alt", None), payload.pop("_record", None)
    lab = payload.pop("_strategies", None)
    lenses = payload.pop("_lenses", None)
    laps("plans")
    payload_laps = payload.pop("_laps", {})
    if art and art.urls:
        payload["market"] = sorare_publish.with_card_art(payload.get("market") or [], art.urls)
    planned_week = sorare_publish.week_of(payload) or {}
    news, readings = team_news(db, failed, planned_week, fetched)
    if news:
        planned_week["teamNews"] = news  # the Home's team news belongs to the week the site's numbers are about
    laps("team news")
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
        "foreignPlayers": {
            c: {"players": len(m["market"]), "complete": m["complete"], "bytes": len(json.dumps(m).encode())}
            for c, m in foreign_markets.items()
        },
        "foreignHistory": {
            c: {"games": len(s.get("games") or {}), "complete": s.get("complete"), "errors": s.get("errors")}
            for c, s in foreign_states.items()
        },
        "futbolfantasy": lineups_summary(feed, lineups, planned_week),
        "lineupsPage": lineups_page,
        "teamNews": {"players": news["players"], "atRisk": news["atRisk"]["total"]} if news else None,
        "sorareOdds": sorare_odds(snapshot),
        "sorarePlans": len((alt or {}).get("plans") or []),
        "sorareProjected": (alt or {}).get("projected"),
        "recorded": len((record or {}).get("players") or {}),
        "essenceOrder": list(order),
        "leagueFF": len(league_lineups.links.links) if league_lineups else 0,
        "seconds": round((datetime.now(UTC) - started).total_seconds()),
    }
    if snapshot.get("pastGaps"):
        # Sorare did not answer everything the week just played was built from: it is not made final, and is rebuilt next run.
        summary["pastGaps"] = snapshot["pastGaps"]
    summary["parts"] = {"sync": snapshot.get("parts"), "plans": payload_laps}
    if dry_run:
        summary["parts"]["step"] = laps
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
    summary["moved"] = player_games.moved(db, record, fetched)
    if record:
        page = db.get(ReadModel, ff_lineups.LINEUPS_KEY)
        summary["gameStatements"] = player_games.save_record(db, record, fetched, page.payload if page else None)
    summary["kept"] = player_games.summary(db)
    payload = sorare_publish.with_status(
        payload,
        where="cloud" if os.environ.get("GITHUB_ACTIONS") == "true" else "pc",
        moved=summary["moved"],
        kept=summary["kept"],
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
    # Written each run until the week locks, so what stays is what each said in time: the Sorare plans and both numbers.
    if alt and fetched < datetime.fromisoformat(alt["gameweek"]["lock"]):
        put(db, f"{sorare_publish.ALT_PREFIX}{alt['gameweek']['slug']}", alt, now)
    # The Play page's strategy plans the same way, one read model each so a visit reads only the one it shows.
    if lenses and fetched < datetime.fromisoformat(lenses[next(iter(lenses))]["gameweek"]["lock"]):
        for key, lens in lenses.items():
            put(db, f"{sorare_publish.LENS_PREFIX}{lens['gameweek']['slug']}:{key}", lens, now)
    # The strategy lab's lineups the same way: what each strategy said in time, scored after the games (strategy_audit.py).
    if lab and lab["strategies"] and fetched < datetime.fromisoformat(lab["gameweek"]["lock"]):
        put(db, f"{sorare_publish.STRATEGY_PREFIX}{lab['gameweek']['slug']}", lab, now)
        summary["strategies"] = {s["key"]: len(s["lineups"]) for s in lab["strategies"]}
    for key, block in foreign_coverage.blocks(foreign_markets, foreign_kept.get("player_index")).items():
        put(db, key, block, now)
    put(db, SORARE_KEY, payload, now)
    laps("writes")
    pool = optional(
        db,
        failed,
        "mission inventory",
        lambda: mission_pool.build(
            snapshot,
            now,
            ff=lineups.starts if lineups else None,
            scores=scores_of,
            # The games read after this run's were saved: what the run has written since is only statements, which the
            # missions leave out, but a player whose only rows they are is still listed (with no games), as before.
            history={slug: (mine.get(slug) or {}).get("games") or [] for slug in player_games.listed(db, owners)}
            if not dry_run
            else snapshot["history"],
        ),
        None,
    )
    if pool is not None:
        put(db, mission_pool.KEY, pool, now)
        optional(db, failed, "mission capture", lambda: sorare_missions.capture(db, pool, now), None)
    # The plan the page held when a week locked is kept once, before it is lost to the next run's page (roadmap 1.2).
    laps("missions")
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
    laps("frozen, references, news")

    audited: dict[str, int] = optional(db, failed, "audit", lambda: audit.publish(db, now), {})
    if audited:
        summary["audit"] = audited
    laps("audit")
    summary["parts"]["step"] = laps
    summary["parts"]["neonMB"] = laps.neon
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
