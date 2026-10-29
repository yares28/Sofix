#!/usr/bin/env node
// Local production-build benchmark. Never target production or an upstream service.
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = new URL(option("--base", "http://127.0.0.1:3181"));
if (base.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) || base.username || base.password) {
  throw new Error("Performance requests must stay on a loopback HTTP server with mock or local blocks.");
}
const clients = Number(option("--clients", "10"));
const rounds = Number(option("--rounds", "2"));
if (![clients, rounds].every(n => Number.isInteger(n) && n >= 1 && n <= 30)) throw new Error("Use 1–30 clients and rounds.");
const routes = ["/", "/play", "/fixtures", "/difficulty", "/table", "/season", "/cards", "/players", "/lineups", "/scores", "/missions", "/arcade", "/targets", "/stats", "/prices", "/control", "/audit", "/audit/starts", "/audit/record", "/audit/lineups", "/audit/versus", "/audit/strategies", "/audit/missions", "/audit/rewards", "/team/ATL"];
const workload = ["/", "/players", "/difficulty", "/play", "/cards", "/table"];
const samples = [];

async function request(route, kind) {
  const started = performance.now();
  try {
    const response = await fetch(new URL(route, base), {
      headers: kind === "rsc" || kind === "load" ? { rsc: "1", "accept-encoding": "identity" } : { "accept-encoding": "identity" },
      redirect: "manual", signal: AbortSignal.timeout(30_000),
    });
    const bytes = (await response.arrayBuffer()).byteLength;
    const contentType = response.headers.get("content-type") ?? "";
    const location = response.headers.get("location");
    const redirect = [307, 308].includes(response.status) && location && new URL(location, base).origin === base.origin;
    return { route, kind, status: response.status, bytes, ms: +(performance.now() - started).toFixed(1),
      ok: Boolean(redirect || response.ok && contentType.includes(kind === "html" ? "text/html" : "text/x-component")),
      ...(location ? { location } : {}),
      cache: response.headers.get("x-nextjs-cache"), contentType };
  } catch (error) {
    return { route, kind, status: 0, bytes: 0, ms: +(performance.now() - started).toFixed(1), ok: false, error: error.name };
  }
}

// One pass records cold/warm observations; "cold" means the first request in this run, not a fresh server process.
for (const route of routes) {
  const html = await request(route, "html");
  const rsc = await request(route, "rsc");
  samples.push(html, rsc);
  console.log(`${route.padEnd(20)} HTML ${html.ms} ms / ${html.bytes} B; RSC ${rsc.ms} ms / ${rsc.bytes} B${html.ok && rsc.ok ? "" : " FAILED"}`);
}
const started = performance.now();
await Promise.all(Array.from({ length: clients }, async (_, client) => {
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < workload.length; i++) samples.push(await request(workload[(i + client) % workload.length], "load"));
  }
}));
const elapsedSeconds = (performance.now() - started) / 1000;
const loaded = samples.filter(s => s.kind === "load");
const times = loaded.map(s => s.ms).sort((a, b) => a - b);
const percentile = p => times[Math.max(0, Math.ceil(times.length * p) - 1)];
const summary = { clients, rounds, requests: loaded.length, errors: loaded.filter(s => !s.ok).length,
  elapsedSeconds: +elapsedSeconds.toFixed(2), requestsPerSecond: +(loaded.length / elapsedSeconds).toFixed(2),
  p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99) };
const loadByRoute = workload.map(route => {
  const rows = loaded.filter(row => row.route === route);
  const sorted = rows.map(row => row.ms).sort((a, b) => a - b);
  return { route, requests: rows.length, errors: rows.filter(row => !row.ok).length,
    p50Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.5) - 1)], p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] };
});
const report = { measuredAt: new Date().toISOString(), base: base.origin, note: "Local HTTP with uncompressed response bodies. No browser hydration, network latency, account isolation or upstream capacity is measured. Load is back-to-back with no think time; earlier routes are warm. Run against a production build with mocks only for repeated load.", summary, loadByRoute, samples: samples.filter(row => row.kind !== "load"), failures: loaded.filter(row => !row.ok).slice(0, 20) };
console.log(JSON.stringify(summary, null, 2));
const output = option("--out", null);
if (output) await writeFile(output, JSON.stringify(report, null, 2) + "\n");
if (samples.some(s => !s.ok)) process.exitCode = 1;
