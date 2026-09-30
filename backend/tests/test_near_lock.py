"""The half-hourly check that starts a refresh in the last hours before a Sorare gameweek locks (plans/futbolfantasy.md, S4)."""

from __future__ import annotations

import importlib.util
import urllib.error
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / ".github" / "scripts" / "near_lock.py"
LOCK = datetime(2026, 10, 9, 14, tzinfo=UTC)
ENV = {"GITHUB_REPOSITORY": "owner/sofix", "GITHUB_TOKEN": "t", "GITHUB_REF_NAME": "main"}


@pytest.fixture(scope="module")
def near() -> ModuleType:
    spec = importlib.util.spec_from_file_location("near_lock", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def nodes(*locks: str) -> list[dict[str, Any]]:
    return [{"slug": f"gw-{i}", "cutOffDate": lock} for i, lock in enumerate(locks)]


class Run:
    """Everything `main` does to the outside world, recorded."""

    def __init__(
        self, near: ModuleType, lock: str | None, started: datetime | None = None, now: datetime = LOCK
    ) -> None:
        self.said: list[str] = []
        self.dispatched: list[tuple[str, str, str]] = []
        self.asked_github = 0

        def fetch(key: str | None) -> list[dict[str, Any]]:
            return nodes(*([lock] if lock else []))

        def last(repo: str, token: str) -> datetime | None:
            self.asked_github += 1
            return started

        self.code = near.main(
            env=ENV,
            now=now,
            fetch=fetch,
            started=last,
            start=lambda *args: self.dispatched.append(args),
            say=self.said.append,
        )


def test_the_nearest_lock_still_ahead_is_the_one_that_counts(near: ModuleType) -> None:
    now = LOCK - timedelta(hours=10)

    assert near.next_lock(nodes("2026-10-02T14:00:00Z", "2026-10-16T14:00:00Z", "2026-10-09T14:00:00Z"), now) == LOCK
    assert near.next_lock(nodes("2026-10-02T14:00:00Z"), now) is None
    assert near.next_lock([], now) is None
    assert near.next_lock([{"slug": "x", "cutOffDate": None}, {"slug": "y"}, {"cutOffDate": "not a date"}], now) is None


def test_it_starts_a_refresh_in_the_last_three_hours_when_none_started_recently(near: ModuleType) -> None:
    run = Run(
        near, "2026-10-09T14:00:00Z", started=LOCK - timedelta(hours=6), now=LOCK - timedelta(hours=2, minutes=40)
    )

    assert run.code == 0 and run.dispatched == [("owner/sofix", "t", "main")]
    assert "Started a refresh" in run.said[0]


def test_it_does_not_start_one_when_one_started_in_the_last_25_minutes_and_does_when_it_was_longer_ago(
    near: ModuleType,
) -> None:
    now = LOCK - timedelta(hours=1)

    assert Run(near, "2026-10-09T14:00:00Z", started=now - timedelta(minutes=24), now=now).dispatched == []
    assert len(Run(near, "2026-10-09T14:00:00Z", started=now - timedelta(minutes=26), now=now).dispatched) == 1
    assert len(Run(near, "2026-10-09T14:00:00Z", started=None, now=now).dispatched) == 1, "no run on record at all"


def test_it_starts_nothing_more_than_three_hours_before_and_does_not_even_ask_github(near: ModuleType) -> None:
    run = Run(near, "2026-10-09T14:00:00Z", now=LOCK - timedelta(hours=3, minutes=1))

    assert run.dispatched == [] and run.asked_github == 0 and "more than" in run.said[0]
    assert len(Run(near, "2026-10-09T14:00:00Z", now=LOCK - timedelta(hours=3)).dispatched) == 1


def test_it_starts_nothing_after_the_lock_or_with_no_gameweek_open(near: ModuleType) -> None:
    assert Run(near, "2026-10-09T14:00:00Z", now=LOCK + timedelta(minutes=1)).dispatched == []
    none = Run(near, None)
    assert none.dispatched == [] and "no gameweek is open" in none.said[0]


def test_a_check_that_cannot_be_made_is_a_warning_and_never_a_failure(near: ModuleType) -> None:
    said: list[str] = []

    def down(key: str | None) -> list[dict[str, Any]]:
        raise urllib.error.URLError("unreachable")

    code = near.main(env=ENV, now=LOCK, fetch=down, say=said.append)
    assert code == 0 and said[0].startswith("::warning::") and "could not be read" in said[0]

    said.clear()

    def refuses(repo: str, token: str, ref: str) -> None:
        raise urllib.error.HTTPError("https://api.github.com", 403, "Forbidden", {}, None)  # type: ignore[arg-type]

    code = near.main(
        env=ENV,
        now=LOCK - timedelta(hours=1),
        fetch=lambda key: nodes("2026-10-09T14:00:00Z"),
        started=lambda r, t: None,
        start=refuses,
        say=said.append,
    )
    assert code == 0 and said[0].startswith("::warning::") and "could not be started" in said[0]


def test_without_the_repository_or_token_it_says_so_and_does_nothing(near: ModuleType) -> None:
    said: list[str] = []

    assert near.main(env={}, now=LOCK, say=said.append) == 0
    assert said and said[0].startswith("::warning::")


def test_the_workflow_files_are_what_the_script_assumes() -> None:
    root = SCRIPT.parents[2]
    refresh = (root / ".github" / "workflows" / "refresh.yml").read_text()
    near_lock = (root / ".github" / "workflows" / "near-lock.yml").read_text()

    assert "options: [cli, button, schedule]" in refresh, (
        "the dispatch the script makes must be an option the refresh accepts"
    )
    assert "workflow_dispatch:" in refresh and "python3 .github/scripts/near_lock.py" in near_lock
    assert "actions: write" in near_lock and '"*/30 * * * *"' in near_lock
    assert "WORKFLOW = " in SCRIPT.read_text() and "refresh.yml" in SCRIPT.read_text()
