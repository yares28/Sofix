import { z } from "zod";

/**
 * Gems and packs (owner, 29 Oct 2026: "which packs to buy to get icon or star players, or to finish missions"). Everything comes from
 * the odds Sorare publishes for each pack slot (`CardPack.slotGameplayTierOdds`): the share of each tier in the slot and each player's
 * own chance, read 29 Oct from Sorare's schema. Tiers (Sorare's `config.gameplayTierRatings`): GOAT = Icon (5 stars), STAR 4,
 * IMPACT 3, ROSTER 2, DNP = Reserve 1; the `_PLUS` tiers sit just above their tier.
 *
 * The maths, shown on the page as it is worked out:
 *   a slot's hit chance h = the sum of the published odds of the players (or tier) you want;
 *   one pack gives at least one: 1 − Π(1 − h) over its slots, and on average Σ h;
 *   n packs of that kind give at least one: 1 − (1 − pack chance)^n.
 */

export type SlotOdds = { tiers: Record<string, number>; players: Record<string, { p: number; tier: string; team: string | null }> };
/** Pack slug → its slots' odds. */
export type TierOdds = Record<string, SlotOdds[]>;

const Tier = z.object({
  gameplayTier: z.string(),
  probabilityBasisPoint: z.number().min(0).max(10_000),
  playerOdds: z.array(z.object({ probabilityBasisPoint: z.number().min(0).max(10_000), player: z.object({ slug: z.string() }), team: z.object({ slug: z.string() }).nullish() })),
});
const Answer = z.object({ currentUser: z.object({ setBoard: z.object({ myCurrentStep: z.object({ cardPacks: z.array(z.record(z.string(), z.unknown())).nullish() }).nullable() }).nullable() }).nullable() });

/** Sorare's answers (a few slots each) merged into each pack's slots with their tiers. */
export function parseTierOdds(answers: unknown[]): TierOdds {
  const out: TierOdds = {};
  for (const answer of answers) {
    const parsed = Answer.safeParse(answer);
    for (const pack of (parsed.success ? parsed.data.currentUser?.setBoard?.myCurrentStep?.cardPacks : null) ?? []) {
      if (typeof pack.slug !== "string") continue;
      for (const [key, value] of Object.entries(pack)) {
        const index = /^s(\d)$/.exec(key)?.[1];
        const tiers = z.array(Tier).safeParse(value);
        if (index === undefined || !tiers.success || !tiers.data.length) continue;
        const slot: SlotOdds = { tiers: {}, players: {} };
        for (const t of tiers.data) {
          slot.tiers[t.gameplayTier] = (slot.tiers[t.gameplayTier] ?? 0) + t.probabilityBasisPoint / 10_000;
          // Live player weights need not sum to the published tier share. Keep that share fixed for player estimates.
          const total = t.playerOdds.reduce((sum, o) => sum + o.probabilityBasisPoint, 0);
          const scale = total > 0 ? t.probabilityBasisPoint / total : 0;
          for (const o of t.playerOdds) {
            const known = slot.players[o.player.slug];
            slot.players[o.player.slug] = { p: (known?.p ?? 0) + o.probabilityBasisPoint * scale / 10_000, tier: known?.tier ?? t.gameplayTier, team: o.team?.slug ?? known?.team ?? null };
          }
        }
        (out[pack.slug] ??= [])[Number(index)] = slot;
      }
    }
  }
  return out;
}

/** A missing slot is unknown, never an extra zero-probability slot. Allow only basis-point rounding in the tier total. */
export function completePackOdds(slots: SlotOdds[] | undefined, cards: number): slots is SlotOdds[] {
  const full = (values: number[]) => values.every(p => Number.isFinite(p) && p >= 0 && p <= 1) && Math.abs(values.reduce((a, b) => a + b, 0) - 1) < 0.001;
  return cards > 0 && cards <= 10 && slots?.length === cards && Array.from({ length: cards }, (_, i) => slots[i]).every(s =>
    s && full(Object.values(s.tiers)) && full(Object.values(s.players).map(p => p.p)));
}

export const ICON = new Set(["GOAT"]);
export const STAR_OR_BETTER = new Set(["GOAT", "STAR_PLUS", "STAR"]);
export const TIER_GOALS = [
  { key: "icon", label: "Icon", tiers: ICON },
  { key: "star-or-icon", label: "Icon or Star", tiers: STAR_OR_BETTER },
  { key: "star-plus", label: "Star+", tiers: new Set(["STAR_PLUS"]) },
  { key: "star", label: "Star", tiers: new Set(["STAR"]) },
  { key: "impact", label: "Impact", tiers: new Set(["IMPACT_PLUS", "IMPACT"]) },
  { key: "roster", label: "Roster", tiers: new Set(["ROSTER_PLUS", "ROSTER"]) },
  { key: "reserve", label: "Reserve", tiers: new Set(["DNP_PLUS", "DNP"]) },
];

/** What a goal counts: players by slug, by club, by tier; `distinct` counts a player once and never one you own. */
export type Goal = { label: string; need: number; distinct: boolean; tiers?: Set<string>; players?: Set<string>; teams?: Set<string>; owned: Set<string> };
const hits = (goal: Goal, slug: string, info: SlotOdds["players"][string]) =>
  (!goal.tiers || goal.tiers.has(info.tier)) && (!goal.players || goal.players.has(slug)) && (!goal.teams || (info.team !== null && goal.teams.has(info.team)));

/**
 * A collection mission as a goal. It counts a player once and never one you already have: a duplicate, or a special edition of a
 * player whose card you own, counts for nothing (owner, 29 Oct 2026). A club's league is read from your own cards of that club
 * (`leagueOf`); a pack of the mission's league counts any player you do not have.
 */
export function missionGoal(
  mission: { title: string; target: number; progress: number; players: string[]; teams: { slug: string }[]; leagues: string[] },
  packLeague: string | null, owned: Set<string>, leagueOf: Map<string, string>,
): Goal {
  const need = Math.max(0, mission.target - mission.progress);
  if (mission.players.length) return { label: mission.title, need, distinct: true, players: new Set(mission.players), owned };
  const teams = new Set(mission.teams.map((t) => t.slug));
  if (teams.size) return { label: mission.title, need, distinct: true, teams, owned };
  if (packLeague && mission.leagues.includes(packLeague)) return { label: mission.title, need, distinct: true, owned };
  for (const [team, league] of leagueOf) if (mission.leagues.includes(league)) teams.add(team);
  return { label: mission.title, need, distinct: true, teams, owned };
}

export type PackRow = { slug: string; title: string; league: string | null; price: number; currency: string; slots: number[]; atLeastOne: number; certain: boolean; expected: number; perHit: number | null; players?: Record<string, number> };

/** One pack against a goal: each slot's hit chance, the chance of at least one, the average and the price per hit. */
export function packRow(pack: { slug: string; title: string; league: string | null; price: number; currency: string }, slots: SlotOdds[], goal: Goal): PackRow {
  const per = slots.map((slot) => {
    const chance = goal.tiers && !goal.players && !goal.teams && !goal.distinct
      ? [...goal.tiers].reduce((sum, t) => sum + (slot.tiers[t] ?? 0), 0)
      : Object.entries(slot.players).reduce((sum, [slug, info]) => sum + (hits(goal, slug, info) && !(goal.distinct && goal.owned.has(slug)) ? info.p : 0), 0);
    return Math.min(1, Math.max(0, chance));
  });
  const atLeastOne = 1 - per.reduce((m, h) => m * (1 - h), 1);
  // A distinct goal counts a player once even when two slots could draw him: Σ over players of 1 − Π(1 − his chance in each slot).
  const players: Record<string, number> = {};
  if (goal.distinct) for (const slug of new Set(slots.flatMap(s => Object.keys(s.players)))) {
      const info = slots.map((s) => s.players[slug]).find(Boolean)!;
      const p = 1 - slots.reduce((m, s) => m * (1 - (s.players[slug]?.p ?? 0)), 1);
      if (p > 0 && hits(goal, slug, info) && !goal.owned.has(slug)) players[slug] = p;
  }
  const expected = goal.distinct ? Object.values(players).reduce((a, b) => a + b, 0) : per.reduce((a, b) => a + b, 0);
  return { ...pack, slots: per, atLeastOne, certain: per.some(h => h >= 1), expected, perHit: expected > 0 ? pack.price / expected : null, ...(goal.distinct ? { players } : {}) };
}

export type GemPlan = { buys: { slug: string; title: string; league: string | null; count: number; price: number }[]; spent: number; atLeastOne: number; certain: boolean; expected: number };

export type PackBundle = { packs: number; cards: number; costs: Record<string, number>; atLeastOne: number; none: number; certain: boolean; expected: number };

/** Independent mixed packs. Distinct-player expectations use the union across every pack type, not a sum of unique counts. */
export function openBundle(picks: { row: PackRow; count: number }[]): PackBundle {
  let packs = 0, cards = 0, logMiss = 0, certain = false, expected = 0;
  const costs: Record<string, number> = {}, playerMiss = new Map<string, number>();
  for (const { row, count } of picks) {
    if (!Number.isSafeInteger(count) || count < 0) throw new RangeError("Pack quantities must be non-negative integers");
    if (!count) continue;
    packs += count; cards += row.slots.length * count;
    costs[row.currency] = (costs[row.currency] ?? 0) + row.price * count;
    logMiss += count * row.slots.reduce((sum, h) => sum + Math.log1p(-h), 0);
    certain ||= row.certain;
    if (row.players) for (const [slug, p] of Object.entries(row.players)) playerMiss.set(slug, (playerMiss.get(slug) ?? 0) + count * Math.log1p(-p));
    else expected += count * row.expected;
  }
  expected += [...playerMiss.values()].reduce((sum, log) => sum - Math.expm1(log), 0);
  return { packs, cards, costs, atLeastOne: -Math.expm1(logMiss) || 0, none: Math.exp(logMiss), certain, expected };
}

/**
 * What to buy with a budget of one currency (gems or essence) for the best chance of at least one hit: each pack's worth is
 * -ln(1 - its chance), added over independent packs. Integer dynamic programming compares every affordable combination;
 * the expected count breaks equal-probability ties. Divide costs by their GCD to keep real pack budgets small.
 */
export function spendGems(rows: PackRow[], gems: number, currency = "COMMON_GEM"): GemPlan {
  const limit = Math.min(1_000_000, Math.max(0, Math.floor(gems) || 0));
  const options = rows.filter(r => r.currency === currency && Number.isInteger(r.price) && r.price > 0 && r.price <= limit && r.atLeastOne > 0);
  if (!options.length) return { buys: [], spent: 0, atLeastOne: 0, certain: false, expected: 0 };
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const unit = options.reduce((a, r) => gcd(a, r.price), 0) || 1;
  const size = Math.floor(limit / unit);
  const value = new Float64Array(size + 1), average = new Float64Array(size + 1), choice = new Int32Array(size + 1).fill(-1);
  for (let b = 1; b <= size; b++) {
    value[b] = value[b - 1]!; average[b] = average[b - 1]!;
    for (let i = 0; i < options.length; i++) {
      const row = options[i]!, cost = row.price / unit;
      if (cost > b) continue;
      const score = value[b - cost]! - row.slots.reduce((sum, h) => sum + Math.log1p(-h), 0), mean = average[b - cost]! + row.expected;
      if (score > value[b]! || (score === value[b] && mean > average[b]!)) {
        value[b] = score; average[b] = mean; choice[b] = i;
      }
    }
  }
  const buys = new Map<string, GemPlan["buys"][number]>();
  for (let b = size; b > 0;) {
    const i = choice[b]!;
    if (i < 0) { b--; continue; }
    const r = options[i]!;
    b -= r.price / unit;
    const buy = buys.get(r.slug) ?? { slug: r.slug, title: r.title, league: r.league, count: 0, price: r.price };
    buys.set(r.slug, { ...buy, count: buy.count + 1 });
  }
  const result = openBundle([...buys.values()].map(b => ({ row: options.find(r => r.slug === b.slug)!, count: b.count })));
  return { buys: [...buys.values()].sort((a, b) => b.count * b.price - a.count * a.price), spent: result.costs[currency] ?? 0, atLeastOne: result.atLeastOne, certain: result.certain, expected: result.expected };
}

/**
 * n packs of one kind opened (owner, 29 Oct: "his odds after opening 50 bronze packs with 50k essence, or 10 gold"): the chance of at
 * least one hit, 1 − Π(1 − h)ⁿ over the slots, and the hits on average. A goal counting each player once counts a player drawn twice
 * once: Σ over players of 1 − (1 − q)ⁿ, q his chance in one pack.
 */
export function openMany(slots: SlotOdds[], goal: Goal, n: number): { atLeastOne: number; certain: boolean; expected: number } {
  const one = packRow({ slug: "", title: "", league: null, price: 0, currency: "" }, slots, goal);
  const atLeastOne = 1 - (1 - one.atLeastOne) ** n;
  const certain = n > 0 && one.certain;
  if (!goal.distinct) return { atLeastOne, certain, expected: one.expected * n };
  let expected = 0;
  for (const slug of new Set(slots.flatMap((s) => Object.keys(s.players)))) {
    const info = slots.map((s) => s.players[slug]).find(Boolean)!;
    if (!hits(goal, slug, info) || goal.owned.has(slug)) continue;
    const q = 1 - slots.reduce((m, s) => m * (1 - (s.players[slug]?.p ?? 0)), 1);
    expected += 1 - (1 - q) ** n;
  }
  return { atLeastOne, certain, expected };
}

function random(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * How many packs of one kind a mission needs: packs are opened one after another, each slot drawing a player at Sorare's odds, until the
 * goal's `need` is met. Over 2,000 runs (fixed seed): the chance to finish within `budget` packs, and the packs that finish it in half
 * and in nine of ten runs (null past 200 packs).
 */
export function packsToFinish(slots: SlotOdds[], goal: Goal, budget: number, runs = 2000): { withinBudget: number; half: number | null; nine: number | null } {
  if (goal.need <= 0) return { withinBudget: 1, half: 0, nine: 0 };
  if (goal.distinct && Object.keys(packRow({ slug: "", title: "", league: null, price: 0, currency: "" }, slots, goal).players ?? {}).length < goal.need) return { withinBudget: 0, half: null, nine: null };
  const next = random(11);
  const draws = slots.map((s) => {
    const entries = Object.entries(s.players).filter(([slug, info]) => hits(goal, slug, info) && !(goal.distinct && goal.owned.has(slug)) && info.p > 0);
    let sum = 0;
    return { cum: entries.map(([, info]) => (sum += info.p)), entries };
  });
  const finished: number[] = [];
  for (let r = 0; r < runs; r++) {
    const seen = new Set(goal.owned);
    let got = 0;
    let packs = 0;
    while (got < goal.need && packs < 200) {
      packs += 1;
      for (const { cum, entries } of draws) {
        const u = next();
        let lo = 0, hi = cum.length;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (u < cum[mid]!) hi = mid; else lo = mid + 1; }
        const i = lo;
        if (i >= entries.length) continue;
        const [slug, info] = entries[i]!;
        if (!hits(goal, slug, info) || (goal.distinct && seen.has(slug))) continue;
        seen.add(slug);
        got += 1;
      }
    }
    finished.push(got >= goal.need ? packs : Infinity);
  }
  finished.sort((a, b) => a - b);
  const at = (q: number) => { const v = finished[Math.ceil(q * runs) - 1]!; return Number.isFinite(v) ? v : null; };
  return { withinBudget: finished.filter((p) => p <= budget).length / runs, half: at(0.5), nine: at(0.9) };
}
