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
        "gameweeks": [PAST_GW, PLAN_GW],
        "planGameweek": PLAN_GW,
        "pastGameweek": PAST_GW,
        "cards": squad,
        "competitions": {
            "gw-plan": [
                competition("LALIGA EA SPORTS", "Limited", leagues=["laliga-es"]),
                competition("All Star", "Limited", size=7, in_season=False),
                competition("Under 23", "Limited", size=7, in_season=False, age_max=23),
            ],
            "gw-past": [competition("LALIGA EA SPORTS", "Limited", leagues=["laliga-es"])],
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


@pytest.fixture(scope="module")
def payload() -> dict[str, Any]:
    return publish.build_payload(snapshot(), runs=4, draws=600)


def test_the_page_names_the_gameweek_being_planned(payload):
    assert payload["next"]["gameweek"]["number"] == 21
    assert payload["next"]["state"] == "ready"
    assert payload["next"]["source"] == "sorare"  # Sorare's projection and starting chances were there
    assert payload["generatedAt"].startswith("2026-10-07")


def test_sealed_cards_are_left_out_and_counted(payload):
    assert payload["cards"]["usable"] == 12
    assert payload["cards"]["total"] == 13
    assert payload["cards"]["excluded"] == [{"name": "Sealed One", "why": "sealed", "rarity": "limited"}]
    assert payload["cards"]["inSeason"] == 10


def test_only_competitions_you_can_field_a_lineup_in_are_offered(payload):
    playable = {o["name"] for o in payload["next"]["playable"]}
    assert "LaLiga" in playable and "All Star" in playable
    blocked = {b["name"]: b["why"] for b in payload["next"]["blocked"]}
    assert blocked["U23"] == "Needs a goalkeeper aged 23 or under"  # two young outfielders, no young keeper


def test_the_plans_use_each_card_once_and_name_their_lineups(payload):
    plans = payload["next"]["plans"]
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
    lineup = payload["next"]["plans"][0]["lineups"][0]
    assert lineup["need"] and lineup["tiers"]
    assert 0 <= lineup["pReturn"] <= 1
    card = lineup["starters"][0]
    assert card["pic"].startswith("https://assets.sorare.com/")
    assert card["fixture"]["opponent"] and card["fixture"]["venue"] in {"H", "A"}
    assert card["mu"] > 0 and 0 < card["p"] <= 1


def test_the_gameweek_just_played_is_replayed_against_what_happened(payload):
    last = payload["last"]
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
    monkeypatch.setattr(sorare_job.settings, "sorare_api_key", "test-key")
    monkeypatch.setattr(sorare_job, "SorareClient", lambda *a, **k: _FakeClient())
    monkeypatch.setattr(sorare_job.sorare_sync, "snapshot", lambda *a, **k: snapshot())
    monkeypatch.setattr(
        sorare_job.sorare_publish,
        "build_payload",
        lambda snap, **k: {
            "generatedAt": snap["fetchedAt"],
            "next": {"gameweek": {"number": 21}, "state": "ready", "plans": [], "playing": {"cards": 3}, "playable": []},
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
