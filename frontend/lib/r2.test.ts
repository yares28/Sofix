import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blockAt, blocksAvailable, blockVersion, blockVersions, listR2, signed } from "./r2";

const R2 = { R2_ACCOUNT_ID: "acct", R2_BUCKET: "pages", R2_ACCESS_KEY_ID: "id", R2_SECRET_ACCESS_KEY: "secret" };
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("published blocks", () => {
  it("coalesces ten cold readers even while more than six other blocks are downloading", async () => {
    vi.stubEnv("SOFIX_BLOCKS_DIR", "");
    for (const [name, value] of Object.entries(R2)) vi.stubEnv(name, value);
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const fetch = vi.fn(async () => {
      await pending;
      return new Response(JSON.stringify({ updatedAt: "2026-10-29", payload: { score: 0 } }));
    });
    vi.stubGlobal("fetch", fetch);
    const first = blockAt("cold-main", "cold-v1");
    const others = Array.from({ length: 9 }, (_, i) => blockAt(`cold-${i}`, "cold-v1"));
    const readers = Array.from({ length: 10 }, () => blockAt("cold-main", "cold-v1"));
    finish();
    const results = await Promise.all([first, ...others, ...readers]);
    expect(results.every(result => result?.payload && (result.payload as { score: number }).score === 0)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(10); // one per distinct block, independent of concurrency
  });

  it("retries a block temporarily missing during publication rather than retaining a null forever", async () => {
    vi.stubEnv("SOFIX_BLOCKS_DIR", "");
    for (const [name, value] of Object.entries(R2)) vi.stubEnv(name, value);
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ updatedAt: "2026-10-29", payload: { score: 0 } })));
    vi.stubGlobal("fetch", fetch);
    expect(await blockAt("publish-race", "v1")).toBeNull();
    expect(await blockAt("publish-race", "v1")).toEqual({ updatedAt: "2026-10-29", payload: { score: 0 } });
  });

  it("does not reuse a block from a different local source with the same key and version", async () => {
    const dirs = Array.from({ length: 2 }, () => mkdtempSync(path.join(tmpdir(), "blocks-source-")));
    for (const [i, dir] of dirs.entries()) {
      writeFileSync(path.join(dir, "same.json"), JSON.stringify({ updatedAt: "2026-10-29", payload: { source: i } }));
      vi.stubEnv("SOFIX_BLOCKS_DIR", dir);
      expect((await blockAt("same", "v1"))?.payload).toEqual({ source: i });
    }
  });

  it("retries failed downloads and reads a new version after publication", async () => {
    vi.stubEnv("SOFIX_BLOCKS_DIR", "");
    for (const [name, value] of Object.entries(R2)) vi.stubEnv(name, value);
    const fetch = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ updatedAt: "2026-10-29", payload: { score: 0 } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ updatedAt: "2026-10-30", payload: { score: 10 } })));
    vi.stubGlobal("fetch", fetch);
    await expect(blockAt("retry-block", "v1")).rejects.toThrow("offline");
    expect((await blockAt("retry-block", "v1"))?.payload).toEqual({ score: 0 });
    expect((await blockAt("retry-block", "v2"))?.payload).toEqual({ score: 10 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("has none without R2 or a local copy, so loaders ask the stand-in API", () => {
    for (const name of [...Object.keys(R2), "SOFIX_BLOCKS_DIR"]) vi.stubEnv(name, "");
    expect(blocksAvailable()).toBe(false);
  });

  it("reads the local copy when SOFIX_BLOCKS_DIR is set, never the network", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "blocks-"));
    writeFileSync(path.join(dir, "index.json"), JSON.stringify({ sorare: "v1", "my_week:a": "v2", "my_week:b": "v3" }));
    writeFileSync(path.join(dir, `${encodeURIComponent("my_week:a")}.json`), JSON.stringify({ updatedAt: "2026-10-26T10:00:00Z", payload: { slug: "a" } }));
    vi.stubEnv("SOFIX_BLOCKS_DIR", dir);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(blocksAvailable()).toBe(true);
    expect(await blockVersion("sorare")).toBe("v1");
    expect(await blockVersion("missing")).toBeNull();
    expect([...(await blockVersions("my_week:")).keys()]).toEqual(["my_week:a", "my_week:b"]);
    expect(await blockAt("my_week:a", "v2")).toEqual({ updatedAt: "2026-10-26T10:00:00Z", payload: { slug: "a" } });
    expect(await blockAt("my_week:b", "v3")).toBeNull(); // listed but not downloaded: nothing, not an error
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lists every page of an R2 listing, keyed by block name with its ETag", async () => {
    vi.stubEnv("SOFIX_BLOCKS_DIR", "");
    for (const [name, value] of Object.entries(R2)) vi.stubEnv(name, value);
    const pages = [
      `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>t&amp;2</NextContinuationToken>
        <Contents><Key>blocks/missions_day:2026-10-26:limited.json</Key><ETag>&quot;aa&quot;</ETag></Contents></ListBucketResult>`,
      `<ListBucketResult><IsTruncated>false</IsTruncated>
        <Contents><Key>blocks/missions_edit:x&amp;y.json</Key><ETag>"bb"</ETag></Contents><Contents><Key>other.txt</Key><ETag>"cc"</ETag></Contents></ListBucketResult>`,
    ];
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (urls.push(url), new Response(pages.shift()))));
    expect(Object.fromEntries(await listR2("missions_"))).toEqual({ "missions_day:2026-10-26:limited": "aa", "missions_edit:x&y": "bb" });
    expect(urls[0]).toBe("https://acct.r2.cloudflarestorage.com/pages?list-type=2&prefix=blocks%2Fmissions_");
    expect(urls[1]).toContain("continuation-token=t%262");
  });

  it("signs the sorted query and the body, and writes only with the write key", () => {
    for (const [name, value] of Object.entries(R2)) vi.stubEnv(name, value);
    vi.stubEnv("R2_WRITE_ACCESS_KEY_ID", "");
    const now = new Date("2026-10-26T12:00:00Z");
    expect(signed("PUT", "blocks/a.json", {}, "{}", true, now)).toBeNull();
    const get = signed("GET", "blocks/a:b.json", {}, "", false, now)!;
    expect(get.url).toBe("https://acct.r2.cloudflarestorage.com/pages/blocks/a%3Ab.json");
    expect((get.init.headers as Record<string, string>).authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=id\/20261026\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  });
});
