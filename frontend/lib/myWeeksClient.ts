import { runWeekLineups, weekWon, type GameweekLineup, type WeekLineupsAnswer, type WeekWon } from "./entered";
import { needsScoring, WeekBody, withScoring, type MyWeeks, type SavedWeek } from "./myWeeks";
import { REFRESH_HEADER } from "./refresh";

const BLOCKING = new Set(["no-extension", "no-tab", "no-bridge", "signed-out", "outdated"]);
const CHECKED = "sofix:weeks-checked:v1";
type Failure = Exclude<WeekLineupsAnswer, { state: "ok" }>;
export type ArchiveResult = MyWeeks & { issue?: Failure; unavailable?: boolean };
export type EnteredRead = WeekLineupsAnswer & { saved?: boolean; archived?: boolean; savedAt?: string; saving?: boolean; refreshing?: boolean; refreshIssue?: Failure };
type SuccessfulRead = Extract<EnteredRead, { state: "ok" }>;
const SNAPSHOT = "sofix:entered:v1:";
let queue: Promise<unknown> = Promise.resolve();
const inFlight = new Map<string, Promise<WeekLineupsAnswer>>();
let lastRead = 0;
let archiving: Promise<ArchiveResult> | null = null;

async function stored(): Promise<MyWeeks> {
  const response = await fetch("/api/my-week", { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("Week storage unavailable");
  return response.json() as Promise<MyWeeks>;
}
function read(slug: string): Promise<WeekLineupsAnswer> {
  const active = inFlight.get(slug);
  if (active) return active;
  const next = queue.then(async () => {
    const pause = 350 - (Date.now() - lastRead);
    if (pause > 0) await new Promise((resolve) => setTimeout(resolve, pause));
    lastRead = Date.now();
    return runWeekLineups(slug);
  }).finally(() => inFlight.delete(slug));
  queue = next.catch(() => undefined);
  inFlight.set(slug, next);
  return next;
}
async function save(slug: string, lineups: GameweekLineup[], onSaved?: (archived: boolean) => void): Promise<boolean> {
  try {
    const response = await fetch("/api/my-week", { method: "POST", headers: { [REFRESH_HEADER]: "1", "Content-Type": "application/json" }, body: JSON.stringify({ slug, lineups }), signal: AbortSignal.timeout(8_000) });
    if (response.ok) {
      const result = await response.json().catch(() => null) as { archived?: boolean } | null;
      onSaved?.(result?.archived === true);
    }
    return response.ok;
  } catch { return false; }
}
function browserRead(slug: string): SuccessfulRead | null {
  try {
    const raw = window.localStorage.getItem(`${SNAPSHOT}${slug}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as SuccessfulRead & { slug?: string };
    const parsed = WeekBody.safeParse(value);
    if (!parsed.success || parsed.data.slug !== slug || value.state !== "ok" || (value.savedAt && !Number.isFinite(Date.parse(value.savedAt)))) return null;
    return { state: "ok", lineups: parsed.data.lineups, saved: value.saved === true, archived: value.archived === true, savedAt: value.savedAt };
  } catch { return null; }
}
function cacheRead(slug: string, value: SuccessfulRead): SuccessfulRead {
  try { window.localStorage.setItem(`${SNAPSHOT}${slug}`, JSON.stringify({ ...value, slug, saving: undefined, refreshing: undefined, refreshIssue: undefined })); } catch { /* server storage remains available */ }
  return value;
}
/** Show the last successful selected-GW read first; live refresh and old metadata enrichment never hide it. */
export async function readEnteredWeek(slug: string, useSaved = true, onUpdate?: (answer: EnteredRead) => void): Promise<EnteredRead> {
  const cached = browserRead(slug);
  const refresh = async (previous?: SuccessfulRead, active?: Promise<WeekLineupsAnswer>): Promise<EnteredRead> => {
    const answer = await (active ?? read(slug));
    if (answer.state !== "ok") return previous ? { ...previous, refreshing: false, refreshIssue: answer } : answer;
    const lineups = previous?.archived ? withScoring(previous.lineups, answer.lineups) : answer.lineups;
    const at = previous?.archived ? previous.savedAt : new Date().toISOString();
    const value = cacheRead(slug, { state: "ok", lineups, saved: Boolean(previous?.archived), archived: previous?.archived ?? false, savedAt: at, saving: true });
    onUpdate?.(value);
    let archived = Boolean(previous?.archived);
    const accepted = await save(slug, lineups, final => { archived ||= final; });
    return cacheRead(slug, { ...value, lineups: archived ? lineups.filter(lineup => !lineup.draft) : lineups, archived, saved: accepted || Boolean(previous?.archived && previous.saved), saving: false, refreshing: false });
  };
  const work = async (): Promise<EnteredRead> => {
    const storage = stored().catch(() => null);
    const active = useSaved ? undefined : read(slug);
    // A stuck storage request cannot delay a working Sorare read.
    type First = { known: MyWeeks | null } | { answer: WeekLineupsAnswer };
    const first: First = active ? await Promise.race<First>([storage.then(known => ({ known })), active.then<First>(async answer => answer.state === "ok" ? { answer } : { known: await storage })]) : { known: await storage };
    if ("answer" in first) return refresh(cached ?? undefined, Promise.resolve(first.answer));
    const archived = first.known?.weeks.find(week => week.slug === slug);
    const snapshot = archived ?? first.known?.snapshots?.find(week => week.slug === slug);
    const fromServer: SuccessfulRead | null = snapshot ? { state: "ok", lineups: snapshot.lineups, saved: true, archived: Boolean(archived), savedAt: snapshot.savedAt } : null;
    const previous = fromServer?.archived || !cached || (fromServer?.savedAt ?? "") >= (cached.savedAt ?? "") ? fromServer ?? cached : cached;
    if (!previous) return refresh(undefined, active);
    cacheRead(slug, previous);
    const updating = !previous.archived || previous.lineups.some(needsScoring);
    // Deliver the saved state before any already-resolved refresh callback.
    if (updating) setTimeout(() => { void refresh(previous, active).then(answer => onUpdate?.(answer)); }, 0);
    return { ...previous, refreshing: updating };
  };
  if (cached) {
    void work().then(answer => onUpdate?.(answer));
    return { ...cached, refreshing: !cached.archived || cached.lineups.some(needsScoring) };
  }
  return work();
}
/** Shared by Home and Rewards. Reads are sequential, coalesced with selected-week reads, and attempted once per day. */
export function archiveFinishedWeeks(): Promise<ArchiveResult> {
  if (archiving) return archiving;
  archiving = (async () => {
    let known: MyWeeks;
    try { known = await stored(); } catch { return { weeks: [], pending: [], unavailable: true }; }
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (window.localStorage.getItem(CHECKED) === today) return known;
    } catch { /* storage disabled: the in-flight guard still prevents overlapping reads */ }
    let issue: Failure | undefined;
    let unavailable = false;
    for (const week of known.pending) {
      const answer = await read(week.slug);
      if (answer.state === "ok") {
        remember(week.slug, weekWon(answer.lineups));
        if (weekWon(answer.lineups).final && !await save(week.slug, answer.lineups)) unavailable = true;
      } else {
        issue = answer;
        if (BLOCKING.has(answer.state)) break;
      }
    }
    try { known = await stored(); } catch { unavailable = true; }
    if (!issue && !unavailable) {
      try { window.localStorage.setItem(CHECKED, today); } catch { /* optional cache */ }
    }
    return { ...known, issue, unavailable };
  })().finally(() => { archiving = null; });
  return archiving;
}
export function remembered(slug: string): WeekWon | null {
  try {
    const raw = window.localStorage.getItem(`sofix:won:v1:${slug}`);
    const value = raw ? JSON.parse(raw) as WeekWon : null;
    return value?.final && typeof value.essence === "number" && typeof value.cash === "number" ? value : null;
  } catch { return null; }
}
function remember(slug: string, won: WeekWon): void {
  if (!won.final) return;
  try { window.localStorage.setItem(`sofix:won:v1:${slug}`, JSON.stringify(won)); } catch { /* optional browser fallback */ }
}
export function wonWeeks(weeks: SavedWeek[]): Record<string, WeekWon> {
  return Object.fromEntries(weeks.map((week) => [week.slug, weekWon(week.lineups)]));
}
