"""Recent authentic league games, fetched per match and reused through the existing game mirror."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from app.backtest.data import normalize_season
from app.config import settings
from app.research.league_xscore_data import GAME_QUERY, LEAGUES, game_list, player, reconcile, when
from app.research.league_xscore_validation import _eleven
from app.services.league_fdr import LEAGUES as FOOTBALL
from app.sorare import sync
from app.sorare.client import SorareError
from app.sources.football_data_co_uk import fetch_season_csv

QUERY = GAME_QUERY.replace("anyTeam {slug}", "anyTeam {slug name}").replace(
    "decisiveScore {totalScore}", "decisiveScore {totalScore} detailedScore {stat statValue totalScore}"
)


def recent_index(client: Any, code: str, now: datetime) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    start = now - timedelta(days=70)
    games = game_list(client, code, start=start, end=now)
    first = start.year if start.month >= 7 else start.year - 1
    last = now.year if now.month >= 7 else now.year - 1
    calendar = pd.concat(
        [
            normalize_season(
                fetch_season_csv(y, Path(settings.history_cache_dir), FOOTBALL[code][1], refresh=y == last), y
            )
            for y in range(first, last + 1)
        ],
        ignore_index=True,
    )
    calendar = calendar[
        (calendar["date"] >= pd.Timestamp(start.date())) & (calendar["date"] < pd.Timestamp(now.date()))
    ].reset_index(drop=True)
    games, audit = reconcile(client, code, games, calendar)
    return games, audit


def history_of(code: str, raw: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    if (raw.get("competition") or {}).get("slug") != LEAGUES[code] or raw.get("statusTyped") != "played":
        raise ValueError("Wrong source competition or unsettled game")
    out = {}
    formations = [raw.get(f"{side}Formation") or {} for side in ("home", "away")]
    xi = set().union(*(_eleven(f.get("startingLineup")) for f in formations))
    authoritative = all(f.get("startingLineupAvailable") for f in formations) and len(xi) == 22
    for row in raw.get("playerGameScores") or []:
        p = player(row)
        if p["played"] is True and p["started"] is None and authoritative:
            p["started"] = p["slug"] in xi
        if not p["slug"]:
            raise ValueError("Missing player identity")
        if p["played"] is True and str(p["status"]).upper() == "FINAL" and p["ver"] != 7:
            raise ValueError("Current source scoring version differs from the validated model")
        game = {
            "gameId": raw["id"],
            "date": raw["date"],
            "competition": LEAGUES[code],
            "home": raw["homeTeam"]["name"],
            "away": raw["awayTeam"]["name"],
            "score": p["score"],
            "status": p["status"],
            "played": p["played"],
            "started": p["started"],
            "mins": p["mins"],
        }
        if row.get("detailedScore") is not None:
            detail = row["detailedScore"]
            game.update(
                red=sync._sent_off(detail),
                yellow=sync._yellows(detail),
                stats=[s for s in detail if s.get("statValue") != 0] + sync._sheet_context({**row, "anyGame": raw}),
            )
        out[p["slug"]] = [game]
    if not out:
        raise ValueError("Empty source player scores")
    return out


def collect(
    client: Any, code: str, now: datetime, previous: dict[str, Any]
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, Any]]:
    games, audit = recent_index(client, code, now)
    known = previous.get("games") or {}
    state: dict[str, Any] = {"competition": code, "at": now.isoformat(), "games": {}, "errors": [], "alignment": audit}
    history: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for game in games:
        ident = game["id"]
        old = known.get(ident)
        # Three days of corrections, as the existing league-history job does.
        if old and when(game["date"]) < now - timedelta(days=3):
            state["games"][ident] = old
            continue
        try:
            raw = client.query(QUERY, {"id": ident})["anyGame"]
            if raw.get("id") != ident or raw.get("date") != game["date"]:
                raise ValueError("Current source fixture identity changed")
            for slug, rows in history_of(code, raw).items():
                history[slug].extend(rows)
            state["games"][ident] = {"date": raw["date"], "at": now.isoformat()}
        except (SorareError, ValueError, KeyError, TypeError) as error:
            state["errors"].append({"game": ident, "reason": str(error)[:160]})
            if old:
                state["games"][ident] = old
            if len(state["errors"]) >= 3:
                break
    state["complete"] = not state["errors"] and not audit.get("missingAfter") and len(state["games"]) == len(games)
    return dict(history), state
