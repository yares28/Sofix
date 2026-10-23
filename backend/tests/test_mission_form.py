from datetime import UTC, datetime, timedelta

from app.sorare import mission_form
from app.sorare.mission_pool import rolling_sheets


def test_form_uses_appearances_season_and_subs_without_leaking_mission_day():
    now = datetime(2026, 10, 10, 12, tzinfo=UTC)
    games = [
        {
            "gameId": str(i),
            "date": (now - timedelta(days=i + 1)).isoformat(),
            "status": "FINAL",
            "played": True,
            "started": i % 2 == 0,
            "score": 50 + i,
            "mins": 90 if i % 2 == 0 else 20,
            "stats": [{"stat": "accurate_pass", "statValue": i * 10}, {"stat": "saves", "statValue": i}],
        }
        for i in range(12)
    ]
    games += [
        {**games[0], "gameId": "today", "date": now.replace(hour=9).isoformat(), "stats": {"accurate_pass": 999}},
        {**games[0], "gameId": "previous-season", "date": "2026-06-30T20:00:00Z", "stats": {"accurate_pass": 999}},
        {**games[0], "gameId": "dnp", "played": False},
        {**games[0], "gameId": "unknown", "stats": None},
        {**games[0], "gameId": "pending", "status": "PENDING"},
    ]
    sheet = rolling_sheets({"a": games}, {"a": "MID"}, now, leagues={"a": "laliga-es"})["players"]["a"]
    form = sheet["form"]
    assert form["season"] == "2026/27"
    assert form["windows"]["l5"]["means"]["accurate_pass"] == 15  # unknown appearance stays in the five
    assert form["windows"]["l5"]["samples"]["accurate_pass"] == 4
    assert form["windows"]["l10"]["n"] == 10
    assert form["windows"]["season"]["means"]["accurate_pass"] == 55
    assert form["windows"]["starts"]["means"]["accurate_pass"] == 50
    assert form["windows"]["subs"]["means"]["accurate_pass"] == 60
    assert form["dnp"] == 1 and form["missing"] == 1
    assert "saves" in form["windows"]["season"]["means"]


def test_substitute_only_zero_and_missing_are_distinct_and_season_rolls_in_july():
    g = {
        "gameId": "g",
        "date": "2026-06-30T20:00:00Z",
        "status": "FINAL",
        "played": True,
        "started": False,
        "score": 0,
        "mins": 15,
        "stats": [],
    }
    form = rolling_sheets({"a": [g]}, {"a": "MID"}, datetime(2026, 7, 1, 12, tzinfo=UTC), leagues={"a": "laliga-es"})[
        "players"
    ]["a"]["form"]
    assert form["windows"]["l5"]["means"]["accurate_pass"] == 0
    assert form["windows"]["l5"]["means"]["score"] == 0
    assert form["windows"]["starts"]["n"] == 0
    assert form["windows"]["season"]["n"] == 0


def test_seasons_follow_the_clubs_league_including_japan_transition_and_unknown():
    g = {
        "gameId": "a",
        "date": "2026-03-01T12:00:00Z",
        "status": "FINAL",
        "played": True,
        "started": True,
        "stats": {"goals": 1},
    }
    before = datetime(2026, 10, 10, 8, tzinfo=UTC)
    for league in ("superliga-argentina-de-futbol", "allsvenskan", "k-league-1"):
        form = mission_form.build([g], "MID", before, league=league)
        assert form["season"] == "2026" and form["windows"]["season"]["n"] == 1
        assert form["seasonFrom"] == "2026-01-01T00:00:00+00:00"
    japan = mission_form.build([g], "MID", before, league="j2-league")
    assert japan["season"] == "2026/27" and japan["windows"]["season"]["n"] == 0
    spring = mission_form.build([g], "MID", before.replace(month=6), league="j2-league")
    assert spring["season"] == "2026 transition" and spring["windows"]["season"]["n"] == 1
    old = mission_form.build(
        [{**g, "date": "2025-03-01T12:00:00Z"}], "MID", before.replace(year=2025), league="j2-league"
    )
    assert old["season"] == "2025" and old["windows"]["season"]["n"] == 1
    unknown = mission_form.build([g], "MID", before, league="unverified-league")
    assert unknown["season"] == "Season unavailable" and unknown["windows"]["season"]["n"] == 0
    assert unknown["windows"]["l5"]["n"] == 1


def test_chance_weights_recent_starter_and_substitute_form_separately():
    window = {"n": 1, "means": {"accurate_pass": 10}, "samples": {"accurate_pass": 1}}
    form = {
        "recent": [
            {"started": True, "values": {"accurate_pass": 80}},
            {"started": False, "values": {"accurate_pass": 10}},
        ],
        "windows": {"starts": window, "subs": window},
    }
    chance = mission_form.chance({"kind": "pass", "atLeast": 70}, {"pStart": 0.6, "pOn": 0.3}, {}, form)
    assert chance is not None and 0.50 < chance < 0.55
    assert mission_form.chance({"kind": "score"}, {}, {}, form) is None


def test_decisive_odds_do_not_depend_on_start_chance():
    form = {
        "recent": [
            {"started": True, "values": {"decisive": 1}},
            {"started": True, "values": {"decisive": 0}},
            {"started": False, "values": {"decisive": 0}},
        ],
        "windows": {"starts": {"means": {}}},
    }
    for ps in (0, 0.2, 1):
        assert (
            mission_form.chance({"kind": "decisive"}, {"pStart": ps, "pOn": 0.1, "shape": {"p": 0.65}}, {}, form)
            == 0.65
        )
        assert mission_form.chance({"kind": "decisive"}, {"pStart": ps}, {}, form) == 0.5


def test_arcade_market_keeps_conditional_probability_for_the_first_fixture():
    from types import SimpleNamespace

    from app.sorare.model import Forecast
    from app.sorare.publish import market_out

    f = Forecast(p_play=0.2, mu=50, shape=SimpleNamespace(p_decisive=0.65))
    rows = market_out([{"slug": "a", "name": "A", "pos": "GK"}], {"a": f}, {"a": [{"kickoff": "2026-10-24T12:00:00Z"}]})
    assert rows[0]["decisive"] == 0.65


def test_arcade_xd_is_the_first_fixtures_expected_value_not_the_better_game_of_a_double():
    from types import SimpleNamespace

    from app.sorare.model import Forecast
    from app.sorare.publish import market_out

    games = {"a": [{"kickoff": "2026-10-24T12:00:00Z"}, {"kickoff": "2026-10-26T12:00:00Z"}]}
    f = Forecast(
        p_play=0.9,
        mu=50,
        games=2,
        p_start=0,
        p_on=0.2,
        xd=0.8,
        shape=SimpleNamespace(p_decisive=0.65),
        on_shape=SimpleNamespace(p_decisive=0.1),
    )
    row = market_out([{"slug": "a", "name": "A", "pos": "GK"}], {"a": f}, games)[0]
    assert row["decisive"] == 0.65
    assert row["xd"] == 0.02
    f.games = 1
    f.xd = 0.0
    assert market_out([{"slug": "a", "name": "A", "pos": "GK"}], {"a": f}, games)[0]["xd"] == 0.0
    f.xd = None
    assert "xd" not in market_out([{"slug": "a", "name": "A", "pos": "GK"}], {"a": f}, games)[0]
