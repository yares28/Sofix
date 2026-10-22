from datetime import UTC, datetime
from types import SimpleNamespace

from app.sorare import foreign_history as h

NOW = datetime(2026, 10, 21, tzinfo=UTC)


def raw_game():
    return {
        "id": "game-one",
        "date": "2026-10-10T14:00:00Z",
        "statusTyped": "played",
        "competition": {"slug": "premier-league-gb-eng"},
        "homeTeam": {"slug": "arsenal", "name": "Arsenal FC"},
        "awayTeam": {"slug": "chelsea", "name": "Chelsea FC"},
        "playerGameScores": [
            {
                "anyPlayer": {"slug": "zero"},
                "positionTyped": "Defender",
                "score": 0,
                "scoreStatus": "FINAL",
                "scoringVersion": 7,
                "decisiveScore": {"totalScore": 0},
                "anyPlayerGameStats": {
                    "playedInGame": True,
                    "gameStarted": 1,
                    "minsPlayed": 90,
                    "anyTeam": {"slug": "arsenal", "name": "Arsenal FC"},
                },
            },
            {
                "anyPlayer": {"slug": "unknown"},
                "positionTyped": "Defender",
                "score": None,
                "scoreStatus": "PENDING",
                "scoringVersion": 7,
                "anyPlayerGameStats": None,
            },
        ],
    }


def test_current_history_preserves_zero_unknown_and_actual_side():
    history = h.history_of("PL", raw_game())
    assert history["zero"][0]["score"] == 0 and history["zero"][0]["started"] is True
    assert history["unknown"][0]["score"] is None and history["unknown"][0]["started"] is None
    assert history["zero"][0]["home"] == "Arsenal FC"
    assert history["zero"][0]["competition"] == "premier-league-gb-eng"


def test_recent_settled_games_are_read_once_and_late_corrections_expire(monkeypatch):
    game = raw_game()
    monkeypatch.setattr(h, "recent_index", lambda *args: ([game], {"missingAfter": 0}))
    calls = []

    def query(text, variables):
        calls.append(variables)
        return {"anyGame": game}

    client = SimpleNamespace(query=query)
    history, state = h.collect(client, "PL", NOW, {})
    assert len(calls) == 1 and "zero" in history
    history, resumed = h.collect(client, "PL", NOW, state)
    assert history == {} and len(calls) == 1
    recent = {**game, "date": "2026-10-20T14:00:00Z"}
    monkeypatch.setattr(h, "recent_index", lambda *args: ([recent], {"missingAfter": 0}))
    monkeypatch.setattr(client, "query", lambda *args: {"anyGame": recent})
    history, state = h.collect(client, "PL", NOW, state)
    assert "zero" in history


def test_new_scoring_version_cannot_silently_enter_the_validated_history():
    import pytest

    game = raw_game()
    game["playerGameScores"][0]["scoringVersion"] = 8
    with pytest.raises(ValueError, match="scoring version"):
        h.history_of("PL", game)
