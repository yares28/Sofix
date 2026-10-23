"""Durable research evidence, separate from production blocks and database rows."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Any

from app.research.european_cases import digest
from app.research.league_xscore_data import when
from app.services import r2


def seal(value: dict[str, Any]) -> dict[str, Any]:
    packet = {k: v for k, v in value.items() if k != "sha256"}
    return {**packet, "sha256": digest(packet)}


def verify(value: dict[str, Any]) -> dict[str, Any]:
    if seal(value)["sha256"] != value.get("sha256"):
        raise ValueError("Research evidence checksum changed")
    return value


def capture_allowed(now: datetime, lock: datetime, freeze: datetime) -> bool:
    return freeze < now < lock and freeze < lock <= now + timedelta(hours=36)


def select_capture(refs: list[dict[str, Any]], week: str, lock: datetime) -> dict[str, Any] | None:
    valid = [r for r in refs if r["week"] == week and when(r["lock"]) == lock and when(r["recordedAt"]) < lock]
    return max(valid, key=lambda r: (r["recordedAt"], r["key"])) if valid else None


class Archive:
    def __init__(self, candidate: str, *, request: Any = r2.request):
        if not re.fullmatch(r"[0-9a-f]{64}", candidate):
            raise ValueError("Invalid frozen candidate identity")
        self.candidate = candidate
        self.prefix = f"research/conference-v2/{candidate}"
        self.request = request

    def read_state(self) -> dict[str, Any]:
        response = self.request("GET", f"{self.prefix}/state.json")
        if response.status_code == 404:
            return {
                "version": 1,
                "candidateSha256": self.candidate,
                "captures": {},
                "settled": {},
                "history": {},
                "errors": [],
            }
        if response.status_code != 200:
            raise ValueError(f"Research storage read failed: HTTP {response.status_code}")
        state = verify(response.json())
        if state.get("candidateSha256") != self.candidate:
            raise ValueError("Wrong research manifest candidate")
        return state

    def write_state(self, state: dict[str, Any]) -> None:
        if state.get("candidateSha256") != self.candidate:
            raise ValueError("Wrong research manifest candidate")
        body = json.dumps(seal(state), separators=(",", ":"), allow_nan=False).encode()
        response = self.request("PUT", f"{self.prefix}/state.json", body)
        if response.status_code != 200:
            raise ValueError(f"Research storage manifest write failed: HTTP {response.status_code}")

    def write_capture(self, snapshot: dict[str, Any], *, week: str, lock: datetime) -> dict[str, Any]:
        verify(snapshot)
        if when(snapshot["capturedAt"]) >= lock or when(snapshot["lock"]) != lock:
            raise ValueError("Capture is at or after deadline")
        body = json.dumps(snapshot, separators=(",", ":"), allow_nan=False).encode()
        sha = hashlib.sha256(body).hexdigest()
        key = f"{self.prefix}/captures/{sha}.json"
        response = self.request("PUT", key, body)
        if response.status_code != 200:
            raise ValueError(f"Research storage capture write failed: HTTP {response.status_code}")
        if not response.headers.get("Date"):
            raise ValueError("Research storage did not attest capture time")
        recorded = parsedate_to_datetime(response.headers["Date"])
        if recorded.tzinfo is None or recorded >= lock:
            raise ValueError("Research storage crossed deadline")
        return {
            "key": key,
            "bodySha256": sha,
            "recordedAt": recorded.isoformat(),
            "lock": lock.isoformat(),
            "week": week,
        }

    def read_capture(self, ref: dict[str, Any]) -> dict[str, Any]:
        expected = f"{self.prefix}/captures/{ref['bodySha256']}.json"
        if ref.get("key") != expected:
            raise ValueError("Capture reference escapes research namespace")
        response = self.request("GET", expected)
        if response.status_code != 200 or hashlib.sha256(response.content).hexdigest() != ref["bodySha256"]:
            raise ValueError("Missing or changed immutable research capture")
        snapshot = verify(response.json())
        if when(snapshot["capturedAt"]) >= when(ref["lock"]) or when(snapshot["lock"]) != when(ref["lock"]):
            raise ValueError("Invalid pre-deadline capture")
        return snapshot

    def write_evidence(self, value: dict[str, Any]) -> dict[str, str]:
        body = json.dumps(seal(value), separators=(",", ":"), allow_nan=False).encode()
        sha = hashlib.sha256(body).hexdigest()
        key = f"{self.prefix}/settlements/{sha}.json"
        response = self.request("PUT", key, body)
        if response.status_code != 200:
            raise ValueError(f"Research storage settlement write failed: HTTP {response.status_code}")
        return {"key": key, "bodySha256": sha}
