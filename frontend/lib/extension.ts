import { z } from "zod";

/** The Sofix extension's fixed ID (from the `key` in extension/manifest.template.json). */
export const EXTENSION_ID = "lfgchmhjigjodjfchagphfpkcicochlk";
/** First extension build that can read every lineup in a selected Sorare gameweek. */
export const REQUIRED_EXTENSION_VERSION = "0.1.1";

/**
 * The newest build. Older ones from REQUIRED_EXTENSION_VERSION up still work, but lack what came later: 0.3.0 reads Futbol
 * Fantasy live and needs one more permission, which only a rebuilt manifest.json carries; 0.3.1 says "×2" on the tile of a
 * player with two games in the gameweek and lists both in his panel; 0.3.2 reads Futbol Fantasy live for real (0.3.0 and 0.3.1 looked for
 * a lowercase attribute the site writes with capitals, so they found no player) and shows the gameweek the page names in its Sofix tab; 0.3.3 draws the picture of his game in the panel (where his score lands, with and without a
 * decisive action, and what moves it in points) and a larger score; 0.3.4 reads the daily missions from Sorare's Missions page (read only) for the app's Missions page; 0.3.5 says the plan's most likely result in its Sofix tab instead of an average of rewards (a reward is all or nothing).
 */
export const LATEST_EXTENSION_VERSION = "0.3.5";

/** Chrome manifest versions are numeric dot-separated values; compare them without relying on string ordering. */
export function extensionAtLeast(version: string, minimum = REQUIRED_EXTENSION_VERSION): boolean {
  const read = (value: string) => (/^\d+\.\d+\.\d+$/.test(value) ? value.split(".").map(Number) : null);
  const actual = read(version);
  const wanted = read(minimum);
  if (!actual || !wanted) return false;
  for (let i = 0; i < Math.max(actual.length, wanted.length); i += 1) {
    const difference = (actual[i] ?? 0) - (wanted[i] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

export const extensionIsLatest = (version: string): boolean => extensionAtLeast(version, LATEST_EXTENSION_VERSION);

/** What the extension answers when the app pings it (extension/background.js). */
export type ExtensionPing = { version: string; sorareUser: string | null; appReachable: boolean | null };

const PingSchema = z.object({
  ok: z.literal(true),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  sorareUser: z.string().min(1).max(40).nullable(),
  appReachable: z.boolean().nullable().optional(),
});

export function parsePing(response: unknown): ExtensionPing | null {
  const parsed = PingSchema.safeParse(response);
  if (!parsed.success) return null;
  const { version, sorareUser, appReachable } = parsed.data;
  return { version, sorareUser, appReachable: appReachable ?? null };
}

type ChromeRuntime = {
  sendMessage?: (id: string, message: unknown, reply: (response: unknown) => void) => void;
  lastError?: unknown;
};

/**
 * Asks the extension, if this Chrome has it, whether it is there and which Sorare account it has seen. Chrome
 * only exposes `chrome.runtime.sendMessage` to pages an extension lists in `externally_connectable`, so any other
 * browser (a phone, Safari) simply gets null. Costs nothing on the server.
 */
export function pingExtension(timeoutMs = 1500): Promise<ExtensionPing | null> {
  const runtime = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
  const send = runtime?.sendMessage;
  if (!runtime || !send) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      send.call(runtime, EXTENSION_ID, { type: "ping" }, (response) => {
        clearTimeout(timer);
        void runtime.lastError; // reading it keeps Chrome from logging "Unchecked runtime.lastError" when it isn't installed
        resolve(parsePing(response));
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}
