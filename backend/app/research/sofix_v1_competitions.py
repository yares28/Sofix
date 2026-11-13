"""Sofix v1 for the other competitions: pre-lock cases built the way Sofix v1 was built for LaLiga, and the artifacts.

    cd backend
    PYTHONPATH=<formula-packages>;. .venv/Scripts/python -m app.research.sofix_v1_competitions PL BL1 FL1 CL EL CONF

writes `artifacts/sofix_v1/<code>.json.gz` (plans/competitions-xscore-evidence.md: v1's trees per competition, his games in
that competition over 70 days, the starter's point from trees fitted on ordinary games only). Pin scikit-learn 1.7.2.

Every played version-7 appearance (starters and substitutes) of the exported games
(`app.jobs.export_games --competition <slug> --no-stats`, files in data/raw/xscore-leagues/), with:
- the lock: the most recent Tuesday or Friday 14:00 UTC at kick-off (as in sofix_v1_release.cutoff_for);
- the fixture numbers: the domestic board's reference Dixon-Coles model (league_fdr.REFERENCE) fitted on
  football-data.co.uk results strictly before the lock day, as the shipped league models were validated;
- the player's earlier appearances, settled 48 hours before the lock, from every exported competition.
"""

from __future__ import annotations

import argparse
import gzip
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.backtest.data import normalize_season
from app.research.league_xscore_identity import club_name
from app.research.league_xscore_validation import ADMIN, fit_before
from app.research.sofix_v1_release import cutoff_for
from app.services.league_fdr import FL1_ADMIN
from app.services.team_registry import by_odds_name
from app.sorare import keeper, sofix_v1
from app.sources.football_data_co_uk import fetch_season_csv

BACKEND = Path(__file__).resolve().parents[2]
EXPORTS = BACKEND / "data" / "raw" / "xscore-leagues"
CSV = BACKEND / "data" / "raw" / "football-data-co-uk"
LALIGA_FILE = BACKEND / "data" / "raw" / "sorare_games.jsonl"
DOMESTIC = {
    "PL": ("premier-league-gb-eng", "E0"),
    "BL1": ("bundesliga-de", "D1"),
    "FL1": ("ligue-1-fr", "F1"),
    "LL": ("laliga-es", "SP1"),
}
EUROPE = {"CL": "uefa-champions-league", "EL": "uefa-europa-league", "CONF": "uefa-europa-conference-league"}
SLUGS = {**{c: v[0] for c, v in DOMESTIC.items()}, **EUROPE}


@dataclass
class Case:
    comp: str
    game: str
    player: str
    lock: datetime
    when: datetime
    pos: str
    home: bool
    numbers: keeper.GameNumbers | None
    history: list[dict[str, Any]]  # every earlier appearance of his in any exported competition, newest first
    score: float
    decisive: bool
    role: str  # "start" or "bench"
    level: float  # Sorare's decisive level: 35 is an ordinary game (no decisive action either way)


def when(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def read(slug: str) -> list[dict[str, Any]]:
    path = LALIGA_FILE if slug == "laliga-es" else EXPORTS / f"{slug}.jsonl"
    if not path.exists():
        return []
    games = [json.loads(line) for line in path.read_text("utf-8").splitlines() if line.strip()]
    return [{**g, "competition": slug} for g in games]


def csv_history(code: str) -> pd.DataFrame:
    division = DOMESTIC[code][1]
    frames = [normalize_season(fetch_season_csv(y, CSV, division, refresh=False), y) for y in range(2021, 2027)]
    history = pd.concat(frames, ignore_index=True)
    drop = ADMIN if code == "BL1" else FL1_ADMIN if code == "FL1" else ()
    for day, home, away in drop:
        history = history[
            ~((history["date"] == pd.Timestamp(day)) & (history["home"] == home) & (history["away"] == away))
        ]
    return history.reset_index(drop=True)


def name(code: str, team: dict[str, Any], known: set[str]) -> str:
    if code != "LL":
        return club_name(team, known)
    if team["name"] == "Real Valladolid CF":  # relegated 2025: no longer in the registry
        return "Valladolid"
    found = by_odds_name(team["name"])
    if found is None or found.history_name not in known:
        raise ValueError(f"Unmapped LaLiga club {team['name']!r}")
    return found.history_name


def domestic_numbers(
    code: str, games: list[dict[str, Any]]
) -> dict[str, tuple[keeper.GameNumbers, keeper.GameNumbers]]:
    """Game id -> (home side's numbers, away side's numbers), from the reference board model fitted before the lock."""
    history = csv_history(code)
    known = set(history["home"]) | set(history["away"])
    fits: dict[tuple[datetime, int], Any] = {}
    found: dict[str, tuple[keeper.GameNumbers, keeper.GameNumbers]] = {}
    for game in games:
        try:
            home, away = (name(code, game[side], known) for side in ("home", "away"))
        except ValueError:
            continue
        at = when(game["date"])
        season = at.year - (1 if at.month < 7 else 0)
        lock = cutoff_for(at)
        if (lock, season) not in fits:
            rows = history[history["season_start"] == season]
            fits[lock, season] = fit_before(history, lock, sorted(set(rows["home"]) | set(rows["away"])))
        p = fits[lock, season].predict([home], [away]).iloc[0]
        found[game["id"]] = (
            keeper.GameNumbers(float(p["cs_h"]), float(p["lam_a"]), float(p["lam_h"])),
            keeper.GameNumbers(float(p["cs_a"]), float(p["lam_h"]), float(p["lam_a"])),
        )
    return found


def european_numbers() -> dict[str, tuple[keeper.GameNumbers, keeper.GameNumbers]]:
    """Game id -> (home, away) numbers for every exported CL, EL and Conference game, from the live board's pooled European
    goals model (research.european_model.fit) refitted on the three cups' results known before the lock. The results are
    Sorare's final scores (extra time included, a few cup ties) and every venue counts as a home ground (finals are neutral):
    the live board reads UEFA's regulation scores and venues instead."""
    from app.research import european_model

    listed = [EXPORTS / f"{slug}_list.json" for slug in EUROPE.values()]
    games = sorted(
        (g for path in listed if path.exists() for g in json.loads(path.read_text("utf-8"))),
        key=lambda g: (g["date"], g["id"]),
    )  # every played game with its result, qualifiers included (only main-stage games are read player by player)
    rows = [
        {
            "id": g["id"],
            "date": when(g["date"]),
            "availableAt": when(g["date"]) + timedelta(hours=3),
            "home": g["home"]["slug"],
            "away": g["away"]["slug"],
            "hg": int(g["homeGoals"]),
            "ag": int(g["awayGoals"]),
            "neutral": False,
        }
        for g in games
        if g.get("homeGoals") is not None and g.get("awayGoals") is not None
    ]
    history = pd.DataFrame(rows)
    fits: dict[datetime, Any] = {}
    found: dict[str, tuple[keeper.GameNumbers, keeper.GameNumbers]] = {}
    for g in games:
        lock = cutoff_for(when(g["date"]))
        if lock not in fits:
            try:
                fits[lock] = european_model.fit(history, lock)
            except ValueError:
                fits[lock] = None
        model = fits[lock]
        if model is None:
            continue
        home, away = g["home"]["slug"], g["away"]["slug"]
        if home not in model.teams or away not in model.teams:
            continue  # a club with no European result in the last two years: the board has no number either
        p = model.predict([home], [away], neutral=[False]).iloc[0]
        found[g["id"]] = (
            keeper.GameNumbers(float(p["cs_h"]), float(p["lam_a"]), float(p["lam_h"])),
            keeper.GameNumbers(float(p["cs_a"]), float(p["lam_h"]), float(p["lam_a"])),
        )
    return found


def build(codes: list[str], numbers: dict[str, dict[str, tuple[keeper.GameNumbers, keeper.GameNumbers]]]) -> list[Case]:
    """Cases of `codes`, with every exported competition feeding the players' histories."""
    games = sorted((g for c in SLUGS for g in read(SLUGS[c])), key=lambda g: (g["date"], g["id"]))
    history: dict[str, list[dict[str, Any]]] = defaultdict(list)
    code_of = {slug: code for code, slug in SLUGS.items()}
    result = []
    for game in games:
        code = code_of[game["competition"]]
        at = when(game["date"])
        lock = cutoff_for(at)
        pair = numbers.get(code, {}).get(game["id"])
        for player, row in game["players"].items():
            if (
                row.get("played") is not True
                or type(row.get("started")) is not bool
                or row.get("score") is None
                or row.get("ver") != 7
                or row.get("pos") not in sofix_v1.POSITIONS
            ):
                continue
            home = row["team"] == game["home"]["slug"]
            if code in codes and not (code in EUROPE and at.month in (7, 8)):  # qualifiers: no live xScore
                result.append(
                    Case(
                        code,
                        game["id"],
                        player,
                        lock,
                        at,
                        row["pos"],
                        home,
                        (pair[0] if home else pair[1]) if pair else None,
                        history[player][::-1],
                        float(row["score"]),
                        float(row.get("level") or 0) >= 60,
                        "start" if row["started"] else "bench",
                        float(row.get("level") or 0),
                    )
                )
        for player, row in game["players"].items():
            if row.get("played") is True and type(row.get("started")) is bool and row.get("score") is not None:
                history[player].append(
                    {
                        "date": game["date"],
                        "at": at,
                        "competition": game["competition"],
                        "played": True,
                        "started": row["started"],
                        "score": row["score"],
                        "mins": row.get("mins"),
                        "status": "FINAL",
                    }
                )
    return result


def past(case: Case, scope: str) -> list[dict[str, Any]]:
    """His settled appearances in the 70 days before the lock: in this competition only ("own") or in any ("all"); a scope
    ending in a number of days ("own180") reaches back that far instead."""
    slug = SLUGS[case.comp]
    days = "".join(ch for ch in scope if ch.isdigit())
    window = timedelta(days=int(days)) if days else sofix_v1.WINDOW
    first, last = case.lock - window, case.lock - sofix_v1.DELAY
    mine = scope.startswith("own")
    return [g for g in case.history if first <= g["at"] < last and (not mine or g["competition"] == slug)]


def trees(
    train: list[Case], scope: str, *, plain: bool = False, shape: tuple[int, int, int] = (36, 5, 30)
) -> sofix_v1.Model:
    """sofix_v1_release.fit with its shape as a parameter (trees, depth, leaf); `plain` fits on ordinary games only (level 35,
    LaLiga test 31), whose distribution then has no decisive part."""
    from sklearn.ensemble import ExtraTreesRegressor

    packed: dict[str, Any] = {}
    for role in ("start", "bench"):
        ordinary = plain and role == "start"  # LaLiga test 32: substitutes keep v1's fit
        group = [c for c in train if c.role == role and c.numbers is not None and (not ordinary or c.level == 35)]
        x = np.array([sofix_v1.features(c.pos, c.home, c.numbers, past(c, scope)) for c in group if c.numbers])
        y = np.array([c.score for c in group])
        bins = np.rint(y).astype(int) + 101 * np.array([c.decisive for c in group])
        n, depth, leaf = shape if role == "start" else (36, 5, 30)
        forest = ExtraTreesRegressor(n_estimators=n, max_depth=depth, min_samples_leaf=leaf, random_state=26, n_jobs=4)
        forest.fit(x, y)
        role_trees = []
        for estimator in forest.estimators_:
            tree, leaves, nodes = estimator.tree_, estimator.apply(x), []
            for i in range(tree.node_count):
                if tree.children_left[i] < 0:
                    values, counts = np.unique(bins[leaves == i], return_counts=True)
                    nodes.append([values.tolist(), counts.tolist()])
                else:
                    nodes.append(
                        [
                            int(tree.feature[i]),
                            float(tree.threshold[i]),
                            int(tree.children_left[i]),
                            int(tree.children_right[i]),
                        ]
                    )
            role_trees.append(nodes)
        packed[role] = role_trees
    return sofix_v1.Model(packed)


def artifact(code: str, cases: list[Case]) -> dict[str, Any]:
    """Fitted on every case of the competition (the release, like sofix_v1_release.main); answers only later locks."""
    mine = [c for c in cases if c.comp == code]
    model = trees(mine, "own")
    point = trees(mine, "own", plain=True)
    return {
        "code": code,
        "competition": SLUGS[code],
        "version": f"{sofix_v1.VERSION} {code}",
        "trainedThrough": (max(c.when for c in mine) + sofix_v1.DELAY).isoformat(),
        "cases": {role: sum(1 for c in mine if c.role == role and c.numbers) for role in ("start", "bench")},
        "trees": {**model.trees, "point": point.trees["start"]},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("codes", nargs="+", choices=[c for c in SLUGS if c != "LL"])
    args = parser.parse_args()
    numbers = {c: domestic_numbers(c, read(SLUGS[c])) for c in args.codes if c in DOMESTIC}
    if any(c in EUROPE for c in args.codes):
        shared = european_numbers()
        numbers.update({c: shared for c in args.codes if c in EUROPE})
    cases = build(args.codes, numbers)
    sofix_v1.COMPETITION_ARTIFACTS.mkdir(exist_ok=True)
    for code in args.codes:
        data = artifact(code, cases)
        body = json.dumps(data, separators=(",", ":")).encode()
        (sofix_v1.COMPETITION_ARTIFACTS / f"{code}.json.gz").write_bytes(gzip.compress(body, mtime=0))
        print(code, data["version"], data["trainedThrough"], data["cases"], flush=True)


if __name__ == "__main__":
    main()
