"""Pre-deadline evidence must survive retries without allowing retrospective forecasts."""

from datetime import timedelta
from email.utils import format_datetime

import httpx
import pytest

from app.research.conference_recording import Archive, capture_allowed, seal, select_capture, verify
from app.research.league_xscore_data import when

NOW = when("2026-11-02T10:00:00Z")
LOCK = when("2026-11-03T14:00:00Z")
FREEZE = when("2026-10-23T10:00:00Z")


def test_capture_window_is_strict_and_never_admits_a_past_lock_or_old_candidate_case():
    assert capture_allowed(NOW, LOCK, FREEZE)
    assert not capture_allowed(LOCK, LOCK, FREEZE)
    assert not capture_allowed(LOCK + timedelta(seconds=1), LOCK, FREEZE)
    assert not capture_allowed(NOW - timedelta(days=2), LOCK, FREEZE)
    assert not capture_allowed(NOW, LOCK, LOCK)


def test_sealed_evidence_detects_changed_zero_or_missing_data():
    packet = seal({"score": 0, "missing": None})
    assert verify(packet)["score"] == 0
    packet["score"] = None
    with pytest.raises(ValueError, match="checksum"):
        verify(packet)


def test_snapshot_selection_uses_storage_timestamp_and_actual_fixture_identity():
    refs = [
        {
            "recordedAt": (NOW - timedelta(hours=1)).isoformat(),
            "lock": LOCK.isoformat(),
            "week": "actual",
            "key": "old",
        },
        {"recordedAt": NOW.isoformat(), "lock": LOCK.isoformat(), "week": "actual", "key": "latest"},
        {"recordedAt": LOCK.isoformat(), "lock": LOCK.isoformat(), "week": "actual", "key": "late"},
        {"recordedAt": NOW.isoformat(), "lock": LOCK.isoformat(), "week": "wrong", "key": "wrong"},
    ]
    assert select_capture(refs, "actual", LOCK)["key"] == "latest"
    assert select_capture(refs[2:], "actual", LOCK) is None


def test_archive_cold_start_roundtrip_cache_loss_and_hash_verification():
    objects = {}

    def request(method, key, body=b""):
        if method == "PUT":
            objects[key] = body
            return httpx.Response(200, headers={"Date": format_datetime(NOW, usegmt=True)})
        return httpx.Response(200, content=objects[key]) if key in objects else httpx.Response(404)

    archive = Archive("a" * 64, request=request)
    assert archive.read_state()["captures"] == {}
    snap = seal({"capturedAt": NOW.isoformat(), "lock": LOCK.isoformat(), "players": {"zero": 0}})
    ref = archive.write_capture(snap, week="actual", lock=LOCK)
    state = archive.read_state()
    state["captures"]["game"] = [ref]
    archive.write_state(state)
    # A fresh process has no local cache, but the authoritative manifest still exists.
    fresh = Archive("a" * 64, request=request)
    restored = fresh.read_state()
    assert fresh.read_capture(restored["captures"]["game"][0])["players"]["zero"] == 0
    objects[ref["key"]] = b"{}"
    with pytest.raises(ValueError):
        fresh.read_capture(ref)


def test_archive_write_failure_and_crossed_deadline_never_yield_accepted_reference():
    def failed(method, key, body=b""):
        return httpx.Response(503)

    with pytest.raises(ValueError, match="storage"):
        Archive("a" * 64, request=failed).read_state()

    def late(method, key, body=b""):
        return httpx.Response(200, headers={"Date": format_datetime(LOCK, usegmt=True)})

    snap = seal({"capturedAt": NOW.isoformat(), "lock": LOCK.isoformat()})
    with pytest.raises(ValueError, match="deadline"):
        Archive("a" * 64, request=late).write_capture(snap, week="actual", lock=LOCK)
