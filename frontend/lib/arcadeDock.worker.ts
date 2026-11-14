/// <reference lib="webworker" />
import { climbWindows } from "./arcadeClimb";
import { buildDock, type ArcadeDockModel, type DockInput } from "./arcadeDock";
import { bestLineup } from "./arcadePlan";

/**
 * The dock's climb, in the extension's worker (bundled to extension/arcade-worker.js by configure.mjs): the same climb as the Arcade
 * page, turned into the dock's small model here, so megabytes of moves never cross to the page. `rough` is the best lineup for the
 * step on its own over the next three days, for when the full climb runs out of time.
 */
export type DockJob = { kind: "plan" | "rough"; input: DockInput };
export type DockReply = { ok: true; model: ArcadeDockModel } | { ok: false; error: string };

export function work({ kind, input }: DockJob): ArcadeDockModel {
  if (kind === "plan") return buildDock(input, climbWindows(input.outlooks, input.steps, input.start, input.captainBonus, input.now));
  const target = input.steps.find((s) => s.number === input.current)?.target ?? 0;
  const soon = input.outlooks.filter((o) => { const t = Date.parse(o.game.kickoff); return t > input.now && t < input.now + 3 * 86_400_000; });
  return buildDock(input, null, bestLineup(soon, target, input.captainBonus, 600));
}

if (typeof self !== "undefined" && typeof (self as { importScripts?: unknown }).importScripts === "function") {
  self.onmessage = (event: MessageEvent<DockJob>) => {
    let reply: DockReply;
    try { reply = { ok: true, model: work(event.data) }; } catch (error) { reply = { ok: false, error: error instanceof Error ? error.message : "failed" }; }
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply);
  };
}
