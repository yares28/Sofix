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


def test_blocks_keep_player_details_small_and_forecasts_bound_to_their_own_week():
    market = {
        "PL": {
            "competition": "PL",
            "weekId": "22",
            "market": [
                {"slug": f"player-{i}", "name": str(i), "club": "Arsenal", "pic": "", "pos": "DEF", "x": 0}
                for i in range(619)
            ],
        }
    }
    blocks = f.blocks(market)
    assert blocks["players:PL"]["weekId"] == "22"
    directory = blocks["player_index"]["players"]
    assert len(directory) == 619 and directory[0]["league"] == "PL"
    assert directory[0]["pos"] == "DEF"
    shard = blocks[f"players:PL:{sum(map(ord, 'player-0')) % 16:x}"]
    assert shard["market"][0]["x"] == 0 and shard["weekId"] == "22"
    assert max(len(b["market"]) for k, b in blocks.items() if k.startswith("players:PL:")) < 60
    assert sum(len(b["market"]) for k, b in blocks.items() if k.startswith("players:PL:")) == 619


def test_squad_coaches_are_not_indexed_as_unknown_position_players(monkeypatch):
    clubs = [{"slug": f"club-{i}"} for i in range(20)]
    client = SimpleNamespace(query=lambda *args: {"football": {"competition": {"teams": {"nodes": clubs}}}})

    def squad(client, club, fixture, strict=False):
        return [
            {"slug": club, "position": "Defender", "activeClub": {"slug": club}},
            {"slug": club + "-coach", "position": "Coach", "activeClub": {"slug": club}},
        ]

    monkeypatch.setattr(f.sync, "_squad", squad)
    index = f.collect_index(client, "PL", "gw", NOW)
    assert index["complete"]
    assert len(f.rows(index)) == 20
    assert all(row["pos"] == "DEF" for row in f.rows(index))
