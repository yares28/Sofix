import type { GameweekLineup } from "./entered";
import type { enteredScore } from "./lineupScores";
import type { Plan } from "./play";

export type PortfolioCard = { slug: string; name: string; pic: string };
export type Portfolio = {
  lineups: number; rated: number; expectedPaid: number | null; noReward: number | null;
  averagePoints: number | null; estimated: boolean; cards: PortfolioCard[];
  pAny?: number; essence?: number; cash?: number; fees?: number;
};
type Forecast = ReturnType<typeof enteredScore>;
const validChance = (n: number | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
const preview = (cards: PortfolioCard[]) => cards.filter((c,i) => cards.findIndex(p => p.slug === c.slug) === i).slice(0,5);

/** Expected paid lineups add marginal chances; average lineup risk needs no portfolio-independence assumption. */
function summary(forecasts: Forecast[], cards: PortfolioCard[]): Portfolio {
  const chances = forecasts.map(f => f.chance).filter(validChance);
  const scores = forecasts.map(f => f.value).filter((n): n is number => n !== null && Number.isFinite(n));
  const complete = forecasts.length > 0 && chances.length === forecasts.length;
  const expected = complete ? chances.reduce((sum,p) => sum + p, 0) : null;
  return { lineups: forecasts.length, rated: chances.length, expectedPaid: expected,
    noReward: expected === null ? null : 1 - expected / forecasts.length,
    averagePoints: scores.length === forecasts.length && scores.length ? scores.reduce((sum,x) => sum + x, 0) / scores.length : null,
    estimated: forecasts.some(f => f.estimated), cards: preview(cards) };
}

export function enteredPortfolio(lineups: GameweekLineup[], forecasts: Map<string, Forecast>): Portfolio {
  const entered = lineups.filter(l => !l.draft);
  return summary(entered.map(l => forecasts.get(l.id) ?? { value: null, estimated: false }), entered.flatMap(l => l.cards.map(c => ({ slug: c.slug, name: c.name, pic: c.picture ?? "" }))));
}

export function planPortfolio(plan: Plan | null | undefined): Portfolio {
  const result = summary((plan?.lineups ?? []).map(l => ({ value: l.x, chance: l.pReturn, estimated: false })), (plan?.lineups ?? []).flatMap(l => l.starters.map(c => ({ slug: c.slug, name: c.name, pic: c.pic }))));
  return plan ? { ...result, pAny: validChance(plan.pAny) ? plan.pAny : undefined, essence: Number.isFinite(plan.essence) ? plan.essence : undefined, cash: Number.isFinite(plan.cash) ? plan.cash : undefined, fees: plan.fees } : result;
}
