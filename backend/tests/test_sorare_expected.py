"""The LaLiga competitions Sorare is going to open: when a week gets them, and which finished week they are copied from (R3)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.sorare import expected, projection, publish, sync
from tests.test_pipeline import db  # noqa: F401  (fixture)
from tests.test_sorare_projection import FCB, RMA, at, early_snapshot, match, with_templates
from tests.test_sorare_publish import competition

NOW = datetime(2026, 10, 1, 12, tzinfo=UTC)


def week(number: int, end: str, laliga: int | None, **extra: Any) -> dict[str, Any]:
    out: dict[str, Any] = {
        "slug": f"gw-{number}",
        "number": number,
        "name": f"Game Week {number}",
        "end": end,
        "start": end,
    }
    if laliga is not None:
        out["laliga"] = laliga
    return {**out, **extra}


def test_a_week_is_full_from_five_laliga_games_and_thin_below() -> None:
    # Measured on gameweeks 1 to 21 of 2026/27: Champion opened in all 8 weeks with 5 or more LaLiga games and in none of the 3 with fewer.
    assert [expected.band(n) for n in (1, 4, 5, 10)] == ["thin", "thin", "full", "full"]


def test_a_week_needs_a_laliga_game_to_get_laliga_competitions() -> None:
    # Measured: LaLiga's competitions opened in all 11 gameweeks that had a LaLiga game, and in none of the 10 that had none.
    assert [expected.gets_laliga(n) for n in (0, 1, 2, 10)] == [False, True, True, True]


def test_the_template_of_each_kind_of_week_is_the_latest_finished_one_of_that_kind() -> None:
    done = [
        week(10, "2026-09-04T13:00:00+00:00", 1),  # thin
        week(12, "2026-09-11T13:00:00+00:00", 0),  # no LaLiga game: no template
        week(14, "2026-09-18T13:00:00+00:00", 8),  # full
        week(15, "2026-09-22T13:00:00+00:00", 10),  # full, the latest
        week(16, "2026-09-25T13:00:00+00:00", 0),
        week(18, "2026-10-02T13:00:00+00:00", 2),  # thin but not finished yet at NOW
    ]

    picked = expected.pick_templates(done, NOW)

    assert picked["full"]["number"] == 15
    assert picked["thin"]["number"] == 10, "week 18 has not finished"


def test_a_week_with_no_count_is_not_a_template() -> None:
    assert expected.pick_templates([week(3, "2026-08-11T13:00:00+00:00", None)], NOW) == {}


def test_only_the_competitions_that_count_laliga_games_are_kept() -> None:
    la_liga = competition("LALIGA EA SPORTS", "Limited", leagues=["laliga-es"])
    all_star = competition("All Star", "Limited", size=7, in_season=False, leagues=["laliga-es", "eredivisie"])
    premier = competition("English League Players", "Limited", leagues=["premier-league-gb-eng"])
    skipped = {**competition("Under 23", "Limited", leagues=["laliga-es"]), "skipped": "no cards in this league"}
    raw = [
        {**la_liga, "leagueCompetitions": ["laliga-es"]},
        {**all_star, "leagueCompetitions": ["laliga-es", "eredivisie"]},
        {**premier, "leagueCompetitions": ["premier-league-gb-eng"]},
        {**skipped, "leagueCompetitions": ["laliga-es"]},
    ]

    assert [c["league"] for c in expected.laliga_competitions(raw)] == ["LALIGA EA SPORTS", "All Star"]


class _Client:
    """Sorare's answers for the template weeks, counting what was asked."""

    def __init__(self) -> None:
        self.asked: list[str] = []
        self.errors = 0
        self.calls = 0


def test_a_cached_template_is_not_fetched_again(monkeypatch) -> None:
    client = _Client()
    fetched: list[str] = []

    def fake_competitions(_client: Any, fixture: str, leagues: Any, keep_all: bool = False) -> list[dict[str, Any]]:
        fetched.append(fixture)
        return [
            {**competition("LALIGA EA SPORTS", "Limited", leagues=["laliga-es"]), "leagueCompetitions": ["laliga-es"]}
        ]

    monkeypatch.setattr(sync, "competitions", fake_competitions)
    done = [week(14, "2026-09-18T13:00:00+00:00", 8), week(15, "2026-09-22T13:00:00+00:00", 10)]

    first = sync.expected_templates(client, done, NOW, {"laliga-es"}, None)  # type: ignore[arg-type]
    assert fetched == ["gw-15"] and first["full"]["number"] == 15 and first["full"]["laliga"] == 10
    assert [c["league"] for c in first["full"]["competitions"]] == ["LALIGA EA SPORTS"]

    again = sync.expected_templates(client, done, NOW, {"laliga-es"}, first)  # type: ignore[arg-type]
    assert fetched == ["gw-15"], "the stored one is used"
    assert again == first

    newer = [*done, week(17, "2026-09-29T13:00:00+00:00", 10)]
    sync.expected_templates(client, newer, NOW, {"laliga-es"}, first)  # type: ignore[arg-type]
    assert fetched == ["gw-15", "gw-17"], "a week that finished since replaces it"


# ------------------------------------------------------------------------------------------------ the plans
def a_round(number: int, games: int, first: str = "2026-10-31") -> projection.Round:
    extra = [projection.Side(f"X{i}", f"Club {i}", None) for i in range(2 * games)]
    matches = [match(at(first), FCB, RMA)] + [
        match(at(first), extra[2 * i], extra[2 * i + 1]) for i in range(games - 1)
    ]
    return projection.Round(number, tuple(matches))


def early(snap: dict[str, Any], *rounds: projection.Round) -> list[dict[str, Any]]:
    return publish.projected_weeks(snap, list(rounds), runs=2, draws=100)


def test_the_early_plan_of_a_full_round_has_the_competitions_sorare_is_going_to_open() -> None:
    week = early(with_templates(early_snapshot()), a_round(11, 10))[0]

    assert [o["name"] for o in week["playable"]] and all(
        o["expected"] and o["expectedFrom"] == "GW15" for o in week["playable"]
    )
    assert {o["key"] for o in week["playable"]} == {"LALIGA EA SPORTS | Limited", "Champion | Limited"}
    lineups = [lu for plan in week["plans"] for lu in plan["lineups"]]
    assert lineups and all(lu["expected"] is True and lu["needFrom"] == "GW15" for lu in lineups)
    assert week["projected"] == {"round": 11, "basedOn": "GW15", "expected": True}


def test_a_round_gets_the_competitions_of_its_own_kind_of_week_or_none() -> None:
    snap = with_templates(early_snapshot(), full=True, thin=False)
    thin_round = early(snap, a_round(12, 2))[0]
    assert thin_round["playable"] == [] and thin_round["plans"] == []
    assert thin_round["projected"] == {"round": 12, "basedOn": "", "expected": False}, "no thin week to copy yet"

    both = with_templates(early_snapshot(), full=True, thin=True)
    thin = early(both, a_round(12, 2))[0]
    assert [o["key"] for o in thin["playable"]] == ["LALIGA EA SPORTS | Limited"], "Champion needs five LaLiga games"
    assert thin["projected"]["basedOn"] == "GW10"


def test_the_open_weeks_competitions_are_not_borrowed_when_there_is_nothing_of_its_kind_to_copy() -> None:
    snap = with_templates(early_snapshot())  # the open week lists LALIGA EA SPORTS, All Star and Under 23
    week = early(snap, a_round(40, 1))[0]  # one game, no thin week to copy
    assert week["playable"] == [] and week["projected"]["expected"] is False


def test_a_week_sorare_has_opened_without_its_laliga_competitions_gets_the_expected_ones_beside_the_official() -> None:
    snap = with_templates(early_snapshot())
    snap["planGameweek"] = {**snap["planGameweek"], "laliga": 10}
    snap["gameweeks"] = [snap["pastGameweek"], snap["planGameweek"], *snap["aheadGameweeks"]]
    snap["competitions"] = {
        **snap["competitions"],
        "gw-plan": [competition("All Star", "Limited", size=7, in_season=False)],
    }

    week = publish.week_of(publish.build_payload(snap, runs=2, draws=100))

    assert week is not None
    official = [o for o in week["playable"] if "expected" not in o]
    expected_ones = [o for o in week["playable"] if o.get("expected")]
    assert [o["key"] for o in official] == ["All Star | Limited"]
    assert {o["key"] for o in expected_ones} == {"LALIGA EA SPORTS | Limited", "Champion | Limited"}
    cards = [c["slug"] for plan in week["plans"] for lu in plan["lineups"] for c in (*lu["starters"], *lu["subs"])]
    for plan in week["plans"]:
        in_plan = [c["slug"] for lu in plan["lineups"] for c in (*lu["starters"], *lu["subs"])]
        assert len(in_plan) == len(set(in_plan)), "one card is never in two lineups of a plan, official or expected"
    assert cards


def test_when_sorare_lists_its_laliga_competitions_the_expected_ones_are_gone() -> None:
    snap = with_templates(early_snapshot())
    snap["planGameweek"] = {**snap["planGameweek"], "laliga": 10}  # snapshot() lists LALIGA EA SPORTS for gw-plan

    week = publish.week_of(publish.build_payload(snap, runs=2, draws=100))

    assert week is not None
    assert all("expected" not in o for o in week["playable"]), "never shown twice"
    assert [o["key"] for o in week["playable"]].count("LALIGA EA SPORTS | Limited") == 1
    assert all("expected" not in lu for plan in week["plans"] for lu in plan["lineups"])


def test_a_week_with_no_laliga_game_gets_no_expected_competition() -> None:
    snap = with_templates(early_snapshot())
    snap["planGameweek"] = {**snap["planGameweek"], "laliga": 0}
    snap["competitions"] = {
        **snap["competitions"],
        "gw-plan": [competition("All Star", "Limited", size=7, in_season=False)],
    }

    week = publish.week_of(publish.build_payload(snap, runs=2, draws=100))

    assert week is not None and all("expected" not in o for o in week["playable"])


def test_a_template_sorare_does_not_answer_for_keeps_the_one_read_before(monkeypatch) -> None:
    def broken(*args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        raise sync.SorareError("down")

    monkeypatch.setattr(sync, "competitions", broken)
    before = {
        "full": {"slug": "gw-14", "number": 14, "name": "Game Week 14", "laliga": 8, "competitions": [{"league": "x"}]}
    }
    done = [week(14, "2026-09-18T13:00:00+00:00", 8), week(15, "2026-09-22T13:00:00+00:00", 10)]

    kept = sync.expected_templates(_Client(), done, NOW, {"laliga-es"}, before)  # type: ignore[arg-type]

    assert kept == before, "the older week stands in until the newer one can be read"
    assert sync.expected_templates(_Client(), done, NOW, {"laliga-es"}, None) == {}  # type: ignore[arg-type]


def test_the_job_keeps_the_templates_between_runs(db, monkeypatch) -> None:  # noqa: F811
    from app.jobs import sorare as sorare_job
    from app.models import ReadModel

    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.setattr(sorare_job.settings, "sorare_api_key", "test-key")
    monkeypatch.setattr(sorare_job.understat, "fetch_leagues", lambda *a, **k: {})

    class Client:
        def __enter__(self) -> Client:
            return self

        def __exit__(self, *exc: object) -> None:
            return None

    monkeypatch.setattr(sorare_job, "SorareClient", lambda *a, **k: Client())
    snap = with_templates(early_snapshot(), full=True, thin=True)
    snap["fetchedAt"] = datetime.now(UTC).isoformat()
    asked: list[Any] = []

    def snapshot(*args: Any, **kwargs: Any) -> dict[str, Any]:
        asked.append(kwargs.get("cached_templates"))
        return snap

    monkeypatch.setattr(sorare_job.sorare_sync, "snapshot", snapshot)
    monkeypatch.setattr(sorare_job.projection, "calendar", lambda db, now: [])

    sorare_job.run(db, "yares", runs=1)
    row = db.get(ReadModel, sorare_job.TEMPLATES_KEY)
    assert row is not None and set(row.payload) == {"full", "thin"}

    written = row.updated_at
    sorare_job.run(db, "yares", runs=1)
    assert asked[0] == {} and asked[1] == snap["expected"], "the second run is given what the first one kept"
    again = db.get(ReadModel, sorare_job.TEMPLATES_KEY)
    assert again is not None and again.updated_at == written, "and writes nothing when nothing changed"
