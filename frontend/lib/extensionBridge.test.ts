import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../extension/bridge.js", import.meta.url), "utf8");
const core = readFileSync(new URL("../../extension/core.js", import.meta.url), "utf8");
const GAME = "Game:a313a797-15d2-4ab2-aa15-1285a9f6e986";
const OTHER = "Game:f4673b55-ea42-450e-aaa4-513e28971567";
const PLAYER = "mikel-oyarzabal-ugarte";

// Reduced from Sorare's native LazyFixtureChartQuery, observed 10 Oct 2026: 80% for this match,
// null for his following Europa League game. The custom query returned null for both.
const native = (n: number | null = 8000) => ({ data: { anyPlayer: {
  __typename: "Player", slug: PLAYER, anyFutureGames: { nodes: [
    { __typename: "Game", id: GAME, playerGameScore: { anyGame: { id: GAME }, anyPlayerGameStats: { __typename: "PlayerGameStats", footballPlayingStatusOdds: n === null ? null : { starterOddsBasisPoints: n } } } },
    { __typename: "Game", id: OTHER, playerGameScore: { anyGame: { id: OTHER }, anyPlayerGameStats: { __typename: "PlayerGameStats", footballPlayingStatusOdds: null } } },
  ] },
} } });

/** Actual bridge and core, with native responses supplied offline; never credentials or real requests. */
function bridge() {
  let listener: (event: unknown) => Promise<void>;
  const replies: Record<string, unknown>[] = [];
  const calls: unknown[] = [];
  let body: unknown = native();
  let now = Date.now();
  const window = {
    fetch: async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body));
      const result = body;
      return { ok: true, headers: new Headers({ "content-type": "application/json" }), clone: () => ({ json: async () => result }), json: async () => result };
    },
    addEventListener: (_name: string, callback: typeof listener) => { listener = callback; },
    postMessage: (answer: Record<string, unknown>) => replies.push(answer),
  };
  const context = vm.createContext({ window, Headers, URL, Date: class extends Date { static now() { return now; } }, setTimeout, clearTimeout, location: { origin: "https://sorare.com", href: "https://sorare.com/football/home" }, document: { cookie: "", documentElement: { getAttribute: () => null } } });
  vm.runInContext(core, context);
  Object.assign(window, { __sofixCore: context.__sofixCore });
  vm.runInContext(source, context);
  return {
    calls,
    chances: () => JSON.parse(JSON.stringify(replies.filter(r => r.type === "chances"))) as { rows: { game: string; player: string; basisPoints: number }[]; games: string[] }[],
    advance: (ms: number) => { now += ms; },
    async page(data: unknown, url = "https://api.sorare.com/graphql", operationName = "LazyFixtureChartQuery") {
      body = data;
      await window.fetch(url, { body: JSON.stringify({ operationName }), method: "POST" } as { body: string });
      await new Promise(resolve => setTimeout(resolve, 0));
    },
    async read(id = GAME, operation = "SofixLineupChances", variables: unknown = { id }) {
      await listener!({ source: window, data: { source: `sofix-content-${context.window.__sofixBridge}`, type: "ask", id: "read", operation, variables } });
      return JSON.parse(JSON.stringify(replies.findLast(r => r.id === "read")));
    },
  };
}

describe("Sorare starting odds bridge", () => {
  it("announces each new or changed native reading, so it is saved beyond this tab", async () => {
    const b = bridge();
    await b.page(native());
    expect(b.chances()).toHaveLength(1);
    expect(b.chances()[0]?.rows).toEqual([{ game: GAME, player: PLAYER, basisPoints: 8000 }]); // the null game is not a reading
    expect(b.chances()[0]?.games.sort()).toEqual([GAME, OTHER].sort()); // but Sorare was asked about both
    await b.page(native());
    expect(b.chances()[1]?.rows).toEqual([]); // the same number again: nothing new to save
    await b.page(native(0));
    expect(b.chances()[2]?.rows).toEqual([{ game: GAME, player: PLAYER, basisPoints: 0 }]); // zero is a number
    b.advance(6 * 60000);
    await b.page(native(0));
    expect(b.chances()[3]?.rows).toHaveLength(1); // still 0% five minutes on: said again, so the saved time moves
    await b.page(native(), undefined, "SofixLineupChances");
    expect(b.chances()).toHaveLength(4); // an answer to our own question is never a reading
  });
  it("reads the native 80% by player and exact game without issuing the empty custom query", async () => {
    const b = bridge();
    await b.page(native());
    expect(await b.read()).toMatchObject({ state: "ok", native: true, data: { anyGame: { id: GAME, playerGameScores: [{ anyPlayer: { slug: PLAYER }, anyPlayerGameStats: { footballPlayingStatusOdds: { starterOddsBasisPoints: 8000 } } }] } } });
    expect(b.calls).toHaveLength(1);
    expect(await b.read(OTHER)).toMatchObject({ data: { anyGame: { id: OTHER, playerGameScores: [{ anyPlayerGameStats: { footballPlayingStatusOdds: null } }] } } });
  });
  it("keeps true zero, accepts 100%, and discards invalid percentages", async () => {
    const b = bridge();
    for (const n of [0, 10000]) {
      await b.page(native(n));
      expect((await b.read()).data.anyGame.playerGameScores[0].anyPlayerGameStats.footballPlayingStatusOdds.starterOddsBasisPoints).toBe(n);
    }
    await b.page(native(10001));
    expect((await b.read()).data.anyGame.playerGameScores[0].anyPlayerGameStats.footballPlayingStatusOdds.starterOddsBasisPoints).toBe(10000);
  });
  it("expires native readings and does not manufacture odds for an unseen game", async () => {
    const b = bridge();
    expect(await b.read()).toMatchObject({ state: "unseen" });
    await b.page(native());
    b.advance(15 * 60_000 + 1);
    expect(await b.read()).toMatchObject({ state: "unseen" });
    expect(b.calls).toHaveLength(1);
  });
  it("does not learn from lookalike endpoints, custom Sofix calls, or partial-error responses", async () => {
    const b = bridge();
    await b.page(native(), "https://api.sorare.com.evil.test/graphql");
    await b.page(native(), undefined, "SofixLineupChances");
    await b.page({ ...native(), errors: [{ message: "Field unavailable" }] });
    expect(await b.read()).toMatchObject({ state: "unseen" });
  });
  it("reads a squad response and never carries a player's chance into another game or player", async () => {
    const b = bridge();
    const stats = (n: number) => ({ footballPlayingStatusOdds: { starterOddsBasisPoints: n } });
    await b.page({ data: { anyGame: { id: GAME, playerGameScores: [
      { anyPlayer: { slug: "one" }, anyPlayerGameStats: stats(1000) },
      { anyPlayer: { slug: "two" }, anyPlayerGameStats: stats(9000) },
      { anyPlayerGameStats: stats(5000) },
    ] } } });
    const rows = (await b.read()).data.anyGame.playerGameScores;
    expect(rows).toHaveLength(2);
    expect(Object.fromEntries(rows.map((r: { anyPlayer: { slug: string }; anyPlayerGameStats: { footballPlayingStatusOdds: { starterOddsBasisPoints: number } } }) => [r.anyPlayer.slug, r.anyPlayerGameStats.footballPlayingStatusOdds.starterOddsBasisPoints]))).toEqual({ one: 1000, two: 9000 });
    expect(await b.read(OTHER)).toMatchObject({ state: "unseen" });
    expect(await b.read(GAME, "UntrustedQuery")).toMatchObject({ state: "refused" });
  });
});

describe("a bridge injected again into an open tab", () => {
  it("takes over: only the newest one answers, so an extension update reaches a sorare.com tab left open", async () => {
    const listeners: ((event: unknown) => Promise<void>)[] = [];
    const replies: Record<string, unknown>[] = [];
    const window = {
      fetch: async () => ({ ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ data: { currentUser: { slug: "yares", nickname: "Yares" } } }) }),
      addEventListener: (_name: string, callback: (event: unknown) => Promise<void>) => { listeners.push(callback); },
      postMessage: (answer: Record<string, unknown>) => replies.push(answer),
    };
    const context = vm.createContext({ window, Headers, URL, Date, setTimeout, clearTimeout, location: { origin: "https://sorare.com", href: "https://sorare.com/" }, document: { cookie: "", documentElement: { getAttribute: () => null } } });
    vm.runInContext(source, context);
    vm.runInContext(source, context); // the extension reloaded and put its bridge in again
    for (const listener of listeners) await listener({ source: window, data: { source: "sofix-content-9", type: "whoami", id: "who" } });
    expect(replies.filter((r) => r.id === "who")).toEqual([{ source: "sofix-bridge-9", id: "who", state: "signed-in", user: "Yares" }]);
  });
});

describe("mission eligibility queries", () => {
  it("reads only the requested game's official formations and refuses malformed game ids", async () => {
    const b = bridge();
    await b.read(GAME, "SofixArcadeElevens", { game: GAME });
    const query = (b.calls.at(-1) as { query: string }).query;
    expect(query).toContain(`anyGame(id: "${GAME}")`);
    expect(query).toContain("homeFormation { startingLineupAvailable startingLineup");
    expect(query).toContain("awayFormation { startingLineupAvailable startingLineup");
    const before = b.calls.length;
    expect(await b.read(GAME, "SofixArcadeElevens", { game: 'Game:" query { currentUser { slug } }' })).toMatchObject({ state: "refused" });
    expect(b.calls).toHaveLength(before);
  });
  // 20 Oct 2026: Sorare answered "Tasks::TaskConfig(id=) not found" to task(id: "Tasks::Task:…") and "Game(id=Game:…) not found" to gameId: "Game:…".
  it("send Sorare the bare task and game UUIDs", async () => {
    const b = bridge();
    const task = "Tasks::Task:6d26bb60-ae46-9c46-391b-6b2a6b95d399";
    await b.read(GAME, "SofixMissionGames", { tasks: [{ id: task }], fromDate: "2026-10-20T00:00:00Z", toDate: "2026-10-22T00:00:00Z" });
    await b.read(GAME, "SofixMissionCards", { pairs: [{ id: task, game: GAME }] });
    const [games, cards] = b.calls.slice(-2).map((c) => (c as { query: string }).query);
    expect(games).toContain('task(id: "6d26bb60-ae46-9c46-391b-6b2a6b95d399")');
    expect(cards).toContain('task(id: "6d26bb60-ae46-9c46-391b-6b2a6b95d399")');
    expect(cards).toContain(`pickableCards(gameId: "${GAME.slice(5)}"`);
    expect(cards).not.toContain(`"${GAME}"`);
  });
});


describe("Arcade mission history query", () => {
  it("uses named player aliases, dates and cursors instead of the unsupported player list nesting", async () => {
    const b = bridge();
    await b.read(GAME, "SofixArcadeDecisive", { players: ["a"], before: "2026-10-23T08:00:00Z", after: { a: "next-page" } });
    const query = (b.calls.at(-1) as { query: string }).query;
    expect(query).toContain('p0: anyPlayer(slug: "a")');
    expect(query).not.toContain("p1:");
    expect(query).toContain('after: "next-page"');
    expect(query).toContain('to: "2026-10-23T08:00:00Z"');
    expect(query).not.toContain("players(slugs:");
    const calls = b.calls.length;
    await b.read(GAME, "SofixArcadeDecisive", { players: ["a"], before: "wrong" });
    expect(b.calls).toHaveLength(calls);
  });
});
