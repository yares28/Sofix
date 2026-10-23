from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace

from app.sorare import foreign_scores as f
from app.sorare.scores import Made

LOCK = datetime(2026, 10, 23, 14, tzinfo=UTC)


def fixture():
    cell = {
        "opponent_code": "B",
        "venue": "H",
        "kickoff_utc": "2026-10-24T14:00:00Z",
        "forecast_at": "2026-10-21T12:00:00Z",
        "status": "scheduled",
        "prediction": {"clean_sheet": 0.4, "xg_for": 1.5, "xg_against": 0.9},
    }
    grid = {
        "competition": "PL",
        "model_version": f.expected_version("PL"),
        "teams": [
            {"code": "A", "history_name": "Arsenal", "cells": [[cell]]},
            {"code": "B", "history_name": "Chelsea", "cells": []},
        ],
    }
    game = {
        "competition": "premier-league-gb-eng",
        "teamName": "Arsenal FC",
        "opponentName": "Chelsea FC",
        "venue": "H",
        "kickoff": "2026-10-24T14:00:00Z",
        "forecastBefore": LOCK.isoformat(),
    }
    return grid, game


def test_fixture_join_requires_both_playing_sides_venue_timestamp_and_matching_model():
    grid, game = fixture()
    assert f.find_numbers("PL", grid, game).xgf == 1.5
    for key, value in [
        ("opponentName", "Fulham FC"),
        ("teamName", "England"),
        ("venue", "A"),
        ("competition", "world-cup"),
        ("kickoff", "2026-10-30T14:00:00Z"),
    ]:
        assert f.find_numbers("PL", grid, {**game, key: value}) is None
    for stamp in [None, "2026-10-23T15:00:00Z"]:
        changed = deepcopy(grid)
        changed["teams"][0]["cells"][0][0]["forecast_at"] = stamp
        assert f.find_numbers("PL", changed, game) is None
    grid["model_version"] = "LaLiga"
    assert f.find_numbers("PL", grid, game) is None


def test_mixed_domestic_european_week_selects_each_game_model_and_never_partial_totals():
    domestic, first = fixture()
    european = deepcopy(domestic)
    european.update(competition="CL", model_version=f.expected_version("CL"), _fresh=True)
    european["teams"][0]["cells"][0][0].update(neutral=False, phase="league")
    european["teams"][0]["sorare_slug"] = "arsenal"
    european["teams"][1]["sorare_slug"] = "chelsea"
    second = {
        **first,
        "id": "european",
        "teamSlug": "arsenal",
        "opponentSlug": "chelsea",
        "competition": "uefa-champions-league",
    }
    seen = []

    def model(label):
        def outcome(*args):
            seen.append(label)
            return SimpleNamespace(start=50)

        return SimpleNamespace(outfield={"DEF": SimpleNamespace(outcome=outcome)}, keeper=None, subs={})

    score = f.scores_for(
        {"PL": model("PL"), "CL": model("CL")},
        {"PL": domestic, "CL": european},
        lambda *args: Made((), None),
        european_games={},
    )
    made = score({"position": "Defender"}, [first, second], 99, [])
    assert len(made.outcomes) == 2 and seen == ["PL", "CL"]
    assert score({"position": "Defender"}, [first, {**second, "opponentSlug": "wrong"}], 99, []).outcomes == ()
    assert (
        score(
            {"position": "Defender"}, [first, {**second, "competition": "uefa-europa-conference-league"}], 99, []
        ).outcomes
        == ()
    )


def test_european_history_requires_explicit_complete_context_and_filters_qualifiers():
    grid, game = fixture()
    grid.update(competition="CL", model_version=f.expected_version("CL"), _fresh=True)
    grid["teams"][0].update(sorare_slug="arsenal")
    grid["teams"][1].update(sorare_slug="chelsea")
    grid["teams"][0]["cells"][0][0].update(phase="league", neutral=False)
    game.update(competition="uefa-champions-league", teamSlug="arsenal", opponentSlug="chelsea")
    seen = []
    bundle = SimpleNamespace(
        outfield={"DEF": SimpleNamespace(outcome=lambda n, h, d, m, p: seen.append(m) or SimpleNamespace(start=m))},
        subs={},
    )
    fallback = lambda *args: Made((), None)
    assert (
        f.scores_for({"CL": bundle}, {"CL": grid}, fallback)(
            {"position": "Defender", "slug": "p"}, [game], None, []
        ).outcomes
        == ()
    )
    current = {
        "date": "2026-10-20T19:00:00Z",
        "availableAt": "2026-10-22T19:00:00Z",
        "starts": {"p": 0},
        "mainStage": True,
        "competition": "CONF",
    }
    context = {
        "main": current,
        "qualifier": {**current, "mainStage": False, "starts": {"p": 100}},
        "late": {**current, "availableAt": "2026-10-24T19:00:00Z", "starts": {"p": 100}},
    }
    score = f.scores_for({"CL": bundle}, {"CL": grid}, fallback, european_games=context)
    assert len(score({"position": "Defender", "slug": "p"}, [game], None, []).outcomes) == 1
    assert seen == [40.0]


def test_foreign_history_is_league_only_before_cutoff_and_never_uses_laliga_sub_shape():
    grid, game = fixture()
    seen = []

    def outcome(numbers, home, own_dec, own_score, projection):
        seen.append((home, own_score, projection))
        return SimpleNamespace(start=own_score)

    bundle = SimpleNamespace(outfield={"DEF": SimpleNamespace(outcome=outcome)}, keeper=None, subs={})
    fallback = lambda *args: Made((), "Spanish shape")
    score = f.scores_for({"PL": bundle}, {"PL": grid}, fallback)
    past = [
        {
            "date": "2026-10-20T12:00:00Z",
            "competition": "premier-league-gb-eng",
            "status": "FINAL",
            "played": True,
            "started": True,
            "score": 0,
        },
        {
            "date": "2026-10-19T12:00:00Z",
            "competition": "laliga-es",
            "status": "FINAL",
            "played": True,
            "started": True,
            "score": 100,
        },
    ]
    made = score({"position": "Defender"}, [game], 99, past)
    assert made.sub is None and len(made.outcomes) == 1
    assert seen == [(True, 40.0, None)]
    assert score({"position": "Defender"}, [{**game, "opponentName": "Unknown"}], 99, past).sub is None
    assert score({"position": "Defender"}, [{**game, "competition": "laliga-es"}], 99, past).sub == "Spanish shape"


def test_artifact_requires_complete_evidence_not_just_validated_boolean(tmp_path):
    import json

    raw = json.loads((f.ROOT / "BL1.json").read_text())
    path = tmp_path / "BL1.json"
    path.write_text(json.dumps(raw))
    assert f.load("BL1", tmp_path) is not None
    for change in [
        lambda r: r["evidence"].update(coverageComplete=False),
        lambda r: r["evidence"]["versusForm"].update(hi=0),
        lambda r: r.update(protocol={}),
        lambda r: r["evidence"].update(competition="PL"),
    ]:
        changed = deepcopy(raw)
        change(changed)
        path.write_text(json.dumps(changed))
        assert f.load("BL1", tmp_path) is None


def test_publication_passes_actual_side_and_lock_without_changing_laliga_history():
    from app.sorare import publish

    team = {"slug": "arsenal", "name": "Arsenal FC", "shortName": "Arsenal"}
    other = {"slug": "chelsea", "name": "Chelsea FC", "shortName": "Chelsea"}
    player = {
        "slug": "new-transfer",
        "position": "Defender",
        "activeClub": {**team, "domesticLeague": {"slug": "premier-league-gb-eng"}},
        "plan": [
            {
                "id": "actual",
                "date": "2026-10-24T14:00:00Z",
                "competition": {"slug": "premier-league-gb-eng"},
                "homeTeam": team,
                "awayTeam": other,
            }
        ],
    }
    rows = [{"player": player}]
    games = publish.card_games(rows, "plan")
    seen = []

    def score(player, mine, projection, past):
        seen.extend(mine)
        return Made((), None)

    history = {
        "new-transfer": [
            {
                "date": "2026-10-20T12:00:00Z",
                "competition": "premier-league-gb-eng",
                "played": True,
                "started": True,
                "status": "FINAL",
                "score": 0,
            },
            {
                "date": "2026-10-01T12:00:00Z",
                "competition": "laliga-es",
                "played": True,
                "started": True,
                "status": "FINAL",
                "score": 70,
            },
        ]
    }
    week = publish.player_weeks(rows, games, history, LOCK, None, use_sorare=False, scores=score)["new-transfer"]
    assert seen[0]["teamName"] == "Arsenal FC" and seen[0]["opponentName"] == "Chelsea FC"
    assert seen[0]["forecastBefore"] == LOCK.isoformat()
    assert week.cups == {"2026-10-01T12:00:00Z"}
    assert "forecastBefore" not in games["new-transfer"][0]


def test_foreign_index_uses_the_same_forecast_as_owned_cards_and_is_published_separately():
    from app.sorare import keeper, publish
    from tests.test_sorare_publish import snapshot

    snap = snapshot()
    held = snap["cards"][0]["player"]
    held["plan"][0]["competition"]["slug"] = "premier-league-gb-eng"
    unowned = deepcopy(held)
    unowned["slug"] = "unowned-pl-player"
    club = held["activeClub"]["slug"]

    def row(p):
        return {
            "slug": p["slug"],
            "name": p.get("displayName") or p["slug"],
            "pos": "GK",
            "club": "Arsenal",
            "average": 0,
            "projection": p.get("nextClassicFixtureProjectedScore"),
            "eur": None,
            "player": p,
        }

    snap["foreign"] = {"PL": {"complete": True, "clubs": {club: [row(held), row(unowned)]}}}

    def score(player, games, projection, past):
        if games and games[0]["competition"] == "premier-league-gb-eng":
            return Made((keeper.Outcome(0.4, 0.4, 90, 70, 80, 50, 95),), None)
        return Made((), None)

    result = publish.build_payload(snap, runs=1, draws=100, scores=score)
    market = result["_foreignMarkets"]["PL"]["market"]
    owned = next(p for p in publish.week_of(result)["playing"]["players"] if p["player"] == held["slug"])
    assert next(p for p in market if p["slug"] == held["slug"])["x"] == owned["x"]
    assert next(p for p in market if p["slug"] == "unowned-pl-player")["start"] == 80
    assert not any(p["slug"] == "unowned-pl-player" for p in result["market"])
    assert "unowned-pl-player" in result["_record"]["players"]


def test_foreign_cup_or_national_game_never_borrows_the_laliga_substitute_shape():
    score = f.scores_for({}, {}, lambda *args: Made((), "Spanish shape"))
    player = {"position": "Defender", "activeClub": {"domesticLeague": {"slug": "premier-league-gb-eng"}}}
    assert score(player, [{"kickoff": "2026-10-24T14:00:00Z", "competition": "world-cup"}], None, []).sub is None


def test_ligue_1_has_an_independent_complete_validated_artifact():
    import json

    assert f.load("FL1") is not None
    raw = json.loads((f.ROOT / "FL1.json").read_text("utf-8"))
    assert raw["evidence"]["cases"] == 6710
    assert raw["evidence"]["coverage"]["joinedGames"] == 910
    assert f.version("FL1").startswith("FL1:xscore-v3+")
    assert f.version("PL").startswith("PL:xscore-v2+")
    assert f.version("BL1").startswith("BL1:xscore-v2+")
