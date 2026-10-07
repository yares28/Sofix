import { database } from "./db";
import { unstable_cache } from "next/cache";
import { fit, isToday, missionDay, MISSIONS_TAG, plan, playingToday, ruleOf, type MissionPick, type MissionRow, type MissionsModel, type Rule } from "./missions";
import { RARITIES } from "./missionsToday";
import type { PlayingPlayer, Sorare } from "./play";
import type { Sheet, Sheets } from "./playerSheet";

/**
 * The missions log (plans/roadmap.md 10.7, part 2): what Sofix picked for each daily mission, written down before the games, so the Audit can say how often
 * its picks were the right ones. One read model per month (`missions_log:YYYY-MM`), one entry per Madrid day and rarity.
 *
 * Every day logs the Decisive Picker, which Sorare runs every day, whether or not that day's missions were loaded; a loaded day logs its other missions
 * too. Each of your cards with a game that day is a candidate, with its chance for each mission: after the games the refresh marks who did what each
 * mission asks (backend/app/sorare/missions.py), and the Audit compares Sofix's picks with the best your cards could have done.
 */

export const LOG_PREFIX = "missions_log:";
export const DAILY_PICKER: MissionRow = {
  id: "daily-decisive-picker",
  title: "Decisive Picker",
  description: "Pick players who get a positive decisive action in today's matches.",
  mode: "DECISIVE",
  picks: 3,
  made: 0,
  period: "DAILY",
  state: null,
};

/** What happened to a candidate in his game, written by the refresh a day after it: `void` when the game was never played or scored. */
export type LogResult = { void?: true; played?: boolean; did?: Record<string, boolean> };
export type LogCand = {
  s: string; // player slug
  n: string; // name
  pic: string;
  pos: string;
  g: string | null; // Sorare's game id
  k: string; // kick-off
  c: Record<string, number>; // his chance for each mission (by its key), when he has one
  r?: LogResult;
};
export type LogMission = {
  key: string; // the mission's title: Sorare's ids change every day
  description: string;
  mode: MissionRow["mode"];
  rule: Rule;
  stats: string[];
  picks: number;
  sofix: string[];
  yours: MissionPick[];
};
export type LogRarity = { loaded: boolean; missions: LogMission[]; cands: LogCand[] };
export type MonthLog = { days: Record<string, Record<string, LogRarity>> };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The day's missions: the loaded ones (a SCORE mission is not ranked, so not logged), and the Decisive Picker in any case. */
export function dayMissions(loaded: MissionRow[] | null): MissionRow[] {
  const real = (loaded ?? []).filter((m) => m.title.trim() && m.mode !== "SCORE");
  return real.some((m) => same(m.title, DAILY_PICKER.title)) ? real : [...real, DAILY_PICKER];
}

const asRow = (m: LogMission): MissionRow => ({ id: m.key, title: m.key, description: m.description, mode: m.mode, picks: m.picks, made: 0, period: "DAILY", state: null, stats: m.stats, appearances: m.yours });

/**
 * One rarity's log for today, from what it held before (`prev`) and the plans now. A candidate whose game has kicked off is frozen with what was said of
 * him, and so is a pick on him; until then the latest run wins, so a pick replaced before its game is dropped. Later runs fill only the slots the frozen
 * picks leave. Sofix's choice is its full one (the mission's picks), whatever you already picked on Sorare.
 */
export function nextDay(
  prev: LogRarity | undefined,
  loadedList: MissionRow[] | null,
  players: PlayingPlayer[],
  sheets: Record<string, Sheet | undefined>,
  rarity: string,
  now: Date,
): LogRarity {
  const loaded = Boolean(loadedList) || Boolean(prev?.loaded);
  // A list loaded earlier today stays the day's list if a later run has none (the reset falls inside a Madrid day).
  const missions = loadedList ? dayMissions(loadedList) : prev?.loaded ? prev.missions.map(asRow) : dayMissions(null);
  const frozen = (prev?.cands ?? []).filter((c) => new Date(c.k) <= now);
  const frozenSlugs = new Set(frozen.map((c) => c.s));
  const frozenPicks = (key: string) => (prev?.missions.find((m) => same(m.key, key))?.sofix ?? []).filter((s) => frozenSlugs.has(s));

  const fresh: LogCand[] = [];
  for (const { p, game } of playingToday(players, rarity, now).candidates) {
    if (frozenSlugs.has(p.player!)) continue;
    const c: Record<string, number> = {};
    for (const m of missions) {
      const found = fit(ruleOf(m), p, sheets[p.player!] ?? null);
      if (found) c[m.title] = Math.round(found.chance * 1000) / 1000;
    }
    if (Object.keys(c).length) fresh.push({ s: p.player!, n: p.name, pic: p.pic, pos: p.pos, g: game.id ?? null, k: game.kickoff, c });
  }

  const open = players.filter((p) => !frozenSlugs.has(p.player ?? ""));
  const { plans } = plan(
    missions.map((m) => ({ ...m, made: frozenPicks(m.title).length })),
    rarity,
    open,
    sheets,
    now,
  );
  return {
    loaded,
    missions: missions.map((m, i) => ({
      key: m.title,
      description: m.description,
      mode: m.mode,
      rule: ruleOf(m),
      stats: m.stats ?? [],
      picks: m.picks,
      sofix: [...frozenPicks(m.title), ...plans[i]!.picks.map((pick) => pick.slug)],
      yours: m.appearances?.length ? m.appearances : (prev?.missions.find((x) => same(x.key, m.title))?.yours ?? []),
    })),
    cands: [...frozen, ...fresh],
  };
}

/**
 * Writes today's picks into the month's log, for every rarity you hold cards of. Called where Neon is awake anyway: when the extension sends the
 * missions, at its check-in and after each refresh. Writes only when something changed. `missions` is the model just written, when the caller has it.
 */
export async function recordMissionPicks(data: Sorare | null, missions: MissionsModel | null, now: Date): Promise<boolean> {
  const sql = database();
  if (!sql || !data) return false;
  const sheets = ((await import("./data/stat_sheets.json")).default as unknown as Sheets).players;
  const players = data.weeks.flatMap((w) => w.playing.players);
  const day = missionDay(now);
  const key = `${LOG_PREFIX}${day.slice(0, 7)}`;
  const rows = (await sql`SELECT payload FROM read_models WHERE key = ${key}`) as { payload: MonthLog }[];
  const before = rows[0]?.payload ?? { days: {} };
  const today: Record<string, LogRarity> = { ...(before.days[day] ?? {}) };
  for (const rarity of RARITIES) {
    if (!players.some((p) => p.rarity === rarity)) continue;
    const entry = missions?.[rarity];
    const loaded = entry && isToday(entry.seen_at, now) ? entry.missions : null;
    const next = nextDay(today[rarity], loaded, players, sheets, rarity, now);
    if (next.cands.length || next.missions.some((m) => m.yours.length) || today[rarity]) today[rarity] = next;
  }
  const after: MonthLog = { days: { ...before.days, [day]: today } };
  if (JSON.stringify(after) === JSON.stringify(before)) return false;
  // ponytail: last writer wins on the month's row; two writes at once only differ in picks not yet frozen. Per-day rows if it ever bites.
  await sql`
    INSERT INTO read_models (key, payload, updated_at)
    VALUES (${key}, ${JSON.stringify(after)}::json, now())
    ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`;
  return true;
}

/** A card in the history: `did` / `didnt` once known (Sorare's verdict on your picks, the refresh's check on Sofix's), `waiting` until then, `void` when
 * his game was never played or scored. */
export type HistoryCard = { slug: string; name: string; pic: string; state: "did" | "didnt" | "waiting" | "void" };
/** One mission on one day of the log, as soon as it is written: Sofix's picks, yours, and once every candidate's game is checked, the cards that did it
 * and were not picked (`missed`) and Sofix's score against the best possible (`best`: its picks or the achievers, the fewer; 0: nobody could). */
export type HistoryDay = {
  day: string;
  mission: string;
  loaded: boolean;
  sofix: HistoryCard[];
  yours: HistoryCard[];
  missed: HistoryCard[];
  score: { got: number; best: number } | null;
};

/** The missions log of one rarity, newest day first, from the months given (`names`: who a pick of yours is when Sofix had no candidate on him). */
export function missionHistory(logs: MonthLog[], rarity: string, names: Map<string, { name: string; pic: string }>, limit = 30): HistoryDay[] {
  const out: HistoryDay[] = [];
  const entries = logs.flatMap((log) => Object.entries(log.days ?? {})).sort(([a], [b]) => b.localeCompare(a));
  // a pick of yours on a day Sofix had no candidate for him: his name from another day of the log, else this week's players, else his slug read out
  const everyone = new Map(names);
  for (const [, rarities] of entries) for (const entry of Object.values(rarities)) for (const c of entry.cands) everyone.set(c.s, { name: c.n, pic: c.pic });
  const readable = (slug: string) => slug.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
  for (const [day, rarities] of entries) {
    const entry = rarities[rarity];
    if (!entry) continue;
    for (const m of entry.missions) {
      const cands = new Map(entry.cands.filter((c) => m.key in c.c).map((c) => [c.s, c]));
      const known = (slug: string) => {
        const c = cands.get(slug);
        return { slug, name: c?.n ?? everyone.get(slug)?.name ?? readable(slug), pic: c?.pic ?? everyone.get(slug)?.pic ?? "" };
      };
      const checked = (slug: string): HistoryCard["state"] => {
        const r = cands.get(slug)?.r;
        return !r ? "waiting" : r.void ? "void" : r.did?.[m.key] ? "did" : "didnt";
      };
      const yours = m.yours.map((y): HistoryCard => ({
        ...known(y.player),
        state: y.status === "SUCCESS" ? "did" : y.status === "FAILURE" ? "didnt" : checked(y.player),
      }));
      const sofix = m.sofix.map((s): HistoryCard => ({ ...known(s), state: checked(s) }));
      if (!sofix.length && !yours.length) continue;
      const settled = cands.size > 0 && [...cands.values()].every((c) => c.r);
      const achievers = [...cands.keys()].filter((s) => checked(s) === "did");
      out.push({
        day,
        mission: m.key,
        loaded: entry.loaded,
        sofix,
        yours,
        missed: settled ? achievers.filter((s) => !m.sofix.includes(s)).map((s) => ({ ...known(s), state: "did" as const })) : [],
        score: settled ? { got: achievers.filter((s) => m.sofix.includes(s)).length, best: Math.min(m.picks, achievers.length) } : null,
      });
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

// Local development and the browser tests have no Neon: they ask the stand-in API instead.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

/** The last two months of the log, newest first; cached five minutes so a page view does not wake Neon each time. */
const cachedLog = unstable_cache(
  async (): Promise<MonthLog[]> => {
    const sql = database();
    if (sql) {
      const rows = (await sql`SELECT payload FROM read_models WHERE key LIKE ${`${LOG_PREFIX}%`} ORDER BY key DESC LIMIT 2`) as { payload: MonthLog }[];
      return rows.map((row) => row.payload);
    }
    const response = await fetch(`${API_BASE}/api/missions/log`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const body = (await response.json()) as { data?: MonthLog[] };
    return body?.data ?? [];
  },
  ["missions-log-v1"],
  { tags: [MISSIONS_TAG], revalidate: 300 },
);

export async function loadMissionLog(): Promise<MonthLog[]> {
  try {
    return (await cachedLog()).filter((log) => log && typeof log.days === "object");
  } catch (error) {
    console.error(`[missions-log] could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return [];
  }
}

/** `recordMissionPicks` with today's data, for a route to run after it answers: a failure here is logged and never reaches the caller. */
export async function recordQuietly(missions?: MissionsModel | null): Promise<void> {
  try {
    const [{ loadSorare }, { loadMissions }] = await Promise.all([import("./playData"), import("./missionsData")]);
    const [data, model] = await Promise.all([loadSorare(), missions === undefined ? loadMissions() : missions]);
    await recordMissionPicks(data, model, new Date());
  } catch (error) {
    console.error(`[missions-log] not written: ${error instanceof Error ? error.message : "unknown"}`);
  }
}
