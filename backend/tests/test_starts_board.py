from app.sorare import audit
from tests.test_audit import cell, record_of
from tests.test_pipeline import db  # noqa: F401

COMPETITIONS = (
    "laliga-es",
    "premier-league-gb-eng",
    "bundesliga-de",
    "ligue-1-fr",
    "uefa-champions-league",
    "uefa-europa-league",
    "uefa-europa-conference-league",
)


def test_board_scopes_all_sources_and_bands_to_the_same_seven_competitions():
    games = {
        str(i): cell({source: 0.8 for source in audit.SOURCES}, i % 2 == 0, comp=competition)
        for i, competition in enumerate(COMPETITIONS)
    }
    games["excluded"] = cell({"sofix": 0.8, "sorare": 0.8}, False, comp="serie-a-it")
    games["unknown"] = cell({"sofix": 0.8}, True)
    games["pending"] = cell({"sofix": 0.8}, comp="laliga-es")
    record = record_of({"gw": {"p": {"games": games}}})
    board = audit.starts_board(record)
    assert tuple(board["competitions"]) == COMPETITIONS
    for source in audit.SOURCES:
        assert board["all"]["sources"][source]["settled"] == 7
        assert board["all"]["sources"][source]["right"] == 0.5714
        assert board["all"]["bands"][source][0]["n"] == 7
        assert board["all"]["bands"][source][0]["used"] is True
    assert board["all"]["sources"]["sofix"]["recorded"] == 8
    assert board["all"]["weeks"][0]["games"] == 8
    liga = board["competitions"]["laliga-es"]
    assert liga["sources"]["sofix"]["right"] == 1.0
    assert liga["sources"]["sofix"]["recorded"] == 2
    assert liga["bands"]["sofix"][0]["n"] == 1


def test_empty_board_keeps_unknown_as_null_and_one_failure_as_zero():
    board = audit.starts_board(
        record_of(
            {
                "gw": {
                    "p": {
                        "games": {
                            "known": cell({"sofix": 0.9}, False, comp="laliga-es"),
                            "pending": cell({"sorare": 0.9}, comp="laliga-es"),
                        }
                    }
                }
            }
        )
    )
    assert board["all"]["sources"]["sofix"]["right"] == 0.0
    assert board["all"]["sources"]["sorare"]["right"] is None
    assert board["all"]["bands"]["sofix"][0]["was"] == 0.0
    assert board["competitions"]["ligue-1-fr"]["weeks"] == []


def test_pending_games_keep_known_competition_coverage_when_old_metadata_lacks_it(db):  # noqa: F811
    from datetime import timedelta

    from app.models import PlayerGame
    from app.services.publish import put
    from app.sorare import player_audit
    from tests.test_player_audit import NOW, keep

    record = keep(db, 1)
    record["players"]["p0"]["games"][0]["competition"] = None
    put(db, "score_record:gw", record, NOW)
    row = db.get(PlayerGame, ("p0", "g"))
    row.date, row.status, row.played, row.started = NOW + timedelta(days=1), "PENDING", None, None
    db.commit()
    kept = player_audit.read(db, NOW)[0]
    board = audit.starts_board(kept)
    assert board["all"]["sources"]["sofix"]["recorded"] == 1
    assert board["all"]["sources"]["sofix"]["settled"] == 0
    assert board["all"]["weeks"][0]["games"] == 1
