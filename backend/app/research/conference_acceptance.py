"""One prospective evaluation after the complete edition, never interim model selection."""

from __future__ import annotations

from typing import Any

import numpy as np

from app.research.european_validation import comparison, evaluate_football, football_metrics
from app.research.league_xscore_data import when
from app.research.league_xscore_validation import POSITIONS, metrics, release_reasons


def closure_reasons(native: list[dict[str, Any]], state: dict[str, Any]) -> list[str]:
    reasons = []
    if (
        len(native) != 153
        or len({r["id"] for r in native}) != 153
        or sum((r.get("round") or {}).get("mode") == "GROUP" for r in native) != 108
    ):
        reasons.append("The complete 108 league-phase / 45 knockout calendar is not available")
    if any(r.get("status") != "FINISHED" for r in native):
        reasons.append("The edition still has unfinished or administrative games")
    eligible = {ident for ident, row in state["enrolled"].items() if not row.get("preFreezeLock")}
    excluded = state.get("excluded", {})
    if (
        eligible & set(excluded)
        or eligible | set(excluded) != {r["id"] for r in native}
        or any(when(row["lock"]) > when(state["frozenAt"]) for row in excluded.values())
    ):
        reasons.append("Every fixture needs an actual-cutoff population classification")
    if not eligible or not eligible <= {r["id"] for r in native}:
        reasons.append("Prospective population is missing from the edition")
    if state["errors"] or any(
        ident not in state["settled"]
        or not state["captures"].get(ident)
        or len(state["settled"][ident]["players"]) != 22
        or len({p["player"] for p in state["settled"][ident]["players"]}) != 22
        for ident in eligible
    ):
        reasons.append("Incomplete mandatory pre-lock forecasts or authentic final starter evidence")
    return reasons


def evaluate(native: list[dict[str, Any]], state: dict[str, Any], archive: Any) -> dict[str, Any]:
    reasons = closure_reasons(native, state)
    if reasons:
        raise ValueError("; ".join(reasons))
    football, players = [], []
    for ident, enrollment in sorted(state["enrolled"].items()):
        if enrollment.get("preFreezeLock"):
            continue
        case = state["settled"][ident]
        snapshot = archive.read_capture(case["capture"])
        if (
            snapshot["candidateSha256"] != state["candidateSha256"]
            or snapshot["nativeId"] != ident
            or snapshot["recordingVersion"] != state["recordingVersion"]
            or snapshot["protocolSha256"] != state["protocolSha256"]
        ):
            raise ValueError("Changed prospective candidate/protocol/case identity")
        row = {
            **case["football"],
            **snapshot["football"],
            "base": snapshot["base"],
            "plain": snapshot["plain"],
            "cold": snapshot["cold"],
            "lock": snapshot["lock"],
            "week": when(case["football"]["date"]).strftime("%G-W%V"),
        }
        football.append(row)
        players.extend(case["players"])
    football_result = evaluate_football(football)
    p = np.array([[r[k] for k in ("p_h", "p_d", "p_a")] for r in football])
    outcomes = np.array([0 if r["hg"] > r["ag"] else 1 if r["hg"] == r["ag"] else 2 for r in football])
    football_result["subgroups"]["season2026"] = {"games": len(football), **football_metrics(p, outcomes)}
    actual = np.array([r["score"] for r in players])
    predicted = np.array([r["prediction"] for r in players])
    form, bare = np.array([r["baseline"] for r in players]), np.array([r["ablation"] for r in players])
    weeks = [r["week"] for r in players]
    result: dict[str, Any] = {
        "coverageComplete": True,
        "cases": len(players),
        "model": metrics(players, predicted),
        "form": metrics(players, form),
        "ablation": metrics(players, bare),
        "versusForm": comparison(actual, predicted, form, weeks),
        "versusAblation": comparison(actual, predicted, bare, weeks),
        "positions": {},
        "subgroups": {},
    }
    for pos in POSITIONS:
        mask = np.array([r["pos"] == pos for r in players])
        result["positions"][pos] = {
            "cases": int(mask.sum()),
            "rmse": float(np.sqrt(np.mean((predicted[mask] - actual[mask]) ** 2))) if mask.any() else None,
            "formRmse": float(np.sqrt(np.mean((form[mask] - actual[mask]) ** 2))) if mask.any() else None,
        }
    for label, predicate in (
        ("coldPlayer", lambda r: r["ownStarts"] == 0),
        ("extraTime", lambda r: r["extraTime"]),
        ("knockout", lambda r: r["phase"] == "knockout"),
        ("neutral", lambda r: r["neutral"]),
    ):
        indices = [i for i, r in enumerate(players) if predicate(r)]
        result["subgroups"][label] = {
            "cases": len(indices),
            **(metrics([players[i] for i in indices], predicted[indices]) if indices else {}),
        }
    result["rejectedBecause"] = release_reasons(result)
    result["passed"] = not result["rejectedBecause"]
    return {
        "competition": "CONF",
        "candidateSha256": state["candidateSha256"],
        "protocolSha256": state["protocolSha256"],
        "football": football_result,
        "xscore": result,
        "passed": football_result["passed"] and result["passed"],
        "modelEligible": False,
        "note": "Prospective evidence only; production promotion requires separate product proof",
    }
