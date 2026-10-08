import { beforeEach, expect, it, vi } from "vitest";
let value: Record<string, number> | null = null;
let conflict = false;
vi.mock("./db", () => ({ database: () => async (strings: TemplateStringsArray, ...args: unknown[]) => {
  const query = strings.join("?");
  if (query.startsWith("SELECT")) return value ? [{ payload: { ...value } }] : [];
  if (conflict) { value = { ...value, other: 7 }; conflict = false; return []; }
  value = JSON.parse(args.find((a) => typeof a === "string" && a.startsWith("{")) as string);
  return [{ key: "record" }];
} }));
const { mergeMissionRecord } = await import("./missionStore");
beforeEach(() => { value = null; conflict = false; });
it("re-reads and merges a concurrent field instead of losing the other writer", async () => {
  value = { mine: 1 }; conflict = true;
  expect(await mergeMissionRecord<Record<string, number>>("record", (old) => ({ ...old, mine: 2 }))).toEqual({ mine: 2, other: 7 });
});
it("creates an absent record without a blind conflict overwrite", async () => {
  conflict = true;
  expect(await mergeMissionRecord<Record<string, number>>("record", (old) => ({ ...old, mine: 2 }))).toEqual({ mine: 2, other: 7 });
});
