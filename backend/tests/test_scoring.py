import pytest

from app.services.scoring import LABELS, THRESHOLDS, difficulty_label, difficulty_score, label_bucket


def test_easy():
    assert difficulty_score(0.7, 0.2, 0.1) < 40


def test_hard():
    assert difficulty_score(0.15, 0.2, 0.65) > 70


def test_labels_run_from_kindest_to_hardest():
    assert [difficulty_label(x, "H") for x in (30, 40, 55, 68, 80)] == list(LABELS)


def test_the_top_band_is_harder_to_reach_away_from_home():
    # 30 is a top-band tile at home and only the second band away: the same number, a different chance of
    # winning, which is the whole point of splitting the cut.
    assert difficulty_label(30, "H") == "Very favourite"
    assert difficulty_label(30, "A") == "Favourite"
    # Below the away cut both venues agree, and above the shared cuts they always do.
    assert difficulty_label(20, "H") == difficulty_label(20, "A") == "Very favourite"
    assert difficulty_label(80, "H") == difficulty_label(80, "A") == "Big underdog"


def test_only_the_top_cut_differs_by_venue():
    assert THRESHOLDS["H"][1:] == THRESHOLDS["A"][1:]
    assert THRESHOLDS["A"][0] < THRESHOLDS["H"][0]


def test_a_score_exactly_on_a_cut_takes_the_kinder_label():
    for venue, cuts in THRESHOLDS.items():
        assert [difficulty_label(cut, venue) for cut in cuts] == list(LABELS[:4])


def test_an_unknown_venue_falls_back_to_the_home_scale():
    assert difficulty_label(30, "?") == difficulty_label(30, "H")


def test_bucket_comes_from_the_label():
    assert [label_bucket(label) for label in LABELS] == [1, 2, 3, 4, 5]
    with pytest.raises(ValueError):
        label_bucket("Easy")  # the old vocabulary is gone
