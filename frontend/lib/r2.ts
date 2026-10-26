import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where pages read the blocks the jobs publish (plans/neon-write-mostly.md "Pages read R2 only"). Each block is
 * `blocks/<key>.json` = {updatedAt, payload} on Cloudflare R2, which sends data for free; Neon is never asked.
 *
 * - The live site (and `next start`) reads R2 with the R2_* settings. A block's version is its ETag (an md5 of the object),
 *   asked with one HEAD, or for many blocks with one listing; pages cache each payload under that version.
 * - A server with SOFIX_BLOCKS_DIR set (`npm run dev`, through frontend/.env.local) reads the local copy in that folder
 *   instead, which `npm run blocks` downloads from R2 (scripts/blocks.mjs). It never reaches R2 or Neon while serving.
 * - With neither (the browser tests, vitest) there are no blocks and loaders ask the FastAPI stand-in.
 *
 * Kept to erasable TypeScript: scripts/blocks.mjs runs this file with Node's type stripping.
 */
export type Block = { updatedAt: string; payload: unknown };
type Settings = { account: string; keyId: string; secret: string; bucket: string };

const localDir = (): string | null => {
  const dir = process.env.SOFIX_BLOCKS_DIR;
  return dir ? path.resolve(dir) : null;
};

const settings = (write = false): Settings | null => {
  const env = process.env;
  const keyId = write ? env.R2_WRITE_ACCESS_KEY_ID : env.R2_ACCESS_KEY_ID;
  const secret = write ? env.R2_WRITE_SECRET_ACCESS_KEY : env.R2_SECRET_ACCESS_KEY;
  const { R2_ACCOUNT_ID: account, R2_BUCKET: bucket } = env;
  return account && keyId && secret && bucket ? { account, keyId, secret, bucket } : null;
};

/** Whether this server has published blocks to read (R2 or the local copy). */
export const blocksAvailable = (): boolean => Boolean(localDir() || settings());

const sha256 = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
const hmac = (key: string | Buffer, text: string) => createHmac("sha256", key).update(text).digest();
// RFC 3986, as Signature V4 wants it (encodeURIComponent leaves !'()* alone).
const encode = (text: string) => encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** One AWS Signature V4 request on the bucket, as R2's S3 API wants it. `name` "" is the bucket itself (a listing). */
export function signed(
  method: string,
  name: string,
  query: Record<string, string> = {},
  body = "",
  write = false,
  now = new Date(),
): { url: string; init: RequestInit } | null {
  const s = settings(write);
  if (!s) return null;
  const host = `${s.account}.r2.cloudflarestorage.com`;
  const uri = "/" + [s.bucket, ...(name ? name.split("/") : [])].map(encode).join("/");
  const search = Object.keys(query).sort().map((k) => `${encode(k)}=${encode(query[k] ?? "")}`).join("&");
  const amz = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amz.slice(0, 8);
  const bodyHash = sha256(body);
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonical = `${method}\n${uri}\n${search}\nhost:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amz}\n\n${signedHeaders}\n${bodyHash}`;
  const scope = `${day}/auto/s3/aws4_request`;
  const key = ["auto", "s3", "aws4_request"].reduce((k, part) => hmac(k, part), hmac(`AWS4${s.secret}`, day));
  const signature = createHmac("sha256", key).update(`AWS4-HMAC-SHA256\n${amz}\n${scope}\n${sha256(canonical)}`).digest("hex");
  const headers: Record<string, string> = {
    "x-amz-content-sha256": bodyHash,
    "x-amz-date": amz,
    authorization: `AWS4-HMAC-SHA256 Credential=${s.keyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (body) headers["content-type"] = "application/json";
  return {
    url: `https://${host}${uri}${search ? `?${search}` : ""}`,
    init: { method, headers, body: body || undefined, cache: "no-store", signal: AbortSignal.timeout(10_000) },
  };
}

const objectName = (key: string) => `blocks/${key}.json`;
const unquote = (etag: string | null) => (etag ?? "").replace(/"/g, "");
const unescapeXml = (text: string) =>
  text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Every R2 block under `prefix`: key -> version (ETag). One request per 1,000 blocks. */
export async function listR2(prefix: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let token = "";
  for (;;) {
    const query: Record<string, string> = { "list-type": "2", prefix: objectName(prefix).slice(0, -".json".length) };
    if (token) query["continuation-token"] = token;
    const request = signed("GET", "", query);
    if (!request) return out;
    const response = await fetch(request.url, request.init);
    if (!response.ok) throw new Error(`R2 listing answered HTTP ${response.status}`);
    const xml = await response.text();
    for (const [, item] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const name = unescapeXml(item?.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? "");
      if (name.startsWith("blocks/") && name.endsWith(".json")) out.set(name.slice(7, -5), unquote(unescapeXml(item?.match(/<ETag>([\s\S]*?)<\/ETag>/)?.[1] ?? "")));
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? unescapeXml(xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ?? "") : "";
    if (!token) return out;
  }
}

/** The local copy's index: key -> version, as downloaded. */
async function localIndex(dir: string): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(path.join(dir, "index.json"), "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}
const localFile = (dir: string, key: string) => path.join(dir, `${encodeURIComponent(key)}.json`);

/** The current version of one block, or null when it was never published. */
export async function blockVersion(key: string): Promise<string | null> {
  const dir = localDir();
  if (dir) return (await localIndex(dir))[key] ?? null;
  const request = signed("HEAD", objectName(key));
  if (!request) return null;
  const response = await fetch(request.url, request.init);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`R2 answered HTTP ${response.status} for ${key}`);
  return unquote(response.headers.get("etag"));
}

/** Every block whose key starts with `prefix`: key -> version. */
export async function blockVersions(prefix: string): Promise<Map<string, string>> {
  const dir = localDir();
  if (dir) return new Map(Object.entries(await localIndex(dir)).filter(([key]) => key.startsWith(prefix)));
  return listR2(prefix);
}

async function download(key: string): Promise<Block | null> {
  const dir = localDir();
  let text: string;
  if (dir) {
    try {
      text = await readFile(localFile(dir, key), "utf8");
    } catch {
      return null;
    }
  } else {
    const request = signed("GET", objectName(key));
    if (!request) return null;
    const response = await fetch(request.url, request.init);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`R2 answered HTTP ${response.status} for ${key}`);
    text = await response.text();
  }
  const block = JSON.parse(text) as Partial<Block>;
  return typeof block.updatedAt === "string" && "payload" in block ? { updatedAt: block.updatedAt, payload: block.payload } : null;
}

// Pages read several pieces of one block at once (lib/playData.ts, lib/missionsPool.ts): one download serves them all.
const recent = new Map<string, Promise<Block | null>>();

/** The block `key` at `version`. A failed download is not remembered, so the next view tries again. */
export function blockAt(key: string, version: string): Promise<Block | null> {
  const id = `${key}@${version}`;
  let found = recent.get(id);
  if (!found) {
    found = download(key);
    recent.set(id, found);
    found.catch(() => recent.delete(id));
    if (recent.size > 6) recent.delete(recent.keys().next().value as string);
  }
  return found;
}

/**
 * Store one block the web app itself wrote to Neon (an extension check-in, a saved week), so pages see it at once. Needs
 * the R2_WRITE_* settings; without them, or when the upload fails, the next job copies it across (backend r2.sync).
 */
export async function putBlock(key: string, payload: unknown, updatedAt: string | Date): Promise<boolean> {
  const at = updatedAt instanceof Date ? updatedAt.toISOString() : new Date(updatedAt).toISOString();
  const request = signed("PUT", objectName(key), {}, JSON.stringify({ updatedAt: at, payload }), true);
  if (!request) return false;
  try {
    return (await fetch(request.url, request.init)).ok;
  } catch {
    return false;
  }
}

/**
 * The local copy (`npm run blocks`): every R2 block into `dir`, downloading only those whose version changed and deleting
 * those R2 no longer has. Returns what it did.
 */
export async function copyBlocks(dir: string): Promise<{ blocks: number; downloaded: number; removed: number; bytes: number }> {
  if (!settings()) throw new Error("frontend/.env.local needs the R2_* read settings");
  const remote = await listR2("");
  const kept = await localIndex(dir);
  await mkdir(dir, { recursive: true });
  const stale = [...remote].filter(([key, version]) => kept[key] !== version);
  let bytes = 0;
  const done: Record<string, string> = Object.fromEntries(Object.entries(kept).filter(([key]) => remote.has(key)));
  for (let i = 0; i < stale.length; i += 8) {
    await Promise.all(
      stale.slice(i, i + 8).map(async ([key, version]) => {
        const request = signed("GET", objectName(key))!;
        const response = await fetch(request.url, { ...request.init, signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`R2 answered HTTP ${response.status} for ${key}`);
        const text = await response.text();
        bytes += text.length;
        await writeFile(localFile(dir, key), text);
        done[key] = version;
      }),
    );
    await writeFile(path.join(dir, "index.json"), JSON.stringify(done));
  }
  const gone = Object.keys(kept).filter((key) => !remote.has(key));
  await Promise.all(gone.map((key) => rm(localFile(dir, key), { force: true })));
  await writeFile(path.join(dir, "index.json"), JSON.stringify(done));
  return { blocks: remote.size, downloaded: stale.length, removed: gone.length, bytes };
}

/** Hours since the local copy was last brought up to date, or Infinity when there is none. */
export async function copyAgeHours(dir: string): Promise<number> {
  try {
    return (Date.now() - (await stat(path.join(dir, "index.json"))).mtimeMs) / 3_600_000;
  } catch {
    return Infinity;
  }
}
