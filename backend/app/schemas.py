from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")

DifficultyLabel = Literal["Easy", "Easy-ish", "Normal", "Hard-ish", "Hard"]
Outcome = Literal["W", "D", "L"]
Venue = Literal["H", "A"]
CellStatus = Literal["scheduled", "live", "finished", "postponed"]
LensName = Literal["overall", "attack", "defence"]
Bucket = Literal[1, 2, 3, 4, 5]  # 1 = easiest; a literal so the generated TypeScript type is exact


class Prob(BaseModel):
    win: float
    draw: float
    loss: float


class ModelNote(BaseModel):
    lens: LensName | None  # None = applies to every lens
    text: str


class GridMeta(BaseModel):
    last_synced_at: datetime | None
    last_predicted_at: datetime | None
    model_notes: list[ModelNote] = []


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: T | None = None
    error: str | None = None
    meta: GridMeta | None = None


class CellPrediction(BaseModel):
    difficulty: float
    label: DifficultyLabel
    bucket: Bucket  # from the label, so colour and label always agree
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


class CellMarket(BaseModel):
    """Bookmaker consensus for this team's side of the fixture, as fair probabilities (margin removed).
    Result from win/draw/loss prices; goal markets from the goal rates that reproduce the prices."""

    win: float
    draw: float
    loss: float
    scores: float
    scores_2plus: float
    clean_sheet: float
    concedes_2plus: float
    expected_points: float  # 3 × win + draw from the fair prices ("market points")
    bookmakers: int
    fetched_at: datetime


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
    market: CellMarket | None = None


class GridTeam(BaseModel):
    code: str
    name: str
    color: str
    crest_url: str | None  # always https://crests.football-data.org/…, or null
    cells: list[list[GridCell]]


class GridMatchday(BaseModel):
    number: int
    date_from: datetime
    date_to: datetime
    finished: bool


class LensScale(BaseModel):
    """Four cut points splitting a lens into buckets 1 (easiest) … 5 (hardest).

    higher_is_easier=False (overall difficulty): bucket = 1 + number of cuts the value exceeds.
    higher_is_easier=True (xG, clean sheet, market win chance): cuts are descending; bucket = 1 + number of cuts the value is below.
    """

    cuts: list[float] = Field(min_length=4, max_length=4)
    higher_is_easier: bool


class LensScales(BaseModel):
    """One scale per lens (named fields rather than a dict, so clients get a typed object)."""

    overall: LensScale
    attack: LensScale
    defence: LensScale
    odds: LensScale  # bookmakers' win chance; only games with a market are rated


RunStatus = Literal["running", "succeeded", "failed", "abandoned"]
StepStatus = Literal["succeeded", "failed"]


class RefreshRunOut(BaseModel):
    id: int
    trigger: str
    status: RunStatus
    step: str | None
    started_at: datetime
    finished_at: datetime | None
    error: str | None
    steps: dict[str, StepStatus]


class RefreshStatus(BaseModel):
    run: RefreshRunOut | None
    retry_after: int  # seconds until a new refresh may start; 0 when one can start now


class FixtureGrid(BaseModel):
    season: str
    current_matchday: int | None
    model_version: str | None
    lens_scales: LensScales
    matchdays: list[GridMatchday]
    teams: list[GridTeam]
