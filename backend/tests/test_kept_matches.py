from datetime import UTC, datetime, timedelta

import pandas as pd
import pytest

from app.backtest.data import normalize_season
from app.models import MatchForecast, MatchOdds
from app.services import kept_matches
from app.services.odds_record import build_record
from tests import test_pipeline

db = test_pipeline.db
seeded = test_pipeline.seeded
NOW = datetime(2026, 9, 14, 12, tzinfo=UTC)


def history():
    return normalize_season(
        pd.DataFrame(
            [
                dict(
                    Date="16/08/2026",
                    HomeTeam="Barcelona",
                    AwayTeam="Real Madrid",
                    FTHG=2,
                    FTAG=1,
                    PSCH=2.0,
                    PSCD=3.0,
                    PSCA=4.0,
                    PSH=2.1,
                    PSD=3.1,
                    PSA=4.1,
                )
            ]
        ),
        2026,
    )


def test_csv_prices_keep_provenance_and_survive_empty_cache(seeded):
    frame = history()
    assert frame.iloc[0].odds_which == "PSCH"
    kept_matches.keep_history(seeded, frame, NOW)
    row = seeded.query(MatchOdds).one()
    assert (row.home, row.away, row.which, row.odds_pre_h) == ("FCB", "RMA", "PSCH", 2.1)
    assert row.fixture_id is not None
    kept_matches.keep_history(seeded, frame, NOW + timedelta(days=1))
    assert seeded.query(MatchOdds).count() == 1
    stored = kept_matches.fill_history(seeded, frame.iloc[:0])
    pd.testing.assert_frame_equal(
        stored[["home", "away", "hg", "ag", "odds_h"]].reset_index(drop=True),
        frame[["home", "away", "hg", "ag", "odds_h"]].reset_index(drop=True),
        check_dtype=False,
    )
    original = build_record(pd.concat([frame] * 5), 2026)
    # Filling gaps keeps the normal CSV record byte-for-byte, without counting a stored duplicate.
    assert build_record(pd.concat([frame] * 5), 2026, db=seeded).league == original.league
    assert build_record(frame.iloc[:0], 2026, db=seeded).through == "2026-08-16"


def test_stored_api_prices_fill_missing_csv_prices_without_double_counting(seeded):
    frame = history()
    seeded.add(
        MatchOdds(
            season="2026/27",
            date=NOW.date().replace(month=8, day=15),
            home="FCB",
            away="RMA",
            source="the-odds-api",
            hg=2,
            ag=1,
            odds_h=3.0,
            odds_d=3.0,
            odds_a=3.0,
            which="the-odds-api",
            read_at=NOW,
        )
    )
    seeded.commit()
    assert kept_matches.fill_history(seeded, frame).iloc[0].odds_h == 2.0
    missing = frame.copy()
    missing[["odds_h", "odds_d", "odds_a"]] = float("nan")
    filled = kept_matches.fill_history(seeded, missing)
    assert len(filled) == 1 and filled.iloc[0].odds_h == 3.0


def test_forecast_updates_before_kickoff_and_never_after(seeded):
    fx = seeded.query(test_pipeline.Fixture).filter_by(source_fixture_id="3").one()
    p = dict(p_home=0.6, p_draw=0.2, p_away=0.2, xg_home=1.8, xg_away=0.7)
    kept_matches.save_forecast(seeded, fx, NOW, "one", **p)
    kept_matches.save_forecast(seeded, fx, NOW - timedelta(hours=1), "old", **p)
    assert seeded.get(MatchForecast, fx.id).model_version == "one"
    kept_matches.save_forecast(seeded, fx, NOW + timedelta(hours=1), "two", **p)
    seeded.commit()
    kickoff = fx.kickoff_utc.replace(tzinfo=UTC)
    kept_matches.save_forecast(seeded, fx, kickoff, "late", **p)
    seeded.commit()
    assert seeded.get(MatchForecast, fx.id).model_version == "two"
    # A first forecast after kick-off must not be invented either.
    seeded.delete(seeded.get(MatchForecast, fx.id))
    seeded.commit()
    kept_matches.save_forecast(seeded, fx, kickoff + timedelta(seconds=1), "late", **p)
    assert seeded.get(MatchForecast, fx.id) is None


def test_match_audit_checks_only_paired_pre_kickoff_forecasts_and_hides_small_samples(seeded):
    fx = seeded.query(test_pipeline.Fixture).filter_by(source_fixture_id="1").one()
    kept_matches.keep_history(seeded, history(), NOW)
    seeded.add(
        MatchForecast(
            fixture_id=fx.id,
            model_version="one",
            p_home=0.6,
            p_draw=0.2,
            p_away=0.2,
            xg_home=1.8,
            xg_away=0.7,
            frozen_at=fx.kickoff_utc - timedelta(hours=1),
        )
    )
    seeded.commit()
    small = kept_matches.match_audit(seeded, NOW)
    assert small["checked"] == 1 and small["sofix"] is None and small["bookmakers"] is None
    enough = kept_matches.match_audit(seeded, NOW, floor=1)
    assert enough["sofix"] == pytest.approx(0.1)
    assert enough["bookmakers"] > enough["sofix"]
    fx.home_goals = None
    seeded.commit()
    assert kept_matches.match_audit(seeded, NOW)["checked"] == 0


def test_audit_rejects_a_late_api_price(seeded):
    fx = seeded.query(test_pipeline.Fixture).filter_by(source_fixture_id="1").one()
    seeded.add(
        MatchForecast(
            fixture_id=fx.id,
            model_version="one",
            p_home=0.6,
            p_draw=0.2,
            p_away=0.2,
            xg_home=1.8,
            xg_away=0.7,
            frozen_at=fx.kickoff_utc - timedelta(hours=1),
        )
    )
    seeded.add(
        MatchOdds(
            season=fx.season,
            date=fx.kickoff_utc.date(),
            home="FCB",
            away="RMA",
            source="the-odds-api",
            fixture_id=fx.id,
            hg=2,
            ag=1,
            odds_h=2.0,
            odds_d=3.0,
            odds_a=4.0,
            which="the-odds-api",
            read_at=fx.kickoff_utc,
        )
    )
    seeded.commit()
    assert kept_matches.match_audit(seeded, NOW)["checked"] == 0


def test_prediction_job_keeps_running_without_csvs(seeded, tmp_path):
    import httpx

    from app.jobs.predict import predict_upcoming

    kept_matches.keep_history(seeded, history(), NOW)

    def gone(*args, **kwargs):
        raise httpx.ConnectError("source gone")

    result = predict_upcoming(seeded, NOW, load=gone, cache_dir=str(tmp_path))
    assert result["history_source"] == "stored matches"
    assert result["predictions"] == 6 and result["odds_through"] == "2026-08-16"


def test_redated_fixture_counts_once_with_its_latest_saved_api_price(seeded):
    fx = seeded.query(test_pipeline.Fixture).filter_by(source_fixture_id="1").one()
    for offset, price in [(0, 2.0), (3, 3.0)]:
        seeded.add(
            MatchOdds(
                season=fx.season,
                date=fx.kickoff_utc.date() - timedelta(days=offset),
                home="FCB",
                away="RMA",
                source="the-odds-api",
                fixture_id=fx.id,
                hg=2,
                ag=1,
                odds_h=price,
                odds_d=3.0,
                odds_a=4.0,
                which="the-odds-api",
                read_at=fx.kickoff_utc - timedelta(hours=offset + 1),
            )
        )
    seeded.commit()
    recovered = kept_matches.fill_history(seeded, history().iloc[:0])
    assert len(recovered) == 1 and recovered.iloc[0].odds_h == 2.0
