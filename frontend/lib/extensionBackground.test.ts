import { readFileSync } from "node:fs";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The extension's background worker, as it is (extension/background.js), with the browser's `chrome.*` and `fetch`
 * stood in for. What it does for the overlay is what keeps a page of 200 cards from asking the app 200 times, and
 * what decides which addresses a content script may send you to, so it is worth running rather than reading.
 */

const APP = "https://sofix.example";
const TOKEN = "t".repeat(48);
const SOURCE = readFileSync(new URL("../../extension/background.js", import.meta.url), "utf8").replace(
  /import \{ CONFIG \} from "\.\/config\.js";/,
  `const CONFIG = { appUrl: "${APP}", token: "${TOKEN}", bypass: "bypass-secret" };`,
);

type Message = Record<string, unknown>;
type Handler = (message: Message, sender: unknown, reply: (answer: unknown) => void) => unknown;
type Call = { url: string; init: { headers: Record<string, string>; body: string } };

function load() {
  const session = new Map<string, unknown>();
  const local = new Map<string, unknown>();
  const created: { url: string }[] = [];
  const calls: Call[] = [];
  let respond: (call: Call) => { ok: boolean; status: number; body?: unknown } | "network" = () => ({ ok: true, status: 200, body: { ok: true, cards: {}, players: {} } });
  const store = (map: Map<string, unknown>) => ({
    get: async (keys?: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((k) => k !== undefined && map.has(k as string)).map((k) => [k, map.get(k as string)])),
    set: async (values: Record<string, unknown>) => void Object.entries(values).forEach(([k, v]) => map.set(k, v)),
  });
  const handlers: Handler[] = [];
  const nothing = { addListener() {}, create() {} };
  const chrome = {
    runtime: {
      id: "sofix",
      getManifest: () => ({ version: "0.2.0" }),
      onInstalled: nothing,
      onStartup: nothing,
      onMessage: { addListener: (fn: Handler) => handlers.push(fn) },
      onMessageExternal: nothing,
    },
    alarms: { create() {}, onAlarm: nothing },
    storage: { session: store(session), local: store(local) },
    tabs: { create: (options: { url: string }) => created.push(options), query: async () => [], sendMessage() {}, reload() {}, onUpdated: nothing },
    scripting: { executeScript: async () => [], insertCSS: async () => undefined },
  };
  const fetch = async (url: string, init: Call["init"]) => {
    const call = { url, init };
    calls.push(call);
    const answer = respond(call);
    if (answer === "network") throw new TypeError("network");
    return { ok: answer.ok, status: answer.status, json: async () => answer.body };
  };
  vm.runInNewContext(SOURCE, { chrome, fetch, console, setTimeout, clearTimeout, URL, Date }, { filename: "background.js" });
  const listener = handlers[0]!;
  const SORARE = { id: "sofix", tab: { id: 7 }, url: "https://sorare.com/football/home" };
  return {
    calls,
    created,
    session,
    local,
    respondWith: (fn: typeof respond) => void (respond = fn),
    /** A message to the worker, and what it answered (null when it stayed silent). */
    send: (message: Message, sender: unknown = SORARE) =>
      new Promise<unknown>((resolve) => {
        const handled = listener(message, sender, (answer) => resolve(JSON.parse(JSON.stringify(answer ?? null))));
        if (handled !== true) resolve(null);
      }),
    body: (call: Call) => JSON.parse(call.init.body) as { cards: string[]; players: string[]; plan?: boolean },
  };
}

let worker: ReturnType<typeof load>;
beforeEach(() => {
  vi.useRealTimers();
  worker = load();
});

const known = (slugs: string[]) => (call: Call) => {
  const asked = worker.body(call);
  return {
    ok: true,
    status: 200,
    body: { ok: true, week: 17, cards: {}, players: Object.fromEntries(asked.players.filter((s) => slugs.includes(s)).map((s) => [s, { x: 50 }])) },
  };
};

describe("the overlay's numbers", () => {
  it("asks your app with the extension's token, and sends nothing but slugs", async () => {
    worker.respondWith(known(["unai-simon"]));
    const answer = await worker.send({ type: "overlay-numbers", cards: ["pedri-2026-limited-7"], players: ["unai-simon"] });
    expect(answer).toEqual({ state: "ok", cards: {}, players: { "unai-simon": { x: 50 } } });
    expect(worker.calls).toHaveLength(1);
    const call = worker.calls[0]!;
    expect(call.url).toBe(`${APP}/api/ext/overlay`);
    expect(call.init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(worker.body(call)).toEqual({ cards: ["pedri-2026-limited-7"], players: ["unai-simon"] });
  });

  it("remembers answers, unknown ones included, so scrolling a gallery never asks twice", async () => {
    worker.respondWith(known(["unai-simon"]));
    await worker.send({ type: "overlay-numbers", cards: [], players: ["unai-simon", "someone-else"] });
    const again = await worker.send({ type: "overlay-numbers", cards: [], players: ["someone-else", "unai-simon"] });
    expect(again).toEqual({ state: "ok", cards: {}, players: { "unai-simon": { x: 50 } } });
    expect(worker.calls).toHaveLength(1);
    // Only what is new is asked.
    await worker.send({ type: "overlay-numbers", cards: [], players: ["unai-simon", "pedri"] });
    expect(worker.calls).toHaveLength(2);
    expect(worker.body(worker.calls[1]!).players).toEqual(["pedri"]);
  });

  it("asks again once what it kept is older than fifteen minutes", async () => {
    worker.respondWith(known(["unai-simon"]));
    await worker.send({ type: "overlay-numbers", cards: [], players: ["unai-simon"] });
    const key = "ov:p:unai-simon";
    worker.session.set(key, { at: Date.now() - 14 * 60_000, entry: { x: 50 } });
    await worker.send({ type: "overlay-numbers", cards: [], players: ["unai-simon"] });
    expect(worker.calls).toHaveLength(1);
    worker.session.set(key, { at: Date.now() - 16 * 60_000, entry: { x: 50 } });
    await worker.send({ type: "overlay-numbers", cards: [], players: ["unai-simon"] });
    expect(worker.calls).toHaveLength(2);
  });

  it("splits a long list into calls the app will accept", async () => {
    const players = Array.from({ length: 130 }, (_, i) => `player-${i}`);
    await worker.send({ type: "overlay-numbers", cards: [], players });
    expect(worker.calls.map((call) => worker.body(call).players.length)).toEqual([120, 10]);
  });

  it("drops anything that is not a slug, and duplicates", async () => {
    await worker.send({ type: "overlay-numbers", cards: ["../../x", "Not A Slug", 5], players: ["ok-one", "ok-one", "https://evil.example"] });
    expect(worker.calls.map((call) => worker.body(call))).toEqual([{ cards: [], players: ["ok-one"] }]);
    expect(await worker.send({ type: "overlay-numbers", cards: [], players: [] })).toEqual({ state: "ok", cards: {}, players: {} });
  });

  it("says the app is unreachable, marks it so, and leaves it alone for a moment", async () => {
    worker.respondWith(() => "network");
    expect(await worker.send({ type: "overlay-numbers", cards: [], players: ["a-player"] })).toEqual({ state: "unreachable" });
    expect(worker.local.get("appReachable")).toBe(false);
    expect(await worker.send({ type: "overlay-numbers", cards: [], players: ["another"] })).toEqual({ state: "unreachable" });
    expect(worker.calls).toHaveLength(1); // the second question never left the browser
  });

  it("says when the app does not accept the extension's token, without calling it unreachable", async () => {
    worker.respondWith(() => ({ ok: false, status: 401 }));
    expect(await worker.send({ type: "overlay-numbers", cards: [], players: ["a-player"] })).toEqual({ state: "auth" });
    expect(worker.local.get("appReachable")).toBeUndefined();
    expect(worker.local.get("lastError")).toBe("HTTP 401");
  });

  it("does not remember a failure as an answer", async () => {
    worker.respondWith(() => ({ ok: false, status: 503 }));
    await worker.send({ type: "overlay-numbers", cards: [], players: ["a-player"] });
    expect([...worker.session.keys()]).toEqual([]);
  });

  it("answers only the extension's own sorare.com pages", async () => {
    const message = { type: "overlay-numbers", cards: [], players: ["a-player"] };
    expect(await worker.send(message, { id: "someone-else", tab: { id: 1 }, url: "https://sorare.com/" })).toBeNull();
    expect(await worker.send(message, { id: "sofix", tab: { id: 1 }, url: "https://evil.example/" })).toBeNull();
    expect(await worker.send(message, { id: "sofix", url: "https://sorare.com/" })).toBeNull(); // not from a tab
    expect(worker.calls).toHaveLength(0);
  });
});

describe("the drawer's plan", () => {
  const plan = { state: "ready", week: 17, x: 417 };

  it("asks for the plan once and keeps it", async () => {
    worker.respondWith(() => ({ ok: true, status: 200, body: { ok: true, week: 17, cards: {}, players: {}, plan } }));
    expect(await worker.send({ type: "overlay-plan" })).toEqual({ state: "ok", plan });
    expect(await worker.send({ type: "overlay-plan" })).toEqual({ state: "ok", plan });
    expect(worker.calls).toHaveLength(1);
    expect(worker.body(worker.calls[0]!)).toEqual({ cards: [], players: [], plan: true });
  });

  it("does not invent a plan the app did not send, and tells a refused token from an app that is away", async () => {
    worker.respondWith(() => ({ ok: true, status: 200, body: { ok: true, week: 17, cards: {}, players: {} } }));
    expect(await worker.send({ type: "overlay-plan" })).toEqual({ state: "unreachable" });
    worker.respondWith(() => ({ ok: false, status: 401 }));
    expect(await worker.send({ type: "overlay-plan" })).toEqual({ state: "auth" });
  });
});

describe("what a page may ask the worker to do", () => {
  it("opens the app, the Play page of one gameweek, or Control, and nothing else", async () => {
    for (const path of ["/", "/play", "/play?gw=17", "/control"]) await worker.send({ type: "open-app", path });
    expect(worker.created.map((tab) => tab.url)).toEqual([APP + "/", APP + "/play", APP + "/play?gw=17", APP + "/control"]);
  });

  it("sends anything else to the front page of the app, never to an address a page chose", async () => {
    for (const path of ["/api/refresh", "//evil.example", "/play?gw=1;drop", "/play?gw=12345", "https://evil.example/", undefined, 5])
      await worker.send({ type: "open-app", path });
    expect(worker.created.every((tab) => tab.url === APP + "/")).toBe(true);
    expect(worker.created).toHaveLength(7);
  });

  it("keeps the count of recognised cards for the popup", async () => {
    await worker.send({ type: "overlay-stats", seen: 8, matched: 7 });
    expect(worker.local.get("overlayStats")).toMatchObject({ seen: 8, matched: 7 });
  });
});
