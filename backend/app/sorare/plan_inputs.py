"""Everything the planner knew at a week's lock, kept so any later idea can be replanned on past weeks (`plan_inputs:<slug>`).

Written each run until the lock. `load` gives back what `planner.plans` takes; the results to judge a replan against are already kept
(`player_games:<player>`, `sorare_references`). Nothing on a page reads this.
"""

from __future__ import annotations

from dataclasses import asdict, fields
from typing import Any

import numpy as np

from app.sorare.model import Card, Competition, Forecast, Tier

PREFIX = "plan_inputs:"
_LEFT_OUT = {"picture", "avatar", "club_name", "club_crest"}  # what a card looks like plans nothing
_KEPT_FORECAST = ("p_play", "mu", "sd", "p_start", "p_on", "start_source", "score_source")


def _comp(comp: Competition) -> dict[str, Any]:
    out = asdict(comp)
    out["rarities"] = sorted(comp.rarities)
    out["leagues"] = sorted(comp.leagues) if comp.leagues is not None else None
    return out


def _card(card: Card) -> dict[str, Any]:
    out = {k: v for k, v in asdict(card).items() if k not in _LEFT_OUT and v is not None}
    out["plays_in"] = sorted(card.plays_in)
    return out


def _forecast(f: Forecast, games: list[dict[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {k: getattr(f, k) for k in _KEPT_FORECAST if getattr(f, k) is not None}
    out["links"] = [[g["id"], g["venue"]] for g in games if g.get("venue")]
    if f.score_cdf is not None:
        out["cdf"] = [round(float(v), 5) for v in f.score_cdf]  # every score: a coarser copy changed which plan won
        out["cdf_mu"] = round(f.cdf_mu, 2)
    return out


def dump(
    week: dict[str, Any],
    comps: list[Competition],
    cards: list[Card],
    forecasts: dict[str, Forecast],
    games: dict[str, list[dict[str, Any]]],
    *,
    built_at: str,
) -> dict[str, Any]:
    from app.sorare.publish import in_week  # publish imports this module's neighbours; only the job's path needs it

    placed = in_week(cards, games)
    return {
        "gameweek": {k: week.get(k) for k in ("slug", "number", "lock", "end")},
        "builtAt": built_at,
        "competitions": [_comp(c) for c in comps],
        "cards": [_card(c) for c in placed],
        "forecasts": {
            player: _forecast(forecasts[player], games.get(player) or [])
            for player in sorted({c.player for c in placed})
            if player in forecasts
        },
    }


def _pairs(rows: Any) -> tuple[tuple[Any, ...], ...]:
    return tuple(tuple(row) for row in rows)


def _load_comp(raw: dict[str, Any]) -> Competition:
    known = {f.name for f in fields(Competition)}
    data = {k: v for k, v in raw.items() if k in known}  # a field dropped since the week was saved is ignored
    data.update(
        starters=[tuple(s) for s in raw["starters"]],
        subs=[tuple(s) for s in raw["subs"]],
        rarities=frozenset(raw.get("rarities") or ()),
        leagues=frozenset(raw["leagues"]) if raw.get("leagues") is not None else None,
        club_bonus=tuple(raw["club_bonus"]) if raw.get("club_bonus") else None,
        average_bonus=tuple(raw["average_bonus"]) if raw.get("average_bonus") else None,
        tiers=[Tier(**t) for t in raw.get("tiers") or []],
        reference={int(k): float(v) for k, v in (raw.get("reference") or {}).items()},
        pro_steps=_pairs(raw.get("pro_steps") or ()),
        reward_boosts={k: tuple(v) for k, v in (raw.get("reward_boosts") or {}).items()},
    )
    return Competition(**data)


def _load_forecast(raw: dict[str, Any]) -> Forecast:
    shape = None
    if raw.get("cdf"):
        shape = np.array(raw["cdf"], dtype=float)
        shape[-1] = 1.0
    return Forecast(
        **{k: raw[k] for k in _KEPT_FORECAST if k in raw},
        links=_pairs(raw.get("links") or ()),
        score_cdf=shape,
        cdf_mu=raw.get("cdf_mu", 0.0),
    )


def load(saved: dict[str, Any]) -> tuple[list[Competition], list[Card], dict[str, Forecast]]:
    """What `planner.plans` takes, as it stood at the week's lock."""
    cards = [
        Card(**{**raw, "positions": tuple(raw["positions"]), "plays_in": frozenset(raw.get("plays_in") or ())})
        for raw in saved["cards"]
    ]
    forecasts = {player: _load_forecast(raw) for player, raw in saved["forecasts"].items()}
    return [_load_comp(raw) for raw in saved["competitions"]], cards, forecasts
