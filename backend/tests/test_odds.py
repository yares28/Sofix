import asyncio
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy.orm import sessionmaker

from app.jobs import sync_odds
from app.models import Fixture, MarketOdds
from app.services.fixture_grid import build_fixture_grid
from app.services.market_odds import (
    MarketLine,
    consensus,
    fair_probabilities,
    fit_goal_rates,
    match_probabilities,
    team_market,
)
from app.services.team_registry import by_odds_name, normalize_name
from app.sources.the_odds_api import parse_event
from tests import test_pipeline

# The pipeline tests' database fixtures (a seeded season with fixtures, predictions and weather).
db = test_pipeline.db
seeded = test_pipeline.seeded

NOW = datetime(2026, 9, 14, 12, tzinfo=UTC)
KEY = "k" * 32


def event(
    home="Real Madrid", away="Sevilla FC", commence="2026-09-20T19:00:00Z", h2h=(1.62, 4.1, 5.5), totals=(1.9, 1.95)
):
    return {
        "home_team": home,
        "away_team": away,
        "commence_time": commence,
        "bookmakers": [
            {
                "key": "book",
                "markets": [
                    {
                        "key": "h2h",
                        "outcomes": [
                            {"name": home, "price": h2h[0]},
                            {"name": "Draw", "price": h2h[1]},
                            {"name": away, "price": h2h[2]},
                        ],
                    },
                    {
                        "key": "totals",
                        "outcomes": [
                            {"name": "Over", "price": totals[0], "point": 2.5},
                            {"name": "Under", "price": totals[1], "point": 2.5},
                            {"name": "Over", "price": 1.3, "point": 1.5},
                        ],
                    },
                ],
            }
        ],
    }


def transport(payload, status=200, calls=None):
    def handler(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(request)
        return httpx.Response(status, json=payload, headers={"x-requests-remaining": "480"})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def factory(session):
    return sessionmaker(bind=session.get_bind())


# ---------------------------------------------------------------- maths


def test_fair_probabilities_remove_the_margin():
    fair = fair_probabilities([1.9, 3.5, 4.2])
    assert sum(fair) == pytest.approx(1.0)
    assert fair[0] == pytest.approx((1 / 1.9) / (1 / 1.9 + 1 / 3.5 + 1 / 4.2))
    with pytest.raises(ValueError):
        fair_probabilities([1.0, 2.0])


def test_consensus_takes_the_median_and_skips_bad_rows():
    line = consensus([(2.0, 3.4, 3.8), (2.1, 3.3, 3.6), (1.0, 3.0, 3.0)], [(1.8, 2.0)])
    assert line is not None and line.bookmakers == 2
    assert line.home + line.draw + line.away == pytest.approx(1.0)
    assert line.over_2_5 == pytest.approx((1 / 1.8) / (1 / 1.8 + 1 / 2.0))
    assert consensus([], []) is None


def test_goal_rates_reproduce_the_prices_and_give_team_markets():
    home_win, draw, away_win, over = match_probabilities(1.8, 0.9)
    line = MarketLine(home=home_win, draw=draw, away=away_win, over_2_5=over, bookmakers=5)
    home_rate, away_rate = fit_goal_rates(line)
    assert home_rate == pytest.approx(1.8, abs=0.02) and away_rate == pytest.approx(0.9, abs=0.02)

    away_side = team_market(line, away_rate, home_rate, "A")
    assert away_side.win == pytest.approx(away_win) and away_side.loss == pytest.approx(home_win)
    assert away_side.clean_sheet == pytest.approx(2.718281828**-1.8, abs=0.01)
    assert away_side.scores == pytest.approx(1 - 2.718281828**-0.9, abs=0.01)
    assert 0 < away_side.scores_2plus < away_side.scores and 0 < away_side.concedes_2plus < 1


def test_heavy_favourites_fit_too():
    # Elche v Real Madrid, 20 bookmakers (Sept 2026): 7% / 13% / 80%, over 2.5 at 72%.
    line = MarketLine(home=0.0734, draw=0.1273, away=0.7994, over_2_5=0.7189, bookmakers=20)
    home_rate, away_rate = fit_goal_rates(line)
    assert home_rate == pytest.approx(0.81, abs=0.05) and away_rate == pytest.approx(2.91, abs=0.05)
    # Sevilla v Barcelona, 18 bookmakers: stalls from a level-match start alone.
    sevilla = MarketLine(
        home=0.08339385219907025, draw=0.147050681422878, away=0.7695554663780517, over_2_5=0.7, bookmakers=18
    )
    home_rate, away_rate = fit_goal_rates(sevilla)
    assert home_rate < 1.0 < 2.5 < away_rate


def test_odds_names_match_accent_and_suffix_insensitively():
    assert normalize_name("Atlético de Madrid") == normalize_name("Atletico Madrid")
    assert by_odds_name("Athletic Bilbao").code == "ATH"
    assert by_odds_name("CA Osasuna").code == "OSA"
    assert by_odds_name("Celta Vigo").code == "CEL"
    assert by_odds_name("Real Racing Club de Santander").code == "SAN"
    assert by_odds_name("Nowhere United") is None


def test_parse_event_reads_h2h_and_the_2_5_line_only():
    parsed = parse_event(event())
    assert parsed.h2h == [(1.62, 4.1, 5.5)] and parsed.totals == [(1.9, 1.95)]
    assert parsed.commence_time == datetime(2026, 9, 20, 19, tzinfo=UTC)
    assert parse_event({"home_team": "A"}) is None


# ---------------------------------------------------------------- job


def test_without_a_key_the_step_is_skipped(seeded):
    result = asyncio.run(sync_odds.main(factory(seeded), api_key=""))
    assert result == {"skipped": "no ODDS_API_KEY"}


def test_sync_writes_matched_fixtures_and_the_grid_shows_both_sides(seeded):
    calls = []
    payload = [
        event(),
        event(home="Real Betis", away="Barcelona", commence="2026-09-20T15:00:00Z"),
        event(home="Nowhere", away="Sevilla"),
    ]
    result = asyncio.run(sync_odds.main(factory(seeded), transport(payload, calls=calls), NOW, KEY))
    assert result["rows"] == 2 and result["unmatched"] == ["Nowhere v Sevilla"] and result["credits_remaining"] == 480
    assert calls[0].url.params["markets"] == "h2h,totals" and calls[0].url.params["regions"] == "eu"

    grid = build_fixture_grid(seeded)
    teams = {team.code: team for team in grid.teams}
    madrid, sevilla = teams["RMA"].cells[1][0].market, teams["SEV"].cells[1][0].market
    assert madrid.win == pytest.approx(sevilla.loss) and madrid.draw == pytest.approx(sevilla.draw)
    assert madrid.win > 0.5 and madrid.clean_sheet > sevilla.clean_sheet
    assert madrid.concedes_2plus < sevilla.concedes_2plus and madrid.bookmakers == 1
    assert madrid.expected_points == pytest.approx(3 * madrid.win + madrid.draw, abs=1e-3)
    assert grid.lens_scales.odds.higher_is_easier and grid.lens_scales.odds.cuts[0] >= grid.lens_scales.odds.cuts[-1]
    assert teams["FCB"].cells[0][0].market is None  # finished games carry no odds


def test_sync_is_throttled_and_replaces_rows(seeded):
    asyncio.run(sync_odds.main(factory(seeded), transport([event()]), NOW, KEY))
    skipped = asyncio.run(
        sync_odds.main(factory(seeded), transport([event(h2h=(2.6, 3.4, 2.9))]), NOW + timedelta(hours=2), KEY)
    )
    assert skipped["skipped"].startswith("fetched 2.0 h ago")

    later = NOW + timedelta(hours=7)
    asyncio.run(sync_odds.main(factory(seeded), transport([event(h2h=(2.6, 3.4, 2.9))]), later, KEY))
    rows = seeded.query(MarketOdds).all()
    assert len(rows) == 1 and rows[0].p_home == pytest.approx(fair_probabilities([2.6, 3.4, 2.9])[0])


def test_started_fixtures_lose_their_odds(seeded):
    asyncio.run(sync_odds.main(factory(seeded), transport([event()]), NOW, KEY))
    kickoff = seeded.query(Fixture).filter_by(source_fixture_id="3").one().kickoff_utc
    result = asyncio.run(
        sync_odds.main(
            factory(seeded), transport([]), kickoff.replace(tzinfo=UTC) + timedelta(hours=1), KEY, force=True
        )
    )
    assert result["removed"] == 1 and seeded.query(MarketOdds).count() == 0


def test_events_that_leave_the_feed_lose_their_odds(seeded):
    payload = [event(), event(home="Real Betis", away="Barcelona", commence="2026-09-20T15:00:00Z")]
    asyncio.run(sync_odds.main(factory(seeded), transport(payload), NOW, KEY))
    result = asyncio.run(sync_odds.main(factory(seeded), transport([event()]), NOW + timedelta(hours=7), KEY))
    assert result["rows"] == 1 and result["removed"] == 1 and seeded.query(MarketOdds).count() == 1


def test_a_market_that_fits_no_match_is_skipped_not_fatal(seeded):
    # Prices no Poisson match can produce (a 90% draw) next to a normal one.
    payload = [
        event(h2h=(40.0, 1.05, 40.0), totals=(1.01, 30.0)),
        event(home="Real Betis", away="Barcelona", commence="2026-09-20T15:00:00Z"),
    ]
    result = asyncio.run(sync_odds.main(factory(seeded), transport(payload), NOW, KEY))
    assert result["rows"] == 1 and result["skipped"] == 1


def test_transport_errors_never_include_the_key(seeded, caplog):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"boom {request.url}")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with pytest.raises(RuntimeError) as caught:
        asyncio.run(sync_odds.main(factory(seeded), client, NOW, KEY))
    assert KEY not in str(caught.value) and KEY not in caplog.text


@pytest.mark.parametrize("status", [401, 429, 500])
def test_api_errors_never_include_the_key(seeded, status):
    with pytest.raises(Exception) as caught:
        asyncio.run(sync_odds.main(factory(seeded), transport({"message": "no"}, status=status), NOW, KEY))
    assert KEY not in str(caught.value)
