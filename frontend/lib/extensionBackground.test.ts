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
// The worker imports core.js for its side effect (the page reader the overlay shares); the harness runs it first in the same context.
const CORE = readFileSync(new URL("../../extension/core.js", import.meta.url), "utf8");
const SOURCE = readFileSync(new URL("../../extension/background.js", import.meta.url), "utf8")
  .replace(/import \{ CONFIG \} from "\.\/config\.js";/, `const CONFIG = { appUrl: "${APP}", token: "${TOKEN}", bypass: "bypass-secret" };`)
  .replace('import "./core.js";', "");

type Message = Record<string, unknown>;
type Handler = (message: Message, sender: unknown, reply: (answer: unknown) => void) => unknown;
type Call = { url: string; init: { headers: Record<string, string>; body: string; credentials?: string; referrerPolicy?: string } };

function load(options: { sorareTab?: boolean; tabs?: { id: number; active: boolean }[]; tabResult?: (tab: number) => unknown; missionData?: unknown; operationData?: (operation: string, variables: Record<string, unknown>) => unknown } = {}) {
  const session = new Map<string, unknown>();
  const local = new Map<string, unknown>();
  const created: { url: string }[] = [];
  const calls: Call[] = [];
  /** What the page bridge was asked to put to Sorare, when a signed-in sorare.com tab is stood in for. */
  const asked: { operation: string; variables: Record<string, unknown> }[] = [];
  const tabMessages: Message[] = [];
  let respond: (call: Call) => { ok: boolean; status: number; body?: unknown; text?: string } | "network" = () => ({ ok: true, status: 200, body: { ok: true, cards: {}, players: {} } });
  const store = (map: Map<string, unknown>) => ({
    get: async (keys?: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((k) => k !== undefined && map.has(k as string)).map((k) => [k, map.get(k as string)])),
    set: async (values: Record<string, unknown>) => void Object.entries(values).forEach(([k, v]) => map.set(k, v)),
  });
  const handlers: Handler[] = [];
  const outside: Handler[] = [];
  const nothing = { addListener() {}, create() {} };
  // The page bridge in a sorare.com tab: it answers its ping and records each question it is given for Sorare.
  const bridge = (_tab: number, message: Message, answer?: (response: unknown) => void) => {
    tabMessages.push(message);
    if (!options.sorareTab || !answer) return;
    if (message.type === "sofix-ping-7") answer({ ok: true, version: 7 });
    else if (message.type === "sofix-ask-7") {
      asked.push({ operation: String(message.operation), variables: message.variables as Record<string, unknown> });
      answer(options.tabResult?.(_tab) ?? { state: "ok", data: options.operationData?.(String(message.operation), message.variables as Record<string, unknown>) ?? options.missionData ?? null });
    } else answer(undefined);
  };
  const chrome = {
    runtime: {
      id: "sofix",
      getManifest: () => ({ version: "0.2.0" }),
      onInstalled: nothing,
      onStartup: nothing,
      onMessage: { addListener: (fn: Handler) => handlers.push(fn) },
      onMessageExternal: { addListener: (fn: Handler) => outside.push(fn) },
    },
    alarms: { create() {}, onAlarm: nothing },
    storage: { session: store(session), local: store(local) },
    tabs: {
      create: (options: { url: string }) => created.push(options),
      query: async () => options.tabs ?? (options.sorareTab ? [{ id: 7, active: true }] : []),
      sendMessage: bridge,
      reload() {},
      onUpdated: nothing,
    },
    scripting: { executeScript: async () => [], insertCSS: async () => undefined },
  };
  const fetch = async (url: string, init: Call["init"]) => {
    const call = { url, init };
    calls.push(call);
    const answer = respond(call);
    if (answer === "network") throw new TypeError("network");
    return { ok: answer.ok, status: answer.status, json: async () => answer.body, text: async () => answer.text ?? "" };
  };
  const context = vm.createContext({ chrome, fetch, console, setTimeout, clearTimeout, URL, Date });
  vm.runInContext(CORE, context, { filename: "core.js" });
  vm.runInContext(SOURCE, context, { filename: "background.js" });
  const listener = handlers[0]!;
  const SORARE = { id: "sofix", tab: { id: 7 }, url: "https://sorare.com/football/home" };
  return {
    calls,
    created,
    session,
    local,
    asked,
    tabMessages,
    respondWith: (fn: typeof respond) => void (respond = fn),
    /** A message to the worker, and what it answered (null when it stayed silent). */
    send: (message: Message, sender: unknown = SORARE) =>
      new Promise<unknown>((resolve) => {
        const handled = listener(message, sender, (answer) => resolve(JSON.parse(JSON.stringify(answer ?? null))));
        if (handled !== true) resolve(null);
      }),
    /** A message from a web page that is allowed to reach the extension (the app), by the address it was sent from. */
    sendFrom: (url: string | undefined, message: Message) =>
      new Promise<unknown>((resolve) => {
        const handled = outside[0]!(message, { id: "sofix", url }, (answer) => resolve(JSON.parse(JSON.stringify(answer ?? null))));
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

describe("mission import completeness", () => {
  it("versions the tab request so an old content listener cannot repeat a draft after extension reload", async () => {
    const w = load({ sorareTab: true });
    await w.sendFrom(APP, { type: "sorare", step: "draft", boardId: "board", appearances: [], name: "Plan" });
    expect(w.tabMessages.find((m) => m.operation === "SofixSaveDraft")?.type).toBe("sofix-ask-7");
  });
  it("reads source chances for one validated game through the signed-in tab", async () => {
    const game = "Game:00000000-0000-0000-0000-000000000001";
    const w = load({ sorareTab: true, tabResult: () => ({ state: "unseen" }) });
    expect(await w.sendFrom(APP, { type: "lineup-chances", game })).toMatchObject({ state: "unseen" });
    expect(w.asked).toEqual([{ operation: "SofixLineupChances", variables: { id: game } }]);
    expect(await w.sendFrom(APP, { type: "lineup-chances", game: "query { currentUser { slug } }" })).toBeNull();
    expect(await w.sendFrom("https://sofix.example.evil.test", { type: "lineup-chances", game })).toBeNull();
  });
  it("combines native odds across tabs, taking the newest exact-game reading and rejecting expired rows", async () => {
    const game = "Game:00000000-0000-0000-0000-000000000001";
    const row = (slug: string, n: number, observedAt = Date.now()) => ({ anyPlayer: { slug }, observedAt, anyPlayerGameStats: { footballPlayingStatusOdds: { starterOddsBasisPoints: n } } });
    const w = load({ sorareTab: true, tabs: [{ id: 7, active: true }, { id: 8, active: false }, { id: 9, active: false }], tabResult: tab => ({ state: "ok", native: true, data: { anyGame: {
      id: tab === 9 ? "wrong-game" : game,
      playerGameScores: tab === 7 ? [row("one", 3000, Date.now() - 1000), row("old", 8000, Date.now() - 16 * 60_000)] : [row("one", 0), row("two", 8000)],
    } } }) });
    const answer = await w.sendFrom(APP, { type: "lineup-chances", game }) as { data: { anyGame: { playerGameScores: ReturnType<typeof row>[] } } };
    expect(answer.data.anyGame.playerGameScores.map(r => [r.anyPlayer.slug, r.anyPlayerGameStats.footballPlayingStatusOdds.starterOddsBasisPoints])).toEqual([["one", 0], ["two", 8000]]);
    expect(w.asked).toHaveLength(3);
    expect(w.calls).toHaveLength(0);
  });
  it("discovers games from Sorare and reads all task/game batches plus subsequent card pages", async () => {
    const task = { __typename: "DecisivePlayerPickerTask", id: "task-1", title: "Decisive Picker", mode: "DECISIVE", maxAppearancesCount: 3, rarity: "limited", taskAppearances: [] };
    const games = Array.from({ length: 30 }, (_, i) => ({ game: { id: `Game:00000000-0000-0000-0000-${String(i).padStart(12, "0")}` } }));
    const w = load({ sorareTab: true, operationData: (operation, v) => {
      if (operation === "SofixMissions") return { currentUser: { slug: "owner", limited: { myTasks: [task] }, rare: { myTasks: [] }, super_rare: { myTasks: [] }, unique: { myTasks: [] } } };
      if (operation === "SofixMissionGames") return { currentUser: { t0: { pickableGames: { nodes: games, pageInfo: { hasNextPage: false } } } } };
      if (operation === "SofixMissionCards") return { currentUser: Object.fromEntries((v.pairs as { after?: string }[]).map((p, i) => [`t${i}`, { pickableCards: { nodes: [{ slug: p.after ? "second-card" : "first-card" }], pageInfo: { hasNextPage: !p.after, endCursor: "page-2" } } }])) };
      return null;
    } });
    await w.sendFrom(APP, { type: "load-missions" });
    expect(w.asked.some((a) => a.operation === "SofixMissionGames")).toBe(true);
    const body = JSON.parse(w.calls.find((c) => c.url.endsWith("/missions"))!.init.body);
    expect(Object.keys(body.outcomes.limited.missions[0].eligibleCards)).toHaveLength(30);
    expect(Object.values(body.outcomes.limited.missions[0].eligibleCards)[0]).toEqual(["first-card", "second-card"]);
  });
  it("answers the production alias allowed by the manifest without allowing lookalike hosts", async () => {
    const w = load({ sorareTab: true });
    expect(await w.sendFrom("https://sofix-livid.vercel.app/play", { type: "sorare", step: "week-entered", slug: "football-9-13-oct-2026" })).toMatchObject({ state: "ok" });
    expect(w.asked).toContainEqual({ operation: "SofixFixtureLineups", variables: { slug: "football-9-13-oct-2026" } });
    expect(await w.sendFrom("https://sofix-livid.vercel.app.evil.example/play", { type: "sorare", step: "draft" })).toBeNull();
  });
  it("does not replace selections with an empty list when an appearance is malformed", async () => {
    const task = { __typename: "DecisivePlayerPickerTask", id: "task-1", title: "Decisive Picker", mode: "DECISIVE", maxAppearancesCount: 3, taskAppearances: [{}] };
    const w = load({ sorareTab: true, missionData: { currentUser: { slug: "owner", limited: { myTasks: [task] }, rare: { myTasks: [] }, super_rare: { myTasks: [] }, unique: { myTasks: [] } } } });
    expect(await w.sendFrom(APP, { type: "load-missions" })).toMatchObject({ state: "incomplete" });
    expect(w.calls.filter((c) => c.url.endsWith("/missions"))).toHaveLength(0);
  });
  it("never uploads empty lists when Sorare omitted the collection", async () => {
    const w = load({ sorareTab: true, missionData: { currentUser: { slug: "owner" } } });
    expect(await w.sendFrom(APP, { type: "load-missions" })).toMatchObject({ state: "incomplete" });
    expect(w.calls.filter((c) => c.url.endsWith("/missions"))).toHaveLength(0);
  });
  it("resolves nullable rarity only inside the requested scope and sends one verified envelope", async () => {
    const task = { __typename: "DecisivePlayerPickerTask", id: "task-1", title: "Decisive Picker", mode: "DECISIVE", maxAppearancesCount: 3, rarity: null, taskAppearances: [] };
    const w = load({ sorareTab: true, missionData: { currentUser: { slug: "owner", limited: { myTasks: [task] }, rare: { myTasks: [] }, super_rare: { myTasks: [] }, unique: { myTasks: [] } } } });
    expect(await w.sendFrom(APP, { type: "load-missions" })).toMatchObject({ state: "ok", loaded: { limited: 1 } });
    const imports = w.calls.filter((c) => c.url.endsWith("/missions"));
    expect(imports).toHaveLength(1);
    expect(JSON.parse(imports[0]!.init.body)).toMatchObject({ version: 2, outcomes: { limited: { complete: true, missions: [{ id: "task-1" }] } } });
  });
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
    const key = "ov:now:p:unai-simon";
    worker.session.set(key, { at: Date.now() - 14 * 60_000, entry: { x: 50 } });
    await worker.send({ type: "overlay-numbers", cards: [], players: ["unai-simon"] });
    expect(worker.calls).toHaveLength(1);
    worker.session.set(key, { at: Date.now() - 16 * 60_000, entry: { x: 50 } });
    await worker.send({ type: "overlay-numbers", cards: [], players: ["unai-simon"] });
    expect(worker.calls).toHaveLength(2);
  });

  it("keeps what it is told per gameweek, and sends the gameweek a page's address names", async () => {
    worker.respondWith(known(["unai-simon"]));
    const ask = (fixture?: unknown) => worker.send({ type: "overlay-numbers", cards: [], players: ["unai-simon"], fixture });
    await ask();
    await ask("football-18-22-sep-2026"); // another week is another question, not this week's answer
    expect(worker.calls).toHaveLength(2);
    expect(worker.body(worker.calls[0]!)).toEqual({ cards: [], players: ["unai-simon"] });
    expect(worker.body(worker.calls[1]!)).toEqual({ cards: [], players: ["unai-simon"], fixture: "football-18-22-sep-2026" });
    // Each is remembered on its own.
    await ask();
    await ask("football-18-22-sep-2026");
    expect(worker.calls).toHaveLength(2);
  });

  it("ignores a gameweek that is not shaped like one", async () => {
    worker.respondWith(known([]));
    for (const fixture of ["../../x", "football-", "soccer-18-22-sep-2026", "football-18-22-sep-26", 7, {}])
      await worker.send({ type: "overlay-numbers", cards: [], players: ["a-player"], fixture });
    expect(worker.calls).toHaveLength(1); // all six were the page of no named week, answered once
    expect(worker.body(worker.calls[0]!)).toEqual({ cards: [], players: ["a-player"] });
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

  it("asks for the plan of the gameweek a page's address names, and keeps each week's plan apart (3 Oct: GW21's page showed GW20)", async () => {
    worker.respondWith(() => ({ ok: true, status: 200, body: { ok: true, week: 21, cards: {}, players: {}, plan } }));
    await worker.send({ type: "overlay-plan", fixture: "football-9-13-oct-2026" });
    await worker.send({ type: "overlay-plan" });
    expect(worker.calls).toHaveLength(2);
    expect(worker.body(worker.calls[0]!)).toEqual({ cards: [], players: [], plan: true, fixture: "football-9-13-oct-2026" });
    expect(worker.body(worker.calls[1]!)).toEqual({ cards: [], players: [], plan: true });
    // Each is remembered on its own.
    await worker.send({ type: "overlay-plan", fixture: "football-9-13-oct-2026" });
    await worker.send({ type: "overlay-plan" });
    expect(worker.calls).toHaveLength(2);
  });

  it("ignores a plan's gameweek that is not shaped like one", async () => {
    worker.respondWith(() => ({ ok: true, status: 200, body: { ok: true, week: 17, cards: {}, players: {}, plan } }));
    for (const fixture of ["../../x", "football-", "soccer-18-22-sep-2026", 7, {}]) await worker.send({ type: "overlay-plan", fixture });
    expect(worker.calls).toHaveLength(1); // all five were the page of no named week, answered once
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

  it("keeps the count of recognised cards for the popup, and the gameweek the page named", async () => {
    await worker.send({ type: "overlay-stats", seen: 8, matched: 7, fixture: "football-25-29-sep-2026" });
    expect(worker.local.get("overlayStats")).toMatchObject({ seen: 8, matched: 7, fixture: "football-25-29-sep-2026" });
    await worker.send({ type: "overlay-stats", seen: 8, matched: 7, fixture: "nonsense" });
    expect(worker.local.get("overlayStats")).toMatchObject({ fixture: null });
  });
});


describe("Futbol Fantasy, read live for the overlay", () => {
  const MATCH = "https://www.futbolfantasy.com/partidos/22502-real-sociedad-deportivo";
  const PAGE = readFileSync(new URL("../../backend/tests/fixtures/futbolfantasy/match_real_sociedad_deportivo.html", import.meta.url), "utf8");
  const ask = (matches: unknown) => worker.send({ type: "ff-live", matches });
  const ff = (calls: Call[]) => calls.filter((call) => call.url.includes("futbolfantasy.com"));
  const page = () => ({ ok: true, status: 200, text: PAGE });

  type Live = { state: string; live: Record<string, { at: string; players: Record<string, { p: number; lesion: number }> }> };

  it("reads a match page and answers each player's chance and injury code by his number", async () => {
    worker.respondWith(page);

    const answer = (await ask([{ id: 22502, url: MATCH }])) as Live;

    expect(answer.state).toBe("ok");
    expect(answer.live["22502"]!.players["2675"]).toEqual({ p: 0.9, lesion: -1 });
    expect(answer.live["22502"]!.players["2802"]).toEqual({ p: 0.5, lesion: 1 });
    expect(Date.parse(answer.live["22502"]!.at)).toBeGreaterThan(Date.now() - 5000);
  });

  it("reads it as a visitor would: no credentials, no referrer", async () => {
    worker.respondWith(page);

    await ask([{ id: 22502, url: MATCH }]);

    const [call] = ff(worker.calls);
    expect(call!.init).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
    expect(call!.init.headers).toBeUndefined();
  });

  it("does not ask the site again within ten minutes, however often it is asked", async () => {
    worker.respondWith(page);

    await ask([{ id: 22502, url: MATCH }]);
    await ask([{ id: 22502, url: MATCH }]);
    const third = (await ask([{ id: 22502, url: MATCH }])) as Live;

    expect(ff(worker.calls)).toHaveLength(1);
    expect(third.live["22502"]!.players["2675"]!.p).toBe(0.9);
  });

  it("reads it again once the reading is ten minutes old", async () => {
    worker.respondWith(page);
    await ask([{ id: 22502, url: MATCH }]);
    const held = worker.session.get("ff:22502") as { at: number; players: unknown };
    worker.session.set("ff:22502", { ...held, at: Date.now() - 11 * 60_000 });

    await ask([{ id: 22502, url: MATCH }]);

    expect(ff(worker.calls)).toHaveLength(2);
  });

  it("names nothing for a page the site refuses, and leaves it alone for five minutes", async () => {
    worker.respondWith(() => ({ ok: false, status: 403 }));

    const first = (await ask([{ id: 22502, url: MATCH }])) as Live;
    const second = (await ask([{ id: 22502, url: MATCH }])) as Live;

    expect(first).toEqual({ state: "ok", live: {} });
    expect(second).toEqual({ state: "ok", live: {} });
    expect(ff(worker.calls)).toHaveLength(1);
  });

  it("keeps the last reading when a later one fails", async () => {
    worker.respondWith(page);
    await ask([{ id: 22502, url: MATCH }]);
    const held = worker.session.get("ff:22502") as { at: number; players: unknown };
    worker.session.set("ff:22502", { ...held, at: Date.now() - 11 * 60_000 });
    worker.respondWith(() => ({ ok: false, status: 500 }));

    const answer = (await ask([{ id: 22502, url: MATCH }])) as Live;

    expect(answer.live["22502"]!.players["2675"]!.p).toBe(0.9);
  });

  it("does not take a page that is not a lineup page for one", async () => {
    worker.respondWith(() => ({ ok: true, status: 200, text: "<html><body>Mantenimiento</body></html>" }));

    expect(await ask([{ id: 22502, url: MATCH }])).toEqual({ state: "ok", live: {} });
  });

  it("reads only match pages of Futbol Fantasy, named by the number they carry", async () => {
    worker.respondWith(page);

    const answer = (await ask([
      { id: 1, url: "https://evil.example/partidos/1-x" },
      { id: 2, url: "https://www.futbolfantasy.com/jugadores/alex-remiro/laliga-26-27" },
      { id: 3, url: "https://www.futbolfantasy.com/partidos/4-the-wrong-number" },
      { id: 22502, url: "http://www.futbolfantasy.com/partidos/22502-x" },
      "not a match",
      null,
    ])) as Live;

    expect(answer).toEqual({ state: "ok", live: {} });
    expect(worker.calls).toHaveLength(0);
  });

  it("reads each page once however it is named twice, one after another with a pause", async () => {
    vi.useFakeTimers();
    worker = load();
    worker.respondWith(page);
    const other = "https://www.futbolfantasy.com/partidos/22493-alaves-atletico";

    const pending = ask([{ id: 22502, url: MATCH }, { id: 22502, url: MATCH }, { id: 22493, url: other }]);
    await vi.advanceTimersByTimeAsync(2500);
    const answer = (await pending) as Live;

    expect(ff(worker.calls).map((call) => call.url)).toEqual([MATCH, other]);
    expect(Object.keys(answer.live).sort()).toEqual(["22493", "22502"]);
  });

  it("answers no one who is not a sorare.com tab", async () => {
    worker.respondWith(page);

    const answer = await worker.send({ type: "ff-live", matches: [{ id: 22502, url: MATCH }] }, { id: "sofix", tab: { id: 9 }, url: "https://evil.example/" });

    expect(answer).toBeNull();
    expect(worker.calls).toHaveLength(0);
  });
});

describe("who may ask the extension to do something from a web page (roadmap 7.4)", () => {
  const INPUT = {
    slug: "football-2-6-oct-2026-limited",
    boardId: "board-1",
    appearances: [{ cardSlug: "pedri-2026-limited-7", captain: true, index: 0 }],
    lineupIds: ["lineup-1"],
  };
  // Any page that is not the app, Sorare's own pages included: none of them may reach the extension from outside.
  const OTHERS = ["https://evil.example/", `${APP}.evil.example/`, "http://sofix.example/", "https://localhost:3000/", "https://sorare.com/", "javascript:alert(1)", "not a url", undefined];

  beforeEach(() => {
    worker = load({ sorareTab: true });
  });

  it("answers the app's ping from its own address or a local development server, and from nowhere else", async () => {
    for (const url of [`${APP}/play`, "http://localhost:3000/", "http://127.0.0.1:8765/play"]) {
      expect(await worker.sendFrom(url, { type: "ping" }), url).toMatchObject({ ok: true, version: "0.2.0" });
    }
    for (const url of OTHERS) expect(await worker.sendFrom(url, { type: "ping" }), String(url)).toBeNull();
  });

  it("turns each step the app may name into one fixed question for Sorare, and nothing else", async () => {
    const question: Record<string, string> = {
      entered: "SofixMyLineups",
      "week-entered": "SofixFixtureLineups",
      check: "SofixPreviewLineup",
      draft: "SofixSaveDraft",
      enter: "SofixConfirmLineups",
    };
    for (const [step, operation] of Object.entries(question)) {
      worker.asked.length = 0;
      expect(await worker.sendFrom(`${APP}/play`, { type: "sorare", step, ...INPUT }), step).toMatchObject({ ok: true, step, state: "ok" });
      expect(worker.asked.map((one) => one.operation), step).toEqual([operation]);
    }
  });

  it("ignores a step that is not in the table, even one named like an operation or like something every object has", async () => {
    for (const step of ["whoami", "SofixConfirmLineups", "SofixSaveDraft", "mutation", "__proto__", "constructor", "toString", "hasOwnProperty", ""]) {
      expect(await worker.sendFrom(`${APP}/play`, { type: "sorare", step, ...INPUT }), step).toBeNull();
    }
    expect(worker.asked).toEqual([]);
  });

  it("lets no other address start a step, the two that write included", async () => {
    for (const url of OTHERS) for (const step of ["entered", "draft", "enter"]) expect(await worker.sendFrom(url, { type: "sorare", step, ...INPUT }), `${url} ${step}`).toBeNull();
    expect(worker.asked).toEqual([]);
  });

  it("saves a draft as a draft whatever the page says, and keeps an input to what a lineup can hold", async () => {
    const twenty = Array.from({ length: 20 }, (_, index) => ({ cardSlug: `card-${index}`, captain: index === 0, index }));
    await worker.sendFrom(`${APP}/play`, { type: "sorare", step: "draft", ...INPUT, draft: false, appearances: twenty });
    const saved = worker.asked[0]!.variables.input as { draft: boolean; so5Appearances: unknown[] };
    expect(saved.draft).toBe(true);
    expect(saved.so5Appearances).toHaveLength(12);

    worker.asked.length = 0;
    await worker.sendFrom(`${APP}/play`, { type: "sorare", step: "enter", ...INPUT, lineupIds: Array.from({ length: 12 }, (_, index) => `lineup-${index}`) });
    expect((worker.asked[0]!.variables.input as { so5LineupIds: string[] }).so5LineupIds).toHaveLength(8);
  });
});
