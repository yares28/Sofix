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
    expect(LATEST_EXTENSION_VERSION).toBe("0.3.5");
    expect(extensionIsLatest("0.2.3")).toBe(false);
    expect(extensionIsLatest("0.3.0")).toBe(false);
    expect(extensionIsLatest("0.3.1")).toBe(false);
    expect(extensionIsLatest("0.3.2")).toBe(false);
    expect(extensionIsLatest("0.3.3")).toBe(false);
    expect(extensionIsLatest("0.3.4")).toBe(false);
    expect(extensionIsLatest("0.3.5")).toBe(true);
    expect(extensionIsLatest("junk")).toBe(false);
  });
});
