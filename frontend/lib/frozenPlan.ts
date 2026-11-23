import type { GameweekPlan, Sorare } from "./play";

/** Frozen records intentionally omit art and entry options. Restore only presentation, never later forecasts. */
export function restoreFrozenPlan(week: GameweekPlan, data: Sorare): GameweekPlan {
  // Each club's crest by its name, from the weeks and market rows the payload still draws: the frozen copy kept no game's crests,
  // so your own cards in the week in play showed a shield for their opponent (23 Nov 2026). A club seen nowhere keeps none.
  const crests = new Map<string, string>();
  const keep = (club: string | null | undefined, crest: string | null | undefined) => { if (club && crest && !crests.has(club)) crests.set(club, crest); };
  for (const p of data.weeks.flatMap((w) => w.playing.players)) for (const g of p.games) { keep(g.team, g.teamCrest); keep(g.opponent, g.opponentCrest); }
  for (const row of data.market ?? []) {
    keep(row.club, row.crest);
    for (const f of [row.fixture, row.next?.fixture, row.now?.fixture]) if (f) { keep(f.team, f.teamCrest); keep(f.opponent, f.opponentCrest); }
  }
  const cards = new Map((data.collection ?? []).map((c) => [c.slug, c]));
  const players = new Map(data.weeks.flatMap((w) => w.playing.players).map((p) => [p.player, p]));
  const knownCards = new Map(data.weeks.flatMap((w) => w.plans.flatMap((p) => p.lineups.flatMap((l) => [...l.starters, ...l.subs]))).map((c) => [c.slug, c]));
  return { ...week, playable: [], blocked: [], notWorth: [],
    playing: { ...week.playing, players: week.playing.players.map((p) => {
      const art = players.get(p.player) ?? [...cards.values()].find((c) => c.player === p.player);
      const games = p.games.map((g) => ({ ...g, teamCrest: g.teamCrest ?? crests.get(g.team ?? "") ?? null, opponentCrest: g.opponentCrest ?? crests.get(g.opponent) ?? null }));
      return { ...p, games, pic: art?.pic ?? "", avatar: players.get(p.player)?.avatar ?? "", crest: players.get(p.player)?.crest ?? null };
    }) },
    plans: week.plans.map((p) => ({ ...p, lineups: p.lineups.map((l) => ({ ...l,
      starters: l.starters.map((c) => ({ ...c, pic: cards.get(c.slug)?.pic ?? knownCards.get(c.slug)?.pic ?? "" })),
      subs: l.subs.map((c) => ({ ...c, pic: cards.get(c.slug)?.pic ?? knownCards.get(c.slug)?.pic ?? "" })),
    })) })),
    // The Pro boards' groups are your cards too: their art comes back the same way.
    ...(week.pro ? { pro: week.pro.map((b) => ({ ...b, windows: b.windows.map((w) => ({ ...w,
      starters: w.starters.map((c) => ({ ...c, pic: cards.get(c.slug)?.pic ?? knownCards.get(c.slug)?.pic ?? "" })) })) })) } : {}),
  };
}
