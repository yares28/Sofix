/**
 * The Sorare gameweek the app shows: types for the payload the job publishes (`read_models` key `sorare`,
 * built by backend/app/sorare/publish.py) and the small pure helpers the Play page and the home tiles share.
 *
 * Everything here is display logic. Nothing is computed twice: the plans, the chances and the reasons a
 * competition can't be entered all come from the job.
 */

export const SORARE_TAG = "sorare";

export type Group = "In-season" | "Classic" | "Room";

export type Fixture = {
  opponent: string | null;
  opponentCrest: string | null;
  venue: "H" | "A" | null;
  kickoff: string | null;
  games: number;
};

export type PlayCard = {
  slug: string;
  name: string;
  pos: "GK" | "DEF" | "MID" | "FWD";
  rarity: string;
  inSeason: boolean;
  level: number;
  pic: string;
  avatar: string;
  club: string | null;
  crest: string | null;
  mult: number;
  p: number;
  mu: number;
  x: number;
  average: number;
  actual: number | null;
  fixture: Fixture | null;
  slot?: string;
  captain?: boolean;
  subbedBy?: string | null;
  cameIn?: boolean;
};

export type Tier = {
  lo?: number;
  hi?: number;
  label?: string;
  cash?: number;
  essence?: number;
  card?: boolean;
  p: number;
};

export type Lineup = {
  comp: string;
  key: string;
  /** The leaderboard this lineup enters: Sorare is asked by slug and entered by id. Only Apply uses them. */
  board: string;
  boardId: string;
  group: Group;
  fee: number;
  rarity: string;
  size: number;
  subSlots: number;
  minInSeason: number;
  cap: number | null;
  captainBonus: number;
  entries: number;
  x: number;
  lo: number;
  hi: number;
  pReturn: number;
  eEss: number;
  eCash: number;
  pCard: number;
  need: number | null;
  needFrom: string;
  tiers: Tier[];
  starters: PlayCard[];
  subs: PlayCard[];
  average: number;
  actual?: {
    total: number;
    cash: number;
    essence: number;
    card: boolean;
    need: number | null;
    bonusLost: boolean;
    cameIn: { sub: string; for: string }[];
  };
};

export type Plan = {
  rank: number;
  essence: number;
  cash: number;
  pAny: number;
  rewards: number;
  cardsUsed: number;
  cardsAvailable: number;
  lineups: Lineup[];
  actual?: { essence: number; cash: number; cards: number; paid: number; inRange: number };
};

export type Option = {
  name: string;
  key: string;
  group: Group;
  rarity: string;
  fee: number;
  size: number;
  subs: number;
  cap: number | null;
  max: number;
  entries: number;
  tiers: { lo: number; hi: number; cash: number; essence: number; card: boolean }[];
};

export type Blocked = { name: string; rarity: string; group: Group; why: string };
export type AlsoOpen = { name: string; group: Group; fee: number; eEss: number; pReturn: number; x: number };

export type PlayerGame = {
  kickoff: string;
  competition: string;
  opponent: string;
  opponentCrest: string | null;
  venue: "H" | "A";
};

export type PlayingPlayer = {
  name: string;
  pos: "GK" | "DEF" | "MID" | "FWD";
  avatar: string;
  /** The art of one of your cards for him, and his club's badge: the board draws these when LaLiga is away. */
  pic: string;
  crest: string | null;
  rarity: string;
  club: string | null;
  inSeason: boolean;
  cards: number;
  /** His chance of playing, what he is expected to score, and the average every cap counts. */
  p: number;
  x: number;
  average: number;
  games: PlayerGame[];
};

export type GameweekPlan = {
  gameweek: { id: string; slug: string; number: number; name: string; start: string; end: string; lock: string };
  state: "ready" | "waiting" | "none";
  played: boolean;
  projectionsAt: string | null;
  source: "sorare" | "form";
  playing: { cards: number; players: PlayingPlayer[] };
  playable: Option[];
  blocked: Blocked[];
  notWorth: AlsoOpen[];
  plans: Plan[];
};

export type TimelineWeek = {
  id: string;
  slug: string;
  number: number;
  start: string;
  end: string;
  lock: string;
  status: "done" | "live" | "next" | "later";
  playing?: number;
  won?: number;
};

/** How the payload came to be: who built it, when the cloud last managed it, and what the record holds. */
export type Status = {
  builtAt: string;
  where: "cloud" | "pc";
  lastCloudAt: string | null;
  moved: number;
  kept: { gameweeks: number; rows: number; projections: number; scored: number };
};

/** A player's average over a window of games (Sorare's L5 / L10 / L40), and how often he started them. */
export type CardScore = {
  window: "L5" | "L10" | "L40";
  /** The average Sorare score over the window, or null when there aren't enough games. */
  score: number | null;
  /** The share of the window's games he started, 0–100, or null when unknown. */
  started: number | null;
};

/** One card in the owner's collection, as the My cards page (S5) draws it. */
export type CollectionCard = {
  slug: string;
  player: string;
  name: string;
  pos: "GK" | "DEF" | "MID" | "FWD";
  rarity: string;
  inSeason: boolean;
  level: number;
  average: number;
  club: string | null;
  pic: string;
  /** L5 / L10 / L40 hexagon scores with %started. Falls back to `average` (L10) when absent. */
  scores?: CardScore[];
  /** The player's Sorare star tier, 0–5 (the "Icon" row shows 5). Null when the job hasn't got it yet. */
  stars?: number | null;
};

/** One LaLiga player Sorare is quoting a price for, as the Player search page (S5) draws it. */
export type MarketPlayer = {
  slug: string;
  name: string;
  pos: "GK" | "DEF" | "MID" | "FWD";
  club: string | null;
  crest: string | null;
  average: number;
  projection: number | null;
  eur: number;
  pic: string;
};

export type Sorare = {
  generatedAt: string;
  user: string;
  status?: Status;
  timeline: TimelineWeek[];
  /** Every gameweek the job planned, oldest first: the one it replayed, the one being planned, then the ones ahead. */
  weeks: GameweekPlan[];
  nextId: string;
  lastId: string | null;
  cards: {
    total: number;
    usable: number;
    excluded: { name: string; why: string; rarity: string }[];
    byRarity: Record<string, number>;
    byPosition: Record<string, Record<string, number>>;
    inSeason: number;
    rareGoalkeepers: number;
  };
  /** The whole collection, card by card (S5 My cards). Absent until the Sorare job publishes it. */
  collection?: CollectionCard[];
  /** LaLiga players priced right now (S5 Player search). Absent until the Sorare job publishes it. */
  market?: MarketPlayer[];
};

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** How long until a moment, as the head's one hero number: days and hours, or hours and minutes on the day. */
export function timeUntil(when: string, now: Date): { days: number; hours: number; minutes: number; past: boolean } {
  const left = new Date(when).getTime() - now.getTime();
  if (left <= 0) return { days: 0, hours: 0, minutes: 0, past: true };
  return {
    days: Math.floor(left / DAY),
    hours: Math.floor((left % DAY) / HOUR),
    minutes: Math.floor((left % HOUR) / 60_000),
    past: false,
  };
}

/** A percentage the way the board writes it: ">99%", "<1%", "43%". */
export function chanceLabel(p: number): string {
  if (p >= 0.995) return ">99%";
  if (p > 0 && p < 0.005) return "<1%";
  return `${Math.round(p * 100)}%`;
}

export function essenceLabel(amount: number): string {
  return `${amount < 0 ? "−" : ""}${Math.abs(Math.round(amount)).toLocaleString("en-GB")}`;
}

export function cashLabel(amount: number): string {
  return amount >= 10 || Number.isInteger(amount) ? `$${Math.round(amount)}` : `$${amount.toFixed(2)}`;
}

/** "5 + 2 subs · 4 in-season" · "7 + 2 subs" · "Room of 10 · cap 260" */
export function formatOf(lineup: Pick<Lineup, "group" | "size" | "subSlots" | "minInSeason" | "cap">): string {
  if (lineup.group === "Room") return `Room of 10${lineup.cap ? ` · cap ${lineup.cap}` : " · no cap"}`;
  const subs = lineup.subSlots ? ` + ${lineup.subSlots} subs` : "";
  const inSeason = lineup.minInSeason ? ` · ${lineup.minInSeason} in-season` : "";
  return `${lineup.size}${subs}${inSeason}`;
}

/** Who gets paid in this competition, in a few words. */
export function paysNote(lineup: Lineup): string {
  if (lineup.group === "Room") return `Top 3 of 10 · ${lineup.fee} to enter`;
  const paid = lineup.tiers.filter((tier) => tier.cash || tier.essence || tier.card);
  const last = paid[paid.length - 1];
  if (!last?.hi) return "Rewards by rank";
  const entries = lineup.entries ? ` of ≈${lineup.entries.toLocaleString("en-GB")}` : "";
  return `Top ${last.hi.toLocaleString("en-GB")}${entries} pays`;
}

/** Where the numbers sit on a lineup's range bar: bad week, good week, the score that pays, what it scored. */
export function rangeScale(lineup: Lineup, after: boolean): { at: (value: number) => number; from: number; to: number } {
  const marks = [lineup.lo, lineup.hi, lineup.need ?? lineup.lo];
  if (after && lineup.actual) marks.push(lineup.actual.total, lineup.actual.need ?? lineup.actual.total);
  const from = Math.min(...marks) - 20;
  const to = Math.max(...marks) + 20;
  return { from, to, at: (value: number) => ((value - from) / (to - from)) * 100 };
}

/** How many of a plan's lineups landed inside the range it was given. */
export function insideRange(plan: Plan): number {
  return plan.lineups.filter((lineup) => lineup.actual && lineup.actual.total >= lineup.lo && lineup.actual.total <= lineup.hi).length;
}

/** The cards of a plan, split by the kind of competition they went to, plus the ones left at home. */
export function allocation(plan: Plan): { group: Group | "Unused"; cards: number }[] {
  const order: (Group | "Unused")[] = ["In-season", "Classic", "Room"];
  const counts = new Map<Group | "Unused", number>();
  for (const lineup of plan.lineups) {
    const used = lineup.starters.length + lineup.subs.length;
    counts.set(lineup.group, (counts.get(lineup.group) ?? 0) + used);
  }
  const rows = order.filter((group) => counts.has(group)).map((group) => ({ group, cards: counts.get(group) as number }));
  const unused = plan.cardsAvailable - plan.cardsUsed;
  return unused > 0 ? [...rows, { group: "Unused" as const, cards: unused }] : rows;
}

/** What the gameweek is waiting for, in the owner's words, or null when its plans are ready. */
export function waitingFor(gw: GameweekPlan, now: Date): string | null {
  if (gw.state === "ready") return null;
  if (gw.state === "none") return "None of your cards play this gameweek.";
  if (gw.projectionsAt && new Date(gw.projectionsAt) > now) return "Sorare publishes its projections for these games first.";
  return "The chances need a gameweek like this one that has already been played.";
}

/** The reward chips a lineup shows: expected essence and cash, or what it actually won. */
export function rewardChips(lineup: Lineup, after: boolean): { kind: "essence" | "cash" | "card" | "none"; label: string; won?: boolean }[] {
  if (after && lineup.actual) {
    const { cash, essence, card } = lineup.actual;
    if (cash) return [{ kind: "cash", label: cashLabel(cash), won: true }];
    if (essence > 0) return [{ kind: "essence", label: essenceLabel(essence), won: true }];
    if (card) return [{ kind: "card", label: "Card", won: true }];
    return [{ kind: "none", label: "No reward" }];
  }
  const chips: { kind: "essence" | "cash" | "card" | "none"; label: string }[] = [];
  if (lineup.eEss) chips.push({ kind: "essence", label: `≈${essenceLabel(lineup.eEss)}${lineup.fee ? " net" : ""}` });
  if (lineup.eCash >= 0.01) chips.push({ kind: "cash", label: `≈${cashLabel(lineup.eCash)}` });
  if (lineup.pCard >= 0.01) chips.push({ kind: "card", label: `Card ${chanceLabel(lineup.pCard)}` });
  return chips.length ? chips : [{ kind: "none", label: "No reward expected" }];
}

/** The gameweek a page opens on: the one being planned. */
export function defaultWeek(data: Sorare): string {
  return data.nextId;
}

/** The gameweek being planned. Every payload has one, so this never has to be guarded. */
export function nextWeek(data: Sorare): GameweekPlan {
  return weekPlan(data, data.nextId) ?? data.weeks[0]!;
}

/** The last gameweek that was played, when the payload still carries its replay. */
export function lastWeek(data: Sorare): GameweekPlan | null {
  return data.lastId ? weekPlan(data, data.lastId) : null;
}

export function weekPlan(data: Sorare, id: string): GameweekPlan | null {
  return data.weeks.find((week) => week.gameweek.id === id) ?? null;
}
