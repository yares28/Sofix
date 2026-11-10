"use client";

import { useEffect, useState } from "react";
import { climbWindows, type Climb, type Move } from "./arcadeClimb";

export type ClimbArgs = Parameters<typeof climbWindows>;
/** The plan as the page holds it: the other outcome of a move is asked for, and arrives when it is worked out. */
export type ClimbPlan = Omit<Climb, "after"> & { after: (move: Move, cleared: boolean, surest?: boolean) => Promise<Move[]> };
export type ClimbRequest = { id: number; kind: "plan"; args: ClimbArgs } | { id: number; kind: "after"; move: string; cleared: boolean; surest: boolean };
export type ClimbReply = { id: number; kind: "plan"; plan: Omit<Climb, "after"> } | { id: number; kind: "after"; moves: Move[] };

/** Without a worker (tests, an old browser) the climb is worked out here, as before. */
const inline = (args: ClimbArgs): ClimbPlan => {
  const climb = climbWindows(...args);
  return { ...climb, after: async (move, cleared, surest) => climb.after(move, cleared, surest) };
};

/**
 * Reads arrive one after another when the page opens (9 Nov 2026: 14 new inputs in 36 s); the plan starts once they have been quiet
 * this long, not once per read.
 */
const SETTLE_MS = 1_500;

/** What a saved plan holds; a plan saved before a change to it (10 Nov 2026: the Surest chain, then the ladder's week) is worked out again. */
const PLAN_VERSION = 4;

/** Everything a plan is worked out from except the clock, as one short text. */
export function climbSignature([outlooks, steps, start, captainBonus]: ClimbArgs): string {
  const text = JSON.stringify([PLAN_VERSION, outlooks, steps, start, captainBonus]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

/** A saved plan still holds when its inputs are the same and none of their games has kicked off since it was worked out. */
export function reusable(saved: { sig: string; now: number } | null, sig: string, outlooks: ClimbArgs[0], now: number): boolean {
  return !!saved && saved.sig === sig && !outlooks.some((o) => { const t = Date.parse(o.game.kickoff); return t > saved.now && t <= now; });
}

/**
 * One saved plan, the last one worked out: a refresh with nothing new shows it at once (9 Nov 2026: every refresh planned again). It
 * lives in IndexedDB: a plan is megabytes, more than localStorage had left on his browser.
 */
type Saved = { sig: string; now: number; plan: Omit<Climb, "after"> };
const db = () => new Promise<IDBDatabase>((resolve, reject) => {
  const open = indexedDB.open("sofix-arcade", 1);
  open.onupgradeneeded = () => open.result.createObjectStore("climb");
  open.onsuccess = () => resolve(open.result);
  open.onerror = () => reject(open.error);
});
const load = async (): Promise<Saved | null> => {
  try {
    const d = await db();
    return await new Promise<Saved | null>((resolve) => {
      const get = d.transaction("climb").objectStore("climb").get("last");
      get.onsuccess = () => resolve((get.result as Saved | undefined) ?? null);
      get.onerror = () => resolve(null);
    });
  } catch { return null; }
};
const save = (saved: Saved) => { void db().then((d) => d.transaction("climb", "readwrite").objectStore("climb").put(saved, "last")).catch(() => { /* Storage blocked or full: plan again next visit. */ }); };

/** A worker that works the plan out, and each move's other outcome once asked. */
function startWorker(request: ClimbArgs) {
  const w = new Worker(new URL("./climb.worker.ts", import.meta.url));
  const waiting = new Map<number, (reply: ClimbReply) => void>();
  let next = 0;
  w.onmessage = (event: MessageEvent<ClimbReply>) => { const done = waiting.get(event.data.id); waiting.delete(event.data.id); done?.(event.data); };
  const ask = (message: ClimbRequest) => new Promise<ClimbReply>((resolve) => { waiting.set(message.id, resolve); w.postMessage(message); });
  const plan = ask({ id: next++, kind: "plan", args: request });
  const cache = new Map<string, Promise<Move[]>>();
  const after = (move: Move, cleared: boolean, surest = false) => {
    const id = (move as Move & { id?: string }).id ?? "";
    const key = `${id}:${cleared}:${surest}`;
    // The plan is worked out first: the worker names its moves in order, the same names the page holds (the climb is seeded).
    if (!cache.has(key)) cache.set(key, plan.then(() => ask({ id: next++, kind: "after", move: id, cleared, surest })).then((r) => (r.kind === "after" ? r.moves : [])));
    return cache.get(key)!;
  };
  return { w, plan, after };
}

/**
 * Arcade's climb, worked out in a worker so a tap never waits on it (2 Nov 2026: a tap on a move of the chain froze the page for 14 s
 * while both of its outcomes were planned). A plan takes tens of seconds on a full board, so a newer request ends the worker running an
 * older one and starts a fresh one (9 Nov: 19 queued plans held the page's plan back for minutes). The last plan stays shown, marked
 * `updating`, while the next is worked out; null until the first arrives. A refresh with the same inputs shows the saved plan at once.
 */
export function useClimb(...args: ClimbArgs): { plan: ClimbPlan | null; updating: boolean } {
  const [plan, setPlan] = useState<ClimbPlan | null>(null);
  const [updating, setUpdating] = useState(true);
  const [outlooks, steps, start, captainBonus, now] = args;

  useEffect(() => {
    const request = [outlooks, steps, start, captainBonus, now] as ClimbArgs;
    const sig = climbSignature(request);
    let worker: Worker | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let gone = false;
    setUpdating(true);
    void load().then((saved) => {
      if (gone) return;
      if (saved && reusable(saved, sig, outlooks, now) && typeof Worker !== "undefined") {
        // Its other outcomes come from a worker started only when one is asked for, on the clock the plan was worked out at.
        let lazy: ReturnType<typeof startWorker> | null = null;
        setPlan({ ...saved.plan, after: (move, cleared, surest) => {
          try { lazy ??= startWorker([outlooks, steps, start, captainBonus, saved.now]); } catch { return Promise.resolve([]); }
          worker = lazy.w;
          return lazy.after(move, cleared, surest);
        } });
        setUpdating(false);
        return;
      }
      timer = setTimeout(plan, SETTLE_MS);
    });
    const plan = () => {
      if (typeof Worker === "undefined") { setPlan(inline(request)); setUpdating(false); return; }
      let started: ReturnType<typeof startWorker>;
      try { started = startWorker(request); } catch { setPlan(inline(request)); setUpdating(false); return; }
      worker = started.w;
      started.w.onerror = () => setUpdating(false);
      void started.plan.then((reply) => {
        if (reply.kind !== "plan") return;
        save({ sig, now, plan: reply.plan });
        setUpdating(false);
        setPlan({ ...reply.plan, after: started.after });
      });
    };
    // A newer request (or leaving the page) ends this one, and its worker with it.
    return () => { gone = true; clearTimeout(timer); worker?.terminate(); };
  }, [outlooks, steps, start, captainBonus, now]);

  return { plan, updating };
}
