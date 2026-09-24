// Deterministic stand-in for the FastAPI backend during end-to-end tests: no database, no network.
// Serves a recorded grid (e2e/fixtures/grid-response.json), a Sorare gameweek (e2e/fixtures/sorare-response.json),
// a scripted refresh run, and the two GitHub Actions endpoints the Refresh button uses (the app's
// GITHUB_API_URL points at /github here).
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

export const MOCK_PORT = Number(process.env.E2E_MOCK_PORT ?? 8765);
const TOKEN = process.env.E2E_REFRESH_TOKEN ?? "";
const GITHUB_TOKEN = process.env.E2E_GITHUB_TOKEN ?? "";
const GITHUB_POLLS = 3; // status checks before the scripted workflow run completes
const recorded = JSON.parse(readFileSync(new URL("./fixtures/grid-response.json", import.meta.url), "utf8"));
const sorareFixture = JSON.parse(readFileSync(new URL("./fixtures/sorare-response.json", import.meta.url), "utf8"));
const STEPS = ["sync", "predict", "weather"];
const COOLDOWN_S = 600;

// The Sorare page counts down to the lock, so the recorded gameweek is moved forward once, at start-up,
// to sit two days ahead of the machine's clock. Every date in the payload shifts by the same amount, so
// the gameweek that was played stays played.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const plannedWeek = sorareFixture.data.weeks.find((week) => week.gameweek.id === sorareFixture.data.nextId);
const SHIFT = Date.now() + 2 * 86_400_000 - new Date(plannedWeek.gameweek.lock).getTime();
const moved = (value) => {
  if (typeof value === "string") return ISO.test(value) ? new Date(new Date(value).getTime() + SHIFT).toISOString() : value;
  if (Array.isArray(value)) return value.map(moved);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, moved(v)]));
  return value;
};
const sorare = { ...sorareFixture, data: moved(sorareFixture.data) };

let state;
function reset() {
  state = { mode: "ok", sorare: "ok", nextId: 1, run: null, polls: 0 };
}
reset();

function runOut(run) {
  return {
    id: run.id, trigger: run.trigger, status: run.status, step: run.step,
    started_at: new Date(run.startedAt).toISOString(),
    finished_at: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
    error: null, steps: run.steps,
  };
}
function status() {
  const run = state.run;
  const retryAfter = run ? Math.max(0, Math.ceil(COOLDOWN_S - (Date.now() - run.startedAt) / 1000)) : 0;
  return { run: run ? runOut(run) : null, retry_after: retryAfter };
}
function finishedRun(trigger) {
  const now = Date.now();
  return { id: state.nextId++, trigger, status: "succeeded", step: null, startedAt: now - COOLDOWN_S * 1000, finishedAt: now, steps: {} };
}

function send(res, code, body) {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${MOCK_PORT}`);
  const admin = url.pathname.startsWith("/api/admin/");
  if (admin && req.headers.authorization !== `Bearer ${TOKEN}`) {
    return send(res, 401, { success: false, data: null, error: "Not authorised.", meta: null });
  }

  if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true });

  if (req.method === "GET" && url.pathname === "/api/fixture-grid") {
    if (state.mode === "malformed") return send(res, 200, { success: true, data: { season: 2026, teams: "broken" }, meta: null });
    const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
    return send(res, 200, {
      ...recorded,
      meta: { ...recorded.meta, last_synced_at: minutesAgo(12), last_predicted_at: minutesAgo(12) },
    });
  }

  if (req.method === "GET" && url.pathname === "/api/sorare") {
    if (state.sorare === "missing") {
      return send(res, 200, { success: false, data: null, error: "Sorare has not been synced yet.", meta: null });
    }
    return send(res, 200, sorare);
  }

  if (req.method === "POST" && url.pathname === "/api/admin/refresh") {
    const run = state.run;
    if (run?.status === "running") return send(res, 409, { success: false, data: status(), error: "A refresh is already running.", meta: null });
    if (run && status().retry_after > 0) {
      res.setHeader("retry-after", String(status().retry_after));
      return send(res, 429, { success: false, data: status(), error: "Refreshed recently. Try again later.", meta: null });
    }
    state.run = { id: state.nextId++, trigger: "button", status: "running", step: null, startedAt: Date.now(), finishedAt: null, steps: {} };
    state.polls = 0;
    return send(res, 202, { success: true, data: status(), error: null, meta: null });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/refresh/latest") {
    const run = state.run;
    if (run?.status === "running") {
      state.polls += 1;
      if (state.polls > STEPS.length) {
        Object.assign(run, { status: "succeeded", step: null, finishedAt: Date.now() });
      } else {
        const step = STEPS[state.polls - 1];
        for (const done of STEPS.slice(0, state.polls - 1)) run.steps[done] = "succeeded";
        run.step = step;
      }
    }
    return send(res, 200, { success: true, data: status(), error: null, meta: null });
  }

  // GitHub Actions stand-in: start the refresh workflow, and report its latest run.
  const gh = url.pathname.match(/^\/github\/repos\/[^/]+\/[^/]+\/actions\/workflows\/refresh\.yml\/(runs|dispatches)$/);
  if (gh) {
    if (req.headers.authorization !== `Bearer ${GITHUB_TOKEN}`) return send(res, 401, { message: "Bad credentials" });
    if (gh[1] === "dispatches" && req.method === "POST") {
      state.run = { id: state.nextId++, trigger: "button", status: "running", step: null, startedAt: Date.now(), finishedAt: null, steps: {} };
      state.polls = 0;
      res.writeHead(204);
      return res.end();
    }
    if (gh[1] === "runs" && req.method === "GET") {
      const run = state.run;
      if (run?.status === "running") {
        state.polls += 1;
        if (state.polls > GITHUB_POLLS) Object.assign(run, { status: "succeeded", finishedAt: Date.now() });
      }
      const workflow = run && {
        id: run.id,
        status: run.status === "running" ? (state.polls <= 1 ? "queued" : "in_progress") : "completed",
        conclusion: run.status === "running" ? null : "success",
        created_at: new Date(run.startedAt).toISOString(),
        updated_at: new Date(run.finishedAt ?? Date.now()).toISOString(),
      };
      return send(res, 200, { total_count: workflow ? 1 : 0, workflow_runs: workflow ? [workflow] : [] });
    }
  }

  // Test controls. Switching the payload also records a finished run, so the app's refresh route
  // revalidates its cached grid on the next status check.
  if (req.method === "POST" && url.pathname === "/__test/reset") {
    reset();
    state.run = finishedRun("cli");
    return send(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/__test/mode") {
    state.mode = url.searchParams.get("mode") === "malformed" ? "malformed" : "ok";
    state.sorare = url.searchParams.get("sorare") === "missing" ? "missing" : "ok";
    state.run = finishedRun("cli");
    return send(res, 200, { ok: true, mode: state.mode, sorare: state.sorare });
  }

  send(res, 404, { success: false, error: "Not found." });
});

server.listen(MOCK_PORT, "127.0.0.1", () => {
  console.info(`[mock-api] listening on http://127.0.0.1:${MOCK_PORT}`);
});
