import { cache } from "./cache";
import { database } from "./db";
import type { GameweekPlan } from "./play";
import type { ActualScores } from "./lineupScores";

/** One cached, read-only batch for the selected GW. A missing game never becomes a DNP. */
export async function loadPlanActuals(week: GameweekPlan): Promise<ActualScores> {
  try { return await readPlanActuals(week); } catch { return {}; }
}

async function readPlanActuals(week: GameweekPlan): Promise<ActualScores> {
  const players = week.playing.players;
  const ids = [...new Set(players.flatMap(p => p.games.flatMap(g => g.id ? [g.id] : [])))];
  if (!ids.length || !database()) return {};
  const read = cache(async () => {
    const sql = database();
    if (!sql) return {};
    const rows = await sql`SELECT player, game_id, score, played, status FROM player_games WHERE game_id = ANY(${ids}) AND status IN ('FINAL', 'DID_NOT_PLAY')` as {
      player: string; game_id: string; score: number | null; played: boolean | null; status: string;
    }[];
    const actuals = new Map<string, { score: number; played: boolean; complete: boolean }>();
    for (const p of players) {
      if (!p.player || !p.games.length || p.games.some(g => !g.id)) continue;
      const games = p.games.map(g => rows.find(r => r.player === p.player && r.game_id === g.id));
      const valid = games.filter(g => g && g.played !== null && !(g.status === "DID_NOT_PLAY" && g.played) && (!g.played || g.score !== null));
      const played = valid.filter(g => g?.played && g.score !== null);
      const complete = valid.length === games.length;
      if (played.length) actuals.set(p.player, { score: Math.max(...played.map(g => g!.score!)), played: true, complete });
      else if (complete) actuals.set(p.player, { score: 0, played: false, complete: true });
    }
    const result: ActualScores = {};
    for (const c of week.plans.flatMap(p => p.lineups.flatMap(l => [...l.starters, ...l.subs]))) {
      const actual = c.player ? actuals.get(c.player) : null;
      if (actual) result[c.slug] = actual;
    }
    return result;
  }, ["plan-actuals-v1", week.gameweek.slug], { tags: ["sorare"], revalidate: 3600 });
  return read();
}
