"""Pre-2023 Conference shrinkage development; never a serving model or release gate.

Run from backend: python -m app.research.conference_development
Original held-out replay files and model settings are read, never modified.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from datetime import timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.modeling.dixon_coles import outcome_table
from app.research.european_cases import digest, read
from app.research.european_model import CONFIG, fit
from app.research.european_validation import comparison, football_metrics, probability_rows
from app.research.league_xscore_data import when

WEIGHTS = (0.25, 0.50, 0.75, 1.00)
EXPECTED_GAMES = 141
FIELDS = ("p_h", "p_d", "p_a", "lam_h", "lam_a", "cs_h", "cs_a", "p_00")


def development_population(
    packet: dict[str, Any], *, expected_games: int = EXPECTED_GAMES
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if digest({k: v for k, v in packet.items() if k != "caseSha256"}) != packet.get("caseSha256"):
        raise ValueError("Case packet checksum changed")
    # Remove the exposed release years before inspecting results, constructing fits or selecting candidates.
    history = [r for r in packet["football"] if r["season"] in (2021, 2022)]
    seen = set()
    for row in history:
        key = (row["competition"], row["id"])
        if key in seen:
            raise ValueError("Repeated development game")
        seen.add(key)
        stamp = when(row["date"])
        if not when(f"{row['season']}-07-01T00:00:00Z") <= stamp < when(f"{row['season'] + 1}-07-01T00:00:00Z"):
            raise ValueError("Development season/date conflict")
    targets = [r for r in history if r["competition"] == "CONF" and r["season"] == 2022]
    if len(targets) != expected_games:
        raise ValueError("Incomplete Conference development coverage")
    return history, targets


def mixture(club: dict[str, float], average: dict[str, float], weight: float) -> dict[str, float]:
    if not np.isfinite(weight) or not 0 <= weight <= 1:
        raise ValueError("Invalid mixture weight")
    keys = club.keys() & average.keys()
    if not set(FIELDS[:7]) <= keys:
        raise ValueError("Incomplete goal/probability mixture")
    result = {k: weight * club[k] + (1 - weight) * average[k] for k in FIELDS if k in keys}
    probabilities = [result[k] for k in FIELDS[:3]]
    if (
        not all(np.isfinite(v) and v >= 0 for v in result.values())
        or not np.isclose(sum(probabilities), 1)
        or any(result[k] > 1 for k in ("cs_h", "cs_a", "p_00") if k in result)
    ):
        raise ValueError("Invalid score mixture")
    return result


def select_candidate(candidates: list[dict[str, Any]], base: dict[str, float]) -> dict[str, Any]:
    selected = min(candidates, key=lambda c: (c["model"]["rps"], c["weight"]))
    losses = [k for k in ("rps", "brier", "logLoss") if selected["model"][k] > base[k]]
    if selected["model"]["rps"] == base["rps"]:
        losses.append("no RPS improvement")
    return {
        "weight": selected["weight"],
        "recommendedForProspectiveCapture": not losses,
        "developmentLosses": losses,
        "validated": False,
        "modelEligible": False,
        "reason": "Development selection only; new pre-lock forecasts and independent FDR/xScore validation required",
    }


def replay(packet: dict[str, Any]) -> dict[str, Any]:
    history, targets = development_population(packet)
    frame = pd.DataFrame(history)
    dates = pd.to_datetime(frame["date"], utc=True)
    available = pd.to_datetime(frame["availableAt"], utc=True)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in targets:
        grouped[(when(row["date"]) - timedelta(days=3)).isoformat()].append(row)
    forecasts = []
    for lock, group in sorted(grouped.items()):
        cutoff = when(lock)
        model = fit(frame, cutoff, teams={r[s] for r in group for s in ("home", "away")})
        predicted = model.predict(
            [r["home"] for r in group], [r["away"] for r in group], neutral=[r["neutral"] for r in group]
        )
        prior = frame[
            (dates < cutoff)
            & (available < cutoff)
            & (dates >= cutoff - timedelta(days=730))
            & (frame["competition"] == "CONF")
        ]
        if prior.empty:
            raise ValueError("No pre-cutoff Conference comparator history")
        outcomes = np.where(prior["hg"] > prior["ag"], 0, np.where(prior["hg"] == prior["ag"], 1, 2))
        base = ((np.bincount(outcomes, minlength=3) + 1) / (len(outcomes) + 3)).tolist()
        lh, la = max(float(prior["hg"].mean()), 0.1), max(float(prior["ag"].mean()), 0.1)
        for row, (_, club) in zip(group, predicted.iterrows(), strict=True):
            h, a = ((lh + la) / 2,) * 2 if row["neutral"] else (lh, la)
            average = outcome_table([h], [a], 0.0, CONFIG.max_goals).iloc[0].to_dict()
            forecasts.append(
                {
                    "id": row["id"],
                    "date": row["date"],
                    "cutoff": lock,
                    "week": when(row["date"]).strftime("%G-W%V"),
                    "outcome": 0 if row["hg"] > row["ag"] else 1 if row["hg"] == row["ag"] else 2,
                    "base": base,
                    "club": club.to_dict(),
                    "average": average,
                }
            )
    actual = np.array([r["outcome"] for r in forecasts])
    weeks = [r["week"] for r in forecasts]
    base_p = np.array([r["base"] for r in forecasts])
    base = football_metrics(base_p, actual)
    base_rps = probability_rows(base_p, actual)[0]
    candidates = []
    for weight in WEIGHTS:
        rows = [mixture(r["club"], r["average"], weight) for r in forecasts]
        probability = np.array([[r[k] for k in FIELDS[:3]] for r in rows])
        rps = probability_rows(probability, actual)[0]
        candidates.append(
            {
                "weight": weight,
                "model": football_metrics(probability, actual),
                "versusBase": comparison(np.zeros(len(rows)), rps, base_rps, weeks, squared=False),
            }
        )
    sources = {
        "model": Path(__file__).with_name("european_model.py"),
        "runner": Path(__file__),
        "protocol": Path("../plans/conference-recovery.md"),
    }
    return {
        "competition": "CONF",
        "purpose": "Development only; neither independent validation nor production promotion",
        "historyGames": len(history),
        "games": len(forecasts),
        "seasonStart": 2022,
        "cutoffBasis": "kickoff minus three days; development proxy, not actual Sorare lock",
        "developmentInputSha256": digest(history),
        "forecastSha256": digest(forecasts),
        "dependencies": {k: hashlib.sha256(v.read_bytes()).hexdigest() for k, v in sources.items()},
        "weights": list(WEIGHTS),
        "base": base,
        "candidates": candidates,
        "selection": select_candidate(candidates, base),
        "validated": False,
        "modelEligible": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, default=Path("data/raw/european-cases.json"))
    parser.add_argument("--out", type=Path, default=Path("data/raw/conference-development.json"))
    args = parser.parse_args()
    result = replay(read(args.cases))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps(result, allow_nan=False))


if __name__ == "__main__":
    main()
