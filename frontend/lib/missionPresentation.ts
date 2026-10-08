import { missionDay } from "./missions";

/** Same fallback boundary as the ledger; do not imply Sorare verified the end time. */
export function missionWindow(now: Date) {
  const day = missionDay(now);
  const start = new Date(`${day}T08:00:00Z`);
  return { day, start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
}

export function sampleLabel(n: number, requested: number): string {
  return !n ? "No scored starts" : n < requested ? `Only ${n} scored start${n === 1 ? "" : "s"} available` : `Last ${n} scored starts`;
}

export function cardCopyLabel(card?: string): string {
  const copy = card && /-(\d{4})-(?:limited|rare|super_rare|super-rare|unique)-(\d+)$/.exec(card);
  return copy ? `${copy[1]} · Copy #${copy[2]}` : card ? `Card ${card.split("-").slice(-2).join("-")}` : "Card copy not recorded";
}

/** Resolve a pasted Sorare link locally. Never fetch arbitrary URLs or claim historical ownership. */
export function manualMissionPick(raw: string, rarity: string): { player: string; card?: string; game: null } | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || !["sorare.com", "www.sorare.com"].includes(url.hostname) || url.username || url.password) return null;
    const path = /^\/(?:football\/)?(cards|players)\/([a-z0-9_-]+)\/?$/.exec(url.pathname);
    if (!path || path[2]!.length > 120) return null;
    if (path[1] === "players") return { player: path[2]!, game: null };
    const card = path[2]!;
    const copy = /^(.+)-(\d{4})-(limited|rare|super_rare|super-rare|unique)-(\d+)$/.exec(card);
    if (!copy || copy[3]!.replace("super-rare", "super_rare") !== rarity) return null;
    return { player: copy[1]!, card, game: null };
  } catch { return null; }
}
