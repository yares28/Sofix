from datetime import UTC, datetime

from app.schemas import ApiResponse, FixtureGrid, GridCell, GridTeam
from app.services.all_competitions import combine
from app.services.fixture_grid import lens_scales
from tests.test_pipeline import db  # noqa: F401

NOW = datetime(2026, 10, 26, tzinfo=UTC)


def grid(competition, code, name, ident, *, slug=None, kickoff=NOW, points=2):
    cell = GridCell(
        fixture_id=42,
        opponent_code=code,
        venue="H",
        kickoff_utc=kickoff,
        date_confirmed=True,
        rescheduled=False,
        status="scheduled",
        result=None,
        prediction=None
        if points is None
        else dict(
            difficulty=30,
            label="Favourite",
            bucket=2,
            expected_points=points,
            probabilities=dict(win=0.6, draw=0.2, loss=0.2),
            clean_sheet=0.4,
            xg_for=2,
            xg_against=1,
        ),
    )
    return FixtureGrid(
        competition=competition,
        season="2026/27",
        current_matchday=1,
        model_version="test",
        lens_scales=lens_scales([cell]),
        matchdays=[],
        teams=[
            GridTeam(
                code=code, name=name, source_id=ident, sorare_slug=slug, color="#ffffff", crest_url=None, cells=[[cell]]
            )
        ],
    )


def test_merges_verified_clubs_but_not_matching_abbreviations_and_namespaces_fixture_ids():
    result = combine(
        [
            grid("PD", "FCB", "Barcelona", None),
            grid("BL1", "FCB", "Bayern", 5),
            grid("CL", "BAR", "Barcelona", 50080, slug="barcelona-barcelona"),
        ],
        NOW,
    )
    assert len(result.teams) == 2
    barca = next(t for t in result.teams if t.name == "Barcelona")
    assert {c.competition for col in barca.cells for c in col} == {"PD", "CL"}
    assert len({c.fixture_id for t in result.teams for col in t.cells for c in col}) == 3
    assert len({t.code for t in result.teams}) == 2
    assert barca.source_competition == "PD" and barca.source_code == "FCB"


def test_madrid_weeks_keep_sunday_and_monday_apart_and_zero_is_not_missing():
    result = combine(
        [
            grid("PD", "FCB", "Barcelona", None, kickoff=datetime(2026, 10, 25, 22, 30, tzinfo=UTC), points=0),
            grid("CL", "BAR", "Barcelona", 50080, kickoff=datetime(2026, 10, 25, 23, 30, tzinfo=UTC), points=None),
        ],
        NOW,
    )
    cells = [col for col in result.teams[0].cells if col]
    assert len(cells) == 2
    assert cells[0][0].prediction.expected_points == 0
    assert cells[1][0].prediction is None
    assert result.missing_competitions == ["PL", "BL1", "FL1", "EL", "CONF"]


def test_european_only_club_keeps_source_and_duplicate_feed_does_not_duplicate_games():
    source = grid("EL", "CEL", "Celtic", 50050)
    result = combine([source, source], NOW)
    assert len(result.teams) == 1
    assert sum(map(len, result.teams[0].cells)) == 1
    assert result.teams[0].source_competition == "EL"


def test_published_shards_reassemble_through_api_and_missing_shard_is_an_error(db):  # noqa: F811
    from app.api import fixture_grid
    from app.models import ReadModel
    from app.services.all_competitions import publish
    from app.services.publish import put

    source = grid("PL", "ARS", "Arsenal", 57)
    source.teams = [
        source.teams[0].model_copy(
            update={
                "code": f"T{i}",
                "source_id": i + 1,
                "name": f"Club {i}",
                "cells": [[source.teams[0].cells[0][0].model_copy(update={"opponent_code": f"T{i}"})]],
            }
        )
        for i in range(61)
    ]
    put(db, "grid:PL", ApiResponse[FixtureGrid](success=True, data=source).model_dump(mode="json"), NOW)
    result = publish(db, NOW)
    assert result["teams"] == 61
    manifest = db.get(ReadModel, "grid:ALL").payload
    assert len(manifest["team_blocks"]) == 3
    assert manifest["data"]["teams"] == []
    response = fixture_grid(competition="ALL", db=db)
    assert response.success and len(response.data.teams) == 61
    db.delete(db.get(ReadModel, manifest["team_blocks"][0]))
    db.flush()
    assert not fixture_grid(competition="ALL", db=db).success
