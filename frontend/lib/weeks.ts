/**
 * One week, for every page.
 *
 * The board counts LaLiga rounds and Sorare counts its own game weeks, and they are not the same number:
 * LaLiga's MD8 is 9–12 Oct while Sorare's GW17 is 25–29 Sep, and most weeks of a season carry only one of the
 * two. A week is what they share, so the app's selector picks a week and each page resolves what it holds:
 * the board its matchday, Play its gameweek.
 *
 * Pure: the grid and the Sorare payload are read, nothing is fetched or invented. A week the job has not
 * planned simply has no `gw`, and the page says Sorare has not opened it yet.
 */

import type { FixtureGrid, GridMatchday } from "./types";
import type { GameweekPlan, Sorare } from "./play";

export type WeekState = "done" | "live" | "next" | "later";

export type Week = {
  /** The week's own address, used as `?w=` — its first day, which never collides between the two systems. */
  id: string;
  from: string;
  to: string;
  state: WeekState;
  /** The LaLiga round inside this week, and its column in the grid. */
  md: number | null;
  column: number | null;
  finished: boolean;
  /** Sorare's game week, when it has opened one. */
  gw: string | null;
  number: number | null;
  /** What the job knows about it: only ever set for a gameweek it planned. */
  cards: number;
  plans: number;
  essence: number | null;
  /** Essence our own replayed plan would have won — never what the owner actually entered. */
  replay: number | null;
  source: "sorare" | "form" | null;
};

// en-GB writes "Sept"; the app writes three letters everywhere else, so the months are spelled here.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const madrid = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", timeZone: "Europe/Madrid" });
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Europe/Madrid" });
const dayMonth = (iso: string) => {
  const [d, m] = madrid.format(new Date(iso)).split("/");
  return { day: Number(d), month: MONTHS[Number(m) - 1]! };
};

const day = (iso: string) => iso.slice(0, 10);
const at = (iso: string) => new Date(iso).getTime();

/** Every week of the season, oldest first: each LaLiga round, each Sorare game week, merged where they overlap. */
export function seasonWeeks(grid: FixtureGrid | null, sorare: Sorare | null, now: Date): Week[] {
  const rounds: GridMatchday[] = (grid?.matchdays ?? []).filter((md) => md.date_from);
  const planned = new Map((sorare?.weeks ?? []).map((week) => [week.gameweek.id, week]));
  const timeline = sorare?.timeline ?? [];
  const taken = new Set<string>();
  const weeks: Week[] = [];

  const fromSorare = (id: string): Partial<Week> => {
    const week: GameweekPlan | undefined = planned.get(id);
    if (!week) return { cards: 0, plans: 0, essence: null, replay: null, source: null };
    const best = week.plans[0];
    return {
      cards: week.playing.cards,
      plans: week.plans.length,
      essence: week.played ? null : (best?.essence ?? null),
      replay: week.played ? (best?.actual?.essence ?? 0) : null,
      source: week.source,
    };
  };

  for (const round of rounds) {
    // Half-open [start, end): a Sorare week ends where the next begins, so a Monday round belongs to one of them.
    const week = timeline.find((item) => at(round.date_from!) >= at(item.start) && at(round.date_from!) < at(item.end));
    if (week) taken.add(week.id);
    weeks.push({
      id: day(week ? week.start : round.date_from!),
      from: week ? week.start : round.date_from!,
      to: week ? week.end : (round.date_to ?? round.date_from!),
      state: stateOf(week ? week.start : round.date_from!, week ? week.end : (round.date_to ?? round.date_from!), sorare, week?.id, now),
      md: round.number,
      column: (grid?.matchdays ?? []).indexOf(round),
      finished: Boolean(round.finished),
      gw: week?.id ?? null,
      number: week?.number ?? null,
      ...({ cards: 0, plans: 0, essence: null, replay: null, source: null } as Partial<Week>),
      ...(week ? fromSorare(week.id) : {}),
    } as Week);
  }

  for (const item of timeline) {
    if (taken.has(item.id)) continue;
    weeks.push({
      id: day(item.start),
      from: item.start,
      to: item.end,
      state: stateOf(item.start, item.end, sorare, item.id, now),
      md: null,
      column: null,
      finished: at(item.end) < now.getTime(),
      gw: item.id,
      number: item.number,
      cards: 0,
      plans: 0,
      essence: null,
      replay: null,
      source: null,
      ...fromSorare(item.id),
    } as Week);
  }

  return weeks.sort((a, b) => at(a.from) - at(b.from));
}

function stateOf(from: string, to: string, sorare: Sorare | null, gw: string | undefined, now: Date): WeekState {
  if (gw && sorare && gw === sorare.nextId) return "next";
  if (at(to) < now.getTime()) return "done";
  if (at(from) <= now.getTime()) return "live";
  return "later";
}

/** The week that contains this moment: half-open [from, to), else the latest week already under way. */
export function weekOn(weeks: Week[], instant: Date): Week | null {
  const t = instant.getTime();
  return weeks.find((week) => at(week.from) <= t && t < at(week.to)) ?? [...weeks].reverse().find((week) => at(week.from) <= t) ?? null;
}

/** The week the app opens on: the one Sorare is planning, or the first that has not finished. */
export function currentWeek(weeks: Week[]): Week | null {
  return weeks.find((week) => week.state === "next") ?? weeks.find((week) => week.state !== "done") ?? weeks.at(-1) ?? null;
}

export function weekById(weeks: Week[], id: string | undefined | null): Week | null {
  return (id && weeks.find((week) => week.id === id)) || null;
}

/** Weeks grouped into the months the picker shows, so a 43-week season stays one screen. */
export function byMonth(weeks: Week[]): { key: string; label: string; weeks: Week[] }[] {
  const months = new Map<string, Week[]>();
  for (const week of weeks) {
    const key = week.id.slice(0, 7);
    (months.get(key) ?? months.set(key, []).get(key)!).push(week);
  }
  return [...months].map(([key, list]) => ({ key, label: MONTHS[Number(key.slice(5, 7)) - 1]!, weeks: list }));
}

/** The dates a week covers, the way the app writes them: "25–29 Sep", "29 Sep – 2 Oct", "3 Jan". */
export function weekDates(week: Week): string {
  const from = dayMonth(week.from);
  const to = dayMonth(week.to);
  if (from.day === to.day && from.month === to.month) return `${from.day} ${from.month}`;
  return from.month === to.month
    ? `${from.day}–${to.day} ${to.month}`
    : `${from.day} ${from.month} – ${to.day} ${to.month}`;
}

/** A day the way the app writes it: "Friday 25 Sep". */
export function dayName(iso: string): string {
  const { day, month } = dayMonth(iso);
  return `${weekday.format(new Date(iso))} ${day} ${month}`;
}

/** What the week is worth, for the right-hand column of the picker. */
export function weekValue(week: Week): { value: string; note: string } {
  // A plan built from form is a guess at a lineup, not at a reward: the honest headline is who actually plays.
  if (week.essence !== null && week.plans && week.source !== "form") {
    return { value: `≈${Math.round(week.essence)}`, note: `${week.plans} plan${week.plans === 1 ? "" : "s"}` };
  }
  if (week.replay !== null) return { value: String(Math.round(week.replay)), note: "our plan's replay" };
  if (week.state === "live") return { value: "live", note: "locked" };
  if (week.cards) return { value: String(week.cards), note: week.cards === 1 ? "card plays" : "cards play" };
  if (week.gw) return { value: "—", note: "no cards play" };
  return { value: "—", note: "Sorare opens later" };
}

/**
 * What the bar needs: every week, the one being shown, and the one the app would open on.
 *
 * `asked` is the address: `w` is a week, and `md`/`gw` are the per-page gameweek a link made before the week
 * existed still carries, so the bar agrees with the page underneath it. The week you pick is the week you get —
 * a page that holds nothing for it says so itself rather than quietly showing another one.
 */
export function weekContext(
  grid: FixtureGrid | null,
  sorare: Sorare | null,
  now: Date,
  asked?: { w?: string | null; md?: number | null; gw?: string | null },
): { weeks: Week[]; current: Week | null; now: Week | null } {
  const weeks = seasonWeeks(grid, sorare, now);
  const here = currentWeek(weeks);
  const picked =
    weekById(weeks, asked?.w) ??
    (asked?.md != null ? (weeks.find((week) => week.md === asked.md) ?? null) : null) ??
    (asked?.gw ? (weeks.find((week) => week.gw === asked.gw) ?? null) : null) ??
    here;
  return { weeks, current: picked, now: here };
}
