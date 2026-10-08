import { cache } from "./cache";
import { AUDIT_KEY, readable, type Audit } from "./audit";
import { database, readModel } from "./db";
import { SORARE_TAG } from "./play";
import { loadMissionLog, missionHistory } from "./missionLog";

// Local development and the browser tests have no Neon: they ask the FastAPI stand-in instead.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

/**
 * The Audit page's numbers the job published (`read_models` key `audit`): one read, cached for an hour under the `sorare` tag and
 * refreshed when a run ends (POST /api/revalidate), so each refresh shows up.
 */
const cachedAudit = cache(
  async (): Promise<Audit | null> => {
    if (database()) {
      const row = await readModel(AUDIT_KEY);
      return readable(row?.payload);
    }
    const response = await fetch(`${API_BASE}/api/audit`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { success?: boolean; data?: unknown };
    return body?.success ? readable(body.data) : null;
  },
  ["audit-v1"],
  { tags: [SORARE_TAG, "audit"], revalidate: 3600 },
);

/** Null until the first refresh that writes the page (no key yet). */
export async function loadAudit(): Promise<Audit | null> {
  try {
    // Read again after the cache: Next keeps an entry across deploys, so one written by an older build lacks the fields this build
    // added. The defaults are applied to it here, never only before it is stored.
    const cached = await cachedAudit();
    const data = cached ? readable(structuredClone(cached)) : null;
    if (data && database()) {
      const logs = await loadMissionLog();
      const rarities = [...new Set(logs.flatMap((l) => Object.values(l.days).flatMap((d) => Object.keys(d))))];
      const history = rarities.flatMap((r) => missionHistory(logs, r, new Map(), 10000).map((d) => ({ ...d, rarity: r })));
      for (const row of data.missions.days) {
        const current = history.find((d) => d.day === row.day && d.rarity === row.rarity && d.mission === row.mission);
        if (!current) continue;
        const got = (current.yours.length || current.corrected) && current.yours.every((p) => p.state === "did" || p.state === "didnt") ? current.yours.filter((p) => p.state === "did").length : null;
        // Adjust the published lifetime total only for its visible rows, not a truncated history window.
        data.missions.yours.counted += Number(got !== null) - Number(row.yours != null);
        data.missions.yours.success += Number(got !== null && got >= row.best) - Number(row.yours != null && row.yours >= row.best);
        row.yours = got;
      }
    }
    return data;
  } catch (error) {
    console.error(`[audit] could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}
