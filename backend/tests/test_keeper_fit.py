"""The keeper fit's evaluation: the table that says whether the new number beats today's (roadmap 10.3)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.jobs import keeper_fit
from app.sorare.keeper import Outcome, Walked

START = datetime(2025, 9, 1, 19, tzinfo=UTC)


def walked(
    i: int, score: float, said: float, *, week: int | None = None, proj: float | None = 50.0, decisive: bool = False
) -> Walked:
    week = i // 4 if week is None else week
    return Walked(
        week=f"w{week:02d}",
        date=START + timedelta(days=week * 7, hours=i % 4),
        player=f"keeper-{i % 4}",
        score=score,
        decisive=decisive,
        clean_sheet=decisive,
        proj=proj,
        said=Outcome(
            p_clean_sheet=0.3,
            p_decisive=0.3,
            if_decisive=75.0,
            if_plain=40.0,
            start=said,
            low=said - 20,
            high=said + 20,
        ),
    )


def made_up(good: bool) -> list[Walked]:
    """Forty weeks of four keepers. Where the model says higher the real score is higher (`good`), or it says the same for all."""
    out = []
    for i in range(160):
        rank = i % 4
        score = 30.0 + 10.0 * rank + (3.0 if i % 8 < 4 else -3.0)
        out.append(walked(i, score, 30.0 + 10.0 * rank if good else 45.0))
    return out


def test_a_model_that_orders_keepers_rightly_beats_one_that_says_the_same_for_all() -> None:
    today = {(w.player, w.date): 45.0 for w in made_up(True)}
    table = keeper_fit.evaluate(made_up(True), today)
    assert table["new"]["pair"]["rate"] > 0.9
    assert table["today"]["pair"]["rate"] == pytest.approx(0.5)
    assert table["new"]["rmse"] < table["today"]["rmse"]
    assert table["diff"]["squared"]["diff"] < 0 and table["diff"]["squared"]["hi"] < 0


def test_every_figure_says_how_many_games_it_is_over() -> None:
    today = {(w.player, w.date): 45.0 for w in made_up(True)}
    table = keeper_fit.evaluate(made_up(True), today)
    assert table["games"] == 160 and table["weeks"] == 40
    assert table["new"]["games"] == 160 and set(table["new"]["within"]) == {"3", "7", "10", "15"}


def test_the_range_is_counted_by_how_often_the_score_landed_inside_it() -> None:
    rows = made_up(True)
    table = keeper_fit.evaluate(rows, {(w.player, w.date): 45.0 for w in rows})
    assert table["range"] == pytest.approx(sum(w.said.low <= w.score <= w.said.high for w in rows) / len(rows))


def test_the_decisive_chance_is_checked_in_bands() -> None:
    rows = [walked(i, 70.0 if i % 3 == 0 else 40.0, 50.0, decisive=i % 3 == 0) for i in range(120)]
    table = keeper_fit.evaluate(rows, {(w.player, w.date): 50.0 for w in rows})
    bands = table["decisive"]
    assert sum(band["games"] for band in bands) == 120
    assert bands[0]["said"] == pytest.approx(0.3) and bands[0]["happened"] == pytest.approx(1 / 3)


def test_the_sorare_projection_is_compared_on_the_games_that_have_one() -> None:
    rows = [walked(i, 50.0, 50.0, proj=None if i < 40 else 50.0) for i in range(120)]
    table = keeper_fit.evaluate(rows, {(w.player, w.date): 50.0 for w in rows})
    assert table["sorare"]["games"] == 80


def test_a_figure_over_fewer_than_100_games_says_so_in_the_table_text() -> None:
    rows = made_up(True)[:60]
    table = keeper_fit.evaluate(rows, {(w.player, w.date): 45.0 for w in rows})
    assert "too few to tell" in keeper_fit.render(table)
