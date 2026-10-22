"""European source completeness is independent of model eligibility."""

from copy import deepcopy
from datetime import UTC, datetime

import httpx
import pytest

from app.research import european_data as data


def match(ident="m1", **changes):
    row = {
        "id": ident,
        "competition": {"id": "1", "code": "UCL", "sex": "MALE", "teamCategory": "CLUB"},
        "seasonYear": "2027",
        "competitionPhase": "TOURNAMENT",
        "round": {"id": "round", "phase": "TOURNAMENT", "mode": "GROUP", "metaData": {"type": "GROUP_STANDINGS"}},
        "homeTeam": {"id": "h", "internationalName": "Home", "isPlaceHolder": False},
        "awayTeam": {"id": "a", "internationalName": "Away", "isPlaceHolder": False},
        "status": "FINISHED",
        "kickOffTime": {"date": "2026-10-20", "dateTime": "2026-10-20T19:00:00Z"},
        "score": {"regular": {"home": 0, "away": 0}, "total": {"home": 1, "away": 0}},
    }
    row.update(changes)
    return row


@pytest.mark.parametrize("key,value", [("id", "14"), ("code", "UEL"), ("sex", "FEMALE"), ("teamCategory", "NATIONAL")])
def test_rejects_wrong_exact_population(key, value):
    row = match()
    row["competition"][key] = value
    with pytest.raises(ValueError, match="competition"):
        data.validate_page([row], "CL", 2026)


def test_rejects_wrong_edition_and_duplicate_ids():
    with pytest.raises(ValueError, match="season"):
        data.validate_page([match(seasonYear="2026")], "CL", 2026)
    with pytest.raises(ValueError, match="Repeated"):
        data.validate_page([match(), match()], "CL", 2026)


def test_preserves_zero_missing_extra_time_and_unreviewed_status():
    row = data.inventory_match(match(), "CL", 2026)
    assert row["reportedRegular"] == {"home": 0, "away": 0}
    assert row["reportedTotal"] == {"home": 1, "away": 0}
    assert row["score90"] is None and row["modelEligible"] is False
    raw = match(score={"total": {"home": 0, "away": 0}}, status="ABANDONED")
    assert data.inventory_match(raw, "CL", 2026)["reportedRegular"] == {"home": None, "away": None}
    assert data.inventory_match(raw, "CL", 2026)["status"] == "ABANDONED"


@pytest.mark.parametrize("value", [True, -1, 1.5, "1"])
def test_rejects_non_goal_values_without_coercion(value):
    with pytest.raises(ValueError, match="goal"):
        data.inventory_match(match(score={"regular": {"home": value}}), "CL", 2026)


def test_phase_placeholder_kickoff_and_venue_are_never_inferred():
    raw = match(kickOffTime={"date": "2026-10-20"})
    raw["awayTeam"] = {"id": "slot", "isPlaceHolder": True}
    raw["round"]["phase"] = "QUALIFYING"
    row = data.inventory_match(raw, "CL", 2026)
    assert row["phase"] == "unresolved" and row["kickoff"] is None and row["away"] is None
    assert row["neutral"] is None and row["stadium"] is None
    raw.pop("competitionPhase")
    assert data.inventory_match(raw, "CL", 2026)["phase"] == "qualifying"


def test_one_club_identity_across_competitions_and_no_domestic_round_robin():
    raw = match()
    cl = data.inventory_match(raw, "CL", 2026)
    raw["competition"].update(id="14", code="UEL")
    el = data.inventory_match(raw, "EL", 2026)
    assert cl["home"] == el["home"] == "uefa:h"
    assert cl["id"] == el["id"] == "uefa:m1"


def test_club_connection_follows_every_cursor_and_does_not_assume_36_or_50():
    calls = []

    def query(text, variables):
        calls.append(variables)
        more = variables["after"] is None
        return {
            "football": {
                "competition": {
                    "slug": data.COMPETITIONS["CL"].sorare,
                    "teams": {
                        "nodes": [{"slug": "a" if more else "b", "name": "Club"}],
                        "pageInfo": {"hasNextPage": more, "endCursor": "next" if more else None},
                    },
                }
            }
        }

    assert [r["slug"] for r in data.sorare_clubs(query, "CL")] == ["a", "b"]
    assert len(calls) == 2 and "pageInfo" in data.CLUBS_QUERY and calls[1]["after"] == "next"


def test_stuck_club_cursor_fails_instead_of_accepting_partial_coverage():
    def query(*args):
        return {
            "football": {
                "competition": {
                    "slug": data.COMPETITIONS["CL"].sorare,
                    "teams": {
                        "nodes": [{"slug": "a"}],
                        "pageInfo": {"hasNextPage": True, "endCursor": "same"},
                    },
                }
            }
        }

    with pytest.raises(ValueError, match="Repeated|cursor"):
        data.sorare_clubs(query, "CL")


def test_source_pages_are_bounded_cached_and_retained_on_limits(tmp_path):
    calls = []

    def respond(request):
        calls.append(request)
        return httpx.Response(200, json=[match()])

    now = datetime(2026, 10, 23, tzinfo=UTC)
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        first = data.fetch_inventory(client, "CL", 2026, tmp_path, now=now)
        second = data.fetch_inventory(client, "CL", 2026, tmp_path, now=now)
    assert first == second and len(calls) == 1 and first["paginationComplete"] is True
    snapshot = tmp_path / "CL-2026-manifest.json"
    before = snapshot.read_bytes()
    with (
        httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(429))) as client,
        pytest.raises(httpx.HTTPStatusError),
    ):
        data.fetch_inventory(client, "CL", 2026, tmp_path, now=now, force=True)
    assert snapshot.read_bytes() == before


def test_empty_source_is_not_a_complete_edition(tmp_path):
    with (
        httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=[]))) as client,
        pytest.raises(ValueError, match="Empty"),
    ):
        data.fetch_inventory(client, "CL", 2026, tmp_path)


def test_cache_checksum_is_verified(tmp_path):
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=[match()]))) as client:
        data.fetch_inventory(client, "CL", 2026, tmp_path)
        snapshot = next(tmp_path.glob("*-offset0-*.json"))
        snapshot.write_text("[]", encoding="utf-8")
        with pytest.raises(ValueError, match="checksum"):
            data.fetch_inventory(client, "CL", 2026, tmp_path)


def test_duplicate_page_cannot_turn_into_complete_inventory(tmp_path, monkeypatch):
    monkeypatch.setattr(data, "PAGE_SIZE", 1)
    with (
        httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=[match()]))) as client,
        pytest.raises(ValueError, match="Repeated"),
    ):
        data.fetch_inventory(client, "CL", 2026, tmp_path, sleep=lambda _: None)


def test_phase_classifies_group_era_and_knockout_without_relabelling_qualifiers():
    raw = match(seasonYear="2024")
    assert data.inventory_match(raw, "CL", 2023)["phase"] == "group"
    raw["round"]["mode"] = "KNOCK_OUT"
    assert data.inventory_match(raw, "CL", 2023)["phase"] == "knockout"
    raw["competitionPhase"] = raw["round"]["phase"] = "QUALIFYING"
    assert data.inventory_match(raw, "CL", 2023)["phase"] == "qualifying"


def test_final_is_a_knockout_fixture_but_does_not_guess_neutrality():
    raw = match()
    raw["round"]["mode"] = "FINAL"
    row = data.inventory_match(raw, "CL", 2026)
    assert row["phase"] == "knockout" and row["neutral"] is None


def test_published_league_phase_has_exact_opponents_and_home_away_counts():
    # A graph of 36 clubs, eight distinct opponents, four home and four away each.
    rows = []
    for home in range(36):
        for delta in range(1, 5):
            row = match(f"{home}-{delta}")
            row["homeTeam"]["id"] = str(home)
            row["awayTeam"]["id"] = str((home + delta) % 36)
            rows.append(data.inventory_match(row, "CL", 2026))
    assert data.league_phase_coverage(rows, "CL", 2026)["complete"] is True
    broken = deepcopy(rows)
    broken[-1]["away"] = broken[-2]["away"]
    assert data.league_phase_coverage(broken, "CL", 2026)["complete"] is False
    assert data.league_phase_coverage(rows[:-1], "CL", 2026)["complete"] is False


def test_failed_refresh_of_later_page_preserves_previous_readable_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(data, "PAGE_SIZE", 1)
    now = datetime(2026, 10, 23, tzinfo=UTC)

    def response(request):
        return httpx.Response(200, json=[match()] if request.url.params["offset"] == "0" else [])

    with httpx.Client(transport=httpx.MockTransport(response)) as client:
        original = data.fetch_inventory(client, "CL", 2026, tmp_path, now=now, sleep=lambda _: None)

    def failed_refresh(request):
        return httpx.Response(200, json=[match("new")]) if request.url.params["offset"] == "0" else httpx.Response(429)

    with httpx.Client(transport=httpx.MockTransport(failed_refresh)) as client, pytest.raises(httpx.HTTPStatusError):
        data.fetch_inventory(client, "CL", 2026, tmp_path, force=True, now=now, sleep=lambda _: None)
    with httpx.Client(transport=httpx.MockTransport(lambda _: pytest.fail("Cache must remain readable"))) as client:
        assert data.fetch_inventory(client, "CL", 2026, tmp_path, now=now) == original
