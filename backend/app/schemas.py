from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")

DifficultyLabel = Literal["Easy", "Easy-ish", "Normal", "Hard-ish", "Hard"]
Outcome = Literal["W", "D", "L"]
Venue = Literal["H", "A"]
CellStatus = Literal["scheduled", "live", "finished", "postponed"]
LensName = Literal["overall", "attack", "defence"]


class Prob(BaseModel):
    win: float
    draw: float
    loss: float


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: T | None = None
    error: str | None = None
    meta: dict | None = None


class CellPrediction(BaseModel):
    difficulty: float
    label: DifficultyLabel
    bucket: int = Field(ge=1, le=5)  # from the label, so colour and label always agree
    expected_points: float
    probabilities: Prob
    clean_sheet: float | None
    xg_for: float | None
    xg_against: float | None


class CellResult(BaseModel):
    goals_for: int
    goals_against: int
    outcome: Outcome


class CellWeather(BaseModel):
    temperature_c: float | None
    precipitation_mm: float | None
    wind_kmh: float | None


class GridCell(BaseModel):
    fixture_id: int
    opponent_code: str
    venue: Venue
    kickoff_utc: datetime
    date_confirmed: bool
    rescheduled: bool
    status: CellStatus
    result: CellResult | None
    prediction: CellPrediction | None
    weather: CellWeather | None


class GridTeam(BaseModel):
    code: str
    name: str
    color: str
    cells: list[list[GridCell]]


class GridMatchday(BaseModel):
    number: int
    date_from: datetime
    date_to: datetime
    finished: bool


class LensScale(BaseModel):
    """Four cut points splitting a lens into buckets 1 (easiest) … 5 (hardest).

    higher_is_easier=False (overall difficulty): bucket = 1 + number of cuts the value exceeds.
    higher_is_easier=True (xG, clean sheet): cuts are descending; bucket = 1 + number of cuts the value is below.
    """

    cuts: list[float] = Field(min_length=4, max_length=4)
    higher_is_easier: bool


class FixtureGrid(BaseModel):
    season: str
    current_matchday: int | None
    model_version: str | None
    lens_scales: dict[LensName, LensScale]
    matchdays: list[GridMatchday]
    teams: list[GridTeam]
