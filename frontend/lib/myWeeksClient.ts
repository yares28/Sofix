import { runWeekLineups, weekWon, type GameweekLineup, type WeekLineupsAnswer, type WeekWon } from "./entered";
import { type MyWeeks, type SavedWeek } from "./myWeeks";
import { REFRESH_HEADER } from "./refresh";

const BLOCKING = new Set(["no-extension", "no-tab", "no-bridge", "signed-out", "outdated"]);
const CHECKED = "sofix:weeks-checked:v1";
type Failure = Exclude<WeekLineupsAnswer, { state: "ok" }>;
export type ArchiveResult = MyWeeks & { issue?: Failure; unavailable?: boolean };
export type EnteredRead = WeekLineupsAnswer & { saved?: boolean };
let queue: Promise<unknown> = Promise.resolve();
const inFlight = new Map<string, Promise<WeekLineupsAnswer>>();
let lastRead = 0;
let archiving: Promise<ArchiveResult> | null = null;

async function stored(): Promise<MyWeeks> {
  const response = await fetch("/api/my-week", { cache: "no-store" });
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
async function save(slug: string, lineups: GameweekLineup[]): Promise<boolean> {
  if (!weekWon(lineups).final) return false;
  try {
    const response = await fetch("/api/my-week", { method: "POST", headers: { [REFRESH_HEADER]: "1", "Content-Type": "application/json" }, body: JSON.stringify({ slug, lineups }) });
    return response.ok;
  } catch { return false; }
}
/** Finished weeks work on a phone or during a Sorare outage. Live weeks are still re-read on request. */
export async function readEnteredWeek(slug: string): Promise<EnteredRead> {
  let known: MyWeeks | null = null;
  try { known = await stored(); } catch { /* the live read can still work */ }
  const saved = known?.weeks.find((week) => week.slug === slug);
  if (saved) return { state: "ok", lineups: saved.lineups, saved: true };
  const answer = await read(slug);
  if (answer.state === "ok" && known?.pending.some((week) => week.slug === slug)) await save(slug, answer.lineups);
  return answer;
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
      window.localStorage.setItem(CHECKED, today);
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
