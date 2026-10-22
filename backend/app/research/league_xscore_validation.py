"""Independent held-out xScore validation. No production model is enabled here."""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.backtest.data import normalize_season
from app.modeling.dixon_coles import fit_dixon_coles
from app.research.league_xscore_data import PROTOCOL, eligible_calendar, validate_game, when
from app.research.league_xscore_identity import club_name
from app.services.league_fdr import FL1_ADMIN, LEAGUES, REFERENCE
from app.sorare import keeper, outfield
from app.sources.football_data_co_uk import cached_path, fetch_season_csv

POSITIONS = ("GK", "DEF", "MID", "FWD")
ADMIN = {("2024-12-14", "Union Berlin", "Bochum"), ("2022-03-18", "Bochum", "M'gladbach")}

TRAINING_GAP = ("2024-03-13", "Bournemouth", "Luton")
EVALUATION_PROTOCOL = {
    **PROTOCOL,
    "version": 2,
    "trainingSourceAmendment": "Frozen before PL holdout metrics: exclude only Bournemouth-Luton 2024-03-13 from player-outcome training, after competition, club and both preceding starting goalkeepers' fully paged histories omit it. Retain its real result in football-model history. No holdout or current-squad exclusions; candidate, comparators and accuracy gates unchanged. BL1 cohort unchanged.",
}


FL1_TRAINING_GAPS = (
    ("2023-09-16", "Lens", "Metz"),
    ("2023-10-07", "Metz", "Nice"),
    ("2023-10-22", "Monaco", "Metz"),
    ("2023-10-29", "Metz", "Le Havre"),
    ("2023-11-29", "Montpellier", "Clermont"),
    ("2023-12-20", "Paris SG", "Metz"),
)


def protocol_for(code: str) -> dict[str, Any]:
    if code != "FL1":
        return EVALUATION_PROTOCOL
    return {
        **PROTOCOL,
        "version": 3,
        "competition": "FL1",
        "releaseGate": "Ligue 1 independently: >=100 holdout starts per position, RMSE difference CI upper <0 against form and no-FDR ablation, no position RMSE loss, no loss in within-7 or pair ordering",
        "administrativeExclusions": [list(row) for row in FL1_ADMIN],
        "trainingSourceExclusions": [list(row) for row in FL1_TRAINING_GAPS],
        "sourceIdentityRule": "Ignore disabled score identities outside both official elevens; require all 22 authoritative starters. Training source exceptions approved by owner before metrics; retain their results in FDR history.",
        "eligibility": "Two documented interrupted fixtures excluded before holdout metrics; owner approved Nantes-Toulouse holdout exclusion. All 305 completed holdout games and every current squad remain required.",
    }


def documented_training_gap(audit: dict[str, Any]) -> bool:
    if audit.get("missingAfter") != 1 or audit.get("errors") or len(audit.get("missingFixtures") or []) != 1:
        return False
    gap = audit["missingFixtures"][0]
    if (str(gap.get("date", ""))[:10], gap.get("home"), gap.get("away")) != TRAINING_GAP:
        return False

    def empty(check: dict[str, Any]) -> bool:
        variables = check.get("variables") or {}
        return (
            check.get("games") == []
            and (check.get("pageInfo") or {}).get("hasNextPage") is False
            and variables.get("from") == "2024-03-12T12:00:00Z"
            and variables.get("to") == "2024-03-14T12:00:00Z"
        )

    clubs = [
        c
        for c in audit.get("clubChecks") or []
        if empty(c) and c["variables"].get("club") == "afc-bournemouth-bournemouth-dorset"
    ]
    players = {c["variables"].get("player") for c in audit.get("playerChecks") or [] if empty(c)}
    return bool(clubs) and players == {"norberto-murara-neto", "thomas-kaminski"}


def documented_fl1_gap(audit: dict[str, Any]) -> bool:
    """The single missing training replay, with all four bounded source paths retained."""
    if audit.get("missingAfter") != 1 or audit.get("errors"):
        return False
    missing = audit.get("missingFixtures") or []
    if len(missing) != 1 or (missing[0]["date"][:10], missing[0]["home"], missing[0]["away"]) != (
        "2023-11-29",
        "Montpellier",
        "Clermont",
    ):
        return False
    checks = (audit.get("clubChecks") or []) + (audit.get("playerChecks") or [])
    return (
        len(checks) == 3
        and all(not c.get("games") and not (c.get("pageInfo") or {}).get("hasNextPage") for c in checks)
        and {c["variables"].get("player") for c in audit["playerChecks"]} == {"benjamin-lecomte", "mory-diaw"}
    )


def window_for(date: str, windows: list[dict[str, str]]) -> tuple[str, datetime]:
    at = when(date)
    found = [w for w in windows if when(w["startDate"]) <= at < when(w["endDate"])]
    if len(found) != 1 or when(found[0]["cutOffDate"]) > at:
        raise ValueError("Missing or ambiguous actual Sorare cutoff")
    return found[0]["slug"], when(found[0]["cutOffDate"])


def fit_before(history: pd.DataFrame, cutoff: datetime, teams: list[str]) -> Any:
    # CSV rows have dates, not reliable publication timestamps: leave the entire lock day out.
    before = pd.Timestamp(cutoff.date())
    prior = history[history["date"] < before].copy()
    return fit_dixon_coles(prior, before, teams=teams, config=REFERENCE)


def form_before(history: list[tuple[datetime, float, bool]], cutoff: datetime) -> tuple[float, float, float]:
    rows = sorted((r for r in history if cutoff - timedelta(days=70) <= r[0] < cutoff), reverse=True)
    dec, mean = outfield.own_record([row[1] for row in rows])
    last = rows[:5]
    baseline = (sum(r[1] for r in last) + 2 * 51) / (len(last) + 2)
    return dec, mean, baseline


def load_games(root: Path, code: str) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    folder = root / code
    coverage = json.loads((folder / "coverage.json").read_text("utf-8"))
    protocol_hash = hashlib.sha256(json.dumps(PROTOCOL, sort_keys=True).encode()).hexdigest()
    audit = (
        json.loads((folder / "index-reconciliation.json").read_text("utf-8"))
        if (folder / "index-reconciliation.json").exists()
        else {}
    )
    exception = (
        code == "PL"
        and documented_training_gap(audit)
        and coverage.get("expected") == 1139
        and coverage.get("saved") == 1139
        and not coverage.get("failed")
    )
    if code == "FL1":
        exception = (
            documented_fl1_gap(audit)
            and coverage.get("expected") == coverage.get("saved") in (915, 916)
            and not coverage.get("failed")
        )
    if (not coverage.get("complete") and not exception) or coverage.get("protocolSha256") != protocol_hash:
        raise ValueError("Incomplete collection or changed frozen collection protocol")
    expected = json.loads((folder / "games.json").read_text("utf-8"))
    games = []
    for fixture in expected:
        path = folder / (hashlib.sha256(fixture["id"].encode()).hexdigest() + ".json")
        saved = json.loads(path.read_text("utf-8"))
        games.append(validate_game(code, fixture, saved["raw"], when(saved["readAt"])))
    windows = json.loads((folder / "windows.json").read_text("utf-8"))
    return games, windows


def _eleven(value: Any) -> set[str]:
    if isinstance(value, list):
        return set().union(*(_eleven(row) for row in value)) if value else set()
    return {value["slug"]} if isinstance(value, dict) and value.get("slug") else set()


def clean_label(player: dict[str, Any]) -> bool | None:
    value = player.get("cleanSheet60")
    if value in (0, 1):
        return bool(value)
    minutes, conceded = player.get("mins"), player.get("goalsConceded")
    if minutes is not None and minutes < 60:
        return False
    if minutes is not None and minutes >= 60 and conceded is not None and conceded >= 0:
        return conceded == 0
    return None


def prepare(
    code: str, games: list[dict[str, Any]], windows: list[dict[str, str]], history: pd.DataFrame
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    known = set(history["home"]) | set(history["away"])
    issues: list[dict[str, Any]] = []
    joined: list[dict[str, Any]] = []
    used: set[int] = set()
    excluded = []
    source_excluded = []
    clubs: dict[str, str] = {}
    for saved in games:
        raw = saved["raw"]
        try:
            home, away = club_name(raw["homeTeam"], known), club_name(raw["awayTeam"], known)
            day = when(raw["date"]).date().isoformat()
            if (code == "BL1" and (day, home, away) in ADMIN) or (code == "FL1" and (day, home, away) in FL1_ADMIN):
                excluded.append(raw["id"])
                continue
            if code == "FL1" and (day, home, away) in FL1_TRAINING_GAPS:
                source_excluded.append(raw["id"])
                continue
            if raw.get("statusTyped") != "played":
                raise ValueError("Unsettled historical game status")
            possible = history[
                (history["home"] == home)
                & (history["away"] == away)
                & ((history["date"] - pd.Timestamp(day)).abs() <= pd.Timedelta(days=1))
            ]
            if len(possible) != 1:
                raise ValueError(f"No unique CSV fixture for {home} / {away} at {day}")
            index = int(possible.index[0])
            match = possible.iloc[0]
            if index in used or raw.get("homeGoals") != int(match["hg"]) or raw.get("awayGoals") != int(match["ag"]):
                raise ValueError(f"Duplicate fixture or result disagreement: {home} / {away} at {day}")
            week, lock = window_for(raw["date"], windows)
            starters = []
            expected_xi: set[str] = set()
            for side in ("home", "away"):
                formation = raw.get(f"{side}Formation") or {}
                xi = _eleven(formation.get("startingLineup"))
                if not formation.get("startingLineupAvailable") or len(xi) != 11:
                    raise ValueError("Missing authoritative starting XI")
                expected_xi |= xi
            for p in saved["players"]:
                if p.get("started") is not True:
                    continue
                if code == "FL1" and p["slug"].endswith("-disabled") and p["slug"] not in expected_xi:
                    continue
                if p.get("pos") == "GK" and clean_label(p) is None:
                    raise ValueError("Unknown goalkeeper playing-period clean sheet")
                if (
                    p.get("played") is not True
                    or p.get("ver") != 7
                    or str(p.get("status")).upper() != "FINAL"
                    or p.get("score") is None
                    or p.get("level") is None
                    or p.get("pos") not in POSITIONS
                    or p.get("team") not in (raw["homeTeam"]["slug"], raw["awayTeam"]["slug"])
                    or not 0 <= float(p["score"]) <= 100
                ):
                    raise ValueError("Unknown/invalid starter score, role, version or playing side")
                starters.append(p)
            if {p["slug"] for p in starters} != expected_xi or len(starters) != 22:
                raise ValueError("Starter scores do not cover both official elevens")
            used.add(index)
            for side, name in (("home", home), ("away", away)):
                slug = raw[f"{side}Team"]["slug"]
                if slug in clubs and clubs[slug] != name:
                    raise ValueError("A source club has conflicting canonical identities")
                clubs[slug] = name
            joined.append(
                {
                    "raw": raw,
                    "home": home,
                    "away": away,
                    "season": int(match["season_start"]),
                    "week": week,
                    "lock": lock,
                    "players": starters,
                }
            )
        except (ValueError, KeyError, TypeError) as error:
            issues.append({"game": raw.get("id"), "reason": str(error)})
    wanted = history[history["season_start"].isin([2023, 2024, 2025])]
    expected_raw = len(wanted)
    training_exclusions = []
    if code == "PL":
        day, home, away = TRAINING_GAP
        omitted = (wanted["date"] == pd.Timestamp(day)) & (wanted["home"] == home) & (wanted["away"] == away)
        if omitted.any():
            training_exclusions = [
                {
                    "date": day,
                    "home": home,
                    "away": away,
                    "reason": "No game returned by four documented source paths; training only, protocol v2",
                }
            ]
            wanted = wanted[~omitted]
    if code == "BL1":
        for day, home, away in ADMIN:
            wanted = wanted[
                ~((wanted["date"] == pd.Timestamp(day)) & (wanted["home"] == home) & (wanted["away"] == away))
            ]
            history = history[
                ~((history["date"] == pd.Timestamp(day)) & (history["home"] == home) & (history["away"] == away))
            ]
    if code == "FL1":
        wanted = eligible_calendar(code, wanted)
        history = eligible_calendar(code, history)
        for day, home, away in FL1_TRAINING_GAPS:
            wanted = wanted[
                ~((wanted["date"] == pd.Timestamp(day)) & (wanted["home"] == home) & (wanted["away"] == away))
            ]
            training_exclusions.append(
                {
                    "date": day,
                    "home": home,
                    "away": away,
                    "reason": "Owner-approved source gap before metrics; retained official result in FDR history",
                }
            )
    missing = wanted.loc[~wanted.index.isin(used), ["date", "home", "away"]].copy()
    missing["date"] = missing["date"].astype(str)
    coverage = {
        "competition": code,
        "rawCalendarGames": expected_raw,
        "trainingSourceExclusions": training_exclusions,
        "expectedGames": len(wanted),
        "sourceGames": len(games),
        "joinedGames": len(joined),
        "excludedAdministrative": excluded,
        "excludedSourceGames": source_excluded,
        "issues": issues,
        "missingCsv": missing.to_dict("records"),
        "clubs": clubs,
    }
    coverage["complete"] = not issues and missing.empty and len(joined) == len(wanted)
    models = {}
    own: dict[str, list[tuple[datetime, float, bool]]] = defaultdict(list)
    for game in joined:
        for p in game["players"]:
            own[p["slug"]].append((when(game["raw"]["date"]), float(p["score"]), float(p["level"]) >= 60))
    rows = []
    for i, game in enumerate(sorted(joined, key=lambda g: g["raw"]["date"])):
        key = game["week"], game["season"]
        if key not in models:
            season_rows = history[history["season_start"] == game["season"]]
            teams = sorted(set(season_rows["home"]) | set(season_rows["away"]))
            models[key] = fit_before(history, game["lock"], teams)
        prediction = models[key].predict([game["home"]], [game["away"]]).iloc[0]
        raw = game["raw"]
        for p in game["players"]:
            at_home = p["team"] == raw["homeTeam"]["slug"]
            dec, mean, baseline = form_before(own[p["slug"]], game["lock"])
            numbers = keeper.GameNumbers(
                float(prediction["cs_h" if at_home else "cs_a"]),
                float(prediction["lam_a" if at_home else "lam_h"]),
                float(prediction["lam_h" if at_home else "lam_a"]),
            )
            rows.append(
                {
                    "game": raw["id"],
                    "week": game["week"],
                    "date": when(raw["date"]),
                    "player": p["slug"],
                    "season": game["season"],
                    "pos": p["pos"],
                    "score": float(p["score"]),
                    "decisive": float(p["level"]) >= 60,
                    "clean": clean_label(p) if p["pos"] == "GK" else raw["awayGoals" if at_home else "homeGoals"] == 0,
                    "home": at_home,
                    "numbers": numbers,
                    "own_dec": dec,
                    "own_score": mean,
                    "baseline": baseline,
                }
            )
        if i % 100 == 0:
            print(f"{code}: FDR before actual cutoffs for {i + 1}/{len(joined)} games", flush=True)
    return rows, coverage


def compare(
    actual: np.ndarray, model: np.ndarray, baseline: np.ndarray, weeks: list[str], *, draws: int = 2000
) -> dict[str, float]:
    groups = sorted(set(weeks))
    summed = np.array(
        [
            [
                float(((model[[w == g for w in weeks]] - actual[[w == g for w in weeks]]) ** 2).sum()),
                float(((baseline[[w == g for w in weeks]] - actual[[w == g for w in weeks]]) ** 2).sum()),
                weeks.count(g),
            ]
            for g in groups
        ]
    )
    rng = np.random.default_rng(PROTOCOL["bootstrapSeed"])
    picked = rng.integers(0, len(groups), size=(draws, len(groups)))
    resampled = summed[picked].sum(axis=1)
    diffs = np.sqrt(resampled[:, 0] / resampled[:, 2]) - np.sqrt(resampled[:, 1] / resampled[:, 2])
    return {
        "difference": float(np.sqrt(np.mean((model - actual) ** 2)) - np.sqrt(np.mean((baseline - actual) ** 2))),
        "lo": float(np.quantile(diffs, 0.025)),
        "hi": float(np.quantile(diffs, 0.975)),
        "weeks": len(groups),
    }


def pair_accuracy(rows: list[dict[str, Any]], predicted: np.ndarray) -> float:
    groups: dict[tuple[str, str], list[int]] = defaultdict(list)
    for i, row in enumerate(rows):
        groups[row["game"], row["pos"]].append(i)
    good = total = 0.0
    for indices in groups.values():
        for k, a in enumerate(indices):
            for b in indices[k + 1 :]:
                actual = rows[a]["score"] - rows[b]["score"]
                if actual == 0:
                    continue
                margin = predicted[a] - predicted[b]
                good += 0.5 if margin == 0 else float(margin * actual > 0)
                total += 1
    return good / total if total else 0.0


def metrics(rows: list[dict[str, Any]], prediction: np.ndarray) -> dict[str, float]:
    error = prediction - np.array([r["score"] for r in rows])
    return {
        "rmse": float(np.sqrt(np.mean(error**2))),
        "mae": float(np.abs(error).mean()),
        "within7": float((np.abs(error) <= 7).mean()),
        "pairs": pair_accuracy(rows, prediction),
    }


def release_reasons(result: dict[str, Any]) -> list[str]:
    reasons = []
    if not result["coverageComplete"]:
        reasons.append("Source/score/version/fixture coverage is incomplete")
    if not np.isfinite(result["versusForm"]["hi"]) or result["versusForm"]["hi"] >= 0:
        reasons.append("RMSE improvement over form is not established")
    if not np.isfinite(result["versusAblation"]["hi"]) or result["versusAblation"]["hi"] >= 0:
        reasons.append("FDR adds no established RMSE improvement over player history")
    for pos in POSITIONS:
        p = result["positions"].get(pos, {})
        if (
            p.get("cases", 0) < 100
            or not np.isfinite(p.get("rmse", float("inf")))
            or p.get("rmse", float("inf")) > p.get("formRmse", 0)
        ):
            reasons.append(f"{pos}: too few cases or a position RMSE loss")
    for name in ("within7", "pairs"):
        if (
            not np.isfinite(result["model"][name])
            or not np.isfinite(result["form"][name])
            or result["model"][name] < result["form"][name]
        ):
            reasons.append(f"{name}: loss versus form")
    return reasons


def evaluate(rows: list[dict[str, Any]], coverage: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    training = [r for r in rows if r["season"] in (2023, 2024)]
    testing = [r for r in rows if r["season"] == 2025]
    if not training or not testing:
        raise ValueError("Training or untouched holdout is empty")
    ks = [
        keeper.Start(r["week"], r["date"], r["player"], r["numbers"], None, r["score"], r["decisive"], r["clean"])
        for r in training
        if r["pos"] == "GK"
    ]
    os = [
        outfield.OutfieldStart(
            r["week"],
            r["date"],
            r["player"],
            r["pos"],
            r["numbers"],
            r["home"],
            None,
            r["own_dec"],
            r["own_score"],
            r["score"],
            r["decisive"],
        )
        for r in training
        if r["pos"] != "GK"
    ]
    km = keeper.fit(ks, through="2025-06-30")
    om = outfield.fit_all(os, through="2025-06-30")
    if km is None or set(om) != set(outfield.POSITIONS):
        raise ValueError("Insufficient independent training starts")
    # Same estimator/penalty and own-record features, with the FDR features removed.
    ablation = {}
    means = {}
    for pos in POSITIONS:
        mine = [r for r in training if r["pos"] == pos]
        means[pos] = float(np.mean([r["score"] for r in mine]))
        if pos != "GK":
            X = np.array([[1.0, float(r["home"]), r["own_dec"], r["own_score"]] for r in mine])
            penalty = np.eye(4) * outfield.RIDGE
            penalty[0, 0] = 0
            ablation[pos] = np.linalg.solve(X.T @ X + penalty, X.T @ np.array([r["score"] for r in mine]))
    model = np.array(
        [
            km.predict(r["numbers"], None).start
            if r["pos"] == "GK"
            else om[r["pos"]].predict(r["numbers"], r["home"], r["own_dec"], r["own_score"], None)
            for r in testing
        ]
    )
    bare = np.array(
        [
            means["GK"]
            if r["pos"] == "GK"
            else float(
                np.clip(np.dot(ablation[r["pos"]], [1.0, float(r["home"]), r["own_dec"], r["own_score"]]), 0, 100)
            )
            for r in testing
        ]
    )
    actual = np.array([r["score"] for r in testing])
    form = np.array([r["baseline"] for r in testing])
    weeks = [r["week"] for r in testing]
    result = {
        "protocol": protocol_for(coverage.get("competition", "")),
        "runnerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "caseSha256": hashlib.sha256(
            json.dumps([(r["game"], r["player"], r["pos"], r["score"]) for r in testing], sort_keys=True).encode()
        ).hexdigest(),
        "footballConfig": dataclasses.asdict(REFERENCE),
        "coverageComplete": coverage["complete"],
        "coverage": coverage,
        "cases": len(testing),
        "model": metrics(testing, model),
        "form": metrics(testing, form),
        "ablation": metrics(testing, bare),
        "positionMean": metrics(testing, np.array([means[r["pos"]] for r in testing])),
        "versusForm": compare(actual, model, form, weeks),
        "versusAblation": compare(actual, model, bare, weeks),
        "positions": {},
    }
    for pos in POSITIONS:
        indices = np.array([r["pos"] == pos for r in testing])
        result["positions"][pos] = {
            "cases": int(indices.sum()),
            "rmse": float(np.sqrt(np.mean((model[indices] - actual[indices]) ** 2))),
            "formRmse": float(np.sqrt(np.mean((form[indices] - actual[indices]) ** 2))),
        }
    result["rejectedBecause"] = release_reasons(result)
    result["passed"] = not result["rejectedBecause"]
    artifact = {
        "keeper": dataclasses.asdict(km),
        "outfield": {p: dataclasses.asdict(m) for p, m in om.items()},
        "trainingThrough": "2025-06-30",
        "validated": result["passed"],
        "clubs": coverage["clubs"],
        "protocol": protocol_for(coverage.get("competition", "")),
    }
    return result, artifact


def fingerprints(folder: Path, history_files: list[Path]) -> dict[str, str]:
    """Bind the report to retained source bytes, CSVs and literal identity rules."""

    def digest(paths: list[Path]) -> str:
        h = hashlib.sha256()
        for path in sorted(paths):
            h.update(path.name.encode())
            h.update(hashlib.sha256(path.read_bytes()).digest())
        return h.hexdigest()

    derived = {"alignment.json", "validation.json", "candidate.json"}
    return {
        "sourceSha256": digest([p for p in folder.glob("*.json") if p.name not in derived]),
        "historySha256": digest(history_files),
        "identitySha256": digest(
            [
                Path(__file__).with_name("league_xscore_identity.py"),
                Path(__file__).parents[1] / "services/league_fdr.py",
            ]
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--league", choices=LEAGUES, required=True)
    parser.add_argument("--root", type=Path, default=Path("data/raw/league-xscore"))
    parser.add_argument("--cache", type=Path, default=Path("data/raw/football-data-co-uk"))
    args = parser.parse_args()
    games, windows = load_games(args.root, args.league)
    division = LEAGUES[args.league][1]
    history = pd.concat(
        [
            normalize_season(fetch_season_csv(year, args.cache, division, refresh=False), year)
            for year in range(2021, 2026)
        ],
        ignore_index=True,
    )
    rows, coverage = prepare(args.league, games, windows, history)
    folder = args.root / args.league
    (folder / "alignment.json").write_text(json.dumps(coverage, indent=2), encoding="utf-8")
    if not rows or not coverage["complete"]:
        raise ValueError("Incomplete source alignment; inspect alignment.json. Holdout metrics remain unopened")
    evidence = fingerprints(folder, [cached_path(y, args.cache, division) for y in range(2021, 2026)])
    result, artifact = evaluate(rows, coverage)
    result.update(evidence)
    result["competition"] = args.league
    artifact["evidence"] = result
    (folder / "validation.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    (folder / "candidate.json").write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
