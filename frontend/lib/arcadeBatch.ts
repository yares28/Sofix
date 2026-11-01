import type { ArcadeGame } from "./arcade";
import { WINDOW_MS } from "./arcadeClimb";
import { bestLineup, madridDate, simulation, type Lineup, type Outlook } from "./arcadePlan";

export type Batch = { id: string; at: number; day: string; games: ArcadeGame[] };

/** Keep unowned games too: an empty batch is useful evidence, not a missing window. */
export function batchesOf(games: ArcadeGame[], now: number): Batch[] {
  const batches: Batch[] = [];
  for (const game of [...games].filter(g => Date.parse(g.kickoff) > now).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id.localeCompare(b.id))) {
    const at = Date.parse(game.kickoff);
    const last = batches.at(-1);
    if (last && at - last.at <= WINDOW_MS) last.games.push(game);
    else batches.push({ id: game.id, at, day: madridDate(game.kickoff), games: [game] });
  }
  return batches;
}

/** Same sequential simulated selection and player uniqueness as The chain's insurance teams. */
export function teamsInBatch(list: Outlook[], target: number, captainBonus: number, count: number, held: Set<string> = new Set()): Lineup[] {
  const used = new Set<string>();
  const teams: Lineup[] = [];
  const draw = simulation(captainBonus);
  for (let i = 0; i < Math.max(1, Math.min(4, Math.trunc(count))); i++) {
    const lineup = bestLineup(list.filter(o => !held.has(o.card.slug) && !used.has(o.card.player)), target, captainBonus, undefined, undefined, draw);
    if (!lineup) break;
    teams.push(lineup);
    lineup.picks.forEach(p => used.add(p.outlook.card.player));
  }
  return teams;
}
