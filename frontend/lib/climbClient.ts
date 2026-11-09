"use client";

import { useEffect, useState } from "react";
import { climbWindows, type Climb, type Move } from "./arcadeClimb";

export type ClimbArgs = Parameters<typeof climbWindows>;
/** The plan as the page holds it: the other outcome of a move is asked for, and arrives when it is worked out. */
export type ClimbPlan = Omit<Climb, "after"> & { after: (move: Move, cleared: boolean) => Promise<Move[]> };
export type ClimbRequest = { id: number; kind: "plan"; args: ClimbArgs } | { id: number; kind: "after"; move: string; cleared: boolean };
export type ClimbReply = { id: number; kind: "plan"; plan: Omit<Climb, "after"> } | { id: number; kind: "after"; moves: Move[] };

/** Without a worker (tests, an old browser) the climb is worked out here, as before. */
const inline = (args: ClimbArgs): ClimbPlan => {
  const climb = climbWindows(...args);
  return { ...climb, after: async (move, cleared) => climb.after(move, cleared) };
};

/**
 * Reads arrive one after another when the page opens (9 Nov 2026: 14 new inputs in 36 s); the plan starts once they have been quiet
 * this long, not once per read.
 */
const SETTLE_MS = 1_500;

/**
 * Arcade's climb, worked out in a worker so a tap never waits on it (2 Nov 2026: a tap on a move of the chain froze the page for 14 s
 * while both of its outcomes were planned). A plan takes tens of seconds on a full board, so a newer request ends the worker running an
 * older one and starts a fresh one (9 Nov: 19 queued plans held the page's plan back for minutes). The last plan stays shown, marked
 * `updating`, while the next is worked out; null until the first arrives.
 */
export function useClimb(...args: ClimbArgs): { plan: ClimbPlan | null; updating: boolean } {
  const [plan, setPlan] = useState<ClimbPlan | null>(null);
  const [updating, setUpdating] = useState(true);
  const [outlooks, steps, start, captainBonus, now] = args;

  useEffect(() => {
    const request = [outlooks, steps, start, captainBonus, now] as ClimbArgs;
    setUpdating(true);
    let worker: Worker | null = null;
    const timer = setTimeout(() => {
      if (typeof Worker === "undefined") { setPlan(inline(request)); setUpdating(false); return; }
      try { worker = new Worker(new URL("./climb.worker.ts", import.meta.url)); } catch { setPlan(inline(request)); setUpdating(false); return; }
      const w = worker;
      const waiting = new Map<number, (reply: ClimbReply) => void>();
      let next = 0;
      w.onmessage = (event: MessageEvent<ClimbReply>) => { const done = waiting.get(event.data.id); waiting.delete(event.data.id); done?.(event.data); };
      w.onerror = () => setUpdating(false);
      const ask = (message: ClimbRequest) => new Promise<ClimbReply>((resolve) => { waiting.set(message.id, resolve); w.postMessage(message); });
      const cache = new Map<string, Promise<Move[]>>();
      void ask({ id: next++, kind: "plan", args: request }).then((reply) => {
        if (reply.kind !== "plan") return;
        setUpdating(false);
        setPlan({ ...reply.plan, after: (move, cleared) => {
          const key = `${(move as Move & { id?: string }).id}:${cleared}`;
          if (!cache.has(key)) cache.set(key, ask({ id: next++, kind: "after", move: (move as Move & { id?: string }).id ?? "", cleared }).then((r) => (r.kind === "after" ? r.moves : [])));
          return cache.get(key)!;
        } });
      });
    }, SETTLE_MS);
    // A newer request (or leaving the page) ends this one, and its worker with it.
    return () => { clearTimeout(timer); worker?.terminate(); };
  }, [outlooks, steps, start, captainBonus, now]);

  return { plan, updating };
}
