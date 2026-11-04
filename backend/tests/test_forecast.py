"""His last ten games' minutes, for the overlay's "comes on" side (plans/overlay-v2.md 1.6)."""

from app.sorare.forecast import bench_record


def game(
    date: str, started: bool | None, mins: int | None, played: bool | None = None, **more: object
) -> dict[str, object]:
    played = (mins or 0) > 0 if played is None else played
    return {
        "date": date,
        "started": started,
        "mins": mins,
        "played": played,
        "status": "FINAL" if played else "DID_NOT_PLAY",
        **more,
    }


def test_the_record_counts_his_last_ten_finished_games_oldest_first() -> None:
    # Abdul Mumin as he stood on 2 Nov 2026: no start, seven games off the bench (22 minutes on average), three unused.
    past = [
        game("2026-10-31", False, 69),
        game("2026-10-24", False, 31),
        game("2026-10-18", False, 0),
        game("2026-10-12", False, 0),
        game("2026-10-04", False, 5),
        game("2026-09-25", False, 24),
        game("2026-09-19", False, 6),
        game("2026-09-12", False, 8),
        game("2026-09-05", False, 12),
        game("2026-08-29", False, 0),
        game("2026-08-22", True, 90),  # an eleventh game: left out
    ]
    assert bench_record(past) == {
        "started": 0,
        "on": 7,
        "unused": 3,
        "minsOn": 22,
        "games": "UOOOOOUUOO",
        "mins": [0, 12, 8, 6, 24, 5, 0, 0, 31, 69],
    }


def test_no_finished_game_no_record() -> None:
    assert bench_record([]) is None
    assert (
        bench_record([{"date": "2026-11-08", "started": False, "mins": None, "played": False, "status": "PENDING"}])
        is None
    )
    assert bench_record([game("2026-11-01", None, None)]) is None  # Sorare did not say his role


def test_a_starter_sent_off_started_and_a_cup_game_counts() -> None:
    past = [
        game("2026-11-01", True, 34, red=True),  # sent off after half an hour: he started
        game("2026-10-29", False, 20, competition="copa-del-rey"),  # a cup game is a game he could come on in
        game("2026-10-25", True, 90),
    ]
    assert bench_record(past) == {
        "started": 2,
        "on": 1,
        "unused": 0,
        "minsOn": 20,
        "games": "SOS",
        "mins": [90, 20, 34],
    }


def test_a_game_not_played_yet_is_skipped() -> None:
    past = [
        {"date": "2026-11-08", "started": False, "mins": None, "played": False, "status": "PENDING"},
        game("2026-11-01", False, 0),
    ]
    assert bench_record(past) == {"started": 0, "on": 0, "unused": 1, "minsOn": None, "games": "U", "mins": [0]}


def test_a_market_row_carries_the_record_and_a_row_without_one_does_not() -> None:
    from app.sorare.model import Forecast
    from app.sorare.publish import market_out

    record = bench_record([game("2026-11-01", False, 20), game("2026-10-25", False, 0)])
    with_it = Forecast(p_play=0.5, mu=40, bench_record=record)
    rows = market_out(
        [{"slug": "a", "name": "A", "pos": "DEF"}, {"slug": "b", "name": "B", "pos": "DEF"}],
        {"a": with_it, "b": Forecast(p_play=0.5, mu=40)},
        {"a": [{"kickoff": "2026-11-08T12:00:00Z"}], "b": [{"kickoff": "2026-11-08T12:00:00Z"}]},
    )
    assert rows[0]["benchRecord"] == {"started": 0, "on": 1, "unused": 1, "minsOn": 20, "games": "UO", "mins": [0, 20]}
    assert "benchRecord" not in rows[1]


def test_the_record_counts_a_game_already_played_this_week() -> None:
    # Mumin on 4 Nov: the week locked on 30 Oct, his 69 minutes on 31 Oct came after it and still belong to "his last ten".
    from datetime import UTC, datetime

    from app.sorare.publish import player_weeks

    rows = [{"player": {"slug": "mumin", "position": "Defender"}}]
    history = {
        "mumin": [
            game("2026-10-24T16:30:00+00:00", False, 31, score=30.0),
            game("2026-10-31T13:00:00+00:00", False, 69, score=45.0),
            {
                "date": "2026-11-08T15:15:00+00:00",
                "started": False,
                "mins": None,
                "played": False,
                "status": "PENDING",
                "score": None,
            },
        ]
    }
    lock = datetime(2026, 10, 30, 18, tzinfo=UTC)
    week = player_weeks(rows, {"mumin": [{}]}, history, lock, None, use_sorare=False)["mumin"]
    assert week.bench_record == {"started": 0, "on": 2, "unused": 0, "minsOn": 50, "games": "OO", "mins": [31, 69]}


def test_a_playing_row_carries_what_the_team_gauge_simulates() -> None:
    # The builder's gauge (plans/overlay-v2.md step 5) runs the planner's simulation: each player's score if he plays and its spread.
    from app.sorare import publish
    from tests.test_sorare_publish import snapshot

    payload = publish.build_payload(snapshot(), runs=2, draws=100)
    week = publish.week_of(payload)
    assert week is not None
    for row in week["playing"]["players"]:
        assert isinstance(row["mu"], float)
        assert row["x"] == round(row["p"] * row["mu"], 1) or abs(row["x"] - row["p"] * row["mu"]) < 0.2
        assert "sd" not in row or row["sd"] > 0
