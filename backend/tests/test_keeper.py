"""The goalkeeper's number: the game in the score (plans/xscore.md P9 X3; roadmap 10.3).

A keeper's score is a clean sheet (a decisive action, worth 60 or more) or not, and without one it falls with the goals his side lets
in. These tests use made-up keepers whose scores come from a rule the model has to find again, and check the model never looks at a
game it is predicting.
"""

# ruff: noqa: F811  (the `db` fixture is used by importing it)

from __future__ import annotations

import json
import math
import random
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.models import Competition, Fixture, MarketOdds, Prediction, Team
from app.sorare import forecast as sorare_forecast
from app.sorare import keeper, publish, scores
from app.sorare.forecast import PlayerWeek
from app.sorare.keeper import GameNumbers, KeeperModel, Outcome, Start
from tests.test_pipeline import db  # noqa: F401  (fixture)

START = datetime(2025, 8, 15, 19, tzinfo=UTC)


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def numbers(cs: float = 0.3, xga: float = 1.1, xgf: float = 1.4, p_over: float | None = None) -> GameNumbers:
    return GameNumbers(cs=cs, xga=xga, xgf=xgf, p_over=p_over)


def made_up(count: int = 400, seed: int = 7, with_projection: bool = True) -> list[Start]:
    """Keepers whose score follows a known rule: a clean sheet scores 75; without one 62 minus 9 for each goal expected against.

    The football model says a clean sheet is a bit likelier than it is, as the real one does (it ran 5 points high).
    """
    rng = random.Random(seed)
    out: list[Start] = []
    for i in range(count):
        xga = rng.uniform(0.6, 2.2)
        said = min(0.9, math.exp(-xga) * 1.25)  # what the football model says
        happens = math.exp(-xga)  # what happens
        clean = rng.random() < happens
        score = (75.0 if clean else 62.0 - 9.0 * xga) + rng.gauss(0, 8)
        out.append(
            Start(
                week=f"week-{i // 8:02d}",
                date=START + timedelta(days=i // 8 * 7, hours=i % 8),
                player=f"keeper-{i % 12}",
                numbers=numbers(cs=said, xga=xga, xgf=1.3),
                proj=(score * 0.3 + 35 + rng.gauss(0, 5)) if with_projection else None,
                score=score,
                decisive=clean,
                clean_sheet=clean,
            )
        )
    return out


# --------------------------------------------------------------------------- the bookmakers' goals line
def test_a_price_that_agrees_with_the_model_changes_nothing() -> None:
    n = numbers(cs=0.3, xga=1.1, xgf=1.4)
    p_over = 1 - sum(
        math.exp(-2.5) * 2.5**k / math.factorial(k) for k in range(3)
    )  # the chance of over 2.5 at 2.5 goals
    cs, xga = keeper.adjusted(GameNumbers(n.cs, n.xga, n.xgf, p_over))
    assert xga == pytest.approx(1.1, abs=0.01)
    assert cs == pytest.approx(0.3, abs=0.01)


def test_a_higher_goals_line_means_more_goals_against_in_the_same_split_and_fewer_clean_sheets() -> None:
    n = numbers(cs=0.3, xga=1.0, xgf=2.0)
    cs, xga = keeper.adjusted(GameNumbers(n.cs, n.xga, n.xgf, 0.8))
    total = keeper.total_goals(0.8)
    assert xga == pytest.approx(1.0 * total / 3.0)
    assert xga > 1.0
    assert cs < 0.3


def test_without_a_price_the_football_models_numbers_stand() -> None:
    assert keeper.adjusted(numbers(cs=0.31, xga=1.2, xgf=1.5)) == (0.31, 1.2)
    assert keeper.adjusted(GameNumbers(0.31, 1.2, 1.5, 1.0)) == (0.31, 1.2)  # a price of exactly 1 is not a price


def test_the_total_goals_behind_a_line_are_the_ones_that_give_that_chance_of_over_2_5() -> None:
    for total in (1.8, 2.5, 3.4):
        p = 1 - sum(math.exp(-total) * total**k / math.factorial(k) for k in range(3))
        assert keeper.total_goals(p) == pytest.approx(total, abs=1e-3)


# --------------------------------------------------------------------------- fitting
def test_a_model_needs_enough_starts_to_be_fitted() -> None:
    assert keeper.fit(made_up(40)) is None


def test_a_fitted_model_scores_a_keeper_lower_against_a_stronger_attack() -> None:
    model = keeper.fit(made_up())
    assert model is not None
    weak, strong = model.predict(numbers(cs=0.4, xga=0.8)), model.predict(numbers(cs=0.1, xga=2.2))
    assert weak.start > strong.start + 8
    assert weak.p_decisive > strong.p_decisive


def test_the_model_finds_the_rule_the_scores_follow() -> None:
    model = keeper.fit(made_up(1500, seed=3))
    assert model is not None
    easy, hard = (
        model.predict(numbers(cs=math.exp(-0.8) * 1.25, xga=0.8)),
        model.predict(numbers(cs=math.exp(-2.0) * 1.25, xga=2.0)),
    )
    # the true chances of a clean sheet are e^-0.8 = 45% and e^-2.0 = 14%, though the football model said 56% and 17%
    assert easy.p_clean_sheet == pytest.approx(math.exp(-0.8), abs=0.06)
    assert hard.p_clean_sheet == pytest.approx(math.exp(-2.0), abs=0.05)
    assert easy.if_decisive == pytest.approx(75, abs=3)
    assert easy.if_plain == pytest.approx(62 - 9 * 0.8, abs=4)
    assert hard.if_plain == pytest.approx(62 - 9 * 2.0, abs=4)


def test_the_start_is_the_decisive_chance_times_the_score_with_one_plus_the_rest_times_the_score_without() -> None:
    model = keeper.fit(made_up())
    assert model is not None
    out = model.predict(numbers(cs=0.25, xga=1.3), projection=45.0)
    assert 0 < out.p_decisive < 1
    assert out.start == pytest.approx(out.p_decisive * out.if_decisive + (1 - out.p_decisive) * out.if_plain, abs=0.11)
    assert out.if_decisive > out.if_plain


def test_a_better_sorare_projection_lifts_the_number_and_without_one_there_still_is_a_number() -> None:
    model = keeper.fit(made_up(1500, seed=11))
    assert model is not None
    low, high = model.predict(numbers(), projection=35.0), model.predict(numbers(), projection=60.0)
    assert high.start > low.start
    plain = model.predict(numbers())
    assert 0 < plain.start < 100


def test_the_range_brackets_the_number_and_stays_on_the_scale() -> None:
    model = keeper.fit(made_up())
    assert model is not None
    out = model.predict(numbers(cs=0.2, xga=1.6))
    assert 0 <= out.low < out.start < out.high <= 100


def test_a_model_fitted_without_any_projection_still_works_when_the_game_has_one() -> None:
    model = keeper.fit(made_up(with_projection=False))
    assert model is not None
    assert model.predict(numbers(), projection=60.0).start == pytest.approx(model.predict(numbers()).start)


def test_the_artifact_is_written_and_read_back_exactly(tmp_path: Any) -> None:
    model = keeper.fit(made_up(), through="2026-09-30")
    assert model is not None
    path = tmp_path / "keeper_score.json"
    keeper.save(path, model)
    assert keeper.load(path) == model
    assert json.loads(path.read_text("utf-8"))["through"] == "2026-09-30"
    assert keeper.load(tmp_path / "missing.json") is None


# --------------------------------------------------------------------------- walk-forward
def test_a_game_is_predicted_only_from_weeks_before_it() -> None:
    starts = made_up()
    rows = keeper.walk_forward(starts)
    assert rows and rows[0].week > "week-10"  # the first weeks only train
    changed = [
        s
        if s.week != starts[-1].week
        else Start(**{**s.__dict__, "score": 5.0, "decisive": False, "clean_sheet": False})
        for s in starts
    ]
    again = keeper.walk_forward(changed)
    earlier = {(r.player, r.date): r.said.start for r in rows if r.week != starts[-1].week}
    assert earlier == {(r.player, r.date): r.said.start for r in again if r.week != starts[-1].week}


def test_walk_forward_rows_carry_what_happened_and_what_was_said() -> None:
    rows = keeper.walk_forward(made_up())
    row = rows[0]
    assert isinstance(row.said, Outcome)
    assert row.decisive in (True, False)
    assert row.score > 0


# --------------------------------------------------------------------------- the export
def game(
    day: int, *, home_goals: int, away_goals: int, keepers: dict[str, dict[str, Any]], forecast: bool = True
) -> dict[str, Any]:
    return {
        "id": f"Game:{day}",
        "date": (START + timedelta(days=day)).isoformat().replace("+00:00", "Z"),
        "home": {"slug": "home-fc", "name": "Home FC"},
        "away": {"slug": "away-fc", "name": "Away FC"},
        "homeGoals": home_goals,
        "awayGoals": away_goals,
        "players": keepers,
        "ctx": {
            "forecast": {"p_h": 0.5, "p_d": 0.25, "p_a": 0.25, "cs_h": 0.35, "cs_a": 0.2, "lam_h": 1.5, "lam_a": 1.0}
            if forecast
            else None,
            "ou": {"p_over": 0.52},
        },
    }


def keeper_row(
    team: str,
    *,
    started: bool = True,
    pos: str = "GK",
    score: float = 70.0,
    level: float = 60.0,
    proj: float | None = 55.0,
) -> dict[str, Any]:
    return {"pos": pos, "team": team, "score": score, "level": level, "proj": proj, "played": True, "started": started}


def test_each_keeper_start_becomes_a_row_with_his_sides_numbers_and_what_happened() -> None:
    games = [
        game(
            1,
            home_goals=2,
            away_goals=0,
            keepers={
                "home-keeper": keeper_row("home-fc", score=72.0, level=60.0),
                "away-keeper": keeper_row("away-fc", score=40.0, level=35.0, proj=None),
            },
        )
    ]
    starts = keeper.starts_from_games(games)
    by = {s.player: s for s in starts}
    home, away = by["home-keeper"], by["away-keeper"]
    assert (home.numbers.cs, home.numbers.xga, home.numbers.xgf) == (
        0.35,
        1.0,
        1.5,
    )  # the home side concedes the away side's goals
    assert (away.numbers.cs, away.numbers.xga, away.numbers.xgf) == (0.2, 1.5, 1.0)
    assert home.numbers.p_over == 0.52
    assert home.clean_sheet and home.decisive and home.proj == 55.0
    assert not away.clean_sheet and not away.decisive and away.proj is None


def test_a_keeper_on_the_bench_an_outfield_player_and_a_game_without_a_forecast_are_left_out() -> None:
    games = [
        game(
            1,
            home_goals=1,
            away_goals=1,
            keepers={"sub": keeper_row("home-fc", started=False), "striker": keeper_row("home-fc", pos="FWD")},
        ),
        game(2, home_goals=1, away_goals=1, keepers={"keeper": keeper_row("home-fc")}, forecast=False),
    ]
    assert keeper.starts_from_games(games) == []


def test_the_week_of_a_start_is_the_one_its_date_falls_in() -> None:
    weeks = [{"slug": "gw-a", "start": "2025-08-14T14:00:00Z", "end": "2025-08-19T14:00:00Z"}]
    starts = keeper.starts_from_games(
        [game(1, home_goals=0, away_goals=0, keepers={"keeper": keeper_row("home-fc")})], weeks=weeks
    )
    assert starts[0].week == "gw-a"


# --------------------------------------------------------------------------- the live feed
def seed(db: Any, *, kickoff: datetime = datetime(2026, 10, 10, 19, tzinfo=UTC)) -> None:
    home, away = Team(canonical_name="Real Betis", code="BET"), Team(canonical_name="Sevilla", code="SEV")
    db.add_all([home, away])
    db.flush()
    comp = Competition(source_key="PD", name="LaLiga")
    db.add(comp)
    db.flush()
    fixture = Fixture(
        competition_id=comp.id,
        season="2026",
        matchday=8,
        kickoff_utc=kickoff,
        home_team_id=home.id,
        away_team_id=away.id,
    )
    db.add(fixture)
    db.flush()
    for team, cs, xg_for, xg_against in ((home, 0.40, 1.6, 0.9), (away, 0.22, 0.9, 1.6)):
        db.add(
            Prediction(
                fixture_id=fixture.id,
                perspective_team_id=team.id,
                prediction_ts=datetime(2026, 10, 5, tzinfo=UTC),
                model_version="v",
                p_win=0.5,
                p_draw=0.25,
                p_loss=0.25,
                expected_points=1.75,
                difficulty_score=50.0,
                difficulty_label="Medium",
                p_clean_sheet=cs,
                xg_for=xg_for,
                xg_against=xg_against,
            )
        )
    db.add(
        MarketOdds(
            fixture_id=fixture.id,
            fetched_at=datetime(2026, 10, 5, tzinfo=UTC),
            source="odds-api",
            bookmakers=5,
            p_home=0.5,
            p_draw=0.25,
            p_away=0.25,
            p_over_2_5=0.55,
            home_goals=1.5,
            away_goals=1.0,
        )
    )
    db.commit()


def test_a_game_is_found_by_the_club_and_the_day_and_comes_with_his_sides_numbers(db: Any) -> None:
    seed(db)
    find = keeper.numbers_for(db, datetime(2026, 10, 1, tzinfo=UTC))
    got = find("Real Betis Balompié", "2026-10-10T19:00:00Z")
    assert got is not None
    assert (got.xga, got.xgf, got.p_over) == (0.9, 1.6, 0.55)
    assert got.cs == pytest.approx(keeper.raw_clean_sheet(0.40), abs=1e-9)
    away = find("Sevilla FC", "2026-10-10T19:00:00Z")
    assert away is not None and (away.xga, away.xgf) == (1.6, 0.9)


def test_a_game_a_day_off_is_still_the_same_game_but_another_week_is_not(db: Any) -> None:
    seed(db)
    find = keeper.numbers_for(db, datetime(2026, 10, 1, tzinfo=UTC))
    assert find("Sevilla FC", "2026-10-10T21:00:00Z") is not None  # the schedule moved a couple of hours
    assert find("Sevilla FC", "2026-10-17T19:00:00Z") is None
    assert find("Mystery United", "2026-10-10T19:00:00Z") is None


def test_the_raw_clean_sheet_is_what_the_calibration_was_applied_to() -> None:
    from app.services.calibration import CleanSheetCalibration

    calibration = CleanSheetCalibration(a=-0.15, b=0.93, n=1000)
    for raw in (0.1, 0.3, 0.5):
        assert keeper.raw_clean_sheet(calibration.apply(raw), calibration) == pytest.approx(raw, abs=1e-6)


# --------------------------------------------------------------------------- in the forecast
def model() -> KeeperModel:
    fitted = keeper.fit(made_up())
    assert fitted is not None
    return fitted


def keeper_week(*outcomes: Outcome, pos: str = "GK") -> PlayerWeek:
    return PlayerWeek(
        games=len(outcomes) or 1,
        projection=44.0,
        plays_odds=0.95,
        start_odds=0.95,
        history=[("2026-09-27", 40.0, True), ("2026-09-20", 30.0, True), ("2026-09-13", 50.0, True)],
        starts={"2026-09-27": True, "2026-09-20": True, "2026-09-13": True},
        pos=pos,
        game_scores=tuple(o.start for o in outcomes),
    )


def test_a_keepers_score_if_he_starts_is_the_models_for_that_game() -> None:
    out = model().predict(numbers(cs=0.1, xga=2.0), projection=44.0)
    forecast = sorare_forecast.forecast(keeper_week(out))
    assert forecast.start == pytest.approx(out.start, abs=0.06)
    assert forecast.mu == pytest.approx(out.start, abs=0.06)


def test_with_two_games_the_start_score_is_their_average_and_the_best_of_two_bump_stays() -> None:
    one, two = model().predict(numbers(cs=0.4, xga=0.8)), model().predict(numbers(cs=0.1, xga=2.2))
    week = keeper_week(one, two)
    forecast = sorare_forecast.forecast(week)
    assert forecast.start == pytest.approx((one.start + two.start) / 2, abs=0.06)
    assert forecast.mu > forecast.start


def test_a_keeper_without_the_games_numbers_is_scored_as_before() -> None:
    assert sorare_forecast.forecast(keeper_week()) == sorare_forecast.forecast(
        PlayerWeek(**{**keeper_week().__dict__, "game_scores": ()})
    )
    plain = sorare_forecast.forecast(keeper_week())
    assert plain.start == pytest.approx(44.0)  # Sorare's projection for a regular starter, as today


def test_a_regular_starters_number_is_the_games_and_a_rotation_players_moves_by_his_share_of_starts() -> None:
    regular = PlayerWeek(**{**keeper_week().__dict__, "pos": "DEF", "game_scores": (60.0,)})
    assert sorare_forecast.forecast(regular).start == pytest.approx(60.0)
    assert sorare_forecast.forecast(regular).mu == pytest.approx(60.0)
    rotation = PlayerWeek(
        **{
            **keeper_week().__dict__,
            "pos": "DEF",
            "projection": None,
            "start_odds": 0.4,
            "plays_odds": 0.9,
            "game_scores": (60.0,),
        }
    )
    made = sorare_forecast.forecast(rotation)
    assert made.start == pytest.approx(60.0)
    assert made.mu < 60.0  # he comes on in the games he does not start: his score if he plays is not all starts


# --------------------------------------------------------------------------- in the published page and the refresh
def _fixed(out: Outcome) -> Any:
    """A keeper callback that answers every keeper's game with this outcome (and records which players it was asked about)."""
    asked: list[str] = []

    def of(
        player: dict[str, Any], games: list[dict[str, Any]], projection: float | None, past: list[dict[str, Any]]
    ) -> tuple[float, ...]:
        asked.append(player["slug"])
        return tuple(out.start for _ in games) if player["position"] == "Goalkeeper" else ()

    of.asked = asked  # type: ignore[attr-defined]
    return of


def test_the_page_scores_a_keeper_from_his_game_and_leaves_a_player_the_callback_has_nothing_for() -> None:
    from tests.test_sorare_publish import snapshot

    out = model().predict(numbers(cs=0.1, xga=2.0), projection=55.0)
    of = _fixed(out)

    payload = publish.build_payload(snapshot(), runs=2, draws=100, scores=of)

    players = publish.week_of(payload)["playing"]["players"]
    keeper_card = next(p for p in players if p["player"] == "keeper-one")
    assert keeper_card["start"] == pytest.approx(out.start, abs=0.06)
    assert keeper_card["start"] != 55.0  # Sorare's projection alone, as before
    assert "keeper-one" in of.asked and "back-one" in of.asked  # type: ignore[attr-defined]
    outfield = next(p for p in players if p["player"] == "back-one")
    assert outfield["start"] == 55.0


def test_without_a_keeper_callback_the_page_is_what_it_was() -> None:
    from tests.test_sorare_publish import snapshot

    payload = publish.build_payload(snapshot(), runs=2, draws=100)

    keeper_card = next(p for p in publish.week_of(payload)["playing"]["players"] if p["player"] == "keeper-one")
    assert keeper_card["start"] == 55.0


def test_the_games_a_callback_cannot_tell_leave_a_keeper_scored_as_before() -> None:
    from tests.test_sorare_publish import snapshot

    nothing = scores.scores_for(model(), {}, lambda club, kickoff: None)
    payload = publish.build_payload(snapshot(), runs=2, draws=100, scores=nothing)

    keeper_card = next(p for p in publish.week_of(payload)["playing"]["players"] if p["player"] == "keeper-one")
    assert keeper_card["start"] == 55.0


def test_a_game_outside_laliga_leaves_the_whole_week_to_the_old_number() -> None:
    of = keeper.outcomes_for(model(), lambda club, kickoff: numbers())
    club = {"name": "Real Betis", "shortName": "Betis"}
    games = [
        {"competition": LALIGA_SLUG, "kickoff": "2026-10-10T19:00:00Z"},
        {"competition": "uefa-champions-league", "kickoff": "2026-10-12T19:00:00Z"},
    ]
    assert of({"activeClub": club}, games, 50.0) == ()
    assert len(of({"activeClub": club}, games[:1], 50.0)) == 1
    assert keeper.outcomes_for(None, lambda c, k: numbers())({"activeClub": club}, games[:1], 50.0) == ()


LALIGA_SLUG = "laliga-es"


def test_a_keeper_step_that_fails_leaves_the_refresh_publishing(db: Any, monkeypatch: Any) -> None:
    from app.jobs import sorare as job
    from tests.test_sorare_projection import _Client, early_snapshot, rounds

    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.setattr(job.settings, "sorare_api_key", "test-key")
    monkeypatch.setattr(job, "SorareClient", lambda *a, **k: _Client())
    snap = early_snapshot()
    snap["fetchedAt"] = datetime.now(UTC).isoformat()
    monkeypatch.setattr(job.sorare_sync, "snapshot", lambda *a, **k: snap)
    monkeypatch.setattr(job.projection, "calendar", lambda db, now: rounds())
    monkeypatch.setattr(job.understat, "fetch_leagues", lambda *a, **k: {})

    def broken(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("the predictions are unreadable")

    monkeypatch.setattr(job.keeper, "numbers_for", broken)

    summary = job.run(db, "yares", runs=1)

    assert "RuntimeError" in summary["failed"]["game scores"]
    from app.models import ReadModel

    assert db.get(ReadModel, job.SORARE_KEY) is not None
