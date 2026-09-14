import { afterEach, describe, expect, it, vi } from "vitest";

// No Next.js runtime in unit tests: run the cached function directly.
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn }));

const { MESSAGES, loadGrid } = await import("./api");

function answer(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

describe("loadGrid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the error state for a malformed payload and logs why on the server", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    answer(200, { success: true, data: { season: "2026/27", teams: "not a list" }, meta: null });
    expect(await loadGrid()).toEqual({ grid: null, meta: null, error: MESSAGES.malformed });
    expect(log.mock.calls[0]?.[0]).toMatch(/payload failed validation/);
  });

  it("maps API failures and empty databases to friendly messages without backend details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    answer(503, { success: false, error: "Fixture data is temporarily unavailable." });
    expect((await loadGrid()).error).toBe(MESSAGES.unavailable);

    answer(200, { success: false, data: null, error: "No fixtures yet.", meta: null });
    expect((await loadGrid()).error).toBe(MESSAGES.empty);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed: connect ECONNREFUSED 127.0.0.1:8000"); }));
    const offline = await loadGrid();
    expect(offline.error).toBe(MESSAGES.unavailable);
    expect(JSON.stringify(offline)).not.toContain("ECONNREFUSED");
  });
});
