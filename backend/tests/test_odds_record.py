"""A club's record at the price it is given."""

import numpy as np
import pandas as pd
import pytest

from app.services.odds_record import MIN_GAMES, PRIOR_GAMES, OddsRecord, band_of, build_record


def matches(rows):
    """rows: (home, away, home_goals, away_goals, home_win_probability) with a fair, margin-free book."""
    out = []
    for home, away, hg, ag, p in rows:
        draw = 0.25
        away_p = max(1 - p - draw, 0.01)
        out.append(
            {
                "season_start": 2024,
                "home": home,
                "away": away,
                "hg": hg,
                "ag": ag,
                "odds_h": 1 / p,
                "odds_d": 1 / draw,
                "odds_a": 1 / away_p,
            }
        )
    return pd.DataFrame(out)


def test_bands_cover_every_probability():
    assert band_of(0.0) == "under 20%"
    assert band_of(0.199) == "under 20%" and band_of(0.2) == "20-35%"
    assert band_of(0.65) == "65% or more" and band_of(1.0) == "65% or more"
    assert band_of(float("nan")) is None


def test_a_club_that_beats_its_price_gets_a_positive_edge():
    # Ten games priced around 55%: our club wins 9, the rest of the league wins half.
    rows = [("Over", "X", 2, 0, 0.55) for _ in range(9)] + [("Over", "X", 0, 1, 0.55)]
    rows += [("Other", "Y", 1, 0, 0.55) for _ in range(10)] + [("Other", "Y", 0, 1, 0.55) for _ in range(10)]
    record = OddsRecord(matches(rows))

    over = record.for_club("Over", 0.55)
    assert over is not None
    assert (over.games, over.wins) == (10, 9)
    assert over.rate == pytest.approx(0.9)
    assert over.league == pytest.approx(record.league["50-65%"])
    assert over.edge > 0
    # Shrinkage: the shown edge is smaller than the raw gap, and it is the prior that does it.
    assert over.edge < over.rate - over.league
    expected = (over.wins + PRIOR_GAMES * over.league) / (over.games + PRIOR_GAMES) - over.league
    assert over.edge == pytest.approx(expected)


def test_a_club_that_falls_short_gets_a_negative_edge():
    rows = [("Under", "X", 0, 1, 0.55) for _ in range(9)] + [("Under", "X", 2, 0, 0.55)]
    rows += [("Other", "Y", 1, 0, 0.55) for _ in range(10)] + [("Other", "Y", 0, 1, 0.55) for _ in range(10)]
    record = OddsRecord(matches(rows))
    under = record.for_club("Under", 0.55)
    assert under is not None and under.edge < 0 and under.rate == pytest.approx(0.1)


def test_a_thin_sample_has_no_record_to_show():
    rows = [("Thin", "X", 1, 0, 0.55) for _ in range(MIN_GAMES - 1)]
    rows += [("Other", "Y", 1, 0, 0.55) for _ in range(20)]
    record = OddsRecord(matches(rows))
    assert record.for_club("Thin", 0.55) is None
    assert record.for_club("Never heard of them", 0.55) is None


def test_a_price_in_a_band_the_league_never_played_has_no_record():
    rows = [("A", "B", 1, 0, 0.55) for _ in range(20)]
    assert OddsRecord(matches(rows)).for_club("A", 0.10) is None


def test_the_away_side_is_counted_too():
    # The away club is priced at 1 - p - draw = 0.25, and wins every time.
    rows = [("H", "Away", 0, 2, 0.50) for _ in range(10)]
    record = OddsRecord(matches(rows))
    away = record.for_club("Away", 0.25)
    assert away is not None and (away.games, away.wins) == (10, 10)


def test_matches_without_a_price_are_skipped():
    frame = matches([("A", "B", 1, 0, 0.55) for _ in range(10)])
    frame.loc[frame.index[:6], "odds_h"] = np.nan
    record = OddsRecord(frame)
    assert record.for_club("A", 0.55) is None  # only 4 priced games, below the floor


def test_build_keeps_the_recent_seasons_only():
    frame = matches([("A", "B", 1, 0, 0.55) for _ in range(20)])
    frame.loc[frame.index[:10], "season_start"] = 2018  # older than the window
    record = build_record(frame, season_start=2026, seasons=5)
    club = record.for_club("A", 0.55)
    assert club is not None and club.games == 10


def test_as_dict_is_json_ready():
    rows = [("A", "B", 1, 0, 0.55) for _ in range(10)] + [("A", "B", 0, 1, 0.55) for _ in range(10)]
    record = OddsRecord(matches(rows)).for_club("A", 0.55)
    assert record is not None
    payload = record.as_dict()
    assert set(payload) == {"band", "games", "wins", "rate", "league", "edge"}
    assert isinstance(payload["games"], int) and isinstance(payload["rate"], float)
