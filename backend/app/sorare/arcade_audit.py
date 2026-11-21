"""The Arcade audit, hindsight (plans/arcade-trust.md step 10; owner 29 Oct 2026: "how much could this set have paid with my cards, and
what would have got me there?").

For your set's commons (sent by the Arcade page, `arcade_cards:<set>`) and every game they played since the set opened (real Sorare
scores, `player_games`): each kick-off window's best five, then the climb a player who knew every score would have made on your board
(its targets from your lineup log, `arcade_log:<set>`): the most tops, then the most clears, each lineup settling before the next is
entered, a clear opening the next step at once and the top step starting the board again. Beside it, what you did, from the log.
Published as `arcade_audit:<set>`; the page only draws it. Club bonuses are left out (Sorare gives them per read, not per game).
"""

from __future__ import annotations

import logging
import os
from collections import Counter, defaultdict
from collections.abc import Iterable, Sequence
from datetime import datetime, timedelta
from functools import cache
from itertools import product
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PlayerGame
from app.services import kept_blocks
from app.services.timeutil import as_utc

logger = logging.getLogger(__name__)

CARDS_PREFIX = "arcade_cards:"
LOG_PREFIX = "arcade_log:"
KEY_PREFIX = "arcade_audit:"
WINDOW = timedelta(minutes=75)  # lib/arcadeClimb.ts windowsOf
SETTLES = timedelta(minutes=120)  # a lineup counts about two hours after its last kick-off
CAPTAIN = 0.5  # every Arcade step's captain bonus so far; a step's own replaces it when the log has it
SLOTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("GK", ("Goalkeeper",)),
    ("DEF", ("Defender",)),
    ("MID", ("Midfielder",)),
    ("FWD", ("Forward",)),
    ("EXTRA", ("Defender", "Midfielder", "Forward")),
)
SHORTLIST = 6  # per slot: enough for the exact best five, few enough to try every combination
BEST_SHOWN = 12


def windows(times: Sequence[datetime]) -> list[list[int]]:
    """Indexes of `times` grouped into kick-off windows: a game within 75 minutes of a window's first kick-off joins it."""
    order = sorted(range(len(times)), key=lambda i: times[i])
    out: list[list[int]] = []
    for i in order:
        if out and times[i] - times[out[-1][0]] <= WINDOW:
            out[-1].append(i)
        else:
            out.append([i])
    return out


def best_five(
    cards: Sequence[dict[str, Any]], scores: dict[str, float], captain: float = CAPTAIN
) -> dict[str, Any] | None:
    """The five with the highest total in a window: one per slot, each player once, the captain where he adds most."""
    played = [c for c in cards if c["slug"] in scores]
    worth = {c["slug"]: scores[c["slug"]] * c.get("bonus", 1.0) for c in played}
    pools = [
        sorted((c for c in played if set(c["positions"]) & set(fits)), key=lambda c: -worth[c["slug"]])[:SHORTLIST]
        for _, fits in SLOTS
    ]
    best: dict[str, Any] | None = None
    for combo in product(*pools):
        if len({c["player"] for c in combo}) < len(SLOTS):
            continue
        lead = max(combo, key=lambda c: scores[c["slug"]])
        total = sum(worth[c["slug"]] for c in combo) + scores[lead["slug"]] * captain
        if best is None or total > best["total"]:
            picks = [
                {"slot": slot, "card": c["slug"], "score": scores[c["slug"]], "captain": c is lead}
                for (slot, _), c in zip(SLOTS, combo, strict=True)
            ]
            best = {"total": total, "picks": picks}
    if best:
        best["total"] = round(best["total"], 2)
    return best


def replay(wins: Sequence[tuple[datetime, datetime, float]], targets: Sequence[float]) -> dict[str, Any]:
    """The climb with every score known: (window start, last kick-off, best total) in time order, the board's targets from step 1.
    The most tops first, then the most clears; a window is played only when its five clears, after the last lineup settled."""
    top = len(targets)

    @cache
    def go(i: int, step: int) -> tuple[int, int, tuple[int, ...]]:
        if i >= len(wins):
            return (0, 0, ())
        skip = go(i + 1, step)
        start, last, total = wins[i]
        if total < targets[step - 1]:
            return skip
        settled = last + SETTLES
        j = next((k for k in range(i + 1, len(wins)) if wins[k][0] >= settled), len(wins))
        tops, clears, path = go(j, 1 if step == top else step + 1)
        play = (tops + (step == top), clears + 1, (i, *path))
        return max(play, skip, key=lambda r: (r[0], r[1]))  # a tie plays the earlier window

    tops, _, path = go(0, 1)
    moves, step = [], 1
    for i in path:
        moves.append({"window": i, "step": step, "total": wins[i][2], "target": targets[step - 1]})
        step = 1 if step == top else step + 1
    clears: Counter[int] = Counter(int(m["step"]) for m in moves)
    return {"tops": tops, "clears": dict(sorted(clears.items())), "moves": moves}


def actual(log: dict[str, Any] | None) -> dict[str, Any]:
    """What you did, from the lineup log: clears and misses per step, the tops, since the log began (21 Nov 2026)."""
    lineups = list(((log or {}).get("lineups") or {}).values())
    steps = len((log or {}).get("steps") or []) or None
    clears: Counter[int] = Counter(int(row["step"]) for row in lineups if row.get("result") == "cleared")
    misses: Counter[int] = Counter(int(row["step"]) for row in lineups if row.get("result") == "missed")
    return {
        "lineups": len(lineups),
        "clears": dict(sorted(clears.items())),
        "misses": dict(sorted(misses.items())),
        "tops": clears.get(steps, 0) if steps else 0,
        "since": min((str(row["chanceAt"]) for row in lineups if row.get("chanceAt")), default=None),
    }


def build(
    cards: list[dict[str, Any]], games: Iterable[tuple[str, str, datetime, float]], log: dict[str, Any] | None
) -> dict[str, Any] | None:
    """`games`: (player, game id, kick-off, score) for your cards' players. None when the board's targets are not known yet."""
    steps = sorted((log or {}).get("steps") or [], key=lambda s: s["number"])
    targets = [float(s["target"]) for s in steps]
    if not targets:
        return None
    by_game: dict[str, dict[str, float]] = defaultdict(dict)
    kickoff: dict[str, datetime] = {}
    for player, game, when, score in games:
        by_game[game][player] = score
        kickoff[game] = when
    ids = list(kickoff)
    by_card = {c["slug"]: c for c in cards}
    wins, fives = [], []
    for group in windows([kickoff[g] for g in ids]):
        played = [ids[i] for i in group]
        scores: dict[str, float] = {}
        for c in cards:
            for g in played:
                if c["player"] in by_game[g]:
                    scores[c["slug"]] = max(scores.get(c["slug"], 0.0), by_game[g][c["player"]])
        five = best_five(cards, scores, float(steps[0].get("captain") or CAPTAIN))
        if not five:
            continue
        at, last = min(kickoff[g] for g in played), max(kickoff[g] for g in played)
        wins.append((at, last, five["total"]))
        fives.append({"at": at.isoformat(), **five})
    plan = replay(wins, targets)
    used = [fives[m["window"]] for m in plan["moves"]]
    clubs: Counter[str] = Counter(by_card[p["card"]]["teamSlug"] for f in used for p in f["picks"])
    players: Counter[str] = Counter(p["card"] for f in used for p in f["picks"])
    club_info = {
        c["teamSlug"]: {"slug": c["teamSlug"], "name": c["team"], "crest": c.get("teamPicture")} for c in cards
    }
    return {
        "windows": len(wins),
        "targets": targets,
        "hindsight": {
            "tops": plan["tops"],
            "clears": plan["clears"],
            "moves": [
                {**m, "at": fives[m["window"]]["at"], "picks": fives[m["window"]]["picks"]} for m in plan["moves"]
            ],
        },
        "best": sorted(fives, key=lambda f: -f["total"])[:BEST_SHOWN],
        "clubs": [{**club_info[slug], "count": n} for slug, n in clubs.most_common(8)],
        "players": [
            {"card": slug, "name": by_card[slug]["name"], "picture": by_card[slug].get("picture"), "count": n}
            for slug, n in players.most_common(6)
        ],
        "actual": actual(log),
    }


def publish(db: Session, now: datetime) -> dict[str, int]:
    """Written with the Audit, for every set whose cards the page sent and that ended less than 30 days ago."""
    from app.services.publish import put
    from app.sorare import arcade_strategies, games_mirror

    if db.get_bind().dialect.name == "postgresql" and not os.environ.get("PLAYER_GAMES_MIRROR"):
        return {}
    written = 0
    for row in kept_blocks.rows(db, CARDS_PREFIX):
        payload = row.payload or {}
        set_slug = row.key.removeprefix(CARDS_PREFIX)
        start, end = payload.get("start"), payload.get("end")
        if not start or (end and as_utc(datetime.fromisoformat(end)) < now - timedelta(days=30)):
            continue
        cards = payload.get("cards") or []
        log_row = kept_blocks.read(db, LOG_PREFIX + set_slug)
        players = sorted({c["player"] for c in cards})
        # Every game of your cards' players (their records before a game need the earlier ones), with what was said before it.
        query = select(
            PlayerGame.player,
            PlayerGame.game_id,
            PlayerGame.date,
            PlayerGame.competition,
            PlayerGame.status,
            PlayerGame.played,
            PlayerGame.started,
            PlayerGame.score,
            PlayerGame.sorare_start,
            PlayerGame.ff_start,
            PlayerGame.sofix_start,
            PlayerGame.sofix_x,
            PlayerGame.sorare_x,
        ).where(PlayerGame.player.in_(players), PlayerGame.date <= now)
        rows = [
            (r[0], r[1], when, *r[3:]) for r in games_mirror.view(db).execute(query).tuples() if (when := as_utc(r[2]))
        ]
        since = as_utc(datetime.fromisoformat(start)) or now
        games = [
            (r[0], r[1], r[2], float(r[7])) for r in rows if r[4] == "FINAL" and r[7] is not None and r[2] >= since
        ]
        log = log_row.payload if log_row else None
        audit = build(cards, games, log)
        if audit:
            steps = sorted((log or {}).get("steps") or [], key=lambda s: s["number"])
            captain = float(steps[0].get("captain") or CAPTAIN) if steps else CAPTAIN
            seen = arcade_strategies.seen_windows(cards, rows, since, now)
            audit["strategies"] = arcade_strategies.replay_all(seen, audit["targets"], captain)
            put(db, KEY_PREFIX + set_slug, {"set": set_slug, "at": now.isoformat(), **audit}, now)
            written += 1
    return {"sets": written}
