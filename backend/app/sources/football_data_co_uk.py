import os
from email.utils import formatdate
from io import StringIO
from pathlib import Path

import httpx
import pandas as pd

BASE = "https://www.football-data.co.uk/mmz4281"
USER_AGENT = "Sofix/0.1 (fixture difficulty research)"


def season_code(y):
    return f"{str(y)[-2:]}{str(y + 1)[-2:]}"


def decode_csv(raw: bytes) -> str:
    """Older files are latin-1; newer ones are UTF-8, sometimes with a BOM."""
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


def cached_path(y: int, cache_dir: Path, division: str = "SP1") -> Path:
    return Path(cache_dir) / f"{division}_{season_code(y)}.csv"


def fetch_season_csv(
    y: int, cache_dir: Path, division: str = "SP1", refresh: bool = False, client: httpx.Client | None = None
) -> pd.DataFrame:
    """Download one season CSV once and reuse the cached copy afterwards.

    Pass refresh=True for the season in progress, whose file grows every matchday. When a cached
    copy exists the request is conditional (If-Modified-Since), so an unchanged file costs a 304.
    """
    path = cached_path(y, cache_dir, division)
    if refresh or not path.exists():
        url = f"{BASE}/{season_code(y)}/{division}.csv"
        headers = {"If-Modified-Since": formatdate(path.stat().st_mtime, usegmt=True)} if path.exists() else {}
        owns_client = client is None
        http = client or httpx.Client(timeout=30, follow_redirects=True, headers={"User-Agent": USER_AGENT})
        try:
            response = http.get(url, headers=headers)
            if response.status_code != 304:
                response.raise_for_status()
        finally:
            if owns_client:
                http.close()
        if response.status_code != 304:
            path.parent.mkdir(parents=True, exist_ok=True)
            partial = path.with_suffix(".tmp")
            partial.write_bytes(response.content)
            os.replace(partial, path)  # never leave a truncated CSV in the cache
    return pd.read_csv(StringIO(decode_csv(path.read_bytes())))
