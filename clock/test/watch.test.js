// The Pro teamsheet watch (plans/pro-page.md, "Teamsheet watch"): every 5 minutes from 75 minutes before kickoff to kickoff,
// until both sides are on the page; one start of pro-sheets.yml when a side is newly out; never more than one start per 4 minutes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BEAT, WATCH, watch, watched } from "../src/watch.js";

const at = (iso) => new Date(iso);
const table = { repo: "o/r", ref: "main", jobs: [] };
const KICKOFF = "2026-11-26T17:45:00Z";

function bucket(payload) {
  const put = [];
  return {
    put,
    PAGES: {
      get: async (key) => (key === WATCH && payload ? { json: async () => ({ updatedAt: "u", payload }) } : null),
      put: async (key, body) => put.push({ key, body: JSON.parse(body) }),
    },
  };
}

const formation = (n) => ({ startingLineupAvailable: n > 0, startingLineup: n ? [Array.from({ length: n }, (_, i) => ({ slug: `p${i}` }))] : [] });

function apis({ home = 0, away = 0, runsSince = 0, sorareStatus = 200 } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body && JSON.parse(init.body) });
    if (url.startsWith("https://api.sorare.com/")) {
      if (sorareStatus !== 200) return new Response(null, { status: sorareStatus });
      return Response.json({ data: { anyGame: { homeFormation: formation(home), awayFormation: formation(away) } } });
    }
    if (init.method === "POST") return new Response(null, { status: 204 });
    return Response.json({ total_count: runsSince, workflow_runs: [] });
  };
  return { fetch, calls };
}

const listed = { games: [{ id: "Game:1", kickoff: KICKOFF }], applied: {} };
const env = (payload = listed) => ({ GITHUB_TOKEN: "t", ...bucket(payload) });
const sorare = (calls) => calls.filter((c) => c.url.startsWith("https://api.sorare.com/"));
const github = (calls) => calls.filter((c) => c.url.startsWith("https://api.github.com/"));

test("the window runs from 75 minutes before kickoff to kickoff, and closes once both sides are applied", () => {
  assert.deepEqual(watched(listed, at("2026-11-26T16:25:00Z")), []);
  assert.equal(watched(listed, at("2026-11-26T16:30:00Z")).length, 1);
  assert.equal(watched(listed, at("2026-11-26T17:40:00Z")).length, 1);
  assert.deepEqual(watched(listed, at(KICKOFF)), []);
  assert.equal(watched({ ...listed, applied: { "Game:1": 1 } }, at("2026-11-26T17:00:00Z")).length, 1);
  assert.deepEqual(watched({ ...listed, applied: { "Game:1": 2 } }, at("2026-11-26T17:00:00Z")), []);
  assert.deepEqual(watched(null, at("2026-11-26T17:00:00Z")), []);
});

test("only every fifth minute: R2, Sorare and GitHub are not asked in between", async () => {
  const e = env();
  let read = 0;
  const get = e.PAGES.get;
  e.PAGES.get = async (key) => (read++, get(key));
  const { fetch, calls } = apis();
  assert.deepEqual(await watch(table, e, at("2026-11-26T17:01:00Z"), fetch), []);
  assert.equal(read, 0);
  assert.equal(calls.length, 0);
});

test("outside every window: one small R2 read, nothing asked of Sorare or GitHub, no heartbeat", async () => {
  const e = env();
  const { fetch, calls } = apis();
  assert.deepEqual(await watch(table, e, at("2026-11-26T12:00:00Z"), fetch), []);
  assert.equal(calls.length, 0);
  assert.equal(e.put.length, 0);
});

test("a cold start (no watch list yet) does nothing", async () => {
  const e = env(null);
  const { fetch, calls } = apis();
  assert.deepEqual(await watch(table, e, at("2026-11-26T17:00:00Z"), fetch), []);
  assert.equal(calls.length, 0);
});

test("teams not out: Sorare is asked once, the heartbeat says when, nothing is started", async () => {
  const e = env();
  const { fetch, calls } = apis();
  assert.deepEqual(await watch(table, e, at("2026-11-26T17:00:00Z"), fetch), []);
  assert.equal(sorare(calls).length, 1);
  assert.deepEqual(sorare(calls)[0].body.variables, { id: "Game:1" });
  assert.equal(github(calls).length, 0);
  assert.deepEqual(e.put, [{ key: BEAT, body: { updatedAt: "2026-11-26T17:00:00.000Z", payload: { checkedAt: "2026-11-26T17:00:00.000Z", games: { "Game:1": 0 } } } }]);
});

test("a side newly out starts pro-sheets.yml once", async () => {
  const e = env();
  const { fetch, calls } = apis({ home: 11, away: 11 });
  assert.deepEqual(await watch(table, e, at("2026-11-26T16:50:00Z"), fetch), ["teams out: started pro-sheets.yml"]);
  const [list, start] = github(calls);
  assert.match(list.url, /workflows\/pro-sheets\.yml\/runs\?created=%3E%3D2026-11-26T16%3A46%3A00Z&per_page=1$/);
  assert.equal(start.method, "POST");
  assert.deepEqual(start.body, { ref: "main" });
});

test("a run started in the last 4 minutes is left to finish", async () => {
  const { fetch, calls } = apis({ home: 11, runsSince: 1 });
  assert.deepEqual(await watch(table, env(), at("2026-11-26T16:50:00Z"), fetch), ["teams out: pro-sheets.yml already started"]);
  assert.equal(github(calls).filter((c) => c.method === "POST").length, 0);
});

test("a side already applied is not started again; the other side still is", async () => {
  const one = { ...listed, applied: { "Game:1": 1 } };
  const same = apis({ home: 11 });
  assert.deepEqual(await watch(table, env(one), at("2026-11-26T17:00:00Z"), same.fetch), []);
  const more = apis({ home: 11, away: 11 });
  assert.deepEqual(await watch(table, env(one), at("2026-11-26T17:05:00Z"), more.fetch), ["teams out: started pro-sheets.yml"]);
});

test("a side Sorare lists with fewer than eleven does not count", async () => {
  const { fetch, calls } = apis({ home: 10 });
  assert.deepEqual(await watch(table, env(), at("2026-11-26T17:00:00Z"), fetch), []);
  assert.equal(github(calls).length, 0);
});

test("Sorare failing is logged and the heartbeat shows the game unread; the next look tries again", async () => {
  const e = env();
  const { fetch } = apis({ sorareStatus: 429 });
  assert.deepEqual(await watch(table, e, at("2026-11-26T17:00:00Z"), fetch), ["Game:1: Sorare answered 429"]);
  assert.deepEqual(e.put[0].body.payload.games, { "Game:1": null });
});

test("without the R2 binding the watch says so instead of failing quietly", async () => {
  const { fetch } = apis();
  assert.deepEqual(await watch(table, { GITHUB_TOKEN: "t" }, at("2026-11-26T17:00:00Z"), fetch), ["PAGES (R2) is not bound: no Pro teamsheet watch"]);
});
