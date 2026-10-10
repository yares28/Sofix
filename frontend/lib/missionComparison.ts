import type { HistoryDay } from "./missionLog";

/** The existing best-possible mission rule, on the same fully settled missions for both sides. */
export function missionComparison(days: HistoryDay[]) {
  const result = { counted: 0, yours: { success: 0, hits: 0 }, sofix: { success: 0, hits: 0 }, best: 0 };
  for (const d of days) {
    if (!d.score?.best || d.evidence !== "settled" || !["recorded", "user-empty"].includes(d.yourPicks ?? "") || [...d.yours, ...d.sofix].some((p) => p.state === "waiting" || p.state === "void")) continue;
    const hits = d.yours.filter((p) => p.state === "did").length;
    result.counted++;
    result.yours.hits += hits;
    result.sofix.hits += d.score.got;
    result.best += d.score.best;
    result.yours.success += Number(hits >= d.score.best);
    result.sofix.success += Number(d.score.got >= d.score.best);
  }
  return result;
}
