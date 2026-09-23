from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Competition(Base):
    __tablename__ = "competitions"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_key: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(128))
    country: Mapped[str] = mapped_column(String(64), default="Spain")
    tier: Mapped[int] = mapped_column(Integer, default=1)


class Stadium(Base):
    __tablename__ = "stadiums"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)


class Team(Base):
    __tablename__ = "teams"
    id: Mapped[int] = mapped_column(primary_key=True)
    canonical_name: Mapped[str] = mapped_column(String(160), unique=True)
    short_name: Mapped[str | None] = mapped_column(String(80))
    code: Mapped[str | None] = mapped_column(String(3), unique=True)
    color: Mapped[str | None] = mapped_column(String(9))
    # football-data.org crest, only ever a https://crests.football-data.org/ URL (see services/crests.py)
    crest_url: Mapped[str | None] = mapped_column(String(255))
    stadium_id: Mapped[int | None] = mapped_column(ForeignKey("stadiums.id"))


class SourceEntityMap(Base):
    __tablename__ = "source_entity_map"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(32))
    internal_id: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(64))
    source_id: Mapped[str | None] = mapped_column(String(128))
    source_name: Mapped[str] = mapped_column(String(180))
    # Lookups go by source id; names can change (e.g. a club renamed by the provider).
    __table_args__ = (UniqueConstraint("entity_type", "source", "source_id", name="uq_source_entity_map_source_id"),)


class Fixture(Base):
    __tablename__ = "fixtures"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_fixture_id: Mapped[str | None] = mapped_column(String(128))
    competition_id: Mapped[int] = mapped_column(ForeignKey("competitions.id"))
    season: Mapped[str] = mapped_column(String(16), index=True)
    matchday: Mapped[int | None] = mapped_column(Integer, index=True)
    kickoff_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    home_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    away_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    stadium_id: Mapped[int | None] = mapped_column(ForeignKey("stadiums.id"))
    status: Mapped[str] = mapped_column(String(32), default="SCHEDULED")
    home_goals: Mapped[int | None] = mapped_column(Integer)
    away_goals: Mapped[int | None] = mapped_column(Integer)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    schedule_version: Mapped[int] = mapped_column(Integer, default=1)
    __table_args__ = (UniqueConstraint("source_fixture_id", name="uq_fixtures_source_fixture_id"),)


class Prediction(Base):
    __tablename__ = "predictions"
    id: Mapped[int] = mapped_column(primary_key=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("fixtures.id"))  # covered by the unique key below
    perspective_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    prediction_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    model_version: Mapped[str] = mapped_column(String(64))
    p_win: Mapped[float] = mapped_column(Float)
    p_draw: Mapped[float] = mapped_column(Float)
    p_loss: Mapped[float] = mapped_column(Float)
    expected_points: Mapped[float] = mapped_column(Float)
    difficulty_score: Mapped[float] = mapped_column(Float)
    difficulty_label: Mapped[str] = mapped_column(String(32))
    p_clean_sheet: Mapped[float | None] = mapped_column(Float)
    xg_for: Mapped[float | None] = mapped_column(Float)
    xg_against: Mapped[float | None] = mapped_column(Float)
    explanation: Mapped[dict | None] = mapped_column(JSON)
    # One live prediction per team per fixture per model; each run replaces the previous one.
    __table_args__ = (UniqueConstraint("fixture_id", "perspective_team_id", "model_version"),)


class MarketOdds(Base):
    """Consensus bookmaker odds for one upcoming fixture, margin removed, plus the goal rates that
    reproduce them (clean sheet and goal markets are read off those). Each odds sync replaces the row."""

    __tablename__ = "market_odds"
    id: Mapped[int] = mapped_column(primary_key=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("fixtures.id"))  # covered by the unique key below
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source: Mapped[str] = mapped_column(String(32))
    bookmakers: Mapped[int] = mapped_column(Integer)
    p_home: Mapped[float] = mapped_column(Float)
    p_draw: Mapped[float] = mapped_column(Float)
    p_away: Mapped[float] = mapped_column(Float)
    p_over_2_5: Mapped[float | None] = mapped_column(Float)
    home_goals: Mapped[float] = mapped_column(Float)
    away_goals: Mapped[float] = mapped_column(Float)
    __table_args__ = (UniqueConstraint("fixture_id", name="uq_market_odds_fixture_id"),)


class ReadModel(Base):
    """A page's finished data, written by the jobs and read directly by the web app.

    The Next.js app on Vercel reads these rows from Neon instead of calling the FastAPI server, so production
    runs no Python server. Each key holds one JSON payload and is replaced in a single transaction.
    """

    __tablename__ = "read_models"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


RUNNING = "running"


class RefreshRun(Base):
    """One execution of the refresh pipeline: history, per-step results, and the concurrency lock."""

    __tablename__ = "refresh_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    trigger: Mapped[str] = mapped_column(String(16))  # cli | schedule | button
    status: Mapped[str] = mapped_column(String(16))  # running | succeeded | failed | abandoned
    step: Mapped[str | None] = mapped_column(String(32))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSON)
    # At most one running refresh. A partial unique index works through Neon's pooler,
    # where session-level advisory locks do not.
    __table_args__ = (
        Index(
            "uq_refresh_runs_one_running",
            "status",
            unique=True,
            postgresql_where=text("status = 'running'"),
            sqlite_where=text("status = 'running'"),
        ),
    )


class SorareForecast(Base):
    """What was known about one player for one Sorare gameweek, before it locked, and what he then scored.

    Sorare only serves a player's *next* fixture projection, so once a gameweek is played the numbers a plan was
    built on are gone for good. This table keeps them: while the gameweek is open each run overwrites the row with
    the latest numbers, and once it has locked the forecast columns are frozen and only `actual` is filled in.
    That makes a later model (S4) scoreable against what Sorare itself said at the time.
    """

    __tablename__ = "sorare_forecasts"
    id: Mapped[int] = mapped_column(primary_key=True)
    player: Mapped[str] = mapped_column(String(100))  # Sorare's player slug
    gameweek: Mapped[str] = mapped_column(String(100))  # the fixture slug, e.g. football-25-29-sep-2026
    games: Mapped[int] = mapped_column(Integer, default=0)  # his games inside the gameweek
    projection: Mapped[float | None] = mapped_column(Float)  # Sorare's projected score, "if he plays"
    plays_odds: Mapped[float | None] = mapped_column(Float)  # Sorare's starter + substitute chance, 0–1
    mu: Mapped[float] = mapped_column(Float)  # ours: the score if he plays
    p_play: Mapped[float] = mapped_column(Float)  # ours: the chance he plays at all
    source: Mapped[str] = mapped_column(String(16))  # sorare | form | no game
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    lock: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    actual: Mapped[float | None] = mapped_column(Float)  # what he scored, once the gameweek is over
    played: Mapped[bool | None] = mapped_column(Boolean)
    __table_args__ = (UniqueConstraint("player", "gameweek", name="uq_sorare_forecasts_player_gameweek"),)
