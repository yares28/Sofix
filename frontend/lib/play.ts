/**
 * The Sorare gameweek the app shows: types for the payload the job publishes (`read_models` key `sorare`,
 * built by backend/app/sorare/publish.py) and the small pure helpers the Play page and the home tiles share.
 *
 * Everything here is display logic. Nothing is computed twice: the plans, the chances and the reasons a
 * competition can't be entered all come from the job.
 */
import type { Bucket } from "./types";

export const SORARE_TAG = "sorare";

export type Group = "In-season" | "Classic" | "Room";

export type Fixture = {
  team?: string | null;
  teamCrest?: string | null;
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
  /** His sorare player slug (the card's own is `slug`). */
  player?: string;
  /** His chance of starting his first game, whose number it is, and what Futbol Fantasy says is wrong with him (plans/futbolfantasy.md). */
  pStart?: number;
  startSource?: StartSource;
  ffKind?: "out" | "doubt" | "suspended";
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
  /** The best lineups the planner finds for a finished week once it knows every score. Its numbers are what happened. */
  hindsight?: boolean;
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

/**
 * Sorare's own odds for the side the player is on, as the job published them: fractions (0.56 = 56%), and the
 * board's difficulty formula and label for that side and venue. Absent while Sorare has not priced the game.
 */
export type GameOdds = {
  win: number;
  draw: number;
  loss: number;
  /** The chance behind Sorare's clean-sheet price (its margin is in it). Null when Sorare gave no usable price. */
  cleanSheet: number | null;
  /** The goals each side's clean-sheet price implies (his side's, then the other's); null when a price is missing or older payload. */
  goalsFor?: number | null;
  goalsAgainst?: number | null;
  difficulty: number;
  label: string;
  bucket: Bucket;
  source: "sorare";
};

export type PlayerGame = {
  id?: string;
  kickoff: string;
  competition: string;
  /** The side the player represents in this fixture; it can be a national team rather than his club. */
  team?: string | null;
  teamCrest?: string | null;
  opponent: string;
  opponentCrest: string | null;
  venue: "H" | "A";
  odds?: GameOdds;
  /**
   * His chance of starting this game and of coming on in it, once Futbol Fantasy speaks about one of his games
   * (plans/futbolfantasy.md): every game of such a player carries them, each with the source of its number. Absent
   * for a player it says nothing about, whose one chance for the week (`PlayingPlayer.pStart`) stands.
   */
  pStart?: number;
  pOn?: number;
  startSource?: StartSource;
  /** When Futbol Fantasy's number was read (ISO), what its page says of him, its match page, his id there, and when that team's lineup last changed. */
  startAt?: string;
  ffStatus?: FfStatus;
  ffMatch?: { id: number; url: string };
  ffPlayer?: string;
  ffChanged?: string;
};

/** Whose number a start chance is: Futbol Fantasy's expected lineup, else Sorare's own odds, else the app's from his form. */
export type StartSource = "futbolfantasy" | "sorare" | "sofix";

/** The three sources of a start chance, in the order the app trusts them: two letters each, as everywhere on screen. */
export const SOURCE_SHORT: Record<StartSource, string> = { futbolfantasy: "FF", sorare: "SO", sofix: "SF" };
export const SOURCE_NAME: Record<StartSource, string> = {
  futbolfantasy: "Futbol Fantasy's expected lineup",
  sorare: "Sorare's starter odds",
  sofix: "Sofix's estimate from his form",
};

/**
 * What a lineup card says about his chance of starting: the percentage, whose it is and a sentence for the tooltip. Null for a
 * card from a payload that does not carry it (older ones say "plays" instead).
 */
export function startChance(
  card: Pick<PlayCard, "pStart" | "startSource" | "ffKind">,
): { percent: number; source: StartSource; title: string } | null {
  if (card.pStart === undefined || !card.startSource) return null;
  const percent = Math.round(card.pStart * 100);
  const why = card.ffKind ? ` · ${card.ffKind === "out" ? "injured" : card.ffKind === "suspended" ? "suspended" : "doubt"}` : "";
  return { percent, source: card.startSource, title: `${percent}% to start · ${SOURCE_SHORT[card.startSource]}: ${SOURCE_NAME[card.startSource]}${why}` };
}

export type FfStatus = {
  kind?: "out" | "doubt" | "available" | "suspended";
  cause?: string;
  since?: string;
  note?: string;
  international?: boolean;
  yellows?: number;
};

export type PlayingPlayer = {
  /** His Sorare slug. Payloads published before the overlay do not carry it, so it may be absent. */
  player?: string;
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
  /**
   * His score if he starts and if he does not, and the chance of each (plans/overlay.md, O9). For the overlay:
   * the plans keep using `x`. Payloads published before O9 do not carry them.
   */
  start?: number;
  bench?: number;
  pStart?: number;
  pOn?: number;
  /** Whose number `pStart` is, and what each of the three says of his first game (Futbol Fantasy's only when it has one). */
  startSource?: StartSource;
  sources?: Partial<Record<StartSource, number>>;
  /**
   * His xG in one game he starts, for an average game of his side, from Understat's season so far (plans/overlay.md, O11):
   * non-penalty and penalty parts, and his team's own average xG per game to scale the game by. Only a midfielder or
   * forward Understat could name has it.
   */
  xg?: { np: number; pen: number; team: number | null };
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
  /** A finished week only: the best lineups in hindsight, priced by what really paid (Rooms left out). */
  hindsight?: Plan;
  /** The gameweek being planned only, and only once Futbol Fantasy has told the job something about a player of the owner's. */
  teamNews?: TeamNews;
  /**
   * Only for a LaLiga round Sorare has not opened a gameweek for: an early plan from the calendar and form, with the
   * competitions of the gameweek named in `basedOn`. Nothing in it can be entered.
   */
  projected?: { round: number; basedOn: string };
};

/** The game a team-news row is about, as the plan has it. */
export type NewsGame = { id: string; kickoff: string; team: string | null; opponent: string; venue: "H" | "A" | null };
export type NewsPlayer = { player: string; name: string; pos: "GK" | "DEF" | "MID" | "FWD"; rarity: string; pic: string };
export type NewsRisk = NewsPlayer & { comp: string; captain: boolean; game: NewsGame; p: number; kind: FfStatus["kind"] | null };
export type NewsMove = NewsPlayer & { from: number; to: number; kind: FfStatus["kind"] | null; game: NewsGame };

/**
 * What the Home says about the players' chances of starting (backend/app/sorare/ff_news.py): the players of the week split by
 * how likely Futbol Fantasy makes them, the first plan's starters it puts under 70%, and what moved since a reading about a day old.
 */
export type TeamNews = {
  /** When the newest of its numbers was read. */
  readAt: string | null;
  /** Players with a number from Futbol Fantasy, and how many more have a game this week without one. */
  players: number;
  without: number;
  split: { likely: number; doubtful: number; unlikely: number; out: number };
  atRisk: { total: number; players: NewsRisk[] };
  /** Null until a reading a day old exists to compare with. */
  moved: { since: string; total: number; players: NewsMove[] } | null;
};

/** What the main page says about an early plan: enough for the week picker. The week itself is read apart. */
export type ProjectedHead = { round: number; id: string; from: string; to: string; cards: number; plans: number };

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
  /** The job kept this finished week whole, apart from the page (`loadSorareWeek`). `playing` and `won` are its headline. */
  kept?: boolean;
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
  /** The LaLiga rounds Sorare has not opened, each with an early plan the job kept apart (`loadProjectedWeek`). */
  projected?: ProjectedHead[];
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

/**
 * The plans a page offers for a week: Sofix's own, and once the games are over and you look at what happened, the best
 * lineups in hindsight after them. Before the lock, what it could have been is not the question.
 */
export function plansOf(week: GameweekPlan, after: boolean): Plan[] {
  return after && week.played && week.hindsight ? [...week.plans, week.hindsight] : week.plans;
}
