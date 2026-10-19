import { createHash, createHmac } from "node:crypto";

/**
 * Server-only reads of the page blocks the jobs store on Cloudflare R2 (backend/app/services/r2.py, plans/neon-egress.md
 * step 1): R2 sends data for free, Neon only 5 GB a month. Each object is `blocks/<key>.json` = {updatedAt, payload}; it is
 * used only when its `updatedAt` is the write time Neon holds, so a block written another way (or a failed upload) is read
 * from Neon instead. Without the R2_* settings this always answers "not here".
 */
const NOT_HERE = undefined;

const settings = () => {
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: keyId, R2_SECRET_ACCESS_KEY: secret, R2_BUCKET: bucket } = process.env;
  return account && keyId && secret && bucket ? { account, keyId, secret, bucket } : null;
};

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const hmac = (key: string | Buffer, text: string) => createHmac("sha256", key).update(text).digest();

/** AWS Signature V4 for one GET, as R2's S3 API wants it. */
function signedGet(name: string, now = new Date()): { url: string; headers: Record<string, string> } | null {
  const s = settings();
  if (!s) return null;
  const host = `${s.account}.r2.cloudflarestorage.com`;
  const path = "/" + `${s.bucket}/${name}`.split("/").map((part) => encodeURIComponent(part)).join("/");
  const amz = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amz.slice(0, 8);
  const empty = sha256("");
  const signed = "host;x-amz-content-sha256;x-amz-date";
  const canonical = `GET\n${path}\n\nhost:${host}\nx-amz-content-sha256:${empty}\nx-amz-date:${amz}\n\n${signed}\n${empty}`;
  const scope = `${day}/auto/s3/aws4_request`;
  const key = ["auto", "s3", "aws4_request"].reduce((k, part) => hmac(k, part), hmac(`AWS4${s.secret}`, day));
  const signature = createHmac("sha256", key).update(`AWS4-HMAC-SHA256\n${amz}\n${scope}\n${sha256(canonical)}`).digest("hex");
  return {
    url: `https://${host}${path}`,
    headers: {
      "x-amz-content-sha256": empty,
      "x-amz-date": amz,
      authorization: `AWS4-HMAC-SHA256 Credential=${s.keyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
    },
  };
}

/** Python writes microseconds, Neon's driver hands back milliseconds: the same instant either way. */
export const sameInstant = (a: string, b: string): boolean => Date.parse(a) === Date.parse(b);

// Pages read several pieces of one block at once (lib/playData.ts, lib/missionsPool.ts): one download serves them all.
const recent = new Map<string, Promise<unknown>>();

async function download(key: string, updatedAt: string): Promise<unknown> {
  const request = signedGet(`blocks/${key}.json`);
  if (!request) return NOT_HERE;
  try {
    const response = await fetch(request.url, { headers: request.headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return NOT_HERE;
    const body = (await response.json()) as { updatedAt?: string; payload?: unknown };
    return body.updatedAt && sameInstant(body.updatedAt, updatedAt) ? body.payload : NOT_HERE;
  } catch {
    return NOT_HERE;
  }
}

/** The block `key` as written at `updatedAt`, or undefined when R2 does not hold that version (then read Neon). */
export function blockFromR2(key: string, updatedAt: string): Promise<unknown> {
  const id = `${key}@${updatedAt}`;
  let found = recent.get(id);
  if (!found) {
    found = download(key, updatedAt);
    recent.set(id, found);
    if (recent.size > 4) recent.delete(recent.keys().next().value as string);
  }
  return found;
}
