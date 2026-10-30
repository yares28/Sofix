import type { ArcadeGame } from "./arcade";
import { madridDate, predicted, type Outlook } from "./arcadePlan";

/**
 * Teams to build around: for days Sorare has not given a start % yet, the clubs where at least one of your cards
 * play, ranked by what their likely starters add. "Likely" = Sofix's start % (Futbol Fantasy, Sorare or Sofix) of 70% or more, else
 * Sorare's own playing status (starter or regular) with no injury Sorare reports. Sorare's player news is empty in its API (read
 * 29 Oct: `news(last:)` returned nothing for any player, signed in or not), so its status and injuries stand in for it.
 */

/** Sorare's word on a player: his tier (GOAT = Icon), his usual role and whether an injury is open. */
export type PlayerStatus = { tier: string | null; playing: string | null; injured: boolean; back: string | null };

export const LIKELY = 0.7;
const SORARE_STARTS = new Set(["STARTER", "REGULAR"]);

export type Signal = "sofix" | "sorare" | "doubt" | "out" | "unknown";
/** One card's start signal: injured is out; else Sofix's start % when there is one, else Sorare's status, else unknown. */
export function signalOf(o: Outlook, status: PlayerStatus | undefined): Signal {
  if (status?.injured) return "out";
  if (o.start !== null) return o.start >= LIKELY ? "sofix" : "doubt";
  if (status?.playing && SORARE_STARTS.has(status.playing)) return "sorare";
  return status?.playing ? "doubt" : "unknown";
}

export type ClubPick = {
  club: string;
  name: string;
  crest: string | null;
  game: ArcadeGame;
  day: string;
  /** Your cards of the club in that game, likely starters first, best first. */
  cards: { outlook: Outlook; signal: Signal; points: number }[];
  /** What its three best likely starters add, the count of likely starters and of cards Sorare reports out. */
  value: number;
  likely: number;
  out: number;
};

/** The clubs worth building a lineup around in each game from `from` to `to`, best first. One likely starter is enough. */
export function clubsToBuildAround(outlooks: Map<string, Outlook[]>, games: ArcadeGame[], status: Record<string, PlayerStatus>, from: number, to: number): ClubPick[] {
  const out: ClubPick[] = [];
  for (const game of games) {
    const at = Date.parse(game.kickoff);
    if (at < from || at > to) continue;
    for (const side of [game.home, game.away]) {
      if (!side) continue;
      const mine = (outlooks.get(game.id) ?? []).filter((o) => o.card.teamSlug === side.slug && predicted(o) !== null);
      const byPlayer = new Map<string, Outlook>();
      for (const o of mine) if (!byPlayer.has(o.card.player) || predicted(o)! > predicted(byPlayer.get(o.card.player)!)!) byPlayer.set(o.card.player, o);
      const cards = [...byPlayer.values()].map((o) => ({ outlook: o, signal: signalOf(o, status[o.card.player]), points: predicted(o)! }))
        .sort((a, b) => Number(b.signal === "sofix" || b.signal === "sorare") - Number(a.signal === "sofix" || a.signal === "sorare") || b.points - a.points);
      const likely = cards.filter((c) => c.signal === "sofix" || c.signal === "sorare");
      if (!likely.length) continue;
      out.push({
        club: side.slug, name: side.name, crest: side.crest ?? mine[0]?.card.teamPicture ?? null, game, day: madridDate(game.kickoff), cards,
        value: likely.slice(0, 3).reduce((sum, c) => sum + c.points, 0), likely: likely.length, out: cards.filter((c) => c.signal === "out").length,
      });
    }
  }
  return out.sort((a, b) => b.value - a.value);
}
