"""Publish a due Audit from saved results, independently of source-refresh cooldowns."""

from datetime import UTC, datetime

from app.config import settings
from app.db import SessionLocal
from app.logging_config import configure_logging
from app.services.publish import notify_app
from app.sorare import audit


def main() -> int:
    configure_logging()
    now = datetime.now(UTC)
    with SessionLocal() as db:
        if not audit.settlement_due(db, now):
            print("Audit is up to date; no publication needed.")
            return 0
        result = audit.publish(db, now)
        notify_app(settings.app_url, settings.revalidate_secret, settings.vercel_bypass_secret)
    print(f"Audit published: {result['settled']} checked source cases.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
