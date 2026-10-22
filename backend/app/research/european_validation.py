"""Fixed European replay; feature preparation is separate from accuracy evaluation.

Never registers or promotes a production model. All three calendars must pass the
source gate before any competition's held-out metrics are evaluated.
"""

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

from app.modeling.dixon_coles import outcome_table
from app.research.european_cases import EXPECTED, TRAINING_EXCEPTIONS, digest, read
from app.research.european_model import CONFIG, fit
from app.research.league_xscore_data import when
from app.research.league_xscore_validation import POSITIONS, clean_label, metrics, release_reasons
from app.sorare import keeper, outfield

SEED = 20261023
DRAWS = 2000


def dependencies() -> dict[str, str]:
    app = Path(__file__).parents[1]
    names = [
        "research/european_alignment.py",
        "research/european_cases.py",
        "research/european_facts.py",
        "research/european_metadata.py",
        "research/european_model.py",
        "research/european_validation.py",
        "research/league_xscore_validation.py",
        "modeling/dixon_coles.py",
        "sorare/keeper.py",
        "sorare/outfield.py",
    ]
    return {name: hashlib.sha256((app / name).read_bytes()).hexdigest() for name in names}


def own_before(history: list[tuple[datetime, datetime, float]], cutoff: datetime) -> tuple[float, float, float, int]:
    starts = sorted(
        (r for r in history if cutoff - timedelta(days=70) <= r[0] < cutoff and r[1] < cutoff), reverse=True
    )
    scores = [r[2] for r in starts]
    decisive, mean = outfield.own_record(scores)
    return decisive, mean, (sum(scores[:5]) + 102) / (len(scores[:5]) + 2), len(scores)


def comparison(
    actual: np.ndarray, model: np.ndarray, baseline: np.ndarray, weeks: list[str], *, squared: bool = True
) -> dict[str, Any]:
    groups = sorted(set(weeks))
    if not groups or not (len(actual) == len(model) == len(baseline) == len(weeks)):
        raise ValueError("Empty or unpaired bootstrap cases")
    left, right = ((model - actual) ** 2, (baseline - actual) ** 2) if squared else (model, baseline)
    blocks = []
    for group in groups:
        mask = np.array([w == group for w in weeks])
        blocks.append([float(left[mask].sum()), float(right[mask].sum()), int(mask.sum())])
    summed = np.array(blocks)
    picked = np.random.default_rng(SEED).integers(0, len(groups), size=(DRAWS, len(groups)))
    samples = summed[picked].sum(axis=1)
    means = samples[:, :2] / samples[:, 2, None]
    difference = np.sqrt(means[:, 0]) - np.sqrt(means[:, 1]) if squared else means[:, 0] - means[:, 1]
    point = np.sqrt(left.mean()) - np.sqrt(right.mean()) if squared else left.mean() - right.mean()
    return {
        "difference": float(point),
        "lo": float(np.quantile(difference, 0.025)),
        "hi": float(np.quantile(difference, 0.975)),
        "weeks": len(groups),
        "draws": DRAWS,
        "seed": SEED,
    }


def probability_rows(probability: np.ndarray, outcome: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if (
        probability.shape != (len(outcome), 3)
        or not np.isfinite(probability).all()
        or (probability < 0).any()
        or not np.allclose(probability.sum(axis=1), 1)
    ):
        raise ValueError("Invalid ordered outcome probabilities")
    actual = np.eye(3)[outcome]
    rps = np.square(np.cumsum(probability, axis=1)[:, :2] - np.cumsum(actual, axis=1)[:, :2]).mean(axis=1)
    brier = np.square(probability - actual).sum(axis=1)
    loss = -np.log(np.clip(probability[np.arange(len(outcome)), outcome], 1e-15, 1))
    return rps, brier, loss


def football_metrics(probability: np.ndarray, outcome: np.ndarray) -> dict[str, float]:
    rps, brier, loss = probability_rows(probability, outcome)
    return {"rps": float(rps.mean()), "brier": float(brier.mean()), "logLoss": float(loss.mean())}


def coverage_gate(cases: dict[str, Any]) -> None:
    frozen = {k: v for k, v in cases.items() if k != "caseSha256"}
    if digest(frozen) != cases.get("caseSha256"):
        raise ValueError("Changed frozen case packet")
    protocol = hashlib.sha256(Path("../plans/european-model-validation.md").read_bytes()).hexdigest()
    if protocol != cases["protocolSha256"]:
        raise ValueError("Validation protocol changed after case preparation")
    for code, seasons in EXPECTED.items():
        for season, expected in seasons.items():
            games = [g for g in cases["games"] if g["competition"] == code and g["season"] == season]
            excluded = len(TRAINING_EXCEPTIONS.get((code, season), set()))
            football = [g for g in cases["football"] if g["competition"] == code and g["season"] == season]
            if (
                len(games) != expected - excluded
                or len(football) != expected
                or any(len(g["players"]) != 22 for g in games)
            ):
                raise ValueError(f"Incomplete mandatory European cases {code}/{season}")
    if len({(g["sorareId"], p["slug"]) for g in cases["games"] for p in g["players"]}) != 22 * len(cases["games"]):
        raise ValueError("Repeated cross-competition player-game case")


def features(cases: dict[str, Any]) -> dict[str, Any]:
    coverage_gate(cases)
    history = pd.DataFrame(cases["football"])
    own: dict[str, list[tuple[datetime, datetime, float]]] = defaultdict(list)
    for game in cases["games"]:
        for p in game["players"]:
            own[p["slug"]].append((when(game["date"]), when(game["availableAt"]), float(p["score"])))
    games_by_id = {(g["competition"], g["id"]): g for g in cases["games"]}
    targets = [r for r in cases["football"] if r["season"] >= 2023]
    by_lock: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in targets:
        by_lock[row["lock"]].append(row)
    players, forecasts = [], []
    for i, (lock, group) in enumerate(sorted(by_lock.items())):
        cutoff = when(lock)
        teams = {r[s] for r in group for s in ("home", "away")}
        model = fit(history, cutoff, teams=teams)
        predictions = model.predict(
            [r["home"] for r in group], [r["away"] for r in group], neutral=[r["neutral"] for r in group]
        )
        prior = history[
            (pd.to_datetime(history["date"], utc=True) < cutoff)
            & (pd.to_datetime(history["availableAt"], utc=True) < cutoff)
            & (pd.to_datetime(history["date"], utc=True) >= cutoff - timedelta(days=730))
        ]
        for (_, prediction), row in zip(predictions.iterrows(), group, strict=True):
            comp_prior = prior[prior["competition"] == row["competition"]]
            outcomes = np.where(
                comp_prior["hg"] > comp_prior["ag"], 0, np.where(comp_prior["hg"] == comp_prior["ag"], 1, 2)
            )
            base = (np.bincount(outcomes, minlength=3) + 1) / (len(outcomes) + 3)
            lh, la = max(float(comp_prior["hg"].mean()), 0.1), max(float(comp_prior["ag"].mean()), 0.1)
            if row["neutral"]:
                lh = la = (lh + la) / 2
            plain = outcome_table([lh], [la], 0.0, CONFIG.max_goals).iloc[0]
            cold = any(int(((prior["home"] == row[s]) | (prior["away"] == row[s])).sum()) < 5 for s in ("home", "away"))
            forecasts.append(
                {
                    "id": row["id"],
                    "competition": row["competition"],
                    "season": row["season"],
                    "date": row["date"],
                    "lock": lock,
                    "week": when(row["date"]).strftime("%G-W%V"),
                    "neutral": row["neutral"],
                    "phase": row["phase"],
                    "leg": row["leg"],
                    "cold": cold,
                    "hg": row["hg"],
                    "ag": row["ag"],
                    "base": base.tolist(),
                    "plain": [float(plain[k]) for k in ("p_h", "p_d", "p_a")],
                    **{k: float(prediction[k]) for k in ("p_h", "p_d", "p_a", "lam_h", "lam_a", "cs_h", "cs_a")},
                }
            )
            game = games_by_id.get((row["competition"], row["id"]))
            if game is None:
                continue  # Only the ten explicitly approved training-source exceptions.
            for p in game["players"]:
                at_home = p["team"] == game["homeSlug"]
                dec, mean, baseline, own_starts = own_before(own[p["slug"]], cutoff)
                numbers = {
                    "cs": float(prediction["cs_h" if at_home else "cs_a"]),
                    "xga": float(prediction["lam_a" if at_home else "lam_h"]),
                    "xgf": float(prediction["lam_h" if at_home else "lam_a"]),
                }
                players.append(
                    {
                        "game": game["sorareId"],
                        "player": p["slug"],
                        "competition": row["competition"],
                        "season": row["season"],
                        "week": game["week"],
                        "date": game["sourceDate"],
                        "pos": p["pos"],
                        "score": float(p["score"]),
                        "decisive": float(p["level"]) >= 60,
                        "clean": clean_label(p) if p["pos"] == "GK" else None,
                        "home": at_home,
                        "own_dec": dec,
                        "own_score": mean,
                        "baseline": baseline,
                        "ownStarts": own_starts,
                        "numbers": numbers,
                        "phase": row["phase"],
                        "neutral": row["neutral"],
                        "extraTime": game["extraTime"],
                    }
                )
        if i % 10 == 0:
            print(f"European fixed pre-lock features {i + 1}/{len(by_lock)} deadlines", flush=True)
    return {
        "caseSha256": cases["caseSha256"],
        "protocolSha256": cases["protocolSha256"],
        "footballConfig": dataclasses.asdict(CONFIG),
        "players": players,
        "football": forecasts,
        "modelEligible": False,
        "dependencies": dependencies(),
    }


def evaluate_players(rows: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    training = [r for r in rows if r["season"] in (2023, 2024)]
    testing = [r for r in rows if r["season"] == 2025]
    for r in rows:
        r["numbers"] = keeper.GameNumbers(**r["numbers"])
        r["date"] = when(r["date"])
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
    km, om = keeper.fit(ks, through="2025-06-30"), outfield.fit_all(os, through="2025-06-30")
    if km is None or set(om) != set(outfield.POSITIONS):
        raise ValueError("Insufficient independent European training starts")
    means, ablation = {}, {}
    for pos in POSITIONS:
        mine = [r for r in training if r["pos"] == pos]
        means[pos] = float(np.mean([r["score"] for r in mine]))
        if pos != "GK":
            x = np.array([[1.0, float(r["home"]), r["own_dec"], r["own_score"]] for r in mine])
            penalty = np.eye(4) * outfield.RIDGE
            penalty[0, 0] = 0
            ablation[pos] = np.linalg.solve(x.T @ x + penalty, x.T @ np.array([r["score"] for r in mine]))
    predicted = np.array(
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
    actual, form = np.array([r["score"] for r in testing]), np.array([r["baseline"] for r in testing])
    weeks = [r["week"] for r in testing]
    result: dict[str, Any] = {
        "coverageComplete": True,
        "cases": len(testing),
        "trainingCases": len(training),
        "model": metrics(testing, predicted),
        "form": metrics(testing, form),
        "ablation": metrics(testing, bare),
        "versusForm": comparison(actual, predicted, form, weeks),
        "versusAblation": comparison(actual, predicted, bare, weeks),
        "positions": {},
    }
    for pos in POSITIONS:
        mask = np.array([r["pos"] == pos for r in testing])
        result["positions"][pos] = {
            "cases": int(mask.sum()),
            "rmse": float(np.sqrt(np.mean((predicted[mask] - actual[mask]) ** 2))),
            "formRmse": float(np.sqrt(np.mean((form[mask] - actual[mask]) ** 2))),
        }
    result["subgroups"] = {}
    for label, predicate in (
        ("coldPlayer", lambda r: r["ownStarts"] == 0),
        ("extraTime", lambda r: r["extraTime"]),
        ("knockout", lambda r: r["phase"] == "knockout"),
        ("neutral", lambda r: r["neutral"]),
    ):
        indices = [i for i, r in enumerate(testing) if predicate(r)]
        result["subgroups"][label] = {
            "cases": len(indices),
            **(metrics([testing[i] for i in indices], predicted[indices]) if indices else {}),
        }
    result["rejectedBecause"] = release_reasons(result)
    result["passed"] = not result["rejectedBecause"]
    return result, {
        "keeper": dataclasses.asdict(km),
        "outfield": {p: dataclasses.asdict(m) for p, m in om.items()},
        "trainingThrough": "2025-06-30",
        "validated": result["passed"],
    }


def evaluate_football(rows: list[dict[str, Any]]) -> dict[str, Any]:
    p = np.array([[r[k] for k in ("p_h", "p_d", "p_a")] for r in rows])
    base = np.array([r["base"] for r in rows])
    outcomes = np.array([0 if r["hg"] > r["ag"] else 1 if r["hg"] == r["ag"] else 2 for r in rows])
    model, baseline = football_metrics(p, outcomes), football_metrics(base, outcomes)
    rps = probability_rows(p, outcomes)[0]
    base_rps = probability_rows(base, outcomes)[0]
    versus = comparison(np.zeros(len(rows)), rps, base_rps, [r["week"] for r in rows], squared=False)
    reasons = []
    if versus["hi"] >= 0:
        reasons.append("RPS improvement over competition base rate is not established")
    for metric in ("brier", "logLoss"):
        if model[metric] > baseline[metric]:
            reasons.append(f"{metric}: loss versus competition base rate")
    groups = {}
    for label, predicate in (
        [(f"season{y}", lambda r, y=y: r["season"] == y) for y in (2023, 2024, 2025)]
        + [
            ("coldClub", lambda r: r["cold"]),
            ("neutral", lambda r: r["neutral"]),
            ("homeVenue", lambda r: not r["neutral"]),
        ]
        + [(phase, lambda r, phase=phase: r["phase"] == phase) for phase in ("group", "league", "knockout")]
        + [
            (
                f"horizon{lo}to{hi}days",
                lambda r, lo=lo, hi=hi: lo <= (when(r["date"]) - when(r["lock"])).total_seconds() / 86400 < hi,
            )
            for lo, hi in ((0, 2), (2, 4), (4, 8))
        ]
        + [(f"leg{leg}", lambda r, leg=leg: (r["leg"] or {}).get("number") == leg) for leg in (1, 2)]
    ):
        mask = np.array([predicate(r) for r in rows])
        groups[label] = {"games": int(mask.sum()), **(football_metrics(p[mask], outcomes[mask]) if mask.any() else {})}
    calibration = []
    for low in np.arange(0, 1, 0.1):
        mask = (p >= low) & (p < low + 0.1)
        actual = np.eye(3)[outcomes]
        if mask.any():
            calibration.append(
                {
                    "from": float(low),
                    "cases": int(mask.sum()),
                    "predicted": float(p[mask].mean()),
                    "observed": float(actual[mask].mean()),
                }
            )
    return {
        "games": len(rows),
        "model": model,
        "base": baseline,
        "plainPoisson": football_metrics(np.array([r["plain"] for r in rows]), outcomes),
        "versusBase": versus,
        "cleanSheet": {
            side: {
                "predicted": float(np.mean([r["cs_" + side] for r in rows])),
                "observed": float(np.mean([r["ag" if side == "h" else "hg"] == 0 for r in rows])),
            }
            for side in ("h", "a")
        },
        "goalsMAE": float(np.mean([abs(r["lam_h"] - r["hg"]) + abs(r["lam_a"] - r["ag"]) for r in rows]) / 2),
        "ranking": {
            "favouredSideWinRate": float(
                np.mean([r["hg"] > r["ag"] if r["lam_h"] > r["lam_a"] else r["ag"] > r["hg"] for r in rows])
            ),
            "basis": "within-fixture strength ranking; no domestic-style UEFA table simulation",
        },
        "subgroups": groups,
        "reliability": calibration,
        "passed": not reasons,
        "rejectedBecause": reasons,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, default=Path("data/raw/european-cases.json"))
    parser.add_argument("--features", type=Path, default=Path("data/raw/european-features.json"))
    parser.add_argument("--out", type=Path, default=Path("data/raw/european-validation"))
    parser.add_argument("--evaluate", action="store_true")
    args = parser.parse_args()
    cases = read(args.cases)
    coverage_gate(cases)
    if not args.evaluate:
        packet = features(cases)
        packet["featureSha256"] = digest(packet)
        args.features.write_text(json.dumps(packet, separators=(",", ":"), allow_nan=False), encoding="utf-8")
        print(
            json.dumps(
                {
                    "featureSha256": packet["featureSha256"],
                    "games": len(packet["football"]),
                    "starts": len(packet["players"]),
                    "metricsOpened": False,
                }
            )
        )
        return
    packet = read(args.features)
    if packet.get("dependencies") != dependencies():
        raise ValueError("Replay implementation changed after feature preparation")
    if packet["caseSha256"] != cases["caseSha256"] or packet["featureSha256"] != digest(
        {k: v for k, v in packet.items() if k != "featureSha256"}
    ):
        raise ValueError("Changed feature/case packet")
    args.out.mkdir(parents=True, exist_ok=True)
    for code in EXPECTED:
        football = evaluate_football([r for r in packet["football"] if r["competition"] == code])
        xscore, candidate = evaluate_players([r for r in packet["players"] if r["competition"] == code])
        report = {
            "competition": code,
            "football": football,
            "xscore": xscore,
            "passed": football["passed"] and xscore["passed"],
            "caseSha256": cases["caseSha256"],
            "featureSha256": packet["featureSha256"],
            "protocolSha256": cases["protocolSha256"],
            "runnerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "footballConfig": dataclasses.asdict(CONFIG),
            "dependencies": packet["dependencies"],
        }
        (args.out / f"{code}-validation.json").write_text(
            json.dumps(report, indent=2, allow_nan=False), encoding="utf-8"
        )
        (args.out / f"{code}-candidate.json").write_text(
            json.dumps({**candidate, "evidence": report, "validated": report["passed"]}, indent=2), encoding="utf-8"
        )
        print(
            json.dumps({"competition": code, "passed": report["passed"], "football": football, "xscore": xscore}),
            flush=True,
        )


if __name__ == "__main__":
    main()
