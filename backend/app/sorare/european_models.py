"""Validated CL/EL artifacts and a separately authorized provisional Conference model."""

from __future__ import annotations

import dataclasses
import hashlib
import json
from pathlib import Path

from app.research.european_model import CONFIG
from app.research.league_xscore_validation import release_reasons
from app.services.conference_forecast import CLUB_WEIGHT
from app.sorare import keeper, outfield

ROOT = Path(__file__).resolve().parents[2] / "artifacts/european_xscore"


def provisional(raw: dict) -> dict | None:
    """Owner-authorized fixed candidate; deliberately does not claim gate passage."""
    candidate = raw["candidate"]
    digest = hashlib.sha256(
        json.dumps(candidate, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()
    diagnostic = raw["diagnostic"]
    if (
        raw.get("competition") != "CONF"
        or raw.get("releaseStatus") != "provisional"
        or raw.get("ownerDirected") is not True
        or digest != "b7725b94f59a07a6c54a22dcf45bb4590a2d7f6ef9991b773f3d47659191efb7"
        or candidate["footballConfig"] != dataclasses.asdict(CONFIG)
        or candidate["clubWeight"] != CLUB_WEIGHT
        or raw.get("candidateSha256") != diagnostic.get("candidateSha256")
        or diagnostic.get("diagnosticOnly") is not True
        or diagnostic.get("independentConfirmation") is not False
        or diagnostic["football"]["games"] != 447
        or diagnostic["xscore"]["cases"] != 3366
        or diagnostic["xscore"]["coverageComplete"] is not True
    ):
        return None
    return candidate


def load(code: str, root: Path = ROOT):
    from app.sorare.foreign_scores import Models

    if code not in {"CL", "EL", "CONF"} or not (root / f"{code}.json").exists():
        return None
    try:
        raw = json.loads((root / f"{code}.json").read_text(encoding="utf-8"))
        if code == "CONF":
            candidate = provisional(raw)
            if candidate is None:
                return None
            return Models(
                keeper.KeeperModel(**candidate["keeper"]),
                {p: outfield.OutfieldModel(**m) for p, m in candidate["outfield"].items()},
                {},
            )
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
