from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.sorare import foreign_coverage as f
from app.sorare.client import SorareError

NOW = datetime(2026, 10, 21, tzinfo=UTC)


@pytest.mark.parametrize("code,size", [("PL", 20), ("BL1", 18)])
def test_cold_start_covers_every_club_and_deduplicates_transfers(monkeypatch, code, size):
    clubs = [{"slug": f"club-{i}"} for i in range(size)]
    client = SimpleNamespace(query=lambda *args: {"football": {"competition": {"teams": {"nodes": clubs}}}})

    def squad(client, club, fixture, strict=False):
        assert strict
        return [
            {
                "slug": "transfer" if club in ("club-0", "club-1") else club,
                "displayName": club,
                "activeClub": {"slug": "club-1" if club == "club-0" else club},
                "position": "Defender",
                "average": 0,
                "plan": [],
            }
        ]

    monkeypatch.setattr(f.sync, "_squad", squad)
    index = f.collect_index(client, code, "selected-gw", NOW)
    assert index["complete"] and len(index["clubs"]) == size
    assert len(f.rows(index)) == size - 1
    assert next(p for p in f.rows(index) if p["slug"] == "transfer")["player"]["activeClub"]["slug"] == "club-1"


def test_partial_failure_keeps_identity_but_expires_old_game_and_projection(monkeypatch):
    clubs = [{"slug": f"club-{i}"} for i in range(20)]
    client = SimpleNamespace(query=lambda *args: {"football": {"competition": {"teams": {"nodes": clubs}}}})
    old = {
        "clubs": {
            "club-0": [
                {
                    "slug": "old",
                    "player": {
                        "slug": "old",
                        "activeClub": {"slug": "club-0"},
                        "plan": [{"id": "old-gw"}],
                        "nextClassicFixtureProjectedScore": 70,
                        "nextClassicFixturePlayingStatusOdds": {"starterOddsBasisPoints": 10000},
                    },
                    "projection": 70,
                }
            ]
        }
    }

    def squad(client, club, fixture, strict=False):
        if club == "club-0":
            raise SorareError("unavailable")
        return [{"slug": club, "activeClub": {"slug": club}, "position": "Defender"}]

    monkeypatch.setattr(f.sync, "_squad", squad)
    index = f.collect_index(client, "PL", "new-gw", NOW, old)
    player = next(p for p in f.rows(index) if p["slug"] == "old")
    assert not index["complete"] and len(index["clubs"]) == 20
    assert player["player"]["plan"] == [] and player["projection"] is None
    assert player["player"]["nextClassicFixturePlayingStatusOdds"] is None


def test_strict_squad_rejects_truncated_pagination():
    page = {"nodes": [{"slug": "one"}], "pageInfo": {"hasNextPage": True, "endCursor": None}}
    client = SimpleNamespace(query=lambda *args: {"football": {"club": {"activePlayers": page}}})
    with pytest.raises((ValueError, SorareError), match="cursor|page"):
        f.sync._squad(client, "club", "gw", strict=True)
