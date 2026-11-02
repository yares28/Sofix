// Run the production app on loopback, reading a local copy of the published blocks.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { repositoryFromRemote } from "./installation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAFE_SETTINGS = ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "EXTENSION_TOKEN", "REVALIDATE_SECRET", "REFRESH_TOKEN", "EXTENSION_DIR", "GITHUB_TOKEN", "GITHUB_REPO"];
const SYSTEM_KEYS = /^(path|systemroot|windir|comspec|pathext|temp|tmp|userprofile|homedrive|homepath|localappdata|appdata|programfiles.*|commonprogramfiles.*|processor_architecture|number_of_processors|os|lang|lc_all|term|no_color)$/i;

export function localEnvironment({ inherited, settings, envDir, frontend, port }) {
  const env = Object.fromEntries(Object.entries(inherited).filter(([key]) => SYSTEM_KEYS.test(key)));
  for (const key of SAFE_SETTINGS) if (settings[key]) env[key] = settings[key];
  return { ...env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", APP_URL: `http://127.0.0.1:${port}`,
    SOFIX_BLOCKS_DIR: settings.SOFIX_BLOCKS_DIR ? path.resolve(envDir, settings.SOFIX_BLOCKS_DIR) : path.join(frontend, ".blocks"),
    DATABASE_URL: "", DATABASE_URL_SPARE: "", POSTGRES_URL: "", POSTGRES_MIGRATION_URL: "", SOFIX_PRODUCTION: "", R2_WRITE_ACCESS_KEY_ID: "", R2_WRITE_SECRET_ACCESS_KEY: "" };
}

export async function startLocal({ running, sync, hasBlocks, build, answering, serve, warn }) {
  if (await running()) return "running";
  try { await sync(); } catch { warn("[local] Update unavailable; keeping the saved blocks."); }
  if (!hasBlocks()) throw new Error("No saved blocks. Connect to the internet and configure the R2 read settings before the first start.");
  await build();
  // A build takes minutes; a Sofix that started on the port meanwhile (the dev server) is used, not fought for the port.
  if (await answering()) return "running";
  await serve();
  return "started";
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", windowsHide: true, ...options });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Local command failed (${code}). See output/local.log.`)));
  });
}

function newestSource(dir) {
  return Math.max(0, ...readdirSync(dir, { withFileTypes: true }).filter(entry => !["node_modules", ".next", ".blocks", "output", "test-results", "playwright-report"].includes(entry.name) && !entry.name.startsWith(".next-")).map(entry => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? newestSource(name) : /\.(tsx?|[cm]?js|json|css)$/.test(name) && !["next-env.d.ts", "tsconfig.tsbuildinfo"].includes(entry.name) ? statSync(name).mtimeMs : 0;
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
  const port = Number(option("--port", "3000"));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Use a local port between 1024 and 65535.");
  const frontend = path.join(ROOT, "frontend");
  const mainRoot = spawnSync("git", ["worktree", "list", "--porcelain"], { cwd: ROOT, encoding: "utf8", windowsHide: true }).stdout?.split(/\r?\n/)[0]?.slice(9) || ROOT;
  const envFile = option("--env-file", [path.join(frontend, ".env.local"), path.join(mainRoot, "frontend", ".env.local")].find(existsSync));
  const settings = envFile ? parseEnv(readFileSync(envFile, "utf8")) : {};
  const env = localEnvironment({ inherited: process.env, settings, envDir: envFile ? path.dirname(envFile) : frontend, frontend, port });
  const origin = env.APP_URL;
  const output = path.join(ROOT, "output");
  mkdirSync(output, { recursive: true });

  const answering = async () => { try { return (await fetch(origin, { signal: AbortSignal.timeout(3000) })).ok; } catch { return false; } };
  const open = () => {
    if (args.includes("--no-open")) return;
    if (process.platform === "win32") spawn("explorer.exe", [origin], { windowsHide: true, stdio: "ignore" }).unref();
    else console.log(`[local] Open ${origin}`);
  };

  // The background copy owns the process lock and the log; closing this launcher does not stop the app. The launcher's
  // window waits for it and opens the browser, or shows why it stopped.
  if (args.includes("--background")) {
    if (await answering()) { console.log(`Sofix is already running at ${origin}.`); open(); return; }
    const logFile = path.join(output, "local.log");
    const log = openSync(logFile, "a");
    const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", fileURLToPath(import.meta.url), ...args.filter(arg => arg !== "--background" && arg !== "--no-open"), "--no-open"], { cwd: ROOT, detached: true, windowsHide: true, stdio: ["ignore", log, log] });
    let exited = null;
    child.once("exit", code => { exited = code ?? 1; });
    console.log(`Starting Sofix at ${origin}. After an update the first start rebuilds the app, which takes a few minutes.`);
    for (let waited = 0; waited < 15 * 60; waited += 2) {
      if (await answering()) { child.unref(); console.log("Sofix is ready."); open(); return; }
      if (exited !== null) break;
      if (waited % 30 === 0 && waited) console.log(`  still starting (${waited / 60 | 0} min ${waited % 60} s)...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    const tail = readFileSync(logFile, "utf8").split(/\r?\n/).filter(Boolean).slice(-15).join("\n");
    throw new Error(`Sofix did not start. Last lines of output/local.log:\n${tail}`);
  }

  const lock = path.join(output, `local-${port}.pid`);
  let ownsLock = false;
  let server;
  let timer;
  let stopping = false;
  const stop = () => {
    stopping = true;
    clearTimeout(timer);
    server?.kill();
    if (ownsLock) rmSync(lock, { force: true });
  };
  process.once("exit", stop);
  process.once("SIGINT", () => process.exit());
  process.once("SIGTERM", () => process.exit());
  const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const ready = async () => {
    for (let i = 0; i < 180; i++) {
      if (server && server.exitCode !== null) throw new Error("The local server stopped. See output/local.log.");
      try { if ((await fetch(origin, { signal: AbortSignal.timeout(2000) })).ok) return; } catch { /* still starting */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error("The local server did not become ready. See output/local.log.");
  };
  const result = await startLocal({
    answering,
    running: async () => {
      if (await answering()) return true;
      if (existsSync(lock)) {
        const pid = Number(readFileSync(lock, "utf8"));
        if (pid > 0 && alive(pid)) { await ready(); return true; }
        rmSync(lock, { force: true });
      }
      writeFileSync(lock, String(process.pid), { flag: "wx" });
      ownsLock = true;
      // Refuse an occupied port rather than replace another session's server.
      const { createServer } = await import("node:net");
      await new Promise((resolve, reject) => {
        const probe = createServer();
        probe.once("error", () => reject(new Error(`Port ${port} is already in use. Close that server or use --port.`)));
        probe.listen(port, "127.0.0.1", () => probe.close(resolve));
      });
      return false;
    },
    sync: async () => {
      await run(process.execPath, ["--experimental-strip-types", "--no-warnings", "scripts/blocks.mjs", "--strict"], { cwd: frontend, env });
    },
    hasBlocks: () => {
      try { return ["grid", "sorare", "system"].every(key => JSON.parse(readFileSync(path.join(env.SOFIX_BLOCKS_DIR, "index.json"), "utf8"))[key]); } catch { return false; }
    },
    build: async () => {
      if (!existsSync(path.join(frontend, "node_modules", "next"))) throw new Error("Install frontend dependencies with npm ci before starting Sofix.");
      const id = path.join(frontend, ".next", "BUILD_ID");
      if (!existsSync(id) || newestSource(frontend) > statSync(id).mtimeMs) await run(process.execPath, ["node_modules/next/dist/bin/next", "build"], { cwd: frontend, env });
    },
    serve: async () => {
      // The existing signed-in CLI enables the explicit Refresh button; the token stays in this process's environment.
      if (!env.GITHUB_TOKEN) env.GITHUB_TOKEN = spawnSync("gh", ["auth", "token"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).stdout?.trim() || "";
      if (!env.GITHUB_REPO) env.GITHUB_REPO = repositoryFromRemote(spawnSync("git", ["config", "--get", "remote.origin.url"], { cwd: ROOT, encoding: "utf8", windowsHide: true }).stdout?.trim() || "") || "";
      server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: frontend, env, stdio: "inherit", windowsHide: true });
      server.once("error", () => { console.error("[local] Could not start Next.js."); process.exit(1); });
      server.once("exit", code => { if (!stopping) process.exit(code || 1); });
      await ready();
      const sync = async () => {
        try {
          await run(process.execPath, ["--experimental-strip-types", "--no-warnings", "scripts/blocks.mjs", "--strict"], { cwd: frontend, env });
          const response = await fetch(`${origin}/api/revalidate`, { method: "POST", headers: { authorization: `Bearer ${env.REVALIDATE_SECRET || ""}` }, signal: AbortSignal.timeout(10000) });
          if (!response.ok) console.warn("[local] Blocks updated; page cache invalidation unavailable.");
        } catch { console.warn("[local] Update unavailable; keeping the saved blocks."); }
        if (!stopping) timer = setTimeout(sync, 10 * 60_000);
      };
      timer = setTimeout(sync, 10 * 60_000);
    },
    warn: console.warn,
  });
  console.log(`[local] Sofix ${result}: ${origin}`);
  open();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`[local] ${error.message}`); process.exit(1); });
}
