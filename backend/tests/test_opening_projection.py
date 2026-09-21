import json

import numpy as np
import pandas as pd
import pytest

from app.modeling.dixon_coles import DixonColesConfig, DixonColesModel
from app.services.opening_projection import (
    OpeningFixture,
    build_opening_projection,
    load_opening_projection,
    save_opening_projection,
)

TEAMS = ("Strong", "Middle", "Weak")
CODES = {"Strong": "STR", "Middle": "MID", "Weak": "WEA"}


def model() -> DixonColesModel:
    return DixonColesModel(
        teams=TEAMS,
        mu=0.1,
        home_adv=0.25,
        attack=np.array([0.5, 0.0, -0.5]),
        defence=np.array([0.4, 0.0, -0.4]),
        rho=0.0,
        config=DixonColesConfig(),
    )


def season() -> list[OpeningFixture]:
    # A three-club round robin: everyone plays everyone home and away, one game each per matchday.
    return [
        OpeningFixture(matchday=1, home="Strong", away="Weak"),
        OpeningFixture(matchday=2, home="Middle", away="Strong"),
        OpeningFixture(matchday=3, home="Weak", away="Middle"),
        OpeningFixture(matchday=4, home="Weak", away="Strong"),
        OpeningFixture(matchday=5, home="Strong", away="Middle"),
        OpeningFixture(matchday=6, home="Middle", away="Weak"),
    ]


def projection():
    return build_opening_projection(model(), season(), CODES, "2026/27", pd.Timestamp("2026-08-15"), "test-model")


def test_ranks_every_club_after_every_matchday():
    result = projection()
    assert result.matchdays == [1, 2, 3, 4, 5, 6]
    assert set(result.positions) == {"STR", "MID", "WEA"}
    assert all(len(path) == 6 for path in result.positions.values())
    # Every matchday is a complete table: the three clubs hold places 1, 2 and 3.
    for matchday in range(6):
        assert sorted(path[matchday] for path in result.positions.values()) == [1, 2, 3]
    # The better team is expected to lead, and the weakest to prop it up, by the end.
    assert result.positions["STR"][-1] == 1
    assert result.positions["WEA"][-1] == 3
    assert result.points["STR"] > result.points["MID"] > result.points["WEA"]


def test_lines_the_path_up_with_the_gameweek_columns_the_grid_serves():
    result = projection()
    assert result.path("STR", [1, 2, 3, 4, 5, 6]) == result.positions["STR"]
    assert result.path("STR", [2, 4]) == [result.positions["STR"][1], result.positions["STR"][3]]
    assert result.path("XXX", [1, 2]) is None  # a club the projection doesn't know
    assert result.path("STR", [1, 99]) is None  # a gameweek it doesn't cover


def test_round_trips_through_the_artifact(tmp_path):
    path = tmp_path / "opening.json"
    original = projection()
    save_opening_projection(path, original)
    saved = load_opening_projection(path, "2026/27")
    assert saved is not None
    assert (saved.season, saved.cutoff, saved.model_version) == (
        original.season,
        original.cutoff,
        original.model_version,
    )
    assert saved.positions == original.positions and saved.matchdays == original.matchdays
    for code, points in original.points.items():
        assert saved.points[code] == pytest.approx(points, abs=0.005)  # the file keeps two decimals
    assert load_opening_projection(path, "2025/26") is None  # last season's file is not this season's
    assert load_opening_projection(tmp_path / "missing.json") is None
    path.write_text(json.dumps({"season": "2026/27", "cutoff": "x"}), encoding="utf-8")
    assert load_opening_projection(path, "2026/27") is None  # half a file is no file


def test_refuses_an_empty_season():
    with pytest.raises(ValueError, match="no fixtures"):
        build_opening_projection(model(), [], CODES, "2026/27", pd.Timestamp("2026-08-15"), "test-model")
