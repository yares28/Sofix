"""Turn the fitted Dixon-Coles model into per-team fixture predictions."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import pandas as pd

from app.modeling.dixon_coles import DixonColesConfig, DixonColesModel
from app.services.calibration import CleanSheetCalibration
from app.services.market_blend import MarketBlend
from app.services.odds_record import OddsRecord
from app.services.scoring import difficulty_label, difficulty_score, expected_points

MODEL_FAMILY = "dixon-coles-v1"


def load_config(path: str | Path, allow_defaults: bool = False) -> DixonColesConfig:
    """Backtest-tuned settings from artifacts/dixon_coles.json.

    Missing file is an error: silently predicting with untuned defaults would change every rating.
    Pass allow_defaults=True only in tests or before the first backtest.
    """
    path = Path(path)
    if not path.exists():
        if allow_defaults:
            return DixonColesConfig()
        raise FileNotFoundError(f"tuned model config not found at {path}; run python -m app.jobs.backtest")
    params = json.loads(path.read_text(encoding="utf-8"))
    fields = DixonColesConfig.__dataclass_fields__
    return DixonColesConfig(**{k: v for k, v in params.items() if k in fields})


def model_version(config: DixonColesConfig, clean_sheets: CleanSheetCalibration | None = None) -> str:
    """Stable id for predictions made with these settings, e.g. dixon-coles-v1+3f2a9c1d.

    The clean-sheet correction is part of what a prediction says, so it belongs in the id: when it is
    refitted, the next run replaces the rows instead of leaving a mix of old and new numbers.
    """
    settings: dict = asdict(config)
    if clean_sheets is not None and not clean_sheets.is_identity:
        settings = {"config": settings, "clean_sheets": [round(clean_sheets.a, 6), round(clean_sheets.b, 6)]}
    digest = hashlib.sha256(json.dumps(settings, sort_keys=True).encode()).hexdigest()[:8]
    return f"{MODEL_FAMILY}+{digest}"


def merge_recent_results(history: pd.DataFrame, recent: pd.DataFrame) -> pd.DataFrame:
    """Add results the CSV history doesn't have yet (it lags a few days behind the live API).

    A recent result counts as already present when the same home/away pair is in the
    history within two days of it.
    """
    if recent.empty:
        return history
    known = history[["home", "away", "date"]]
    candidates = recent.merge(known, on=["home", "away"], how="left", suffixes=("", "_known"))
    close = (candidates["date"] - candidates["date_known"]).abs() <= pd.Timedelta(days=2)
    present = candidates.loc[close, ["home", "away", "date"]].drop_duplicates()
    missing = recent.merge(present, on=["home", "away", "date"], how="left", indicator=True)
    missing = missing[missing["_merge"] == "left_only"].drop(columns="_merge")
    merged = pd.concat([history, missing], ignore_index=True)
    return merged.sort_values("date", kind="stable", ignore_index=True)


@dataclass(frozen=True)
class MarketMix:
    """One fixture's bookmaker consensus and how much of it to use."""

    fair: tuple[float, float, float]  # margin-free home / draw / away
    blend: MarketBlend


@dataclass(frozen=True)
class TeamPrediction:
    p_win: float
    p_draw: float
    p_loss: float
    expected_points: float
    difficulty_score: float
    difficulty_label: str
    p_clean_sheet: float
    xg_for: float
    xg_against: float
    p_both_score: float  # both teams score; the same from either side
    explanation: dict


def predict_both_sides(
    model: DixonColesModel,
    home: str,
    away: str,
    clean_sheets: CleanSheetCalibration | None = None,
    market: MarketMix | None = None,
    record: OddsRecord | None = None,
) -> tuple[TeamPrediction, TeamPrediction]:
    """Predictions from the home team's and the away team's perspective.

    `clean_sheets` corrects the clean-sheet chance only (see app/services/calibration.py).
    `market` mixes bookmaker prices into win/draw/loss for a fixture close enough to be priced
    (see app/services/market_blend.py); without it the numbers are purely the model's. Expected goals
    and clean sheets always stay the model's.

    `record` adds how the club has done at this price before (see app/services/odds_record.py) - once
    banded by the win chance shown here, and once by the bookmakers' own price when there is one. It is
    description, not part of the forecast: nothing it says changes a probability.
    """
    row = model.predict([home], [away]).iloc[0]
    ratings = model.ratings().set_index("team")
    correction = clean_sheets or CleanSheetCalibration()
    p_h, p_d, p_a = float(row["p_h"]), float(row["p_d"]), float(row["p_a"])
    blended = False
    if market is not None:
        p_h, p_d, p_a = market.blend.blend((p_h, p_d, p_a), market.fair)
        blended = True

    def records(club: str, p_win: float, market_win: float | None) -> dict:
        if record is None:
            return {}
        ours = record.for_club(club, p_win)
        priced = record.for_club(club, market_win) if market_win is not None else None
        found = {}
        if ours:
            found["record"] = ours.as_dict()
        if priced:
            found["record_price"] = priced.as_dict()
        return found

    # Straight from the score matrix, so the low-score correction is in it. The clean-sheet chance shown
    # elsewhere carries the calibration on top (app/services/calibration.py); this one is the raw model.
    both_score = float(min(max(1 - row["cs_h"] - row["cs_a"] + row["p_00"], 0.0), 1.0))

    def side(p_win, p_draw, p_loss, cs, xg_for, xg_against, opponent, venue, club, market_win) -> TeamPrediction:
        score = difficulty_score(p_win, p_draw, p_loss)
        return TeamPrediction(
            p_win=float(p_win),
            p_draw=float(p_draw),
            p_loss=float(p_loss),
            expected_points=float(expected_points(p_win, p_draw)),
            difficulty_score=float(score),
            difficulty_label=difficulty_label(score, venue),
            p_clean_sheet=correction.apply(cs),
            xg_for=float(xg_for),
            xg_against=float(xg_against),
            p_both_score=both_score,
            explanation={
                "both_score": round(both_score, 4),
                "opponent_attack": round(float(ratings.loc[opponent, "attack"]), 3),
                "opponent_defence": round(float(ratings.loc[opponent, "defence"]), 3),
                "venue": venue,
                **({"market_blend": market.blend.weight} if blended and market else {}),
                **records(club, float(p_win), market_win),
            },
        )

    home_price = market.fair[0] if market else None
    away_price = market.fair[2] if market else None
    home_side = side(p_h, p_d, p_a, row["cs_h"], row["lam_h"], row["lam_a"], away, "H", home, home_price)
    away_side = side(p_a, p_d, p_h, row["cs_a"], row["lam_a"], row["lam_h"], home, "A", away, away_price)
    return home_side, away_side
