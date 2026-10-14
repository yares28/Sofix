import type { HistoryDay } from "./missionLog";

/**
 * Hits per mission, each side on its own (owner, 15 Oct 2026: "5/10", one mission of one day each): a mission counts for a side once all its picks
 * there are settled, and is a hit when one of them did it. A side with no pick in a mission, or only void games, leaves it out for that side alone.
 */
export function missionHits(days: HistoryDay[]) {
  const side = (picks: (d: HistoryDay) => HistoryDay["yours"]) => {
    const out = { hits: 0, missions: 0 };
    for (const d of days) {
      const settled = picks(d).filter((p) => p.state !== "void");
      if (!settled.length || settled.some((p) => p.state === "waiting")) continue;
      out.missions++;
      out.hits += Number(settled.some((p) => p.state === "did"));
    }
    return out;
  };
  return { yours: side((d) => d.yours), sofix: side((d) => d.sofix) };
}
export type MissionHits = ReturnType<typeof missionHits>;

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
