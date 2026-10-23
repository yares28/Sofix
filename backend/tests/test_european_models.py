import json
from copy import deepcopy

from app.sorare import european_models as e


def test_only_both_validated_competitions_can_load_with_complete_unchanged_evidence(tmp_path):
    for code in ("CL", "EL"):
        raw = json.loads((e.ROOT / f"{code}.json").read_text(encoding="utf-8"))
        assert e.load(code) is not None
        path = tmp_path / f"{code}.json"
        for corrupt in (
            lambda r: r["evidence"]["xscore"]["versusAblation"].update(hi=0),
            lambda r: r["evidence"]["football"]["versusBase"].update(hi=0),
            lambda r: r["evidence"].update(competition="CONF"),
            lambda r: r["evidence"]["xscore"].update(coverageComplete=False),
            lambda r: r.update(trainingThrough="2026-06-30"),
        ):
            changed = deepcopy(raw)
            corrupt(changed)
            path.write_text(json.dumps(changed), encoding="utf-8")
            assert e.load(code, tmp_path) is None
    assert e.load("CONF") is None


def test_reduced_current_club_registry_is_rejected(tmp_path, monkeypatch):
    from app.services import european_sources

    path = tmp_path / "registry.json"
    path.write_text(json.dumps({"seasonStart": 2026, "clubs": {"CL": {"one": "one"}}}), encoding="utf-8")
    monkeypatch.setattr(european_sources, "REGISTRY", path)
    import pytest

    with pytest.raises(ValueError):
        european_sources.current_clubs("CL", 2026)
