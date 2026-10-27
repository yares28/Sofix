"""A foreign board is rewritten only when something in it changed (plans/multi-competition-review.md B3)."""

import json
from datetime import UTC, datetime, timedelta

from app.jobs import sorare
from app.models import ReadModel
from app.services import board_checks
from app.services.league_fdr import build_league_grid
from app.sorare import foreign_scores
from tests.test_league_fdr import sample
from tests.test_pipeline import db  # noqa: F401

NOW = datetime(2026, 10, 21, 9, tzinfo=UTC)
LATER = NOW + timedelta(hours=2)


def dump(body):
    return json.dumps(body.model_dump(mode="json"), sort_keys=True)


def cells(body):
    return [c for t in body.data.teams for col in t.cells for c in col]


def test_a_refit_that_moves_nothing_gives_the_same_bytes():
    payload, history = sample()
    first = build_league_grid("PL", payload, history, NOW)
    again = build_league_grid("PL", payload, history, LATER, first.model_copy(deep=True))
    assert dump(again) == dump(first)
    assert again.meta.last_synced_at == again.meta.last_predicted_at == NOW


def test_a_wobble_in_the_fifth_decimal_keeps_the_old_forecast_and_a_real_move_does_not():
    payload, history = sample()
    first = build_league_grid("PL", payload, history, NOW)
    shifted = first.model_copy(deep=True)
    for cell in cells(shifted):
        cell.prediction.probabilities.win += 1e-5  # the European fit's hourly drift is this size
    again = build_league_grid("PL", payload, history, LATER, shifted)
    assert dump(again) == dump(shifted)

    moved = first.model_copy(deep=True)
    target = cells(moved)[0]
    target.prediction.probabilities.win += 0.01
    again = build_league_grid("PL", payload, history, LATER, moved)
    fresh = [c for c in cells(again) if c.forecast_at == LATER]
    assert [(c.fixture_id, c.venue) for c in fresh] == [(target.fixture_id, target.venue)]
    assert again.meta.last_predicted_at == LATER  # a number changed
    assert again.meta.last_synced_at == NOW  # the fixtures did not


def test_a_moved_kickoff_counts_as_a_fixture_change():
    payload, history = sample()
    first = build_league_grid("PL", payload, history, NOW)
    payload["matches"][0]["utcDate"] = "2026-11-02T20:00:00Z"
    again = build_league_grid("PL", payload, history, LATER, first.model_copy(deep=True))
    assert again.meta.last_synced_at == LATER


def test_checks_are_merged_per_competition(db):  # noqa: F811
    board_checks.record(db, ["PL"], NOW)
    board_checks.record(db, ["CL", "EL", "CONF"], LATER)
    assert db.get(ReadModel, board_checks.KEY).payload == {
        "PL": NOW.isoformat(),
        "CL": LATER.isoformat(),
        "EL": LATER.isoformat(),
        "CONF": LATER.isoformat(),
    }


def test_european_xscores_follow_the_last_check_not_the_last_change():
    now = datetime(2026, 10, 23, 12, tzinfo=UTC)
    grid = {
        "competition": "CL",
        "model_version": foreign_scores.expected_version("CL"),
        "teams": [{"sorare_slug": f"club-{i}"} for i in range(36)],
    }
    envelope = {"data": grid, "meta": {"last_predicted_at": (now - timedelta(hours=7)).isoformat()}}
    checks = {board_checks.KEY: {"CL": (now - timedelta(hours=1)).isoformat()}}
    assert "CL" in sorare.foreign_inputs({"grid:CL": envelope, **checks}, now)[1]
    checks[board_checks.KEY]["CL"] = (now - timedelta(hours=7)).isoformat()
    assert "CL" not in sorare.foreign_inputs({"grid:CL": envelope, **checks}, now)[1]
    assert "CL" not in sorare.foreign_inputs({"grid:CL": envelope}, now)[1]  # never checked: its own time


def test_each_board_lists_only_the_lenses_that_colour_something():
    # plans/multi-competition-review.md B4: no bookmaker prices on the foreign boards, so no Odds or Vs odds lens.
    payload, history = sample()
    board = build_league_grid("PL", payload, history, NOW)
    assert board.data.lenses is not None
    assert {"overall", "attack", "defence"} <= set(board.data.lenses)
    assert "odds" not in board.data.lenses and "market_record" not in board.data.lenses
    kept = board.model_dump(mode="json")
    kept["data"].pop("lenses")  # a block from before the field: filled again from its cells
    again = type(board).model_validate(kept)
    assert again.data.lenses == board.data.lenses
