"""Full UEFA league calendars, no qualifier admission or invented knockout pairs."""

from datetime import UTC, datetime

import pandas as pd
import pytest

from app.services.european_fdr import build_grid


class FixedModel:
    def predict(self, home, away, *, neutral):
        return pd.DataFrame(
            [
                {"p_h": 0.5, "p_d": 0.3, "p_a": 0.2, "cs_h": 0.4, "cs_a": 0.2, "lam_h": 1.5, "lam_a": 1.0, "p_00": 0.1}
                for _ in home
            ]
        )


def calendar():
    teams = [
        {
            "id": str(i + 1),
            "internationalName": f"Club {i}",
            "teamCode": f"{i:03}",
            "isPlaceHolder": False,
            "countryCode": "ESP",
            "logoUrl": f"https://img.uefa.com/imgml/TP/teams/logos/70x70/{i + 1}.png",
        }
        for i in range(36)
    ]
    return [
        {
            "id": str(i * 4 + k + 1),
            "seasonYear": "2027",
            "competitionPhase": "TOURNAMENT",
            "competition": {"id": "1", "code": "UCL", "sex": "MALE", "teamCategory": "CLUB"},
            "homeTeam": teams[i],
            "awayTeam": teams[(i + d) % 36],
            "status": "UPCOMING",
            "round": {"id": "league", "mode": "GROUP", "phase": "TOURNAMENT"},
            "matchday": {"longName": f"Matchday {2 * k + i % 2 + 1}", "id": str(2 * k + i % 2 + 1)},
            "kickOffTime": {"dateTime": f"2026-11-{2 * k + i % 2 + 11:02}T20:00:00Z"},
            "stadium": {"id": "1", "countryCode": "ESP"},
        }
        for i in range(36)
        for k, d in enumerate((1, 3, 5, 7))
    ]


def test_cold_start_publishes_every_club_and_fixture_and_only_future_forecasts():
    rows = calendar()
    grid = build_grid("CL", 2026, rows, FixedModel(), datetime(2026, 10, 23, tzinfo=UTC)).data
    assert len(grid.teams) == 36 and sum(len(c) for t in grid.teams for c in t.cells) == 288
    assert all(c.prediction and c.phase == "league" for t in grid.teams for col in t.cells for c in col)
    assert grid.competition == "CL"


def test_missing_main_fixture_preserves_prior_board_instead_of_publishing_reduced_coverage():
    with pytest.raises(ValueError, match="Incomplete"):
        build_grid("CL", 2026, calendar()[:-1], FixedModel(), datetime(2026, 10, 23, tzinfo=UTC))


def test_real_two_and_four_character_uefa_abbreviations_remain_source_codes():
    rows = calendar()
    for row in rows:
        for side in ("homeTeam", "awayTeam"):
            if row[side]["id"] == "1":
                row[side]["teamCode"] = "AZ"
            if row[side]["id"] == "2":
                row[side]["teamCode"] = "LASK"
    grid = build_grid("CL", 2026, rows, FixedModel(), datetime(2026, 10, 23, tzinfo=UTC)).data
    assert {t.code for t in grid.teams} >= {"AZ", "LASK"}


def test_qualifiers_and_unresolved_draws_never_become_fabricated_main_stage_forecasts():
    rows = calendar()
    qualifier = {
        **rows[0],
        "id": "qual",
        "competitionPhase": "QUALIFYING",
        "round": {"phase": "QUALIFYING", "mode": "KNOCK_OUT"},
    }
    unresolved = {
        **rows[0],
        "id": "draw",
        "round": {"phase": "TOURNAMENT", "mode": "KNOCK_OUT"},
        "homeTeam": {"id": "x", "isPlaceHolder": True},
    }
    grid = build_grid("CL", 2026, [*rows, qualifier, unresolved], FixedModel(), datetime(2026, 10, 23, tzinfo=UTC)).data
    assert len(grid.teams) == 36 and sum(len(c) for t in grid.teams for c in t.cells) == 288
    with pytest.raises(ValueError, match="Wrong UEFA competition population"):
        build_grid("CONF", 2026, rows, FixedModel(), datetime(2026, 10, 23, tzinfo=UTC))


def test_conference_full_six_round_board_is_explicitly_provisional():
    rows = [r for r in calendar() if int(r["matchday"]["longName"].split()[-1]) <= 6]
    for row in rows:
        row["competition"] = {"id": "2019", "code": "UECL", "sex": "MALE", "teamCategory": "CLUB"}
    result = build_grid("CONF", 2026, rows, FixedModel(), datetime(2026, 10, 23, tzinfo=UTC))
    assert result.data.competition == "CONF"
    assert len(result.data.teams) == 36 and len(result.data.matchdays) == 6
    assert sum(len(c) for t in result.data.teams for c in t.cells) == 216
    assert "Provisional" in result.meta.model_notes[0].text
    assert "Validated" not in result.meta.model_notes[0].text
    assert "w075" in result.data.model_version
    with pytest.raises(ValueError, match="Incomplete"):
        build_grid("CONF", 2026, rows[:-1], FixedModel(), datetime(2026, 10, 23, tzinfo=UTC))
