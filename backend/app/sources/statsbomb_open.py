import httpx
RAW="https://raw.githubusercontent.com/hudl/open-data/master/data"
async def get(path):
    async with httpx.AsyncClient(timeout=30) as c:
        r=await c.get(f"{RAW}/{path}"); r.raise_for_status(); return r.json()
async def competitions(): return await get("competitions.json")
async def matches(comp_id,season_id): return await get(f"matches/{comp_id}/{season_id}.json")
async def events(match_id): return await get(f"events/{match_id}.json")
async def lineups(match_id): return await get(f"lineups/{match_id}.json")
