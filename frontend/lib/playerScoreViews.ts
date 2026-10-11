import type { PlayerScoreRow, PlayerScoreWeek } from "./audit";
import type { PlayerGame } from "./play";

export type ScoreGame = PlayerScoreRow & { homeCrest?: string | null; awayCrest?: string | null };
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

/** Display summaries use each forecast's checked starts; pending, DNP and substitutes remain in the game list. */
export function scoreStats(rows: PlayerScoreRow[]) {
  const starts = rows.filter(r => r.state !== "pending" && r.played === true && r.started === true && r.actual !== null);
  const xs = starts.filter(r => r.xscore !== null);
  const sos = starts.filter(r => r.sorare !== null);
  const differences = xs.map(r => r.actual! - r.xscore!);
  return { total: rows.length, checked: rows.filter(r => r.state !== "pending").length, starts: starts.length,
    xCases: xs.length, sorareCases: sos.length, xscore: mean(xs.map(r => r.xscore!)), sorare: mean(sos.map(r => r.sorare!)),
    actual: mean(starts.map(r => r.actual!)), diff: mean(differences),
    totalDiff: differences.length ? differences.reduce((a, b) => a + b, 0) : null,
    xMiss: mean(differences.map(Math.abs)), sorareMiss: mean(sos.map(r => Math.abs(r.actual! - r.sorare!))) };
}

export function playerSummaries(weeks: PlayerScoreWeek[]) {
  const players = new Map<string, { row: PlayerScoreRow; rows: PlayerScoreRow[]; weeks: Set<string> }>();
  for (const week of weeks) for (const row of week.rows) {
    const entry = players.get(row.player) ?? { row, rows: [], weeks: new Set<string>() };
    entry.rows.push(row);
    entry.weeks.add(week.slug);
    players.set(row.player, entry);
  }
  return [...players.values()].map(({ row, rows, weeks }) => ({ ...row, weeks: weeks.size, stats: scoreStats(rows),
    sources: [...new Set(rows.filter(r => r.state !== "pending" && r.played === true && r.started === true && r.actual !== null && r.xscore !== null && r.by).map(r => r.by!))] })).sort((a, b) => a.name.localeCompare(b.name));
}

export const sideKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/** Join only a game's own sides or an exact side-name identity, never the player's current club. */
export function withGameCrests(row: PlayerScoreRow, games: PlayerGame[], crests: Map<string, string>): ScoreGame {
  const game = games.find(g => g.id && g.id === row.game);
  const side = (name: string | null) => {
    if (!name) return null;
    if (game?.team && sideKey(game.team) === sideKey(name) && game.teamCrest) return game.teamCrest;
    if (game?.opponent && sideKey(game.opponent) === sideKey(name) && game.opponentCrest) return game.opponentCrest;
    return crests.get(sideKey(name)) ?? null;
  };
  return { ...row, homeCrest: side(row.home), awayCrest: side(row.away) };
}
