"""From one Sorare snapshot to the finished Play page the app renders."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from app.jobs import sorare as sorare_job
from app.models import ReadModel
from app.sorare import publish
from tests.test_pipeline import db  # noqa: F401  (fixture)

PLAN_GW = {
    "slug": "gw-plan",
    "number": 21,
    "name": "Game Week 21",
    "state": "opened",
    "start": "2026-10-09T14:00:00+00:00",
    "end": "2026-10-13T13:59:00+00:00",
    "lock": "2026-10-09T14:00:00+00:00",
    "games": 250,
}
PAST_GW = {
    "slug": "gw-past",
    "number": 15,
    "name": "Game Week 15",
    "state": "closed",
    "start": "2026-09-18T14:00:00+00:00",
    "end": "2026-09-22T13:59:00+00:00",
    "lock": "2026-09-18T14:00:00+00:00",
    "games": 261,
}


AHEAD_GW = {
    "slug": "gw-ahead",
    "number": 22,
    "name": "Game Week 22",
    "state": "opened",
    "start": "2026-10-16T14:00:00+00:00",
    "end": "2026-10-20T13:59:00+00:00",
    "lock": "2026-10-16T14:00:00+00:00",
    "games": 240,
}


def slots(size: int, subs: int) -> list[dict[str, Any]]:
    names = ["goalkeeper", "defender", "midfielder", "forward", "extra", "defender", "midfielder"][:size]
    out = [{"name": n, "sub": False} for n in names]
    out += [{"name": n, "sub": True} for n in ["sub_goalkeeper", "sub_extra"][:subs]]
    return out


def competition(
    league: str,
    track: str,
    *,
    size: int = 5,
    subs: int = 2,
    in_season: bool = True,
    leagues: list[str] | None = None,
    fee: int = 0,
    cap: int | None = None,
    age_max: int | None = None,
) -> dict[str, Any]:
    typed = [{"key": "Scarcity"}] + ([{"key": "SeasonBonus"}] if in_season else [])
    return {
        "league": league,
        "track": track,
        "slug": f"{league}-{track}".lower().replace(" ", "-"),
        "id": "So5Leaderboard:" + f"{league}-{track}".lower().replace(" ", "-"),
        "mainRarityType": "limited",
        "so5LineupsCount": 4000,
        "teamsCap": 4,
        "format": {
            "title": "In Season" if in_season else "Classic",
            "entryItem": {"__typename": "So5CardShardsEntryItem", "quantity": fee, "rarity": "limited"}
            if fee
            else None,
        },
        "roomsConfig": {"roomsSize": 10} if fee else None,
        "rules": {
            "lockType": "FIXTURE_CUT_OFF",
            "rarities": ["unique", "super_rare", "rare", "limited"],
            "sumOfAverageScores": cap,
            "age": {"min": None, "max": age_max, "cutOffDate": "2026-07-01"} if age_max else None,
            "competitions": [{"slug": s} for s in (leagues or [])],
            "appearances": slots(size, 0 if fee else subs),
        },
        "engineConfiguration": {
            "season": 0.05,
            "captain": 0.2 if fee else 0.5,
            "grade": 0.01,
            "scarcity": {"limited": 0, "rare": 0},
            "sameActiveClub": None if fee else {"bonus": 0.02, "number_players_per_club": {"max": 2}},
            "averageScores": None if fee else {"max": 260, "bonus": 0.04},
        },
        "displayedTypedRules": typed,
        "rewardsConfig": {
            "ranking": [
                {
                    "fromRank": 1,
                    "toRank": 50,
                    "rewardConfigs": [{"__typename": "MonetaryRewardConfig", "amount": {"usdCents": 1000}}],
                },
                {
                    "fromRank": 51,
                    "toRank": 1500,
                    "rewardConfigs": [{"__typename": "CardShardRewardConfig", "rarity": "limited", "quantity": 250}],
                },
            ]
        },
        "appearances": slots(size, 0 if fee else subs),
        "projectionsAt": "2026-10-07T18:00:00Z",
    }


def card(
    slug: str,
    position: str,
    *,
    in_season: bool = True,
    sealed: bool = False,
    league: str = "laliga-es",
    club: str = "club-a",
    projection: float = 55.0,
    plays: int = 9000,
    games: int = 1,
    born: str = "1997-05-05",
    ahead: bool = True,
) -> dict[str, Any]:
    game = {
        "id": f"game-{slug}",
        "date": "2026-10-10T14:00:00Z",
        "competition": {"slug": league},
        "homeTeam": {"slug": club, "name": "Club A", "pictureUrl": "https://assets.sorare.com/a.png"},
        "awayTeam": {"slug": "club-z", "name": "Club Z", "pictureUrl": "https://assets.sorare.com/z.png"},
    }
    past_game = {**game, "id": f"past-{slug}", "date": "2026-09-19T14:00:00Z"}
    return {
        "slug": slug,
        "rarityTyped": "limited",
        "seasonYear": 2026,
        "inSeasonEligible": in_season,
        "sealed": sealed,
        "grade": 2,
        "pictureUrl": f"https://assets.sorare.com/{slug}.png",
        "anyPositions": [{"GK": "Goalkeeper", "DEF": "Defender", "MID": "Midfielder", "FWD": "Forward"}[position]],
        "liveSingleSaleOffer": None,
        "sentInLiveOffers": [],
        "player": {
            "slug": slug,
            "displayName": slug.replace("-", " ").title(),
            "position": {"GK": "Goalkeeper", "DEF": "Defender", "MID": "Midfielder", "FWD": "Forward"}[position],
            "birthDay": born,
            "avatarPictureUrl": f"https://assets.sorare.com/{slug}-face.png",
            "activeClub": {
                "slug": club,
                "name": "Club A",
                "shortName": "CLA",
                "pictureUrl": "https://assets.sorare.com/a.png",
                "domesticLeague": {"slug": league},
            },
            "activeNationalTeam": None,
            "average": 48.0,
            "nextClassicFixtureProjectedScore": projection,
            "nextClassicFixturePlayingStatusOdds": {
                "starterOddsBasisPoints": plays,
                "substituteOddsBasisPoints": 500,
                "nonPlayingOddsBasisPoints": 500,
            },
            "plan": [game] * games,
            "past": [past_game],
            "a0": [{**game, "id": f"ahead-{slug}", "date": "2026-10-17T14:00:00Z"}] if ahead else [],
        },
    }


def snapshot() -> dict[str, Any]:
    squad = [
        card("keeper-one", "GK"),
        card("keeper-two", "GK", in_season=False),
        card("back-one", "DEF"),
        card("back-two", "DEF", club="club-b"),
        card("back-three", "DEF", club="club-c"),
        card("mid-one", "MID"),
        card("mid-two", "MID", club="club-b"),
        card("mid-three", "MID", in_season=False),
        card("kid-one", "MID", born="2005-03-02"),
        card("kid-two", "DEF", born="2004-08-08"),
        card("front-one", "FWD"),
        card("front-two", "FWD", club="club-c"),
        card("sealed-one", "FWD", sealed=True),
    ]
    history = {
        c["player"]["slug"]: [
            {
                "date": "2026-09-19T14:00:00+00:00",
                "competition": "laliga-es",
                "gameId": "past",
                "score": 60.0,
                "played": True,
                "status": "FINAL",
            },
            {
                "date": "2026-09-12T14:00:00+00:00",
                "competition": "laliga-es",
                "gameId": "older",
                "score": 50.0,
                "played": True,
                "status": "FINAL",
            },
        ]
        for c in squad
    }
    cuts = {"1": 520.0, "50": 430.0, "1500": 300.0}
    return {
        "fetchedAt": "2026-10-07T10:00:00+00:00",
        "user": "yares",
        "gameweeks": [PAST_GW, PLAN_GW, AHEAD_GW],
        "planGameweek": PLAN_GW,
        "pastGameweek": PAST_GW,
        "aheadGameweeks": [AHEAD_GW],
        "cards": squad,
        "competitions": {
            "gw-plan": [
                competition("LALIGA EA SPORTS", "Limited", leagues=["laliga-es"]),
                competition("All Star", "Limited", size=7, in_season=False),
                competition("Under 23", "Limited", size=7, in_season=False, age_max=23),
            ],
            "gw-past": [competition("LALIGA EA SPORTS", "Limited", leagues=["laliga-es"])],
            "gw-ahead": [competition("LALIGA EA SPORTS", "Limited", leagues=["laliga-es"])],
        },
        "history": history,
        "references": {
            "gw-past": {
                "LALIGA EA SPORTS | Limited": {"from": "gw-past", "gameweek": 15, "cuts": cuts},
                "All Star | Limited": {"from": "gw-past", "gameweek": 15, "cuts": cuts},
                "Under 23 | Limited": {"from": "gw-past", "gameweek": 15, "cuts": cuts},
            },
            "gw-older": {"LALIGA EA SPORTS | Limited": {"from": "gw-older", "gameweek": 13, "cuts": cuts}},
        },
        "referenceFor": {"plan": "gw-past", "pastBefore": "gw-older", "pastActual": "gw-past"},
        "calls": 120,
    }


def test_card_games_names_the_side_that_is_actually_playing() -> None:
    row = card("international-mid", "MID", club="real-madrid")
    row["player"]["activeNationalTeam"] = {
        "slug": "turkiye",
        "name": "Türkiye",
        "shortName": "Türkiye",
        "pictureUrl": "https://frontend-assets.sorare.com/turkiye.png",
    }
    row["player"]["plan"] = [
        {
            "id": "turkiye-belgium",
            "date": "2026-10-10T14:00:00Z",
            "competition": {"slug": "uefa-nations-league"},
            "homeTeam": row["player"]["activeNationalTeam"],
            "awayTeam": {
                "slug": "belgium",
                "name": "Belgium",
                "shortName": "Belgium",
                "pictureUrl": "https://frontend-assets.sorare.com/belgium.png",
            },
        }
    ]

    game = publish.card_games([row], "plan")["international-mid"][0]

    assert game["team"] == "Türkiye"
    assert game["teamCrest"].endswith("turkiye.png")
    assert game["opponent"] == "Belgium"
    assert game["venue"] == "H"


def national_row(side: str, home_stats: dict[str, Any] | None, away_stats: dict[str, Any] | None) -> dict[str, Any]:
    """A goalkeeper of Slovenia (home) or North Macedonia (away), the game as Sorare answers it for 29 Sep."""
    slovenia = {"slug": "slovenia", "name": "Slovenia", "shortName": "Slovenia", "pictureUrl": "https://f/si.png"}
    macedonia = {"slug": "north-macedonia", "name": "North Macedonia", "pictureUrl": "https://f/mk.png"}
    row = card("keeper-national", "GK", club="atletico-madrid")
    row["player"]["activeNationalTeam"] = slovenia if side == "home" else macedonia
    row["player"]["plan"] = [
        {
            "id": "si-mk",
            "date": "2026-09-29T18:45:00Z",
            "competition": {"slug": "uefa-nations-league"},
            "homeTeam": slovenia,
            "awayTeam": macedonia,
            "homeStats": home_stats,
            "awayStats": away_stats,
        }
    ]
    return row


SLOVENIA = {"winOddsBasisPoints": 5600, "drawOddsBasisPoints": 2700, "loseOddsBasisPoints": 1700, "cleanSheetOdds": 1.8}
MACEDONIA = {
    "winOddsBasisPoints": 1700,
    "drawOddsBasisPoints": 2700,
    "loseOddsBasisPoints": 5600,
    "cleanSheetOdds": 4.33,
}


def test_a_game_carries_sorares_odds_for_the_side_the_player_is_on() -> None:
    home = publish.card_games([national_row("home", SLOVENIA, MACEDONIA)], "plan")["keeper-national"][0]
    away = publish.card_games([national_row("away", SLOVENIA, MACEDONIA)], "plan")["keeper-national"][0]

    # Slovenia at home: 56% to win, the clean-sheet price 1.80 is a 56% chance, and the board's own formula gives 35.
    assert (
        home["odds"]
        == {
            "win": 0.56,
            "draw": 0.27,
            "loss": 0.17,
            "cleanSheet": 0.556,
            "goalsFor": 1.47,  # ln(4.33): North Macedonia keeps a clean sheet 23% of the time, so Slovenia scores 1.47 a game
            "goalsAgainst": 0.59,  # ln(1.80)
            "difficulty": 35.0,
            "label": "Very favourite",
            "bucket": 1,
            "source": "sorare",
        }
    )
    # North Macedonia away, the same game read from the other side: 17% to win, price 4.33, a big underdog.
    assert away["odds"]["win"] == 0.17
    assert away["odds"]["cleanSheet"] == 0.231
    assert (away["odds"]["goalsFor"], away["odds"]["goalsAgainst"]) == (0.59, 1.47)  # the same game from the other side
    assert away["odds"]["difficulty"] == 74.0
    assert (away["odds"]["label"], away["odds"]["bucket"]) == ("Big underdog", 5)


def test_the_same_difficulty_reads_differently_home_and_away() -> None:
    """The board's venue cut points apply: 30 is a top-band game at home and only a favourite away."""
    even = {"winOddsBasisPoints": 6000, "drawOddsBasisPoints": 2500, "loseOddsBasisPoints": 1500, "cleanSheetOdds": 2.0}
    at_home = publish.card_games([national_row("home", even, None)], "plan")["keeper-national"][0]["odds"]
    on_the_road = publish.card_games([national_row("away", None, even)], "plan")["keeper-national"][0]["odds"]

    assert at_home["difficulty"] == on_the_road["difficulty"] == 31.7
    assert at_home["label"] == "Very favourite"
    assert on_the_road["label"] == "Favourite"


def test_a_game_without_odds_has_no_odds_block_never_zeros() -> None:
    empty = {
        "winOddsBasisPoints": None,
        "drawOddsBasisPoints": None,
        "loseOddsBasisPoints": None,
        "cleanSheetOdds": None,
    }
    for home_stats in (empty, None, {}):
        game = publish.card_games([national_row("home", home_stats, home_stats)], "plan")["keeper-national"][0]
        assert "odds" not in game
    # An older snapshot that never asked for the odds reads the same as no odds.
    assert "odds" not in publish.card_games([card("keeper-one", "GK")], "plan")["keeper-one"][0]


def test_a_missing_or_impossible_clean_sheet_price_leaves_only_that_number_out() -> None:
    for price in (None, 0.9, 1.0):
        odds = publish.card_games([national_row("home", {**SLOVENIA, "cleanSheetOdds": price}, MACEDONIA)], "plan")[
            "keeper-national"
        ][0]["odds"]
        assert odds["cleanSheet"] is None
        assert odds["goalsAgainst"] is None  # both come from his own side's price
        assert odds["goalsFor"] == 1.47  # ...and his goals from the other side's, which is fine
        assert odds["win"] == 0.56  # the rest of the read is still real


@pytest.fixture(autouse=True)
def no_understat(monkeypatch):
    """No test reaches Understat over the network: the job's fetch answers nothing unless a test says otherwise."""
    monkeypatch.setattr(sorare_job.understat, "fetch_leagues", lambda *a, **k: {})


@pytest.fixture(scope="module")
def payload() -> dict[str, Any]:
    return publish.build_payload(snapshot(), runs=4, draws=600)


def _past_game(date: str, score: float, role: str) -> dict[str, Any]:
    """One row of a player's history as Sorare answers it: a start, a substitute appearance, a miss, or still to come."""
    played = role in ("start", "sub")
    return {
        "date": date,
        "competition": "laliga-es",
        "gameId": f"g-{date}",
        "score": score if played else 0.0,
        "played": played,
        "started": role == "start",
        "mins": {"start": 90, "sub": 20}.get(role),
        # Sorare gives a game not yet played a PENDING row with no score and playedInGame false; a game he sat out
        # entirely is DID_NOT_PLAY. Only the second is a game he missed.
        "status": {"pending": "PENDING", "miss": "DID_NOT_PLAY"}.get(role, "FINAL"),
    }


def _form_of(history: list[dict[str, Any]]):
    """His forecast for the gameweek locking on 9 Oct, from form alone (no Sorare odds), given this history."""
    from app.sorare.forecast import forecast

    lock = datetime(2026, 10, 9, 17, 0, tzinfo=UTC)
    rows = [card("keeper-one", "GK")]
    games = {"keeper-one": [{"id": "next"}]}
    weeks = publish.player_weeks(rows, games, {"keeper-one": history}, lock, None, use_sorare=False)
    return forecast(weeks["keeper-one"])


PLAYED = [
    _past_game("2026-09-26T18:00:00Z", 60.0, "start"),
    _past_game("2026-09-20T18:00:00Z", 50.0, "start"),
    _past_game("2026-09-13T18:00:00Z", 35.0, "sub"),
    _past_game("2026-09-06T18:00:00Z", 55.0, "start"),
    _past_game("2026-08-30T18:00:00Z", 45.0, "start"),
]
TO_COME = [_past_game(f"2026-10-0{day}T18:45:00Z", 0.0, "pending") for day in (1, 4, 7)]  # all before the lock


def test_games_still_to_come_are_not_games_he_missed():
    """A gameweek planned from form counts the games Sorare has scored, never the ones it has not yet played."""
    without = _form_of(PLAYED)
    with_pending = _form_of([*TO_COME, *PLAYED])

    assert (with_pending.p_play, with_pending.mu) == (without.p_play, without.mu)
    assert (with_pending.p_start, with_pending.p_on, with_pending.start) == (
        without.p_start,
        without.p_on,
        without.start,
    )
    # Five games played, all of them appearances: a high chance of playing, not the 5 in 8 that three phantom misses give.
    assert without.p_play > 0.85


def test_a_game_he_sat_out_still_counts_as_a_miss():
    """DID_NOT_PLAY is a real miss, unlike PENDING: the fix must not forget how to lower a benched player's chance."""
    benched = [
        _past_game("2026-09-26T18:00:00Z", 0.0, "miss"),
        _past_game("2026-09-20T18:00:00Z", 0.0, "miss"),
        *PLAYED[2:],
    ]
    assert _form_of(benched).p_play < _form_of(PLAYED).p_play


def test_every_player_carries_two_scores_and_two_chances(payload):
    players = publish.week_of(payload)["playing"]["players"]
    assert players
    for player in players:
        assert {"start", "bench", "on", "pStart", "pOn"} <= player.keys(), player["name"]
        assert 0 <= player["pStart"] + player["pOn"] <= 1 and player["bench"] <= player["start"]
    keeper = next(p for p in players if p["player"] == "keeper-one")
    # Sorare gave starter 90%, substitute 5%, not playing 5%; a regular starter's start score is its projection.
    assert (keeper["pStart"], keeper["pOn"], keeper["start"]) == (0.9, 0.05, 55.0)
    assert keeper["bench"] == pytest.approx(0.5 * 42.0, abs=0.06)  # benched: on 0.05 / (0.05 + 0.05) of the time
    # The score if he comes on is the substitute score itself (P7), not the chance of coming on times it: 42 here, the bench prior.
    assert keeper["on"] == pytest.approx(42.0, abs=0.06)
    assert all(player["on"] > player["bench"] or player["on"] == pytest.approx(player["bench"]) for player in players)


def _with_understat(snap: dict[str, Any]) -> dict[str, Any]:
    from app.sources.understat import League, Player

    snap["understat"] = {
        "laliga-es": League(
            players=[
                Player(id="1", name="Mid One", team="Club A", games=6, minutes=480.0, xg=2.4, npxg=1.8, position="M"),
                Player(id="2", name="Front One", team="Club A", games=6, minutes=500.0, xg=4.0, npxg=4.0, position="F"),
                Player(id="3", name="Back One", team="Club A", games=6, minutes=520.0, xg=0.5, npxg=0.5, position="D"),
            ],
            team_xg={"Club A": 1.5},
        )
    }
    return snap


def test_a_midfielder_or_forward_understat_can_name_carries_his_expected_goals(payload):
    with_xg = publish.build_payload(_with_understat(snapshot()), runs=4, draws=600)
    players = {p["player"]: p for p in publish.week_of(with_xg)["playing"]["players"]}

    assert set(players["mid-one"]["xg"]) == {"np", "pen", "team"}
    assert players["mid-one"]["xg"]["team"] == 1.5
    assert players["mid-one"]["xg"]["pen"] > 0  # 2.4 xG against 1.8 non-penalty: he takes penalties
    assert players["front-one"]["xg"]["np"] > players["mid-one"]["xg"]["np"]
    # A defender's tile shows the difficulty, a keeper has no match, and a player Understat does not list has none.
    for slug in ("back-one", "keeper-one", "mid-two", "kid-one"):
        assert "xg" not in players[slug], slug
    # Without Understat nobody has it, and that is the payload every earlier run published.
    assert all("xg" not in p for p in publish.week_of(payload)["playing"]["players"])


def test_expected_goals_change_no_plan(payload):
    with_xg = publish.build_payload(_with_understat(snapshot()), runs=4, draws=600)
    assert publish.week_of(with_xg)["plans"] == publish.week_of(payload)["plans"]


def test_knowing_how_each_game_was_played_changes_no_plan(payload):
    """The split is for the overlay: the planner's chance of playing x score is what the plans are built from."""
    roles = snapshot()
    for rows in roles["history"].values():
        for row, started in zip(rows, (True, False), strict=True):
            row["started"], row["mins"] = started, 90 if started else 20
    with_roles = publish.build_payload(roles, runs=4, draws=600)

    assert publish.week_of(with_roles)["plans"] == publish.week_of(payload)["plans"]
    for before, after in zip(
        publish.week_of(payload)["playing"]["players"], publish.week_of(with_roles)["playing"]["players"], strict=True
    ):
        assert (after["p"], after["x"]) == (before["p"], before["x"])


def test_the_page_names_the_gameweek_being_planned(payload):
    assert publish.week_of(payload)["gameweek"]["number"] == 21
    assert publish.week_of(payload)["state"] == "ready"
    assert publish.week_of(payload)["source"] == "sorare"  # Sorare's projection and starting chances were there
    assert payload["generatedAt"].startswith("2026-10-07")


def test_sealed_cards_are_left_out_and_counted(payload):
    assert payload["cards"]["usable"] == 12
    assert payload["cards"]["total"] == 13
    assert payload["cards"]["excluded"] == [{"name": "Sealed One", "why": "sealed", "rarity": "limited"}]
    assert payload["cards"]["inSeason"] == 10


def test_every_player_who_plays_is_named_by_his_sorare_slug(payload):
    # The sorare.com overlay finds a player by the slug Sorare's own page carries, never by his name.
    players = publish.week_of(payload)["playing"]["players"]
    assert players
    assert all(p["player"] and isinstance(p["player"], str) for p in players)
    assert len({p["player"] for p in players}) == len(players)


def test_only_competitions_you_can_field_a_lineup_in_are_offered(payload):
    playable = {o["name"] for o in publish.week_of(payload)["playable"]}
    assert "LaLiga" in playable and "All Star" in playable
    blocked = {b["name"]: b["why"] for b in publish.week_of(payload)["blocked"]}
    assert blocked["U23"] == "Needs a goalkeeper aged 23 or under"  # two young outfielders, no young keeper


def test_the_plans_use_each_card_once_and_name_their_lineups(payload):
    plans = publish.week_of(payload)["plans"]
    assert plans, "the gameweek has plans"
    for plan in plans:
        slugs = [c["slug"] for lu in plan["lineups"] for c in lu["starters"] + lu["subs"]]
        assert len(slugs) == len(set(slugs))
        assert plan["cardsUsed"] == len(slugs)
        for lineup in plan["lineups"]:
            assert lineup["comp"] in {"LaLiga", "All Star", "U23"}
            assert len(lineup["starters"]) == lineup["size"]
            assert sum(1 for c in lineup["starters"] if c["captain"]) == 1
            if lineup["minInSeason"]:
                assert sum(1 for c in lineup["starters"] if c["inSeason"]) >= lineup["minInSeason"]


def test_a_lineup_carries_what_the_app_needs_to_draw_it(payload):
    lineup = publish.week_of(payload)["plans"][0]["lineups"][0]
    assert lineup["need"] and lineup["tiers"]
    # Each level names the score that reached it in the reference week; the last one is the lineup's own "need".
    needs = [tier["need"] for tier in lineup["tiers"]]
    assert needs[-1] == lineup["need"] and needs == sorted(needs, reverse=True)
    # Entering this lineup takes Sorare's id for the leaderboard, which only the job can read (S6), and
    # asking Sorare about it takes the slug.
    assert lineup["boardId"] == f"So5Leaderboard:{lineup['board']}"
    assert 0 <= lineup["pReturn"] <= 1
    card = lineup["starters"][0]
    assert card["pic"].startswith("https://assets.sorare.com/")
    assert card["fixture"]["opponent"] and card["fixture"]["venue"] in {"H", "A"}
    assert card["mu"] > 0 and 0 < card["p"] <= 1


def test_the_gameweek_just_played_is_replayed_against_what_happened(payload):
    last = publish.week_of(payload, "last")
    assert last is not None and last["played"] is True
    assert last["source"] == "form", "a replay may only use what was known before the lock"
    plan = last["plans"][0]
    assert plan["actual"]["essence"] >= 0
    for lineup in plan["lineups"]:
        assert lineup["actual"]["total"] > 0


def test_the_timeline_covers_both_gameweeks(payload):
    ids = {item["id"]: item for item in payload["timeline"]}
    assert ids["21"]["status"] == "next"
    assert ids["15"]["status"] == "done"
    assert ids["21"]["playing"] == 12


# --------------------------------------------------------------------------- the job
def test_the_job_skips_itself_without_a_key(db, monkeypatch):  # noqa: F811
    monkeypatch.setattr(sorare_job.settings, "sorare_api_key", "")
    assert sorare_job.run(db) == {"skipped": "no SORARE_API_KEY"}
    assert db.get(ReadModel, sorare_job.SORARE_KEY) is None


def test_the_job_publishes_the_page_and_keeps_the_reference_scores(db, monkeypatch):  # noqa: F811
    # The job tells a cloud run from a hand run by GITHUB_ACTIONS, and CI itself is GitHub Actions.
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.setattr(sorare_job.settings, "sorare_api_key", "test-key")
    monkeypatch.setattr(sorare_job, "SorareClient", lambda *a, **k: _FakeClient())
    monkeypatch.setattr(sorare_job.sorare_sync, "snapshot", lambda *a, **k: snapshot())
    monkeypatch.setattr(
        sorare_job.sorare_publish,
        "build_payload",
        lambda snap, **k: {
            "generatedAt": snap["fetchedAt"],
            "nextId": "21",
            "lastId": None,
            "weeks": [
                {
                    "gameweek": {"id": "21", "number": 21},
                    "state": "ready",
                    "plans": [],
                    "playing": {"cards": 3},
                    "playable": [],
                }
            ],
        },
    )
    summary = sorare_job.run(db, "yares", runs=1)

    assert summary["gameweek"] == 21 and summary["state"] == "ready"
    assert db.get(ReadModel, sorare_job.SORARE_KEY) is not None
    kept = db.get(ReadModel, sorare_job.REFERENCES_KEY)
    assert kept is not None and "gw-past" in kept.payload
    assert sorare_job.cached_references(db)["gw-past"]
    # The page also carries how it came to be, and the run wrote the gameweek's projections down.
    status = db.get(ReadModel, sorare_job.SORARE_KEY).payload["status"]
    assert status["where"] == "pc" and status["lastCloudAt"] is None and status["kept"]["rows"] > 0

    # The same run inside GitHub Actions is recorded as the cloud's, which is what the status panel reads.
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    sorare_job.run(db, "yares", runs=1)
    again = db.get(ReadModel, sorare_job.SORARE_KEY).payload["status"]
    assert again["where"] == "cloud" and again["lastCloudAt"] == again["builtAt"]


def test_the_job_reads_understat_once_for_each_league_the_owner_plays_in_and_publishes_his_xg(db, monkeypatch):  # noqa: F811
    from app.sources.understat import League, Player

    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.setattr(sorare_job.settings, "sorare_api_key", "test-key")
    monkeypatch.setattr(sorare_job, "SorareClient", lambda *a, **k: _FakeClient())
    monkeypatch.setattr(sorare_job.sorare_sync, "snapshot", lambda *a, **k: snapshot())
    asked: list[tuple[list[str], int]] = []

    def fake(slugs, season, **k):
        asked.append((slugs, season))
        players = [
            Player(id="1", name="Mid One", team="Club A", games=6, minutes=480.0, xg=1.8, npxg=1.8, position="M")
        ]
        return {"laliga-es": League(players=players, team_xg={"Club A": 1.5})}

    monkeypatch.setattr(sorare_job.understat, "fetch_leagues", fake)

    summary = sorare_job.run(db, "yares", runs=1)

    # Every card in the fixture is at a LaLiga club: one league, the season that started in 2026, asked for once.
    assert asked == [(["laliga-es"], 2026)]
    assert summary["xg"] == 1
    players = db.get(ReadModel, sorare_job.SORARE_KEY).payload["weeks"][0]["playing"]["players"]
    assert [p["player"] for p in players if "xg" in p] == ["mid-one"]


def test_the_job_archives_the_week_just_played_once_its_scores_are_final(db, monkeypatch):  # noqa: F811
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.setattr(sorare_job.settings, "sorare_api_key", "test-key")
    monkeypatch.setattr(sorare_job, "SorareClient", lambda *a, **k: _FakeClient())
    monkeypatch.setattr(sorare_job.sorare_sync, "snapshot", lambda *a, **k: snapshot())

    first = sorare_job.run(db, "yares", runs=1)

    key = "sorare_week:gw-past"  # the fixture's run is two weeks after that gameweek ended
    row = db.get(ReadModel, key)
    assert row is not None and first["archived"] == key
    assert row.payload["gameweek"]["slug"] == "gw-past" and row.payload["played"] is True
    assert "hindsight" in row.payload and row.payload["plans"]
    stamp = row.updated_at

    second = sorare_job.run(db, "yares", runs=1)
    assert "archived" not in second, "it is written once: a finished week never changes"
    assert db.get(ReadModel, key).updated_at == stamp


def test_the_job_publishes_without_xg_when_understat_gives_nothing(db, monkeypatch):  # noqa: F811
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.setattr(sorare_job.settings, "sorare_api_key", "test-key")
    monkeypatch.setattr(sorare_job, "SorareClient", lambda *a, **k: _FakeClient())
    monkeypatch.setattr(sorare_job.sorare_sync, "snapshot", lambda *a, **k: snapshot())
    summary = sorare_job.run(db, "yares", runs=1)  # the autouse guard answers {}: Understat is down

    assert summary["xg"] == 0 and summary["state"] == "ready"
    players = db.get(ReadModel, sorare_job.SORARE_KEY).payload["weeks"][0]["playing"]["players"]
    assert not any("xg" in p for p in players)


class _FakeClient:
    calls = 0

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return None


def test_a_dry_run_writes_nothing(db, monkeypatch):  # noqa: F811
    monkeypatch.setattr(sorare_job.settings, "sorare_api_key", "test-key")
    monkeypatch.setattr(sorare_job, "SorareClient", lambda *a, **k: _FakeClient())
    monkeypatch.setattr(sorare_job.sorare_sync, "snapshot", lambda *a, **k: snapshot())
    monkeypatch.setattr(
        sorare_job.sorare_publish,
        "build_payload",
        lambda snap, **k: {
            "next": {"gameweek": {"number": 21}, "state": "ready", "plans": [], "playing": {"cards": 3}, "playable": []}
        },
    )

    summary = sorare_job.run(db, dry_run=True)

    assert summary["dryRun"] is True
    assert db.get(ReadModel, sorare_job.SORARE_KEY) is None


def test_the_snapshot_time_is_the_generated_time(payload):
    assert datetime.fromisoformat(payload["generatedAt"]).tzinfo is not None
    assert datetime.fromisoformat(payload["generatedAt"]) < datetime(2026, 10, 8, tzinfo=UTC)


def test_the_weeks_after_the_next_one_are_planned_from_form() -> None:
    """Sorare publishes a projection for a player's next fixture only, so anything further stands on form."""
    payload = publish.build_payload(snapshot(), runs=2, draws=200)
    numbers = [w["gameweek"]["number"] for w in payload["weeks"]]
    assert numbers == [15, 21, 22], "oldest first: the replay, the one being planned, then the ones ahead"
    assert payload["nextId"] == "21" and payload["lastId"] == "15"

    planned = publish.week_of(payload)
    ahead = payload["weeks"][-1]
    assert planned["source"] == "sorare" and ahead["source"] == "form"
    assert ahead["playing"]["cards"] > 0 and ahead["plans"], "his cards play, so there is a lineup to show"
    assert len(ahead["plans"]) == 1, "one plan is enough that far out"


def test_a_card_carries_its_score_windows_and_tier() -> None:
    row = card("jan-oblak", "GK")
    row["player"].update(
        {
            "l5": 47,
            "l40": 50.4,
            "lastFiveSo5Appearances": 5,
            "lastTenSo5Appearances": 9,
            "lastFortySo5Appearances": 30,
            "gameplayTier": "STAR",
        }
    )
    usable, _left = publish.read_cards([row])
    out = publish.collection_out(usable)[0]
    assert out["stars"] == 4
    assert out["scores"] == [
        {"window": "L5", "score": 47.0, "started": 100.0},
        {"window": "L10", "score": 48.0, "started": 90.0},
        {"window": "L40", "score": 50.4, "started": 75.0},
    ]


def test_a_week_where_none_of_your_cards_play_says_so() -> None:
    idle = snapshot()
    for entry in idle["cards"]:
        entry["player"]["a0"] = []
    ahead = publish.build_payload(idle, runs=2, draws=200)["weeks"][-1]
    assert ahead["gameweek"]["number"] == 22
    assert ahead["state"] == "none" and ahead["playing"]["cards"] == 0 and ahead["plans"] == []


def test_market_players_are_drawn_as_their_sorare_card_where_one_is_known():
    from app.sorare.publish import with_card_art

    market = [
        {"slug": "pedri", "pic": "https://assets.sorare.com/playerpicture/x.png"},
        {"slug": "nobody", "pic": "photo.png"},
    ]
    out = with_card_art(market, {"pedri": "https://assets.sorare.com/card/pedri.png"})
    assert out[0]["pic"] == "https://assets.sorare.com/card/pedri.png"
    assert out[1]["pic"] == "photo.png"  # no card known: the picture stays


def test_every_laliga_player_gets_a_start_chance_and_an_xscore_not_only_yours() -> None:
    def row(raw: dict[str, Any], eur: float | None) -> dict[str, Any]:
        player = raw["player"]
        return {
            "slug": player["slug"],
            "name": player["displayName"],
            "pos": "FWD",
            "club": "CLA",
            "crest": None,
            "average": 48.0,
            "projection": 55.0,
            "eur": eur,
            "pic": "",
            "player": player,
        }

    stranger = card("stranger", "FWD", plays=7000)  # nobody's card: only the squad index knows him
    snap = snapshot()
    snap["market"] = [row(stranger, None), row(snap["cards"][10], 12.5)]
    page = publish.build_payload(snap, runs=4, draws=600)
    market = {p["slug"]: p for p in page["market"]}

    him = market["stranger"]
    assert him["eur"] is None  # unpriced, still listed
    assert him["pStart"] == 0.7 and him["startSource"] == "sorare"
    assert 0 < him["x"] < him["mu"] and him["fixture"]["opponent"] == "Club Z"

    mine = market["front-one"]
    planned = next(
        c for lu in publish.week_of(page)["plans"][0]["lineups"] for c in lu["starters"] if c["player"] == "front-one"
    )
    assert mine["x"] == planned["x"] and mine["pStart"] == planned["pStart"]
