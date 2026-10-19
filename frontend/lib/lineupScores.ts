import type { GameweekLineup } from "./entered";
import type { GameweekPlan, Lineup, PlayCard } from "./play";

export type ActualScores = Record<string, { score: number; played: boolean; complete?: boolean }>;
/** A player's own score sits in the same map under this key, beside his cards' (a Sorare card score adds its bonuses). */
export const playerKey = (player: string) => `player:${player}`;
/** A card's score as Sorare counts it: his own score with the card's bonus and, for the captain, the captain's. */
export const cardTotal = (score: number | null, card: Pick<PlayCard, "mult" | "captain">, captainBonus: number) =>
  score === null || !Number.isFinite(card.mult) ? null : score * (card.mult + (card.captain && Number.isFinite(captainBonus) ? captainBonus : 0));
export type TeamScore = { value: number | null; complete: boolean };
type ScoringCard = PlayCard & { positions?: string[] };
type ScoringLineup = Pick<Lineup, "starters" | "subs" | "captainBonus" | "minInSeason" | "clubBonus" | "averageBonus">;
const position = (value: string) => ({ goalkeeper: "GK", defender: "DEF", midfielder: "MID", forward: "FWD", extra: "EXT", outfielder: "OUT" })[value.toLowerCase()] ?? value;

/** Old frozen forecasts omit bonus fields that the same GW's replay retained. Fill only those rules. */
export function withLineupRules(forecast: GameweekPlan, replay: GameweekPlan | null): GameweekPlan {
  if (forecast.gameweek.slug !== replay?.gameweek.slug) return forecast;
  const rules = new Map(replay.plans.flatMap(p => p.lineups).filter(l => "clubBonus" in l && "averageBonus" in l).map(l => [l.board, l]));
  return { ...forecast, plans: forecast.plans.map(p => ({ ...p, lineups: p.lineups.map(l => {
    const rule = rules.get(l.board);
    return rule ? { ...l, clubBonus: l.clubBonus === undefined ? rule.clubBonus : l.clubBonus,
      averageBonus: l.averageBonus === undefined ? rule.averageBonus : l.averageBonus } : l;
  }) })) };
}

/** Same captain, substitution and bonus rules as sorare/planner.py:totals. Unknown starters cannot trigger a swap. */
function total(lineup: ScoringLineup, scores: ActualScores): number {
  const { starters, subs } = lineup;
  let bonus = 0;
  const clubs = new Map<string | null, number>();
  for (const c of starters) clubs.set(c.club, (clubs.get(c.club) ?? 0) + 1);
  if (lineup.clubBonus && Math.max(...clubs.values()) <= lineup.clubBonus[0]) bonus += lineup.clubBonus[1];
  if (lineup.averageBonus && starters.reduce((sum, c) => sum + c.average, 0) <= lineup.averageBonus[0]) bonus += lineup.averageBonus[1];
  const base = starters.reduce((sum, c) => sum + (scores[c.slug]?.played ? scores[c.slug]!.score * c.mult : 0), 0);
  const captain = starters.find(c => c.captain);
  let value = base + (captain && scores[captain.slug]?.played ? scores[captain.slug]!.score * lineup.captainBonus : 0);
  const replaced = new Set<string>();
  let cameIn = false;
  for (const sub of subs) {
    if (!scores[sub.slug]?.played) continue;
    const starter = starters.find(c => {
      if (!scores[c.slug] || scores[c.slug]!.played || replaced.has(c.slug)) return false;
      const keeper = c.slot === "GK" || c.pos === "GK";
      if ((sub.slot === "GK" || sub.pos === "GK") !== keeper) return false;
      if (!keeper && c.slot !== "EXT" && !((sub as ScoringCard).positions ?? [sub.pos]).includes(c.pos)) return false;
      return !lineup.minInSeason || !c.inSeason || sub.inSeason || starters.filter(s => s.inSeason).length - 1 >= lineup.minInSeason;
    });
    if (starter) {
      replaced.add(starter.slug); cameIn = true;
      value += scores[sub.slug]!.score * sub.mult;
    }
  }
  if (!cameIn) value += starters.reduce((sum, c) => sum + (scores[c.slug]?.played ? scores[c.slug]!.score * bonus : 0), 0);
  return value;
}

export function lineupActual(lineup: Lineup, scores: ActualScores): TeamScore {
  if (lineup.actual) return { value: lineup.actual.total, complete: true };
  if (!Number.isFinite(lineup.captainBonus) || !("clubBonus" in lineup) || !("averageBonus" in lineup)) return { value: null, complete: false };
  const cards = [...lineup.starters, ...lineup.subs];
  const known = cards.filter(c => scores[c.slug]);
  return { value: known.length ? total(lineup, scores) : null, complete: cards.length > 0 && known.length === cards.length && known.every(c => scores[c.slug]!.complete !== false) };
}

/** Custom teams use independent playing chances and conditional means, enumerated exactly (at most 9 cards).
 * Saved optimizer totals retain their seeded simulation, including its score distribution and correlations.
 */
function expectation(lineup: ScoringLineup, need?: number | null): { value: number; chance?: number } {
  const cards = [...lineup.starters, ...lineup.subs];
  let value = 0;
  let chance = 0;
  for (let mask = 0; mask < 2 ** cards.length; mask++) {
    const scores: ActualScores = {};
    let probability = 1;
    cards.forEach((c, i) => {
      const played = Boolean(mask & 2 ** i);
      probability *= played ? c.p : 1 - c.p;
      scores[c.slug] = { played, score: c.mu };
    });
    if (!probability) continue;
    const mean = total(lineup, scores);
    value += probability * mean;
    if (!need) continue;
    // With who plays fixed the total is a weighted sum of the scores: each card's weight is the total when only he scores 1.
    const weights = cards.filter(c => scores[c.slug]!.played).map(c =>
      total(lineup, Object.fromEntries(cards.map(o => [o.slug, { played: scores[o.slug]!.played, score: o === c ? 1 : 0 }]))));
    const sd = SCORE_SD * Math.hypot(...weights);
    chance += probability * (sd ? 1 - bell((need - mean) / sd) : Number(mean >= need));
  }
  return need ? { value, chance } : { value };
}

/** planner.py's SCORE_SD.
 * ponytail: independent, unclipped bell scores; the planner also ties one game's players together. Publish it from the backend if the gap shows. */
const SCORE_SD = 17.6;
/** The standard bell curve's share below z (Abramowitz and Stegun 26.2.17, within 1e-7). */
function bell(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const tail = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - tail : tail;
}

/** Only this GW supplies forecasts: an absent player never borrows a later week's score or becomes a zero. */
export function enteredScore(entered: GameweekLineup, week: GameweekPlan | null, slug: string): {
  value: number | null; estimated: boolean;
  /** The chance of any cash, essence or card: the plan's own for a plan lineup, else against the score the lowest paid level took. Absent when unknown. */
  chance?: number;
} {
  const missing = { value: null, estimated: false };
  if (!week || week.gameweek.slug !== slug || !entered.cards.length) return missing;
  const options = week.plans.flatMap(p => p.lineups).filter(l => l.board === entered.board);
  // Legacy saved responses retain Sorare's appearance order (starters, then bench).
  // Explicit indices, when supplied, take precedence over that retained order.
  const legacy = entered.cards.every(c => c.index === undefined);
  const ordered = entered.cards.map((c, i) => legacy ? { ...c, index: i } : c).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const saved = options.find(l => {
    const cards = [...l.starters, ...l.subs];
    return cards.length === ordered.length && cards.every((c, i) => c.slug === ordered[i]!.slug && !!c.captain === ordered[i]!.captain);
  });
  if (saved) return { value: saved.x, estimated: false, chance: saved.pReturn };

  const template = options[0];
  const rules = entered.scoring;
  if (!template && !rules) return missing;
  if (!rules && template && (!Number.isFinite(template.captainBonus) || !("clubBonus" in template) || !("averageBonus" in template))) return missing;
  // A partially indexed response is ambiguous; only complete indices or the intact legacy order are usable.
  if (ordered.some(c => c.index === undefined) || new Set(ordered.map(c => c.index)).size !== ordered.length) return missing;
  const published = new Map(week.plans.flatMap(p => p.lineups.flatMap(l => [...l.starters, ...l.subs])).map(c => [c.slug, c]));
  const boardCards = new Map(options.flatMap(l => [...l.starters, ...l.subs]).map(c => [c.slug, c]));
  const players = new Map(week.playing.players.map(p => [p.player, p]));
  const cards: ScoringCard[] = [];
  for (const enteredCard of ordered) {
    const known = published.get(enteredCard.slug);
    const playerId = enteredCard.player ?? known?.player;
    const player = playerId ? players.get(playerId) : undefined;
    const forecast = known ?? (player ? { p: player.p, mu: player.p > 0 ? player.x / player.p : 0, x: player.x } : null);
    if (!forecast || !Number.isFinite(forecast.p) || forecast.p < 0 || forecast.p > 1 || !Number.isFinite(forecast.mu) || !Number.isFinite(forecast.x)) return missing;
    const slot = rules?.slots[enteredCard.index!] ?? (template ? {
      positions: [([...template.starters, ...template.subs][enteredCard.index!]?.slot ?? "")],
      sub: enteredCard.index! >= template.starters.length,
    } : null);
    if (!slot) return missing;
    const pos = known?.pos ?? position(enteredCard.positions?.[0] ?? "");
    if (!["GK", "DEF", "MID", "FWD"].includes(pos)) return missing;
    if (!known && (enteredCard.level === undefined || enteredCard.inSeason === undefined || enteredCard.average == null)) return missing;
    const inSeason = enteredCard.inSeason ?? known!.inSeason;
    const mult = rules ? 1 + (inSeason ? rules.season : 0) + rules.grade * (enteredCard.level ?? known!.level) + (rules.scarcity[enteredCard.rarity ?? ""] ?? 0) : boardCards.get(enteredCard.slug)?.mult;
    if (mult === undefined) return missing;
    const positions = slot.positions.map(position);
    if (!positions.length || positions.some(p => !["GK", "DEF", "MID", "FWD", "EXT", "OUT"].includes(p))) return missing;
    cards.push({ ...known, slug: enteredCard.slug, name: enteredCard.name, player: enteredCard.player ?? known?.player,
      pos: pos as PlayCard["pos"], rarity: enteredCard.rarity ?? "limited", inSeason, level: enteredCard.level ?? known!.level,
      average: enteredCard.average ?? known!.average, club: enteredCard.club ?? known?.club ?? null,
      pic: enteredCard.picture ?? "", avatar: "", crest: null, actual: null, fixture: null,
      mult, p: forecast.p, mu: forecast.mu, x: forecast.x, captain: enteredCard.captain,
      positions: enteredCard.positions?.map(position),
      slot: slot.sub ? (positions.includes("GK") ? "GK" : "OUT") : positions.length > 1 ? "EXT" : positions[0],
    });
  }
  if (cards.length > 9) return missing;
  const size = rules ? rules.slots.filter(s => !s.sub).length : template!.starters.length;
  const starters = cards.filter((_, i) => rules ? !rules.slots[ordered[i]!.index!]?.sub : ordered[i]!.index! < size);
  const subs = cards.filter(c => !starters.includes(c));
  if (starters.length !== size || starters.filter(c => c.captain).length !== 1) return missing;
  const custom: ScoringLineup = { captainBonus: rules?.captain ?? template!.captainBonus,
    minInSeason: rules?.minInSeason ?? template!.minInSeason, clubBonus: rules ? rules.clubBonus : template!.clubBonus,
    averageBonus: rules ? rules.averageBonus : template!.averageBonus, starters, subs };
  // A Room's place depends on nine other teams, not on one score to reach.
  return { ...expectation(custom, template?.group === "Room" ? null : template?.need), estimated: true };
}
