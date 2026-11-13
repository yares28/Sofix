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


def test_the_boards_read_of_a_foreign_game_is_its_cell_from_his_side():
    grid, game = fixture()
    cell = grid["teams"][0]["cells"][0][0]
    cell["prediction"].update(
        probabilities={"win": 0.55, "draw": 0.25, "loss": 0.2}, difficulty=40.2, label="Favourite", bucket=2
    )
    cell["forecast_at"] = None  # the board shows it whether or not it was made before the lock
    assert f.board_read({"PL": grid}, game) == {
        "win": 0.55,
        "draw": 0.25,
        "loss": 0.2,
        "cleanSheet": 0.4,
        "goalsFor": 1.5,
        "goalsAgainst": 0.9,
        "difficulty": 40.2,
        "label": "Favourite",
        "bucket": 2,
        "source": "model",
    }
    assert f.board_read({"PL": grid}, {**game, "opponentName": "Fulham FC"}) is None
    assert f.board_read({}, game) is None

    # The refresh's reader: a LaLiga game from the predictions (Sorare's short name when the full one is unknown), others from the grids.
    from app.jobs.sorare import board_of

    oblak = {
        "competition": "laliga-es",
        "teamName": "Club Atlético de Madrid",
        "team": "Atlético",
        "kickoff": "2026-11-08T15:15:00Z",
    }
    said = {"difficulty": 62.0, "source": "model"}
    known = {"Atlético": said}
    read = board_of(lambda club, kickoff: known.get(club), {"PL": grid})
    assert read(oblak) == said
    assert read({**oblak, "team": "Getafe"}) is None
    assert read(game)["difficulty"] == 40.2
    assert board_of(None, {})(oblak) is None


def test_mixed_domestic_european_week_selects_each_game_model_and_scores_each_game_on_its_own():
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
            return SimpleNamespace(start=50, why=())

        return SimpleNamespace(outfield={"DEF": SimpleNamespace(outcome=outcome)}, keeper=None, subs={})

    score = f.scores_for(
        {"PL": model("PL"), "CL": model("CL")},
        {"PL": domestic, "CL": european},
        lambda *args: Made((), None),
        european_games={},
    )
    made = score({"position": "Defender"}, [first, second], 99, [])
    assert len(made.outcomes) == 2 and seen == ["PL", "CL"]
    # A game that cannot be told loses only its own number (plans/multi-competition-review.md B5).
    unknown = score({"position": "Defender"}, [first, {**second, "opponentSlug": "wrong"}], 99, []).outcomes
    assert unknown[0].start == 50 and unknown[1] is None
    unmodelled = score(
        {"position": "Defender"}, [first, {**second, "competition": "uefa-europa-conference-league"}], 99, []
    )
    assert unmodelled.outcomes[0].start == 50 and unmodelled.outcomes[1] is None and unmodelled.waiting == ()
    # A stale European board: that game waits for the board (B7).
    european["_fresh"] = False
    stale = score({"position": "Defender"}, [first, second], 99, [])
    assert stale.outcomes[0].start == 50 and stale.outcomes[1] is None and stale.waiting == (1,)


def test_a_champions_league_game_keeps_sofix_next_to_a_serie_a_game():
    _, game = fixture()
    european, _ = fixture()
    european.update(competition="CL", model_version=f.expected_version("CL"), _fresh=True)
    european["teams"][0]["cells"][0][0].update(neutral=False, phase="league")
    european["teams"][0]["sorare_slug"], european["teams"][1]["sorare_slug"] = "inter", "arsenal"
    cl = {**game, "id": "cl", "teamSlug": "inter", "opponentSlug": "arsenal", "competition": "uefa-champions-league"}
    serie_a = {**game, "id": "sa", "kickoff": "2026-10-27T19:45:00Z", "competition": "serie-a-it"}
    model = SimpleNamespace(
        outfield={"DEF": SimpleNamespace(outcome=lambda *a: SimpleNamespace(start=61, why=()))}, subs={}
    )
    score = f.scores_for({"CL": model}, {"CL": european}, lambda *args: Made((), None), european_games={})
    inter = {"position": "Defender", "activeClub": {"domesticLeague": {"slug": "serie-a-it"}}}
    made = score(inter, [serie_a, cl], 70, [])
    assert [o.start if o else None for o in made.outcomes] == [61, None]  # kickoff order: the CL game, then Serie A
    assert score(inter, [serie_a], 70, []).outcomes == ()  # only unmodelled games: exactly as before


def test_european_history_requires_explicit_complete_context_and_filters_qualifiers():
    grid, game = fixture()
    grid.update(competition="CL", model_version=f.expected_version("CL"), _fresh=True)
    grid["teams"][0].update(sorare_slug="arsenal")
    grid["teams"][1].update(sorare_slug="chelsea")
    grid["teams"][0]["cells"][0][0].update(phase="league", neutral=False)
    game.update(competition="uefa-champions-league", teamSlug="arsenal", opponentSlug="chelsea")
    seen = []
    bundle = SimpleNamespace(
        outfield={
            "DEF": SimpleNamespace(outcome=lambda n, h, d, m, p: seen.append(m) or SimpleNamespace(start=m, why=()))
        },
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
        return SimpleNamespace(start=own_score, why=())

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


def test_a_european_market_has_no_next_week_game_and_a_domestic_one_does():
    """3 Nov 2026: with the week after's game the Champions League block passed its 1.6 MB budget and stopped the whole Sorare
    step. A European week's players have their next, domestic, game in their own league's rows; the European rows leave it out."""
    from app.sorare import publish
    from tests.test_sorare_publish import snapshot

    snap = snapshot()
    held = snap["cards"][0]["player"]
    club = held["activeClub"]["slug"]

    def row(code: str) -> dict:
        p = deepcopy(held)
        p["slug"] = f"{code.lower()}-player"
        return {
            "slug": p["slug"],
            "name": p["slug"],
            "pos": "GK",
            "club": "Arsenal",
            "average": 0,
            "projection": 50.0,
            "eur": None,
            "player": p,
        }

    snap["foreign"] = {code: {"complete": True, "clubs": {club: [row(code)]}} for code in ("PL", "CL", "EL", "CONF")}
    markets = publish.build_payload(snap, runs=1, draws=100)["_foreignMarkets"]
    assert "next" in markets["PL"]["market"][0]
    for code in ("CL", "EL", "CONF"):
        assert "next" not in markets[code]["market"][0], code


def test_competition_v1_model_answers_its_game_as_sofix_v1_with_league_history():
    from app.sorare import sofix_v1

    grid, game = fixture()
    model = sofix_v1.Model(
        # the first input is his position (0 GK, 1 DEF): a defender's start lands on the right leaf
        {
            "start": [[[0, 0.5, 1, 2], [[40], [1]], [[50, 181], [3, 1]]]],
            "bench": [[[[30], [1]]]],
            "point": [[[[44], [1]]]],
        },
        datetime(2026, 10, 1, tzinfo=UTC),
        competition="premier-league-gb-eng",
    )
    seen = []

    def outcome(numbers, home, own_dec, own_score, projection):
        return SimpleNamespace(start=61.0, why=())

    bundle = SimpleNamespace(outfield={"DEF": SimpleNamespace(outcome=outcome)}, keeper=None, subs={})
    real_features = sofix_v1.features
    sofix_v1.features = lambda pos, home, numbers, past: seen.append(past) or real_features(pos, home, numbers, past)
    try:
        made = f.scores_for({"PL": bundle}, {"PL": grid}, lambda *a: Made((), None), v1={"PL": model})(
            {"position": "Defender"},
            [game],
            None,
            [
                {
                    "date": "2026-10-10T12:00:00Z",
                    "competition": "premier-league-gb-eng",
                    "played": True,
                    "started": True,
                    "score": 70,
                    "mins": 90,
                    "status": "FINAL",
                },
                {
                    "date": "2026-10-11T12:00:00Z",
                    "competition": "laliga-es",
                    "played": True,
                    "started": True,
                    "score": 10,
                    "mins": 90,
                    "status": "FINAL",
                },
            ],
        )
    finally:
        sofix_v1.features = real_features
    (got,) = made.outcomes
    assert isinstance(got, sofix_v1.GameScore)
    assert (got.point, got.sub.point, got.version, got.previous) == (44, 30, "Sofix v1", 61.0)
    assert got.start == 57.5  # the expected score comes from the full trees, decisive games included
    assert [g["competition"] for g in seen[0]] == ["premier-league-gb-eng"]
    late = sofix_v1.Model(model.trees, LOCK, competition="premier-league-gb-eng")
    (old,) = f.scores_for({"PL": bundle}, {"PL": grid}, lambda *a: Made((), None), v1={"PL": late})(
        {"position": "Defender"}, [game], None, []
    ).outcomes
    assert not isinstance(old, sofix_v1.GameScore) and old.start == 61.0  # trained through the lock: earlier formula
