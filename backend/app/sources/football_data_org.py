import httpx
from app.config import settings
BASE="https://api.football-data.org/v4"

class FootballDataOrg:
    def __init__(self):
        if not settings.football_data_org_token:
            raise RuntimeError("FOOTBALL_DATA_ORG_TOKEN required")
        self.h={"X-Auth-Token":settings.football_data_org_token}

    async def matches(self, season=None):
        params={} if season is None else {"season":season}
        async with httpx.AsyncClient(timeout=30) as c:
            r=await c.get(f"{BASE}/competitions/{settings.football_data_org_competition}/matches",headers=self.h,params=params)
            r.raise_for_status(); return r.json()

    async def standings(self):
        async with httpx.AsyncClient(timeout=30) as c:
            r=await c.get(f"{BASE}/competitions/{settings.football_data_org_competition}/standings",headers=self.h)
            r.raise_for_status(); return r.json()
