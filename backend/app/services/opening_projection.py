"""What the model said about this season before a ball was kicked.

The board shows where a club is and where it is heading. Neither answers "is this better or worse than we
thought in August?", because the live model is re-fitted every refresh and has long since absorbed the
results. This is the missing baseline: the same model, fitted only on matches played *before* the season's
first kickoff, run over all 380 fixtures, and turned into the position each club would hold after every
gameweek if every game went exactly to expectation.

It never changes within a season - the history before the cutoff is fixed - so it is built once by
`python -m app.jobs.opening_projection`, written to `backend/artifacts/opening_projection.json` and
committed. The API reads the file; nothing recomputes it per request.

Promoted clubs come out level with each other (no Segunda history, so the ridge prior is all the model
has). That is the honest answer and the note under the chart says so.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from app.modeling.dixon_coles import DixonColesModel
from app.services.scoring import expected_points


@dataclass(frozen=True)
class OpeningFixture:
    """One fixture of the season, by the names the model knows the clubs as."""

    matchday: int
    home: str
    away: str


@dataclass(frozen=True)
class OpeningProjection:
    """Projected position per club, one entry per matchday, from the pre-season fit."""

    season: str
    cutoff: str  # the kickoff the fit stopped at, YYYY-MM-DD
    model_version: str
    positions: dict[str, list[int]]  # club code -> position after each matchday, in matchday order
    matchdays: list[int]
    points: dict[str, float]  # projected points over the whole season

    def path(self, code: str, matchday_numbers: list[int]) -> list[int] | None:
        """The club's positions lined up with the gameweek columns the grid is serving."""
        stored = self.positions.get(code)
        if not stored:
            return None
        by_matchday = dict(zip(self.matchdays, stored, strict=False))
        path = [by_matchday.get(number) for number in matchday_numbers]
        return None if any(position is None for position in path) else [int(p) for p in path if p is not None]

    def as_dict(self) -> dict:
        return {
            "season": self.season,
            "cutoff": self.cutoff,
            "model_version": self.model_version,
            "matchdays": self.matchdays,
            "positions": self.positions,
            "points": {code: round(value, 2) for code, value in self.points.items()},
        }


def build_opening_projection(
    model: DixonColesModel,
    fixtures: list[OpeningFixture],
    codes: dict[str, str],
    season: str,
    cutoff: pd.Timestamp,
    model_version: str,
) -> OpeningProjection:
    """Run the pre-season model over every fixture and rank the clubs after each matchday.

    `codes` maps the model's club names to the three-letter codes the board uses.
    """
    if not fixtures:
        raise ValueError("no fixtures to project")
    rows = model.predict([fixture.home for fixture in fixtures], [fixture.away for fixture in fixtures])
    clubs = sorted({fixture.home for fixture in fixtures} | {fixture.away for fixture in fixtures})
    points = dict.fromkeys(clubs, 0.0)
    goals = dict.fromkeys(clubs, 0.0)  # expected goal difference, the tiebreak

    by_matchday: dict[int, list[tuple[str, str, float, float, float, float]]] = {}
    for fixture, (_, row) in zip(fixtures, rows.iterrows(), strict=True):
        home_points = float(expected_points(row["p_h"], row["p_d"]))
        away_points = float(expected_points(row["p_a"], row["p_d"]))
        margin = float(row["lam_h"]) - float(row["lam_a"])
        by_matchday.setdefault(fixture.matchday, []).append(
            (fixture.home, fixture.away, home_points, away_points, margin, -margin)
        )

    matchdays = sorted(by_matchday)
    positions: dict[str, list[int]] = {codes[club]: [] for club in clubs if club in codes}
    for matchday in matchdays:
        for home, away, home_points, away_points, home_margin, away_margin in by_matchday[matchday]:
            points[home] += home_points
            points[away] += away_points
            goals[home] += home_margin
            goals[away] += away_margin
        standings = sorted(clubs, key=lambda club: (-points[club], -goals[club], club))
        for place, club in enumerate(standings, start=1):
            code = codes.get(club)
            if code is not None:
                positions[code].append(place)

    return OpeningProjection(
        season=season,
        cutoff=f"{cutoff:%Y-%m-%d}",
        model_version=model_version,
        positions=positions,
        matchdays=matchdays,
        points={codes[club]: points[club] for club in clubs if club in codes},
    )


def load_opening_projection(path: str | Path, season: str | None = None) -> OpeningProjection | None:
    """The committed projection, or None when it is missing or belongs to another season."""
    path = Path(path)
    if not path.exists():
        return None
    saved = json.loads(path.read_text(encoding="utf-8"))
    if season is not None and saved.get("season") != season:
        return None
    try:
        return OpeningProjection(
            season=saved["season"],
            cutoff=saved["cutoff"],
            model_version=saved["model_version"],
            positions={code: [int(value) for value in path_] for code, path_ in saved["positions"].items()},
            matchdays=[int(number) for number in saved["matchdays"]],
            points={code: float(value) for code, value in saved.get("points", {}).items()},
        )
    except (KeyError, TypeError, ValueError):
        return None


def save_opening_projection(path: str | Path, projection: OpeningProjection) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(projection.as_dict(), indent=2) + "\n", encoding="utf-8")
