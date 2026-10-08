import { describe, expect, it } from "vitest";
import { extensionAtLeast, extensionIsLatest, LATEST_EXTENSION_VERSION, parsePing, pingExtension } from "./extension";

describe("extension ping", () => {
  it("reads the extension's answer", () => {
    expect(parsePing({ ok: true, version: "0.1.0", sorareUser: "Yares", appReachable: true })).toEqual({
      version: "0.1.0",
      sorareUser: "Yares",
      appReachable: true,
    });
    expect(parsePing({ ok: true, version: "0.1.0", sorareUser: null })).toEqual({ version: "0.1.0", sorareUser: null, appReachable: null });
  });

  it("ignores anything else", () => {
    expect(parsePing(undefined)).toBeNull();
    expect(parsePing({ ok: false })).toBeNull();
    expect(parsePing({ ok: true, version: "latest", sorareUser: null })).toBeNull();
    expect(parsePing({ ok: true, version: "0.1.0", sorareUser: "x".repeat(41) })).toBeNull();
  });

  it("answers null where Chrome's extension messaging doesn't exist (phones, other browsers)", async () => {
    await expect(pingExtension(10)).resolves.toBeNull();
  });

  it("compares the loaded extension with the minimum feature version", () => {
    expect(extensionAtLeast("0.1.0")).toBe(false);
    expect(extensionAtLeast("0.1.1")).toBe(true);
    expect(extensionAtLeast("0.2.0")).toBe(true);
    expect(extensionAtLeast("1.0.0")).toBe(true);
    expect(extensionAtLeast("latest")).toBe(false);
  });

  it("knows the newest build, which older ones still work without (they lack the live Futbol Fantasy reads, the two-game mark)", () => {
    expect(LATEST_EXTENSION_VERSION).toBe("0.3.9");
    expect(extensionIsLatest("0.2.3")).toBe(false);
    expect(extensionIsLatest("0.3.0")).toBe(false);
    expect(extensionIsLatest("0.3.1")).toBe(false);
    expect(extensionIsLatest("0.3.2")).toBe(false);
    expect(extensionIsLatest("0.3.3")).toBe(false);
    expect(extensionIsLatest("0.3.4")).toBe(false);
    expect(extensionIsLatest("0.3.5")).toBe(false);
    expect(extensionIsLatest("0.3.8")).toBe(false);
    expect(extensionIsLatest("0.3.9")).toBe(true);
    expect(extensionIsLatest("junk")).toBe(false);
  });
});

describe("an extension Chrome put to sleep", () => {
  it("is asked again, longer, before the page says it is not there", async () => {
    let calls = 0;
    const runtime = {
      lastError: undefined,
      sendMessage: (_id: string, _message: unknown, reply: (response: unknown) => void) => {
        calls += 1;
        // the first message only wakes it: no answer in time; the second gets one
        if (calls === 2) setTimeout(() => reply({ ok: true, version: "0.3.7", sorareUser: "Yares", appReachable: true }), 5);
      },
    };
    const before = (globalThis as { chrome?: unknown }).chrome;
    (globalThis as { chrome?: unknown }).chrome = { runtime };
    try {
      expect(await pingExtension(20)).toMatchObject({ version: "0.3.7" });
      expect(calls).toBe(2);
    } finally {
      (globalThis as { chrome?: unknown }).chrome = before;
    }
  });
});
