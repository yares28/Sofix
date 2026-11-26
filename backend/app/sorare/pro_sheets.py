"""The Pro teamsheet watch (plans/pro-page.md, "Teamsheet watch"): Sorare's announced elevens applied to the Pro week.

The refresh keeps each Pro week's planning inputs (`INPUTS_KEY`) and the games to watch (`WATCH_KEY`). The clock looks at those games
every five minutes from 75 minutes before kickoff and starts `pro-sheets.yml` when a side is newly out; that job
(`app.jobs.pro_sheets`) plans the week again on the elevens. The refresh applies the same elevens, so it never brings old chances back.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable, Mapping
from dataclasses import asdict, replace
from datetime import datetime, timedelta
from typing import Any

from app.sorare import plan_inputs
from app.sorare.client import SorareError
from app.sorare.model import Card, Competition, Forecast

log = logging.getLogger(__name__)

INPUTS_KEY = "sorare_pro_inputs"
WATCH_KEY = "pro_watch"
AHEAD = timedelta(minutes=75)  # the owner: "Each 5 min from 1h -15min to game time until they are out"
_EXTRA_FORECAST = (
    "start",
    "on",
    "benched_on",
)  # what a starter or a benched player scores, once the elevens say which he is

FORMATION = """query ProSheet($id: ID!) { anyGame(id: $id) { ... on Game {
  id homeTeam { slug } awayTeam { slug }
  homeFormation { startingLineupAvailable startingLineup { slug } bench { slug } }
  awayFormation { startingLineupAvailable startingLineup { slug } bench { slug } } } } }"""

Sheet = dict[str, Any]
"""One game's announced sides: {"at": ISO time read, "sides": how many, "teams": {team slug: {"starters": [...], "bench": [...]}}}."""


def _when(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def side(node: Mapping[str, Any] | None) -> dict[str, list[str]] | None:
    """One team's announced eleven and bench, or None until Sorare has all eleven."""
    if not node or not node.get("startingLineupAvailable"):
        return None
    starters = [p["slug"] for row in node.get("startingLineup") or [] for p in row or [] if p and p.get("slug")]
    if len(starters) != 11:
        return None
    return {"starters": starters, "bench": [p["slug"] for p in node.get("bench") or [] if p and p.get("slug")]}


def sheet_of(game: Mapping[str, Any] | None, at: datetime) -> Sheet | None:
    """A game's sheet from Sorare's answer, or None while neither side is out."""
    if not game:
        return None
    teams = {
        team["slug"]: got
        for team, node in ((game.get("homeTeam") or {}, game.get("homeFormation")), (game.get("awayTeam") or {}, game.get("awayFormation")))
        if team.get("slug") and (got := side(node)) is not None
    }  # fmt: skip
    return {"at": at.isoformat(), "sides": len(teams), "teams": teams} if teams else None


ReadSheets = Callable[[list[str]], dict[str, Sheet]]


def not_started(game: Mapping[str, Any], now: datetime) -> bool:
    return bool(game.get("kickoff")) and _when(game["kickoff"]) > now


def due(games: Mapping[str, list[dict[str, Any]]], now: datetime) -> list[str]:
    """The games not started that kick off within `AHEAD`: the only ones whose elevens can be out."""
    out = {
        g["id"]
        for listed in games.values()
        for g in listed
        if g.get("id") and not_started(g, now) and _when(g["kickoff"]) <= now + AHEAD
    }
    return sorted(out)


def read(query: Callable[[str, dict[str, Any]], dict[str, Any]], ids: Iterable[str], now: datetime) -> dict[str, Sheet]:
    """The announced sheets of these games, one public request each; a game Sorare does not answer is left as not announced."""
    out = {}
    for game_id in ids:
        try:
            got = sheet_of(query(FORMATION, {"id": game_id}).get("anyGame"), now)
        except SorareError as error:
            log.warning("Sorare did not give the elevens of %s: %s", game_id, error)
            continue
        if got:
            out[game_id] = got
    return out


def apply(
    forecasts: Mapping[str, Forecast], games: Mapping[str, list[dict[str, Any]]], sheets: Mapping[str, Sheet]
) -> dict[str, Forecast]:
    """Each player's forecast once his team's eleven is out: a starter starts, at his score if he does; a benched player does not
    start and plays only with his chance of coming on; anyone else plays no part. Teams not announced keep their forecasts."""
    out = dict(forecasts)
    for player, f in forecasts.items():
        listed = sorted(games.get(player) or [], key=lambda g: g.get("kickoff") or "")
        first = listed[0] if listed else None
        team = (sheets.get(first.get("id") or "") or {}).get("teams", {}).get(first.get("teamSlug")) if first else None
        if team is None:
            continue
        if player in team["starters"]:
            out[player] = replace(f, p_start=1.0, p_play=1.0, mu=f.start if f.start is not None else f.mu)
        elif player in team["bench"]:
            on = f.benched_on or 0.0
            out[player] = replace(f, p_start=0.0, p_play=on, mu=f.on if f.on is not None else f.mu)
        else:
            out[player] = replace(f, p_start=0.0, p_play=0.0)
    return out


def of_week(sheets: Mapping[str, Sheet], games: Mapping[str, list[dict[str, Any]]]) -> dict[str, Sheet]:
    """The sheets of the week's games, kept in its Pro block: the page marks the starters, the job reuses a reading Sorare does
    not repeat."""
    ids = {g.get("id") for listed in games.values() for g in listed}
    return {game_id: dict(s) for game_id, s in sheets.items() if game_id in ids}


def _card(card: Card) -> dict[str, Any]:
    out = {k: v for k, v in asdict(card).items() if v is not None}  # the Pro page draws the card: its look stays
    out["plays_in"] = sorted(card.plays_in)
    return out


def _forecast(f: Forecast) -> dict[str, Any]:
    out = plan_inputs._forecast(f, [])
    out["links"] = [list(link) for link in f.links]
    out.update({k: v for k in _EXTRA_FORECAST if (v := getattr(f, k)) is not None})
    return out


def _last_five(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    played = [h for h in rows if h.get("status") != "PENDING" and h.get("score") is not None]
    return [
        {k: h.get(k) for k in ("date", "score", "mins", "status")}
        for h in sorted(played, key=lambda h: h.get("date") or "")[-5:]
    ]


def inputs(
    comps: list[Competition],
    cards: list[Card],
    forecasts: Mapping[str, Forecast],
    games: Mapping[str, list[dict[str, Any]]],
    history: Mapping[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    """What a Pro week was planned on, for the players a Pro board can take: the job plans it again on the elevens with this."""
    from app.sorare import (
        pro,
    )  # pro imports the planner, which is heavy; only the refresh's and the job's paths need it

    kept = [c for c in cards if any(comp.allows(c) and pro.kickoff(c, comp, games) for comp in comps)]
    players = sorted({c.player for c in kept} & set(forecasts))
    return {
        "competitions": [plan_inputs._comp(c) for c in comps],
        "cards": [_card(c) for c in kept if c.player in forecasts],
        "forecasts": {p: _forecast(forecasts[p]) for p in players},
        "games": {p: games.get(p) or [] for p in players},
        "history": {p: _last_five(history.get(p) or []) for p in players},
    }


def load(
    saved: Mapping[str, Any],
) -> tuple[
    list[Competition], list[Card], dict[str, Forecast], dict[str, list[dict[str, Any]]], dict[str, list[dict[str, Any]]]
]:
    """`inputs` back as the planner takes them: competitions, cards, forecasts, games and each player's last five."""
    cards = [
        Card(**{**raw, "positions": tuple(raw["positions"]), "plays_in": frozenset(raw.get("plays_in") or ())})
        for raw in saved["cards"]
    ]
    forecasts = {
        player: replace(plan_inputs._load_forecast(raw), **{k: raw[k] for k in _EXTRA_FORECAST if k in raw})
        for player, raw in saved["forecasts"].items()
    }
    comps = [plan_inputs._load_comp(raw) for raw in saved["competitions"]]
    return comps, cards, forecasts, dict(saved["games"]), dict(saved["history"])


def watch(block: Mapping[str, Any], now: datetime) -> dict[str, Any]:
    """What the clock watches: every game a Pro board of yours can still play, and the sides already applied to the page."""
    games: dict[str, str] = {}
    applied: dict[str, int] = {}
    for week in block.get("weeks") or []:
        for game_id, s in (week.get("sheets") or {}).items():
            applied[game_id] = max(applied.get(game_id, 0), int(s.get("sides") or 0))
        for board in week.get("boards") or []:
            for batch in board.get("batches") or []:
                for card in batch.get("cards") or []:
                    fixture = card.get("fixture") or {}
                    if fixture.get("id") and fixture.get("kickoff") and _when(fixture["kickoff"]) > now:
                        games[fixture["id"]] = fixture["kickoff"]
    return {
        "builtAt": block.get("builtAt"),
        "sheetsAt": block.get("sheetsAt"),  # with builtAt, the Pro block's version: the page re-renders when it moves
        "games": [{"id": i, "kickoff": k} for i, k in sorted(games.items(), key=lambda ik: ik[1])],
        "applied": {i: n for i, n in applied.items() if i in games},
    }
