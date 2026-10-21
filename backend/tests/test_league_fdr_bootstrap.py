"""One-time publication must not rerun the expensive LaLiga/Sorare pipeline."""

from app.jobs import league_fdr, refresh


class Published:
    def __init__(self, keys):
        self.keys = keys

    def query(self, *args):
        return self

    def filter(self, *args):
        return self

    def all(self):
        return [(key,) for key in self.keys]

    def close(self):
        pass


def test_existing_blocks_do_not_start_a_refresh(monkeypatch):
    monkeypatch.setattr(league_fdr, "SessionLocal", lambda: Published(["grid:PL", "grid:BL1"]))

    def forbidden(*args, **kwargs):
        raise AssertionError("must skip completed bootstrap")

    monkeypatch.setattr(refresh, "main", forbidden)
    assert league_fdr.bootstrap() == 0


def test_only_missing_league_uses_existing_schema_gate_and_lock(monkeypatch):
    monkeypatch.setattr(league_fdr, "SessionLocal", lambda: Published(["grid:PL"]))
    calls = []
    monkeypatch.setattr(league_fdr, "run", lambda code: calls.append(code))

    def locked(argv, **kwargs):
        assert "--skip-migrations" in argv
        assert [name for name, _ in kwargs["steps"]] == ["fdr_bl", "revalidate"]
        kwargs["steps"][0][1]()
        return 0

    monkeypatch.setattr(refresh, "main", locked)
    assert league_fdr.bootstrap() == 0 and calls == ["BL1"]
