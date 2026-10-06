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

/** Sorare's six colours for a football score, by the names its own script gives them. */
export type ScoreBand = "veryLow" | "low" | "mediumLow" | "medium" | "mediumHigh" | "high";

/**
 * Where Sorare steps from one colour to the next, read from its own public script and checked against 42 real hexagons
 * (plans/overlay.md, O6): the first step whose limit is at least the score, else the top band. The sorare.com overlay
 * steps the same way (`scoreLevel` in extension/core.js) and a test holds the two together.
 */
const SCORE_STEPS: readonly (readonly [number, ScoreBand])[] = [
  [20, "veryLow"],
  [35, "low"],
  [50, "mediumLow"],
  [60, "medium"],
  [75, "mediumHigh"],
];

/** The band of a score as the hexagon draws it, which is rounded, or null when there is no score. */
export function scoreBand(score: number | null): ScoreBand | null {
  if (score === null || Number.isNaN(score)) return null;
  const drawn = Math.round(score);
  for (const [limit, band] of SCORE_STEPS) if (drawn <= limit) return band;
  return "high";
}

/** The board's tone for each band, softer than Sorare's neon for the white shell, and the ink that reads on it. */
const BAND_COLOURS: Record<ScoreBand, { fill: string; ink: string }> = {
  veryLow: { fill: "#c0433f", ink: "#ffffff" }, // red
  low: { fill: "#ef8a3c", ink: "#3a1e05" }, // orange
  mediumLow: { fill: "#e6b91e", ink: "#332600" }, // yellow
  medium: { fill: "#9bd227", ink: "#22300a" }, // lime
  mediumHigh: { fill: "#46c05a", ink: "#0c2f16" }, // green
  high: { fill: "#22c7c7", ink: "#08302f" }, // cyan
};

/**
 * The colour of a score hexagon: Sorare's band for the score, in the board's tone, with a grey for "not enough
 * games". `ink` is the number's colour on that fill.
 */
export function scoreColour(score: number | null): { fill: string; ink: string } {
  const band = scoreBand(score);
  return band ? BAND_COLOURS[band] : { fill: "#55555c", ink: "#ffffff" };
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

/** What a player is worth for the money: points he adds over your bar for every €10 of his Limited price (0 when he adds none). */
export function valuePer10(player: MarketPlayer, bar: Record<Position, number>): number {
  const g = gain(player, bar);
  return g > 0 && player.eur > 0 ? Math.round((g / player.eur) * 100) / 10 : 0;
}

/**
 * Search results: filtered by position and query, improvers first and owned players last. By "best" the biggest gain leads;
 * by "value" the most gain for the money (`valuePer10`), so a cheap upgrade can beat an expensive star.
 */
export function searchMarket(
  market: MarketPlayer[],
  bar: Record<Position, number>,
  owned: Set<string>,
  filter: { pos: Position | "all"; query: string; order?: "best" | "value" },
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
      if (own) return own;
      if (filter.order === "value") return valuePer10(b, bar) - valuePer10(a, bar) || gain(b, bar) - gain(a, bar);
      return gain(b, bar) - gain(a, bar);
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

const dueFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** What a dash under "Projected" means: Sorare's own score for his next game, which it only publishes once it has opened the week. */
export function projectionNote(projectionsAt: string | null, now: Date): string {
  if (projectionsAt && new Date(projectionsAt).getTime() > now.getTime())
    return `A dash: Sorare has not published its projection for his next game yet (due ${dueFormat.format(new Date(projectionsAt)).replace(",", "")}, Madrid time).`;
  return "A dash: Sorare gives no projection for his next game.";
}
