import { database } from "./db";
import { cache } from "./cache";
import { isToday, missionDay, MISSIONS_TAG, plan, playingToday, ruleOf, type MissionPick, type MissionRow, type MissionsModel, type Rule } from "./missions";
import { RARITIES } from "./missionsToday";
import type { PlayingPlayer, Sorare } from "./play";
import type { Sheet } from "./playerSheet";
import { mergeMissionRecord } from "./missionStore";
import { applyMissionEdits, type MissionEdits } from "./missionEdits";

/**
 * The missions log (plans/roadmap.md 10.7, part 2): what Sofix picked for each daily mission, written down before the games, so the Audit can say how often
 * its picks were the right ones. One read model per mission day/rarity; legacy monthly records remain readable.
 *
 * Every day logs the Decisive Picker, which Sorare runs every day, whether or not that day's missions were loaded; a loaded day logs its other missions
 * too. Each of your cards with a game that day is a candidate, with its chance for each mission: after the games the refresh marks who did what each
 * mission asks (backend/app/sorare/missions.py), and the Audit compares Sofix's picks with the best your cards could have done.
 */

export const LOG_PREFIX = "missions_log:";
export const DAY_PREFIX = "missions_day:";
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
  card?: string;
  captured?: string;
  late?: boolean;
};
export type LogMission = {
  key: string; // source task instance ID, or a legacy title / assumed baseline ID
  aliases?: string[];
  title?: string;
  description: string;
  mode: MissionRow["mode"];
  rule: Rule;
  stats: string[];
  picks: number;
  sofix: string[];
  yours: MissionPick[];
  override?: { picks: MissionPick[]; note: string; at: string; revision: number; sourcePicks?: MissionPick[] };
  editRevision?: number;
  source?: MissionRow;
  sofixPicks?: MissionPick[];
};
export type LogRarity = { loaded: boolean; missions: LogMission[]; cands: LogCand[]; coverage?: "snapshot" | "missing"; captured?: string };
export type MonthLog = { days: Record<string, Record<string, LogRarity>> };

/** Fill missed dates honestly, using only the owner's requested baseline, never backfilled predictions. */
export function fillMissionDays(logs: MonthLog[], rarities: string[], now: Date): MonthLog[] {
  const days: MonthLog["days"] = {};
  for (const log of logs) for (const [day, entries] of Object.entries(log.days)) days[day] = { ...days[day], ...entries };
  const today = missionDay(now);
  const earliest = Object.keys(days).sort()[0] ?? today;
  const cutoff = new Date(`${today}T12:00:00Z`); cutoff.setUTCDate(cutoff.getUTCDate() - 29);
  for (let d = new Date(`${earliest}T12:00:00Z`); d.toISOString().slice(0, 10) <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d < cutoff) continue;
    const day = d.toISOString().slice(0, 10);
    days[day] ??= {};
    for (const rarity of rarities) days[day][rarity] ??= { ...nextDay(undefined, null, [], {}, rarity, d), coverage: "missing" };
  }
  return [{ days }];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Only an unloaded day assumes a baseline. Verified source lists, including SCORE and empty, stay exact. */
export function dayMissions(loaded: MissionRow[] | null): MissionRow[] {
  return loaded === null ? [DAILY_PICKER] : loaded.filter((m) => m.title.trim());
}

const asRow = (m: LogMission): MissionRow => ({ ...m.source, id: m.key, title: m.title ?? m.key, description: m.description, mode: m.mode, picks: m.picks, made: 0, period: m.source?.period ?? "DAILY", state: null, stats: m.stats, appearances: m.yours });

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
  const prior = (m: MissionRow) => prev?.missions.find((old) => old.key === m.id || ((!old.title || old.key === DAILY_PICKER.id) && same(old.title ?? old.key, m.title)));
  const frozen = (prev?.cands ?? []).filter((c) => new Date(c.k) <= now).map((c) => {
    const keys = Object.fromEntries(missions.flatMap((m) => { const old = prior(m); return old && old.key in c.c ? [[m.id, c.c[old.key]!]] : []; }));
    const did = c.r?.did ? Object.fromEntries(missions.flatMap((m) => { const old = prior(m); return old && old.key in c.r!.did! ? [[m.id, c.r!.did![old.key]!]] : []; })) : null;
    return { ...c, c: { ...c.c, ...keys }, ...(did ? { r: { ...c.r, did: { ...c.r?.did, ...did } } } : {}) };
  });
  const frozenSlugs = new Set(frozen.map((c) => c.s));
  const frozenPicks = (m: MissionRow) => (prior(m)?.sofix ?? []).filter((s) => frozenSlugs.has(s));

  const open = players.filter((p) => !frozenSlugs.has(p.player ?? ""));
  const { plans } = plan(missions.map((m) => ({ ...m, made: frozenPicks(m).length, appearances: [] })), rarity, open, sheets, now);

  const fresh: LogCand[] = [];
  for (const { p, game } of playingToday(players, rarity, now).candidates) {
    if (frozenSlugs.has(p.player!)) continue;
    const c: Record<string, number> = {};
    for (const one of plans) {
      const found = one.all.find((s) => s.slug === p.player && (!s.card || s.card === (p as { card?: string }).card));
      if (found) c[one.mission.id] = Math.round(found.chance * 1000) / 1000;
    }
    fresh.push({ s: p.player!, n: p.name, pic: p.pic, pos: p.pos, card: (p as { card?: string }).card, g: game.id ?? null, k: game.kickoff, c, captured: now.toISOString() });
  }

  for (const p of players.filter((p) => p.rarity === rarity && p.player)) for (const game of p.games) {
    if (missionDay(new Date(game.kickoff)) !== missionDay(now) || new Date(game.kickoff) > now || frozen.some((c) => c.s === p.player && c.g === game.id) || fresh.some((c) => c.s === p.player && c.g === game.id)) continue;
    fresh.push({ s: p.player!, n: p.name, pic: p.pic, pos: p.pos, card: (p as { card?: string }).card, g: game.id ?? null, k: game.kickoff, c: {}, captured: now.toISOString(), late: true });
  }
  return {
    loaded,
    coverage: "snapshot",
    captured: now.toISOString(),
    missions: missions.map((m, i) => ({
      key: m.id,
      aliases: [...new Set([...(prior(m) && prior(m)!.key !== m.id ? [prior(m)!.key] : []), ...(prior(m)?.aliases ?? [])])],
      title: m.title,
      source: m,
      description: m.description,
      mode: m.mode,
      rule: ruleOf(m),
      stats: m.stats ?? [],
      picks: m.picks,
      sofix: [...frozenPicks(m), ...plans[i]!.picks.map((pick) => pick.slug)],
      sofixPicks: [...(prior(m)?.sofixPicks ?? []).filter((p) => frozenSlugs.has(p.player)), ...plans[i]!.picks.map((p) => ({ player: p.slug, card: p.card, game: p.game ?? null, rarity, status: null }))],
      yours: m.appearances ?? prior(m)?.yours ?? [],
      ...(prior(m)?.override ? { override: prior(m)!.override } : {}),
    })),
    cands: [...frozen, ...fresh],
  };
}

/**
 * Writes today's picks into the daily ledger, for every rarity you hold cards of. Called where Neon is awake anyway: when the extension sends the
 * missions, at its check-in and after each refresh. Writes only when something changed. `missions` is the model just written, when the caller has it.
 */
export async function recordMissionPicks(data: Sorare | null, missions: MissionsModel | null, now: Date): Promise<boolean> {
  const sql = database();
  if (!sql || !data) return false;
  const { loadMissionPool } = await import("./missionsPool");
  const pool = await loadMissionPool();
  const sheets = pool?.sheets.players ?? {};
  const players = pool?.players ?? data.weeks.flatMap((w) => w.playing.players);
  const day = missionDay(now);
  const legacyKey = `${LOG_PREFIX}${day.slice(0, 7)}`;
  const rows = (await sql`SELECT payload FROM read_models WHERE key = ${legacyKey}`) as { payload: MonthLog }[];
  for (const rarity of RARITIES) {
    if (!players.some((p) => p.rarity === rarity) && !data.collection?.some((p) => p.rarity === rarity)) continue;
    const entry = missions?.[rarity];
    const loaded = entry && isToday(entry.seen_at, now) && (entry.verified || entry.missions.length) ? entry.missions : null;
    await mergeMissionRecord<MonthLog>(`${DAY_PREFIX}${day}:${rarity}`, (before) => ({ days: { [day]: { [rarity]: { ...nextDay(before?.days[day]?.[rarity] ?? rows[0]?.payload.days[day]?.[rarity], loaded, players, sheets, rarity, now), coverage: pool?.complete ? "snapshot" : "missing" } } } }));
  }
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
  key?: string;
  source?: LogMission;
  candidates?: LogCand[];
  reason?: string;
  corrected?: boolean;
};

/** The missions log of one rarity, newest day first, from the months given (`names`: who a pick of yours is when Sofix had no candidate on him). */
export function missionHistory(logs: MonthLog[], rarity: string, names: Map<string, { name: string; pic: string }>, limit = 30): HistoryDay[] {
  const out: HistoryDay[] = [];
  const combined: MonthLog = { days: {} };
  for (const log of logs) for (const [day, rarities] of Object.entries(log.days ?? {})) combined.days[day] = { ...combined.days[day], ...rarities };
  const entries = Object.entries(combined.days).sort(([a], [b]) => b.localeCompare(a)).slice(0, limit);
  // a pick of yours on a day Sofix had no candidate for him: his name from another day of the log, else this week's players, else his slug read out
  const everyone = new Map(names);
  for (const [, rarities] of entries) for (const entry of Object.values(rarities)) for (const c of entry.cands) everyone.set(c.s, { name: c.n, pic: c.pic });
  const readable = (slug: string) => slug.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
  for (const [day, rarities] of entries) {
    const entry = rarities[rarity];
    if (!entry) continue;
    if (!entry.missions.length && entry.loaded) out.push({ day, mission: "No missions — confirmed by Sorare", loaded: true, sofix: [], yours: [], missed: [], score: null, reason: "Verified empty mission list at the last import." });
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
      const yours = (m.override?.picks ?? m.yours).map((y): HistoryCard => {
        const imported = m.override ? m.yours.find((p) => p.player === y.player && p.game === y.game && (p.card ?? null) === (y.card ?? null)) : y;
        const status = imported?.status;
        return { ...known(y.player), state: status === "SUCCESS" ? "did" : status === "FAILURE" ? "didnt" : !y.game || cands.get(y.player)?.g !== y.game ? "waiting" : checked(y.player) };
      });
      const sofix = m.sofix.map((s): HistoryCard => ({ ...known(s), state: checked(s) }));
      const settled = cands.size > 0 && [...cands.values()].every((c) => c.r);
      const achievers = [...cands.keys()].filter((s) => checked(s) === "did");
      out.push({
        day,
        mission: m.title ?? m.key,
        key: m.key,
        source: m,
        candidates: entry.cands,
        corrected: Boolean(m.override),
        reason: !entry.cands.length ? "No forecast captured before kickoff; eligible cards were not verified." : !sofix.length ? "No supported pre-kickoff recommendation recorded." : undefined,
        loaded: entry.loaded,
        sofix,
        yours,
        missed: settled ? achievers.filter((s) => !m.sofix.includes(s)).map((s) => ({ ...known(s), state: "did" as const })) : [],
        score: settled && sofix.length && entry.coverage !== "missing" && !entry.cands.some((c) => c.late) ? { got: achievers.filter((s) => m.sofix.includes(s)).length, best: Math.min(m.picks, achievers.length) } : null,
      });
    }
  }
  return out;
}

// Local development and the browser tests have no Neon: they ask the stand-in API instead.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

/** The last two months of the log, newest first; cached five minutes so a page view does not wake Neon each time. */
const cachedLog = cache(
  async (): Promise<MonthLog[]> => {
    const sql = database();
    if (sql) {
      const rows = (await sql`SELECT key, payload FROM read_models WHERE key LIKE ${`${LOG_PREFIX}%`} OR key LIKE ${`${DAY_PREFIX}%`} OR key LIKE 'missions_edit:%' ORDER BY key DESC LIMIT 500`) as { key: string; payload: MonthLog | MissionEdits }[];
      const logs = rows.filter((r) => !r.key.startsWith("missions_edit:")).sort((a, b) => Number(a.key.startsWith(DAY_PREFIX)) - Number(b.key.startsWith(DAY_PREFIX))).map((r) => r.payload as MonthLog);
      return applyMissionEdits(logs, rows.filter((r) => r.key.startsWith("missions_edit:")).map((r) => r.payload as MissionEdits));
    }
    const response = await fetch(`${API_BASE}/api/missions/log`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const body = (await response.json()) as { data?: MonthLog[] };
    return body?.data ?? [];
  },
  ["missions-log-v2"],
  { tags: [MISSIONS_TAG, "sorare"], revalidate: 300 },
);

export async function loadMissionLog(): Promise<MonthLog[]> {
  try {
    return (await cachedLog()).filter((log) => log && typeof log.days === "object");
  } catch (error) {
    console.error(`[missions-log] could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return [];
  }
}

/** Archived imports have source dates; never assign them the day they were fetched. */
export async function recordHistoricalMissions(outcomes: Record<string, { missions: MissionRow[] }>): Promise<number> {
  const sql = database(); if (!sql) throw new Error("No mission storage");
  const sourceDay = (at: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
    return ["year", "month", "day"].map((key) => parts.find((p) => p.type === key)!.value).join("-");
  };
  const groups = new Map<string, { day: string; rarity: string; tasks: MissionRow[] }>();
  for (const [rarity, outcome] of Object.entries(outcomes)) for (const task of outcome.missions) {
    if (!task.startDate || !Number.isFinite(Date.parse(task.startDate))) continue;
    const day = sourceDay(new Date(task.startDate));
    if (Date.parse(`${day}T12:00:00Z`) < Date.now() - 61 * 86_400_000 || day > sourceDay(new Date())) continue;
    const key = `${DAY_PREFIX}${day}:${rarity}`;
    const group = groups.get(key) ?? { day, rarity, tasks: [] };
    group.tasks.push(task); groups.set(key, group);
  }
  const legacy = await sql`SELECT key, payload FROM read_models WHERE key LIKE ${`${LOG_PREFIX}%`} ORDER BY key DESC LIMIT 3` as { key: string; payload: MonthLog }[];
  const entries = [...groups.entries()];
  for (let i = 0; i < entries.length; i += 4) await Promise.all(entries.slice(i, i + 4).map(async ([key, { day, rarity, tasks }]) => {
    await mergeMissionRecord<MonthLog>(key, (stored) => {
      let old = stored?.days[day]?.[rarity] ?? legacy.find((l) => l.key === `${LOG_PREFIX}${day.slice(0, 7)}`)?.payload.days[day]?.[rarity] ?? { loaded: false, cands: [], missions: [] };
      for (const task of tasks) {
        const prior = old.missions.find((m) => m.key === task.id || (!m.title && same(m.key, task.title)) || m.key === DAILY_PICKER.id && same(task.title, DAILY_PICKER.title));
        const next: LogMission = { ...prior, key: task.id, aliases: [...new Set([...(prior && prior.key !== task.id ? [prior.key] : []), ...(prior?.aliases ?? [])])], source: task, title: task.title, description: task.description, mode: task.mode, rule: ruleOf(task), stats: task.stats ?? [], picks: task.picks, sofix: prior?.sofix ?? [], yours: task.appearances ?? prior?.yours ?? [] };
        const missions = [...old.missions.filter((m) => m !== prior), next];
        const cands = old.cands.map((c) => prior && prior.key !== next.key ? { ...c, c: { ...c.c, ...(prior.key in c.c ? { [next.key]: c.c[prior.key]! } : {}) }, ...(c.r?.did ? { r: { ...c.r, did: { ...c.r.did, ...(prior.key in c.r.did ? { [next.key]: c.r.did[prior.key]! } : {}) } } } : {}) } : c);
        old = { ...old, loaded: true, missions, cands };
      }
      return { days: { [day]: { [rarity]: old } } };
    });
  }));
  return [...groups.values()].reduce((n, g) => n + g.tasks.length, 0);
}

/** `recordMissionPicks` with today's data, for a route to run after it answers: a failure here is logged and never reaches the caller. */
export async function recordQuietly(missions?: MissionsModel | null, strict = false): Promise<void> {
  try {
    const [{ loadSorare }, { loadMissions }] = await Promise.all([import("./playData"), import("./missionsData")]);
    const [data, model] = await Promise.all([loadSorare(), missions === undefined ? loadMissions() : missions]);
    const saved = await recordMissionPicks(data, model, new Date());
    if (strict && !saved) throw new Error("Mission history unavailable");
  } catch (error) {
    if (strict) throw error;
    console.error(`[missions-log] not written: ${error instanceof Error ? error.message : "unknown"}`);
  }
}
