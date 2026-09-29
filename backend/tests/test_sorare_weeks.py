"""Which gameweeks a run knows about: the whole season so far, not the last few."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from app.sorare import publish, sync
from tests.test_sorare_publish import AHEAD_GW, PAST_GW, PLAN_GW, snapshot


def fixture(number: int, start: datetime, name: str | None = None) -> dict[str, Any]:
    """A gameweek the way Sorare's list returns it (`gameWeek` is the running count, the name restarts each season)."""
    return {
        "slug": f"gw-{name or number}-{start:%Y-%m-%d}",
        "gameWeek": 700 + number,
        "displayName": name or f"Game Week {number}",
        "aasmState": "closed",
        "startDate": start.isoformat(),
        "endDate": (start + timedelta(days=3)).isoformat(),
        "cutOffDate": start.isoformat(),
    }


class FakeSorare:
    """Sorare's gameweek list: newest first, `first` at a time, with a cursor to the next page."""

    def __init__(self, nodes: list[dict[str, Any]]) -> None:
        self.nodes = sorted(nodes, key=lambda n: n["startDate"], reverse=True)
        self.pages = 0

    def query(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        variables = variables or {}
        self.pages += 1
        first = int(variables.get("first", 14))
        offset = int(variables["after"]) if variables.get("after") else 0
        page = self.nodes[offset : offset + first]
        more = offset + first < len(self.nodes)
        return {
            "so5": {
                "so5Fixtures": {
                    "pageInfo": {"hasNextPage": more, "endCursor": str(offset + first) if more else None},
                    "nodes": page,
                }
            }
        }


def season() -> list[dict[str, Any]]:
    """Last season's tail (numbers 93 to 95), then this season from Game Week 1 to 20, every three days."""
    start = datetime(2026, 7, 31, 14, tzinfo=UTC)
    this = [fixture(n, start + timedelta(days=3 * (n - 1))) for n in range(1, 21)]
    last = [fixture(n, start - timedelta(days=3 * (96 - n))) for n in (93, 94, 95)]
    return last + this


def test_the_list_goes_back_to_this_seasons_first_gameweek_and_no_further() -> None:
    client = FakeSorare(season())
    weeks = sync.gameweeks(client, page=8)  # type: ignore[arg-type]

    assert [w["number"] for w in weeks] == list(range(1, 21)), "last season's Game Weeks 93 to 95 are not this season's"
    assert weeks == sorted(weeks, key=lambda w: w["start"])
    assert client.pages == 3, "20 weeks at 8 a page: it stops once Game Week 1 has been seen"


def test_a_season_shorter_than_one_page_takes_one_call() -> None:
    client = FakeSorare([fixture(n, datetime(2026, 7, 31, tzinfo=UTC) + timedelta(days=3 * n)) for n in range(1, 6)])
    weeks = sync.gameweeks(client, page=30)  # type: ignore[arg-type]
    assert len(weeks) == 5
    assert client.pages == 1


def test_it_gives_up_paging_rather_than_run_away() -> None:
    # No Game Week 1 anywhere (a schema change, say): it reads a few pages and stops with what it has.
    client = FakeSorare([fixture(n, datetime(2026, 1, 1, tzinfo=UTC) + timedelta(days=3 * n)) for n in range(2, 60)])
    weeks = sync.gameweeks(client, page=5, max_pages=3)  # type: ignore[arg-type]
    assert len(weeks) == 15
    assert client.pages == 3


def test_only_recent_and_coming_weeks_are_worth_counting_games_for() -> None:
    now = datetime(2026, 9, 29, 12, tzinfo=UTC)

    def ended(days_ago: float, number: int) -> dict[str, Any]:
        return {"number": number, "end": (now - timedelta(days=days_ago)).isoformat()}

    weeks = [ended(100, 1), ended(46, 2), ended(44, 3), ended(2, 4), ended(-3, 5)]  # the last ends in three days
    assert [w["number"] for w in sync.recent_weeks(weeks, now)] == [3, 4, 5], "the last 45 days and everything after"


# --------------------------------------------------------------------------- what the app is told
def test_every_finished_week_of_the_season_stays_in_the_timeline() -> None:
    snap = snapshot()
    old = [
        {
            **PAST_GW,
            "slug": f"gw-old-{n}",
            "number": n,
            "start": f"2026-08-{7 + n:02d}T14:00:00+00:00",
            "end": f"2026-08-{9 + n:02d}T14:00:00+00:00",
            "lock": f"2026-08-{7 + n:02d}T14:00:00+00:00",
        }
        for n in range(3, 8)
    ]
    snap["gameweeks"] = [*old, PAST_GW, PLAN_GW, AHEAD_GW]
    timeline = publish.build_payload(snap, runs=2, draws=200)["timeline"]

    by_number = {item["number"]: item["status"] for item in timeline}
    assert all(by_number[n] == "done" for n in range(3, 8)), "a week played a month ago is still a week"
    assert by_number[15] == "done" and by_number[21] == "next"
    assert [item["number"] for item in timeline] == sorted(by_number), "oldest first"


def test_a_week_far_ahead_is_still_left_out_of_the_timeline() -> None:
    snap = snapshot()
    far = {
        **AHEAD_GW,
        "slug": "gw-far",
        "number": 30,
        "start": "2026-12-20T14:00:00+00:00",
        "end": "2026-12-24T14:00:00+00:00",
        "lock": "2026-12-20T14:00:00+00:00",
    }
    snap["gameweeks"] = [PAST_GW, PLAN_GW, AHEAD_GW, far]
    timeline = publish.build_payload(snap, runs=2, draws=200)["timeline"]
    assert 30 not in {item["number"] for item in timeline}


def test_form_is_read_for_every_laliga_player_because_an_early_plan_needs_it() -> None:
    def row(slug: str, league: str | None, games: bool) -> dict[str, Any]:
        club = {"domesticLeague": {"slug": league}} if league else None
        return {
            "player": {"slug": slug, "activeClub": club, "plan": [{"id": 1}] if games else [], "past": [], "a0": []}
        }

    rows = [
        row("plays", "laliga-es", True),
        row(
            "idle-in-laliga", "laliga-es", False
        ),  # no game in a gameweek Sorare has opened: an early plan may still use him
        row("idle-abroad", "premier-league-gb-eng", False),
        row("national-team-only", None, True),
        row("plays", "laliga-es", True),  # the same player on a second card
    ]
    assert sync.history_players(rows, ("plan", "past", "a0")) == ["idle-in-laliga", "national-team-only", "plays"]
