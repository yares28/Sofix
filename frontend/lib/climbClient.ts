"use client";

import { useEffect, useRef, useState } from "react";
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
 * Arcade's climb, worked out in a worker so a tap never waits on it (2 Nov 2026: a tap on a move of the chain froze the page for 14 s
 * while both of its outcomes were planned). Null until the first plan arrives; a newer request makes an older answer void.
 */
export function useClimb(...args: ClimbArgs): ClimbPlan | null {
  const [plan, setPlan] = useState<ClimbPlan | null>(null);
  const worker = useRef<Worker | null>(null);
  const waiting = useRef(new Map<number, (reply: ClimbReply) => void>());
  const next = useRef(0);
  const [outlooks, steps, start, captainBonus, now] = args;

  useEffect(() => {
    if (typeof Worker === "undefined") return;
    try {
      const w = new Worker(new URL("./climb.worker.ts", import.meta.url));
      const pending = waiting.current;
      w.onmessage = (event: MessageEvent<ClimbReply>) => { const done = pending.get(event.data.id); pending.delete(event.data.id); done?.(event.data); };
      worker.current = w;
      return () => { w.terminate(); worker.current = null; pending.clear(); };
    } catch { worker.current = null; }
  }, []);

  useEffect(() => {
    const w = worker.current;
    const request = [outlooks, steps, start, captainBonus, now] as ClimbArgs;
    if (!w) { setPlan(inline(request)); return; }
    const id = next.current++;
    const cache = new Map<string, Promise<Move[]>>();
    const ask = (message: ClimbRequest) => new Promise<ClimbReply>((resolve) => { waiting.current.set(message.id, resolve); w.postMessage(message); });
    let live = true;
    void ask({ id, kind: "plan", args: request }).then((reply) => {
      if (!live || reply.kind !== "plan") return;
      setPlan({ ...reply.plan, after: (move, cleared) => {
        const key = `${(move as Move & { id?: string }).id}:${cleared}`;
        if (!cache.has(key)) cache.set(key, ask({ id: next.current++, kind: "after", move: (move as Move & { id?: string }).id ?? "", cleared }).then((r) => (r.kind === "after" ? r.moves : [])));
        return cache.get(key)!;
      } });
    });
    return () => { live = false; };
  }, [outlooks, steps, start, captainBonus, now]);

  return plan;
}
