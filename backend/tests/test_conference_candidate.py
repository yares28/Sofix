"""Freeze training inputs without constructing replacement holdout predictions."""

from copy import deepcopy

import pytest

from app.research.conference_candidate import average_numbers, training_rows
from app.research.european_cases import digest
from app.research.league_xscore_data import when


def packet(rows):
    saved = {"players": rows}
    return {**saved, "featureSha256": digest(saved)}


def test_training_uses_only_approved_seasons_and_correct_competition():
    rows = [{"competition": "CONF", "season": y} for y in (2023, 2024, 2025, 2026)]
    rows += [{"competition": "EL", "season": 2023}]
    assert training_rows(packet(rows), expected_starts=2) == rows[:2]
    changed = deepcopy(rows)
    changed[2]["score"] = 99999
    assert training_rows(packet(changed), expected_starts=2) == rows[:2]
    with pytest.raises(ValueError, match="coverage"):
        training_rows(packet(rows), expected_starts=3)


def test_average_uses_only_available_competition_results_and_neutral_symmetry():
    rows = [
        {"competition": "CONF", "date": "2024-01-01T18:00Z", "availableAt": "2024-01-03T18:00Z", "hg": 4, "ag": 1},
        {"competition": "CONF", "date": "2024-01-04T18:00Z", "availableAt": "2024-01-08T18:00Z", "hg": 99, "ag": 0},
        {"competition": "EL", "date": "2024-01-01T18:00Z", "availableAt": "2024-01-03T18:00Z", "hg": 99, "ag": 0},
    ]
    cutoff = when("2024-01-07T18:00Z")
    home = average_numbers(rows, cutoff, neutral=False, home=True)
    away = average_numbers(rows, cutoff, neutral=False, home=False)
    assert home["xgf"] == away["xga"] == 4
    assert home["xga"] == away["xgf"] == 1
    left = average_numbers(rows, cutoff, neutral=True, home=True)
    right = average_numbers(rows, cutoff, neutral=True, home=False)
    assert left == right
    assert left["xgf"] == left["xga"] == 2.5
    with pytest.raises(ValueError, match="history"):
        average_numbers(rows, when("2023-01-01T18:00Z"), neutral=False, home=True)
