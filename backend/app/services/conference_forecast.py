"""Conservative Conference score distribution, fixed before historical diagnostics."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import pandas as pd

from app.modeling.dixon_coles import outcome_table

CLUB_WEIGHT = 0.75


class ConferenceForecast:
    def __init__(self, model: Any, history: pd.DataFrame, cutoff: datetime):
        self.model = model
        dates, available = pd.to_datetime(history["date"], utc=True), pd.to_datetime(history["availableAt"], utc=True)
        prior = history[
            (history["competition"] == "CONF")
            & (dates < cutoff)
            & (available < cutoff)
            & (dates >= cutoff - timedelta(days=730))
        ]
        if prior.empty:
            raise ValueError("No available Conference history")
        self.home_rate = max(float(prior["hg"].mean()), 0.1)
        self.away_rate = max(float(prior["ag"].mean()), 0.1)

    def average(self, neutral: list[bool]) -> pd.DataFrame:
        mean = (self.home_rate + self.away_rate) / 2
        return outcome_table(
            [mean if n else self.home_rate for n in neutral], [mean if n else self.away_rate for n in neutral], 0, 10
        )

    def predict(self, home, away, *, neutral):
        club = self.model.predict(home, away, neutral=neutral)
        average = self.average(neutral)
        return CLUB_WEIGHT * club + (1 - CLUB_WEIGHT) * average
