"""The bookmaker tint on the next gameweek: the maths, the rules for using a price, and the wiring."""

from datetime import UTC, datetime, timedelta

import numpy as np
import pandas as pd
import pytest

from app.modeling.dixon_coles import DixonColesConfig, fit_dixon_coles
from app.services.market_blend import MarketBlend, load_market_blend, log_pool, save_market_blend
from app.services.rating_predictions import MarketMix, predict_both_sides
from tests.conftest import simulate_league

NOW = datetime(2026, 9, 16, 12, 0, tzinfo=UTC)
FRESH = NOW - timedelta(hours=3)


def test_log_pool_ends():
    model, market = np.array([[0.6, 0.25, 0.15]]), np.array([[0.3, 0.3, 0.4]])
    assert log_pool(model, market, 0.0)[0] == pytest.approx(model[0])
    assert log_pool(model, market, 1.0)[0] == pytest.approx(market[0])
    half = log_pool(model, market, 0.5)[0]
    assert half.sum() == pytest.approx(1.0)
    assert model[0, 0] > half[0] > market[0, 0]  # between the two, nearer neither end


def test_a_price_is_used_only_when_it_is_close_fresh_and_broad():
    blend = MarketBlend(weight=0.35, horizon_days=7, max_age_hours=48, min_bookmakers=3)
    soon, later = NOW + timedelta(days=3), NOW + timedelta(days=20)
    assert blend.applies(soon, NOW, FRESH, bookmakers=5)
    assert not blend.applies(later, NOW, FRESH, bookmakers=5)  # too far out to be priced meaningfully
    assert not blend.applies(soon, NOW, NOW - timedelta(days=4), bookmakers=5)  # stale price
    assert not blend.applies(soon, NOW, FRESH, bookmakers=2)  # too few bookmakers
    assert not MarketBlend().applies(soon, NOW, FRESH, bookmakers=9)  # blending switched off


def test_blend_moves_the_result_and_leaves_the_goals_alone():
    league = simulate_league(seasons=(2020, 2021), repeats=3)
    model = fit_dixon_coles(league, pd.Timestamp("2022-06-01"), config=DixonColesConfig())
    plain_home, plain_away = predict_both_sides(model, "Strong", "Weak")
    # The bookmakers see something the model doesn't: the favourite is in trouble.
    mix = MarketMix(fair=(0.20, 0.25, 0.55), blend=MarketBlend(weight=0.35))
    home, away = predict_both_sides(model, "Strong", "Weak", None, mix)

    assert home.p_win < plain_home.p_win and home.p_loss > plain_home.p_loss
    assert home.p_win + home.p_draw + home.p_loss == pytest.approx(1.0)
    assert (home.p_win, home.p_draw, home.p_loss) == pytest.approx((away.p_loss, away.p_draw, away.p_win))
    assert home.difficulty_score > plain_home.difficulty_score  # a harder game than the model thought
    assert home.expected_points == pytest.approx(3 * home.p_win + home.p_draw)
    assert (home.xg_for, home.xg_against) == (plain_home.xg_for, plain_home.xg_against)  # goals stay the model's
    assert home.p_clean_sheet == plain_home.p_clean_sheet
    assert home.explanation["market_blend"] == 0.35
    assert "market_blend" not in plain_home.explanation


def test_round_trip_through_the_artifact(tmp_path):
    path = tmp_path / "market_blend.json"
    assert load_market_blend(path).is_off  # missing file: no blending
    blend = MarketBlend(weight=0.35)
    save_market_blend(path, blend)
    assert load_market_blend(path) == blend


def test_market_mixes_picks_only_the_fixtures_a_price_applies_to():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    import app.models  # noqa: F401  (register tables)
    from app.db import Base
    from app.jobs.predict import market_mixes
    from app.models import Competition, Fixture, MarketOdds, Team

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    laliga = Competition(source_key="PD", name="LaLiga")
    db.add(laliga)
    home = Team(code="FCB", canonical_name="Barcelona", short_name="Barcelona")
    away = Team(code="RMA", canonical_name="Real Madrid", short_name="Real Madrid")
    db.add_all([home, away])
    db.flush()
    fixtures = [
        Fixture(
            source_fixture_id=str(i),
            competition_id=laliga.id,
            season="2026/27",
            matchday=i,
            kickoff_utc=NOW + timedelta(days=days),
            status="TIMED",
            home_team_id=home.id,
            away_team_id=away.id,
        )
        for i, days in enumerate([3, 20], start=1)
    ]
    db.add_all(fixtures)
    db.flush()
    for fixture in fixtures:  # both priced; only the near one qualifies
        db.add(
            MarketOdds(
                fixture_id=fixture.id,
                fetched_at=FRESH,
                source="the-odds-api",
                bookmakers=6,
                p_home=0.5,
                p_draw=0.27,
                p_away=0.23,
                p_over_2_5=0.55,
                home_goals=1.6,
                away_goals=1.1,
            )
        )
    db.commit()

    mixes = market_mixes(db, fixtures, MarketBlend(weight=0.35), NOW)
    assert list(mixes) == [fixtures[0].id]
    assert mixes[fixtures[0].id].fair == (0.5, 0.27, 0.23)
    assert market_mixes(db, fixtures, MarketBlend(), NOW) == {}  # switched off: no query, no blending
    db.close()
