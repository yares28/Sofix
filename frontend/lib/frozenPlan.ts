import type { GameweekPlan, Sorare } from "./play";

/** Frozen records intentionally omit art and entry options. Restore only presentation, never later forecasts. */
export function restoreFrozenPlan(week: GameweekPlan, data: Sorare): GameweekPlan {
  const cards = new Map((data.collection ?? []).map((c) => [c.slug, c]));
  const players = new Map(data.weeks.flatMap((w) => w.playing.players).map((p) => [p.player, p]));
  const knownCards = new Map(data.weeks.flatMap((w) => w.plans.flatMap((p) => p.lineups.flatMap((l) => [...l.starters, ...l.subs]))).map((c) => [c.slug, c]));
  return { ...week, playable: [], blocked: [], notWorth: [],
    playing: { ...week.playing, players: week.playing.players.map((p) => {
      const art = players.get(p.player) ?? [...cards.values()].find((c) => c.player === p.player);
      return { ...p, pic: art?.pic ?? "", avatar: players.get(p.player)?.avatar ?? "", crest: players.get(p.player)?.crest ?? null };
    }) },
    plans: week.plans.map((p) => ({ ...p, lineups: p.lineups.map((l) => ({ ...l,
      starters: l.starters.map((c) => ({ ...c, pic: cards.get(c.slug)?.pic ?? knownCards.get(c.slug)?.pic ?? "" })),
      subs: l.subs.map((c) => ({ ...c, pic: cards.get(c.slug)?.pic ?? knownCards.get(c.slug)?.pic ?? "" })),
    })) })),
  };
}
