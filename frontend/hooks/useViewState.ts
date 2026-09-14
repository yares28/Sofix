"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_PINS, parsePins, serializeViewState, type ViewState } from "../lib/grid";

const PINS_KEY = "fixturediff:pins";

/**
 * Board settings that belong in a shareable link (view, lens, horizon, window, pins, played).
 * The server renders the link's state; pins fall back to this browser's saved ones when the link has none.
 */
export function useViewState(initial: ViewState, pinsInUrl: boolean, knownCodes: ReadonlySet<string>) {
  const [state, setState] = useState<ViewState>(initial);

  // Read after hydration: the server can't see localStorage, and rendering it earlier would mismatch.
  useEffect(() => {
    if (pinsInUrl) return;
    try {
      const saved = parsePins(window.localStorage.getItem(PINS_KEY), knownCodes);
      if (saved.length) setState((current) => ({ ...current, pins: saved }));
    } catch {
      // storage unavailable (private mode): pins just don't persist
    }
  }, [pinsInUrl, knownCodes]);

  // Keep the URL shareable and the pins remembered, without a navigation or a server round trip.
  const firstSync = useRef(true);
  useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false;
      return;
    }
    const query = serializeViewState(state);
    window.history.replaceState(window.history.state, "", query ? `?${query}` : window.location.pathname);
    try {
      window.localStorage.setItem(PINS_KEY, state.pins.join(","));
    } catch {
      // ignore
    }
  }, [state]);

  const patch = useCallback((next: Partial<ViewState>) => setState((current) => ({ ...current, ...next })), []);
  const togglePin = useCallback(
    (code: string) =>
      setState((current) => ({
        ...current,
        pins: current.pins.includes(code)
          ? current.pins.filter((pin) => pin !== code)
          : [...current.pins, code].slice(-MAX_PINS),
      })),
    [],
  );
  return { state, setState, patch, togglePin };
}
