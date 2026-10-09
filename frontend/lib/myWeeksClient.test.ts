import { afterEach, expect, it, vi } from "vitest";
const read = vi.fn();
vi.mock("./entered", async (original) => ({ ...await original<typeof import("./entered")>(), runWeekLineups: (...args: unknown[]) => read(...args) }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules(); read.mockReset(); });
it("archives only unsaved weeks sequentially, stops on missing access and checks once a day", async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ weeks: [], pending: [{ slug: "a" }, { slug: "b" }] })));
  vi.stubGlobal("fetch", fetcher);
  read.mockResolvedValue({ state: "no-tab" });
  const { archiveFinishedWeeks } = await import("./myWeeksClient");
  const first = await archiveFinishedWeeks();
  expect(first.issue?.state).toBe("no-tab");
  expect(read).toHaveBeenCalledTimes(1);
  await archiveFinishedWeeks();
  expect(read).toHaveBeenCalledTimes(1);
});
it("reads saved lineups without the extension and never treats a storage failure as empty", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ weeks: [{ slug: "a", lineups: [] }], pending: [] }))));
  const { readEnteredWeek, archiveFinishedWeeks } = await import("./myWeeksClient");
  expect(await readEnteredWeek("a")).toMatchObject({ state: "ok", saved: true, lineups: [] });
  expect(read).not.toHaveBeenCalled();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
  expect((await archiveFinishedWeeks()).unavailable).toBe(true);
});
