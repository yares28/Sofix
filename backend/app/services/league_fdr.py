"""Independent PL/Bundesliga boards, without adding foreign rows to LaLiga's tables.

Source IDs are stable club/fixture keys. Only the compact board is persisted; CSV history
stays in the existing Actions cache. Finished games never receive reconstructed forecasts.
"""

import re
from collections import defaultdict
from datetime import datetime

import pandas as pd

from app.modeling.dixon_coles import DixonColesConfig, fit_dixon_coles
from app.schemas import (
    ApiResponse,
    CellPrediction,
    CellRecord,
    FixtureGrid,
    GridCell,
    GridMatchday,
    GridMeta,
    GridTeam,
    ModelNote,
    Prob,
)
from app.services.crests import safe_crest_url
from app.services.fixture_grid import date_confirmed, lens_scales, matchday_window, normalize_status, result_for
from app.services.odds_record import build_record
from app.services.rating_predictions import merge_recent_results, model_version, predict_both_sides
from app.services.timeutil import as_utc
from app.sources.football_data_org import MatchPayload

LEAGUES = {"PL": ("Premier League", "E0", 20), "BL1": ("Bundesliga", "D1", 18), "FL1": ("Ligue 1", "F1", 18)}
# Do not borrow Spain's learned calibration or odds blend. This is the exact reference
# architecture evaluated in the domestic replay, fitted independently per league.
REFERENCE = DixonColesConfig(xi=0.001, ridge=1.0, promoted_prior=0.0, spread=1.10)
# The configured feed returns "RC " for Strasbourg. Presentation override only; source ID remains 576.
CODE_OVERRIDES = {"FL1": {576: "STR"}}
HISTORY_ALIASES = {
    "AJ Auxerre": "Auxerre",
    "AS Monaco": "Monaco",
    "AS Monaco FC": "Monaco",
    "AS Saint-Étienne": "St Etienne",
    "Angers SCO": "Angers",
    "Clermont Foot 63": "Clermont",
    "FC Lorient": "Lorient",
    "FC Metz": "Metz",
    "FC Nantes": "Nantes",
    "LOSC Lille": "Lille",
    "Lille OSC": "Lille",
    "Le Havre AC": "Le Havre",
    "Le Mans FC": "Le Mans",
    "Montpellier Hérault SC": "Montpellier",
    "OGC Nice": "Nice",
    "Olympique Lyonnais": "Lyon",
    "Olympique Lyon": "Lyon",
    "Olympique de Marseille": "Marseille",
    "Paris Saint-Germain": "Paris SG",
    "Paris Saint-Germain FC": "Paris SG",
    "PSG": "Paris SG",
    "RC Lens": "Lens",
    "Racing Club de Lens": "Lens",
    "RC Strasbourg Alsace": "Strasbourg",
    "Stade Brestois 29": "Brest",
    "Stade Rennais F.C.": "Rennes",
    "Stade Rennais FC 1901": "Rennes",
    "Stade Rennais": "Rennes",
    "Stade de Reims": "Reims",
    "Toulouse FC": "Toulouse",
    "ES Troyes AC": "Troyes",
    "Arsenal FC": "Arsenal",
    "Aston Villa FC": "Aston Villa",
    "Brentford FC": "Brentford",
    "Chelsea FC": "Chelsea",
    "Coventry City FC": "Coventry",
    "Crystal Palace FC": "Crystal Palace",
    "Everton FC": "Everton",
    "Fulham FC": "Fulham",
    "Hull City AFC": "Hull",
    "Ipswich Town FC": "Ipswich",
    "Leeds United FC": "Leeds",
    "Liverpool FC": "Liverpool",
    "Manchester City FC": "Man City",
    "Manchester United FC": "Man United",
    "Newcastle United FC": "Newcastle",
    "Nottingham Forest FC": "Nott'm Forest",
    "Sunderland AFC": "Sunderland",
    "Tottenham Hotspur FC": "Tottenham",
    "AFC Bournemouth": "Bournemouth",
    "Brighton & Hove Albion": "Brighton",
    "Brighton & Hove Albion FC": "Brighton",
    "Brighton Hove": "Brighton",
    "Coventry City": "Coventry",
    "Hull City": "Hull",
    "Ipswich Town": "Ipswich",
    "Leeds United": "Leeds",
    "Manchester City": "Man City",
    "Manchester United": "Man United",
    "Man Utd": "Man United",
    "Newcastle United": "Newcastle",
    "Nottingham Forest": "Nott'm Forest",
    "Tottenham Hotspur": "Tottenham",
    "Spurs": "Tottenham",
    "West Ham United": "West Ham",
    "Wolverhampton Wanderers": "Wolves",
    "FC Bayern München": "Bayern Munich",
    "Borussia Mönchengladbach": "M'gladbach",
    "Borussia Dortmund": "Dortmund",
    "Bayer 04 Leverkusen": "Leverkusen",
    "Eintracht Frankfurt": "Ein Frankfurt",
    "1. FC Köln": "FC Koln",
    "1. FSV Mainz 05": "Mainz",
    "1. FC Union Berlin": "Union Berlin",
    "TSG Hoffenheim": "Hoffenheim",
    "TSG 1899 Hoffenheim": "Hoffenheim",
    "Sport-Club Freiburg": "Freiburg",
    "SC Freiburg": "Freiburg",
    "FC Augsburg": "Augsburg",
    "VfB Stuttgart": "Stuttgart",
    "Hamburger SV": "Hamburg",
    "FC Schalke 04": "Schalke 04",
    "SV Werder Bremen": "Werder Bremen",
    "SC Paderborn 07": "Paderborn",
    "SV Elversberg": "Elversberg",
    "SV 07 Elversberg": "Elversberg",
    "VfL Wolfsburg": "Wolfsburg",
    "VfL Bochum 1848": "Bochum",
    "1. FC Heidenheim 1846": "Heidenheim",
    "FC St. Pauli 1910": "St Pauli",
}


def history_name(ref, known: set[str]) -> str:
    # Literal source labels only: no suffix stripping or fuzzy club matching.
    labels = {n for n in (ref.name, ref.shortName) if n}
    candidates = {HISTORY_ALIASES.get(n, n) for n in labels} & known
    if len(candidates) == 1:
        return next(iter(candidates))
    raise ValueError(f"Club source ID {ref.id} needs an explicit history mapping")


def build_league_grid(
    code: str, payload: dict, history: pd.DataFrame, now: datetime, previous: ApiResponse[FixtureGrid] | None = None
) -> ApiResponse[FixtureGrid]:
    name, _, size = LEAGUES[code]
    if payload.get("competition", {}).get("code") != code:
        raise ValueError("Source competition does not match requested league")
    raw = payload.get("matches", [])
    matches = [MatchPayload.model_validate(r) for r in raw]
    refs = {ref.id: ref for m in matches for ref in (m.homeTeam, m.awayTeam)}
    pairs = [(m.homeTeam.id, m.awayTeam.id) for m in matches]
    seasons = {m.season.startDate for m in matches}
    expected = {(a, b) for a in refs for b in refs if a != b}
    round_clubs = defaultdict(list)
    for m in matches:
        round_clubs[m.matchday].extend([m.homeTeam.id, m.awayTeam.id])
    if (
        None in refs
        or len(refs) != size
        or len(matches) != size * (size - 1)
        or set(pairs) != expected
        or len({m.id for m in matches}) != len(matches)
        or len(seasons) != 1
        or None in seasons
        or len(round_clubs) != 2 * (size - 1)
        or any(len(clubs) != size or set(clubs) != set(refs) for clubs in round_clubs.values())
        or any(m.matchday is None or not 1 <= m.matchday <= 2 * (size - 1) for m in matches)
    ):
        raise ValueError("Incomplete or ambiguous full-league season; retaining previous board")
    start = next(iter(seasons)).year
    season = f"{start}/{(start + 1) % 100:02}"
    codes = {ident: CODE_OVERRIDES.get(code, {}).get(ident, (ref.tla or "").upper()) for ident, ref in refs.items()}
    if len(set(codes.values())) != size or any(not re.fullmatch(r"[A-Z0-9]{3}", value) for value in codes.values()):
        raise ValueError("Source club abbreviations must be present and unambiguous within the league")
    known = set(history["home"]) | set(history["away"])
    names = {}
    for ident, ref in refs.items():
        names[ident] = history_name(ref, known)
    if len(set(names.values())) != size:
        raise ValueError("Two source clubs map to the same historical club")
    recent = pd.DataFrame(
        [
            {
                "season_start": start,
                "date": pd.Timestamp(as_utc(m.utcDate).date()),
                "home": names[m.homeTeam.id],
                "away": names[m.awayTeam.id],
                "hg": m.score.fullTime.home,
                "ag": m.score.fullTime.away,
            }
            for m in matches
            if m.status == "FINISHED"
            and m.score.duration == "REGULAR"
            and m.score.fullTime.home is not None
            and m.score.fullTime.away is not None
            and as_utc(m.utcDate) < now
        ]
    )
    history = merge_recent_results(history, recent)
    history = history[history["date"] < pd.Timestamp(now.date())].copy()
    # Exclude known interrupted/administrative Bundesliga results, including a CSV's award.
    if code == "BL1":
        for day, home, away in [
            ("2024-12-14", "Union Berlin", "Bochum"),
            ("2022-03-18", "Bochum", "M'gladbach"),
            ("2011-04-01", "St Pauli", "Schalke 04"),
        ]:
            history = history[
                ~((history["date"] == pd.Timestamp(day)) & (history["home"] == home) & (history["away"] == away))
            ]
    if code == "FL1":
        history = history[
            ~(
                (history["date"] == pd.Timestamp("2025-03-16"))
                & (history["home"] == "Montpellier")
                & (history["away"] == "St Etienne")
            )
        ]
    from app.backtest.data import promoted_from_fixtures

    promoted = promoted_from_fixtures(names.values(), history, start)
    model = fit_dixon_coles(
        history, pd.Timestamp(now.date()), teams=list(names.values()), promoted=promoted, config=REFERENCE
    )
    record = build_record(history, start)
    version = f"{code}:{model_version(REFERENCE)}"
    old = {}
    if previous and previous.data and previous.data.season == season and previous.data.competition == code:
        identities = {t.code: t.source_id for t in previous.data.teams}
        for team in previous.data.teams:
            for column in team.cells:
                for cell in column:
                    timestamp = cell.forecast_at or (previous.meta.last_predicted_at if previous.meta else None)
                    old[team.source_id, cell.fixture_id, identities.get(cell.opponent_code), cell.venue] = (
                        cell,
                        timestamp,
                    )
    by_round = defaultdict(list)
    for m in matches:
        by_round[m.matchday].append(m)
    rounds = []
    centres = {}
    for number, rows in sorted(by_round.items()):
        lo, hi, centre = matchday_window([m.utcDate for m in rows])
        centres[number] = centre
        core = [m for m in rows if abs(as_utc(m.utcDate) - centre).days <= 4] or rows
        rounds.append(
            GridMatchday(
                number=number,
                date_from=lo,
                date_to=hi,
                finished=all(normalize_status(m.status) in {"finished", "postponed"} for m in core),
            )
        )
    cells = {ident: [[] for _ in rounds] for ident in refs}
    columns = {r.number: i for i, r in enumerate(rounds)}
    for m in matches:
        status = normalize_status(m.status)
        kickoff = as_utc(m.utcDate)
        fresh = (
            predict_both_sides(model, names[m.homeTeam.id], names[m.awayTeam.id], record=record)
            if m.status in {"SCHEDULED", "TIMED"} and kickoff > now
            else None
        )
        for ident, other, venue in [(m.homeTeam.id, m.awayTeam.id, "H"), (m.awayTeam.id, m.homeTeam.id, "A")]:
            pred = None
            forecast_at = None
            record_view = None
            if m.status in {"SCHEDULED", "TIMED"} and kickoff > now:
                hp, ap = fresh
                p = hp if venue == "H" else ap
                pred = CellPrediction(
                    difficulty=round(p.difficulty_score, 1),
                    label=p.difficulty_label,
                    bucket=["Very favourite", "Favourite", "Even", "Underdog", "Big underdog"].index(p.difficulty_label)
                    + 1,
                    expected_points=round(p.expected_points, 3),
                    probabilities=Prob(win=p.p_win, draw=p.p_draw, loss=p.p_loss),
                    clean_sheet=p.p_clean_sheet,
                    xg_for=p.xg_for,
                    xg_against=p.xg_against,
                    both_score=p.p_both_score,
                )
                forecast_at = now
                if isinstance(p.explanation.get("record"), dict):
                    record_view = CellRecord.model_validate(p.explanation["record"])
            elif status in {"finished", "live"}:
                prior = old.get((ident, m.id, other, venue))
                if prior and prior[1] and as_utc(prior[1]) < kickoff:
                    pred = prior[0].prediction
                    forecast_at = prior[1]
                    record_view = prior[0].record
            goals = m.score.fullTime
            gf, ga = (goals.home, goals.away) if venue == "H" else (goals.away, goals.home)
            cells[ident][columns[m.matchday]].append(
                GridCell(
                    fixture_id=m.id,
                    opponent_code=codes[other],
                    venue=venue,
                    kickoff_utc=kickoff,
                    date_confirmed=date_confirmed(m.status),
                    rescheduled=abs(kickoff - centres[m.matchday]).days > 4,
                    status=status,
                    result=result_for(gf, ga) if status == "finished" else None,
                    prediction=pred,
                    forecast_at=forecast_at,
                    record=record_view,
                )
            )
    teams = [
        GridTeam(
            code=codes[ident],
            source_id=ident,
            history_name=names[ident],
            name=ref.shortName or ref.name,
            color="#596579",
            crest_url=safe_crest_url(ref.crest),
            cells=cells[ident],
        )
        for ident, ref in refs.items()
    ]
    grid = FixtureGrid(
        competition=code,
        season=season,
        current_matchday=next((r.number for r in rounds if not r.finished), None),
        model_version=version,
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
                    text=f"{name}: independently fitted reference model. Clean-sheet probabilities are uncalibrated; no live market blend or player xScore. Historical replay does not establish a better replacement.",
                )
            ],
        ),
    )
