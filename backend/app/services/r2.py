"""Cloudflare R2 (its S3 API) for the published page blocks (plans/neon-egress.md step 1, owner's ask 20 Oct 2026).

Neon's free plan sends 5 GB a month; R2 sends data for free. Each block written by `publish.put` is also stored here as
`blocks/<key>.json` = {"updatedAt", "payload"}, and the web app reads it from here (frontend/lib/r2.ts), checking that
its `updatedAt` is the one Neon holds. Without the R2_* settings nothing is uploaded. Requests are signed with AWS
Signature V4 by hand: a few lines instead of an SDK.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

SETTINGS = ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")


def configured() -> bool:
    return all(os.environ.get(name) for name in SETTINGS)


def block_name(key: str) -> str:
    return f"blocks/{key}.json"


def request(method: str, name: str, body: bytes = b"", client: httpx.Client | None = None) -> httpx.Response:
    """One signed request on the bucket's object `name`."""
    account, key_id, secret, bucket = (os.environ[setting] for setting in SETTINGS)
    host = f"{account}.r2.cloudflarestorage.com"
    path = "/" + quote(f"{bucket}/{name}", safe="/-_.~")
    amz = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    body_hash = hashlib.sha256(body).hexdigest()
    signed = "host;x-amz-content-sha256;x-amz-date"
    canonical = (
        f"{method}\n{path}\n\nhost:{host}\nx-amz-content-sha256:{body_hash}\nx-amz-date:{amz}\n\n{signed}\n{body_hash}"
    )
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
        return http.request(method, f"https://{host}{path}", headers=headers, content=body)
    finally:
        if client is None:
            http.close()


def put_block(key: str, payload: Any, updated_at: datetime) -> bool:
    """Store one block; a failure is logged and the page falls back to Neon, so it never stops a job."""
    if not configured():
        return False
    body = json.dumps({"updatedAt": updated_at.isoformat(), "payload": payload}, separators=(",", ":")).encode()
    try:
        response = request("PUT", block_name(key), body)
    except httpx.HTTPError as error:
        logger.warning("R2 upload of %s failed: %s", key, type(error).__name__)
        return False
    if response.status_code != 200:
        logger.warning("R2 upload of %s answered HTTP %d", key, response.status_code)
    return response.status_code == 200
