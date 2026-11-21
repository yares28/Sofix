"""Strategies replayed on what was known before each game, scored on what happened (plans/arcade-trust.md step 11)."""

from datetime import UTC, datetime, timedelta

from app.sorare import arcade_strategies as s

T0 = datetime(2026, 11, 1, 12, tzinfo=UTC)
POS = ["Goalkeeper", "Defender", "Midfielder", "Forward", "Forward"]


def window(
    i: int, *, said: float, real: float, started: bool = True, hours: int = 3, n: int = 5, prefix: str = ""
) -> s.Window:
    """A window of `n` cards, each said (before kick-off) to score `said` if he starts, scoring `real`."""
    at = T0 + timedelta(hours=hours * i)
    cards = [
        s.Seen(
            card=f"{prefix}c{k}",
            player=f"{prefix}p{k}",
            positions=[POS[k % 5]],
            bonus=1.0,
            start=0.9,
            start_known=True,
            score=said,
            real=real if started else 0.0,
            started=started,
        )
        for k in range(n)
    ]
    return s.Window(at=at, last=at, cards=cards)


TARGETS = [200.0, 300.0]


def test_every_window_plays_and_a_miss_costs_a_life_then_the_board_starts_again():
    wins = [
        window(i, said=60, real=30) for i in range(5)
    ]  # each five scores 150 + captain 15 = 165 < 200: a miss every time
    out = s.play(wins, TARGETS, s.RULES["every"], captain=0.5)
    assert out["clears"] == {} and out["lives"] == 5  # four lives on step 1, then back to step 1 and one more miss


def test_steady_waits_for_a_60_percent_chance():
    wins = [window(0, said=30, real=90), window(1, said=60, real=60)]
    out = s.play(wins, TARGETS, s.RULES["steady"], captain=0.5)
    assert out["played"] == 1  # the first window looked hopeless before kick-off, so it was not played
    assert out["clears"] == {1: 1}


def test_insurance_clears_when_one_of_its_lineups_clears_and_the_cancelled_ones_cost_nothing():
    good = window(0, said=70, real=70)
    poor = window(0, said=60, real=10, prefix="x")
    both = s.Window(at=good.at, last=good.last, cards=good.cards + poor.cards)
    out = s.play([both], [100.0], s.RULES["insure"], captain=0.5, start_step=1, insure_from=1)
    assert out["clears"] == {1: 1} and out["lives"] == 0


def test_waiting_for_the_eleven_leaves_out_who_did_not_start():
    benched = window(0, said=80, real=0, started=False)
    playing = window(1, said=60, real=60)
    out = s.play([benched, playing], TARGETS, s.RULES["eleven"], captain=0.5)
    assert out["played"] == 1 and out["clears"] == {1: 1}


def test_a_band_says_too_few_to_tell_under_100_windows():
    wins = [window(i, said=60, real=60, hours=24) for i in range(10)]
    result = s.replay_all(wins, TARGETS, captain=0.5, runs=50)
    every = next(r for r in result if r["key"] == "every")
    assert every["enough"] is False
    assert every["tops"] >= 1 and every["band"]["tops"][0] <= every["tops"] <= every["band"]["tops"][1]
