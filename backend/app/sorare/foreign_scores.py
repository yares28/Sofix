"""Independently validated league models, joined to the actual playing sides before lock."""

from __future__ import annotations

import dataclasses
import hashlib
import json
import math
from datetime import timedelta
from pathlib import Path
from typing import Any

from app.research.league_xscore_data import LEAGUES, when
from app.research.league_xscore_identity import club_name
from app.research.league_xscore_validation import protocol_for, release_reasons
from app.services.league_fdr import REFERENCE
from app.services.rating_predictions import model_version
from app.sorare import keeper, outfield
from app.sorare.model import SORARE_POSITION
from app.sorare.scores import Made

ROOT = Path(__file__).resolve().parents[2] / "artifacts" / "league_xscore"


@dataclasses.dataclass(frozen=True)
class Models:
    keeper: keeper.KeeperModel
    outfield: dict[str, outfield.OutfieldModel]
    subs: dict[str, outfield.SubShape]


def expected_version(code: str) -> str:
    return f"{code}:{model_version(REFERENCE)}"


def version(code: str) -> str:
    raw = (ROOT / f"{code}.json").read_bytes()
    protocol_version = json.loads(raw)["protocol"]["version"]
    return f"{code}:xscore-v{protocol_version}+{hashlib.sha256(raw).hexdigest()[:8]}"


def load(code: str, root: Path = ROOT) -> Models | None:
    path = root / f"{code}.json"
    if code not in LEAGUES or not path.exists():
        return None
    try:
        raw = json.loads(path.read_text("utf-8"))
        evidence = raw["evidence"]
        if (
            raw.get("validated") is not True
            or evidence.get("passed") is not True
            or raw.get("protocol") != protocol_for(code)
            or evidence.get("protocol") != protocol_for(code)
            or evidence.get("competition") != code
            or release_reasons(evidence)
            or evidence.get("footballConfig") != dataclasses.asdict(REFERENCE)
            or raw.get("trainingThrough") != "2025-06-30"
            or not all(
                isinstance(evidence.get(k), str) and len(evidence[k]) == 64
                for k in ("runnerSha256", "sourceSha256", "historySha256", "identitySha256", "caseSha256")
            )
        ):
            return None
        # JSON must contain finite coefficients throughout, not JavaScript-style NaN.
        json.dumps(raw, allow_nan=False)
        return Models(
            keeper.KeeperModel(**raw["keeper"]),
            {p: outfield.OutfieldModel(**m) for p, m in raw["outfield"].items()},
            {p: outfield.SubShape(**m) for p, m in raw.get("subs", {}).items()},
        )
    except (KeyError, TypeError, ValueError):
        return None


def find_numbers(code: str, grid: dict[str, Any], game: dict[str, Any]) -> keeper.GameNumbers | None:
    if (
        grid.get("competition") != code
        or grid.get("model_version") != expected_version(code)
        or game.get("competition") != LEAGUES.get(code)
    ):
        return None
    try:
        lock, kickoff = when(game["forecastBefore"]), when(game["kickoff"])
        teams = grid["teams"]
        known = {t["history_name"] for t in teams if t.get("history_name")}
        own = club_name({"name": game["teamName"]}, known)
        other = club_name({"name": game["opponentName"]}, known)
        me = [t for t in teams if t.get("history_name") == own]
        opponent = [t for t in teams if t.get("history_name") == other]
        if len(me) != 1 or len(opponent) != 1 or own == other or lock >= kickoff:
            return None
        cells = [
            c
            for column in me[0]["cells"]
            for c in column
            if c.get("opponent_code") == opponent[0]["code"]
            and c.get("venue") == game.get("venue")
            and abs(when(c["kickoff_utc"]) - kickoff) <= timedelta(hours=2)
        ]
        if len(cells) != 1:
            return None
        cell = cells[0]
        if cell.get("status") != "scheduled" or not cell.get("forecast_at") or when(cell["forecast_at"]) > lock:
            return None
        prediction = cell["prediction"]
        cs, xgf, xga = (float(prediction[k]) for k in ("clean_sheet", "xg_for", "xg_against"))
        if not all(math.isfinite(x) for x in (cs, xgf, xga)) or not 0 <= cs <= 1 or min(xgf, xga) < 0:
            return None
        return keeper.GameNumbers(cs, xga, xgf)
    except (ValueError, KeyError, TypeError):
        return None


def scores_for(models: dict[str, Models], grids: dict[str, dict[str, Any]], fallback: Any) -> Any:
    def score(
        player: dict[str, Any], games: list[dict[str, Any]], projection: float | None, past: list[dict[str, Any]]
    ) -> Made:
        codes = {c for c, slug in LEAGUES.items() if any(g.get("competition") == slug for g in games)}
        if not codes:
            if ((player.get("activeClub") or {}).get("domesticLeague") or {}).get("slug") in LEAGUES.values():
                return Made((), None)
            return fallback(player, games, projection, past)
        # A mixed domestic/cup week is not filled in with another league's coefficients.
        if len(codes) != 1:
            return Made((), None)
        code = next(iter(codes))
        bundle = models.get(code)
        pos = SORARE_POSITION.get(player.get("position") or "", "")
        if bundle is None or not games:
            return Made((), None)
        sub = bundle.subs.get(pos)
        found = []
        for game in sorted(games, key=lambda g: g["kickoff"]):
            numbers = find_numbers(code, grids.get(code, {}), game)
            if numbers is None:
                return Made((), sub)
            lock = when(game["forecastBefore"])
            own = [
                h["score"]
                for h in past
                if h.get("competition") == LEAGUES[code]
                and h.get("status") == "FINAL"
                and h.get("played") is True
                and h.get("started") is True
                and h.get("score") is not None
                and lock - timedelta(days=70) <= when(h["date"]) < lock
            ]
            if pos == "GK":
                outcome = bundle.keeper.predict(numbers, None)
            elif pos in bundle.outfield:
                dec, mean = outfield.own_record(own)
                outcome = bundle.outfield[pos].outcome(numbers, game.get("venue") == "H", dec, mean, None)
            else:
                return Made((), sub)
            found.append(outcome)
        return Made(tuple(found), sub)

    return score
