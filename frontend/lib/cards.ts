/**
 * Pure display logic for the two Sorare collection pages (S5): My cards (`/cards`) and Player search
 * (`/players`). Everything here is derived from the published payload (`lib/play.ts` `collection` and
 * `market`); nothing fetches. Kept apart from the components so it can be unit-tested.
 *
 * Design: docs/sorare/design/S5-cards.html and S5-search.html.
 */

import type { CardScore, CollectionCard, MarketPlayer } from "./play";

export type Position = "GK" | "DEF" | "MID" | "FWD";

export const SCORE_WINDOWS: CardScore["window"][] = ["L5", "L10", "L40"];

/**
 * The colour Sorare gives a score hexagon, by band: red → orange → amber → lime → green → cyan → teal, with a
 * grey for "not enough games". `ink` is the number's colour on that fill. Matched to Sorare's own ramp
 * (e.g. 48 amber, 52 lime, 72 green, 81 cyan, 98 teal).
 */
export function scoreColour(score: number | null): { fill: string; ink: string } {
  if (score === null || Number.isNaN(score)) return { fill: "#55555c", ink: "#ffffff" };
  if (score >= 90) return { fill: "#22c7c7", ink: "#08302f" };
  if (score >= 80) return { fill: "#3fb5df", ink: "#062838" };
  if (score >= 65) return { fill: "#46c05a", ink: "#0c2f16" };
  if (score >= 50) return { fill: "#9bd227", ink: "#22300a" };
  if (score >= 40) return { fill: "#e6b91e", ink: "#332600" };
  if (score >= 30) return { fill: "#ef8a3c", ink: "#3a1e05" };
  if (score >= 15) return { fill: "#e5602f", ink: "#ffffff" };
  return { fill: "#c0433f", ink: "#ffffff" };
}

/** The three hexagons a card shows, in order. Falls back to the last-ten average when per-window data is absent. */
export function cardWindows(card: CollectionCard): CardScore[] {
  if (card.scores && card.scores.length) {
    return SCORE_WINDOWS.map(
      (window) =>
        card.scores!.find((entry) => entry.window === window) ?? { window, score: null, started: null },
    );
  }
  return SCORE_WINDOWS.map((window) => ({
    window,
    score: window === "L10" ? (card.average || null) : null,
    started: null,
  }));
}

/**
 * Sorare's seasonality mark: an in-season card shows its season's short number (a 2026/27 card → "27"), a
 * classic card shows "C". The season year is read from the card slug (…-2026-limited-…).
 */
export function seasonBadge(card: Pick<CollectionCard, "inSeason" | "slug">): string {
  if (!card.inSeason) return "C";
  const match = card.slug.match(/-(\d{4})-(?:limited|rare|super[-_]?rare|unique|common)\b/);
  if (!match) return "IS";
  return String((Number(match[1]) + 1) % 100).padStart(2, "0");
}

/** Sorare's gameplay tier, in the same order as the star count the sync stores (1–5). */
const TIER_NAME = ["", "DNP", "Roster", "Impact", "Star", "Icon"] as const;

/** The card's tier in words. Five stars is Icon; with no tier, the rarity. */
export function tierLabel(card: Pick<CollectionCard, "stars" | "rarity">): string {
  if (card.stars && card.stars >= 1 && card.stars <= 5) return TIER_NAME[card.stars]!;
  return card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1);
}

export const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
export const POSITION_LABEL: Record<Position, string> = {
  GK: "Goalkeepers",
  DEF: "Defenders",
  MID: "Midfielders",
  FWD: "Forwards",
};

/** How many cards are a second (or third) of a player already held (any rarity or season). */
export function duplicateCounts(collection: CollectionCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of collection) counts.set(card.player, (counts.get(card.player) ?? 0) + 1);
  return counts;
}

/**
 * The key that makes two cards "the same" for the ×N badge: same player, same rarity and same seasonality. An
 * in-season Limited and an out-of-season Limited of one player are different cards, so neither shows ×2; two
 * cards that share all three do.
 */
export function stackKey(card: CollectionCard): string {
  return `${card.player}|${card.rarity}|${card.inSeason ? "in" : "out"}`;
}

/** How many identical cards (player + rarity + season) sit in the collection, per stack key. */
export function stackCounts(collection: CollectionCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of collection) counts.set(stackKey(card), (counts.get(stackKey(card)) ?? 0) + 1);
  return counts;
}

export type CollectionSummary = {
  cards: number;
  players: number;
  duplicates: number;
  clubs: number;
  limited: number;
  rare: number;
  inSeason: number;
  average: number;
  byPosition: { pos: Position; count: number }[];
  maxPosition: number;
};

/** The numbers the My cards hero and KPI strip show: what he can field, and the shape of the squad. */
export function collectionSummary(collection: CollectionCard[]): CollectionSummary {
  const dupes = duplicateCounts(collection);
  const players = dupes.size;
  const rare = collection.filter((card) => card.rarity === "rare").length;
  const byPosition = POSITIONS.map((pos) => ({
    pos,
    count: collection.filter((card) => card.pos === pos).length,
  }));
  const total = collection.reduce((sum, card) => sum + card.average, 0);
  return {
    cards: collection.length,
    players,
    duplicates: collection.length - players,
    clubs: new Set(collection.map((card) => card.club).filter(Boolean)).size,
    limited: collection.length - rare,
    rare,
    inSeason: collection.filter((card) => card.inSeason).length,
    average: collection.length ? Math.round(total / collection.length) : 0,
    byPosition,
    maxPosition: Math.max(1, ...byPosition.map((entry) => entry.count)),
  };
}

export type Season = "all" | "in" | "out";

/** The collection grouped into position shelves, each sorted by average, after the position/rarity/season filter. */
export function shelves(
  collection: CollectionCard[],
  filter: { pos: Position | "all"; rarity: string; season?: Season },
): { pos: Position; cards: CollectionCard[] }[] {
  const positions = filter.pos === "all" ? POSITIONS : [filter.pos];
  const season = filter.season ?? "all";
  const seasonOk = (card: CollectionCard) =>
    season === "all" || (season === "in" ? card.inSeason : !card.inSeason);
  return positions
    .map((pos) => ({
      pos,
      cards: collection
        .filter(
          (card) =>
            card.pos === pos &&
            (filter.rarity === "all" || card.rarity === filter.rarity) &&
            seasonOk(card),
        )
        .sort((a, b) => b.average - a.average),
    }))
    .filter((shelf) => shelf.cards.length > 0);
}

/**
 * The bar a signing has to clear in each position: the fifth-best card already held there. A lineup fields
 * five outfield slots and at most one of any player, so the fifth-best is the one a new card would replace.
 */
export function squadBar(collection: CollectionCard[]): Record<Position, number> {
  const bar = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    const held = collection
      .filter((card) => card.pos === pos)
      .map((card) => card.average)
      .sort((a, b) => b - a);
    bar[pos] = held.length ? held[Math.min(4, held.length - 1)]! : 0;
  }
  return bar;
}

/** How much a player would add over the bar in his position (negative when the squad is already deeper). */
export function gain(player: MarketPlayer, bar: Record<Position, number>): number {
  return Math.round(player.average - (bar[player.pos] ?? 0));
}

export type Verdict =
  | { kind: "up"; value: string; note: string }
  | { kind: "flat"; value: string; note: string }
  | { kind: "own"; value: string; note: string };

/** The lead signal on a search result: an upgrade, a level/worse card, or one already owned. */
export function verdict(player: MarketPlayer, bar: Record<Position, number>, owned: Set<string>): Verdict {
  if (owned.has(player.slug)) return { kind: "own", value: "In your squad", note: "you have him" };
  const g = gain(player, bar);
  if (g > 0) return { kind: "up", value: `+${g}`, note: `on your ${player.pos}` };
  return { kind: "flat", value: g === 0 ? "level" : String(g), note: `vs your ${player.pos}` };
}

/** Players who would improve the team: not already owned, and above the bar in their position. */
export function improvers(
  market: MarketPlayer[],
  bar: Record<Position, number>,
  owned: Set<string>,
): MarketPlayer[] {
  return market.filter((player) => !owned.has(player.slug) && gain(player, bar) > 0);
}

/** Search results: filtered by position and query, improvers first and owned players last. */
export function searchMarket(
  market: MarketPlayer[],
  bar: Record<Position, number>,
  owned: Set<string>,
  filter: { pos: Position | "all"; query: string },
): MarketPlayer[] {
  const query = filter.query.trim().toLowerCase();
  return market
    .filter(
      (player) =>
        (filter.pos === "all" || player.pos === filter.pos) &&
        (!query ||
          player.name.toLowerCase().includes(query) ||
          (player.club ?? "").toLowerCase().includes(query)),
    )
    .sort((a, b) => {
      const own = (owned.has(a.slug) ? 1 : 0) - (owned.has(b.slug) ? 1 : 0);
      return own || gain(b, bar) - gain(a, bar);
    });
}

export function ownedPlayers(collection: CollectionCard[]): Set<string> {
  return new Set(collection.map((card) => card.player));
}

/** Up to two initials for a player, used when the card art can't be loaded. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** A euro price the way the search shows it: whole euros with a separator above 100, cents below. */
export function priceLabel(eur: number): string {
  return `\u20ac${eur >= 100 ? Math.round(eur).toLocaleString("en-US") : eur.toFixed(2)}`;
}
