"""A defender's, midfielder's or forward's number from his game (plans/xscore.md P9 X4; roadmap 10.4)."""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.jobs import outfield_fit
from app.sorare import keeper, outfield, scores
from app.sorare.keeper import GameNumbers

START = datetime(2025, 8, 15, 19, tzinfo=UTC)


def numbers(cs: float = 0.3, xga: float = 1.1, xgf: float = 1.4) -> GameNumbers:
    return GameNumbers(cs=cs, xga=xga, xgf=xgf)


def made_up(count: int = 600, seed: int = 5, pos: str = "FWD") -> list[outfield.OutfieldStart]:
    """Starts whose score rises with his side's expected goals and with his own record: 30 + 8 per goal expected + 0.4 of his own mean."""
    rng = random.Random(seed)
    out = []
    for i in range(count):
        xgf = rng.uniform(0.6, 2.6)
        own = rng.uniform(35, 55)
        score = 12 + 8 * xgf + 0.4 * own + rng.gauss(0, 6)
        out.append(
            outfield.OutfieldStart(
                week=f"week-{i // 12:02d}",
                date=START + timedelta(days=i // 12 * 7, hours=i % 12),
                player=f"p{i % 20}",
                pos=pos,
                numbers=numbers(xgf=xgf, xga=2.7 - xgf),
                home=i % 2 == 0,
                proj=None,
                own_dec=0.12,
                own_score=own,
                score=score,
                decisive=score >= 60,
            )
        )
    return out


def test_a_player_with_no_starts_is_the_norm_and_a_long_record_speaks_for_itself() -> None:
    assert outfield.own_record([]) == pytest.approx((outfield.PRIOR_DECISIVE, outfield.PRIOR_SCORE))
    dec, mean = outfield.own_record([70.0] * 100)
    assert dec > 0.9 and mean > 65


def test_a_position_needs_enough_starts_to_be_fitted() -> None:
    assert outfield.fit(made_up(60), "FWD") is None
    assert outfield.fit(made_up(600, pos="DEF"), "FWD") is None


def test_the_line_finds_what_the_scores_follow() -> None:
    model = outfield.fit(made_up(3000), "FWD")
    assert model is not None
    low = model.predict(numbers(xgf=0.8, xga=1.9), home=True, own_dec=0.12, own_score=45.0)
    high = model.predict(numbers(xgf=2.2, xga=0.5), home=True, own_dec=0.12, own_score=45.0)
    assert high - low == pytest.approx(8 * 1.4, abs=2.5)
    better = model.predict(numbers(), home=True, own_dec=0.12, own_score=55.0)
    worse = model.predict(numbers(), home=True, own_dec=0.12, own_score=35.0)
    assert better - worse == pytest.approx(0.4 * 20, abs=2.5)
    assert 0 <= model.predict(numbers(), True, 0.12, 45.0) <= 100


def test_a_projection_is_used_when_there_is_one_and_without_one_there_is_still_a_number() -> None:
    starts = [outfield.OutfieldStart(**{**s.__dict__, "proj": 40 + (s.score - 45) * 0.5}) for s in made_up(1200)]
    model = outfield.fit(starts, "FWD")
    assert model is not None
    with_proj = model.predict(numbers(), True, 0.12, 45.0, projection=70.0)
    without = model.predict(numbers(), True, 0.12, 45.0)
    assert with_proj > without


def test_the_artifact_is_written_and_read_back_exactly(tmp_path: Any) -> None:
    models = outfield.fit_all(made_up(600) + made_up(600, pos="DEF", seed=2), through="2026-09-30")
    assert set(models) == {"FWD", "DEF"}
    outfield.save(tmp_path / "o.json", models)
    assert outfield.load(tmp_path / "o.json") == models
    assert outfield.load(tmp_path / "missing.json") == {}


def test_a_game_is_predicted_only_from_weeks_before_it() -> None:
    starts = made_up()
    rows = outfield.walk_forward(starts)
    assert rows and rows[0].week > "week-10"
    last = starts[-1].week
    changed = [outfield.OutfieldStart(**{**s.__dict__, "score": 1.0}) if s.week == last else s for s in starts]
    again = outfield.walk_forward(changed)
    assert {(r.player, r.date): r.said for r in rows if r.week != last} == {
        (r.player, r.date): r.said for r in again if r.week != last
    }


def game(day: int, players: dict[str, dict[str, Any]], *, forecast: bool = True) -> dict[str, Any]:
    return {
        "id": f"g{day}",
        "date": (START + timedelta(days=day)).isoformat().replace("+00:00", "Z"),
        "home": {"slug": "home-fc", "name": "Home FC"},
        "away": {"slug": "away-fc", "name": "Away FC"},
        "homeGoals": 1,
        "awayGoals": 0,
        "players": players,
        "ctx": {
            "forecast": {"p_h": 0.5, "p_d": 0.25, "p_a": 0.25, "cs_h": 0.35, "cs_a": 0.2, "lam_h": 1.5, "lam_a": 1.0}
            if forecast
            else None,
            "ou": {"p_over": 0.52},
        },
    }


def row(team: str, score: float, *, pos: str = "FWD", started: bool = True) -> dict[str, Any]:
    return {"pos": pos, "team": team, "score": score, "level": 35.0, "proj": 50.0, "played": True, "started": started}


def test_each_start_carries_his_own_record_from_the_starts_before_it_and_his_sides_numbers() -> None:
    games = [
        game(
            1, {"striker": row("home-fc", 80.0)}, forecast=False
        ),  # no forecast: not a row, but it is part of his record
        game(
            8,
            {
                "striker": row("home-fc", 30.0),
                "sub": row("home-fc", 70.0, started=False),
                "keeper": row("home-fc", 70.0, pos="GK"),
            },
        ),
        game(15, {"striker": row("away-fc", 50.0)}),
    ]
    starts = outfield.starts_from_games(games)
    assert [s.player for s in starts] == ["striker", "striker"]
    first, second = starts
    assert first.own_dec == pytest.approx(outfield.own_record([80.0])[0]) and second.own_dec == pytest.approx(
        outfield.own_record([80.0, 30.0])[0]
    )
    assert first.home and not second.home
    assert (first.numbers.xgf, first.numbers.xga) == (1.5, 1.0) and (second.numbers.xgf, second.numbers.xga) == (
        1.0,
        1.5,
    )
    assert first.proj == 50.0


# --------------------------------------------------------------------------- the callback the refresh uses
def card(pos: str = "Forward") -> dict[str, Any]:
    return {"position": pos, "activeClub": {"name": "Real Betis", "shortName": "Betis"}}


def laliga_game(
    kickoff: str = "2026-10-10T19:00:00Z", venue: str = "H", competition: str = "laliga-es"
) -> dict[str, Any]:
    return {"competition": competition, "kickoff": kickoff, "venue": venue}


def lines() -> dict[str, outfield.OutfieldModel]:
    return outfield.fit_all(made_up(600) + made_up(600, pos="DEF", seed=2))


def test_an_outfield_players_games_are_scored_in_kickoff_order_with_his_own_record_from_his_past() -> None:
    of = scores.scores_for(
        None, lines(), lambda club, kickoff: numbers(xgf=2.2 if kickoff.startswith("2026-10-10") else 0.7)
    )
    games = [laliga_game("2026-10-14T19:00:00Z"), laliga_game("2026-10-10T19:00:00Z")]
    past = [{"played": True, "started": True, "score": 70.0}] * 10
    got = of(card(), games, None, past)
    assert (
        len(got.outcomes) == 2 and got.outcomes[0].start > got.outcomes[1].start
    )  # the earlier game, against the stronger attack, scores more
    assert (
        of(card(), games[:1], None, []).outcomes[0].start != of(card(), games[:1], None, past).outcomes[0].start
    )  # his record counts


def test_a_week_it_cannot_tell_is_left_to_the_old_number() -> None:
    of = scores.scores_for(None, lines(), lambda club, kickoff: numbers())
    assert of(card(), [laliga_game(competition="uefa-champions-league")], None, []).outcomes == ()
    assert of(card("Midfielder"), [laliga_game()], None, []).outcomes == ()  # no line fitted for midfielders
    blind = scores.scores_for(None, lines(), lambda club, kickoff: None)
    assert blind(card(), [laliga_game()], None, []).outcomes == ()
    assert of(card(), [], None, []).outcomes == ()


def test_a_goalkeeper_goes_to_the_keeper_model() -> None:
    fitted = keeper.fit(
        [
            keeper.Start(
                week=f"w{i // 8}",
                date=START + timedelta(days=i // 8 * 7, hours=i % 8),
                player="k",
                numbers=numbers(xga=0.6 + (i % 10) / 6),
                proj=None,
                score=70.0 if i % 4 == 0 else 40.0,
                decisive=i % 4 == 0,
                clean_sheet=i % 4 == 0,
            )
            for i in range(200)
        ]
    )
    assert fitted is not None
    of = scores.scores_for(fitted, {}, lambda club, kickoff: numbers())
    got = of(card("Goalkeeper"), [laliga_game()], None, []).outcomes
    assert len(got) == 1 and 30 < got[0].start < 80


# --------------------------------------------------------------------------- the evaluation
def test_the_table_says_whether_the_new_number_beat_todays_and_how_many_starts_it_is_over() -> None:
    walked = outfield.walk_forward(made_up(1500))
    today = {(w.player, w.date): 45.0 for w in walked}
    table = outfield_fit.evaluate(walked, today, {"FWD": 45.0})
    fwd = table["FWD"]
    assert fwd["new"]["games"] == len(walked) and fwd["new"]["rmse"] < fwd["today"]["rmse"]
    assert fwd["diff"]["squared"]["hi"] < 0
    assert fwd["new"]["pair"]["rate"] > fwd["today"]["pair"]["rate"]
    assert "too few to tell" not in outfield_fit.render(table)
    assert "too few to tell" in outfield_fit.render(outfield_fit.evaluate(walked[:40], today, None))


# --------------------------------------------------------------------------- the picture behind the number
def test_the_two_scores_of_a_game_add_up_to_the_number_and_the_range_holds_it() -> None:
    model = outfield.fit(made_up(3000), "FWD")
    assert model is not None and model.chance and model.gap > 0
    got = model.outcome(numbers(xgf=1.8, xga=0.9), True, 0.12, 45.0)
    assert got.start == pytest.approx(model.predict(numbers(xgf=1.8, xga=0.9), True, 0.12, 45.0))
    assert got.p_decisive * got.if_decisive + (1 - got.p_decisive) * got.if_plain == pytest.approx(got.start, abs=0.5)
    assert got.if_decisive > got.start > got.if_plain
    assert got.low < got.start < got.high


def test_a_stronger_attack_raises_the_chance_of_a_decisive_action_and_is_named_among_the_reasons() -> None:
    model = outfield.fit(made_up(3000), "FWD")
    assert model is not None
    weak = model.outcome(numbers(xgf=0.7, xga=1.9), True, 0.12, 45.0)
    strong = model.outcome(numbers(xgf=2.4, xga=0.5), True, 0.12, 45.0)
    assert strong.p_decisive > weak.p_decisive
    reasons = dict(strong.why)
    assert reasons["Attack"] > 3 and dict(weak.why)["Attack"] < -3


def test_a_substitute_game_is_centred_on_the_number_it_is_given() -> None:
    games = [
        {
            "players": {
                f"p{i}": {
                    "pos": "MID",
                    "played": True,
                    "started": False,
                    "score": 70.0 if i % 5 == 0 else 38.0,
                    "level": 60.0 if i % 5 == 0 else 35.0,
                }
                for i in range(100)
            }
        }
    ]
    shapes = outfield.subs_from_games(games)
    assert set(shapes) == {"MID"} and shapes["MID"].p == pytest.approx(0.2) and shapes["MID"].gap == pytest.approx(32.0)
    got = outfield.around(41.0, shapes["MID"])
    assert got.p_decisive * got.if_decisive + (1 - got.p_decisive) * got.if_plain == pytest.approx(41.0, abs=0.01)
    assert got.low < 41.0 < got.high


def test_the_pictures_are_written_and_read_back(tmp_path: Any) -> None:
    models = outfield.fit_all(made_up(600))
    outfield.save(tmp_path / "o.json", models)
    again = outfield.load(tmp_path / "o.json")["FWD"]
    assert again.chance == models["FWD"].chance and again.means == models["FWD"].means and again.sd == models["FWD"].sd
    shape = outfield.SubShape(0.2, 30.0, 10.0, 8.0, 99)
    outfield.save_subs(tmp_path / "s.json", {"MID": shape})
    assert outfield.load_subs(tmp_path / "s.json") == {"MID": shape}
    assert outfield.load_subs(tmp_path / "none.json") == {}
