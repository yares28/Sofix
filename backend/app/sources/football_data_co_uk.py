import os
from io import StringIO
from pathlib import Path
import httpx, pandas as pd
BASE="https://www.football-data.co.uk/mmz4281"
USER_AGENT="FixtureDiff/0.1 (fixture difficulty research)"

def season_code(y): return f"{str(y)[-2:]}{str(y+1)[-2:]}"

async def download_la_liga(y):
    url=f"{BASE}/{season_code(y)}/SP1.csv"
    async with httpx.AsyncClient(timeout=30,follow_redirects=True) as c:
        r=await c.get(url); r.raise_for_status()
    return pd.read_csv(StringIO(r.text))

def decode_csv(raw: bytes) -> str:
    """Older files are latin-1; newer ones are UTF-8, sometimes with a BOM."""
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("latin-1")

def fetch_season_csv(y: int, cache_dir: Path, division: str = "SP1", refresh: bool = False,
                     client: httpx.Client | None = None) -> pd.DataFrame:
    """Download one season CSV once and reuse the cached copy afterwards.

    Pass refresh=True for the season in progress, whose file grows every matchday.
    """
    path = Path(cache_dir) / f"{division}_{season_code(y)}.csv"
    if refresh or not path.exists():
        url = f"{BASE}/{season_code(y)}/{division}.csv"
        owns_client = client is None
        http = client or httpx.Client(timeout=30, follow_redirects=True, headers={"User-Agent": USER_AGENT})
        try:
            response = http.get(url)
            response.raise_for_status()
        finally:
            if owns_client:
                http.close()
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix(".tmp")
        partial.write_bytes(response.content)
        os.replace(partial, path)  # never leave a truncated CSV in the cache
    return pd.read_csv(StringIO(decode_csv(path.read_bytes())))

def best_1x2_columns(df):
    for cols in [("AvgCH","AvgCD","AvgCA"),("AvgH","AvgD","AvgA"),("B365CH","B365CD","B365CA"),("B365H","B365D","B365A")]:
        if all(c in df.columns for c in cols): return cols
    return None
