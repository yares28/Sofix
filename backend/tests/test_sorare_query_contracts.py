"""Regressions for the Sorare schema errors observed in production refresh 37862266498."""

import re
from datetime import UTC, datetime

from app.sorare import sync
from app.sorare.client import SorareError
from tests.test_sorare_history import game


def test_history_reads_football_only_scores_on_the_concrete_score_type():
    class InterfaceClient:
        api_key = "fixture"

        def query(self, query, variables):
            if not re.search(r"\.\.\. on PlayerGameScore\s*\{\s*decisiveScore", query):
                raise SorareError("Field 'decisiveScore' doesn't exist on type 'PlayerGameScoreInterface'")
            row = game("2026-10-04T18:00:00Z", 60, {"playedInGame": True, "gameStarted": True})
            row["decisiveScore"] = {"totalScore": 60}
            row["detailedScore"] = [{"stat": "goals", "statValue": 1, "totalScore": 25}]
            return {"anyPlayer": {"allPlayerGameScores": {"nodes": [row]}}}

    rows = sync.history(InterfaceClient(), ["player"], datetime(2026, 10, 9, tzinfo=UTC))
    assert rows["player"][0]["stats"] == [{"stat": "goals", "statValue": 1, "totalScore": 25}]


def test_projection_reads_do_not_repeat_a_root_field_the_federation_refuses_even_with_aliases():
    ids = [f"Game:00000000-0000-0000-0000-{n:012d}" for n in range(3)]

    class FederationClient:
        def query(self, query):
            if query.count("anyGame(") > 1:
                raise SorareError("Duplicated root field: anyGame")
            return {
                "g0": {
                    "playerGameScores": [{"anyPlayer": {"slug": "player"}, "projection": {"score": 54, "grade": "B"}}]
                }
            }

    result = sync.game_projections(FederationClient(), ids)
    assert set(result) == set(ids)
    assert all(value["player"] == {"score": 54, "grade": "B"} for value in result.values())
