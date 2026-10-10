import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../extension/bridge.js", import.meta.url), "utf8");

/** Run the actual page bridge with a Sorare response; no credentials or network. */
async function chances(body: unknown) {
  let listener: (event: unknown) => Promise<void>;
  const replies: Record<string, unknown>[] = [];
  let query = "";
  const window = {
    fetch: async (_url: string, init: { body: string }) => {
      query = JSON.parse(init.body).query;
      return { ok: true, headers: new Headers(), json: async () => body };
    },
    addEventListener: (_name: string, callback: typeof listener) => { listener = callback; },
    postMessage: (answer: Record<string, unknown>) => replies.push(answer),
  };
  const context = vm.createContext({ window, Headers, URL, location: { origin: "https://sorare.com" }, document: { cookie: "", documentElement: { getAttribute: () => null } } });
  vm.runInContext(source, context);
  await listener!({ source: window, data: { source: `sofix-content-${(window as typeof window & { __sofixBridge: number }).__sofixBridge}`, type: "ask", id: "read-1", operation: "SofixLineupChances", variables: { id: "Game:00000000-0000-0000-0000-000000000001" } } });
  return { answer: replies[0], query };
}

describe("Sorare starting odds bridge", () => {
  it("keeps a partial-error signal instead of presenting null odds as unpublished", async () => {
    const data = { currentUser: { slug: "owner" }, anyGame: { id: "game", playerGameScores: [] } };
    const result = await chances({ data, errors: [{ message: "Field unavailable", path: ["anyGame", "playerGameScores"] }] });
    expect(result.answer).toMatchObject({ state: "ok", data, incomplete: true });
    expect(result.query).toMatch(/currentUser\s*\{\s*slug\s*\}/);
  });
  it("recognizes an anonymous response even when the public game is readable", async () => {
    const result = await chances({ data: { currentUser: null, anyGame: { id: "game", playerGameScores: [] } } });
    expect(result.answer).toMatchObject({ state: "signed-out" });
  });
});
