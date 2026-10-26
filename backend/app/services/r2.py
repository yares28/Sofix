"""Cloudflare R2 (its S3 API) for the published page blocks (plans/neon-egress.md step 1, owner's ask 20 Oct 2026).

Neon's free plan sends 5 GB a month; R2 sends data for free. Each block written by `publish.put` is also stored here as
`blocks/<key>.json` = {"updatedAt", "payload"}, and the web app reads it from here alone (frontend/lib/r2.ts), keyed on
its ETag; `sync` (every job's last step) keeps R2 level with Neon (plans/neon-write-mostly.md §4). Without the R2_*
settings nothing is uploaded. Requests are signed with AWS
Signature V4 by hand: a few lines instead of an SDK.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any
from urllib.parse import quote

import httpx

from app.services.timeutil import as_utc

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

SETTINGS = ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")
_read_offline = False  # a network failure uses Neon for this job instead of delaying every block


def configured() -> bool:
    return all(os.environ.get(name) for name in SETTINGS)


def block_name(key: str) -> str:
    return f"blocks/{key}.json"


def request(
    method: str, name: str, body: bytes = b"", client: httpx.Client | None = None, query: dict[str, str] | None = None
) -> httpx.Response:
    """One signed request on the bucket's object `name` ("" with `query`: the bucket itself, a listing)."""
    account, key_id, secret, bucket = (os.environ[setting] for setting in SETTINGS)
    host = f"{account}.r2.cloudflarestorage.com"
    path = "/" + quote(f"{bucket}/{name}" if name else bucket, safe="/-_.~")
    search = "&".join(f"{quote(k, safe='-_.~')}={quote(v, safe='-_.~')}" for k, v in sorted((query or {}).items()))
    amz = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    body_hash = hashlib.sha256(body).hexdigest()
    signed = "host;x-amz-content-sha256;x-amz-date"
    canonical = f"{method}\n{path}\n{search}\nhost:{host}\nx-amz-content-sha256:{body_hash}\nx-amz-date:{amz}\n\n{signed}\n{body_hash}"
    scope = f"{amz[:8]}/auto/s3/aws4_request"
    to_sign = f"AWS4-HMAC-SHA256\n{amz}\n{scope}\n{hashlib.sha256(canonical.encode()).hexdigest()}"
    signing = ("AWS4" + secret).encode()
    for part in (amz[:8], "auto", "s3", "aws4_request"):
        signing = hmac.new(signing, part.encode(), hashlib.sha256).digest()
    signature = hmac.new(signing, to_sign.encode(), hashlib.sha256).hexdigest()
    headers = {
        "x-amz-content-sha256": body_hash,
        "x-amz-date": amz,
        "authorization": f"AWS4-HMAC-SHA256 Credential={key_id}/{scope}, SignedHeaders={signed}, Signature={signature}",
    }
    if body:
        headers["content-type"] = "application/json"
    http = client or httpx.Client(timeout=30)
    try:
        return http.request(
            method, f"https://{host}{path}{'?' + search if search else ''}", headers=headers, content=body
        )
    finally:
        if client is None:
            http.close()


def put_block(key: str, payload: Any, updated_at: datetime) -> bool:
    """Store one block; a failure is logged and the job's last step (`sync`) tries again, so it never stops a job."""
    if not configured():
        return False
    body = json.dumps({"updatedAt": updated_at.isoformat(), "payload": payload}, separators=(",", ":")).encode()
    return put_body(key, body)


def put_body(key: str, body: bytes, client: httpx.Client | None = None) -> bool:
    try:
        response = request("PUT", block_name(key), body, client)
    except httpx.HTTPError as error:
        logger.warning("R2 upload of %s failed: %s", key, type(error).__name__)
        return False
    if response.status_code != 200:
        logger.warning("R2 upload of %s answered HTTP %d", key, response.status_code)
    return response.status_code == 200


def get_block(key: str, updated_at: datetime) -> dict[str, Any] | None:
    """Read only the published version Neon names; an unavailable/stale block leaves Neon as fallback."""
    global _read_offline
    if not configured() or _read_offline:
        return None
    try:
        response = request("GET", block_name(key))
        if response.status_code == 200:
            block = response.json()
            if (
                isinstance(block, dict)
                and "payload" in block
                and as_utc(datetime.fromisoformat(block["updatedAt"])) == as_utc(updated_at)
            ):
                return block
    except httpx.HTTPError:
        _read_offline = True
    except (ValueError, KeyError, TypeError):
        pass
    logger.warning("R2 read of %s unavailable or out of date; using Neon", key)
    return None


def _unescape(text: str) -> str:
    return (
        text.replace("&quot;", '"')
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
    )


def list_blocks(prefix: str = "") -> dict[str, tuple[str, datetime]]:
    """Every block under `prefix` on R2: key -> (ETag, when it was uploaded, whole seconds). One request per 1,000."""
    out: dict[str, tuple[str, datetime]] = {}
    token = ""
    with httpx.Client(timeout=30) as http:
        while True:
            query = {"list-type": "2", "prefix": f"blocks/{prefix}"}
            if token:
                query["continuation-token"] = token
            response = request("GET", "", client=http, query=query)
            response.raise_for_status()
            xml = response.text
            for item in re.findall(r"<Contents>(.*?)</Contents>", xml, re.S):
                name = _unescape(re.search(r"<Key>(.*?)</Key>", item, re.S).group(1))  # type: ignore[union-attr]
                etag = _unescape(re.search(r"<ETag>(.*?)</ETag>", item, re.S).group(1)).strip('"')  # type: ignore[union-attr]
                at = datetime.fromisoformat(re.search(r"<LastModified>(.*?)</LastModified>", item).group(1))  # type: ignore[union-attr]
                if name.startswith("blocks/") and name.endswith(".json"):
                    out[name[7:-5]] = (etag, as_utc(at))
            more = re.search(r"<NextContinuationToken>(.*?)</NextContinuationToken>", xml)
            if "<IsTruncated>true</IsTruncated>" not in xml or not more:
                return out
            token = _unescape(more.group(1))


def delete_block(key: str) -> bool:
    try:
        return request("DELETE", block_name(key)).status_code in (200, 204)
    except httpx.HTTPError:
        return False


# Never copied: the ledger's own rows and the Neon switch's marker. Blocks only R2 holds (built from other tables by
# app/services/player_blocks.py) are never deleted for missing from read_models.
NOT_COPIED = ("neon_ledger:", "neon_live")
R2_ONLY = ("player_games:", "refresh_runs")
SAME_UPLOAD = timedelta(seconds=1)  # R2 lists whole seconds; an upload is never earlier than its Neon write


def sync(db: Session) -> dict[str, int]:
    """Leave R2 holding every block's newest version, for pages that read R2 alone (plans/neon-write-mostly.md).

    Blocks written outside `publish.put` (merges inside Postgres, the web app's own writes, a failed upload) are copied:
    a block missing on R2, or uploaded before its last write, is read from Neon and uploaded. A block Neon no longer
    holds is deleted. R2 is listed before Neon is read, so a block written in between is never deleted.
    """
    from sqlalchemy import select

    from app.models import ReadModel

    done = {"uploaded": 0, "deleted": 0, "failed": 0}
    if not configured():
        return done
    remote = list_blocks()
    stamps = {
        key: as_utc(at)
        for key, at in db.execute(select(ReadModel.key, ReadModel.updated_at)).tuples()
        if not key.startswith(NOT_COPIED)
    }
    # ponytail: a rewrite in the same second as the previous upload, whose own upload failed, waits for its next write.
    stale = [key for key, at in stamps.items() if key not in remote or remote[key][1] + SAME_UPLOAD < at]
    for offset in range(0, len(stale), 50):
        chunk = stale[offset : offset + 50]
        rows = db.execute(
            select(ReadModel.key, ReadModel.payload, ReadModel.updated_at).where(ReadModel.key.in_(chunk))
        )
        for key, payload, at in rows.tuples():
            done["uploaded" if put_block(key, payload, as_utc(at)) else "failed"] += 1
    for key in remote:
        if key not in stamps and not key.startswith(NOT_COPIED + R2_ONLY):
            done["deleted" if delete_block(key) else "failed"] += 1
    logger.info("R2 sync: %s", done)
    return done
