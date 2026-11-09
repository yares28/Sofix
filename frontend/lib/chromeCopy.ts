import { REFRESH_HEADER } from "./refresh";

/**
 * Arcade's reads, shared between browsers on the local dev server only (owner, 9 Nov 2026: see Arcade on localhost in the
 * integrated browser, which has no extension). The Chrome that has the extension saves each read it makes; a browser without it
 * shows the last one saved, with its time. Never on the live site: the route answers 404 outside `npm run dev`.
 */
const on = () => process.env.NODE_ENV === "development" && typeof location !== "undefined" && ["localhost", "127.0.0.1"].includes(location.hostname);
const url = (name: string) => `/api/dev/chrome-copy?name=${encodeURIComponent(name)}`;

/** Save a read made in this browser (the one with the extension) for the others. */
export function shareCopy(name: string, value: unknown): void {
  if (!on()) return;
  void fetch(url(name), { method: "PUT", headers: { "content-type": "application/json", [REFRESH_HEADER]: "1" }, body: JSON.stringify(value) }).catch(() => undefined);
}

/** The last read the Chrome with the extension saved, and when; null when there is none or this is not the dev server. */
export async function readCopy<T>(name: string): Promise<{ at: number; value: T } | null> {
  if (!on()) return null;
  try {
    const response = await fetch(url(name), { cache: "no-store" });
    return response.ok ? ((await response.json()) as { at: number; value: T }) : null;
  } catch {
    return null;
  }
}
