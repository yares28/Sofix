import { clubKey, NATIONAL_COMPETITION } from "./home";
import type { GameweekPlan, MarketPlayer, StartSource } from "./play";

export type ScoreRecord = {
  gameweek: { slug: string };
  players: Record<string, {
    by?: MarketPlayer["by"]; mu?: number | null; pPlay?: number | null; pStart?: number | null; startSource?: StartSource;
    games: { team?: string | null; teamCrest?: string | null; opponent?: string | null; opponentCrest?: string | null; venue?: "H" | "A" | null; kickoff: string; competition?: string; home?: string | null; away?: string | null;
      sofix?: number | null; sorare?: number | null; sources?: Partial<Record<StartSource, number>> }[];
  }>;
};

/** Prices and identities are current; forecasts belong exclusively to the selected GW. */
export function marketForWeek(
  market: MarketPlayer[], nextId: string, week: Pick<GameweekPlan["gameweek"], "id" | "slug">,
  plan: GameweekPlan | null, record: ScoreRecord | null,
): MarketPlayer[] {
  const players = new Map(plan?.gameweek.slug === week.slug ? plan.playing.players.map(p => [p.player, p]) : []);
  const saved = record?.gameweek?.slug === week.slug ? record.players : {};
  return market.map(row => {
    // Omit every game-dependent value when changing weeks; a missing record must never retain next week's values.
    const identity = { slug: row.slug, name: row.name, pos: row.pos, club: row.club, crest: row.crest,
      average: row.average, eur: row.eur, pic: row.pic };
    if (row.pos === "UNK") return { ...identity, projection: null };
    let shown: MarketPlayer = week.id === nextId ? { ...row } : { ...identity, projection: null };
    const r = saved[row.slug];
    const first = r?.games[0];
    if (r && first) {
      const club = clubKey(row.club ?? "");
      const national = NATIONAL_COMPETITION.test(first.competition ?? "");
      const home = !national && club && first.home && clubKey(first.home) === club;
      const away = !national && club && first.away && clubKey(first.away) === club;
      shown = { ...identity, by: r.by, projection: first.sorare ?? null,
        ...(typeof r.mu === "number" ? { mu: r.mu } : {}),
        ...(typeof r.pPlay === "number" ? { p: r.pPlay } : {}),
        ...(typeof r.mu === "number" && typeof r.pPlay === "number" ? { x: Math.round(r.mu * r.pPlay * 10) / 10 } : {}),
        ...(typeof r.pStart === "number" ? { pStart: r.pStart, startSource: r.startSource } : {}),
        ...(typeof first.sofix === "number" ? { start: first.sofix } : {}),
        sources: first.sources,
        ...(first.team && first.opponent ? { fixture: { team: first.team, teamCrest: first.teamCrest, opponent: first.opponent, opponentCrest: first.opponentCrest ?? null, venue: first.venue ?? null, kickoff: first.kickoff, competition: first.competition } } : home || away ? { fixture: { kickoff: first.kickoff, venue: home ? "H" : "A", opponent: home ? first.away ?? null : first.home ?? null, opponentCrest: null } } : {}),
      };
    }
    const p = players.get(row.slug);
    const game = p?.games[0];
    if (p && game) shown = { ...shown, by: p.by, p: p.p, x: p.x, start: p.start, pStart: p.pStart, startSource: p.startSource,
      sources: p.sources, projection: p.sorare ?? null,
      fixture: { team: game.team, teamCrest: game.teamCrest, opponent: game.opponent, opponentCrest: game.opponentCrest, venue: game.venue, kickoff: game.kickoff } };
    return shown;
  });
}
