export type SavedGame = {
  game_id: string; date: string; competition: string; home: string | null; away: string | null; status: string | null;
  score: number | null; played: boolean | null; started: boolean | null; mins: number | null; yellow: number | null; red: boolean | null;
  sofix_x: number | null; sorare_x: number | null; read_at: string | null;
};
export type Absence = { id: number; kind: string; cause: string | null; first_seen: string; last_seen: string; back: string | null; url?: string | null };
export type PlayerHistory = { games: SavedGame[]; absences: Absence[] };
export function seasonGames(games: SavedGame[], now: Date): SavedGame[] {
  const first = new Date(Date.UTC(now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0), 6, 1));
  return games.filter(g => new Date(g.date) >= first && new Date(g.date) <= now).sort((a, b) => b.date.localeCompare(a.date));
}

export function seasonSummary(games: SavedGame[], now: Date) {
  const final = seasonGames(games, now).filter(g => g.status === "FINAL");
  const scores = final.filter(g => g.played === true && g.score !== null);
  const liga = final.filter(g => g.competition === "laliga-es");
  const miss = (key: "sofix_x" | "sorare_x") => {
    const paired = final.filter(g => g.started === true && g.score !== null && g[key] !== null);
    return paired.length ? { n: paired.length, miss: paired.reduce((n, g) => n + Math.abs(g.score! - g[key]!), 0) / paired.length } : null;
  };
  return {
    games: final.filter(g => g.played === true).length, starts: final.filter(g => g.started === true).length,
    average: scores.length ? scores.reduce((n, g) => n + g.score!, 0) / scores.length : null,
    scored: scores.length, yellows: liga.reduce((n, g) => n + (g.yellow ?? 0), 0), yellowComplete: liga.length > 0 && liga.every(g => g.yellow !== null),
    sofix: miss("sofix_x"), sorare: miss("sorare_x"),
  };
}
