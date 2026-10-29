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
  probabilityBasisPoint: z.number(),
  playerOdds: z.array(z.object({ probabilityBasisPoint: z.number(), player: z.object({ slug: z.string() }), team: z.object({ slug: z.string() }).nullish() })),
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
          for (const o of t.playerOdds) {
            const known = slot.players[o.player.slug];
            slot.players[o.player.slug] = { p: (known?.p ?? 0) + o.probabilityBasisPoint / 10_000, tier: known?.tier ?? t.gameplayTier, team: o.team?.slug ?? known?.team ?? null };
          }
        }
        (out[pack.slug] ??= [])[Number(index)] = slot;
      }
    }
  }
  for (const slug of Object.keys(out)) out[slug] = out[slug]!.filter(Boolean);
  return out;
}

export const ICON = new Set(["GOAT"]);
export const STAR_OR_BETTER = new Set(["GOAT", "STAR_PLUS", "STAR"]);

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
  if (packLeague && mission.leagues.includes(packLeague)) return { label: mission.title, need, distinct: true, owned };
  const teams = new Set(mission.teams.map((t) => t.slug));
  for (const [team, league] of leagueOf) if (mission.leagues.includes(league)) teams.add(team);
  return { label: mission.title, need, distinct: true, teams, owned };
}

export type PackRow = { slug: string; title: string; league: string | null; price: number; currency: string; slots: number[]; atLeastOne: number; expected: number; perHit: number | null };

/** One pack against a goal: each slot's hit chance, the chance of at least one, the average and the price per hit. */
export function packRow(pack: { slug: string; title: string; league: string | null; price: number; currency: string }, slots: SlotOdds[], goal: Goal): PackRow {
  const per = slots.map((slot) => {
    if (goal.tiers && !goal.players && !goal.teams && !goal.distinct) return [...goal.tiers].reduce((sum, t) => sum + (slot.tiers[t] ?? 0), 0);
    return Object.entries(slot.players).reduce((sum, [slug, info]) => sum + (hits(goal, slug, info) && !(goal.distinct && goal.owned.has(slug)) ? info.p : 0), 0);
  });
  const atLeastOne = 1 - per.reduce((m, h) => m * (1 - h), 1);
  // A distinct goal counts a player once even when two slots could draw him: Σ over players of 1 − Π(1 − his chance in each slot).
  const expected = goal.distinct
    ? [...new Set(slots.flatMap((s) => Object.keys(s.players)))].reduce((sum, slug) => {
      const info = slots.map((s) => s.players[slug]).find(Boolean)!;
      if (!hits(goal, slug, info) || goal.owned.has(slug)) return sum;
      return sum + 1 - slots.reduce((m, s) => m * (1 - (s.players[slug]?.p ?? 0)), 1);
    }, 0)
    : per.reduce((a, b) => a + b, 0);
  return { ...pack, slots: per, atLeastOne, expected, perHit: expected > 0 ? pack.price / expected : null };
}

export type GemPlan = { buys: { slug: string; title: string; league: string | null; count: number; price: number }[]; spent: number; atLeastOne: number; expected: number };

/**
 * What to buy with your gems for the best chance of at least one hit: each pack's worth per gem is −ln(1 − its chance)/price (the
 * chances of independent packs multiply), so the best pack is bought while you can afford it, then the next best with what is left.
 */
export function spendGems(rows: PackRow[], gems: number): GemPlan {
  const worth = (r: PackRow) => (r.atLeastOne >= 1 ? Infinity : -Math.log(1 - r.atLeastOne) / r.price);
  const options = rows.filter((r) => r.currency === "COMMON_GEM" && r.price > 0 && r.atLeastOne > 0).sort((a, b) => worth(b) - worth(a) || a.price - b.price);
  const buys = new Map<string, GemPlan["buys"][number]>();
  let left = gems, miss = 1, expected = 0;
  for (const r of options) {
    while (left >= r.price) {
      left -= r.price;
      miss *= 1 - r.atLeastOne;
      expected += r.expected;
      const b = buys.get(r.slug) ?? { slug: r.slug, title: r.title, league: r.league, count: 0, price: r.price };
      buys.set(r.slug, { ...b, count: b.count + 1 });
    }
  }
  return { buys: [...buys.values()], spent: gems - left, atLeastOne: 1 - miss, expected };
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
  const next = random(11);
  const draws = slots.map((s) => {
    const entries = Object.entries(s.players);
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
        const i = cum.findIndex((c) => u < c);
        if (i < 0) continue;
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
