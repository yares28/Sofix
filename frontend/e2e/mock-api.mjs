// Deterministic stand-in for the FastAPI backend during end-to-end tests: no database, no network.
// Serves a recorded grid (e2e/fixtures/grid-response.json) and a scripted refresh run.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

export const MOCK_PORT = Number(process.env.E2E_MOCK_PORT ?? 8765);
const TOKEN = process.env.E2E_REFRESH_TOKEN ?? "";
const recorded = JSON.parse(readFileSync(new URL("./fixtures/grid-response.json", import.meta.url), "utf8"));
const STEPS = ["sync", "predict", "weather"];
const COOLDOWN_S = 600;

let state;
function reset() {
  state = { mode: "ok", nextId: 1, run: null, polls: 0 };
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

  // Test controls. Switching the payload also records a finished run, so the app's refresh route
  // revalidates its cached grid on the next status check.
  if (req.method === "POST" && url.pathname === "/__test/reset") {
    reset();
    state.run = finishedRun("cli");
    return send(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/__test/mode") {
    state.mode = url.searchParams.get("mode") === "malformed" ? "malformed" : "ok";
    state.run = finishedRun("cli");
    return send(res, 200, { ok: true, mode: state.mode });
  }

  send(res, 404, { success: false, error: "Not found." });
});

server.listen(MOCK_PORT, "127.0.0.1", () => {
  console.info(`[mock-api] listening on http://127.0.0.1:${MOCK_PORT}`);
});
