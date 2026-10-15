"""Plan a locked Sorare gameweek again as of a minute before its lock: a dry run that writes nothing.

    cd backend && python ../scripts/replan_week.py football-13-16-oct-2026 2026-10-13T14:00:00Z [--keep]

With --keep the plan replaces the week's kept plan (`sorare_plan:<slug>`, marked `rebuilt`) and the app is asked to reload;
only with the owner's yes, since the kept plan is otherwise written once and never touched.

For a week whose kept plan (`sorare_plan:<slug>`) is wrong or missing: GW22's was kept from a 12 Oct copy after the move to
Sofix B (15 Oct 2026). Left out, since each would carry what happened after the lock: Futbol Fantasy (its pages now show the
real elevens), Understat xG, every game played after the lock and Sorare start readings seen after it. Each plan is printed as
a GitHub notice, so a run's plans can be read from its annotations.
"""

import argparse
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.config import settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.jobs import sorare as job  # noqa: E402
from app.services.publish import notify_app, put  # noqa: E402
from app.sorare import early, frozen, starts  # noqa: E402
from app.sorare import publish as pub  # noqa: E402
from app.sources import understat  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("slug")
    parser.add_argument("lock", help="the week's lock, ISO time")
    parser.add_argument("--keep", action="store_true", help="replace the week's kept plan with this one")
    args = parser.parse_args()
    lock = datetime.fromisoformat(args.lock.replace("Z", "+00:00")).astimezone(UTC)
    at = lock - timedelta(minutes=1)

    class Then(datetime):
        @classmethod
        def now(cls, tz: Any = None) -> datetime:
            return at

    job.datetime = Then  # type: ignore[misc]
    job.read_lineups = lambda *a, **k: (None, None)
    understat.fetch_leagues = lambda *a, **k: {}
    early.plan = lambda *a, **k: None
    seen = starts.seen_on_sorare
    starts.seen_on_sorare = lambda db, now, days=10: {
        game: {p: v for p, v in players.items() if isinstance(v, list) and len(v) > 1 and v[1] <= lock.timestamp()}
        for game, players in seen(db, now, days).items()
    }
    league = job.cached_league
    job.cached_league = lambda db, now=None: {
        slug: {**entry, "games": [g for g in entry.get("games") or [] if datetime.fromisoformat(str(g["date"]).replace("Z", "+00:00")).astimezone(UTC) < lock]}
        for slug, entry in league(db, now=at).items()
    }
    got: dict[str, Any] = {}
    build = pub.build_payload

    def keep(*a: Any, **k: Any) -> dict[str, Any]:
        got["payload"] = build(*a, **k)
        return got["payload"]

    pub.build_payload = keep

    with SessionLocal() as db:
        summary = job.run(db, dry_run=True)
    print({k: summary.get(k) for k in ("gameweek", "plans", "playable", "calls", "failed")})
    week = next((w for w in (got.get("payload") or {}).get("weeks", []) if w["gameweek"]["slug"] == args.slug), None)
    if week is None:
        print(f"::error::{args.slug} was not planned")
        return 1
    for plan in week["plans"]:
        lines = [f"Plan {plan['rank']}: any reward {plan['pAny']:.0%}, essence {plan['essence']:.1f}, cash {plan['cash']:.2f}, {plan['cardsUsed']} cards"]
        for lu in plan["lineups"]:
            cards = [f"{c['name']}{' (C)' if c.get('captain') else ''} {c['x']:.0f}" for c in lu["starters"]]
            subs = [f"{c['name']} {c['x']:.0f}" for c in lu["subs"]]
            lines.append(f"{lu['comp']} ({lu['rarity']}) | xScore {lu['x']:.0f} | reward {lu['pReturn']:.0%}")
            lines.append("  " + ", ".join(cards) + (" | subs: " + ", ".join(subs) if subs else ""))
        print("::notice title=Plan " + str(plan.get("rank")) + "::" + "%0A".join(lines))
    if args.keep:
        now = datetime.now(UTC)  # only the job's clock was moved back
        with SessionLocal() as db:
            put(db, f"{frozen.PLAN_PREFIX}{args.slug}", {**frozen.of_week(week, at, now), "rebuilt": now.isoformat()}, now)
        print(f"::notice title=Kept::{frozen.PLAN_PREFIX}{args.slug} replaced; reload: {notify_app(settings.app_url, settings.revalidate_secret, settings.vercel_bypass_secret)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
