"""A calendar board of existing forecasts, joined by reviewed source identities."""

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.schemas import FixtureGrid, GridMatchday, GridTeam
from app.services.fixture_grid import lens_scales

COMPETITIONS = ("PD", "PL", "BL1", "FL1", "CL", "EL", "CONF")
MADRID = ZoneInfo("Europe/Madrid")
# UEFA ID -> domestic competition and club key, checked against the seven published
# identity inventories on 26 Oct 2026. Abbreviations alone are not identities (FCB, CEL, LEV, BRE, STR collide).
DOMESTIC = {
    50080: ("PD", "FCB"),
    50124: ("PD", "ATL"),
    52265: ("PD", "BET"),
    50051: ("PD", "RMA"),
    70691: ("PD", "VIL"),
    53043: ("PD", "CEL"),
    50123: ("PD", "RSO"),
    87960: ("PD", "GET"),
    52280: ("PL", "57"),
    52683: ("PL", "58"),
    7889: ("PL", "64"),
    52919: ("PL", "65"),
    52682: ("PL", "66"),
    2601124: ("PL", "1044"),
    52916: ("PL", "354"),
    53360: ("PL", "71"),
    2601105: ("PL", "397"),
    52758: ("BL1", "4"),
    50037: ("BL1", "5"),
    2603790: ("BL1", "721"),
    50107: ("BL1", "10"),
    2600431: ("BL1", "2"),
    50109: ("BL1", "3"),
    59880: ("BL1", "17"),
    52277: ("FL1", "546"),
    75797: ("FL1", "521"),
    52747: ("FL1", "524"),
    5312: ("FL1", "523"),
    52748: ("FL1", "516"),
    55031: ("FL1", "529"),
    50023: ("FL1", "548"),
}


def identity(competition: str, team: GridTeam) -> tuple[str, str]:
    if competition in {"CL", "EL", "CONF"}:
        return DOMESTIC.get(team.source_id or 0, ("UEFA", str(team.source_id or team.sorare_slug or team.code)))
    return competition, team.code if competition == "PD" else str(team.source_id or team.code)


def monday(value: datetime):
    day = value.astimezone(MADRID).date()
    return day - timedelta(days=day.weekday())


def combine(grids: list[FixtureGrid], now: datetime) -> FixtureGrid:
    sources = {g.competition: g for g in grids if g.competition in COMPETITIONS}
    grids = [sources[c] for c in COMPETITIONS if c in sources]
    dates = [monday(c.kickoff_utc) for g in grids for t in g.teams for col in t.cells for c in col]
    first, last = min(dates, default=monday(now)), max(dates, default=monday(now))
    weeks = [first + timedelta(weeks=i) for i in range((last - first).days // 7 + 1)]
    rounds = [
        GridMatchday(
            number=i + 1,
            date_from=datetime.combine(day, time.min, MADRID).astimezone(UTC),
            date_to=datetime.combine(day + timedelta(days=6), time.max, MADRID).astimezone(UTC),
            finished=day + timedelta(days=7) <= now.astimezone(MADRID).date(),
        )
        for i, day in enumerate(weeks)
    ]
    clubs: dict[tuple[str, str], GridTeam] = {}
    codes: set[str] = set()
    for g in grids:
        for t in g.teams:
            key = identity(g.competition, t)
            if key in clubs:
                continue
            code = t.code
            if code in codes:
                code = f"{g.competition}{t.code}"
            if code in codes or len(code) > 8:
                code = f"T{len(codes)}"
            codes.add(code)
            clubs[key] = t.model_copy(
                update={
                    "code": code,
                    "source_code": t.code,
                    "source_competition": g.competition,
                    "cells": [[] for _ in rounds],
                    "opening": None,
                }
            )
    seen: set[tuple[str, str, int]] = set()
    for g in grids:
        opponents = {t.code: clubs[identity(g.competition, t)].code for t in g.teams}
        for t in g.teams:
            club = clubs[identity(g.competition, t)]
            for col in t.cells:
                for cell in col:
                    fixture_key = (g.competition, club.code, cell.fixture_id)
                    if fixture_key in seen:
                        continue
                    seen.add(fixture_key)
                    column = (monday(cell.kickoff_utc) - first).days // 7
                    club.cells[column].append(
                        cell.model_copy(
                            update={
                                "fixture_id": cell.fixture_id * 10 + COMPETITIONS.index(g.competition),
                                "competition": g.competition,
                                "opponent_code": opponents[cell.opponent_code],
                            }
                        )
                    )
    teams = sorted(clubs.values(), key=lambda t: t.name)
    for team in teams:
        for col in team.cells:
            col.sort(key=lambda c: c.kickoff_utc)
    return FixtureGrid(
        competition="ALL",
        season=grids[0].season if grids else "",
        current_matchday=next((r.number for r in rounds if r.date_to >= now), rounds[-1].number),
        model_version="combined",
        lens_scales=lens_scales([c for t in teams for col in t.cells for c in col]),
        matchdays=rounds,
        teams=teams,
        missing_competitions=[c for c in COMPETITIONS if c not in sources],
    )


def publish(db, now: datetime) -> dict:
    from app.schemas import ApiResponse
    from app.services import kept_blocks
    from app.services.publish import put

    keys = ["grid" if c == "PD" else f"grid:{c}" for c in COMPETITIONS]
    rows = kept_blocks.read_many(db, keys)
    bodies = [ApiResponse[FixtureGrid].model_validate(row.payload) for row in rows]
    grids = [b.data for b in bodies if b.success and b.data]
    grid = combine(grids, now)
    body = ApiResponse[FixtureGrid](
        success=bool(grids), data=grid if grids else None, error=None if grids else "No competition fixtures available."
    )
    payload = body.model_dump(mode="json")
    if grid.teams:
        blocks = []
        for offset in range(0, len(grid.teams), 30):
            key = f"grid:ALL:teams:{offset // 30}"
            put(db, key, {"teams": [t.model_dump(mode="json") for t in grid.teams[offset : offset + 30]]}, now)
            blocks.append(key)
        payload["data"]["teams"] = []
        payload["team_blocks"] = blocks
    put(db, "grid:ALL", payload, now)
    return {"teams": len(grid.teams), "competitions": len(grids), "missing": grid.missing_competitions}
