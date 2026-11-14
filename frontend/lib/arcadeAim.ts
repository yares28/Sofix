"use client";

import { useCallback, useSyncExternalStore } from "react";
import { askExtension } from "./extension";

/**
 * The step Pick teams and Batch both aim at, one value per set and board (9 Nov 2026: two pickers kept two values). Saved in this
 * browser; kept for the visit when storage is blocked.
 */
const CHANGED = "sofix-arcade-aim";
const memory = new Map<string, number>();

const subscribe = (notify: () => void) => {
  window.addEventListener(CHANGED, notify);
  window.addEventListener("storage", notify);
  return () => { window.removeEventListener(CHANGED, notify); window.removeEventListener("storage", notify); };
};

export const aimKey = (set: string, board: string) => `sofix-arcade-aim:${set}:${board}`;

export function readAim(key: string): number | null {
  try {
    const n = Number(localStorage.getItem(key));
    if (Number.isInteger(n) && n > 0) return n;
  } catch { /* Storage blocked: the visit's value below. */ }
  return memory.get(key) ?? null;
}

export function useArcadeAim(key: string): [number | null, (step: number) => void] {
  const aim = useSyncExternalStore(subscribe, () => readAim(key), () => null);
  const setAim = useCallback((step: number) => {
    memory.set(key, step);
    try { localStorage.setItem(key, String(step)); } catch { /* Storage blocked: kept for this visit. */ }
    window.dispatchEvent(new Event(CHANGED));
    void askExtension({ type: "arcade-aim", step }, 1000); // the dock on sorare.com aims its "best to clear" list at the same step
  }, [key]);
  return [aim, setAim];
}
