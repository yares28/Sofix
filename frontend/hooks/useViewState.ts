"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_PINS, VIEW_PATH, parsePins, serializeViewState, type ViewState } from "../lib/grid";

const PINS_KEY = "sofix:pins";
const OLD_PINS_KEY = "fixturediff:pins"; // before the Sofix rename; read once so saved pins survive

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
      const saved = parsePins(window.localStorage.getItem(PINS_KEY) ?? window.localStorage.getItem(OLD_PINS_KEY), knownCodes);
      if (saved.length) setState((current) => ({ ...current, pins: saved }));
    } catch {
      // storage unavailable (private mode): pins just don't persist
    }
  }, [pinsInUrl, knownCodes]);

  // The header's week picker navigates, and the server comes back with the gameweek that week holds: the board
  // follows it. Everything else in the state is the board's own and survives the week change.
  const served = useRef(initial.gw);
  useEffect(() => {
    if (initial.gw === served.current) return;
    served.current = initial.gw;
    setState((current) => ({ ...current, gw: initial.gw }));
  }, [initial.gw]);

  // Keep the URL shareable and the pins remembered, without a navigation or a server round trip. A tab switch
  // rewrites the path too (/fixtures, /difficulty, /table), so the tab stays instant and a reload lands on it.
  const firstSync = useRef(true);
  useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false;
      return;
    }
    // The board writes its own view into the address, and must not throw away what it does not own: the
    // app-wide week (`?w=`) is set by the picker in the top bar and belongs to every page.
    const week = new URLSearchParams(window.location.search).get("w");
    const own = serializeViewState(state);
    const query = week ? `w=${encodeURIComponent(week)}${own ? `&${own}` : ""}` : own;
    const path = VIEW_PATH[state.view];
    // null, not window.history.state: Next.js skips syncing its router for calls that carry its own state, and the
    // top bar's links (usePathname) must follow the tab.
    window.history.replaceState(null, "", query ? `${path}?${query}` : path);
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
