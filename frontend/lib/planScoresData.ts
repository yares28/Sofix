import { cache } from "./cache";
import { published } from "./db";
import { loadPlayerHistories } from "./playerGames";
import type { GameweekPlan } from "./play";
import { playerKey, type ActualScores } from "./lineupScores";

/** One cached batch for the selected GW, from the players' published histories. A missing game never becomes a DNP. */
export async function loadPlanActuals(week: GameweekPlan): Promise<ActualScores> {
  try { return await readPlanActuals(week); } catch { return {}; }
}

async function readPlanActuals(week: GameweekPlan): Promise<ActualScores> {
  const players = week.playing.players;
  const ids = [...new Set(players.flatMap(p => p.games.flatMap(g => g.id ? [g.id] : [])))];
  if (!ids.length || !published()) return {};
  const read = cache(async () => {
    const wanted = new Set(ids);
    const histories = await loadPlayerHistories(players.flatMap((p) => p.player ? [p.player] : []));
    const rows = [...histories].flatMap(([player, history]) => history.games
      .filter((g) => wanted.has(g.game_id) && ["FINAL", "DID_NOT_PLAY", "REVIEWING", "LIVE"].includes(String(g.status)))
      .map((g) => ({ player, game_id: g.game_id, score: g.score, played: g.played, status: String(g.status) })));
    const actuals = new Map<string, { score: number; played: boolean; complete: boolean }>();
    for (const p of players) {
      if (!p.player || !p.games.length || p.games.some(g => !g.id)) continue;
      const games = p.games.map(g => rows.find(r => r.player === p.player && r.game_id === g.id));
      const valid = games.filter(g => g && (
        (g.status === "DID_NOT_PLAY" && g.played === false) ||
        (g.status === "FINAL" && g.played !== null && (!g.played || Number.isFinite(g.score))) ||
        (["REVIEWING", "LIVE"].includes(g.status) && g.played === true && Number.isFinite(g.score))
      ));
      const played = valid.filter(g => g?.played && g.score !== null);
      const complete = valid.length === games.length && valid.every(g => g!.status === "FINAL" || g!.status === "DID_NOT_PLAY");
      if (played.length) actuals.set(p.player, { score: Math.max(...played.map(g => g!.score!)), played: true, complete });
      else if (complete) actuals.set(p.player, { score: 0, played: false, complete: true });
    }
    const result: ActualScores = {};
    for (const c of week.plans.flatMap(p => p.lineups.flatMap(l => [...l.starters, ...l.subs]))) {
      const actual = c.player ? actuals.get(c.player) : null;
      if (actual) result[c.slug] = actual;
    }
    for (const [player, actual] of actuals) result[playerKey(player)] = actual;
    return result;
  }, ["plan-actuals-v4", week.gameweek.slug], { tags: ["sorare"], revalidate: 3600 });
  return read();
}
