"""Diagnostic replay of the already fixed candidate; never a new blind validation claim."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.research.european_cases import digest, read
from app.research.european_validation import comparison, coverage_gate, dependencies, evaluate_football
from app.research.league_xscore_data import when
from app.research.league_xscore_validation import POSITIONS, metrics, release_reasons
from app.services.conference_forecast import CLUB_WEIGHT, ConferenceForecast
from app.sorare import keeper, outfield


def diagnostic(cases: dict[str, Any], packet: dict[str, Any], candidate: dict[str, Any]) -> dict[str, Any]:
    coverage_gate(cases)
    if (
        packet["featureSha256"] != digest({k: v for k, v in packet.items() if k != "featureSha256"})
        or packet["caseSha256"] != cases["caseSha256"]
        or packet["dependencies"] != dependencies()
        or candidate["candidateSha256"] != digest({k: v for k, v in candidate.items() if k != "candidateSha256"})
        or candidate["clubWeight"] != CLUB_WEIGHT
    ):
        raise ValueError("Changed frozen diagnostic inputs")
    history = pd.DataFrame(cases["football"])
    averages = {}
    football = []
    for row in packet["football"]:
        if row["competition"] != "CONF":
            continue
        if row["lock"] not in averages:
            averages[row["lock"]] = ConferenceForecast(None, history, when(row["lock"]))
        average = averages[row["lock"]].average([row["neutral"]]).iloc[0]
        numbers = {
            k: CLUB_WEIGHT * row[k] + (1 - CLUB_WEIGHT) * float(average[k])
            for k in ("p_h", "p_d", "p_a", "lam_h", "lam_a", "cs_h", "cs_a")
        }
        football.append({**row, **numbers})
    km = keeper.KeeperModel(**candidate["keeper"])
    om = {p: outfield.OutfieldModel(**m) for p, m in candidate["outfield"].items()}
    games = {r["sorareId"]: r for r in cases["games"]}
    rows, predictions, ablations = [], [], []
    for row in packet["players"]:
        if row["competition"] != "CONF" or row["season"] != 2025:
            continue
        game = games[row["game"]]
        average = averages[game["lock"]].average([row["neutral"]]).iloc[0]
        average_numbers = {
            "cs": float(average["cs_h" if row["home"] else "cs_a"]),
            "xgf": float(average["lam_h" if row["home"] else "lam_a"]),
            "xga": float(average["lam_a" if row["home"] else "lam_h"]),
        }
        numbers = keeper.GameNumbers(
            **{
                k: CLUB_WEIGHT * row["numbers"][k] + (1 - CLUB_WEIGHT) * average_numbers[k]
                for k in ("cs", "xga", "xgf")
            }
        )
        pos = row["pos"]
        predictions.append(
            km.predict(numbers, None).start
            if pos == "GK"
            else om[pos].predict(numbers, row["home"], row["own_dec"], row["own_score"], None)
        )
        ablations.append(
            candidate["noFdr"]["GK"]["mean"]
            if pos == "GK"
            else float(
                np.clip(
                    np.dot(candidate["noFdr"][pos]["coef"], [1, float(row["home"]), row["own_dec"], row["own_score"]]),
                    0,
                    100,
                )
            )
        )
        rows.append(row)
    if len(football) != 447 or len(rows) != 3366 or len({r["game"] for r in rows}) != 153:
        raise ValueError("Incomplete mandatory Conference diagnostic population")
    predicted, bare = np.array(predictions), np.array(ablations)
    actual, form = np.array([r["score"] for r in rows]), np.array([r["baseline"] for r in rows])
    weeks = [r["week"] for r in rows]
    result: dict[str, Any] = {
        "coverageComplete": True,
        "cases": len(rows),
        "model": metrics(rows, predicted),
        "form": metrics(rows, form),
        "ablation": metrics(rows, bare),
        "versusForm": comparison(actual, predicted, form, weeks),
        "versusAblation": comparison(actual, predicted, bare, weeks),
        "positions": {},
    }
    for pos in POSITIONS:
        mask = np.array([r["pos"] == pos for r in rows])
        result["positions"][pos] = {
            "cases": int(mask.sum()),
            "rmse": float(np.sqrt(np.mean((predicted[mask] - actual[mask]) ** 2))),
            "formRmse": float(np.sqrt(np.mean((form[mask] - actual[mask]) ** 2))),
        }
    result["rejectedBecause"] = release_reasons(result)
    result["passed"] = not result["rejectedBecause"]
    return {
        "competition": "CONF",
        "candidateSha256": candidate["candidateSha256"],
        "football": evaluate_football(football),
        "xscore": result,
        "independentConfirmation": False,
        "diagnosticOnly": True,
        "caseSha256": cases["caseSha256"],
        "featureSha256": packet["featureSha256"],
        "runnerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "note": "Previously examined historical outcomes; fixed candidate, no retuning, no fresh blind claim",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out", type=Path, default=Path("../docs/european_validation/CONF-provisional-diagnostic.json")
    )
    args = parser.parse_args()
    result = diagnostic(
        read(Path("data/raw/european-cases.json")),
        read(Path("data/raw/european-features.json")),
        read(Path("../docs/european_validation/CONF-candidate-v2.json")),
    )
    args.out.write_text(json.dumps(result, indent=2, allow_nan=False), encoding="utf-8")
    print(
        json.dumps(
            {
                "football": result["football"]["model"],
                "footballBase": result["football"]["base"],
                "footballReasons": result["football"]["rejectedBecause"],
                "xscore": result["xscore"]["model"],
                "form": result["xscore"]["form"],
                "noFdr": result["xscore"]["ablation"],
                "xscoreReasons": result["xscore"]["rejectedBecause"],
            }
        )
    )


if __name__ == "__main__":
    main()
