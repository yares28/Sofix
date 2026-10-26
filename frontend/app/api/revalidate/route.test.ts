import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const saved = vi.hoisted(() => ({ source: 250, cached: undefined as number | undefined }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: (tag: string) => { if (tag === "my-weeks") saved.cached = undefined; } }));
vi.mock("next/server", async importOriginal => ({ ...await importOriginal<typeof import("next/server")>(), after: vi.fn() }));
vi.mock("../../../lib/missionLog", () => ({ recordQuietly: vi.fn() }));
const { POST } = await import("./route");
const readRewards = () => saved.cached ??= saved.source;
const token = "local-revalidation-test-not-a-secret-0123456789";
const call = (secret: string) => POST(new NextRequest("http://localhost/api/revalidate", { method: "POST", headers: { authorization: `Bearer ${secret}` } }));
beforeEach(() => { vi.stubEnv("REVALIDATE_SECRET", token); saved.source = 250; saved.cached = undefined; });
afterEach(() => vi.unstubAllEnvs());

it("publishes newly saved lineup reward totals when the scheduled refresh invalidates the page caches", async () => {
  expect(readRewards()).toBe(250);
  saved.source = 500;
  expect(readRewards()).toBe(250);
  expect((await call(token)).status).toBe(200);
  expect(readRewards()).toBe(500);
});
it("does not invalidate the saved totals for an unauthorised refresh", async () => {
  readRewards(); saved.source = 500;
  expect((await call("wrong-token")).status).toBe(401);
  expect(readRewards()).toBe(250);
});
