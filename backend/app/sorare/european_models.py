"""Load only CL/EL artifacts passing both frozen European release gates."""

from __future__ import annotations

import dataclasses
import json
from pathlib import Path

from app.research.european_model import CONFIG
from app.research.league_xscore_validation import release_reasons
from app.sorare import keeper, outfield

ROOT = Path(__file__).resolve().parents[2] / "artifacts/european_xscore"


def load(code: str, root: Path = ROOT):
    from app.sorare.foreign_scores import Models

    if code not in {"CL", "EL"} or not (root / f"{code}.json").exists():
        return None
    try:
        raw = json.loads((root / f"{code}.json").read_text(encoding="utf-8"))
        evidence = raw["evidence"]
        football, players = evidence["football"], evidence["xscore"]
        if (
            raw.get("validated") is not True
            or evidence.get("passed") is not True
            or evidence.get("competition") != code
            or raw.get("trainingThrough") != "2025-06-30"
            or evidence.get("footballConfig") != dataclasses.asdict(CONFIG)
            or not football["passed"]
            or football["versusBase"]["hi"] >= 0
            or football["rejectedBecause"]
            or any(football["model"][m] > football["base"][m] for m in ("brier", "logLoss"))
            or not players["passed"]
            or release_reasons(players)
            or players["cases"] != 4158
            or football["games"] != {"CL": 503, "EL": 519}[code]
            or not all(
                isinstance(evidence.get(k), str) and len(evidence[k]) == 64
                for k in ("caseSha256", "featureSha256", "protocolSha256", "runnerSha256")
            )
            or set(raw["outfield"]) != set(outfield.POSITIONS)
        ):
            return None
        json.dumps(raw, allow_nan=False)
        return Models(
            keeper.KeeperModel(**raw["keeper"]),
            {p: outfield.OutfieldModel(**m) for p, m in raw["outfield"].items()},
            {},
        )
    except (KeyError, TypeError, ValueError):
        return None
