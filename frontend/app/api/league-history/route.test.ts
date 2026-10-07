import type { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const latest = vi.fn();
const dispatch = vi.fn();
vi.mock("../../../lib/github", async (real) => ({
  ...(await real<typeof import("../../../lib/github")>()),
  latestWorkflowRun: (...args: unknown[]) => latest(...args),
  dispatchRefresh: (...args: unknown[]) => dispatch(...args),
}));
const { POST } = await import("./route");
const { REFRESH_HEADER } = await import("../../../lib/refresh");

// A browser request from the page itself (fetch's Request drops `sec-` headers, so a plain stand-in carries it).
const post = () => POST({ headers: new Headers({ "sec-fetch-site": "same-origin", [REFRESH_HEADER]: "1" }) } as unknown as NextRequest);

describe("POST /api/league-history", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    latest.mockReset();
    dispatch.mockReset();
  });

  it("starts the League history workflow, not the refresh", async () => {
    vi.stubEnv("GITHUB_TOKEN", "t");
    latest.mockResolvedValue({ status: "completed" });
    dispatch.mockResolvedValue(true);
    expect((await post()).status).toBe(202);
    expect(dispatch).toHaveBeenCalledWith("t", "league-history.yml");
  });

  it("does not start a second run while one is going", async () => {
    vi.stubEnv("GITHUB_TOKEN", "t");
    latest.mockResolvedValue({ status: "in_progress" });
    expect((await post()).status).toBe(409);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("needs the server's GitHub key", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    expect((await post()).status).toBe(503);
  });
});
