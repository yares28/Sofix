import { z } from "zod";

/** The Sofix extension's fixed ID (from the `key` in extension/manifest.template.json). */
export const EXTENSION_ID = "lfgchmhjigjodjfchagphfpkcicochlk";

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
