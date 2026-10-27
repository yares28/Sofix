#!/usr/bin/env node
/**
 * The one check before a push. Sofix ships straight to main (AGENTS.md "Shipping"): these local checks are the gate, and
 * CI repeats everything after the push without anyone waiting for it.
 *
 *     node scripts/check.mjs          backend and/or frontend checks for what changed since origin/main (committed or not)
 *     node scripts/check.mjs --all    both sides, whatever changed
 *     node scripts/check.mjs --live   after a push, or at the start of a session: waits for Vercel to deploy origin/main,
 *                                     opens the home page on production, then prints CI's and the last refresh's state
 *     node scripts/check.mjs --live /lineups /play
 *                                     the same, also opening those pages, then the links to test them on localhost and
 *                                     production (the local dev server is started if it is not running)
 *     node scripts/check.mjs --live --all-pages
 *                                     opens all 15 pages (after a change to shared code); each is billed Vercel CPU
 *
 * It fixes what it can (ruff format, the OpenAPI document, the generated API types) and says so: commit those files too.
 * One line per step; a failing step prints the end of its output. Browser tests are not run here: run the changed page's
 * spec (AGENTS.md "Shipping").
 */
import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "yares28/Sofix";
const PROD = "https://sofix-livid.vercel.app"; // the address the owner browses (same app as APP_URL)
const LOCAL = "http://localhost:3000";
const PAGES = ["/", "/play", "/missions", "/lineups", "/scores", "/fixtures", "/difficulty", "/table", "/audit", "/audit/missions", "/cards", "/players", "/stats", "/control", "/team/ATL"];
const args = process.argv.slice(2);
const failed = [];

const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8" }).trim();
const read = (path) => (existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), "utf8") : "");
// A session in a worktree has no venv or .env of its own: it uses the main folder's.
const mainFolder = () => git("worktree list --porcelain").split("\n")[0].slice("worktree ".length);
const fromMainFolder = (path) => [join(ROOT, path), join(mainFolder(), path)].find(existsSync);

function run(label, cmd, cwd, env = {}) {
  const start = Date.now();
  const r = spawnSync(cmd, { cwd, shell: true, encoding: "utf8", maxBuffer: 1 << 26, env: { ...process.env, ...env } });
  const ok = r.status === 0;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}  ${Math.round((Date.now() - start) / 1000)}s`);
  if (!ok) {
    console.log(`${r.stdout}${r.stderr}`.trim().split("\n").slice(-60).join("\n"));
    failed.push(label);
  }
  return r;
}

function changedFiles() {
  try {
    git("fetch -q origin main");
  } catch {
    console.log("(offline: comparing with the last fetched origin/main)");
  }
  const lists = [git("diff --name-only origin/main...HEAD"), git("diff --name-only HEAD"), git("ls-files --others --exclude-standard")];
  return [...new Set(lists.join("\n").split("\n").filter(Boolean))];
}

function local() {
  const files = args.includes("--all") ? null : changedFiles();
  const touches = (dir) => !files || files.some((f) => f.startsWith(dir) && !f.endsWith(".md"));
  const backend = touches("backend/");
  let frontend = touches("frontend/") || touches("extension/"); // the extension's logic is unit-tested in frontend/lib
  const clock = touches("clock/") || touches(".github/workflows/"); // its tests also read the workflows' timers
  if (!backend && !frontend && !clock) return console.log("Nothing to check: no backend, frontend, extension or clock change.");
  if (clock) run("clock tests", 'node --test "clock/test/*.test.js"', ROOT);

  if (backend) {
    const py = fromMainFolder("backend/.venv/Scripts/python.exe");
    if (!py) throw new Error("backend/.venv is missing: create it (AGENTS.md Commands)");
    const cwd = join(ROOT, "backend");
    if (/\b[1-9]\d* files? reformatted/.test(run("ruff format", `"${py}" -m ruff format .`, cwd).stdout)) {
      console.log("      ruff reformatted files: commit them");
    }
    run("ruff check", `"${py}" -m ruff check .`, cwd);
    run("mypy", `"${py}" -m mypy`, cwd);
    // As in CI: the tests must never reach a real database, whatever .env holds.
    run("pytest", `"${py}" -m pytest -q`, cwd, { POSTGRES_URL: "sqlite://", POSTGRES_MIGRATION_URL: "" });
    const before = read("frontend/lib/openapi.json");
    run("openapi export", `"${py}" -m app.openapi_export`, cwd);
    if (read("frontend/lib/openapi.json") !== before) {
      console.log("      frontend/lib/openapi.json was out of date and is rewritten: commit it");
      frontend = true;
    }
  }

  if (frontend) {
    const cwd = join(ROOT, "frontend");
    if (!existsSync(join(cwd, "node_modules"))) run("npm ci", "npm ci", cwd);
    const before = read("frontend/lib/api.gen.ts");
    run("api types", "npm run gen:types", cwd);
    if (read("frontend/lib/api.gen.ts") !== before) console.log("      frontend/lib/api.gen.ts was out of date and is rewritten: commit it");
    run("eslint", "npm run lint", cwd);
    run("typecheck", "npm run typecheck", cwd);
    run("vitest", "npm test", cwd);
  }

  if (!files || files.some((f) => /^frontend\/(app|components|hooks)\/|\.css$/.test(f))) {
    console.log("UI changed: run the page's spec (npx playwright test e2e/<page>.e2e.ts) and look at it at 1440 and 390 px.");
  }
}

// The owner's `gh` sign-in when there is one (5,000 calls an hour); without it the public API allows 60.
let token;
try {
  token = execSync("gh auth token", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
} catch {
  token = "";
}

// GitHub out of reach (offline, or the 60-an-hour limit without a sign-in) is said once and the rest still runs: null.
let unreachable = false;
async function github(path) {
  if (unreachable) return null;
  const headers = { accept: "application/vnd.github+json", ...(token && { authorization: `Bearer ${token}` }) };
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/${path}`, { headers });
    const body = await r.json();
    if (r.ok) return body;
    throw new Error(`${r.status}: ${body.message?.split(". ")[0]}`);
  } catch (error) {
    unreachable = true;
    console.log(`      GitHub not reachable (${error.message}): deploy, CI and refresh state not read${token ? "" : "; `gh auth login` lifts the limit"}`);
    return null;
  }
}

const ago = (time) => {
  const min = Math.round((Date.now() - Date.parse(time)) / 60_000);
  return min < 120 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
};

async function live() {
  const env = fromMainFolder(".env");
  if (env) process.loadEnvFile(env); // APP_URL and VERCEL_BYPASS_SECRET; never printed
  const { APP_URL, VERCEL_BYPASS_SECRET } = process.env;
  if (!APP_URL || !VERCEL_BYPASS_SECRET) throw new Error("the root .env needs APP_URL and VERCEL_BYPASS_SECRET");
  try {
    git("fetch -q origin main");
  } catch {
    console.log("(offline: using the last fetched origin/main)");
  }
  const sha = git("rev-parse origin/main");
  const short = sha.slice(0, 7);

  // 1. Vercel deploys every push to main in a minute or two and reports it on the commit.
  // --no-wait (the session-start hook) looks once: a deploy still running is reported, not waited for.
  const tries = args.includes("--no-wait") ? 1 : 24;
  let vercel;
  for (let i = 0; i < tries; i++) {
    const status = await github(`commits/${sha}/status`);
    if (!status) break;
    vercel = status.statuses.find((s) => s.context === "Vercel");
    if ((vercel && vercel.state !== "pending") || i === tries - 1) break;
    if (i === 0) console.log(`Waiting for Vercel to deploy ${short}...`);
    await new Promise((done) => setTimeout(done, 15_000));
  }
  const deployed = vercel?.state === "success";
  if (unreachable) console.log(`      Vercel ${short}: unknown, so the pages below may still be the previous deploy`);
  else {
  const building = tries === 1 && (!vercel || vercel.state === "pending");
  console.log(`${deployed ? "ok  " : building ? "    " : "FAIL"}  Vercel ${short}: ${vercel ? `${vercel.state}, ${vercel.description}` : "no report yet"}`);
  if (!deployed && !building) failed.push("Vercel");
  }

  // 4's pages, read here because step 2 opens them.
  // `/lineups` or `lineups`; Git Bash turns `/lineups` into `C:/Program Files/Git/lineups`, so that prefix is dropped.
  const changed = args
    .filter((arg) => !arg.startsWith("--"))
    .map((arg) => arg.replace(/^[A-Za-z]:\/.*?\/Git(?=\/)/, "").replace(/^(?!\/)/, "/"));

  // 2. Pages answer on production, through the bypass the refresh job uses. Each one is a full server render billed to
  // Vercel's free 4 h of CPU a month, and this sweep was two thirds of it (23 Oct 2026): so the home page and the changed
  // pages only; --all-pages opens all 15 (after a change to shared code: the app shell, nav, lib/weeks.ts, lib/db.ts).
  const pages = await Promise.all(
    (args.includes("--all-pages") ? PAGES : [...new Set(["/", ...changed])]).map(async (page) => {
      const r = await fetch(new URL(page, APP_URL), { headers: { "x-vercel-protection-bypass": VERCEL_BYPASS_SECRET }, redirect: "manual" });
      return [page, r.status];
    }),
  );
  const broken = pages.filter(([, status]) => status !== 200);
  console.log(`${broken.length ? "FAIL" : "ok  "}  production pages: ${broken.length ? broken.map(([p, s]) => `${s} ${p}`).join(", ") : `${pages.map(([p]) => p).join(" ")} answer 200`}`);
  if (broken.length) failed.push("pages");

  // 3. CI and the refresh as they stand: read, never waited for.
  const jobs = (await github(`commits/${sha}/check-runs`))?.check_runs ?? [];
  for (const job of jobs) {
    const state = job.status === "completed" ? job.conclusion : job.status;
    console.log(`${state === "failure" ? "FAIL" : "    "}  CI ${job.name}: ${state}`);
    if (state === "failure") failed.push(`CI ${job.name}`);
  }
  if (!jobs.length && !unreachable) console.log(`      CI has not started on ${short} yet`);
  const [refresh] = (await github("actions/workflows/refresh.yml/runs?per_page=1"))?.workflow_runs ?? [];
  if (refresh) {
    const state = refresh.status === "completed" ? refresh.conclusion : refresh.status;
    console.log(`${state === "failure" ? "FAIL" : "    "}  last refresh (${refresh.event}, ${ago(refresh.created_at)}): ${state}`);
    if (state === "failure") failed.push("refresh");
  }
  // The outside clock (clock/, Cloudflare) starts the near-lock check every 30 minutes and nothing else does on a timer.
  const [tickRun] = (await github("actions/workflows/near-lock.yml/runs?per_page=1"))?.workflow_runs ?? [];
  if (tickRun) {
    const silent = Date.now() - Date.parse(tickRun.created_at) > 45 * 60_000;
    console.log(`${silent ? "FAIL" : "ok  "}  clock: last near-lock check started ${ago(tickRun.created_at)}${silent ? " (Cloudflare's sofix-clock is not starting runs)" : ""}`);
    if (silent) failed.push("clock");
  }

  await neonProjects();

  // 4. Where the owner tests it: the main folder's dev server (hot reload, real read models) and production.
  if (changed.length) {
    await devServer();
    console.log("\nTest it:");
    for (const page of changed) console.log(`  ${LOCAL}${page}\n  ${PROD}${page}`);
  }
}

// The free Neon projects that take turns (AGENTS.md "Neon projects").
const NEON_NAMES = { "ep-cold-cloud-b9akf8sh": "Sofix", "ep-jolly-sun-b1a0xc1l": "FDR", "ep-morning-paper-baxx0rh5": "Sofix B", "ep-mute-wind-bao6tz8d": "Sofix C", "ep-withered-bread-baipuaae": "Sofix D" };

/**
 * One line: which project is live and which are out of quota, as the last job saw them (`neon_status`, which
 * backend/app/jobs/neon_switch.py publishes to R2). Read from R2 with frontend/.env.local's read key: no session asks Neon.
 */
async function neonProjects() {
  const frontend = dirname(fromMainFolder("frontend/package.json"));
  const read = spawnSync("node --experimental-strip-types --no-warnings scripts/blocks.mjs --get neon_status", { cwd: frontend, shell: true, encoding: "utf8" });
  let block = null;
  try {
    block = JSON.parse(read.stdout);
  } catch {
    // below
  }
  const status = block?.payload;
  if (!status?.projects) {
    console.log(`FAIL  Neon: no status on R2 (${(read.stderr || read.stdout).trim().split(/\r?\n/).pop() || "nothing published"})`);
    return failed.push("Neon");
  }
  const name = (endpoint) => NEON_NAMES[String(endpoint).replace(/-pooler$/, "")] ?? endpoint;
  const down = status.projects.filter((p) => !p.answers).map((p) => `${name(p.endpoint)} out of quota`);
  console.log(`ok    Neon: live ${name(status.live)} (seen ${ago(block.updatedAt)})${down.length ? `; ${down.join(", ")}` : ""}`);
  const gb = (bytes) => (bytes === null ? "?" : `${(bytes / 1024 ** 3).toFixed(1)} GB`);
  const sent = status.projects.map((p) => `${name(p.endpoint)} ${gb(p.sentBytes)}`).join(", ");
  console.log(`${status.note ? "FAIL" : "    "}  Neon sent this month (moves at ${gb(status.limitBytes)}): ${sent}${status.note ? ` (${status.note})` : ""}`);
  if (status.note) failed.push("Neon usage");
}

const answers = (url) => fetch(url, { signal: AbortSignal.timeout(60_000) }).then((r) => r.status < 500, () => false);

/** Starts `npm run dev` in the main folder, detached so it outlives the session, unless localhost:3000 already answers. */
async function devServer() {
  if (await answers(`${LOCAL}/`)) return console.log(`ok    localhost:3000 is running`);
  const log = join(tmpdir(), "sofix-dev.log");
  const out = openSync(log, "w");
  spawn("npm run dev", { cwd: join(mainFolder(), "frontend"), shell: true, detached: true, windowsHide: true, stdio: ["ignore", out, out] }).unref();
  for (let i = 0; i < 30; i++) {
    await new Promise((done) => setTimeout(done, 2_000));
    if (await answers(`${LOCAL}/`)) return console.log(`ok    localhost:3000 started (log: ${log})`);
  }
  console.log(`FAIL  localhost:3000 did not start in a minute: see ${log}`);
  failed.push("localhost");
}

try {
  if (args.includes("--live")) await live();
  else local();
} catch (error) {
  console.log(`FAIL  ${error.message}`);
  failed.push("setup");
}
console.log(failed.length ? `\n${failed.length} failed: ${failed.join(", ")}` : "\nAll clear.");
process.exit(failed.length ? 1 : 0);
