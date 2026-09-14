"""Club crest URLs: only football-data.org's crest host is ever stored or sent to the browser.

The URL ends up in an <img src>, so anything else from the API payload (another host, http,
credentials, odd characters) is dropped rather than trusted.
"""

from __future__ import annotations

import re
from urllib.parse import urlsplit

CREST_HOST = "crests.football-data.org"
MAX_LENGTH = 255
_PATH = re.compile(r"^/[A-Za-z0-9_-]+\.(svg|png|gif|jpe?g|webp)$")


def safe_crest_url(url: str | None) -> str | None:
    if not url or len(url) > MAX_LENGTH:
        return None
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return None
    if (
        parts.scheme != "https"
        or parts.hostname != CREST_HOST
        or parts.netloc != CREST_HOST  # no credentials, no port
        or port is not None
        or parts.query
        or parts.fragment
        or not _PATH.match(parts.path)
    ):
        return None
    return url
