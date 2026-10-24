# ruff: noqa: F811
from copy import deepcopy
from datetime import timedelta

from app.models import PlayerGame, ReadModel
from app.services.publish import put
from app.sorare import audit, frozen_scores, strategy_audit
from tests.test_frozen_scores import END, NOW, frozen, keep
from tests.test_pipeline import db  # noqa: F401

TIERS = [
    {"lo": 1, "hi": 10, "cash": 5, "essence": 0, "card": False},
    {"lo": 11, "hi": 100, "cash": 0, "essence": 250, "card": False},
    {"lo": 101, "hi": 500, "cash": 0, "essence": 0, "card": False, "xp": 500},
]


def lab():
    line = deepcopy(frozen()["plans"][0]["lineups"][0])
    line.update({"x": 150, "lo": 100, "hi": 200, "tiers": TIERS})
    line["starters"][0]["mu"] = 40.0  # he scored 80: above the top of his own range
    line["starters"][1]["mu"] = 40.0
    return {
        "gameweek": {"slug": "gw", "number": 20, "end": END.isoformat()},
        "games": {"a": ["g1", "g2"], "b": ["g1"], "c": ["g1"]},
        "strategies": [
            {"key": "xscore", "label": "xScore", "note": "n", "lineups": [line]},
            {"key": "ceiling", "label": "Highest ceiling", "note": "n", "lineups": [deepcopy(line) | {"x": 190}]},
        ],
    }


def test_a_verdict_says_whether_the_score_was_built_on_the_numbers_or_on_luck():
    raw = {"x": 150, "lo": 100, "hi": 200}
    cards = [("A", True, 80.0, 40.0), ("B", True, 45.0, 40.0), ("C", False, 0.0, 40.0)]
    assert frozen_scores.verdict(250, raw, cards) == {"label": "lucky", "beat": ["A"]}
    assert frozen_scores.verdict(190, raw, cards)["label"] == "good"
    assert frozen_scores.verdict(150, raw, cards)["label"] == "expected"
    assert frozen_scores.verdict(60, raw, cards)["label"] == "poor"
    assert frozen_scores.verdict(150, {"x": 150}, cards) is None  # no range was kept: nothing to judge against


def test_a_frozen_lineup_carries_its_verdict(db):
    keep(db)
    value = deepcopy(frozen())
    value["plans"][0]["lineups"][0].update({"lo": 100, "hi": 140})
    put(db, "sorare_plan:gw", value, NOW)
    assert frozen_scores.read(db, NOW)[0]["plans"][0]["lineups"][0]["verdict"]["label"] == "lucky"  # 183 against 140


def test_strategies_sofix_and_you_are_scored_side_by_side_and_a_settled_week_is_kept(db):
    keep(db)
    db.get(PlayerGame, ("b", "g1")).status = "DID_NOT_PLAY"  # the lineup scores 183
    put(db, "strategy_plans:gw", lab(), NOW)
    put(db, "sorare_references", {"gw": {"LaLiga | Limited": {"cuts": {"10": 300, "100": 200, "500": 100}}}}, NOW)
    put(db, "sorare_week:gw", {"hindsight": {"lineups": [{"key": "LaLiga | Limited", "actual": {"total": 300}}]}}, NOW)
    mine = {
        "draft": False,
        "board": "b",
        "competition": "LaLiga",
        "result": {"score": 120, "rank": 5, "cash": 0, "essence": 250, "card": False},
        "scoring": {"slots": [{"sub": False}, {"sub": False}]},
        "cards": [
            {
                "slug": "x1",
                "player": "x1",
                "name": "X One",
                "positions": ["Goalkeeper"],
                "club": "club-a",
                "index": 0,
                "score": 60,
            },
            {
                "slug": "x2",
                "player": "x2",
                "name": "X Two",
                "positions": ["Defender"],
                "club": "club-a",
                "index": 1,
                "score": 60,
            },
        ],
    }
    put(db, "my_week:gw", {"lineups": [mine, {**mine, "draft": True}]}, NOW)
    db.commit()

    got = strategy_audit.read(db, NOW)
    keys = [s["key"] for s in got["strategies"]]
    assert keys[:2] == ["xscore", "sorare"] and len(keys) == 10  # every strategy is listed, in order, played or not
    first, ceiling = got["strategies"][0], next(s for s in got["strategies"] if s["key"] == "ceiling")
    assert ceiling["key"] == "ceiling" and ceiling["verdicts"]["expected"] == 1  # 183 against 190 expected
    assert (first["lineups"], first["scored"], first["points"], first["best"], first["pointsVs"]) == (
        1,
        1,
        183.0,
        300.0,
        183.0,
    )
    assert first["won"] == {"card": 0, "cash": 0, "essence": 0, "xp": 1, "none": 0}  # 183 reaches the XP level only
    assert first["verdicts"]["good"] == 1 and first["weeks"] == 1
    assert (
        got["sofix"]["points"] == 183.0 and got["sofix"]["weeks"] == 1
    )  # the frozen plan's lineup, scored the same way
    assert (
        got["you"]["points"] == 120.0 and got["you"]["won"]["essence"] == 1 and got["you"]["lineups"] == 1
    )  # the draft is left out
    assert got["you"]["best"] == 300.0  # his lineup is judged against the best of its own competition

    week = got["weeks"][0]
    board = week["boards"][0]
    assert [r["who"] for r in board["rows"]] == ["you", "sofix", "xscore", "ceiling"]  # yours first, then by score
    mine_row = board["rows"][0]
    assert mine_row["rank"] == 5 and mine_row["fits"] == ["keeper-defender"]  # his keeper and defender share a club
    assert board["rows"][2]["beat"] == ["a"] and board["rows"][2]["cards"][0]["score"] == 80.0
    assert week["final"] is True

    # Kept: the plans are not opened again, so what they said then stays what is counted.
    db.delete(db.get(ReadModel, "strategy_plans:gw"))
    db.delete(db.get(ReadModel, "sorare_plan:gw"))
    db.commit()
    assert strategy_audit.read(db, NOW)["strategies"] == got["strategies"]
    assert audit.from_kept(db, NOW)["strategies"]["strategies"] == got["strategies"]


def test_a_lineup_fits_the_strategies_it_happens_to_follow():
    def card(player, pos, club):
        return {"player": player, "pos": pos, "club": club}

    stack = [card("k", "GK", "a"), card("d", "DEF", "a"), card("m", "MID", "a"), card("f", "FWD", "b")]
    assert strategy_audit.fits(stack, None) == [
        "keeper-defender",
        "club-stack",
    ]  # the games are not known: those two only
    game = {"id": "g1", "venue": "H", "odds": {"win": 0.6, "draw": 0.2, "loss": 0.2}}
    fixtures = {c["player"]: {"games": [game], "p": 0.95} for c in stack}
    assert strategy_audit.fits(stack, fixtures) == ["keeper-defender", "club-stack", "no-clash", "surest", "favourites"]
    fixtures["f"] = {
        "games": [{"id": "g1", "venue": "A"}],
        "p": 0.5,
    }  # the forward plays against the keeper, and might not play
    assert strategy_audit.fits(stack, fixtures) == ["keeper-defender", "club-stack"]


def test_a_week_is_scored_when_its_games_are_in_but_final_only_a_day_later_and_with_the_best_in_hindsight(db):
    keep(db)
    put(db, "strategy_plans:gw", lab(), NOW)
    put(db, "sorare_references", {"gw": {"LaLiga | Limited": {"cuts": {"10": 300, "100": 200, "500": 100}}}}, NOW)
    db.commit()
    assert (
        strategy_audit.read(db, END - timedelta(hours=1), write=False)["weeks"] == []
    )  # the week is still being played
    soon = strategy_audit.read(db, END + timedelta(hours=1), write=False)["weeks"]
    assert [w["final"] for w in soon] == [False]  # scored at once, but its scores can still move for a day
    got = strategy_audit.read(db, NOW, write=False)
    assert got["weeks"][0]["final"] is False and got["strategies"][0]["best"] == 0.0
    assert db.get(ReadModel, strategy_audit.KEY) is None


def test_each_source_uses_its_own_games_and_sorare_plan_is_not_the_projection_strategy(db):
    keep(db)
    other = deepcopy(frozen())
    other["playing"]["players"][0]["games"] = [{"id": "g1"}]
    put(db, "sorare_alt:gw", other, NOW)
    value = lab()
    value["games"]["a"] = ["g1"]
    put(db, "strategy_plans:gw", value, NOW)
    got = strategy_audit.read(db, NOW)
    assert got["sofix"]["points"] == 183
    assert got["sorare"]["points"] == 119
    assert got["strategies"][0]["points"] == 119
    assert {r["who"] for r in got["weeks"][0]["boards"][0]["rows"]} >= {"sofix", "sorare-plan", "xscore"}


def test_owner_only_weeks_include_zero_pending_and_unranked_scores_but_never_drafts(db):
    lines = [
        {"id": "zero", "board": "b", "result": {"score": 0, "rank": 1}},
        {"id": "missing", "board": "b", "result": {"score": None, "rank": 2}},
        {"id": "unranked", "board": "b", "result": {"score": 100, "rank": None}},
        {"id": "draft", "draft": True, "result": {"score": 999, "rank": 1}},
    ]
    put(db, "my_week:old", {"slug": "old", "number": 1, "end": END.isoformat(), "lineups": lines}, NOW)
    got = strategy_audit.read(db, NOW)
    assert len(got["weeks"]) == 1
    assert (got["you"]["lineups"], got["you"]["scored"], got["you"]["points"]) == (3, 2, 100)
    assert (got["you"]["pending"], got["you"]["rewardPending"]) == (1, 1)
    assert got["you"]["judged"] == 1
    assert not got["weeks"][0]["final"]


def test_missing_results_and_each_boards_prize_are_retried_after_fourteen_days(db):
    keep(db)
    db.get(PlayerGame, ("a", "g2")).status = "REVIEWING"
    put(db, "strategy_plans:gw", lab(), NOW)
    put(db, "sorare_references", {"gw": {"Other board": {"cuts": {"1": 100}}}}, NOW)
    later = END + timedelta(days=30)
    first = strategy_audit.read(db, later)
    assert first["weeks"][0]["final"] is False
    assert first["strategies"][0]["pending"] == 1
    pending = first["weeks"][0]["boards"][0]["rows"][0]
    assert pending["cards"][0]["score"] is None and pending["cards"][0]["played"] is None
    db.get(PlayerGame, ("a", "g2")).status = "FINAL"
    second = strategy_audit.read(db, later)
    assert second["strategies"][0]["scored"] == 1
    assert second["strategies"][0]["rewardPending"] == 1
    assert second["weeks"][0]["final"] is False
    put(db, "sorare_references", {"gw": {"LaLiga | Limited": {"cuts": {"10": 300, "100": 200, "500": 100}}}}, later)
    put(
        db, "sorare_week:gw", {"hindsight": {"lineups": [{"key": "LaLiga | Limited", "actual": {"total": 300}}]}}, later
    )
    third = strategy_audit.read(db, later)
    assert third["weeks"][0]["final"] is True
    assert strategy_audit.read(db, later) == third


def test_old_cache_rebuilds_available_sources_preserves_orphans_and_accepts_late_owner_results(db):
    keep(db)
    put(db, "strategy_plans:gw", lab(), NOW)
    old = strategy_audit.read(db, NOW, write=False)["weeks"][0]
    orphan = deepcopy(old) | {"slug": "orphan", "final": True}
    put(db, strategy_audit.KEY, {"version": 2, "weeks": {"gw": old | {"final": True}, "orphan": orphan}}, NOW)
    first = strategy_audit.read(db, NOW)
    assert {w["slug"] for w in first["weeks"]} == {"gw", "orphan"}
    assert "sorare" in first
    put(
        db,
        "my_week:gw",
        {
            "number": 20,
            "end": END.isoformat(),
            "lineups": [{"id": "late", "board": "b", "result": {"score": 77, "rank": 1}}],
        },
        NOW + timedelta(hours=1),
    )
    assert strategy_audit.read(db, NOW + timedelta(hours=1))["you"]["points"] == 77


def test_sorare_only_week_and_alternative_only_player_are_scored(db):
    keep(db)
    other = deepcopy(frozen())
    other["plans"][0]["lineups"][0]["starters"][0]["player"] = "alt-only"
    other["playing"]["players"].append({"player": "alt-only", "games": [{"id": "g3"}]})
    db.add(
        PlayerGame(
            player="alt-only",
            game_id="g3",
            date=END,
            competition="laliga-es",
            status="FINAL",
            played=True,
            score=80,
            read_at=NOW,
        )
    )
    put(db, "sorare_alt:alt", other | {"gameweek": other["gameweek"] | {"slug": "alt"}}, NOW)
    got = strategy_audit.read(db, NOW)
    assert next(w for w in got["weeks"] if w["slug"] == "alt")["sorare"]["scored"] == 1


def test_completed_cache_reopens_for_a_later_private_read_without_recounting(db):
    body = {"number": 1, "end": END.isoformat(), "lineups": [{"id": "one", "result": {"score": 0, "rank": 1}}]}
    put(db, "my_week:old", body, NOW)
    first = strategy_audit.read(db, NOW)
    assert first["weeks"][0]["final"]
    assert strategy_audit.read(db, NOW) == first
    body["lineups"].append({"id": "two", "result": {"score": 100, "rank": 2}})
    put(db, "my_week:old", body, NOW + timedelta(hours=1))
    later = strategy_audit.read(db, NOW + timedelta(hours=1))
    assert later["you"]["scored"] == 2 and later["you"]["points"] == 100
    assert strategy_audit.read(db, NOW + timedelta(hours=1)) == later
