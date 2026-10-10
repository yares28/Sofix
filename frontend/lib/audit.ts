/**
 * The Audit page: types for the payload the job publishes (`read_models` key `audit`, built by backend/app/sorare/audit.py) and the
 * small pure helpers the page shares. The numbers, the floors under which a figure is not given and each source's state all come from
 * the job; this only words them (docs/xscore_success_rate.md).
 */
import type { StartSource } from "./play";

export const AUDIT_KEY = "audit";
/** The order the three sources are drawn in: the one the page shows first, then Sorare's, then Sofix's own. */
export const SOURCES: StartSource[] = ["futbolfantasy", "sorare", "sofix"];

export type Pairs = { rate: number | null; lo: number | null; hi: number | null; pairs: number; weeks: number };
/** What a source said in one band of chances against how often he then started. */
export type Band = { from: number; to: number; n: number; said: number; was: number };
/** Nothing written down, written but not played, played but under the floor, or enough to give a figure. */
export type State = "none" | "waiting" | "few" | "enough";
export type Line = "GK" | "DEF" | "MID" | "FWD";

export type XscoreReplay = {
  games: number;
  pairs: Pairs;
  last5: Pairs;
  flat: Pairs;
  byPosition: Partial<Record<Line, Pairs>>;
  typicalMiss: number | null;
  bias: number | null;
  said: number | null;
  was: number | null;
  within: Record<string, number | null>;
};

export type XscoreLive = {
  state: State;
  floor: number;
  /** Players the model wrote down before a lock, and those of them whose games are all played. */
  noted: number;
  marked: number;
  pairs: number;
  weeks: number;
  rate: number | null;
  lo: number | null;
  hi: number | null;
};

export type Scores = { right: number | null; brier: number | null; mean: number | null; started: number | null; buckets: Band[] | null };
export type LiveSource = Scores & { state: State; recorded: number; settled: number };
export type SofixReplay = Scores & { games: number; always: number };
export type RecordWeek = { slug: string; lock: string | null; games: number; settled: number; sources: Record<StartSource, number> };

/** Essence and cash, kept apart (never converted). */
export type RewardSide = { essence: number; cash: number };
/** One finished gameweek's plan: what it expected (chance x reward, added up) and what its lineups really won. */
export type RewardWeek = { gameweek: number; slug: string | null; lineups: number; expected: RewardSide; won: RewardSide };
/** The season so far, from the gameweeks the job kept: each week, and the totals. `lineups` are the cases behind the share. */
export type Rewards = { weeks: RewardWeek[]; lineups: number; expected: RewardSide; won: RewardSide };
export type FrozenWeek = { slug: string; number: number; end: string; builtAt: string | null; plans: { rank: number; lineups: {
  competition: string; board: string | null; expected: number | null; score: number | null;
  reason?: "incomplete-plan";
  cameIn: { sub: string; for: string }[]; bonusLost: boolean;
}[] }[] };

/** One player in a mission day of the log: Sofix's pick (`hit`: he did it) or an achiever Sofix left out. */
export type MissionCard = { slug: string; name: string; pic: string; hit?: boolean };
/** One mission on one day, scored against the best your cards could have done (`best`: the picks or the achievers, the fewer). */
export type MissionDay = { day: string; rarity: string; mission: string; loaded: boolean; best: number; got: number; picks: MissionCard[]; missed: MissionCard[]; yours: number | null };
/** The daily missions log, scored (backend/app/sorare/missions.py `record`): `counted` mission days with at least one achiever, `success` those where
 * Sofix's picks held as many achievers as the best possible. */
export type Missions = {
  counted: number;
  success: number;
  caught: number;
  best: number;
  nobody: number;
  pending: number;
  yours: { counted: number; success: number };
  byMission: { mission: string; counted: number; success: number }[];
  said: number | null;
  happened: number | null;
  picks: number;
  days: MissionDay[];
};

/** One side of the Sorare-against-Sofix comparison, on the same starts: how far off on average, which way it leans, how often within 7
 * points, and how often it rated the better of two starters of one position higher. */
export type VersusSide = { miss: number | null; lean: number | null; within: number | null; pair: number | null; pairs: number };
export type VersusFigures = { starts: number; sofixCloser: number | null; sofix: VersusSide; sorare: VersusSide };
/** Sorare's projection against Sofix's xScore, from the numbers written down before each lock (backend/app/sorare/versus.py). */
export type Versus = {
  all: VersusFigures;
  positions: Record<Line, VersusFigures>;
  weeks: (VersusFigures & { week: number })[];
  recorded: number;
  settled: number;
};
const NO_SIDE: VersusSide = { miss: null, lean: null, within: null, pair: null, pairs: 0 };
const NO_FIGURES: VersusFigures = { starts: 0, sofixCloser: null, sofix: NO_SIDE, sorare: NO_SIDE };
export const NO_VERSUS: Versus = {
  all: NO_FIGURES,
  positions: { GK: NO_FIGURES, DEF: NO_FIGURES, MID: NO_FIGURES, FWD: NO_FIGURES },
  weeks: [],
  recorded: 0,
  settled: 0,
};

export type ElevenResult = { picked: number; checked: number; started: number; rate: number | null };
export type ElevenSources = Record<StartSource, ElevenResult>;
export type Elevens = { all: ElevenSources; weeks: { week: number; sources: ElevenSources }[]; clubs: { club: string; crest: string | null; sources: ElevenSources }[] };
const NO_ELEVEN: ElevenResult = { picked: 0, checked: 0, started: 0, rate: null };
export const NO_ELEVENS: Elevens = { all: { futbolfantasy: NO_ELEVEN, sorare: NO_ELEVEN, sofix: NO_ELEVEN }, weeks: [], clubs: [] };

/** Points as the page writes them: "6.4", "+2.1" for a lean, a dash when there is none. */
export function points(value: number | null, signed = false): string {
  if (value === null) return "–";
  const text = Math.abs(value).toFixed(1);
  return signed ? `${value > 0 ? "+" : value < 0 ? "−" : ""}${text}` : text;
}

export type Audit = {
  version: number;
  generatedAt: string;
  floor: number;
  /** What the replay file covers: when it was made, the games it holds and how many of the owner's players. */
  replay: { builtAt: string | null; from: string | null; to: string | null; players: number } | null;
  xscore: { replay: XscoreReplay | null; live: XscoreLive };
  starts: { replay: { sofix?: SofixReplay } | null; live: Record<StartSource, LiveSource>; weeks: RecordWeek[] };
  rewards: Rewards;
  missions: Missions;
  versus: Versus;
  elevens: Elevens;
  frozenPlans: FrozenWeek[];
  matches?: MatchAudit;
};

export type MatchAudit = { recorded: number; checked: number; floor: number; sofix: number | null; bookmakers: number | null; oddsThrough: string | null; generatedAt: string };
export const NO_MATCHES: MatchAudit = { recorded: 0, checked: 0, floor: 100, sofix: null, bookmakers: null, oddsThrough: null, generatedAt: "" };

const NONE: RewardSide = { essence: 0, cash: 0 };
export const NO_REWARDS: Rewards = { weeks: [], lineups: 0, expected: NONE, won: NONE };
export const NO_MISSIONS: Missions = { counted: 0, success: 0, caught: 0, best: 0, nobody: 0, pending: 0, yours: { counted: 0, success: 0 }, byMission: [], said: null, happened: null, picks: 0, days: [] };

const NOTHING: LiveSource = { state: "none", recorded: 0, settled: 0, right: null, brier: null, mean: null, started: null, buckets: null };
const NO_LIVE: XscoreLive = { state: "none", floor: 100, noted: 0, marked: 0, pairs: 0, weeks: 0, rate: null, lo: null, hi: null };

/** The payload is the job's own; one that does not look like it is left out rather than drawn wrongly. */
export function readable(value: unknown): Audit | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<Audit>;
  if (data.version !== 1 || !data.xscore || typeof data.xscore !== "object") return null;
  if (!data.starts || typeof data.starts !== "object") return null;
  const live = (data.starts.live ?? {}) as Partial<Record<StartSource, LiveSource>>;
  return {
    version: 1,
    generatedAt: data.generatedAt ?? "",
    floor: data.floor ?? 100,
    replay: data.replay ?? null,
    xscore: { replay: data.xscore.replay ?? null, live: { ...NO_LIVE, ...(data.xscore.live ?? {}) } },
    starts: {
      replay: data.starts.replay ?? null,
      weeks: data.starts.weeks ?? [],
      live: Object.fromEntries(SOURCES.map((source) => [source, { ...NOTHING, ...(live[source] ?? {}) }])) as Record<StartSource, LiveSource>,
    },
    // a page published before the rewards were counted has none: an empty season, not an error
    rewards: { ...NO_REWARDS, ...(data.rewards ?? {}) },
    // and one published before the missions log has none
    missions: { ...NO_MISSIONS, ...(data.missions ?? {}) },
    // and one published before Sorare and Sofix were written down side by side has an empty comparison
    versus: { ...NO_VERSUS, ...(data.versus ?? {}), positions: { ...NO_VERSUS.positions, ...(data.versus?.positions ?? {}) } },
    elevens: { ...NO_ELEVENS, ...(data.elevens ?? {}) },
    frozenPlans: data.frozenPlans ?? [],
    matches: { ...NO_MATCHES, ...(data.matches ?? {}) },
  };
}

/** What was won as a share of what was expected; null when nothing was expected, so there is nothing to compare with. */
export function wonShare(won: number, expected: number): number | null {
  return expected > 0 ? won / expected : null;
}

// ------------------------------------------------------------------------------------------------------ the figures
/** A share as a whole percent; a share that is not there is a dash, never a zero. */
export function percent(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? "–" : `${Math.round(rate * 100)}%`;
}

/** The range around a share ("65–67%"), one number when both ends round to it, nothing when it has none. */
export function interval(lo: number | null | undefined, hi: number | null | undefined): string | null {
  if (lo === null || lo === undefined || hi === null || hi === undefined) return null;
  const low = Math.round(lo * 100);
  const high = Math.round(hi * 100);
  return low === high ? `${low}%` : `${low}–${high}%`;
}

/** A band of chances in words: "Under 20%", "20–50%", "80% or more". */
export function bandLabel(band: Band): string {
  if (band.from <= 0) return `Under ${Math.round(band.to * 100)}%`;
  if (band.to >= 1) return `${Math.round(band.from * 100)}% or more`;
  return `${Math.round(band.from * 100)}–${Math.round(band.to * 100)}%`;
}

const MADRID = { timeZone: "Europe/Madrid" } as const;

/** The day a gameweek locked, as Madrid saw it ("Fri 2 Oct"). */
export function lockDay(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { ...MADRID, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso)).replace(",", "");
}

/** Where a document of the repository can be read (the explanation the hero links to). */
export function docUrl(name: string, repo: string = process.env.GITHUB_REPO || "yares28/Sofix"): string {
  return `https://github.com/${repo}/blob/main/docs/${name}`;
}

const plural = (n: number, one: string, many: string = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

// ------------------------------------------------------------------------------------------------------ the words
const WHY_NOTHING: Record<StartSource, string> = {
  futbolfantasy: "It covers LaLiga only: it starts with the first gameweek where you have a LaLiga player",
  sorare: "Sorare has not given a start chance for any recorded player",
  sofix: "It is written down before each lock, from the first one",
};

/** What a source's column says: its figure once it has enough games, else where it stands and why, never a made-up number. */
export function sourceStory(source: StartSource, live: LiveSource, floor: number): { main: string; sub: string } {
  switch (live.state) {
    case "enough":
      return { main: percent(live.right), sub: `right on ${plural(live.settled, "game")}` };
    case "few":
      return { main: "Too few to tell", sub: `${live.settled.toLocaleString("en-GB")} of ${floor} games checked` };
    case "waiting":
      return { main: "Waiting for results", sub: `${plural(live.recorded, "game")} written down before the lock` };
    default:
      return { main: "Nothing yet", sub: WHY_NOTHING[source] };
  }
}

/** The one line under the hero about the live record of the xScore. */
export function liveLine(live: XscoreLive): string {
  switch (live.state) {
    case "enough":
      return `${percent(live.rate)} (${interval(live.lo, live.hi) ?? "–"}) on ${plural(live.pairs, "pair")} since the first lock.`;
    case "few":
      return `${plural(live.pairs, "pair")} so far: too few to tell. It shows here from ${live.floor}.`;
    case "waiting":
      return live.noted === 1
        ? "1 player was written down before the lock. His gameweek is not played yet."
        : `${live.noted.toLocaleString("en-GB")} players were written down before the lock. Their gameweeks are not played yet.`;
    default:
      return "It starts with the first gameweek Sofix writes down before its lock.";
  }
}

/** A gameweek of the record: how many games were written down before its lock and how many have been checked since. */
export function recordLine(week: RecordWeek): string {
  return `${plural(week.games, "game")} written down · ${week.settled.toLocaleString("en-GB")} checked`;
}
