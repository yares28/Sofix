import { z } from "zod";

/** The Targets page's block: each competition's reward ladder with the average score each level took over the finished
 * gameweeks (backend/app/sorare/reward_bars.py, written by the refresh's Sorare step). */
export const REWARD_BARS_KEY = "reward_bars";

const score = z.number().finite().nullable();
const level = z.object({
  lo: z.number().int(), hi: z.number().int(), cash: z.number(), essence: z.number(), card: z.boolean(),
  xp: z.number().int().nonnegative().default(0), bar: score,
});
const competition = z.object({
  key: z.string(), name: z.string(), rarity: z.string().nullable(), group: z.string().nullable(),
  kind: z.enum(["rank", "room", "target"]), size: z.number().int().nullable(), paidTo: z.number().int().nullable(),
  bar: score, low: score, high: score, latest: score, samples: z.number().int().nonnegative(),
  byWeek: z.array(z.object({ week: z.string(), score })),
  reward: z.object({ cash: z.number(), essence: z.number(), card: z.boolean() }).nullable(),
  ladder: z.array(level),
});
const unread = z.object({ key: z.string(), name: z.string(), rarity: z.string().nullable(), why: z.string() });
const bars = z.object({
  version: z.literal(1), latest: z.string().nullable(), weeks: z.array(z.string()),
  competitions: z.array(competition), unread: z.array(unread),
  played: z.array(z.string()).default([]), // the competitions of your lineups in your last six gameweeks, most entered first
});

export type RewardBars = z.infer<typeof bars>;
export type BarCompetition = z.infer<typeof competition>;
export type BarLevel = z.infer<typeof level>;
export type Unread = z.infer<typeof unread>;

export function readable(raw: unknown): RewardBars | null {
  const parsed = bars.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The groups the list switches between, in the order Sorare's lobby shows them. */
export const GROUPS = [
  { value: "In-season", label: "In-season" },
  { value: "Classic", label: "Classic" },
  { value: "Room", label: "Rooms" },
  { value: "Pro", label: "Pro" },
] as const;

const fmt = new Intl.NumberFormat("en-GB");

/** What a level gives, the best of it: a card, cash, essence, or XP only (never counted as paid). */
export type PrizeKind = "card" | "cash" | "essence" | "xp";
export function prizeKind(l: Pick<BarLevel, "cash" | "essence" | "card" | "xp">): PrizeKind {
  return l.card ? "card" : l.cash ? "cash" : l.essence ? "essence" : "xp";
}

/** What that level pays, in Sorare's own units: "$10", "50 essence", "a card", "500 XP". */
export function prizeLabel(p: { cash: number; essence: number; card: boolean; xp?: number } | null): string | null {
  if (!p) return null;
  const parts = [p.card ? "a card" : "", p.cash ? `$${fmt.format(p.cash)}` : "", p.essence ? `${fmt.format(p.essence)} essence` : ""];
  const paid = parts.filter(Boolean).join(" + ");
  return paid || (p.xp ? `${fmt.format(p.xp)} XP` : null);
}

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 - 20) % 10] ?? ["th", "st", "nd", "rd"][n % 100] ?? "th"}`;

/** Where a level sits: "1st", "6–10", "651–1,500", a room's "3rd", a Pro board's "Step 2". */
export function rankLabel(kind: BarCompetition["kind"], l: Pick<BarLevel, "lo" | "hi">): string {
  if (kind === "target") return `Step ${l.lo}`;
  return l.lo === l.hi ? ordinal(l.lo) : `${fmt.format(l.lo)}–${fmt.format(l.hi)}`;
}

/** The ladder best first: a ranked table is kept best first, a Pro board lowest step first. */
export function rungs(c: Pick<BarCompetition, "kind" | "ladder">): BarLevel[] {
  return c.kind === "target" ? [...c.ladder].reverse() : c.ladder;
}

/** The lowest level that pays anything, the one "paid from" means; -1 when none does. */
export function firstPaid(levels: BarLevel[]): number {
  return levels.reduce((last, l, i) => (prizeKind(l) !== "xp" ? i : last), -1);
}

/** Where a level sits on one shared points scale, as a share of it (0-1). */
export const SCALE = { lo: 200, hi: 750 };
export const share = (value: number): number => Math.min(1, Math.max(0, (value - SCALE.lo) / (SCALE.hi - SCALE.lo)));

/** Sorare's own art for each league (hot-linked, personal use): its icon, white on the league's colour, and its wordmark. */
const ART = "https://frontend-assets.sorare.com/football/so5_league";
const LEAGUES: Record<string, { slug: string; colour: string }> = {
  "LALIGA EA SPORTS": { slug: "seasonal-spain", colour: "#a3201a" },
  Champion: { slug: "seasonal-champions", colour: "#141210" },
  "European Champions": { slug: "special-weekly-european-champions", colour: "#0a1440" },
  "All Star": { slug: "seasonal-all_star", colour: "#2a2f86" },
  "Under 23": { slug: "seasonal-under_twenty_one", colour: "#0d5f52" },
  Contender: { slug: "seasonal-contenders", colour: "#384452" },
  Bundesliga: { slug: "seasonal-germany", colour: "#7d1420" },
  "English League Players": { slug: "seasonal-england", colour: "#3a1a66" },
  "English Second Division Players": { slug: "seasonal-england_second", colour: "#20304f" },
  "English 2nd Division Players": { slug: "seasonal-england_second", colour: "#20304f" },
  "Jupiler Pro League": { slug: "seasonal-jupiler", colour: "#1c2d55" },
  "K League 1": { slug: "seasonal-korea", colour: "#0b3b7a" },
  "J1 League": { slug: "seasonal-japan", colour: "#7a1630" },
  Eredivisie: { slug: "seasonal-netherlands", colour: "#9a3a0c" },
  "Ligue 1": { slug: "seasonal-france", colour: "#1b2a4a" },
  "Liga Portugal": { slug: "seasonal-portugal", colour: "#0f5a3a" },
  "Portuguese League": { slug: "seasonal-portugal", colour: "#0f5a3a" },
  SPFL: { slug: "seasonal-scotland", colour: "#22305e" },
  MLS: { slug: "seasonal-us", colour: "#1a2b4c" },
  "Italian League": { slug: "seasonal-italy", colour: "#123d7a" },
  "Turkish League": { slug: "seasonal-turkey", colour: "#8a1a1a" },
};
// The European Champions icon lives on Sorare's other host; its wordmark keeps the usual address.
const EURO_ICON = "https://assets.sorare.com/so5league/167f6baf-240a-4d2a-ab21-3c5e9f06b2e1/picture/icon-0052811bb046413c063dd0068b463786.png";

export type LeagueArt = { icon: string; logo: string; colour: string };
export function leagueArt(key: string): LeagueArt | null {
  const league = key.split(" | ")[0] ?? "";
  const found = LEAGUES[league];
  if (!found) return null;
  return {
    icon: league === "European Champions" ? EURO_ICON : `${ART}/${found.slug}/icon.svg?v=1`,
    logo: `${ART}/${found.slug}/logo.png?v=1`,
    colour: found.colour,
  };
}

/** The look of a pinned ladder: its own world for the big competitions, a plain league-coloured one for the rest. */
export function worldOf(c: Pick<BarCompetition, "key" | "kind">): "laliga" | "champion" | "europe" | "pro" | "league" {
  if (c.kind === "target") return "pro";
  const league = c.key.split(" | ")[0];
  return league === "LALIGA EA SPORTS" ? "laliga" : league === "Champion" ? "champion" : league === "European Champions" ? "europe" : "league";
}

/** Your pins and hidden competitions, kept in this browser. The competitions you play are pinned unless you unpin them. */
export type Prefs = { pinned: string[]; hidden: string[]; unpinned: string[] };
export const PREFS_KEY = "sofix.targets.v1";
export const DEFAULT_PREFS: Prefs = { pinned: [], hidden: [], unpinned: [] };

export function readPrefs(raw: string | null): Prefs {
  try {
    const parsed = z
      .object({ pinned: z.array(z.string()), hidden: z.array(z.string()), unpinned: z.array(z.string()).default([]) })
      .safeParse(JSON.parse(raw ?? "null"));
    return parsed.success ? parsed.data : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

/** The pinned competitions in order: the ones you play (most entered first), then the ones you pinned yourself. */
export function pinnedKeys(prefs: Prefs, played: string[]): string[] {
  const off = new Set([...prefs.unpinned, ...prefs.hidden]);
  const mine = played.filter((k) => !off.has(k));
  return [...mine, ...prefs.pinned.filter((k) => !mine.includes(k) && !prefs.hidden.includes(k))];
}

const without = (list: string[], key: string) => list.filter((k) => k !== key);

export function toggle(prefs: Prefs, key: string, what: "pin" | "hide", played: string[] = []): Prefs {
  if (what === "hide") {
    return prefs.hidden.includes(key)
      ? { ...prefs, hidden: without(prefs.hidden, key) }
      : { ...prefs, pinned: without(prefs.pinned, key), hidden: [...prefs.hidden, key] };
  }
  if (pinnedKeys(prefs, played).includes(key)) {
    return { ...prefs, pinned: without(prefs.pinned, key), unpinned: played.includes(key) ? [...without(prefs.unpinned, key), key] : prefs.unpinned };
  }
  return {
    pinned: played.includes(key) ? prefs.pinned : [...without(prefs.pinned, key), key],
    hidden: without(prefs.hidden, key),
    unpinned: without(prefs.unpinned, key),
  };
}
