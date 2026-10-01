/**
 * Futbol Fantasy's lineups as the Lineups page draws them: types for the payload the job publishes (`read_models` key
 * `lineups`, built by backend/app/sorare/ff_lineups.py) and the small pure helpers the page shares. The rows, the
 * formation and who is the owner's all come from the job; this only groups, labels and words them (plans/futbolfantasy.md, S5).
 */
import { freshLabel } from "./fresh";
import type { Week } from "./weeks";

export const LINEUPS_KEY = "lineups";
/** A reading older than this is not used by the job, and the page says so. */
export const MAX_AGE_MS = 24 * 3600_000;

export type Line = "GK" | "DEF" | "MID" | "FWD";
export type Level = { value: number; label: string };
export type PlayerKind = "out" | "doubt" | "available" | "suspended";

/** What the page says about a player besides his chance: an injury or ban, a national call-up, his yellow cards. */
export type PlayerStatus = {
  kind?: PlayerKind;
  cause?: string;
  since?: string;
  note?: string;
  international?: boolean;
  yellows?: number;
};

export type LineupPlayer = {
  id: string;
  name: string;
  /** His chance of starting, 0 to 1; null when the page gave none. */
  p: number | null;
  x?: number | null;
  y?: number | null;
  gk?: boolean;
  /** The line he was last drawn in (alternatives only: the eleven is drawn in its rows). */
  pos?: Line;
  age?: number;
  status?: PlayerStatus;
  /** The Sorare slug of the owner's player this is. */
  yours?: string;
  /** A starter only: the ids of the alternatives the page puts under him as able to come in for him, in its order (one can be under several). */
  next?: string[];
};

export type PitchRow = { line: Line; players: LineupPlayer[] };
export type Absent = { name: string; kind: PlayerKind; cause?: string; since?: string; note?: string; yours?: string };
export type Unlinked = { slug: string; name: string; why: string };

export type LineupSide = {
  name: string;
  /** Our club code (RSO), for a club the app keeps. */
  club: string | null;
  ffId: string | null;
  crest: string | null;
  coach: string | null;
  rotations: Level | null;
  predictability: Level | null;
  season: number | null;
  changedAt: string | null;
  /** False until the site has a lineup for the side's next game. */
  published: boolean;
  squad: boolean | null;
  formation: string;
  rows: PitchRow[];
  alternatives: LineupPlayer[];
  absent: Absent[];
  unlinked: Unlinked[];
};

export type LineupMatch = {
  id: number;
  url: string;
  competition: string;
  competitionName: string;
  round: number | null;
  phase?: string;
  kickoff: string | null;
  score: [number, number] | null;
  readAt: string;
  home: LineupSide;
  away: LineupSide;
};

/** The owner's card for a player drawn on the page: the rarest he has. */
export type OwnedCard = { name: string; rarity: string; pic: string; pos: Line; club: string | null };

export type LineupsData = {
  version: number;
  generatedAt: string;
  /** The last time the site was asked, whether or not it answered. */
  readAt: string | null;
  failed: string[];
  stopped: string | null;
  matches: LineupMatch[];
  cards: Record<string, OwnedCard>;
};

/** The payload is the job's own; a row that does not look like it is left out rather than drawn wrongly. */
export function readable(value: unknown): LineupsData | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<LineupsData>;
  if (data.version !== 1 || !Array.isArray(data.matches)) return null;
  return { cards: {}, failed: [], stopped: null, readAt: null, generatedAt: "", ...data } as LineupsData;
}

// ------------------------------------------------------------------------------------------------------ the matches
export type Section = {
  key: string;
  competition: string;
  competitionName: string;
  round: number | null;
  label: string;
  matches: LineupMatch[];
};

const ORDER = ["laliga", "champions", "europa-league", "copa-del-rey", "supercopa"];
const MATCHDAY = new Set(["champions", "europa-league"]);
const at = (iso: string | null) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY);

/** The matches grouped as the site groups them (a competition's round), each group in kickoff order, the soonest first. */
export function sectionsOf(data: LineupsData): Section[] {
  const groups = new Map<string, Section>();
  for (const match of data.matches) {
    const key = `${match.competition}:${match.round ?? match.phase ?? ""}`;
    let section = groups.get(key);
    if (!section) {
      const word = MATCHDAY.has(match.competition) ? "Matchday" : "Round";
      const where = match.round !== null ? `${word} ${match.round}` : (match.phase ?? "");
      section = {
        key,
        competition: match.competition,
        competitionName: match.competitionName,
        round: match.round,
        label: where ? `${match.competitionName} · ${where}` : match.competitionName,
        matches: [],
      };
      groups.set(key, section);
    }
    section.matches.push(match);
  }
  const out = [...groups.values()];
  for (const section of out) section.matches.sort((a, b) => at(a.kickoff) - at(b.kickoff) || a.id - b.id);
  const rank = (competition: string) => {
    const index = ORDER.indexOf(competition);
    return index < 0 ? ORDER.length : index;
  };
  return out.sort((a, b) => at(a.matches[0]!.kickoff) - at(b.matches[0]!.kickoff) || rank(a.competition) - rank(b.competition));
}

/** The match the page opens on: the one asked for, else the next to be played (the last one when all are played). */
export function pickMatch(sections: Section[], asked: string | null, now: Date): LineupMatch | null {
  const every = sections.flatMap((section) => section.matches);
  if (every.length === 0) return null;
  const named = asked ? every.find((match) => String(match.id) === asked) : undefined;
  if (named) return named;
  const ordered = [...every].sort((a, b) => at(a.kickoff) - at(b.kickoff) || a.id - b.id);
  return ordered.find((match) => at(match.kickoff) > now.getTime()) ?? ordered[ordered.length - 1]!;
}

/** The address of a match: `?m=` set to its id, whatever else the address says kept. */
export function matchAddress(search: string, id: number): string {
  const params = new URLSearchParams(search);
  params.set("m", String(id));
  return `/lineups?${params.toString()}`;
}

/** The match an address asks for among those the page holds, else the one the page opened on. */
export function matchAsked(matches: LineupMatch[], asked: string | null, fallback: LineupMatch): LineupMatch {
  return (asked ? matches.find((match) => String(match.id) === asked) : undefined) ?? fallback;
}

export type MatchState = "ahead" | "started" | "tbc";

export function matchState(match: LineupMatch, now: Date): MatchState {
  if (!match.kickoff) return "tbc";
  return new Date(match.kickoff).getTime() <= now.getTime() ? "started" : "ahead";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid",
  weekday: "short",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The kickoff in Madrid time; "Date TBC" while the site has no date. */
export function kickoffLabel(iso: string | null): { day: string; time: string; short: string } {
  if (!iso) return { day: "Date TBC", time: "TBC", short: "TBC" };
  const found: Record<string, string> = {};
  for (const part of parts.formatToParts(new Date(iso))) found[part.type] = part.value;
  const time = `${found.hour}:${found.minute}`;
  return { day: `${found.weekday} ${Number(found.day)} ${MONTHS[Number(found.month) - 1]}`, time, short: `${found.weekday} ${time}` };
}

/**
 * Whether a call-up is shown beside a player: only once his club has named its match squad. The page cannot say "called up" while it
 * also says the squad list is not out (R8, 1 Oct review). The mark itself (`data-internacional`) is a national-squad call-up, a different
 * list from the club's, so until the club names its squad it stays out of sight.
 */
export const squadOut = (side: LineupSide): boolean => side.published && side.squad === true;

/** Whether any player of the match shows a call-up, which is when the legend names the mark. */
export const calledUpIn = (match: LineupMatch): boolean =>
  [match.home, match.away].some((side) => squadOut(side) && [...side.rows.flatMap((row) => row.players), ...side.alternatives].some((player) => player.status?.international));

/** The days of a round, from its first kickoff to its last, in Madrid time: "Fri 9 – Mon 12 Oct". */
export function roundDays(first: string, last: string): string {
  const [a, b] = [kickoffLabel(first).day.split(" "), kickoffLabel(last).day.split(" ")];
  if (a.join(" ") === b.join(" ")) return a.join(" ");
  return a[2] === b[2] ? `${a[0]} ${a[1]} – ${b[0]} ${b[1]} ${b[2]}` : `${a.join(" ")} – ${b.join(" ")}`;
}

/**
 * The Sorare week a LaLiga round feeds, as the page's header names it, with the Play page for it: "Sorare GW21 · locks Fri 16:00" once
 * Sorare has opened the week, "Sorare: not open yet" before. Null when the round is not one of the season's weeks.
 */
export function sorareLine(
  week: Pick<Week, "id" | "gw" | "number"> | undefined,
  lock: string | undefined,
  now: Date,
): { text: string; href: string } | null {
  if (!week) return null;
  const href = `/play?w=${encodeURIComponent(week.id)}`;
  if (!week.gw) return { text: "Sorare: not open yet", href };
  const name = `Sorare GW${week.number}`;
  if (!lock) return { text: name, href };
  return { text: new Date(lock) <= now ? `${name} · locked` : `${name} · locks ${kickoffLabel(lock).short}`, href };
}

/**
 * The one line shown when the page was opened for a week it does not cover (`?w=`): it holds each club's next LaLiga game and
 * nothing else, so a week that is past, later, or a national-team week gets the round it does hold and what that week is.
 */
export function otherWeekNote(asked: Pick<Week, "md" | "number"> | null, round: number | null, nationalGames: boolean): string | null {
  if (!asked || round === null || asked.md === round) return null;
  const base = `Futbol Fantasy only has each club's next LaLiga game: round ${round}.`;
  if (asked.md !== null) return `${base} Round ${asked.md} ${asked.md < round ? "has been played" : "comes after it"}.`;
  return `${base} Sorare GW${asked.number} ${nationalGames ? "is national-team games" : "has no LaLiga round"}.`;
}

/** How many of the owner's players a match names, the eleven and the alternatives of both sides. */
export function yoursIn(match: LineupMatch): number {
  let count = 0;
  for (const side of [match.home, match.away]) {
    for (const row of side.rows) count += row.players.filter((p) => p.yours).length;
    count += side.alternatives.filter((p) => p.yours).length;
  }
  return count;
}

export type LineupsGlance = { round: number; yours: number };

/**
 * What the Home needs of this page when its own week has no Futbol Fantasy news: the LaLiga round still to play (the site holds
 * each club's next game, so one round) and how many different players of the owner's it names. Null when the page holds no such round.
 */
export function lineupsGlance(data: LineupsData | null, now: Date): LineupsGlance | null {
  if (!data) return null;
  const section = sectionsOf(data).find(
    (one) => one.competition === "laliga" && one.round !== null && one.matches.some((match) => !match.kickoff || new Date(match.kickoff).getTime() > now.getTime()),
  );
  if (!section) return null;
  const yours = new Set<string>();
  for (const match of section.matches) {
    for (const side of [match.home, match.away]) {
      for (const player of [...side.rows.flatMap((row) => row.players), ...side.alternatives]) if (player.yours) yours.add(player.yours);
    }
  }
  return { round: section.round!, yours: yours.size };
}

/** How many of the owner's players are in a match's probable elevens, the alternatives left out. */
export function startersIn(match: LineupMatch): number {
  let count = 0;
  for (const side of [match.home, match.away]) for (const row of side.rows) count += row.players.filter((player) => player.yours).length;
  return count;
}

/** What a match tab says of your players: "3 yours · 0 starting" (named in the match, and in the probable eleven). */
export function yoursLabel(match: LineupMatch): string {
  return `${yoursIn(match)} yours · ${startersIn(match)} starting`;
}

/** An alternative at or under this chance is not worth a chip on the pitch. */
export const DEAD_CHANCE = 0.05;

/**
 * The alternatives worth a chip, and the ones that fold into "+3 more": anyone at 5% or less, and anyone out or suspended (the list
 * below the team says why). A player of yours is never folded.
 */
export function splitDead(players: LineupPlayer[]): { live: LineupPlayer[]; dead: LineupPlayer[] } {
  const live: LineupPlayer[] = [];
  const dead: LineupPlayer[] = [];
  for (const player of players) {
    const kind = player.status?.kind;
    const folds = !player.yours && (kind === "out" || kind === "suspended" || (player.p ?? 0) <= DEAD_CHANCE);
    (folds ? dead : live).push(player);
  }
  return { live, dead };
}

export type SlotPlacement = {
  /** False for a payload whose page named nobody under any slot: the alternatives are then placed by line, as before. */
  perSlot: boolean;
  /** Each starter's own alternatives, still in the running, in the page's order. */
  bySlot: Map<string, LineupPlayer[]>;
  /** The ones in the running that no slot names, and the ones that fold into "+N more". */
  rest: LineupPlayer[];
  dead: LineupPlayer[];
};

/**
 * Who could come in for whom, the way Futbol Fantasy draws it: under each starter's own card, the names of the alternatives for his
 * slot, so one player can stand under several. Anyone at 5% or less or out still folds into "+N more" (`splitDead`).
 */
export function slotAlternatives(side: LineupSide): SlotPlacement {
  const { live, dead } = splitDead(side.alternatives);
  const starters = side.rows.flatMap((row) => row.players);
  if (!starters.some((one) => (one.next?.length ?? 0) > 0)) return { perSlot: false, bySlot: new Map(), rest: live, dead };
  const liveById = new Map(live.map((one) => [one.id, one]));
  const named = new Set<string>();
  const bySlot = new Map<string, LineupPlayer[]>();
  for (const one of starters) {
    const chips = (one.next ?? []).flatMap((id) => {
      named.add(id);
      const found = liveById.get(id);
      return found ? [found] : [];
    });
    if (chips.length) bySlot.set(one.id, chips);
  }
  return { perSlot: true, bySlot, rest: live.filter((one) => !named.has(one.id)), dead };
}

/** The injury list without the knocks a player plays despite, which fold into "4 more fit to play" (a player of yours stays). */
export function splitAbsent(entries: Absent[]): { news: Absent[]; fit: Absent[] } {
  const fit = entries.filter((entry) => entry.kind === "available" && !entry.yours);
  return { news: entries.filter((entry) => !fit.includes(entry)), fit };
}

export type YoursPlayer = {
  slug: string;
  id: string;
  name: string;
  /** His short name, the same on a card and on a chip. */
  label: string;
  p: number | null;
  kind: PlayerKind | null;
  /** In the probable eleven (else an alternative). */
  starting: boolean;
  /** His club's short code. */
  club: string;
};

/**
 * The owner's players a match names, for the strip at its top: the eleven first, then the alternatives, each by chance (a player with
 * none given, or at 0, last), then by name.
 */
export function yoursPlayers(match: LineupMatch): YoursPlayer[] {
  const out: YoursPlayer[] = [];
  for (const side of [match.home, match.away]) {
    const labels = playerLabels([...side.rows.flatMap((row) => row.players), ...side.alternatives]);
    const named = (player: LineupPlayer, starting: boolean) => {
      if (!player.yours) return;
      out.push({ slug: player.yours, id: player.id, name: player.name, label: labels[player.id] ?? player.name, p: player.p, kind: player.status?.kind ?? null, starting, club: shortCode(side) });
    };
    for (const row of side.rows) for (const player of row.players) named(player, true);
    for (const player of side.alternatives) named(player, false);
  }
  return out.sort((a, b) => Number(b.starting) - Number(a.starting) || (b.p ?? 0) - (a.p ?? 0) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------------------------------- how fresh
export type Freshness = {
  /** fresh: read under a day ago; failed: the last ask got nothing new; old: what is held is over a day old; none: never read. */
  state: "none" | "fresh" | "failed" | "old";
  /** When the site was last asked. */
  readAt: string | null;
  /** The newest reading of any match, which is what is shown. */
  shown: string | null;
};

export function freshness(data: LineupsData, now: Date): Freshness {
  const newest = data.matches.reduce<string | null>((best, match) => (best === null || match.readAt > best ? match.readAt : best), null);
  if (newest === null) return { state: "none", readAt: data.readAt, shown: null };
  const age = now.getTime() - new Date(newest).getTime();
  if (age > MAX_AGE_MS) return { state: "old", readAt: data.readAt, shown: newest };
  const asked = data.readAt ? new Date(data.readAt).getTime() : 0;
  const nothingNew = asked - new Date(newest).getTime() > 5 * 60_000;
  const failed = data.failed.length > 0 || Boolean(data.stopped);
  return { state: failed && nothingNew ? "failed" : "fresh", readAt: data.readAt, shown: newest };
}

/** Teams whose lineup the site has published, of all the teams playing. */
export function teamsRead(matches: LineupMatch[]): { published: number; teams: number } {
  const sides = matches.flatMap((match) => [match.home, match.away]);
  return { published: sides.filter((side) => side.published).length, teams: sides.length };
}

// ------------------------------------------------------------------------------------------------ a player's look
export type Tone = "strong" | "good" | "mid" | "low" | "none";

/** The shade of a chance's badge: the higher, the greener. */
export function chanceTone(p: number | null): Tone {
  if (p === null) return "none";
  const percent = Math.round(p * 100);
  return percent >= 80 ? "strong" : percent >= 60 ? "good" : percent >= 40 ? "mid" : "low";
}

const surname = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;
const upper = (text: string) => text.toLocaleUpperCase("es");

/** What each player of a side is called on his card: his surname, and with an initial where two of them share it. */
export function playerLabels(players: { id: string; name: string }[]): Record<string, string> {
  const counts = new Map<string, number>();
  for (const player of players) counts.set(upper(surname(player.name)), (counts.get(upper(surname(player.name))) ?? 0) + 1);
  const out: Record<string, string> = {};
  for (const player of players) {
    const last = upper(surname(player.name));
    const first = player.name.trim().split(/\s+/)[0] ?? "";
    out[player.id] = (counts.get(last) ?? 0) > 1 && first !== player.name.trim() ? `${upper(first.charAt(0))}. ${last}` : last;
  }
  return out;
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return upper(words.length === 1 ? words[0]!.slice(0, 2) : `${words[0]!.charAt(0)}${words.at(-1)!.charAt(0)}`);
}

// ----------------------------------------------------------------------------------------------- the words around
/** When a reading was made, the way every page says it: "9 h ago (03:33)". */
export function readLabel(iso: string | null, now: Date): string {
  return iso ? freshLabel(iso, now) : "never";
}

/** A club's short name for a chip: our code for the clubs the app keeps, else the first three letters of its name. */
export function shortCode(side: Pick<LineupSide, "club" | "name">): string {
  return side.club ?? upper(side.name.trim().slice(0, 3));
}

const ROTATIONS: Record<string, string> = { "sin rotaciones": "No rotation", "rotaciones extremas": "Extreme rotation" };
const PREDICTABILITY: Record<string, string> = {
  "muy previsible": "Very predictable",
  previsible: "Predictable",
  "poco previsible": "Not very predictable",
  imprevisible: "Unpredictable",
  "muy imprevisible": "Very unpredictable",
};
const BY_STEP = {
  rotations: ["No rotation", "Little rotation", "Some rotation", "Heavy rotation", "Extreme rotation"],
  predictability: ["Very predictable", "Predictable", "Fairly predictable", "Not very predictable", "Very unpredictable"],
} as const;

/** One of the site's two five-step gauges in English: by its label where known, else by its step (1 is the calmest). */
export function gaugeText(level: Level | null, kind: "rotations" | "predictability"): string | null {
  if (!level) return null;
  const known = (kind === "rotations" ? ROTATIONS : PREDICTABILITY)[level.label.trim().toLowerCase()];
  return known ?? BY_STEP[kind][Math.min(Math.max(level.value, 1), 5) - 1] ?? level.label;
}

/** The predictability line of a team: this round's gauge and how predictable its lineups have been all season. */
export function statusLine(predictability: Level | null, season: number | null): string | null {
  const round = gaugeText(predictability, "predictability");
  const share = season !== null ? `${Math.round(season * 100)}%` : null;
  if (round && share) return `${round} this round · ${share} over the season`;
  if (round) return `${round} this round`;
  return share ? `${share} predictable over the season` : null;
}

export function yoursSummary(count: number): string {
  return count === 0 ? "none of your players" : `${count} of your players`;
}

// ------------------------------------------------------------------------------------------------------ the crests
// Club crests are hot-linked (personal use, no licence stated): the ones the board already shows, and Futbol Fantasy's for the
// clubs the board does not keep (a Champions League opponent). Both hosts are in the Content-Security-Policy.
const CREST_ORIGINS = ["https://crests.football-data.org/", "https://static.futbolfantasy.com/uploads/images/equipos/"];

/** The address to draw a crest from, or null when it is not one of the two hosts the page may load from. */
export function crestSource(url: string | null | undefined): string | null {
  return url && CREST_ORIGINS.some((origin) => url.startsWith(origin)) ? url : null;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** A club colour with an opacity (two hex digits), or nothing when the colour is not a plain hex one. */
export function tint(color: string | undefined, alpha: string): string {
  return color && HEX.test(color) ? `${color}${alpha}` : "transparent";
}
