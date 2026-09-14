from datetime import datetime, date
from sqlalchemy import String, Integer, Float, DateTime, Date, Boolean, ForeignKey, JSON, UniqueConstraint
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
    city: Mapped[str | None] = mapped_column(String(100))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    altitude_m: Mapped[float | None] = mapped_column(Float)

class Team(Base):
    __tablename__ = "teams"
    id: Mapped[int] = mapped_column(primary_key=True)
    canonical_name: Mapped[str] = mapped_column(String(160), unique=True)
    short_name: Mapped[str | None] = mapped_column(String(80))
    code: Mapped[str | None] = mapped_column(String(3), unique=True)
    color: Mapped[str | None] = mapped_column(String(9))
    stadium_id: Mapped[int | None] = mapped_column(ForeignKey("stadiums.id"))
    promoted_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    promoted_from_tier: Mapped[int | None] = mapped_column(Integer)

class SourceEntityMap(Base):
    __tablename__ = "source_entity_map"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(32))
    internal_id: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(64))
    source_id: Mapped[str | None] = mapped_column(String(128))
    source_name: Mapped[str] = mapped_column(String(180))
    __table_args__ = (UniqueConstraint("entity_type","source","source_name"),)

class Player(Base):
    __tablename__ = "players"
    id: Mapped[int] = mapped_column(primary_key=True)
    canonical_name: Mapped[str] = mapped_column(String(180))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"))
    position_group: Mapped[str | None] = mapped_column(String(16))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    market_value_eur: Mapped[float | None] = mapped_column(Float)

class Fixture(Base):
    __tablename__ = "fixtures"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_fixture_id: Mapped[str | None] = mapped_column(String(128), index=True)
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
    referee_name: Mapped[str | None] = mapped_column(String(160))
    postponed_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    schedule_version: Mapped[int] = mapped_column(Integer, default=1)

class TeamMatchStats(Base):
    __tablename__ = "team_match_stats"
    id: Mapped[int] = mapped_column(primary_key=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("fixtures.id"), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    opponent_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    is_home: Mapped[bool] = mapped_column(Boolean)
    goals_for: Mapped[int | None] = mapped_column(Integer)
    goals_against: Mapped[int | None] = mapped_column(Integer)
    points_earned: Mapped[int | None] = mapped_column(Integer)
    shots: Mapped[float | None] = mapped_column(Float)
    shots_on_target: Mapped[float | None] = mapped_column(Float)
    corners: Mapped[float | None] = mapped_column(Float)
    fouls: Mapped[float | None] = mapped_column(Float)
    yellow_cards: Mapped[float | None] = mapped_column(Float)
    red_cards: Mapped[float | None] = mapped_column(Float)
    possession_pct: Mapped[float | None] = mapped_column(Float)
    xg_for: Mapped[float | None] = mapped_column(Float)
    xg_against: Mapped[float | None] = mapped_column(Float)
    npxg_for: Mapped[float | None] = mapped_column(Float)
    npxg_against: Mapped[float | None] = mapped_column(Float)
    xpts: Mapped[float | None] = mapped_column(Float)
    ppda: Mapped[float | None] = mapped_column(Float)
    pressures: Mapped[float | None] = mapped_column(Float)
    pre_match_elo: Mapped[float | None] = mapped_column(Float)
    post_match_elo: Mapped[float | None] = mapped_column(Float)
    rest_days: Mapped[float | None] = mapped_column(Float)
    travel_km: Mapped[float | None] = mapped_column(Float)
    __table_args__ = (UniqueConstraint("fixture_id","team_id"),)

class PlayerMatch(Base):
    __tablename__ = "player_match"
    id: Mapped[int] = mapped_column(primary_key=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("fixtures.id"), index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    started: Mapped[bool | None] = mapped_column(Boolean)
    minutes_played: Mapped[float | None] = mapped_column(Float)
    goals: Mapped[float | None] = mapped_column(Float)
    assists: Mapped[float | None] = mapped_column(Float)
    xg: Mapped[float | None] = mapped_column(Float)
    xa: Mapped[float | None] = mapped_column(Float)

class AvailabilitySnapshot(Base):
    __tablename__ = "availability_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("fixtures.id"), index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), index=True)
    snapshot_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(32))
    absence_reason: Mapped[str | None] = mapped_column(String(160))
    injury_type: Mapped[str | None] = mapped_column(String(160))
    expected_return_date: Mapped[date | None] = mapped_column(Date)
    p_available: Mapped[float | None] = mapped_column(Float)
    p_start_if_available: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(64))
    source_confidence: Mapped[float | None] = mapped_column(Float)

class OddsSnapshot(Base):
    __tablename__ = "odds_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("fixtures.id"), index=True)
    snapshot_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    bookmaker: Mapped[str] = mapped_column(String(80))
    home_decimal: Mapped[float | None] = mapped_column(Float)
    draw_decimal: Mapped[float | None] = mapped_column(Float)
    away_decimal: Mapped[float | None] = mapped_column(Float)
    home_prob: Mapped[float | None] = mapped_column(Float)
    draw_prob: Mapped[float | None] = mapped_column(Float)
    away_prob: Mapped[float | None] = mapped_column(Float)
    overround: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(64))

class WeatherSnapshot(Base):
    __tablename__ = "weather_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("fixtures.id"), index=True)
    snapshot_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    forecast_lead_hours: Mapped[float | None] = mapped_column(Float)
    temperature_c: Mapped[float | None] = mapped_column(Float)
    apparent_temperature_c: Mapped[float | None] = mapped_column(Float)
    humidity_pct: Mapped[float | None] = mapped_column(Float)
    precipitation_mm: Mapped[float | None] = mapped_column(Float)
    wind_speed_kmh: Mapped[float | None] = mapped_column(Float)

class ContextSnapshot(Base):
    __tablename__ = "context_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("fixtures.id"), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    prediction_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    rest_days: Mapped[float | None] = mapped_column(Float)
    matches_last_7d: Mapped[int | None] = mapped_column(Integer)
    matches_last_14d: Mapped[int | None] = mapped_column(Integer)
    matches_last_21d: Mapped[int | None] = mapped_column(Integer)
    travel_km: Mapped[float | None] = mapped_column(Float)
    travel_km_last_7d: Mapped[float | None] = mapped_column(Float)
    europe_midweek_flag: Mapped[bool | None] = mapped_column(Boolean)
    cup_midweek_flag: Mapped[bool | None] = mapped_column(Boolean)
    days_to_next_match: Mapped[float | None] = mapped_column(Float)
    derby_flag: Mapped[bool | None] = mapped_column(Boolean)
    title_race_flag: Mapped[bool | None] = mapped_column(Boolean)
    relegation_race_flag: Mapped[bool | None] = mapped_column(Boolean)
    manager_change_30d: Mapped[bool | None] = mapped_column(Boolean)
    manager_tenure_days: Mapped[int | None] = mapped_column(Integer)
    squad_minutes_retained_pct: Mapped[float | None] = mapped_column(Float)

class FeatureSnapshot(Base):
    __tablename__ = "feature_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("fixtures.id"), index=True)
    perspective_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    prediction_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    feature_version: Mapped[str] = mapped_column(String(32))
    features: Mapped[dict] = mapped_column(JSON)

class Prediction(Base):
    __tablename__ = "predictions"
    id: Mapped[int] = mapped_column(primary_key=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("fixtures.id"), index=True)
    perspective_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    prediction_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    model_version: Mapped[str] = mapped_column(String(64))
    p_win: Mapped[float] = mapped_column(Float)
    p_draw: Mapped[float] = mapped_column(Float)
    p_loss: Mapped[float] = mapped_column(Float)
    expected_points: Mapped[float] = mapped_column(Float)
    difficulty_score: Mapped[float] = mapped_column(Float)
    difficulty_label: Mapped[str] = mapped_column(String(32))
    difficulty_percentile: Mapped[float | None] = mapped_column(Float)
    p_clean_sheet: Mapped[float | None] = mapped_column(Float)
    xg_for: Mapped[float | None] = mapped_column(Float)
    xg_against: Mapped[float | None] = mapped_column(Float)
    explanation: Mapped[dict | None] = mapped_column(JSON)
    # One live prediction per team per fixture per model; each run replaces the previous one.
    __table_args__ = (UniqueConstraint("fixture_id","perspective_team_id","model_version"),)
