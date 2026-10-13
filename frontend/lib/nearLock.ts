/** Same rule as .github/scripts/near_lock.py: refresh in the last three hours before a lock, if none started in the last 25 minutes. */
export const NEAR_WINDOW_MS = 3 * 3_600_000;
export const NEAR_GAP_MS = 25 * 60_000;

const SORARE = "https://api.sorare.com/federation/graphql";
const QUERY = "query { so5 { so5Fixtures(first: 10, eventType: CLASSIC, sport: FOOTBALL) { nodes { cutOffDate } } } }";

/** The nearest cut-off still ahead, or null. */
export function nextLock(cutOffs: unknown[], now: number): number | null {
  const ahead = cutOffs.map((value) => Date.parse(String(value))).filter((at) => Number.isFinite(at) && at > now);
  return ahead.length ? Math.min(...ahead) : null;
}

export function shouldRefreshNearLock(lock: number | null, now: number, lastStart: number | null): boolean {
  if (lock === null || lock - now > NEAR_WINDOW_MS) return false;
  return lastStart === null || now - lastStart >= NEAR_GAP_MS;
}

export async function fetchNextLock(now: number): Promise<number | null> {
  const response = await fetch(SORARE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY }),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Sorare answered ${response.status}`);
  const body = (await response.json()) as { data?: { so5?: { so5Fixtures?: { nodes?: { cutOffDate?: string }[] } } } };
  return nextLock((body.data?.so5?.so5Fixtures?.nodes ?? []).map((node) => node.cutOffDate), now);
}
