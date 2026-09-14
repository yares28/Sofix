"""Run the whole data pipeline in order.

    python -m app.jobs.refresh

0. database migrations (alembic upgrade head)
1. fixtures + results from football-data.org (needs FOOTBALL_DATA_ORG_TOKEN)
2. rating model predictions (football-data.co.uk history, no key)
3. kickoff weather from Open-Meteo (no key)
"""

import asyncio

from app.jobs import predict, seed_and_sync, sync_weather
from app.migrate import upgrade_to_head


def main() -> None:
    upgrade_to_head()
    print("1/3 syncing fixtures")
    asyncio.run(seed_and_sync.main())
    print("2/3 predicting")
    predict.main()
    print("3/3 weather")
    asyncio.run(sync_weather.main())


if __name__ == "__main__":
    main()
