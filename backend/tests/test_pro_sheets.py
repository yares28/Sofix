"""The Pro teamsheet watch (plans/pro-page.md, "Teamsheet watch"): Sorare's announced elevens re-plan the Pro week, the refresh
keeps them, and the watch list tells the clock which games to look at and which sides are already applied."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from app.jobs.pro_sheets import replan
from app.sorare import pro, pro_sheets
from app.sorare.client import SorareError
from app.sorare.publish import in_week, pro_week
from tests.test_sorare_planner import card, forecasts_for
from tests.test_sorare_pro import LALIGA

NOW = datetime.fromisoformat("2026-11-28T14:00:00+00:00")
KICKOFF = "2026-11-28T15:00:00+00:00"
GAME = "Game:00000000-0000-0000-0000-000000000001"


def eleven(starters: list[str], bench: list[str] = ()) -> dict:
    rows = [[{"slug": s} for s in starters[:1]], [{"slug": s} for s in starters[1:]]]
    return {"startingLineupAvailable": True, "startingLineup": rows, "bench": [{"slug": s} for s in bench]}


def filler(n: int, prefix: str) -> list[str]:
    return [f"{prefix}-{i}" for i in range(n)]


def squad():
    cards = [card(f"a{i}", pos) for i, pos in enumerate(("GK", "DEF", "MID", "FWD", "DEF", "DEF"))]
    games = {
        c.player: [{"id": GAME, "kickoff": KICKOFF, "competition": "laliga-es", "teamSlug": "club-a", "venue": "H"}]
        for c in cards
    }
    forecasts = {
        p: replace(f, start=80.0, on=20.0, benched_on=0.4, p_start=0.7)
        for p, f in forecasts_for(cards, p=0.8, mu=70.0).items()
    }
    return cards, games, forecasts


def announced(starters: list[str], bench: list[str] = ()) -> pro_sheets.Sheet:
    game = {
        "homeTeam": {"slug": "club-a"},
        "awayTeam": {"slug": "club-b"},
        "homeFormation": eleven(starters + filler(11 - len(starters), "x"), bench),
        "awayFormation": {"startingLineupAvailable": False, "startingLineup": [], "bench": []},
    }
    sheet = pro_sheets.sheet_of(game, NOW)
    assert sheet is not None
    return sheet


def test_a_side_counts_only_once_sorare_has_all_eleven():
    full = {"homeTeam": {"slug": "h"}, "awayTeam": {"slug": "a"}, "homeFormation": eleven(filler(11, "h"), ["h-b"])}
    sheet = pro_sheets.sheet_of({**full, "awayFormation": eleven(filler(10, "a"))}, NOW)
    assert sheet is not None and sheet["sides"] == 1 and set(sheet["teams"]) == {"h"}
    assert sheet["teams"]["h"]["bench"] == ["h-b"] and len(sheet["teams"]["h"]["starters"]) == 11
    unannounced = {"startingLineupAvailable": False, "startingLineup": [], "bench": []}
    assert pro_sheets.sheet_of({**full, "homeFormation": unannounced, "awayFormation": unannounced}, NOW) is None
    assert pro_sheets.sheet_of(None, NOW) is None


def test_only_games_from_75_minutes_before_kickoff_to_kickoff_are_due():
    games = {
        "p": [
            {"id": "soon", "kickoff": "2026-11-28T15:15:00+00:00"},  # 75 minutes: the first look
            {"id": "later", "kickoff": "2026-11-28T15:16:00+00:00"},
            {"id": "started", "kickoff": "2026-11-28T14:00:00+00:00"},
        ]
    }
    assert pro_sheets.due(games, NOW) == ["soon"]


def test_a_game_sorare_does_not_answer_stays_not_announced():
    def query(_q, variables):
        if variables["id"] == "bad":
            raise SorareError("rate limited")
        return {
            "anyGame": {"homeTeam": {"slug": "h"}, "awayTeam": {"slug": "a"}, "homeFormation": eleven(filler(11, "h"))}
        }

    got = pro_sheets.read(query, ["bad", "good"], NOW)
    assert list(got) == ["good"]


def test_the_elevens_decide_who_starts_and_leave_unannounced_teams_alone():
    cards, games, forecasts = squad()
    games["a5"] = [{**games["a5"][0], "teamSlug": "club-b"}]  # the other side, not out yet
    sheet = announced(["a0", "a1", "a2", "a3"], bench=["a4"])
    got = pro_sheets.apply(forecasts, games, {GAME: sheet})
    assert (got["a0"].p_start, got["a0"].p_play, got["a0"].mu) == (1.0, 1.0, 80.0)  # starts, at his score if he does
    assert (got["a4"].p_start, got["a4"].p_play, got["a4"].mu) == (
        0.0,
        0.4,
        20.0,
    )  # benched: only his chance of coming on
    assert got["a5"] == forecasts["a5"]
    # a player of an announced team on neither list plays no part
    gone = pro_sheets.apply(forecasts, games, {GAME: announced(["a0"])})
    assert (gone["a1"].p_start, gone["a1"].p_play) == (0.0, 0.0)


def test_a_benched_player_leaves_the_pro_lineup_and_the_week_keeps_the_sheet():
    cards, games, forecasts = squad()
    comps = pro.competitions([LALIGA])
    sheet = announced(["a0", "a1", "a2", "a3", "a5"], bench=["a4"])
    boards, extra = pro_week(comps, in_week(cards, games), forecasts, games, {}, {GAME: sheet})
    (board,) = boards
    starters = {s["player"] for s in board["byBatch"][0]["starters"]}
    assert "a4" not in starters and "a5" in starters
    assert all(c["player"] != "a4" for c in board["batches"][0]["cards"])  # benched: not a starter of the batch
    assert board["byBatch"][0]["starters"][0]["fixture"]["id"] == GAME
    assert extra["sheets"] == {GAME: sheet}
    # the job plans again on the forecasts before the sheets, never on sheets applied twice
    assert extra["_inputs"]["forecasts"]["a4"]["p_start"] == 0.7


def test_inputs_come_back_as_they_were_planned_on():
    cards, games, forecasts = squad()
    comps = pro.competitions([LALIGA])
    history = {
        "a0": [{"date": f"2026-11-{d:02d}", "status": "FINAL", "score": 40 + d, "mins": 90} for d in range(1, 9)]
    }
    saved = pro_sheets.inputs(comps, in_week(cards, games), forecasts, games, history)
    got_comps, got_cards, got_forecasts, got_games, got_history = pro_sheets.load(saved)
    assert [c.key for c in got_comps] == [c.key for c in comps]
    assert {c.slug for c in got_cards} == {c.slug for c in cards}
    assert got_forecasts["a0"].start == 80.0 and got_forecasts["a0"].benched_on == 0.4
    assert [h["score"] for h in got_history["a0"]] == [44, 45, 46, 47, 48]
    before, _ = pro_week(comps, in_week(cards, games), forecasts, games, history, {})
    after, _ = pro_week(got_comps, in_week(got_cards, got_games), got_forecasts, got_games, got_history, {})
    assert after == before


def block_and_inputs():
    cards, games, forecasts = squad()
    comps = pro.competitions([LALIGA])
    boards, extra = pro_week(comps, in_week(cards, games), forecasts, games, {}, {})
    week = {"slug": "wk", "number": 35, "boards": boards, "sheets": extra["sheets"], "leftovers": [1]}
    return {"version": 1, "builtAt": "b", "weeks": [week]}, {"weeks": {"wk": extra["_inputs"]}}


def test_the_job_replans_only_a_week_with_an_announced_game():
    block, saved = block_and_inputs()
    same, changed = replan(block, saved, lambda ids: {}, NOW)
    assert changed == 0 and same == block

    asked: list[list[str]] = []

    def read(ids):
        asked.append(ids)
        return {GAME: announced(["a0", "a1", "a2", "a3", "a5"], bench=["a4"])}

    new, changed = replan(block, saved, read, NOW)
    assert changed == 1 and asked == [[GAME]]
    (week,) = new["weeks"]
    assert week["leftovers"] == [1] and GAME in week["sheets"] and "_inputs" not in week
    assert "a4" not in {s["player"] for s in week["boards"][0]["byBatch"][0]["starters"]}

    # a later look Sorare does not answer keeps the reading the week already has
    again, _ = replan(new, saved, lambda ids: {"Game:other": announced(["zz"])}, NOW)
    assert GAME in again["weeks"][0]["sheets"]


def test_the_watch_lists_games_to_come_and_the_sides_already_applied():
    block, _ = block_and_inputs()
    block["weeks"][0]["sheets"] = {
        GAME: {"at": "t", "sides": 1, "teams": {}},
        "Game:gone": {"at": "t", "sides": 2, "teams": {}},
    }
    got = pro_sheets.watch(block, NOW)
    assert got["games"] == [{"id": GAME, "kickoff": KICKOFF}]
    assert got["applied"] == {GAME: 1}
    assert pro_sheets.watch(block, datetime.fromisoformat("2026-11-28T16:00:00+00:00"))["games"] == []
