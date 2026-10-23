"""Never open prospective metrics on an interim or incomplete season."""

import pytest

from app.research.conference_acceptance import closure_reasons, evaluate


def complete():
    native = [
        {"id": str(i), "status": "FINISHED", "round": {"mode": "GROUP" if i < 108 else "KNOCK_OUT"}} for i in range(153)
    ]
    state = {
        "frozenAt": "2026-10-23T10:00:00Z",
        "excluded": {str(i): {"lock": "2026-10-19T14:00:00Z"} for i in range(36)},
        "enrolled": {str(i): {} for i in range(36, 153)},
        "settled": {str(i): {"players": [{"player": f"p{p}"} for p in range(22)]} for i in range(36, 153)},
        "captures": {str(i): [{}] for i in range(36, 153)},
        "errors": [],
    }
    return native, state


def test_whole_remaining_edition_is_required_no_early_success():
    native, state = complete()
    assert not closure_reasons(native, state)
    assert closure_reasons(native[:108], state)
    native[-1]["status"] = "UPCOMING"
    assert closure_reasons(native, state)


def test_one_missing_prediction_player_or_final_result_blocks_all_metrics():
    native, state = complete()
    state["settled"]["36"]["players"].pop()
    assert closure_reasons(native, state)


def test_native_kickoff_alone_cannot_silently_exclude_a_resumed_game():
    native, state = complete()
    del state["excluded"]["0"]
    assert closure_reasons(native, state)
    native, state = complete()
    state["excluded"]["0"]["lock"] = "2026-10-24T14:00:00Z"
    assert closure_reasons(native, state)


def test_incomplete_edition_never_reads_captures_or_opens_accuracy_metrics():
    native, state = complete()

    class Archive:
        def read_capture(self, ref):
            raise AssertionError("Interim metrics must stay closed")

    with pytest.raises(ValueError, match="calendar"):
        evaluate(native[:108], state, Archive())


def test_complete_fixed_population_evaluates_both_comparators_without_promoting():
    native, state = complete()
    state.update(candidateSha256="candidate", recordingVersion="recording", protocolSha256="protocol")
    snapshots = {}
    for ident, case in state["settled"].items():
        i = int(ident)
        date = f"2027-03-{1 + i % 20:02d}T18:00:00Z"
        phase = "league" if i < 108 else "knockout"
        case["football"] = {
            "id": ident,
            "date": date,
            "season": 2026,
            "hg": 2,
            "ag": 0,
            "neutral": False,
            "phase": phase,
            "leg": None,
        }
        case["capture"] = ident
        for p, row in enumerate(case["players"]):
            score = 20 + p
            row.update(
                score=score,
                prediction=score + 1,
                baseline=score + 10,
                ablation=score + 5,
                game=ident,
                week=f"week-{i % 12}",
                pos="GK" if p in (0, 11) else "DEF" if p % 11 < 5 else "MID" if p % 11 < 9 else "FWD",
                ownStarts=0,
                phase=phase,
                neutral=False,
                extraTime=False,
            )
        snapshots[ident] = {
            "candidateSha256": "candidate",
            "recordingVersion": "recording",
            "protocolSha256": "protocol",
            "nativeId": ident,
            "lock": "2027-02-28T14:00:00Z",
            "cold": False,
            "football": {"p_h": 0.8, "p_d": 0.1, "p_a": 0.1, "cs_h": 0.8, "cs_a": 0.1, "lam_h": 2, "lam_a": 1},
            "base": [0.4, 0.3, 0.3],
            "plain": [0.4, 0.3, 0.3],
        }

    class Archive:
        def read_capture(self, ref):
            return snapshots[ref]

    report = evaluate(native, state, Archive())
    assert report["passed"] is True and report["modelEligible"] is False
    assert report["football"]["games"] == 117
    assert report["xscore"]["cases"] == 117 * 22
    assert report["xscore"]["versusForm"]["hi"] < 0
    assert report["xscore"]["versusAblation"]["hi"] < 0
    snapshots["36"]["candidateSha256"] = "changed"
    with pytest.raises(ValueError, match="identity"):
        evaluate(native, state, Archive())
    native, state = complete()
    del state["captures"]["36"]
    assert closure_reasons(native, state)
    native, state = complete()
    native[-1]["status"] = "ABANDONED"
    assert closure_reasons(native, state)
