"""Score pre-lock plans using kept actuals and their saved rules, never today's cards or a new optimization."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session, load_only

from app.models import PlayerGame
from app.services import kept_blocks
from app.services.timeutil import as_utc
from app.sorare import games_mirror
from app.sorare.frozen import PLAN_PREFIX
from app.sorare.model import POSITIONS, Card, Competition
from app.sorare.planner import SCORE_SD, Lineup, totals
from app.sorare.publish import SETTLE

RANGE_Z = 1.28  # the top of the range that holds 8 in 10 scores, in standard deviations


@dataclass
class _KeptCompetition(Competition):
    multipliers: dict[str, float] = field(default_factory=dict)

    def multiplier(self, card: Card) -> float:
        return self.multipliers[card.slug]


def _score(
    raw: dict[str, Any],
    games: dict[str, list[str]],
    actuals: dict[tuple[str, str], PlayerGame],
    with_cards: bool = False,
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
    if with_cards:  # what each card really scored, for the comparison on the Audit
        result["cards"] = [
            {
                "slug": c["slug"],
                "player": c["player"],
                "name": c.get("name") or c["player"],
                "pos": c["pos"],
                "club": c["club"],
                "score": round(scores[i], 2),
                "played": plays[i],
                "captain": bool(c.get("captain")),
                "sub": i >= len(starters),
            }
            for i, c in enumerate([*starters, *subs])
        ]
    result["verdict"] = verdict(
        result["score"],
        raw,
        [(c.get("name") or c["player"], plays[i], scores[i], c.get("mu")) for i, c in enumerate(starters)],
    )
    return result


def verdict(
    score: float, raw: dict[str, Any], cards: list[tuple[str, bool, float, float | None]]
) -> dict[str, Any] | None:
    """Was the score built on the numbers or on luck? Against the range saved before the lock (`lo` to `hi`, 8 weeks in 10 land
    inside it): above the top is "lucky", in the upper half of it "good", inside it "expected", under it "poor". The cards named
    are the ones that scored above the top of their own range (`mu` plus 1.28 standard deviations, the planner's usual one)."""
    x, low, high = raw.get("x"), raw.get("lo"), raw.get("hi")
    if x is None or low is None or high is None:
        return None
    if score > high:
        label = "lucky"
    elif score > x + (high - x) / 2:
        label = "good"
    elif score >= low:
        label = "expected"
    else:
        label = "poor"
    beat = [name for name, played, got, mu in cards if played and mu is not None and got > mu + RANGE_Z * SCORE_SD]
    return {"label": label, "beat": beat}


def games_of(week: dict[str, Any]) -> dict[str, list[str]]:
    """Each player's games in a kept week, the ones `_score` looks up."""
    return {
        p["player"]: [g["id"] for g in p.get("games") or [] if g.get("id")]
        for p in (week.get("playing") or {}).get("players") or []
    }


def results(db: Session, games: dict[str, list[str]]) -> dict[tuple[str, str], PlayerGame]:
    """The kept result of these players' games, by (player, game): only what `_score` will look up, where reading every kept
    game would have Neon send ~31,000 rows (2.6 MB) on each call."""
    ids = {gid for listed in games.values() for gid in listed}
    if not ids:
        return {}
    rows = games_mirror.view(db).scalars(
        select(PlayerGame)
        .options(
            load_only(PlayerGame.player, PlayerGame.game_id, PlayerGame.status, PlayerGame.played, PlayerGame.score)
        )
        .where(PlayerGame.player.in_(set(games)), PlayerGame.game_id.in_(ids))
    )
    return {(row.player, row.game_id): row for row in rows}


def read(db: Session, now: datetime) -> list[dict[str, Any]]:
    kept = [row.payload for row in kept_blocks.rows(db, PLAN_PREFIX)]
    settled = [
        (week, games_of(week))
        for week in kept
        if (end := (week.get("gameweek") or {}).get("end")) and now > as_utc(datetime.fromisoformat(end)) + SETTLE
    ]
    every: dict[str, list[str]] = {}
    for _, games in settled:
        for player, ids in games.items():
            every.setdefault(player, []).extend(ids)
    actuals = results(db, every)
    weeks = []
    for week, games in settled:
        info = week["gameweek"]
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
