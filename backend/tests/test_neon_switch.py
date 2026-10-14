import httpx

from app.jobs.neon_switch import LIMIT_BYTES, endpoint_id, move_to, pick, sent_bytes, table_order

GB = 1024**3


def test_endpoint_id_drops_pooler_and_login() -> None:
    url = "postgresql+psycopg://fdr_app:pw@ep-cold-cloud-b9akf8sh-pooler.c-7.eu-central-1.aws.neon.tech/neondb?sslmode=require"
    assert endpoint_id(url) == "ep-cold-cloud-b9akf8sh"


def test_live_project_is_the_one_written_last_among_those_answering() -> None:
    assert pick([100.0, 200.0]) == 1
    assert pick([300.0, 200.0]) == 0
    assert pick([None, 50.0]) == 1  # Sofix out of quota: FDR answers
    assert pick([None, None]) is None


def test_moves_at_the_limit_to_the_answering_project_that_sent_least() -> None:
    up = [1.0, 1.0, 1.0]
    assert move_to(0, [int(3.9 * GB), GB, GB], up) is None  # under the limit: stay
    assert move_to(0, [int(4.2 * GB), int(3 * GB), int(0.5 * GB)], up) == 2
    assert move_to(0, [int(4.2 * GB), int(3 * GB), int(0.5 * GB)], [1.0, 1.0, None]) == 1  # least-used one is down
    assert move_to(1, [int(5.2 * GB), int(4.5 * GB), None], up) is None  # nowhere with room, or usage unknown
    assert LIMIT_BYTES < 5 * GB


def test_tables_load_parents_first() -> None:
    refs = [("teams", "stadiums"), ("fixtures", "teams"), ("fixtures", "competitions"), ("predictions", "fixtures")]
    order = table_order(["predictions", "fixtures", "teams", "stadiums", "competitions", "read_models"], refs)
    for child, parent in refs:
        assert order.index(parent) < order.index(child)
    assert sorted(order) == sorted(["predictions", "fixtures", "teams", "stadiums", "competitions", "read_models"])


def fake_neon(personal: bool) -> httpx.MockTransport:
    """Neon's API as seen with a personal key (must name the organization) or an organization key."""

    def answer(request: httpx.Request) -> httpx.Response:
        path, org = request.url.path.removeprefix("/api/v2"), request.url.params.get("org_id")
        if path == "/users/me/organizations":
            return httpx.Response(200, json={"organizations": [{"id": "org-1"}]}) if personal else httpx.Response(403)
        if path == "/projects":
            if personal and org != "org-1":
                return httpx.Response(400, json={"message": "org_id is required"})
            return httpx.Response(200, json={"projects": [{"id": "p-b", "name": "Sofix B"}]})
        if path == "/projects/p-b/endpoints":
            return httpx.Response(200, json={"endpoints": [{"id": "ep-morning-paper-baxx0rh5"}]})
        if path == "/projects/p-b":
            return httpx.Response(200, json={"project": {"data_transfer_bytes": 3 * GB}})
        return httpx.Response(404)

    return httpx.MockTransport(answer)


def test_usage_is_read_with_a_personal_or_an_organization_key() -> None:
    urls = [
        "postgresql://u:p@ep-dead-1-pooler.c-7.x.neon.tech/db",
        "postgresql://u:p@ep-morning-paper-baxx0rh5-pooler.c-8.x.neon.tech/db",
    ]
    for personal in (True, False):
        assert sent_bytes(urls, "key", transport=fake_neon(personal)) == ([None, 3 * GB], None)
