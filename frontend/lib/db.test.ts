import { describe, expect, it, vi } from "vitest";
import { neonFetch } from "./db";

describe("neonFetch", () => {
  // 13 Nov 2026: two extension check-ins waited on Neon until Vercel's 300 s cut-off, 600 s of the month's 4 h of CPU.
  it("gives up on a Neon call that never answers", async () => {
    const hang = vi.fn((_: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
    );
    vi.stubGlobal("fetch", hang);
    await expect(neonFetch("https://neon.test/sql", { method: "POST" }, 50)).rejects.toThrow();
    vi.unstubAllGlobals();
  });

  it("passes an answer straight through", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    await expect(neonFetch("https://neon.test/sql", { method: "POST" }, 50)).resolves.toBeInstanceOf(Response);
    vi.unstubAllGlobals();
  });
});
