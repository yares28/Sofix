import { chanceOf, type ArcadeGame, type ArcadeStep } from "./arcade";
import type { Climb, ClimbStart, Move } from "./arcadeClimb";
import { chanceOf as totalsChance, fits, likely, predicted, type Lineup, type Outlook, type Slot, type StepInfo } from "./arcadePlan";
import { clubsToBuildAround, firstDays, type PlayerStatus } from "./arcadeTeams";

/**
 * The dock's Arcade tab (plans/dock-v2.md): what the extension's engine hands sorare.com, worked out from the same climb as the Arcade
 * page. Pure, so every case the dock must say (lineups out, benched, not in squad, a changed plan) is tested here.
 */

export const DOCK_MODEL_VERSION = 1;
/** From this long before a kick-off of the plan or of an entered lineup, the elevens are read again every few minutes. */
export const WATCH_BEFORE_MS = 75 * 60_000;
export const WATCH_EVERY_MS = 5 * 60_000;

/** Whose start % a card shows: the announced eleven, else Futbol Fantasy, Sorare or Sofix. */
export type DockSource = "lineup" | "futbolfantasy" | "sorare" | "sofix" | null;
/** Where an announced eleven puts him: starting, on the bench, or on neither list (not in the squad). */
export type DockSheet = "starter" | "bench" | "out" | null;

export type DockCard = {
  slug: string;
  player: string;
  name: string;
  pic: string | null;
  slot: Slot;
  captain: boolean;
  points: number | null;
  start: number | null;
  source: DockSource;
  sheet: DockSheet;
  kickoff: string;
  club: string | null;
};
export type DockLineup = { key: string; first: string; last: string; p: number; x: number; target: number; step: number; play: number; cards: DockCard[]; alternatives: Record<string, DockCard[]> };
export type DockClub = { club: string; name: string; crest: string | null; kickoff: string; likely: number; value: number };
export type DockAlert = { step: number; names: string[]; kickoff: string };
export type DockLineupsOut = { announced: string[]; waiting: string[]; unread: string[]; checkedAt: number | null; limited: boolean; retryAt: number | null; outdated: boolean };

export type ArcadeDockModel = {
  v: number;
  /** ready: the climb; rough: the best lineup for the step alone (the climb ran out of time); the rest say why there is no lineup. */
  state: "ready" | "rough" | "no-games" | "no-set" | "no-board" | "ended";
  at: number;
  set: { name: string; end: string | null };
  step: { number: number; target: number; lives: number; max: number; of: number; reward: string | null };
  aim: number;
  next: DockLineup | null;
  best: DockLineup[];
  clubs: DockClub[];
  lineupsOut: DockLineupsOut;
  /** False when Sofix could not be reached: the numbers are Sorare's only. */
  sofix: boolean;
  change: { text: string; at: number } | null;
  alerts: DockAlert[];
  /** Future kick-offs of the plan's next lineup and of your entered lineups: the watch reads elevens near these. */
  kickoffs: number[];
};

export type DockElevens = { games: string[]; unread: string[]; checked: string[]; bench: Record<string, string[]>; chances: Record<string, Record<string, [number, number]>>; at: number | null; limited: boolean; outdated: boolean };

export type DockInput = {
  outlooks: Outlook[];
  steps: StepInfo[];
  boardSteps: Pick<ArcadeStep, "number" | "target" | "rewards" | "lineups" | "entered" | "state">[];
  start: ClimbStart;
  current: number;
  aim: number | null;
  captainBonus: number;
  now: number;
  set: { name: string; end: string | null };
  games: ArcadeGame[];
  status: Record<string, PlayerStatus>;
  elevens: DockElevens;
  sofix: boolean;
  prev: ArcadeDockModel | null;
};

const ROUND = (n: number) => Math.round(n);
const sourceOf = (o: Outlook): DockSource => (o.confirmed ? "lineup" : o.startSource);
export const gameName = (g: Pick<ArcadeGame, "home" | "away">) => `${g.home?.name ?? "?"}–${g.away?.name ?? "?"}`;

/** Where the announced eleven puts this card's player, or null when his side has not been announced. */
export function sheetOf(o: Outlook, elevens: Pick<DockElevens, "chances" | "bench">): DockSheet {
  const read = chanceOf(elevens.chances, o.game.id, o.card.player);
  if (!read) return null;
  if (read.percent >= 100) return "starter";
  return (elevens.bench[o.game.id] ?? []).includes(o.card.player) ? "bench" : "out";
}

function dockCard(o: Outlook, slot: Slot, captain: boolean, captainBonus: number, elevens: DockElevens): DockCard {
  const points = predicted(o, captain, captainBonus);
  return {
    slug: o.card.slug, player: o.card.player, name: o.card.name, pic: o.card.picture, slot, captain,
    points: points === null ? null : Math.round(points * 10) / 10, start: o.start, source: sourceOf(o), sheet: sheetOf(o, elevens),
    kickoff: o.game.kickoff, club: o.card.team,
  };
}

/** Two cards of the same window that could take each slot instead, likely starters first, best first; one per player. */
function alternativesOf(lineup: Lineup, pool: Outlook[], captainBonus: number, elevens: DockElevens): Record<string, DockCard[]> {
  const used = new Set(lineup.picks.map((p) => p.outlook.card.player));
  const out: Record<string, DockCard[]> = {};
  for (const pick of lineup.picks) {
    const seen = new Set<string>();
    const options = pool
      .filter((o) => !used.has(o.card.player) && fits(o.card, pick.slot) && predicted(o) !== null)
      .sort((a, b) => Number(likely(b)) - Number(likely(a)) || predicted(b)! - predicted(a)!)
      .filter((o) => (seen.has(o.card.player) ? false : (seen.add(o.card.player), true)))
      .slice(0, 2);
    out[pick.outlook.card.slug] = options.map((o) => dockCard(o, pick.slot, false, captainBonus, elevens));
  }
  return out;
}

const keyOf = (l: Lineup) => l.picks.map((p) => p.outlook.card.slug).sort().join(",");

function dockLineup(lineup: Lineup, p: number, step: number, target: number, play: number, pool: Outlook[], captainBonus: number, elevens: DockElevens): DockLineup {
  return {
    key: keyOf(lineup), first: lineup.first, last: lineup.last, p, x: ROUND(lineup.expected), target, step, play,
    cards: lineup.picks.map((pick) => dockCard(pick.outlook, pick.slot, pick.captain, captainBonus, elevens)),
    alternatives: alternativesOf(lineup, pool, captainBonus, elevens),
  };
}

/** A move's first lineup, with the chance the move's lineups give (one of them clears). */
const fromMove = (move: Move, input: DockInput, pool: Outlook[]) => {
  const lineup = move.lineups[0];
  const target = input.steps.find((s) => s.number === move.step)?.target ?? 0;
  return lineup ? dockLineup(lineup, move.clear, move.step, target, move.play, pool, input.captainBonus, input.elevens) : null;
};

/** The step the "best to clear" list aims at: your aim from the Arcade page when it is a step still to clear, else the current one. */
export function dockAim(input: Pick<DockInput, "aim" | "current" | "boardSteps">): number {
  const open = (n: number) => input.boardSteps.some((s) => s.number === n && !["CLAIMED", "CLAIMABLE"].includes(s.state));
  return input.aim !== null && input.aim >= input.current && open(input.aim) ? input.aim : input.current;
}

/** Why the plan's next lineup changed since the last one, in one line; null when it did not. `sheet` says where an eleven put a player. */
export function changeLine(prev: DockLineup | null, next: DockLineup | null, sheet: (player: string) => DockSheet = () => null): string | null {
  if (!prev || !next) return null;
  const was = new Set(prev.cards.map((c) => c.player));
  const now = new Set(next.cards.map((c) => c.player));
  const out = prev.cards.filter((c) => !now.has(c.player));
  const into = next.cards.filter((c) => !was.has(c.player));
  const odds = Math.round(prev.p * 100) === Math.round(next.p * 100) ? "" : `${Math.round(prev.p * 100)}% → ${Math.round(next.p * 100)}%`;
  if (!out.length && !into.length) return odds && Math.abs(prev.p - next.p) >= 0.03 ? `Chance ${odds}` : null;
  const why = (c: DockCard) => { const s = sheet(c.player); return s === "bench" ? " benched" : s === "out" ? " not in squad" : ""; };
  const lineupsOut = out.some((c) => why(c));
  const swap = `${out.map((c) => `${shortName(c.name)}${why(c)}`).join(", ")} → ${into.map((c) => shortName(c.name)).join(", ")} in`;
  return `${lineupsOut ? "Lineups out: " : "Plan changed: "}${swap}${odds ? ` · ${odds}` : ""}`;
}

const shortName = (name: string) => name.split(" ").slice(-1)[0] ?? name;

/** Your entered lineups still to kick off with a card the announced eleven leaves out. */
export function alertsOf(boardSteps: DockInput["boardSteps"], elevens: DockElevens, now: number): DockAlert[] {
  const alerts: DockAlert[] = [];
  for (const step of boardSteps) {
    for (const lineup of step.entered) {
      if (lineup.cancelled || lineup.draft) continue;
      const names = lineup.cards.filter((c) => c.player && c.game && c.kickoff && Date.parse(c.kickoff) > now && chanceOf(elevens.chances, c.game, c.player)?.percent === 0).map((c) => c.name ?? c.player!);
      const first = lineup.cards.map((c) => c.kickoff).filter((k): k is string => !!k && Date.parse(k) > now).sort()[0];
      if (names.length && first) alerts.push({ step: step.number, names, kickoff: first });
    }
  }
  return alerts;
}

function lineupsOutOf(input: DockInput): DockLineupsOut {
  const name = (id: string) => { const g = input.games.find((x) => x.id === id); return g ? gameName(g) : id; };
  const e = input.elevens;
  const waiting = e.checked.filter((id) => !e.games.includes(id) && !e.unread.includes(id));
  return {
    announced: e.games.map(name), waiting: waiting.map(name), unread: e.unread.map(name), checkedAt: e.at, limited: e.limited,
    retryAt: e.unread.length && e.at !== null ? e.at + WATCH_EVERY_MS : null, outdated: e.outdated,
  };
}

/** The dock's model from the climb (or, when it ran out of time, one lineup for the step alone: `rough`). */
export function buildDock(input: DockInput, climb: Pick<Climb, "path" | "week"> | null, rough: Lineup | null = null): ArcadeDockModel {
  const step = input.boardSteps.find((s) => s.number === input.current);
  const info = input.steps.find((s) => s.number === input.current);
  const aim = dockAim(input);
  const pool = input.outlooks.filter((o) => Date.parse(o.game.kickoff) > input.now);
  const sheets = new Map<string, DockSheet>();
  for (const o of input.outlooks) { const sheet = sheetOf(o, input.elevens); if (sheet) sheets.set(o.card.player, sheet); }
  const target = (n: number) => input.steps.find((s) => s.number === n)?.target ?? 0;

  let next: DockLineup | null = null;
  let best: DockLineup[] = [];
  if (climb) {
    next = climb.path[0] ? fromMove(climb.path[0], input, pool) : null;
    // The week's likeliest can miss the lineup the climb plays next (14 Nov 2026: next 41%, best 14% on his board): it joins them.
    const week = (climb.week.best[aim] ?? []).map((m) => fromMove(m, input, pool)).filter((l): l is DockLineup => !!l);
    const all = next && next.step === aim ? [next, ...week] : week;
    best = [...new Map(all.map((l) => [l.key, l])).values()].sort((a, b) => b.p - a.p).slice(0, 5);
  } else if (rough) {
    next = dockLineup(rough, totalsChance(rough.totals, target(input.current)), input.current, target(input.current), 1, pool, input.captainBonus, input.elevens);
  }
  const outlookMap = new Map<string, Outlook[]>();
  for (const o of pool) outlookMap.set(o.game.id, [...(outlookMap.get(o.game.id) ?? []), o]);
  const clubs = firstDays(clubsToBuildAround(outlookMap, input.games, input.status, input.now, input.now + 3 * 86_400_000), 2).slice(0, 3)
    .map((c) => ({ club: c.club, name: c.name, crest: c.crest, kickoff: c.game.kickoff, likely: c.likely, value: Math.round(c.value) }));
  const alerts = alertsOf(input.boardSteps, input.elevens, input.now);
  const kickoffs = [...new Set([
    ...(next?.cards.map((c) => Date.parse(c.kickoff)) ?? []),
    ...input.boardSteps.flatMap((s) => s.entered.filter((l) => !l.cancelled && !l.draft).flatMap((l) => l.cards.map((c) => (c.kickoff ? Date.parse(c.kickoff) : 0)))),
  ])].filter((t) => t > input.now).sort((a, b) => a - b).slice(0, 20);
  const said = changeLine(input.prev?.next ?? null, next, (player) => sheets.get(player) ?? null);
  const state: ArcadeDockModel["state"] = !input.boardSteps.length ? "no-board" : input.set.end && Date.parse(input.set.end) < input.now ? "ended" : !pool.length ? "no-games" : climb ? "ready" : rough ? "rough" : "no-games";
  return {
    v: DOCK_MODEL_VERSION, state, at: input.now, set: input.set,
    step: { number: input.current, target: info?.target ?? step?.target ?? 0, lives: info?.lives ?? 0, max: step?.lineups?.max ?? 4, of: input.boardSteps.length, reward: step?.rewards.join(" + ") || null },
    aim, next, best, clubs, lineupsOut: lineupsOutOf(input), sofix: input.sofix,
    change: said ? { text: said, at: input.now } : input.prev?.change && input.prev.next?.key === next?.key ? input.prev.change : null,
    alerts, kickoffs,
  };
}

/** Whether the watch should read elevens now: a kick-off of the plan or of an entered lineup is within WATCH_BEFORE_MS. */
export function watchDue(model: Pick<ArcadeDockModel, "kickoffs"> | null, lastRun: number, now: number): boolean {
  if (!model || now - lastRun < WATCH_EVERY_MS - 30_000) return false;
  return model.kickoffs.some((t) => t > now && t - now <= WATCH_BEFORE_MS);
}
