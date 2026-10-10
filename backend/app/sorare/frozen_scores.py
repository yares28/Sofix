"""Score pre-lock plans using kept actuals and their saved rules, never today's cards or a new optimization."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session, load_only

from app.models import PlayerGame, ReadModel
from app.services.timeutil import as_utc
from app.sorare.frozen import PLAN_PREFIX
from app.sorare.model import POSITIONS, Card, Competition
from app.sorare.planner import Lineup, totals
from app.sorare.publish import SETTLE


@dataclass
class _KeptCompetition(Competition):
    multipliers: dict[str, float] = field(default_factory=dict)

    def multiplier(self, card: Card) -> float:
        return self.multipliers[card.slug]


def _score(
    raw: dict[str, Any], games: dict[str, list[str]], actuals: dict[tuple[str, str], PlayerGame]
) -> dict[str, Any]:
    result = {
        "competition": raw.get("comp"),
        "board": raw.get("board"),
        "expected": raw.get("x"),
        "score": None,
        "cameIn": [],
        "bonusLost": False,
    }
    starters, subs = raw.get("starters") or [], raw.get("subs") or []
    if not starters or any(key not in raw for key in ("captainBonus", "clubBonus", "averageBonus", "minInSeason")):
        result["reason"] = "incomplete-plan"
        return result
    cards = []
    plays, scores = [], []
    for card in [*starters, *subs]:
        if (
            any(key not in card for key in ("slug", "player", "pos", "slot", "inSeason", "average", "mult", "club"))
            or card["pos"] not in POSITIONS
        ):
            result["reason"] = "incomplete-plan"
            return result
        ids = games.get(card["player"])
        if not ids:
            result["reason"] = "incomplete-plan"
            return result
        rows = [actuals.get((card["player"], gid)) for gid in ids]
        if any(
            row is None
            or row.status not in ("FINAL", "DID_NOT_PLAY")
            or row.played is None
            or (row.status == "DID_NOT_PLAY" and row.played)
            or (row.played and row.score is None)
            for row in rows
        ):
            return result  # missing is unknown, not a substitute-triggering DNP
        played = [row.score for row in rows if row and row.played and row.score is not None]
        plays.append(bool(played))
        scores.append(max(played) if played else 0.0)  # Sorare uses the best game of a double week
        cards.append(
            Card(
                slug=card["slug"],
                player=card["player"],
                name=card.get("name", card["player"]),
                positions=(card["pos"],),
                rarity=card.get("rarity", "limited"),
                in_season=card["inSeason"],
                level=card.get("level", 0),
                average=card["average"],
                club=card["club"],
            )
        )
    captains = [i for i, card in enumerate(starters) if card.get("captain")]
    if (
        len(captains) != 1
        or any(card["slot"] not in (*POSITIONS, "EXT") for card in starters)
        or any(card["slot"] not in ("GK", "OUT") for card in subs)
    ):
        result["reason"] = "incomplete-plan"
        return result
    comp = _KeptCompetition(
        key=raw.get("key", ""),
        slug=raw.get("board", ""),
        name=raw.get("comp", ""),
        group=raw.get("group", ""),
        rarity=raw.get("rarity", ""),
        starters=[(c["slot"],) if c["slot"] != "EXT" else ("DEF", "MID", "FWD") for c in starters],
        subs=[("GK",) if c["slot"] == "GK" else ("DEF", "MID", "FWD") for c in subs],
        captain_bonus=raw["captainBonus"],
        min_in_season=raw["minInSeason"],
        club_bonus=tuple(raw["clubBonus"]) if raw["clubBonus"] else None,
        average_bonus=tuple(raw["averageBonus"]) if raw["averageBonus"] else None,
        multipliers={c["slug"]: c["mult"] for c in [*starters, *subs]},
    )
    lineup = Lineup(comp, cards[: len(starters)], cards[len(starters) :], captain=captains[0])
    result["score"] = round(float(totals(lineup, np.array([plays]), np.array([scores]), record=True)[0]), 2)
    result["cameIn"] = [{"sub": sub, "for": starter} for sub, starter in lineup.came_in]
    result["bonusLost"] = lineup.bonus_lost
    return result


def read(db: Session, now: datetime) -> list[dict[str, Any]]:
    kept = [row.payload for row in db.scalars(select(ReadModel).where(ReadModel.key.like(f"{PLAN_PREFIX}%")))]
    actuals = {
        (row.player, row.game_id): row
        for row in db.scalars(
            select(PlayerGame).options(
                load_only(PlayerGame.player, PlayerGame.game_id, PlayerGame.status, PlayerGame.played, PlayerGame.score)
            )
        )
    }
    weeks = []
    for week in kept:
        info = week.get("gameweek") or {}
        if not info.get("end") or now <= as_utc(datetime.fromisoformat(info["end"])) + SETTLE:
            continue
        games = {
            p["player"]: [g["id"] for g in p.get("games") or [] if g.get("id")]
            for p in (week.get("playing") or {}).get("players") or []
        }
        weeks.append(
            {
                "slug": info["slug"],
                "number": info["number"],
                "end": info["end"],
                "builtAt": week.get("builtAt"),
                "plans": [
                    {
                        "rank": plan.get("rank", i + 1),
                        "lineups": [_score(line, games, actuals) for line in plan.get("lineups") or []],
                    }
                    for i, plan in enumerate(week.get("plans") or [])
                ],
            }
        )
    return sorted(weeks, key=lambda week: week["end"], reverse=True)
