"""Run the whole data pipeline in order.

    python -m app.jobs.refresh

0. database migrations (alembic upgrade head)
1. fixtures + results from football-data.org (needs FOOTBALL_DATA_ORG_TOKEN)
2. rating model predictions (football-data.co.uk history, no key)
3. kickoff weather from Open-Meteo (no key)
"""

import asyncio
import logging

from app.jobs import predict, seed_and_sync, sync_weather
from app.logging_config import configure_logging
from app.migrate import upgrade_to_head

logger = logging.getLogger(__name__)


def main() -> None:
    configure_logging()
    upgrade_to_head()
    logger.info("1/3 syncing fixtures")
    asyncio.run(seed_and_sync.main())
    logger.info("2/3 predicting")
    predict.main()
    logger.info("3/3 weather")
    asyncio.run(sync_weather.main())


if __name__ == "__main__":
    main()
