"""Start the refresh when a Sorare gameweek is about to lock (plans/futbolfantasy.md, S4).

The team news is what counts in the last hours before a lock, and Futbol Fantasy's lineups change daily, so the scheduled
refresh (a few times a day) is not often enough then. Every 30 minutes the workflow runs this: one public Sorare query for
the next lock, one GitHub call for when the refresh last started. When the lock is under three hours away and no refresh
started in the last 25 minutes, it starts one. It touches no database, so the half-hourly checks never wake it.

Only the standard library is used, so the workflow installs nothing. A check that cannot be made is a warning, not a
failure: the scheduled refresh still runs, and a failed check every few weeks should not send an email each time.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

SORARE = "https://api.sorare.com/federation/graphql"
QUERY = "query { so5 { so5Fixtures(first: 10, eventType: CLASSIC, sport: FOOTBALL) { nodes { slug cutOffDate } } } }"
GITHUB = "https://api.github.com"
WORKFLOW = "refresh.yml"
WINDOW = timedelta(hours=3)  # the last hours before a lock
GAP = timedelta(minutes=25)  # a refresh that started this recently is enough: the checks are 30 minutes apart
USER_AGENT = "Sofix/1.0 (personal, read-only; one question every 30 minutes)"


def _moment(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def next_lock(nodes: list[dict[str, Any]], now: datetime) -> datetime | None:
    """The nearest cut-off still ahead among Sorare's gameweeks, or None when it lists none."""
    locks = [moment for node in nodes if (moment := _moment(node.get("cutOffDate"))) and moment > now]
    return min(locks) if locks else None


def decide(lock: datetime | None, now: datetime, last_started: datetime | None) -> tuple[bool, str]:
    """Whether to start a refresh now, and why or why not in a line."""
    if lock is None:
        return False, "no gameweek is open"
    if lock - now > WINDOW:
        return False, f"the next lock is {lock - now} away (more than {WINDOW})"
    if last_started is not None and now - last_started < GAP:
        return False, f"a refresh started {now - last_started} ago"
    return True, f"the next lock is {lock - now} away and no refresh started in the last {GAP}"


def _call(url: str, headers: dict[str, str], body: dict[str, Any] | None = None) -> Any:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"User-Agent": USER_AGENT, **headers},
    )
    with urllib.request.urlopen(request, timeout=20) as response:  # noqa: S310 (fixed https addresses)
        raw = response.read()
    return json.loads(raw) if raw else None


def sorare_nodes(key: str | None) -> list[dict[str, Any]]:
    headers = {"Content-Type": "application/json", **({"APIKEY": key} if key else {})}
    data = _call(SORARE, headers, {"query": QUERY, "variables": {}})
    return data["data"]["so5"]["so5Fixtures"]["nodes"]


def last_started(repo: str, token: str) -> datetime | None:
    """When the refresh workflow's latest run, running or finished, was started."""
    runs = _call(
        f"{GITHUB}/repos/{repo}/actions/workflows/{WORKFLOW}/runs?per_page=5",
        {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
    )["workflow_runs"]
    moments = [m for run in runs if (m := _moment(run.get("created_at")))]
    return max(moments) if moments else None


def dispatch(repo: str, token: str, ref: str) -> None:
    _call(
        f"{GITHUB}/repos/{repo}/actions/workflows/{WORKFLOW}/dispatches",
        {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        {"ref": ref, "inputs": {"trigger": "schedule"}},
    )


def main(
    env: dict[str, str] | None = None,
    now: datetime | None = None,
    fetch: Callable[[str | None], list[dict[str, Any]]] = sorare_nodes,
    started: Callable[[str, str], datetime | None] = last_started,
    start: Callable[[str, str, str], None] = dispatch,
    say: Callable[[str], None] = print,
) -> int:
    env = dict(os.environ) if env is None else env
    repo, token = env.get("GITHUB_REPOSITORY", ""), env.get("GITHUB_TOKEN", "")
    now = now or datetime.now(UTC)
    if not repo or not token:
        say("::warning::GITHUB_REPOSITORY and GITHUB_TOKEN are needed to start a refresh.")
        return 0
    try:
        lock = next_lock(fetch(env.get("SORARE_API_KEY") or None), now)
    except (urllib.error.URLError, KeyError, TypeError, ValueError, OSError) as error:
        say(f"::warning::Sorare's next lock could not be read ({type(error).__name__}: {error}); nothing started.")
        return 0
    if lock is None or lock - now > WINDOW:  # nothing near: no need to ask GitHub anything
        say(f"::notice::{decide(lock, now, None)[1]}")
        return 0
    try:
        ok, why = decide(lock, now, started(repo, token))
        if ok:
            start(repo, token, env.get("GITHUB_REF_NAME") or "main")
    except (urllib.error.URLError, KeyError, TypeError, ValueError, OSError) as error:
        say(f"::warning::The refresh could not be started ({type(error).__name__}: {error}).")
        return 0
    say(f"::notice::{'Started a refresh: ' if ok else 'No refresh: '}{why}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
