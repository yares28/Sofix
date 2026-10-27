"""Games Futbol Fantasy does not cover join the Lineups page from Sorare's schedule (plans/multi-competition-review.md D5)."""

from datetime import UTC, datetime

from app.sorare import ff_lineups

NOW = datetime(2026, 10, 30, 12, tzinfo=UTC)


def game(gid, slug, date, home="Arsenal", away="Chelsea"):
    team = lambda name: {
        "slug": name.lower(),
        "name": f"{name} FC",
        "shortName": name,
        "pictureUrl": f"https://assets.sorare.com/team/{name}.png",
    }  # noqa: E731
    return {"id": gid, "date": date, "competition": {"slug": slug}, "homeTeam": team(home), "awayTeam": team(away)}


def test_the_weeks_uncovered_games_join_once_each_tied_to_sorare_with_nothing_from_futbol_fantasy():
    games = [
        game("Game:pl", "premier-league-gb-eng", "2026-11-01T15:00:00Z"),
        game("Game:pl", "premier-league-gb-eng", "2026-11-01T15:00:00Z"),  # the same game seen from both squads
        game("Game:conf", "uefa-europa-conference-league", "2026-11-06T17:45:00Z", "Mainz", "Fiorentina"),
        game("Game:laliga", "laliga-es", "2026-11-01T20:00:00Z"),  # Futbol Fantasy has it
        game("Game:old", "bundesliga-de", "2026-10-29T19:30:00Z"),  # played over 12 hours ago
    ]
    found = ff_lineups.sorare_matches(games, NOW)
    assert [m["sorare"]["id"] for m in found] == ["Game:pl", "Game:conf"]
    first = found[0]
    assert first["ff"] is False and first["url"] == "" and first["competitionName"] == "Premier League"
    assert first["home"]["name"] == "Arsenal" and first["home"]["crest"].startswith("https://assets.sorare.com/team/")
    assert first["home"]["published"] is False and first["home"]["rows"] == []
    assert 1_000_000_000 <= first["id"] < 2_000_000_000  # a number of its own, above Futbol Fantasy's ids
    assert ff_lineups.sorare_matches(games, NOW)[0]["id"] == first["id"]  # the same each run


def test_they_are_kept_by_day_like_the_others():
    from app.sorare.ff_feed import Feed

    found = ff_lineups.sorare_matches([game("Game:pl", "premier-league-gb-eng", "2026-11-01T15:00:00Z")], NOW)
    days = ff_lineups.kept_days(Feed(), None, [], {}, NOW, others=found)
    assert list(days) == ["2026-11-01"] and list(days["2026-11-01"]["matches"]) == [str(found[0]["id"])]
