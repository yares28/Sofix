import { createHash } from "node:crypto";

/** Match PostgreSQL's first md5 byte, so every identity belongs to exactly one bounded piece. */
export const scoreRecordBucket = (slug: string) => createHash("md5").update(slug).digest().readUInt8(0) % 4;

export function scoreRecordPart(record: unknown, part: number): unknown {
  if (!record || typeof record !== "object") return null;
  const { players, ...head } = record as { players?: Record<string, unknown> };
  if (part === -1) return head;
  if (!players) return null;
  return Object.fromEntries(Object.entries(players).filter(([slug]) => scoreRecordBucket(slug) === part));
}
