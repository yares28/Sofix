import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const TOKEN = "t".repeat(48);
let configured = false;
const sql = vi.fn(async () => []);
vi.mock("../../../../lib/db", () => ({ database: () => (configured ? sql : null), readModel: async () => null }));
vi.mock("../../../../lib/r2", () => ({ putBlock: async () => undefined }));
vi.mock("../../../../lib/missionLog", () => ({ recordQuietly: async () => undefined }));
vi.mock("next/cache", () => ({ revalidateTag: () => undefined, unstable_cache: (fn: unknown) => fn }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: () => undefined }));

const post = async (body: unknown) => {
  const { POST } = await import("./route");
  return POST(new NextRequest("http://localhost/api/ext/checkin", { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) }));
};
beforeEach(() => { process.env.EXTENSION_TOKEN = TOKEN; configured = false; sql.mockClear(); });

it("answers the extension on this computer, where no database is set (2 Nov 2026: 'App not reachable' on localhost)", async () => {
  const response = await post({ version: "0.4.30", sorare_user: "yares" });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, stored: false });
});

it("still stores a check-in where the database is set", async () => {
  configured = true;
  const response = await post({ version: "0.4.30", sorare_user: "yares" });
  expect(response.status).toBe(200);
  expect(sql).toHaveBeenCalled();
});
