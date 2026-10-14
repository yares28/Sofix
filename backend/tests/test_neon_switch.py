from app.jobs.neon_switch import LIMIT_BYTES, endpoint_id, pick, should_move, table_order

GB = 1024**3


def test_endpoint_id_drops_pooler_and_login() -> None:
    url = "postgresql+psycopg://fdr_app:pw@ep-cold-cloud-b9akf8sh-pooler.c-7.eu-central-1.aws.neon.tech/neondb?sslmode=require"
    assert endpoint_id(url) == "ep-cold-cloud-b9akf8sh"


def test_live_project_is_the_one_written_last_among_those_answering() -> None:
    assert pick([100.0, 200.0]) == 1
    assert pick([300.0, 200.0]) == 0
    assert pick([None, 50.0]) == 1  # Sofix out of quota: FDR answers
    assert pick([None, None]) is None


def test_moves_only_when_live_is_near_the_limit_and_the_other_has_room() -> None:
    assert should_move(int(4.2 * GB), int(1 * GB))
    assert not should_move(int(3.9 * GB), int(1 * GB))
    assert not should_move(int(4.2 * GB), int(4.5 * GB))  # both full: stay
    assert not should_move(int(4.2 * GB), None)  # other's usage unknown: stay
    assert LIMIT_BYTES < 5 * GB


def test_tables_load_parents_first() -> None:
    refs = [("teams", "stadiums"), ("fixtures", "teams"), ("fixtures", "competitions"), ("predictions", "fixtures")]
    order = table_order(["predictions", "fixtures", "teams", "stadiums", "competitions", "read_models"], refs)
    for child, parent in refs:
        assert order.index(parent) < order.index(child)
    assert sorted(order) == sorted(["predictions", "fixtures", "teams", "stadiums", "competitions", "read_models"])
