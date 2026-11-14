import { z } from "zod";
import { readArcade, readArcadeBench, readArcadeExtras, type ArcadeChances, type ArcadeLaLiga } from "./arcade";
import type { ArcadeDockModel, DockInput } from "./arcadeDock";
import type { DockJob, DockReply } from "./arcadeDock.worker";
import { readArcadeElevens } from "./arcadeElevens";
import { runEngine, type EngineReport } from "./arcadeEngine";

/**
 * The extension's hidden Arcade page (extension/arcade.html, bundled to arcade.js by configure.mjs). The background asks it to run;
 * it reads Sorare through the extension exactly as the Arcade page does (lib/extension.ts messages its own extension here), works the
 * climb out in a worker, and reports each stage back so the dock can show it. One run at a time; a second ask while one runs waits for it.
 */

type Runtime = {
  sendMessage: (message: unknown, reply?: (answer: unknown) => void) => void;
  onMessage: { addListener: (fn: (message: unknown, sender: unknown, reply: (answer: unknown) => void) => boolean | void) => void };
  getURL: (path: string) => string;
  lastError?: unknown;
};
const runtime = (globalThis as unknown as { chrome: { runtime: Runtime } }).chrome.runtime;

const ask = (message: unknown, ms = 30_000) => new Promise<unknown>((resolve) => {
  const timer = setTimeout(() => resolve(null), ms);
  runtime.sendMessage(message, (answer) => { clearTimeout(timer); void runtime.lastError; resolve(answer ?? null); });
});

const App = z.object({ ok: z.literal(true), laliga: z.record(z.string(), z.unknown()), chances: z.record(z.string(), z.record(z.string(), z.tuple([z.number(), z.number()]))) });

/** One job in a fresh worker, ended when it answers or its time is up. */
function inWorker(job: DockJob, ms: number): Promise<ArcadeDockModel> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try { worker = new Worker(runtime.getURL("arcade-worker.js")); } catch { reject(new Error("The calculation engine is missing: run configure")); return; }
    const timer = setTimeout(() => { worker.terminate(); reject(new Error("took too long")); }, ms);
    worker.onmessage = (event: MessageEvent<DockReply>) => {
      clearTimeout(timer);
      worker.terminate();
      if (event.data.ok) resolve(event.data.model); else reject(new Error(event.data.error));
    };
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error("The calculation engine is missing: run configure")); };
    worker.postMessage(job);
  });
}

let running: Promise<unknown> | null = null;

async function run(prev: ArcadeDockModel | null, force: boolean) {
  const report = (r: EngineReport) => runtime.sendMessage({ type: "arcade-state", ...r }, () => void runtime.lastError);
  return runEngine({
    readArcade: () => readArcade(),
    readExtras: (arcade) => readArcadeExtras(arcade),
    appData: async (games, players) => {
      const parsed = App.safeParse(await ask({ type: "arcade-app", games: games.slice(0, 300), players: players.slice(0, 3000) }));
      return parsed.success ? { laliga: parsed.data.laliga as ArcadeLaLiga, chances: parsed.data.chances as ArcadeChances } : null;
    },
    readBench: (stepId, until, again) => readArcadeBench(stepId, until, again),
    readElevens: (arcade, again) => readArcadeElevens(arcade.games ?? [], arcade.cards, again),
    plan: (input: DockInput, ms) => inWorker({ kind: "plan", input }, ms),
    rough: (input: DockInput, ms) => inWorker({ kind: "rough", input }, ms),
    aim: async () => { const a = await ask({ type: "arcade-aim-get" }, 3000); return typeof a === "number" ? a : null; },
    report,
    now: () => Date.now(),
  }, prev, force);
}

runtime.onMessage.addListener((message, _sender, reply) => {
  const m = message as { target?: string; type?: string; prev?: ArcadeDockModel | null; force?: boolean } | null;
  if (m?.target !== "arcade-engine" || m.type !== "run") return;
  if (!running) running = run(m.prev ?? null, m.force === true).finally(() => { running = null; });
  reply({ ok: true });
});
