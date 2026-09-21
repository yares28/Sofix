import { describe, expect, it } from "vitest";
import { failureMessage, isSameOriginRequest, isStale, refreshLabel, viewAfterPoll, viewAfterStart } from "./refresh";
import type { ApiResponse, RefreshRun, RefreshStatus } from "./types";

const headers = (values: Record<string, string>) => new Headers(values);
const NOW = Date.parse("2026-09-14T12:00:00Z");

function run(overrides: Partial<RefreshRun> = {}): RefreshRun {
  return {
    id: 7,
    trigger: "button",
    status: "running",
    step: "sync",
    started_at: "2026-09-14T11:59:00Z",
    finished_at: null,
    error: null,
    steps: {},
    ...overrides,
  };
}

const body = (data: RefreshStatus | null, error: string | null = null): ApiResponse<RefreshStatus> => ({
  success: error === null,
  data,
  error,
});

describe("isSameOriginRequest", () => {
  it("needs the custom header and a same-origin fetch", () => {
    expect(isSameOriginRequest(headers({ "x-fdr-refresh": "1", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOriginRequest(headers({ "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(isSameOriginRequest(headers({ "x-fdr-refresh": "1", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOriginRequest(headers({ "x-fdr-refresh": "1", "sec-fetch-site": "same-site" }))).toBe(false);
  });

  it("falls back to Origin vs Host when Sec-Fetch-Site is missing", () => {
    const base = { "x-fdr-refresh": "1", host: "127.0.0.1:3000" };
    expect(isSameOriginRequest(headers({ ...base, origin: "http://127.0.0.1:3000" }))).toBe(true);
    expect(isSameOriginRequest(headers({ ...base, origin: "https://evil.example" }))).toBe(false);
    expect(isSameOriginRequest(headers(base))).toBe(false);
    expect(isSameOriginRequest(headers({ ...base, origin: "not a url" }))).toBe(false);
  });
});

describe("isStale", () => {
  it("flags data not synced for more than 36 hours", () => {
    expect(isStale("2026-09-13T01:00:00Z", NOW)).toBe(false); // 35 h
    expect(isStale("2026-09-12T23:00:00Z", NOW)).toBe(true); // 37 h
    expect(isStale(null, NOW)).toBe(false);
  });
});

describe("refresh views", () => {
  it("maps start responses", () => {
    expect(viewAfterStart(202, body({ run: run({ step: null }), retry_after: 600 }), NOW)).toEqual({
      kind: "running",
      step: null,
    });
    expect(viewAfterStart(409, body({ run: run({ step: "predict" }), retry_after: 300 }), NOW)).toEqual({
      kind: "running",
      step: "predict",
    });
    expect(viewAfterStart(429, body({ run: run({ status: "succeeded" }), retry_after: 420 }), NOW)).toEqual({
      kind: "cooldown",
      availableAt: NOW + 420_000,
    });
    expect(viewAfterStart(503, body(null, "Refresh is not configured."), NOW)).toMatchObject({
      kind: "failed",
      message: "Refresh is not configured.",
    });
    expect(viewAfterStart(502, null, NOW)).toMatchObject({ kind: "failed", message: "Refresh could not start." });
  });

  it("maps poll responses", () => {
    expect(viewAfterPoll(200, body({ run: run({ step: "odds" }), retry_after: 500 }), NOW)).toEqual({
      kind: "running",
      step: "odds",
    });
    expect(viewAfterPoll(200, body({ run: run({ status: "succeeded", step: null }), retry_after: 480 }), NOW)).toEqual({
      kind: "done",
      availableAt: NOW + 480_000,
    });
    const failed = run({ status: "failed", step: null, steps: { sync: "failed", predict: "succeeded" } });
    expect(viewAfterPoll(200, body({ run: failed, retry_after: 480 }), NOW)).toEqual({
      kind: "failed",
      message: "sync failed. The board keeps the last good data.",
      availableAt: NOW + 480_000,
    });
    expect(viewAfterPoll(503, body(null, "The API is not reachable."), NOW)).toMatchObject({
      kind: "failed",
      message: "The API is not reachable.",
    });
  });

  it("explains a pending migration and abandoned runs", () => {
    expect(failureMessage({}, "schema check failed: SchemaBehind: ...")).toMatch(/migration/);
    expect(failureMessage({}, "stale lock released")).toBe("Refresh stopped. The board keeps the last good data.");
  });

  it("labels each state", () => {
    expect(refreshLabel({ kind: "idle" }, NOW)).toBe("Refresh");
    expect(refreshLabel({ kind: "running", step: "predict" }, NOW)).toBe("Updating predictions…");
    expect(refreshLabel({ kind: "running", step: "unknown" }, NOW)).toBe("Refreshing…");
    expect(refreshLabel({ kind: "cooldown", availableAt: NOW + 6.2 * 60_000 }, NOW)).toBe("Available in 7 min");
    expect(refreshLabel({ kind: "cooldown", availableAt: NOW + 5_000 }, NOW)).toBe("Available in 1 min");
  });
});
