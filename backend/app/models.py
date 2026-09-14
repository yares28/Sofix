from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, JSON, UniqueConstraint
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
    __table_args__ = (UniqueConstraint("entity_type","source","source_id",name="uq_source_entity_map_source_id"),)

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
    __table_args__ = (UniqueConstraint("source_fixture_id",name="uq_fixtures_source_fixture_id"),)

class WeatherSnapshot(Base):
    __tablename__ = "weather_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("fixtures.id"))
    snapshot_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    forecast_lead_hours: Mapped[float | None] = mapped_column(Float)
    temperature_c: Mapped[float | None] = mapped_column(Float)
    apparent_temperature_c: Mapped[float | None] = mapped_column(Float)
    humidity_pct: Mapped[float | None] = mapped_column(Float)
    precipitation_mm: Mapped[float | None] = mapped_column(Float)
    wind_speed_kmh: Mapped[float | None] = mapped_column(Float)
    # One live forecast per fixture; each weather sync replaces it.
    __table_args__ = (UniqueConstraint("fixture_id",name="uq_weather_snapshots_fixture_id"),)

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
    __table_args__ = (UniqueConstraint("fixture_id","perspective_team_id","model_version"),)
