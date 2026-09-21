"""Build the team × matchday grid the frontend renders."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from statistics import median
from typing import cast

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Fixture, MarketOdds, Prediction, RefreshRun, Team
from app.schemas import (
    CellMarket,
    CellPrediction,
    CellRecord,
    CellResult,
    CellReview,
    CellStatus,
    DifficultyLabel,
    FixtureGrid,
    GridCell,
    GridMatchday,
    GridMeta,
    GridTeam,
    LensScale,
    LensScales,
    Outcome,
    Prob,
    Venue,
)
from app.services.crests import safe_crest_url
from app.services.market_odds import MarketLine, team_market
from app.services.model_notes import MODEL_NOTES
from app.services.opening_projection import load_opening_projection
from app.services.postmortem import surprise_of
from app.services.scoring import LABEL_THRESHOLDS, LABELS, difficulty_label, label_bucket
from app.services.team_registry import by_code
from app.services.timeutil import as_utc

LIVE = {"IN_PLAY", "PAUSED", "LIVE"}
POSTPONED = {"POSTPONED", "SUSPENDED", "CANCELLED"}
FINISHED = {"FINISHED", "AWARDED"}
RESCHEDULED_AFTER = timedelta(days=4)  # further than this from its matchday's usual dates


def normalize_status(status: str | None) -> CellStatus:
    status = (status or "").upper()
    if status in FINISHED:
        return "finished"
    if status in LIVE:
        return "live"
    if status in POSTPONED:
        return "postponed"
    return "scheduled"


def date_confirmed(status: str | None) -> bool:
    """football-data.org uses SCHEDULED for 'date not fixed yet' and TIMED once the kickoff is set."""
    return (status or "").upper() != "SCHEDULED"


def result_for(goals_for: int | None, goals_against: int | None) -> CellResult | None:
    if goals_for is None or goals_against is None:
        return None
    outcome: Outcome = "W" if goals_for > goals_against else "D" if goals_for == goals_against else "L"
    return CellResult(goals_for=goals_for, goals_against=goals_against, outcome=outcome)


def team_code(team: Team) -> str:
    return team.code or team.canonical_name[:3].upper()


def matchday_window(kickoffs: list[datetime]) -> tuple[datetime, datetime, datetime]:
    """(date_from, date_to, centre), ignoring games moved far away from the rest."""
    kickoffs = [as_utc(k) for k in kickoffs]
    centre = datetime.fromtimestamp(median(k.timestamp() for k in kickoffs), tz=UTC)
    core = [k for k in kickoffs if abs(k - centre) <= RESCHEDULED_AFTER] or kickoffs
    return min(core), max(core), centre


def matchday_finished(fixtures: list[Fixture], centre: datetime) -> bool:
    """A matchday is done once its regular games are played; a single game moved months later
    must not hold the board back on an old matchday."""
    core = [fx for fx in fixtures if abs(as_utc(fx.kickoff_utc) - centre) <= RESCHEDULED_AFTER] or fixtures
    return all(normalize_status(fx.status) in {"finished", "postponed"} for fx in core)


def live_predictions(db: Session, fixture_ids: list[int]) -> dict[tuple[int, int], Prediction]:
    """Predictions from the most recently run model version (one row per fixture/team per version)."""
    latest_version = (
        db.query(Prediction.model_version)
        .filter(Prediction.fixture_id.in_(fixture_ids or [-1]))
        .order_by(Prediction.prediction_ts.desc())
        .limit(1)
        .scalar()
    )
    if latest_version is None:
        return {}
    rows = (
        db.query(Prediction)
        .filter(Prediction.fixture_id.in_(fixture_ids), Prediction.model_version == latest_version)
        .order_by(Prediction.prediction_ts)
    )
    return {(p.fixture_id, p.perspective_team_id): p for p in rows}


def historic_predictions(db: Session, fixture_ids: list[int]) -> dict[tuple[int, int], Prediction]:
    """The last forecast made before kickoff for games already played, whatever version wrote it.

    Deliberately not filtered by model version, unlike live_predictions: re-fitting the model must not erase
    what the board said at the time. The predict job only deletes rows for fixtures it re-predicts, so these
    rows survive; the newest prediction_ts is the last one written while the game was still upcoming.
    """
    rows = (
        db.query(Prediction).filter(Prediction.fixture_id.in_(fixture_ids or [-1])).order_by(Prediction.prediction_ts)
    )
    return {(p.fixture_id, p.perspective_team_id): p for p in rows}  # ordered ascending: the last write wins


def latest_odds(db: Session, fixture_ids: list[int]) -> dict[int, MarketOdds]:
    rows = db.query(MarketOdds).filter(MarketOdds.fixture_id.in_(fixture_ids or [-1]))
    return {row.fixture_id: row for row in rows}


def cell_market(odds: MarketOdds, venue: Venue) -> CellMarket:
    line = MarketLine(
        home=odds.p_home, draw=odds.p_draw, away=odds.p_away, over_2_5=odds.p_over_2_5, bookmakers=odds.bookmakers
    )
    goals_for, goals_against = (
        (odds.home_goals, odds.away_goals) if venue == "H" else (odds.away_goals, odds.home_goals)
    )
    market = team_market(line, goals_for, goals_against, venue)
    return CellMarket(
        win=round(market.win, 4),
        draw=round(market.draw, 4),
        loss=round(market.loss, 4),
        scores=round(market.scores, 4),
        scores_2plus=round(market.scores_2plus, 4),
        clean_sheet=round(market.clean_sheet, 4),
        concedes_2plus=round(market.concedes_2plus, 4),
        both_score=round(market.both_score, 4),
        expected_points=round(3 * market.win + market.draw, 3),
        bookmakers=odds.bookmakers,
        fetched_at=as_utc(odds.fetched_at),
    )


def cell_record(pred: Prediction | None, key: str) -> CellRecord | None:
    """The stored record, if the predict job found one for this club at this price."""
    stored = (pred.explanation or {}).get(key) if pred else None
    return CellRecord(**stored) if isinstance(stored, dict) else None


def cell_review(pred: Prediction | None, result: CellResult | None) -> CellReview | None:
    """How that forecast did: the chance it gave what happened, the points swing, and how odd the result was."""
    if pred is None or result is None:
        return None
    points = {"W": 3, "D": 1, "L": 0}[result.outcome]
    chance = {"W": pred.p_win, "D": pred.p_draw, "L": pred.p_loss}[result.outcome]
    return CellReview(
        outcome_chance=round(chance, 3),
        points=points,
        expected_points=round(pred.expected_points, 3),
        surprise=round(surprise_of(pred.p_win, pred.p_draw, pred.p_loss, points), 3),
    )


def cell_prediction(pred: Prediction, venue: Venue, strict: bool = True) -> CellPrediction:
    """One forecast as the board shows it.

    A played game's forecast can be old enough to carry label words the board no longer uses. Its numbers
    are still the forecast, so they are kept and the word is said again in today's vocabulary; on a game
    still to come an unknown label is a bug and stops the grid.
    """
    optional = lambda value, digits: None if value is None else round(value, digits)
    both_score = (pred.explanation or {}).get("both_score")
    stored = pred.difficulty_label
    if stored not in LABELS:
        if strict:
            raise ValueError(f"unknown difficulty label {stored!r} on prediction {pred.id}")
        stored = difficulty_label(pred.difficulty_score, venue)
    label = cast(DifficultyLabel, stored)
    return CellPrediction(
        difficulty=round(pred.difficulty_score, 1),
        label=label,
        bucket=label_bucket(label),
        expected_points=round(pred.expected_points, 3),
        probabilities=Prob(win=round(pred.p_win, 3), draw=round(pred.p_draw, 3), loss=round(pred.p_loss, 3)),
        clean_sheet=optional(pred.p_clean_sheet, 3),
        xg_for=optional(pred.xg_for, 2),
        xg_against=optional(pred.xg_against, 2),
        both_score=optional(both_score, 3) if isinstance(both_score, int | float) else None,
    )


LENS_SHARES = (0.15, 0.20, 0.30, 0.20, 0.15)  # same shares the difficulty labels were calibrated to


def quantile_scale(values: list[float]) -> LensScale:
    """Cut points for a higher-is-easier lens so buckets 1–5 hold 15/20/30/20/15 % of fixtures."""
    if not values:
        return LensScale(cuts=[0.0, 0.0, 0.0, 0.0], higher_is_easier=True)
    ordered = sorted(values)
    quantile = lambda p: ordered[min(len(ordered) - 1, int(p * len(ordered)))]
    easiest_first = [1 - sum(LENS_SHARES[: i + 1]) for i in range(4)]  # 0.85, 0.65, 0.35, 0.15
    return LensScale(cuts=[round(quantile(p), 4) for p in easiest_first], higher_is_easier=True)


def lens_scales(cells: list[GridCell]) -> LensScales:
    # Cut points come from the games still to be played. Played games carry their old forecast for the
    # review, and counting those would shift every colour on the board as the season goes on.
    cells = [cell for cell in cells if cell.status != "finished"]
    predictions = [cell.prediction for cell in cells if cell.prediction]
    return LensScales(
        overall=LensScale(cuts=list(LABEL_THRESHOLDS), higher_is_easier=False),
        attack=quantile_scale([p.xg_for for p in predictions if p.xg_for is not None]),
        defence=quantile_scale([p.clean_sheet for p in predictions if p.clean_sheet is not None]),
        odds=quantile_scale([cell.market.win for cell in cells if cell.market]),
        record=quantile_scale([cell.record.edge for cell in cells if cell.record]),
        market_record=quantile_scale([cell.record_price.edge for cell in cells if cell.record_price]),
    )


def build_fixture_grid(db: Session) -> FixtureGrid | None:
    season = db.query(Fixture.season).order_by(Fixture.kickoff_utc.desc()).limit(1).scalar()
    if season is None:
        return None
    fixtures = (
        db.query(Fixture)
        .filter(Fixture.season == season, Fixture.matchday.isnot(None))
        .order_by(Fixture.matchday, Fixture.kickoff_utc)
        .all()
    )
    fixture_ids = [fx.id for fx in fixtures]
    teams = {team.id: team for team in db.query(Team).all()}
    played_ids = [fx.id for fx in fixtures if normalize_status(fx.status) == "finished"]
    live = live_predictions(db, fixture_ids)
    predictions = {**live, **historic_predictions(db, played_ids)}
    odds = latest_odds(db, fixture_ids)

    by_matchday: dict[int, list[Fixture]] = defaultdict(list)
    for fx in fixtures:
        if fx.matchday is not None:  # the query already excludes these; keeps the types honest
            by_matchday[fx.matchday].append(fx)
    numbers = sorted(by_matchday)
    column = {number: i for i, number in enumerate(numbers)}

    matchdays: list[GridMatchday] = []
    centres: dict[int, datetime] = {}
    for number in numbers:
        date_from, date_to, centres[number] = matchday_window([fx.kickoff_utc for fx in by_matchday[number]])
        matchdays.append(
            GridMatchday(
                number=number,
                date_from=date_from,
                date_to=date_to,
                finished=matchday_finished(by_matchday[number], centres[number]),
            )
        )
    current = next((md.number for md in matchdays if not md.finished), None)

    cells: dict[int, list[list[GridCell]]] = {team_id: [[] for _ in numbers] for team_id in teams}
    for fx in fixtures:
        if fx.matchday is None:
            continue
        matchday = fx.matchday
        kickoff = as_utc(fx.kickoff_utc)
        status = normalize_status(fx.status)
        sides: tuple[tuple[int, int, Venue], ...] = (
            (fx.home_team_id, fx.away_team_id, "H"),
            (fx.away_team_id, fx.home_team_id, "A"),
        )
        for team_id, opponent_id, venue in sides:
            goals_for, goals_against = (
                (fx.home_goals, fx.away_goals) if venue == "H" else (fx.away_goals, fx.home_goals)
            )
            pred = predictions.get((fx.id, team_id))
            result = result_for(goals_for, goals_against) if status == "finished" else None
            rated = status in {"scheduled", "live", "finished"}
            cells[team_id][column[matchday]].append(
                GridCell(
                    fixture_id=fx.id,
                    opponent_code=team_code(teams[opponent_id]),
                    venue=venue,
                    kickoff_utc=kickoff,
                    date_confirmed=date_confirmed(fx.status),
                    rescheduled=abs(kickoff - centres[matchday]) > RESCHEDULED_AFTER,
                    status=status,
                    result=result,
                    review=cell_review(pred, result),
                    # Everything but a postponed game carries a forecast: a played one keeps the last one
                    # made before kickoff, so the board can be checked against what happened.
                    prediction=cell_prediction(pred, venue, strict=status != "finished") if pred and rated else None,
                    market=cell_market(odds[fx.id], venue) if fx.id in odds and status == "scheduled" else None,
                    record=cell_record(pred, "record") if rated else None,
                    record_price=cell_record(pred, "record_price") if status == "scheduled" else None,
                )
            )

    opening = load_opening_projection(settings.opening_projection_path, season)
    grid_teams = []
    for team_id, team in teams.items():
        if not any(cells[team_id]):
            continue  # clubs from other seasons still in the teams table
        info = by_code(team.code)
        grid_teams.append(
            GridTeam(
                code=team_code(team),
                name=info.name if info else team.canonical_name,
                color=team.color or (info.color if info else "#8e8e93"),
                crest_url=safe_crest_url(team.crest_url),  # re-checked on the way out, in case of old rows
                cells=cells[team_id],
                opening=opening.path(team_code(team), numbers) if opening else None,
            )
        )
    grid_teams.sort(key=lambda t: t.name)

    versions = {p.model_version for p in live.values()}  # what the board forecasts with now, not what it used to
    all_cells = [cell for team in grid_teams for team_column in team.cells for cell in team_column]
    return FixtureGrid(
        season=season,
        current_matchday=current,
        model_version=next(iter(versions)) if versions else None,
        lens_scales=lens_scales(all_cells),
        matchdays=matchdays,
        teams=grid_teams,
    )


def last_successful_sync(db: Session) -> datetime | None:
    """When the fixtures were last checked against football-data.org.

    Fixtures are only rewritten when they change, so their timestamps can't answer this; the
    refresh run history can. Falls back to fixture timestamps for data synced before run tracking.
    """
    recent = db.query(RefreshRun).order_by(RefreshRun.started_at.desc()).limit(20).all()
    for run in recent:
        sync_step = (run.details or {}).get("sync") or {}
        if sync_step.get("status") != "succeeded":
            continue
        if run.finished_at is not None:
            return as_utc(run.finished_at)
        # The run that is publishing the board right now: its sync step is done even though the run isn't.
        started = as_utc(run.started_at)
        if started is not None:
            return started + timedelta(seconds=float(sync_step.get("seconds") or 0))
    latest_change = (
        db.query(Fixture.source_updated_at).order_by(Fixture.source_updated_at.desc().nulls_last()).limit(1).scalar()
    )
    return as_utc(latest_change) if latest_change else None


def grid_meta(db: Session) -> GridMeta:
    last_prediction = (
        db.query(Prediction.prediction_ts).order_by(Prediction.prediction_ts.desc().nulls_last()).limit(1).scalar()
    )
    return GridMeta(
        last_synced_at=last_successful_sync(db),
        last_predicted_at=as_utc(last_prediction) if last_prediction else None,
        model_notes=list(MODEL_NOTES),
    )
