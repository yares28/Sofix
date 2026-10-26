// Reads the `stat_charts` read model: from R2 in production, from the local API otherwise (e2e mock, FastAPI).
import { published, readModel } from "./db";
import type { ChartModel } from "./statCharts";

const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
const EMPTY: ChartModel = { asOf: "", keys: [], onSheet: {}, players: [] };

export async function loadStatCharts(): Promise<ChartModel> {
  try {
    if (published()) return (await readModel<ChartModel>("stat_charts"))?.payload ?? EMPTY;
    const res = await fetch(`${API_BASE}/api/stat-charts`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const body = res.ok ? ((await res.json()) as { success?: boolean; data?: ChartModel }) : null;
    return body?.success && body.data ? body.data : EMPTY;
  } catch {
    return EMPTY;
  }
}
