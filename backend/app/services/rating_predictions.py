"""Turn the fitted Dixon-Coles model into per-team fixture predictions."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from app.modeling.dixon_coles import DixonColesConfig, DixonColesModel
from app.services.scoring import difficulty_label, difficulty_score, expected_points

MODEL_VERSION = "dixon-coles-v1"


def load_config(path: str | Path) -> DixonColesConfig:
    """Backtest-tuned settings, or defaults when no backtest has been run yet."""
    path = Path(path)
    if not path.exists():
        return DixonColesConfig()
    params = json.loads(path.read_text(encoding="utf-8"))
    fields = DixonColesConfig.__dataclass_fields__
    return DixonColesConfig(**{k: v for k, v in params.items() if k in fields})


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
    explanation: dict


def predict_both_sides(model: DixonColesModel, home: str, away: str) -> tuple[TeamPrediction, TeamPrediction]:
    """Predictions from the home team's and the away team's perspective."""
    row = model.predict([home], [away]).iloc[0]
    ratings = model.ratings().set_index("team")

    def side(p_win, p_draw, p_loss, cs, xg_for, xg_against, opponent, venue) -> TeamPrediction:
        score = difficulty_score(p_win, p_draw, p_loss)
        return TeamPrediction(
            p_win=float(p_win), p_draw=float(p_draw), p_loss=float(p_loss),
            expected_points=float(expected_points(p_win, p_draw)),
            difficulty_score=float(score), difficulty_label=difficulty_label(score),
            p_clean_sheet=float(cs), xg_for=float(xg_for), xg_against=float(xg_against),
            explanation={
                "opponent_attack": round(float(ratings.loc[opponent, "attack"]), 3),
                "opponent_defence": round(float(ratings.loc[opponent, "defence"]), 3),
                "venue": venue,
            },
        )

    home_side = side(row["p_h"], row["p_d"], row["p_a"], row["cs_h"], row["lam_h"], row["lam_a"], away, "H")
    away_side = side(row["p_a"], row["p_d"], row["p_h"], row["cs_a"], row["lam_a"], row["lam_h"], home, "A")
    return home_side, away_side
