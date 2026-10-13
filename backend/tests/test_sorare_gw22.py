"""What the owner found on the GW22 plan, 13 Oct 2026: Sorare's European competitions were dropped, a free team under half a percent was
never added, and Sorare's starting chance (read from its page by the extension) never reached the plan."""

from __future__ import annotations

from datetime import UTC, datetime

from app.sorare.forecast import PlayerWeek, forecast
from app.sorare.planner import MIN_CHANCE, plans
from app.sorare.publish import in_week, player_weeks
from tests.test_sorare_planner import card, forecasts_for, in_season_comp


def test_a_european_competition_takes_whoever_plays_in_it():
    champions = in_season_comp(key="European Champions | Limited", leagues=frozenset({"uefa-champions-league"}))
    madrid, betis = card("madrid", "MID"), card("betis", "MID")  # both LaLiga clubs
    assert not champions.allows(madrid)
    games = {"madrid": [{"competition": "uefa-champions-league"}], "betis": [{"competition": "uefa-europa-league"}]}
    madrid, betis = in_week([madrid, betis], games)
    assert champions.allows(madrid) and not champions.allows(betis)
    assert in_season_comp().allows(betis)  # his own league's competition is as it was


def test_a_free_team_is_added_whatever_its_chance():
    cards = [card(f"p{i}", ("GK", "DEF", "MID", "FWD", "MID")[i % 5]) for i in range(20)]  # four lineups' worth
    comp = in_season_comp(reference={1: 900.0, 100: 800.0}, min_in_season=0)  # a reward nobody here can reach
    found = plans([comp], cards, forecasts_for(cards, p=0.9, mu=40.0), count=1, runs=1, draws=300)
    lineups = found[0].lineups
    assert len(lineups) == comp.teams_cap == 4
    assert all(lu.p_return < MIN_CHANCE for lu in lineups)
    used = [c.slug for lu in lineups for c in lu.cards]
    assert len(used) == len(set(used))


def test_sorares_seen_starting_chance_is_the_start_chance():
    week = PlayerWeek(games=1, projection=50.0, start_odds=0.3, pos="MID")
    made = forecast(week)
    assert made.p_start == 0.3 and made.start_source == "sorare" and made.by_source["sorare"] == 0.3
    assert 0.3 < made.p_play < 0.6  # the rest is his chance of coming on, from form
    assert (
        forecast(PlayerWeek(games=1, projection=50.0, start_odds=0.9, pos="GK")).p_play < 0.91
    )  # a keeper hardly comes on


def test_a_reading_counts_only_for_its_game_and_from_before_the_lock():
    lock = datetime(2026, 10, 13, 14, tzinfo=UTC)
    rows = [{"player": {"slug": "koke", "position": "Midfielder"}}]
    games = {"koke": [{"id": "Game:a", "kickoff": "2026-10-13T19:00:00Z"}]}
    before, after = lock.timestamp() - 3600, lock.timestamp() + 60

    def start(seen):
        return player_weeks(rows, games, {}, lock, None, use_sorare=True, seen=seen)["koke"].start_odds

    assert start({"Game:a": {"koke": [3000, before]}}) == 0.3
    assert start({"Game:a": {"koke": [0, before]}}) == 0.0  # 0% is a reading too
    assert start({"Game:a": {"koke": [3000, after]}}) is None
    assert start({"Game:b": {"koke": [3000, before]}}) is None
    assert start(None) is None
