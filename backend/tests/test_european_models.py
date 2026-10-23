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
    assert e.load("CONF", tmp_path) is None


def test_conference_requires_separate_provisional_release_and_unchanged_candidate(tmp_path):
    raw = json.loads((e.ROOT / "CONF.json").read_text(encoding="utf-8"))
    assert raw["releaseStatus"] == "provisional"
    assert raw["candidate"]["validated"] is False
    assert raw["diagnostic"]["football"]["passed"] is False
    assert e.load("CONF") is not None
    path = tmp_path / "CONF.json"
    for corrupt in (
        lambda r: r.update(releaseStatus="validated"),
        lambda r: r.update(ownerDirected=False),
        lambda r: r["candidate"].update(clubWeight=1),
        lambda r: r["candidate"]["keeper"].update(dec0=99),
        lambda r: r["diagnostic"]["xscore"].update(cases=3365),
        lambda r: r.update(candidate=r["diagnostic"]),
    ):
        changed = deepcopy(raw)
        corrupt(changed)
        path.write_text(json.dumps(changed), encoding="utf-8")
        assert e.load("CONF", tmp_path) is None
    path.write_text(json.dumps(raw["candidate"]), encoding="utf-8")
    assert e.load("CONF", tmp_path) is None


def test_reduced_current_club_registry_is_rejected(tmp_path, monkeypatch):
    from app.services import european_sources

    path = tmp_path / "registry.json"
    path.write_text(json.dumps({"seasonStart": 2026, "clubs": {"CL": {"one": "one"}}}), encoding="utf-8")
    monkeypatch.setattr(european_sources, "REGISTRY", path)
    import pytest

    with pytest.raises(ValueError):
        european_sources.current_clubs("CL", 2026)
