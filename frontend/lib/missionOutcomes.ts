import type { HistoryCard, HistoryDay } from "./missionLog";

export type OutcomeKind = "miss" | "essence" | "xp" | "clues" | "unknown";
export type MissionOutcome = {
  id: string; day: string; rarity: string; mission: string; target: string; slots: number;
  you: HistoryCard[]; sofix: HistoryCard[]; reconstructed: boolean; corrected: boolean;
  reward: { unit: string; each: number; full: number } | null; category: Exclude<OutcomeKind, "miss">;
};
const TARGETS: Record<string, string> = { decisive: "Decisive actions", goal: "Goals", assist: "Assists", interception: "Interceptions", shot: "Shots on target", tackle: "Tackles", pass: "Passes", miss: "Big chances missed", booked: "Bookings", score: "Score targets" };

/** Same verdicts and selection identities as history; knowing every eligible card is not needed to check a picked card. */
export function missionOutcomes(histories: { rarity: string; days: HistoryDay[] }[]): MissionOutcome[] {
  return histories.flatMap(({ rarity, days }) => days.filter(d => d.loaded || d.yours.length || d.sofix.length).map(d => {
    const text = d.source?.description ?? "";
    const slots = d.source?.picks ?? Math.max(d.yours.length, d.sofix.length, 1);
    const terms = /(?:win|earn)\s+(\d[\d,]*)\s+([\w -]+?)\s+(?:per correct choice|for each player)/i.exec(text);
    const each = terms ? Number(terms[1]!.replaceAll(",", "")) : 0;
    const unit = terms?.[2]?.trim().replace(/\bClue\b/gi, "Clues");
    const escaped = unit?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const full = unit ? new RegExp(`win up to\\s+(\\d[\\d,]*)\\s+${escaped}s?\\s+if all picks are successful`, "i").exec(text) : null;
    const words = unit ?? text;
    return {
      id: `${d.day}:${rarity}:${d.key ?? d.mission}`, day: d.day, rarity, mission: d.mission,
      target: TARGETS[d.source?.rule.kind ?? ""] ?? d.mission.replace(/\s*-\s*All Matches$/i, ""), slots,
      you: d.yours, sofix: d.sofix, reconstructed: Boolean(d.reconstructed), corrected: Boolean(d.corrected),
      reward: unit ? { unit, each, full: full ? Number(full[1]!.replaceAll(",", "")) : each * slots } : null,
      category: /essence/i.test(words) ? "essence" as const : /\bxp\b/i.test(words) ? "xp" as const : /clue/i.test(words) ? "clues" as const : "unknown" as const,
    };
  })).sort((a,b) => b.day.localeCompare(a.day) || a.rarity.localeCompare(b.rarity) || a.mission.localeCompare(b.mission));
}

export function settledMission(picks: HistoryCard[]): boolean {
  const played = picks.filter(p => p.state !== "void");
  return played.length > 0 && played.every(p => p.state !== "waiting");
}

export function missionRace(rows: MissionOutcome[], reward = "all") {
  const paired=rows.filter(r=>!r.reconstructed && settledMission(r.you) && settledMission(r.sofix) && (reward === "all" || r.category === reward || `unit:${r.reward?.unit}` === reward));
  const dates=[...new Set(paired.map(r=>r.day))].sort();
  const points=[{day:dates[0]??"",you:0,sofix:0}];
  for (const day of dates) {
    const same=paired.filter(r=>r.day===day), previous=points.at(-1)!;
    points.push({day,you:previous.you+same.filter(r=>r.you.some(p=>p.state==="did")).length,sofix:previous.sofix+same.filter(r=>r.sofix.some(p=>p.state==="did")).length});
  }
  return {missions:paired.length,dates,points};
}

export function missionOutcomeSummary(rows: MissionOutcome[]) {
  const side = (who: "you" | "sofix") => {
    const checked = rows.filter(r => settledMission(r[who]));
    const picks = rows.flatMap(r => r[who]);
    const segments: Record<OutcomeKind, number> = { miss: 0, essence: 0, xp: 0, clues: 0, unknown: 0 };
    const rewards = new Map<string, { rarity: string; unit: string; amount: number }>();
    for (const row of rows) {
      const hit = row[who].filter(p => p.state === "did").length;
      segments[row.category] += hit;
      segments.miss += row[who].filter(p => p.state === "didnt").length;
      if (row.reward && row[who].length) {
        const key = `${row.rarity}:${row.reward.unit}`;
        const total = rewards.get(key) ?? { rarity: row.rarity, unit: row.reward.unit, amount: 0 };
        total.amount += hit >= row.slots && settledMission(row[who]) ? row.reward.full : hit * row.reward.each;
        rewards.set(key, total);
      }
    }
    return {
      missions: checked.length, hits: checked.filter(r => r[who].some(p => p.state === "did")).length,
      picks: { hit: picks.filter(p => p.state === "did").length, miss: picks.filter(p => p.state === "didnt").length, pending: picks.filter(p => p.state === "waiting").length, void: picks.filter(p => p.state === "void").length },
      segments, rewards: [...rewards.values()], unknown: rows.filter(r => !r[who].length).length,
    };
  };
  const paired = rows.filter(r => !r.reconstructed && settledMission(r.you) && settledMission(r.sofix));
  const you = side("you"), sofix = side("sofix");
  const targets = [...new Set(rows.map(r => r.target))].map(target => {
    const same = rows.filter(r => r.target === target);
    const one = (who: "you" | "sofix") => { const checked = same.filter(r => settledMission(r[who])); return { missions: checked.length, hits: checked.filter(r => r[who].some(p => p.state === "did")).length }; };
    return { target, you: one("you"), sofix: one("sofix") };
  }).sort((a,b) => b.you.missions + b.sofix.missions - a.you.missions - a.sofix.missions);
  return { you, sofix, targets, paired: { missions: paired.length, you: paired.filter(r => r.you.some(p => p.state === "did")).length, sofix: paired.filter(r => r.sofix.some(p => p.state === "did")).length }, reconstructed: rows.filter(r => r.reconstructed).length };
}

export function missionSegment(rows:MissionOutcome[],who:"you"|"sofix",kind:OutcomeKind) {
  const relevant=kind==="miss"?rows:rows.filter(r=>r.category===kind);
  const state=kind==="miss"?"didnt":"did";
  const hit=relevant.filter(r=>r[who].some(p=>p.state===state));
  const summary=missionOutcomeSummary(relevant)[who];
  return {picks:hit.reduce((n,r)=>n+r[who].filter(p=>p.state===state).length,0),missions:hit.length,checked:summary.missions,
    pending:summary.picks.pending,void:summary.picks.void,unselected:summary.unknown,
    rarities:kind==="miss"?[]:[...new Set(hit.map(r=>r.rarity))].map(rarity=>({rarity,hits:hit.filter(r=>r.rarity===rarity).reduce((n,r)=>n+r[who].filter(p=>p.state==="did").length,0),missions:hit.filter(r=>r.rarity===rarity).length})),
    rewards:kind==="miss"?[]:summary.rewards.filter(r=>r.amount>0)};
}
