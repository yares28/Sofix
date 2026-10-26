import { cache } from "./cache";
import { readModelAt } from "./db";
import { blockVersion } from "./r2";
import { SORARE_TAG } from "./play";

/** Reassemble after the cached reads: a complete record can exceed Next's per-entry limit. */
export async function loadScoreRecord<T>(slug: string): Promise<T | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) return null;
  const key = `score_record:${slug}`;
  const written = cache(async () => blockVersion(key), ["score-record-version-v1", slug], { tags: [SORARE_TAG], revalidate: 3600 });
  const at = await written();
  if (!at) return null;
  const [head, ...players] = await Promise.all([-1, 0, 1, 2, 3].map(part => readModelAt(key, at, part)));
  if (!head || players.some(part => part === null || part === undefined)) return null;
  return { ...head as object, players: Object.assign({}, ...players) } as T;
}
