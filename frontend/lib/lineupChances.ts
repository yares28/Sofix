import type { LineupMatch, LineupPlayer } from "./lineups";
import { z } from "zod";
import { sourceChances } from "./nextGame";
import type { MarketPlayer, PlayingPlayer, StartSource } from "./play";

export type ChancePlayer = Pick<PlayingPlayer, "player" | "club" | "games" | "sources" | "pStart" | "startSource">;
export type MatchChances = Record<string, Partial<Record<StartSource, number>>>;
export type LineupChances = Record<string, MatchChances>;
export type ChanceRecord = { players: Record<string, { games: { id?: string; kickoff: string; sources?: Partial<Record<StartSource, number>>; ffMatch?: { id: number }; ffPlayer?: string }[] }> };
export type SorareGameLink = { id: string; players: Record<string, string> };
/** Match identity survives independently of whether the public API published Sorare's odds. */
export function recordedGames(matches: LineupMatch[], records: ChanceRecord[]): Record<number, SorareGameLink> {
  const links: Record<number, SorareGameLink> = {};
  for (const record of records) for (const [slug, p] of Object.entries(record.players)) for (const g of p.games) {
    if (!g.id?.match(/^Game:[0-9a-f-]{36}$/i) || !g.ffMatch || !g.ffPlayer) continue;
    const match = matches.find((m) => m.id === g.ffMatch!.id);
    if (!match || (match.kickoff && Date.parse(match.kickoff) !== Date.parse(g.kickoff))) continue;
    if (![match.home, match.away].some((s) => [...s.rows.flatMap((r) => r.players), ...s.alternatives].some((p) => p.id === g.ffPlayer))) continue;
    const linked = links[match.id] ??= { id: g.id, players: {} };
    if (linked.id === g.id) linked.players[slug] = g.ffPlayer;
  }
  return links;
}
const SorareChancesSchema = z.object({
  ok: z.literal(true), state: z.literal("ok"), incomplete: z.boolean().optional(), data: z.object({ anyGame: z.object({
    id: z.string(), playerGameScores: z.array(z.unknown()),
  }) }),
});
const SorareScoreSchema = z.object({
  anyPlayer: z.object({ slug: z.string().min(1) }),
  anyPlayerGameStats: z.object({ footballPlayingStatusOdds: z.object({ starterOddsBasisPoints: z.number().int().min(0).max(10_000).nullable() }).nullable() }).nullable(),
});
export type SorareChanceRead = {
  state: "ready" | "empty" | "no-players" | "unmatched" | "incomplete" | "signed-out" | "unavailable" | "rate-limited" | "error";
  values: MatchChances;
  checked: number;
};
/** A successful game read is not proof its private odds were available. Never label errors or failed joins as unpublished. */
export function sorareChanceRead(answer: unknown, link: SorareGameLink): SorareChanceRead {
  const envelope = z.object({ ok: z.literal(true), state: z.string(), status: z.number().optional() }).safeParse(answer);
  const empty = { values: {}, checked: 0 };
  if (!envelope.success) return { state: "unavailable", ...empty };
  if (envelope.data.status === 429) return { state: "rate-limited", ...empty };
  if (envelope.data.state === "signed-out") return { state: "signed-out", ...empty };
  if (["no-tab", "no-bridge", "timeout"].includes(envelope.data.state)) return { state: "unavailable", ...empty };
  const result = SorareChancesSchema.safeParse(answer);
  if (!result.success || result.data.data.anyGame.id !== link.id) return { state: "error", ...empty };
  const values: MatchChances = {};
  let checked = 0, offered = 0, incomplete = result.data.incomplete ?? false;
  for (const row of result.data.data.anyGame.playerGameScores) {
    const parsed = SorareScoreSchema.safeParse(row);
    if (!parsed.success) { incomplete = true; continue; }
    checked++;
    const player = link.players[parsed.data.anyPlayer.slug];
    const n = parsed.data.anyPlayerGameStats?.footballPlayingStatusOdds?.starterOddsBasisPoints;
    if (typeof n !== "number") continue;
    offered++;
    if (player) values[player] = { sorare: n / 10_000 };
  }
  const state = incomplete ? "incomplete" : Object.keys(values).length ? "ready" : offered ? "unmatched" : checked ? "empty" : "no-players";
  return { state, values, checked };
}
/** Captured game statements survive the optimizer switching to its next open week. */
export function recordedChances(matches: LineupMatch[], records: ChanceRecord[]): LineupChances {
  const result: LineupChances = {};
  for (const record of records) for (const p of Object.values(record.players)) for (const g of p.games) {
    if (!g.ffMatch || !g.ffPlayer || !g.sources) continue;
    const match = matches.find((m) => m.id === g.ffMatch!.id);
    if (!match || (match.kickoff && Date.parse(match.kickoff) !== Date.parse(g.kickoff))) continue;
    const people = [match.home, match.away].flatMap((s) => [...s.rows.flatMap((r) => r.players), ...s.alternatives]);
    if (!people.some((p) => p.id === g.ffPlayer)) continue;
    const values = (result[match.id] ??= {})[g.ffPlayer] ??= {};
    for (const source of ["sofix", "sorare"] as const) {
      const n = g.sources[source];
      if (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1) values[source] = n;
    }
  }
  return result;
}
export const CHANCE_SOURCES: Record<StartSource, string> = { futbolfantasy: "Futbol Fantasy", sorare: "Sorare", sofix: "Sofix" };

/** Join cached forecasts to this match only; then every other LaLiga player through his Futbol Fantasy link (`market`), so
 * Sofix's and Sorare's views have a number for players you don't own too. Your own cards' numbers come first. The source breakdown belongs to the first game of a week;
 * later games can only contribute their own published source. FF always comes from the lineup reading. */
export function lineupChances(matches: LineupMatch[], players: ChancePlayer[], market: MarketPlayer[] = []): LineupChances {
  const result: LineupChances = {};
  for (const forecast of players) {
    const games = [...forecast.games].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    games.forEach((game, index) => {
      const chances = sourceChances(index === 0 ? forecast : game).list.filter((one) => one.source !== "futbolfantasy");
      if (!chances.length) return;
      for (const match of matches) {
        for (const [side, venue] of [[match.home, "H"], [match.away, "A"]] as const) {
          const sameMatch = game.ffMatch
            ? game.ffMatch.id === match.id
            : match.competition === "laliga" && game.competition === "laliga-es" && side.club !== null &&
              forecast.club === side.club && game.venue === venue && match.kickoff !== null &&
              new Date(game.kickoff).getTime() === new Date(match.kickoff).getTime();
          if (!sameMatch) continue;
          for (const player of [...side.rows.flatMap((row) => row.players), ...side.alternatives]) {
            if (game.ffPlayer ? game.ffPlayer !== player.id : !player.yours || player.yours !== forecast.player) continue;
            const values = (result[match.id] ??= {})[player.id] ??= {};
            for (const { source, percent } of chances) values[source] ??= percent / 100;
          }
        }
      }
    });
  }
  for (const row of market) {
    if (!row.ffMatch || !row.ffPlayer || !row.sources) continue;
    const values = (result[row.ffMatch.id] ??= {})[row.ffPlayer] ??= {};
    for (const [source, p] of Object.entries(row.sources) as [StartSource, number][]) {
      if (source !== "futbolfantasy") values[source] ??= p;
    }
  }
  return result;
}

export type ChanceView = { source: StartSource; values: MatchChances; url: string };

export function chanceFor(player: LineupPlayer, view: ChanceView): number | null {
  return view.source === "futbolfantasy" ? player.p : view.values[player.id]?.[view.source] ?? null;
}

export const chancePercent = (p: number | null) => p === null ? "—" : `${Math.round(p * 100)}%`;
