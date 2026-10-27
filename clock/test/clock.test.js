// node --test clock/   (no dependencies: the Worker is plain JavaScript)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { due, matches, tick } from "../src/clock.js";

const timetable = JSON.parse(readFileSync(new URL("../timetable.json", import.meta.url), "utf8"));
const at = (iso) => new Date(iso);

test("cron fields: numbers, lists, ranges, steps and the weekday", () => {
  assert.ok(matches("17 7 * * *", at("2026-10-27T07:17:00Z")));
  assert.ok(!matches("17 7 * * *", at("2026-10-27T07:18:00Z")));
  assert.ok(matches("11,41 * * * *", at("2026-10-27T03:41:00Z")));
  assert.ok(matches("*/30 * * * *", at("2026-10-27T03:30:00Z")));
  assert.ok(!matches("*/30 * * * *", at("2026-10-27T03:15:00Z")));
  assert.ok(matches("0 9-17 * * *", at("2026-10-27T17:00:00Z")));
  assert.ok(matches("37 13 * * 1", at("2026-10-26T13:37:00Z"))); // a Monday
  assert.ok(!matches("37 13 * * 1", at("2026-10-27T13:37:00Z"))); // a Tuesday
  assert.ok(matches("0 0 * * 0", at("2026-11-01T00:00:00Z"))); // Sunday is 0
});

test("a time is due for 10 minutes after it, at its own minute", () => {
  const jobs = [{ workflow: "a.yml", cron: "17 7 * * *" }];
  assert.deepEqual(due(jobs, at("2026-10-27T07:16:59Z")), []);
  assert.equal(due(jobs, at("2026-10-27T07:17:30Z"))[0].slot.toISOString(), "2026-10-27T07:17:00.000Z");
  assert.equal(due(jobs, at("2026-10-27T07:26:00Z"))[0].slot.toISOString(), "2026-10-27T07:17:00.000Z");
  assert.deepEqual(due(jobs, at("2026-10-27T07:27:00Z")), []);
});

test("the latest time counts when two fall in the window", () => {
  const [hit] = due([{ workflow: "a.yml", cron: "*/5 * * * *" }], at("2026-10-27T07:12:00Z"));
  assert.equal(hit.slot.toISOString(), "2026-10-27T07:10:00.000Z");
});

function github({ runsSince = {}, failDispatch = false } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body && JSON.parse(init.body), headers: init.headers });
    if (init.method === "POST") return new Response(null, { status: failDispatch ? 422 : 204 });
    const workflow = url.match(/workflows\/([^/]+)\/runs/)[1];
    return Response.json({ total_count: runsSince[workflow] ?? 0, workflow_runs: [] });
  };
  return { fetch, calls };
}
const env = { GITHUB_TOKEN: "t" };
const table = { repo: "o/r", ref: "main", jobs: [{ workflow: "refresh.yml", cron: "7 12 * * *", inputs: { trigger: "schedule" } }] };

test("a due workflow with no run since its time is started, with its inputs", async () => {
  const { fetch, calls } = github();
  const log = await tick(table, env, at("2026-10-27T12:07:05Z"), fetch);
  assert.match(calls[0].url, /\/repos\/o\/r\/actions\/workflows\/refresh\.yml\/runs\?created=%3E%3D2026-10-27T12%3A07%3A00Z&per_page=1$/);
  assert.equal(calls[1].method, "POST");
  assert.match(calls[1].url, /\/repos\/o\/r\/actions\/workflows\/refresh\.yml\/dispatches$/);
  assert.deepEqual(calls[1].body, { ref: "main", inputs: { trigger: "schedule" } });
  assert.equal(calls[1].headers.authorization, "Bearer t");
  assert.ok(calls[1].headers["user-agent"]);
  assert.deepEqual(log, ["started refresh.yml for 12:07 UTC"]);
});

test("a run created since the time (the clock's own, a button, a push) means nothing is started", async () => {
  const { fetch, calls } = github({ runsSince: { "refresh.yml": 1 } });
  assert.deepEqual(await tick(table, env, at("2026-10-27T12:09:00Z"), fetch), []);
  assert.equal(calls.length, 1);
});

test("nothing due: GitHub is not asked anything", async () => {
  const { fetch, calls } = github();
  assert.deepEqual(await tick(table, env, at("2026-10-27T13:00:00Z"), fetch), []);
  assert.equal(calls.length, 0);
});

test("one failing workflow is reported and the others still start", async () => {
  const two = { ...table, jobs: [...table.jobs, { workflow: "score-checks.yml", cron: "11,41 * * * *" }] };
  let first = true;
  const { fetch: ok, calls } = github();
  const fetch = async (url, init) => {
    if (first) {
      first = false;
      throw new Error("network down");
    }
    return ok(url, init);
  };
  const log = await tick(two, env, at("2026-10-27T12:11:00Z"), fetch);
  assert.deepEqual(log, ["refresh.yml for 12:07 UTC failed: network down", "started score-checks.yml for 12:11 UTC"]);
  assert.deepEqual(calls.at(-1).body, { ref: "main" });
});

test("a refused start is reported with GitHub's status", async () => {
  const { fetch } = github({ failDispatch: true });
  assert.deepEqual(await tick(table, env, at("2026-10-27T12:07:00Z"), fetch), ["refresh.yml for 12:07 UTC failed: GitHub answered 422"]);
});

test("without a token nothing is called", async () => {
  const { fetch, calls } = github();
  assert.deepEqual(await tick(table, {}, at("2026-10-27T12:07:00Z"), fetch), ["GITHUB_TOKEN is not set: nothing started"]);
  assert.equal(calls.length, 0);
});

// The refresh keeps GitHub's own timer as a backup for a dead clock, so both must say the same times.
test("refresh.yml's GitHub times and the clock's are the same", () => {
  const yml = readFileSync(new URL("../../.github/workflows/refresh.yml", import.meta.url), "utf8");
  const github = [...yml.matchAll(/- cron: "([^"]+)"/g)].map((m) => m[1]).sort();
  const clock = timetable.jobs.filter((j) => j.workflow === "refresh.yml").map((j) => j.cron).sort();
  assert.deepEqual(clock, github);
});

// Every other timed workflow is started by the clock alone: GitHub's late copies would double their Neon reads.
test("every other workflow the clock starts has no GitHub timer, and can be started by hand", () => {
  for (const workflow of new Set(timetable.jobs.map((j) => j.workflow))) {
    const yml = readFileSync(new URL(`../../.github/workflows/${workflow}`, import.meta.url), "utf8");
    assert.match(yml, /^\s+workflow_dispatch:/m, workflow);
    if (workflow !== "refresh.yml") assert.doesNotMatch(yml, /^\s+schedule:/m, workflow);
  }
});
