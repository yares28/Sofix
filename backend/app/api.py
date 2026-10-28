from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, Path
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import PlayerAbsence, PlayerGame, ReadModel
from app.schemas import ApiResponse, FixtureGrid
from app.services.fixture_grid import build_fixture_grid, grid_meta
from app.services.timeutil import as_utc
from app.sorare import audit, ff_link, reward_bars, sheets, stat_charts
from app.sorare import missions as mission_logs
from app.sorare.ff_lineups import LINEUPS_KEY
from app.sorare.frozen import PLAN_PREFIX
from app.sorare.publish import AHEAD_PREFIX, ALT_PREFIX, ARCHIVE_PREFIX, LENS_PREFIX, RECORD_PREFIX

router = APIRouter(prefix="/api")


@router.get("/data-health", response_model=ApiResponse[dict[str, Any]])
def kept_data_health(db: Session = Depends(get_db)):
    row = db.get(ReadModel, "data_health")
    return ApiResponse[dict[str, Any]](success=True, data=row.payload if row else None)


@router.get("/my-weeks", response_model=ApiResponse[list[dict[str, Any]]])
def my_weeks(db: Session = Depends(get_db)):
    rows = db.scalars(select(ReadModel).where(ReadModel.key.like("my_week:%")))
    return ApiResponse[list[dict[str, Any]]](
        success=True, data=sorted([row.payload for row in rows], key=lambda week: week.get("end", ""), reverse=True)
    )


@router.get("/player-sheets", response_model=ApiResponse[dict[str, Any]])
def player_sheets(db: Session = Depends(get_db)):
    row = db.get(ReadModel, sheets.KEY)
    return ApiResponse[dict[str, Any]](success=True, data=row.payload if row else {"asOf": "", "players": {}})


@router.get("/stat-charts", response_model=ApiResponse[dict[str, Any]])
def stat_charts_model(db: Session = Depends(get_db)):
    """The Stats page's charts (local counterpart of the R2 block)."""
    row = db.get(ReadModel, stat_charts.KEY)
    return ApiResponse[dict[str, Any]](
        success=True, data=row.payload if row else {"asOf": "", "keys": [], "onSheet": {}, "players": []}
    )


@router.get("/players/{slug}/games", response_model=ApiResponse[dict[str, Any]])
def player_history(slug: str, db: Session = Depends(get_db)):
    """Local counterpart of the web server's two parameterized history queries."""
    columns = (
        "game_id",
        "date",
        "competition",
        "home",
        "away",
        "status",
        "score",
        "played",
        "started",
        "mins",
        "yellow",
        "red",
        "sofix_x",
        "sorare_x",
        "ff_start",
        "read_at",
    )

    def value(row, key):
        val = getattr(row, key)
        return as_utc(val).isoformat() if isinstance(val, datetime) else val

    games = [
        {key: value(row, key) for key in columns}
        for row in db.scalars(
            select(PlayerGame)
            .where(PlayerGame.player == slug, PlayerGame.date <= datetime.now(UTC))
            .order_by(PlayerGame.date.desc(), PlayerGame.game_id)
        )
    ]
    profile = ff_link.load_kept(db).get(slug, {}).get("slug")
    absences = [
        {
            **{key: value(row, key) for key in ("id", "kind", "cause", "first_seen", "last_seen", "back")},
            "url": f"https://www.futbolfantasy.com/jugadores/{profile}" if profile else None,
        }
        for row in db.scalars(
            select(PlayerAbsence)
            .where(PlayerAbsence.player == slug)
            .order_by(PlayerAbsence.first_seen.desc(), PlayerAbsence.id.desc())
        )
    ]
    return ApiResponse[dict[str, Any]](success=True, data={"games": games, "absences": absences})


@router.get("/health")
def health():
    # Deliberately DB-free: monitors hitting this must not keep Neon awake.
    return {"ok": True}


@router.get("/fixture-grid", response_model=ApiResponse[FixtureGrid])
def fixture_grid(
    competition: Literal["PD", "PL", "BL1", "FL1", "CL", "EL", "CONF", "ALL"] = "PD", db: Session = Depends(get_db)
):
    if competition != "PD":
        row = db.get(ReadModel, f"grid:{competition}")
        if row and competition == "ALL" and row.payload.get("team_blocks"):
            from app.services import kept_blocks

            parts = kept_blocks.read_many(db, row.payload["team_blocks"])
            if len(parts) != len(row.payload["team_blocks"]):
                return ApiResponse[FixtureGrid](success=False, error="Combined fixtures are unavailable.")
            payload = {
                **row.payload,
                "data": {**row.payload["data"], "teams": [t for p in parts for t in p.payload["teams"]]},
            }
            return ApiResponse[FixtureGrid].model_validate(payload)
        return (
            ApiResponse[FixtureGrid].model_validate(row.payload)
            if row
            else ApiResponse[FixtureGrid](success=False, error="No fixtures yet.")
        )
    grid = build_fixture_grid(db)
    if grid is None:
        return ApiResponse[FixtureGrid](success=False, error="No fixtures yet.")
    return ApiResponse[FixtureGrid](success=True, data=grid, meta=grid_meta(db))


@router.get("/sorare", response_model=ApiResponse[dict[str, Any]])
def sorare(db: Session = Depends(get_db)):
    """The Sorare gameweek the job published. Local development only: on Vercel the app reads Neon itself."""
    row = db.get(ReadModel, "sorare")
    if row is None:
        return ApiResponse[dict[str, Any]](success=False, error="Sorare has not been synced yet.")
    return ApiResponse[dict[str, Any]](success=True, data=row.payload)


@router.get("/sorare/player-index", response_model=ApiResponse[dict[str, Any]])
def sorare_player_index(db: Session = Depends(get_db)):
    row = db.get(ReadModel, "player_index")
    return ApiResponse[dict[str, Any]](success=row is not None, data=row.payload if row else None)


@router.get("/sorare/players/{code}", response_model=ApiResponse[dict[str, Any]])
def sorare_league_players(code: Literal["PL", "BL1", "FL1", "CL", "EL", "CONF"], db: Session = Depends(get_db)):
    row = db.get(ReadModel, f"players:{code}")
    return ApiResponse[dict[str, Any]](success=row is not None, data=row.payload if row else None)


@router.get("/sorare/players/{code}/{bucket}", response_model=ApiResponse[dict[str, Any]])
def sorare_player_shard(
    code: Literal["PL", "BL1", "FL1", "CL", "EL", "CONF"], bucket: str, db: Session = Depends(get_db)
):
    if len(bucket) != 1 or bucket not in "0123456789abcdef":
        return ApiResponse[dict[str, Any]](success=False, error="Invalid player bucket")
    row = db.get(ReadModel, f"players:{code}:{bucket}")
    return ApiResponse[dict[str, Any]](success=row is not None, data=row.payload if row else None)


@router.get("/missions", response_model=ApiResponse[dict[str, Any]])
def missions_page(db: Session = Depends(get_db)):
    row = db.get(ReadModel, "missions")
    return ApiResponse[dict[str, Any]](success=True, data=row.payload if row else {})


@router.get("/missions/pool", response_model=ApiResponse[dict[str, Any]])
def missions_pool(db: Session = Depends(get_db)):
    row = db.get(ReadModel, "missions_pool")
    return ApiResponse[dict[str, Any]](success=bool(row), data=row.payload if row else None)


@router.get("/missions/log", response_model=ApiResponse[list[dict[str, Any]]])
def missions_log(db: Session = Depends(get_db)):
    return ApiResponse[list[dict[str, Any]]](success=True, data=mission_logs.logs_of(db))


@router.get("/sorare/week/{slug}", response_model=ApiResponse[dict[str, Any]])
def sorare_week(slug: str, db: Session = Depends(get_db)):
    """One finished gameweek the job kept whole, by its Sorare slug. Local development only, like /sorare."""
    row = db.get(ReadModel, f"{ARCHIVE_PREFIX}{slug}")
    if row is None:
        return ApiResponse[dict[str, Any]](success=False, error="Sofix did not keep this gameweek.")
    return ApiResponse[dict[str, Any]](success=True, data=row.payload)


@router.get("/sorare/alt/{slug}", response_model=ApiResponse[dict[str, Any]])
def sorare_alt(slug: str, db: Session = Depends(get_db)):
    """The week planned again on Sorare's own projections, by its Sorare slug. Local development only, like /sorare."""
    row = db.get(ReadModel, f"{ALT_PREFIX}{slug}")
    if row is None:
        return ApiResponse[dict[str, Any]](success=False, error="There is no Sorare plan for this gameweek.")
    return ApiResponse[dict[str, Any]](success=True, data=row.payload)


@router.get("/sorare/lens/{slug}/{key}", response_model=ApiResponse[dict[str, Any]])
def sorare_lens(slug: str, key: str, db: Session = Depends(get_db)):
    """The week planned again a strategy's way, by its Sorare slug and the strategy's key. Local development only, like /sorare."""
    row = db.get(ReadModel, f"{LENS_PREFIX}{slug}:{key}")
    if row is None:
        return ApiResponse[dict[str, Any]](success=False, error="There is no plan of that strategy for this gameweek.")
    return ApiResponse[dict[str, Any]](success=True, data=row.payload)


@router.get("/sorare/plan/{slug}", response_model=ApiResponse[dict[str, Any]])
def sorare_frozen_plan(slug: str, db: Session = Depends(get_db)):
    """The last pre-lock plan; never recomputed using later team news."""
    row = db.get(ReadModel, f"{PLAN_PREFIX}{slug}")
    return ApiResponse[dict[str, Any]](success=row is not None, data=row.payload if row else None)


@router.get("/sorare/record/{slug}", response_model=ApiResponse[dict[str, Any]])
def sorare_chance_record(slug: str, db: Session = Depends(get_db)):
    """Captured game-specific source chances, retained across the GW lock."""
    row = db.get(ReadModel, f"{RECORD_PREFIX}{slug}")
    return ApiResponse[dict[str, Any]](success=row is not None, data=row.payload if row else None)


@router.get("/sorare/rewards/{slug}", response_model=ApiResponse[dict[str, Any]])
def sorare_play_rewards(slug: str = Path(pattern=r"^[a-z0-9][a-z0-9-]{0,80}$"), db: Session = Depends(get_db)):
    """The compact reward check for one selected GW, read-only local fallback."""
    row = db.get(ReadModel, f"play_rewards:{slug}")
    return ApiResponse[dict[str, Any]](success=row is not None, data=row.payload if row else None)


@router.get("/sorare/ahead/{round}", response_model=ApiResponse[dict[str, Any]])
def sorare_ahead(round: int, db: Session = Depends(get_db)):
    """The early plan the job made for a LaLiga round Sorare has not opened. Local development only, like /sorare."""
    row = db.get(ReadModel, f"{AHEAD_PREFIX}{round}")
    if row is None:
        return ApiResponse[dict[str, Any]](success=False, error="There is no early plan for this round.")
    return ApiResponse[dict[str, Any]](success=True, data=row.payload)


@router.get("/audit", response_model=ApiResponse[dict[str, Any]])
def audit_page(db: Session = Depends(get_db)):
    """The published Audit, else the same stored-game calculation. Local development only, like /sorare."""
    row = db.get(ReadModel, audit.AUDIT_KEY)
    if row is not None:
        return ApiResponse[dict[str, Any]](success=True, data=row.payload)
    page = audit.from_kept(db, datetime.now(UTC))
    return ApiResponse[dict[str, Any]](success=True, data=page)


@router.get("/reward-bars", response_model=ApiResponse[dict[str, Any]])
def reward_bars_page(db: Session = Depends(get_db)):
    """The Targets page's bars the refresh published. Local development only, like /sorare."""
    row = db.get(ReadModel, reward_bars.KEY)
    if row is None:
        return ApiResponse[dict[str, Any]](success=False, error="The reward bars have not been written yet.")
    return ApiResponse[dict[str, Any]](success=True, data=row.payload)


@router.get("/lineups", response_model=ApiResponse[dict[str, Any]])
def lineups(db: Session = Depends(get_db)):
    """Futbol Fantasy's lineups as the Lineups page draws them. Local development only, like /sorare."""
    row = db.get(ReadModel, LINEUPS_KEY)
    if row is None:
        return ApiResponse[dict[str, Any]](success=False, error="Futbol Fantasy's lineups have not been read yet.")
    return ApiResponse[dict[str, Any]](success=True, data=row.payload)
