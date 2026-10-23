import type { GameweekPlan, MarketPlayer, Sorare } from "./play";
import { marketForWeek, type ScoreRecord } from "./playerForecasts";

export type ForeignLeague = "PL" | "BL1" | "FL1" | "CL" | "EL";
export type ForeignBlock = { competition: ForeignLeague; weekId: string; week: string; generatedAt: string; complete: boolean; modelVersion: string | null; market: MarketPlayer[] };
export type ForeignIdentity = { slug: string; name: string; club: string | null; pic: string; league: ForeignLeague; pos?: MarketPlayer["pos"] | null };
export type ForeignDirectory = { players: ForeignIdentity[] };
export const playerBucket = (slug: string) => [...slug].reduce((sum, c) => sum + c.charCodeAt(0), 0).toString(16).slice(-1);

/** Current identity survives expiry; a forecast belongs only to the GW that captured it. */
export function foreignMarket(block: ForeignBlock | null, data: Sorare, id: string, plan: GameweekPlan | null, record: ScoreRecord | null, now = Date.now()): MarketPlayer[] {
  if (!block) return [];
  const selected = data.timeline.find(w => w.id === id);
  const age = now - Date.parse(block.generatedAt);
  const fresh = Number.isFinite(age) && age >= -300_000 && age <= 86400_000;
  const locked = selected && Date.parse(selected.lock) <= now;
  const livePlanAge = now - Date.parse(data.generatedAt);
  const planFresh = Number.isFinite(livePlanAge) && livePlanAge >= -300_000 && livePlanAge <= 86400_000;
  const shownPlan = fresh || locked || planFresh ? plan : null;
  return marketForWeek(block.market.filter(p => ["GK", "DEF", "MID", "FWD", "UNK"].includes(p.pos)), fresh ? block.weekId : "", selected ?? { id, slug: "" }, shownPlan, fresh || locked ? record : null);
}
