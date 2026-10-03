"""Every LaLiga game of the export joined to what was known before kick-off (plans/xscore.md P9 X1; roadmap 10.1).

    cd backend
    python -m app.sorare.gamedata [--games data/raw/sorare_games.jsonl] [--cache data/raw/football-data-co-uk] [--refresh]

`app.jobs.export_games` keeps each game player by player. The new xScore also needs the game around him: what the production football
model (Dixon-Coles, the settings in `artifacts/dixon_coles.json`) forecast from the Monday before (each side's expected goals and its
chance of a clean sheet, the win, draw and loss chances: the numbers behind the difficulty), the shots, cards and over/under prices the
match statistics of football-data.co.uk hold, and Sorare's own club names mapped onto that site's. Read only: nothing is written, and
the football-data files come from the local cache (`--refresh` downloads the newest season's, a conditional request).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections import Counter
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import pandas as pd

BACKEND = Path(__file__).resolve().parents[2]
DEFAULT_GAMES = BACKEND / "data" / "raw" / "sorare_games.jsonl"
DEFAULT_CACHE = BACKEND / "data" / "raw" / "football-data-co-uk"
DEFAULT_CONFIG = BACKEND / "artifacts" / "dixon_coles.json"
COMPETITION = "laliga-es"
SEASONS = (2025, 2026)  # 2025/26 and 2026/27
TOLERANCE = pd.Timedelta(days=2)  # football-data's day is local, Sorare's is UTC
FORECAST_COLUMNS = ("p_h", "p_d", "p_a", "cs_h", "cs_a", "lam_h", "lam_a")

# Sorare's club name -> football-data.co.uk's, for the clubs of 2025/26 and 2026/27.
CLUB = {
    "Alavés": "Alaves",
    "Deportivo Alavés": "Alaves",
    "D. Alavés": "Alaves",
    "Athletic Club": "Ath Bilbao",
    "Atlético de Madrid": "Ath Madrid",
    "Atlético Madrid": "Ath Madrid",
    "FC Barcelona": "Barcelona",
    "Barcelona": "Barcelona",
    "Real Betis": "Betis",
    "RC Celta": "Celta",
    "Celta de Vigo": "Celta",
    "Elche CF": "Elche",
    "Elche": "Elche",
    "RCD Espanyol de Barcelona": "Espanol",
    "Espanyol": "Espanol",
    "Getafe CF": "Getafe",
    "Girona FC": "Girona",
    "Levante UD": "Levante",
    "RCD Mallorca": "Mallorca",
    "CA Osasuna": "Osasuna",
    "Real Oviedo": "Oviedo",
    "Rayo Vallecano": "Vallecano",
    "Real Madrid": "Real Madrid",
    "Real Sociedad": "Sociedad",
    "Sevilla FC": "Sevilla",
    "Valencia CF": "Valencia",
    "Villarreal CF": "Villarreal",
    "Real Club Deportivo de La Coruña": "La Coruna",
    "Real Racing Club de Santander": "Santander",
    "Málaga CF": "Malaga",
}

__all__ = [
    "CLUB",
    "club",
    "coverage",
    "extras_from_raw",
    "forecasts_ahead",
    "join",
    "load_joined",
    "read_extras",
    "read_games",
]


def club(name: str) -> str | None:
    """football-data.co.uk's name for one of Sorare's clubs; None for a name the table does not cover."""
    return CLUB.get(name)


def read_games(path: Path) -> list[dict[str, Any]]:
    """The games of the export, oldest first. A line that is not a whole game (a run stopped in the middle of it) is skipped."""
    games: list[dict[str, Any]] = []
    for line in path.read_text("utf-8").splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict) and "id" in row:
            games.append(row)
    return sorted(games, key=lambda game: game["date"])


def _numbers(df: pd.DataFrame, column: str) -> pd.Series:
    if column not in df.columns:
        return pd.Series(float("nan"), index=df.index)
    return pd.to_numeric(df[column], errors="coerce")


def _first(df: pd.DataFrame, columns: Iterable[str]) -> pd.Series:
    """Per row, the first of these columns that has a price."""
    return pd.concat([_numbers(df, column) for column in columns], axis=1).bfill(axis=1).iloc[:, 0]


def _p_over(over: pd.Series, under: pd.Series) -> pd.Series:
    """The chance of over 2.5 goals once the bookmaker's margin is taken out of the two prices."""
    return (1 / over) / (1 / over + 1 / under)


def extras_from_raw(raw: pd.DataFrame) -> pd.DataFrame:
    """One season's match statistics: shots, shots on target, cards, and the over/under 2.5 prices before the match and at the close.

    The prices are the market average's, else Bet365's. `p_over` is the chance of over 2.5 goals from them, margin removed.
    """
    df = raw.dropna(subset=["Date", "HomeTeam", "AwayTeam"]).copy()
    out = pd.DataFrame(
        {
            "date": pd.to_datetime(df["Date"], dayfirst=True, format="mixed"),
            "home": df["HomeTeam"].astype(str).str.strip(),
            "away": df["AwayTeam"].astype(str).str.strip(),
            "hs": _numbers(df, "HS"),
            "as_": _numbers(df, "AS"),
            "hst": _numbers(df, "HST"),
            "ast": _numbers(df, "AST"),
            "hy": _numbers(df, "HY"),
            "ay": _numbers(df, "AY"),
            "hr": _numbers(df, "HR"),
            "ar": _numbers(df, "AR"),
            "over": _first(df, ["Avg>2.5", "B365>2.5"]),
            "under": _first(df, ["Avg<2.5", "B365<2.5"]),
            "over_close": _first(df, ["AvgC>2.5", "B365C>2.5"]),
            "under_close": _first(df, ["AvgC<2.5", "B365C<2.5"]),
        }
    )
    out["p_over"] = _p_over(out["over"], out["under"])
    out["p_over_close"] = _p_over(out["over_close"], out["under_close"])
    return out.reset_index(drop=True)


def read_extras(cache: Path, seasons: Iterable[int] = SEASONS, *, refresh: bool = False) -> pd.DataFrame:
    """The match statistics of the seasons, from the cached football-data.co.uk files (the newest re-downloaded on `refresh`)."""
    from app.sources.football_data_co_uk import fetch_season_csv

    ordered = sorted(seasons)
    frames = [
        extras_from_raw(fetch_season_csv(year, cache, refresh=refresh and year == ordered[-1])) for year in ordered
    ]
    return pd.concat(frames, ignore_index=True)


def forecasts_ahead(
    matches: pd.DataFrame, seasons: Iterable[int] = SEASONS, config: Path = DEFAULT_CONFIG
) -> pd.DataFrame:
    """Every match of the seasons with the production model's forecast from the Monday before it (the walk-forward's horizon 1)."""
    from app.backtest.methods import dixon_coles
    from app.backtest.walkforward import run_walkforward
    from app.services.rating_predictions import load_config

    logging.disable(logging.CRITICAL)
    try:
        forecasts = run_walkforward(matches, seasons, [dixon_coles("dc", load_config(config))], horizon_weeks=1)
    finally:
        logging.disable(logging.NOTSET)
    return forecasts[forecasts["horizon"] == 1].reset_index(drop=True)


def _by_pair(frame: pd.DataFrame) -> dict[tuple[str, str], list[dict[str, Any]]]:
    pairs: dict[tuple[str, str], list[dict[str, Any]]] = {}
    if frame.empty:
        return pairs
    for row in frame.to_dict("records"):
        pairs.setdefault((row["home"], row["away"]), []).append(row)
    return pairs


def _near(rows: list[dict[str, Any]] | None, day: pd.Timestamp) -> dict[str, Any] | None:
    """The row of the closest date, if it is within a day or two of `day`."""
    best = min(rows or [], key=lambda row: abs(pd.Timestamp(row["date"]).normalize() - day), default=None)
    if best is None or abs(pd.Timestamp(best["date"]).normalize() - day) > TOLERANCE:
        return None
    return best


def _number(value: Any) -> float | int | None:
    if value is None or pd.isna(value):
        return None
    return int(value) if float(value) == int(value) else float(value)


def join(
    games: list[dict[str, Any]], forecasts: pd.DataFrame, extras: pd.DataFrame
) -> tuple[list[dict[str, Any]], set[str]]:
    """Each game with `ctx`: its football-data match, the model's forecast, the shots and the over/under prices (each None when missing).

    Also the Sorare club names the table does not cover, so a missing club shows up instead of a game quietly joining to nothing.
    """
    forecast_by_pair, extras_by_pair = _by_pair(forecasts), _by_pair(extras)
    unmatched: set[str] = set()
    joined: list[dict[str, Any]] = []
    for game in games:
        names = (game["home"]["name"], game["away"]["name"])
        home, away = club(names[0]), club(names[1])
        unmatched.update(name for name, found in zip(names, (home, away), strict=True) if found is None)
        ctx: dict[str, Any] = {"fd": None, "forecast": None, "shots": None, "ou": None}
        if home and away:
            day = pd.Timestamp(game["date"]).tz_convert("UTC").tz_localize(None).normalize()
            predicted = _near(forecast_by_pair.get((home, away)), day)
            stats = _near(extras_by_pair.get((home, away)), day)
            if predicted is not None or stats is not None:
                ctx["fd"] = {"home": home, "away": away}
            if predicted is not None:
                ctx["forecast"] = {key: float(predicted[key]) for key in FORECAST_COLUMNS}
            if stats is not None:
                ctx["shots"] = {
                    key.removesuffix("_"): _number(stats[key])
                    for key in ("hs", "as_", "hst", "ast", "hy", "ay", "hr", "ar")
                }
                prices = {
                    key: _number(stats[key])
                    for key in ("over", "under", "p_over", "over_close", "under_close", "p_over_close")
                }
                if prices["p_over"] is not None or prices["p_over_close"] is not None:
                    ctx["ou"] = prices
        joined.append({**game, "ctx": ctx})
    return joined, unmatched


def season_of(date: str) -> str:
    """The season a UTC date belongs to, as 2025/26."""
    moment = pd.Timestamp(date).tz_convert("UTC")
    year = moment.year if moment.month >= 7 else moment.year - 1
    return f"{year}/{(year + 1) % 100:02d}"


def coverage(joined: list[dict[str, Any]], unmatched: set[str], last_day: pd.Timestamp | None = None) -> dict[str, Any]:
    """How much of the export has each part: the counts that go in plans/xscore.md.

    `last_day` is the newest match the football-data files hold: a game after it cannot have a forecast yet, and is counted apart.
    """
    players = [player for game in joined for player in game["players"].values()]
    after = (
        sum(
            1
            for game in joined
            if pd.Timestamp(game["date"]).tz_convert("UTC").tz_localize(None).normalize() > last_day
        )
        if last_day is not None
        else 0
    )
    return {
        "games": len(joined),
        "seasons": dict(Counter(season_of(game["date"]) for game in joined)),
        "with_forecast": sum(1 for game in joined if game["ctx"]["forecast"]),
        "with_shots": sum(1 for game in joined if game["ctx"]["shots"]),
        "with_prices": sum(1 for game in joined if game["ctx"]["ou"]),
        "with_xi": sum(1 for game in joined if game["xi"]["home"]["available"] and game["xi"]["away"]["available"]),
        "with_stats": sum(1 for game in joined if any(p["played"] and p["stats"] for p in game["players"].values())),
        "after_football_data": after,
        "player_rows": len(players),
        "played": sum(1 for player in players if player["played"]),
        "started": sum(1 for player in players if player["started"]),
        "starts_by_position": dict(Counter(player["pos"] for player in players if player["started"])),
        "with_projection": sum(1 for player in players if player["proj"] is not None),
        "unmatched_clubs": sorted(unmatched),
    }


def players_of(games: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """The games as the xScore backtest reads a history: players by slug, each with his position and every game he is listed in, oldest first.

    A game he did not play is a row too (`DID_NOT_PLAY`, scored 0), as in the owner's own history. Only LaLiga games are here, so a
    player's form is his LaLiga form: a European or international game of his is not seen.
    """
    players: dict[str, dict[str, Any]] = {}
    for game in sorted(games, key=lambda one: one["date"]):
        for slug, row in game["players"].items():
            entry = players.setdefault(slug, {"pos": row["pos"], "club": row["team"], "games": []})
            entry["pos"] = row["pos"] or entry["pos"]
            entry["club"] = row["team"] or entry["club"]
            entry["games"].append(
                {
                    "date": game["date"],
                    "competition": COMPETITION,
                    "gameId": game["id"],
                    "score": row["score"],
                    "played": row["played"],
                    "started": row["started"],
                    "mins": row["mins"],
                    "status": "FINAL" if row["played"] else "DID_NOT_PLAY",
                }
            )
    return players


def history_file(games: list[dict[str, Any]], fixtures: list[dict[str, str]]) -> dict[str, Any]:
    """The file `app.jobs.export_history` writes, for every LaLiga player: what `app.jobs.xscore_backtest --history` reads."""
    return {"players": players_of(games), "fixtures": fixtures}


def load_joined(
    games_path: Path = DEFAULT_GAMES, cache: Path = DEFAULT_CACHE, *, refresh: bool = False
) -> tuple[list[dict[str, Any]], set[str], pd.Timestamp]:
    """The whole export joined: games with `ctx`, the unmatched club names and the newest football-data match day."""
    from app.backtest.data import load_history

    matches = load_history(range(2016, 2027), cache, refresh_latest=refresh)
    joined, unmatched = join(read_games(games_path), forecasts_ahead(matches), read_extras(cache, refresh=refresh))
    return joined, unmatched, matches["date"].max()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Join the games export to the football model, shots and prices, and count it."
    )
    parser.add_argument("--games", type=Path, default=DEFAULT_GAMES)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument(
        "--refresh", action="store_true", help="download the newest season's football-data.co.uk file again"
    )
    parser.add_argument(
        "--history-out",
        type=Path,
        default=None,
        help="also write every LaLiga player's games as a history file for app.jobs.xscore_backtest (needs --fixtures-from)",
    )
    parser.add_argument(
        "--fixtures-from",
        type=Path,
        default=None,
        help="a history file of app.jobs.export_history, for Sorare's gameweeks",
    )
    args = parser.parse_args(argv)
    joined, unmatched, last_day = load_joined(args.games, args.cache, refresh=args.refresh)
    counts = coverage(joined, unmatched, last_day)
    print(f"football-data.co.uk holds matches up to {last_day.date()}")
    print(json.dumps(counts, indent=2, ensure_ascii=False))
    if args.history_out:
        if not args.fixtures_from:
            print("--history-out needs --fixtures-from: the history file carries Sorare's gameweeks.", file=sys.stderr)
            return 1
        fixtures = json.loads(args.fixtures_from.read_text("utf-8")).get("fixtures") or []
        args.history_out.parent.mkdir(parents=True, exist_ok=True)
        args.history_out.write_text(json.dumps(history_file(joined, fixtures), separators=(",", ":")), "utf-8")
        print(f"wrote {args.history_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
