"""Half-hourly, bounded post-game score checks; no planner or football/odds source reads."""

from datetime import UTC, datetime

from app.config import settings
from app.db import SessionLocal
from app.logging_config import configure_logging
from app.services.publish import notify_app
from app.sorare import audit, score_checks
from app.sorare.client import SorareClient


def main() -> int:
    configure_logging()
    with SessionLocal() as db, SorareClient() as client:
        now = datetime.now(UTC)
        result = score_checks.run(db, client, now)
        if result["games"] or result["pending"] or audit.settlement_due(db, now):
            audit.publish(db, now)
            notify_app(settings.app_url, settings.revalidate_secret, settings.vercel_bypass_secret)
    print(f"Score checks: {result['games']} games read, {result['failed']} unavailable, {result['pending']} pending.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
