/**
 * Who reads how much from Neon, on the web side (plans/neon-write-mostly.md, step 1): each server adds up its reads by
 * table (a page block by its kind) and writes one `read_models` row, `neon_ledger:<day>:v-<server>-<n>`, every ten minutes
 * or every 1 MB read. The jobs write the same rows (backend/app/services/neon_ledger.py). The row's write time is 1970, so it
 * never decides which project is live.
 */
export const LEDGER_EVERY_MS = 600_000;
export const LEDGER_EVERY_BYTES = 1_000_000;

export function ledgerLabel(query: string, first: unknown): string {
  const text = query.replace(/\s+/g, " ").trim().toLowerCase();
  if (!text.startsWith("select") && !text.startsWith("with")) return "write";
  const table = /\bfrom\s+"?([a-z_]+)/.exec(text)?.[1] ?? text.slice(0, 24);
  if (table === "read_models" && typeof first === "string" && first) return `read_models:${first.split(":")[0]}`;
  return table;
}

export function ledgerRow(
  readers: Map<string, number>,
  server: string,
  where: string,
  seq: number,
  now: Date,
): { key: string; payload: { at: string; workflow: string; job: string; bytes: number; top: Record<string, number> } } {
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  const top = Object.fromEntries([...readers].sort((a, b) => b[1] - a[1]).slice(0, 12));
  const bytes = [...readers.values()].reduce((sum, n) => sum + n, 0);
  return {
    key: `neon_ledger:${day}:v-${server}-${seq}`.slice(0, 64),
    payload: { at: now.toISOString(), workflow: "web", job: where, bytes, top },
  };
}
