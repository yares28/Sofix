"""Validated UEFA main-stage boards, using pooled strengths and reviewed venues."""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime
from typing import Any, Literal, cast

from app.research.european_data import inventory_match, league_phase_coverage, validate_page
from app.research.european_facts import regulation, venue
from app.research.european_model import CONFIG
from app.research.league_xscore_data import when
from app.schemas import (
    ApiResponse,
    CellPrediction,
    CellStatus,
    DifficultyLabel,
    FixtureGrid,
    GridCell,
    GridMatchday,
    GridMeta,
    GridTeam,
    ModelNote,
    Prob,
    Venue,
)
from app.services.fixture_grid import lens_scales, matchday_window, result_for
from app.services.rating_predictions import model_version
from app.services.scoring import difficulty_label, difficulty_score, label_bucket

VALIDATED = ("CL", "EL")


def version(code: str) -> str:
    return f"{code}:european-{model_version(CONFIG)}"


def crest(team: dict[str, Any]) -> str | None:
    url = team.get("logoUrl") or ""
    return (
        url
        if re.fullmatch(r"https://img\.uefa\.com/imgml/TP/teams/logos/(?:70x70|240x240|700x700)/[0-9]+\.png", url)
        else None
    )


def build_grid(
    code: str,
    season: int,
    raw: list[dict[str, Any]],
    model: Any,
    now: datetime,
    previous: ApiResponse[FixtureGrid] | None = None,
    *,
    clubs: dict[str, str] | None = None,
) -> ApiResponse[FixtureGrid]:
    if code not in VALIDATED:
        raise ValueError("Competition has no validated European model")
    for row in raw:
        validate_page([row], code, season)
    inventory = [inventory_match(row, code, season) for row in raw]
    if not league_phase_coverage(inventory, code, season)["complete"] or len({r["id"] for r in raw}) != len(raw):
        raise ValueError("Incomplete full UEFA league-phase calendar")
    league_ids = {r["id"][5:] for r in inventory if r["phase"] == "league"}
    refs = {t["id"]: t for row in raw if row["id"] in league_ids for t in (row["homeTeam"], row["awayTeam"])}
    codes = {ident: ref.get("teamCode") for ident, ref in refs.items()}
    if len(set(codes.values())) != 36 or any(not c or not re.fullmatch(r"[A-Z0-9]{2,8}", c) for c in codes.values()):
        raise ValueError("Ambiguous UEFA club abbreviations")
    if clubs is not None and set(refs) != set(clubs):
        raise ValueError("Incomplete 36-club source identity registry")
    grouped: dict[int, list[tuple[dict[str, Any], dict[str, Any]]]] = defaultdict(list)
    for row, item in zip(raw, inventory, strict=True):
        if item["phase"] not in {"league", "knockout"} or not item["home"] or not item["away"]:
            continue
        if row["homeTeam"]["id"] not in refs or row["awayTeam"]["id"] not in refs:
            raise ValueError("Main-stage draw contains a club outside its 36-club population")
        if item["kickoff"] is None:
            raise ValueError("Known main-stage pair has no kickoff; retain previous board, never omit the pair")
        label = (row.get("matchday") or {}).get("longName", "")
        round_match = re.fullmatch(r"Matchday ([0-9]+)", label)
        if not round_match:
            raise ValueError("Unknown UEFA round ordering")
        grouped[int(round_match[1])].append((row, item))
    for number, pairs in grouped.items():
        league = [r for r, item in pairs if item["phase"] == "league"]
        if league and (len(league) != 18 or len({r[s]["id"] for r in league for s in ("homeTeam", "awayTeam")}) != 36):
            raise ValueError(f"Incomplete or repeated UEFA league round {number}")
    columns = {number: i for i, number in enumerate(sorted(grouped))}
    cells: dict[str, list[list[GridCell]]] = {ident: [[] for _ in grouped] for ident in refs}
    old: dict[tuple[int | None, int, str, str], GridCell] = {}
    if (
        previous
        and previous.data
        and previous.data.competition == code
        and previous.data.season == f"{season}/{(season + 1) % 100:02}"
    ):
        for team in previous.data.teams:
            for col in team.cells:
                for c in col:
                    old[team.source_id, c.fixture_id, c.opponent_code, c.venue] = c
    rounds = []
    for number, pairs in sorted(grouped.items()):
        dates = [when(item["kickoff"]) for _, item in pairs]
        lo, hi, centre = matchday_window(dates)
        rounds.append(
            GridMatchday(
                number=number,
                date_from=lo,
                date_to=hi,
                finished=all(row["status"] in {"FINISHED", "CANCELED", "ABANDONED"} for row, _ in pairs),
            )
        )
        for row, item in pairs:
            kickoff = when(item["kickoff"])
            status: CellStatus = (
                "finished"
                if row["status"] == "FINISHED"
                else "scheduled"
                if row["status"] == "UPCOMING"
                else "postponed"
                if row["status"] in {"CANCELED", "ABANDONED", "POSTPONED"}
                else "live"
            )
            ground = venue(row)
            score = regulation(row)["score90"] if status == "finished" else None
            prediction = None
            if status == "scheduled" and kickoff > now and ground["neutral"] is not None:
                prediction = model.predict(
                    [row["homeTeam"]["id"]], [row["awayTeam"]["id"]], neutral=[ground["neutral"]]
                ).iloc[0]
            for ident, other, side in (
                (row["homeTeam"]["id"], row["awayTeam"]["id"], "H"),
                (row["awayTeam"]["id"], row["homeTeam"]["id"], "A"),
            ):
                pred, at = None, None
                if prediction is not None:
                    win, loss = (
                        (float(prediction["p_h"]), float(prediction["p_a"]))
                        if side == "H"
                        else (float(prediction["p_a"]), float(prediction["p_h"]))
                    )
                    draw = float(prediction["p_d"])
                    difficulty = difficulty_score(win, draw, loss)
                    label = difficulty_label(difficulty, "H" if ground["neutral"] else side)
                    pred = CellPrediction(
                        difficulty=round(difficulty, 1),
                        label=cast(DifficultyLabel, label),
                        bucket=label_bucket(label),
                        expected_points=round(3 * win + draw, 3),
                        probabilities=Prob(win=win, draw=draw, loss=loss),
                        clean_sheet=float(prediction["cs_h" if side == "H" else "cs_a"]),
                        xg_for=float(prediction["lam_h" if side == "H" else "lam_a"]),
                        xg_against=float(prediction["lam_a" if side == "H" else "lam_h"]),
                        both_score=float(
                            max(0, min(1, 1 - prediction["cs_h"] - prediction["cs_a"] + prediction["p_00"]))
                        ),
                    )
                    at = now
                elif status in {"finished", "live"}:
                    prior = old.get((int(ident), int(row["id"]), codes[other], side))
                    if (
                        prior
                        and prior.forecast_at
                        and prior.forecast_at < kickoff
                        and prior.neutral == ground["neutral"]
                    ):
                        pred, at = prior.prediction, prior.forecast_at
                gf, ga = (score if side == "H" else score[::-1]) if score else (None, None)
                cells[ident][columns[number]].append(
                    GridCell(
                        fixture_id=int(row["id"]),
                        opponent_code=codes[other],
                        venue=cast(Venue, side),
                        kickoff_utc=kickoff,
                        date_confirmed=True,
                        rescheduled=abs(kickoff - centre).days > 4,
                        status=status,
                        result=result_for(gf, ga) if score else None,
                        prediction=pred,
                        forecast_at=at,
                        neutral=ground["neutral"],
                        phase=item["phase"],
                        round_name=((row.get("round") or {}).get("translations", {}).get("name") or {}).get("EN"),
                    )
                )
    teams = [
        GridTeam(
            source_id=int(ident),
            history_name=ident,
            sorare_slug=(clubs or {}).get(ident),
            code=codes[ident],
            name=(ref.get("translations", {}).get("displayName") or {}).get("EN") or ref["internationalName"],
            color="#596579",
            crest_url=crest(ref),
            cells=cells[ident],
        )
        for ident, ref in refs.items()
    ]
    grid = FixtureGrid(
        competition=cast(Literal["CL", "EL"], code),
        season=f"{season}/{(season + 1) % 100:02}",
        current_matchday=next((r.number for r in rounds if not r.finished), None),
        model_version=version(code),
        lens_scales=lens_scales([c for t in teams for col in t.cells for c in col]),
        matchdays=rounds,
        teams=sorted(teams, key=lambda t: t.name),
    )
    return ApiResponse[FixtureGrid](
        success=True,
        data=grid,
        meta=GridMeta(
            last_synced_at=now,
            last_predicted_at=now,
            model_notes=[
                ModelNote(
                    lens=None,
                    text="Validated European model. League phase and knockouts; regulation time only. Neutral venues have no home advantage. Clean-sheet chances are uncalibrated. Knockout pairs appear after the draw; qualifiers are outside this release.",
                )
            ],
        ),
    )
