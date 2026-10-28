"""The score a reward needs, from every comparable finished week of the season (plans/plan-algorithm-v2.md step 2).

On GW13-25 the mean of the comparable earlier weeks missed the real cut-off by 24.3 points; the latest comparable week alone, by 29.2.
"""

from __future__ import annotations

from app.sorare.publish import read_competitions, season_reference
from app.sorare.sync import comparable_weeks

KEY = "LALIGA EA SPORTS | Limited"


def week(slug: str, games: int) -> dict:
    return {"slug": slug, "number": int(slug[1:]), "games": games}


def test_the_bar_at_each_rank_is_the_mean_of_the_weeks():
    references = {
        "w1": {KEY: {"gameweek": 1, "entries": 4000, "cuts": {"50": 440.0, "1500": 300.0, "4000": 0.0}}},
        "w2": {KEY: {"gameweek": 2, "entries": 5000, "cuts": {"50": 460.0, "1500": 320.0, "5000": 0.0}}},
    }
    merged = season_reference(references, ["w1", "w2"])[KEY]
    assert merged["cuts"][50] == 450.0 and merged["cuts"][1500] == 310.0
    assert merged["label"] == "2 weeks"


def test_a_week_whose_whole_field_fits_under_a_rank_says_nothing_about_it():
    """Rank 4500 was past the last entry of a 4,000-lineup week (anyone was paid): only the bigger week tells what it took."""
    references = {
        "w1": {KEY: {"gameweek": 1, "entries": 4000, "cuts": {"1500": 300.0, "4000": 0.0}}},
        "w2": {KEY: {"gameweek": 2, "entries": 5000, "cuts": {"1500": 320.0, "4500": 200.0, "5000": 0.0}}},
    }
    assert season_reference(references, ["w1", "w2"])[KEY]["cuts"][4500] == 200.0


def test_rooms_are_pooled_and_one_week_keeps_its_name():
    references = {
        "w1": {"All Star | Cap 260": {"gameweek": 1, "rooms": [300.0, 250.0]}},
        "w2": {"All Star | Cap 260": {"gameweek": 2, "rooms": [280.0]}},
        "w3": {KEY: {"gameweek": 3, "entries": 10, "cuts": {"5": 400.0, "10": 0.0}}},
    }
    merged = season_reference(references, ["w1", "w2", "w3"])
    assert sorted(merged["All Star | Cap 260"]["rooms"]) == [250.0, 280.0, 300.0]
    assert merged[KEY]["label"] == "GW3"
    comps = read_competitions(
        [
            {
                "league": "LALIGA EA SPORTS", "track": "Limited", "slug": "x", "mainRarityType": "limited", "teamsCap": 4,
                "rules": {"competitions": [{"slug": "laliga-es"}]},
                "appearances": [{"name": n, "positions": [], "sub": False} for n in ("goalkeeper", "defender", "midfielder", "forward", "extra")],
            }
        ],
        merged,
    )  # fmt: skip
    assert comps and comps[0].reference_from == "GW3" and comps[0].reference[5] == 400.0


def test_comparable_weeks_hold_about_as_much_football():
    done = [week("w1", 280), week("w2", 60), week("w3", 300), week("w4", 0)]
    assert [w["slug"] for w in comparable_weeks(done, {"games": 290})] == ["w1", "w3"]
    assert [w["slug"] for w in comparable_weeks(done, {"games": 70})] == ["w2"]
    assert comparable_weeks(done, {"games": 0}) == []


def test_a_run_counts_games_once_and_fills_one_missing_week(monkeypatch):
    from app.sorare import sync

    counted: list[str] = []
    fetched: list[str] = []
    games = {"w1": 280, "w2": 60, "w3": 300, "w4": 290}
    monkeypatch.setattr(sync, "games_summary", lambda client, slug: (counted.append(slug) or games[slug], 0))

    def fake_reference(client, slug, number, comps, cached=None):
        fetched.append(slug)
        return {**(cached or {}), KEY: {"gameweek": number, "entries": 10, "cuts": {"5": 400.0}}}

    monkeypatch.setattr(sync, "reference_scores", fake_reference)
    done = [{"slug": s, "number": int(s[1:])} for s in ("w1", "w2", "w3", "w4")]
    planned = [
        {"league": "LALIGA EA SPORTS", "track": "Limited"},
        {"league": "All Star", "track": "Cap 260", "roomsConfig": {"roomsSize": 10}},
    ]
    references = {"w4": {KEY: {"gameweek": 4, "cuts": {"5": 390.0}}}, sync.GAMES_KEY: {"w4": 290}}
    target = {"slug": "w5", "games": 295}

    first = sync.season_weeks(None, [], done, target, planned, references)  # type: ignore[arg-type]
    assert counted == ["w1", "w2", "w3"]  # w4 was counted by an earlier run
    assert fetched == ["w3"]  # the newest comparable week the record lacks; rooms never fetched
    assert first == ["w3", "w4"]
    counted.clear()
    second = sync.season_weeks(None, [], done, target, planned, references)  # type: ignore[arg-type]
    assert counted == [] and fetched == ["w3", "w1"] and second == ["w1", "w3", "w4"]
