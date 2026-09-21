from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")

DifficultyLabel = Literal["Very favourite", "Favourite", "Even", "Underdog", "Big underdog"]
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
    both_score: float | None = None  # both teams score, from the score matrix


class CellRecord(BaseModel):
    """How this club has done before at the price this fixture gives it.

    Counted from bookmaker closing odds over the last five seasons, because those are the only record of
    what a club *was* priced at. `edge` is the club's rate minus the league's at the same price, shrunk
    toward 0 by sample size - what it adds to its billing, rather than the billing itself.
    """

    band: str  # "35-50%"
    games: int
    wins: int
    rate: float  # the club's own win rate in the band
    league: float  # every club together, at the same price
    edge: float


class CellResult(BaseModel):
    goals_for: int
    goals_against: int
    outcome: Outcome


class CellReview(BaseModel):
    """How the forecast did, once the game was played.

    The forecast is the last one made before kickoff, whatever model version wrote it: the point is what the
    board said at the time. `surprise` comes from services/postmortem.py.
    """

    outcome_chance: float  # the chance the forecast gave the result that happened
    points: int  # points actually won
    expected_points: float  # what the forecast expected
    surprise: float  # 1 = an ordinary result; 0.05 = one the forecast made a one-in-twenty shot


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
    both_score: float
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
    review: CellReview | None = None  # played games only: how that forecast did
    prediction: CellPrediction | None
    market: CellMarket | None = None
    # Banded by the win chance this board shows; and by the bookmakers' price where there is one.
    record: CellRecord | None = None
    record_price: CellRecord | None = None


class GridTeam(BaseModel):
    code: str
    name: str
    color: str
    crest_url: str | None  # always https://crests.football-data.org/…, or null
    cells: list[list[GridCell]]
    # Where the pre-season model had this club after each gameweek, one entry per matchday column
    # (services/opening_projection.py). Null when the committed projection is missing or from another season.
    opening: list[int] | None = None


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
    record: LensScale  # how far the club beats the price we give it; every fixture
    market_record: LensScale  # the same, banded by the bookmakers' price; priced games only


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
