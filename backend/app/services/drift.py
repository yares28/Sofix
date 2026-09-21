"""Noticing when a club has actually changed, rather than had a bad afternoon.

One surprising result says nothing: app/services/postmortem.py exists because football produces them on
schedule. A rating that is genuinely wrong shows up differently - the model keeps missing the same club
in the same direction, week after week. That is what a CUSUM test is for:

    S⁺ ← max(0, S⁺ + (residual − slack))        alarm when S⁺ > threshold

`slack` is the error the test tolerates as noise; only what exceeds it accumulates, so a single 3-0 does
not trip the test but five quiet under-predictions in a row do. Attack (goals scored against expected)
and defence (goals conceded against expected) are tracked apart, because a club that has lost a striker
has not changed at the back.

What an alarm buys is speed, not a new rating: the club's recent matches are weighted up in the next fit
(`fit_dixon_coles(..., club_weights=...)`), so the model moves toward what it is seeing instead of
waiting for the time decay to get there. The boost is capped and short - being wrong faster is worse
than being slow.

The residuals come from the model as it stands, which has already been fitted on those matches. That
makes them conservative: the ridge and the two-year window hold a rating back, and what survives is the
part of the miss the fit could not absorb. A club that trips this test is one the fit is fighting.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from app.modeling.dixon_coles import DixonColesModel


@dataclass(frozen=True)
class DriftSettings:
    """How much persistent error to tolerate, and what to do about it."""

    slack: float = 0.35  # goals per match treated as noise before anything accumulates
    threshold: float = 2.0  # how much accumulated error counts as an alarm
    matches: int = 12  # how far back the test looks
    boost: float = 2.0  # weight multiplier on an alarmed club's recent matches
    boost_matches: int = 6  # how many of its matches the boost covers

    @property
    def is_off(self) -> bool:
        return self.boost <= 1.0


def club_residuals(model: DixonColesModel, matches: pd.DataFrame) -> pd.DataFrame:
    """Per club per match: goals scored minus expected (attack) and conceded minus expected (defence).

    `matches` must be matches the model can rate - any club it has never seen is dropped rather than
    guessed at.
    """
    known = set(model.teams)
    usable = matches[matches["home"].isin(known) & matches["away"].isin(known)]
    if usable.empty:
        return pd.DataFrame(columns=["team", "date", "attack", "defence"])
    lam_h, lam_a = model.expected_goals(usable["home"], usable["away"])
    hg, ag = usable["hg"].to_numpy(dtype=float), usable["ag"].to_numpy(dtype=float)
    home = pd.DataFrame(
        {
            "team": usable["home"].to_numpy(),
            "date": usable["date"].to_numpy(),
            "attack": hg - lam_h,
            "defence": lam_a - ag,
        }
    )
    away = pd.DataFrame(
        {
            "team": usable["away"].to_numpy(),
            "date": usable["date"].to_numpy(),
            "attack": ag - lam_a,
            "defence": lam_h - hg,
        }
    )
    return pd.concat([home, away], ignore_index=True).sort_values("date", kind="stable", ignore_index=True)


def cusum(residuals: np.ndarray, slack: float) -> tuple[float, float]:
    """Running sums of error above and below the slack, as the last value of each. Both are ≥ 0."""
    up = down = 0.0
    for residual in np.asarray(residuals, dtype=float):
        up = max(0.0, up + residual - slack)
        down = max(0.0, down - residual - slack)
    return up, down


def alarms(residuals: pd.DataFrame, settings: DriftSettings) -> pd.DataFrame:
    """One row per club with its accumulated error, and whether it has gone past the threshold."""
    records = []
    for team, rows in residuals.groupby("team", sort=True):
        recent = rows.tail(settings.matches)
        record: dict[str, object] = {"team": team, "matches": len(recent)}
        for side in ("attack", "defence"):
            up, down = cusum(recent[side].to_numpy(), settings.slack)
            record[f"{side} above"] = up
            record[f"{side} below"] = down
        worst = max(float(record[f"{side} {way}"]) for side in ("attack", "defence") for way in ("above", "below"))  # type: ignore[arg-type]
        record["drift"] = worst
        record["alarm"] = worst > settings.threshold
        records.append(record)
    return pd.DataFrame(records)


def club_weights(residuals: pd.DataFrame, settings: DriftSettings) -> dict[str, float]:
    """The weight multiplier each club's recent matches should get in the next fit (1.0 = unchanged)."""
    if settings.is_off or residuals.empty:
        return {}
    table = alarms(residuals, settings)
    return {str(row["team"]): settings.boost for _, row in table.iterrows() if row["alarm"]}


def recent_match_weights(matches: pd.DataFrame, boosts: dict[str, float], settings: DriftSettings) -> np.ndarray | None:
    """A multiplier per match row: `boost` for an alarmed club's last `boost_matches` games, else 1.0.

    A match between two alarmed clubs is boosted once, not twice - the point is to look harder at recent
    football, not to let two uncertain ratings dominate the fit.
    """
    if not boosts:
        return None
    weights = np.ones(len(matches), dtype=float)
    order = np.argsort(matches["date"].to_numpy(), kind="stable")
    for team, boost in boosts.items():
        involved = order[(matches["home"].to_numpy()[order] == team) | (matches["away"].to_numpy()[order] == team)]
        weights[involved[-settings.boost_matches :]] = np.maximum(weights[involved[-settings.boost_matches :]], boost)
    return weights
