import type { ProCard, ProPlanned, ProWeek } from "./proWeek";

/** The Pro teamsheet watch as the page shows it (plans/pro-page.md, "Teamsheet watch"; the clock looks, `pro-sheets.yml` re-plans). */
export const WATCH_KEY = "pro_watch";
export const BEAT_KEY = "pro_watch_beat";
export const AHEAD_MS = 75 * 60_000; // the clock looks from 75 minutes before kickoff
export const POLL_MS = 5 * 60_000; // the page asks whether the block moved no more often than the clock looks
export const STALE_MS = 12 * 60_000; // two looks missed: say so

export type Sheets = ProWeek["sheets"];
export type SheetRun = { status: string; conclusion: string | null; at: string } | null;
export type SheetStatus = { label: string; tone: "soon" | "wait" | "out" | "warn"; check: boolean };

const timeOf = (ms: number) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(ms));

/** Whether Sorare's announced eleven of this card's game has him starting. */
export function inEleven(card: Pick<ProCard, "player" | "fixture">, sheets: Sheets): boolean {
  const sheet = card.fixture?.id ? sheets[card.fixture.id] : undefined;
  return !!sheet && Object.values(sheet.teams).some((team) => team.starters.includes(card.player));
}

/** The pill of one lineup: when its teams come out, that they are out, or when the clock last looked. */
export function sheetStatus(lineup: ProPlanned, sheets: Sheets, now: number, checkedAt: string | null, run: SheetRun = null): SheetStatus {
  const start = Date.parse(lineup.start);
  const known = lineup.starters.filter((s) => !s.late);
  const xi = known.filter((s) => inEleven(s, sheets));
  if (known.length && xi.length === known.length) {
    const at = Math.max(...known.map((s) => Date.parse(sheets[s.fixture!.id!]!.at)));
    return { label: `Teams out ${timeOf(at)}`, tone: "out", check: false };
  }
  const watching = now >= start - AHEAD_MS && now < start;
  if (!watching) return { label: `Teams ~${timeOf(start - 3_600_000)}`, tone: "soon", check: false };
  if (run && run.conclusion && run.conclusion !== "success" && Date.parse(run.at) >= start - AHEAD_MS) {
    return { label: "Rebuild failed", tone: "warn", check: true };
  }
  if (xi.length) return { label: `${xi.length} of ${known.length} in the XI`, tone: "wait", check: true };
  const looked = checkedAt ? Date.parse(checkedAt) : null;
  if (looked !== null && now - looked <= STALE_MS) return { label: `Checked ${timeOf(looked)}`, tone: "wait", check: true };
  return { label: looked !== null ? `Not checked since ${timeOf(looked)}` : "Not checked yet", tone: "warn", check: true };
}

/** Whether any lineup of the week is inside its window with teams still to come: only then does the page ask anything. */
export function watching(lineups: ProPlanned[], sheets: Sheets, now: number): boolean {
  return lineups.some((l) => sheetStatus(l, sheets, now, null).check);
}

/** The block's version as the clock's watch list repeats it: a refresh or a re-plan moves it. */
export const versionOf = (block: { builtAt: string | null; sheetsAt?: string | null }) => `${block.builtAt ?? ""}|${block.sheetsAt ?? ""}`;
