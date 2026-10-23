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
from app.sorare.outfield import SubShape
from app.sorare.scores import Made

ROOT = Path(__file__).resolve().parents[2] / "artifacts" / "league_xscore"
COMPETITIONS = {
    **LEAGUES,
    "CL": "uefa-champions-league",
    "EL": "uefa-europa-league",
    "CONF": "uefa-europa-conference-league",
}


@dataclasses.dataclass(frozen=True)
class Models:
    keeper: keeper.KeeperModel
    outfield: dict[str, outfield.OutfieldModel]
    subs: dict[str, SubShape]


def expected_version(code: str) -> str:
    if code in {"CL", "EL", "CONF"}:
        from app.services.european_fdr import version as european_version

        return european_version(code)
    return f"{code}:{model_version(REFERENCE)}"


def version(code: str) -> str:
    if code in {"CL", "EL", "CONF"}:
        from app.sorare.european_models import ROOT as EUROPEAN_ROOT

        raw = (EUROPEAN_ROOT / f"{code}.json").read_bytes()
        return f"{code}:xscore-v3+{hashlib.sha256(raw).hexdigest()[:8]}"
    raw = (ROOT / f"{code}.json").read_bytes()
    protocol_version = json.loads(raw)["protocol"]["version"]
    return f"{code}:xscore-v{protocol_version}+{hashlib.sha256(raw).hexdigest()[:8]}"


def load(code: str, root: Path = ROOT) -> Models | None:
    if code in {"CL", "EL", "CONF"}:
        from app.sorare import european_models

        return european_models.load(code) if root == ROOT else european_models.load(code, root)
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
        or game.get("competition") != COMPETITIONS.get(code)
        or (code in {"CL", "EL", "CONF"} and grid.get("_fresh") is not True)
    ):
        return None
    try:
        lock, kickoff = when(game["forecastBefore"]), when(game["kickoff"])
        teams = grid["teams"]
        if code in {"CL", "EL", "CONF"}:
            own, other = game.get("teamSlug"), game.get("opponentSlug")
            me = [t for t in teams if t.get("sorare_slug") == own and own]
            opponent = [t for t in teams if t.get("sorare_slug") == other and other]
        else:
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
        if code in {"CL", "EL", "CONF"} and (
            cell.get("phase") not in {"league", "knockout"} or type(cell.get("neutral")) is not bool
        ):
            return None
        if cell.get("status") != "scheduled" or not cell.get("forecast_at") or when(cell["forecast_at"]) > lock:
            return None
        prediction = cell["prediction"]
        cs, xgf, xga = (float(prediction[k]) for k in ("clean_sheet", "xg_for", "xg_against"))
        if not all(math.isfinite(x) for x in (cs, xgf, xga)) or not 0 <= cs <= 1 or min(xgf, xga) < 0:
            return None
        return keeper.GameNumbers(cs, xga, xgf)
    except (ValueError, KeyError, TypeError):
        return None


def scores_for(
    models: dict[str, Models],
    grids: dict[str, dict[str, Any]],
    fallback: Any,
    *,
    european_games: dict[str, dict[str, Any]] | None = None,
) -> Any:
    def score(
        player: dict[str, Any], games: list[dict[str, Any]], projection: float | None, past: list[dict[str, Any]]
    ) -> Made:
        codes = {c for c, slug in COMPETITIONS.items() if any(g.get("competition") == slug for g in games)}
        if not codes:
            if ((player.get("activeClub") or {}).get("domesticLeague") or {}).get("slug") in LEAGUES.values():
                return Made((), None)
            return fallback(player, games, projection, past)
        pos = SORARE_POSITION.get(player.get("position") or "", "")
        found = []
        sub = None
        for i, game in enumerate(sorted(games, key=lambda g: g["kickoff"])):
            code = next((c for c, slug in COMPETITIONS.items() if game.get("competition") == slug), None)
            if code is None:
                # Existing LaLiga models can contribute their own game to a mixed GW.
                if game.get("competition") != keeper.LALIGA:
                    return Made((), None)
                made = fallback(player, [game], projection if i == 0 else None, past)
                if len(made.outcomes) != 1:
                    return Made((), None)
                found.extend(made.outcomes)
                continue
            bundle = models.get(code)
            numbers = find_numbers(code, grids.get(code, {}), game)
            if bundle is None or numbers is None:
                return Made((), None)
            if len(codes) == 1 and len(games) == 1:
                sub = bundle.subs.get(pos)
            lock = when(game["forecastBefore"])
            if code in {"CL", "EL", "CONF"}:
                from app.research.european_validation import own_before

                if european_games is None:
                    return Made((), None)
                history = [
                    (when(h["date"]), when(h["availableAt"]), float(h["starts"][player["slug"]]))
                    for h in (european_games or {}).values()
                    if player.get("slug") in h.get("starts", {})
                    and h.get("mainStage") is True
                    and h.get("competition") in {"CL", "EL", "CONF"}
                ]
                dec, mean, _, _ = own_before(history, lock)
            else:
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
                dec, mean = outfield.own_record(own)
            if pos == "GK":
                outcome = bundle.keeper.predict(numbers, None)
            elif pos in bundle.outfield:
                outcome = bundle.outfield[pos].outcome(numbers, game.get("venue") == "H", dec, mean, None)
            else:
                return Made((), sub)
            found.append(outcome)
        return Made(tuple(found), sub)

    return score
