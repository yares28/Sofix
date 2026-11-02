import { z } from "zod";
import type { TierOdds } from "./arcadePacks";

const probability = z.number().min(0).max(1);
const Snapshot = z.object({
  scope: z.string(), at: z.number().positive(),
  odds: z.record(z.string(), z.array(z.object({
    tiers: z.record(z.string(), probability),
    players: z.record(z.string(), z.object({ p: probability, tier: z.string(), team: z.string().nullable() })),
  })).max(10)),
});
export type PackSnapshot = { scope: string; at: number; odds: TierOdds };

/** One complete reading, bounded to the latest board. IndexedDB avoids the small shared localStorage quota. */
function store<T>(write: PackSnapshot | null, read: (value: unknown) => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("sofix-pack-odds", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("reading"); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Browser storage is busy"));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      const tx = db.transaction("reading", write ? "readwrite" : "readonly");
      const action = write ? tx.objectStore("reading").put(write, "current") : tx.objectStore("reading").get("current");
      tx.oncomplete = () => { db.close(); resolve(read(action.result)); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

export function loadPackSnapshot(scope: string): Promise<PackSnapshot | null> {
  return store(null, value => {
    const parsed = Snapshot.safeParse(value);
    return parsed.success && parsed.data.scope === scope ? parsed.data : null;
  });
}

export function savePackSnapshot(snapshot: PackSnapshot): Promise<void> {
  return store(snapshot, () => undefined);
}
