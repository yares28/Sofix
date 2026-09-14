import type { ApiResponse, RefreshStatus } from "./types";

/** Cache tag for the fixture grid fetch; revalidated when a refresh finishes. */
export const GRID_TAG = "fixture-grid";
/** Custom header the refresh route requires; a cross-site form or image request can't set it. */
export const REFRESH_HEADER = "x-fdr-refresh";
export const STALE_AFTER_HOURS = 36;

interface HeaderLike {
  get(name: string): string | null;
}

/**
 * Only the board's own fetch() calls may use the refresh route.
 * Browsers set Sec-Fetch-Site on every request; older ones fall back to comparing Origin with Host.
 */
export function isSameOriginRequest(headers: HeaderLike): boolean {
  if (headers.get(REFRESH_HEADER) !== "1") return false;
  const site = headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const origin = headers.get("origin");
  const host = headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function isStale(lastSyncedIso: string | null, now: number): boolean {
  if (!lastSyncedIso) return false;
  const synced = Date.parse(lastSyncedIso);
  return Number.isFinite(synced) && now - synced > STALE_AFTER_HOURS * 3_600_000;
}

export type RefreshView =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "running"; step: string | null }
  | { kind: "done"; availableAt: number }
  | { kind: "cooldown"; availableAt: number }
  | { kind: "failed"; message: string; availableAt: number };

const STEP_COPY: Record<string, string> = {
  sync: "Syncing fixtures…",
  predict: "Updating predictions…",
  weather: "Fetching weather…",
};

function availableAt(data: RefreshStatus | null | undefined, now: number): number {
  return now + Math.max(0, data?.retry_after ?? 0) * 1000;
}

/** What to show after POST /api/refresh answers. */
export function viewAfterStart(status: number, body: ApiResponse<RefreshStatus> | null, now: number): RefreshView {
  const data = body?.data;
  if (status === 202) return { kind: "running", step: data?.run?.step ?? null };
  if (status === 409) return { kind: "running", step: data?.run?.step ?? null };
  if (status === 429) return { kind: "cooldown", availableAt: availableAt(data, now) };
  return { kind: "failed", message: body?.error ?? "Refresh could not start.", availableAt: now };
}

/** What to show after polling GET /api/refresh while a run is in progress. */
export function viewAfterPoll(status: number, body: ApiResponse<RefreshStatus> | null, now: number): RefreshView {
  const data = body?.data;
  const run = data?.run;
  if (status !== 200 || !run) {
    return { kind: "failed", message: body?.error ?? "Lost track of the refresh.", availableAt: availableAt(data, now) };
  }
  if (run.status === "running") return { kind: "running", step: run.step };
  if (run.status === "succeeded") return { kind: "done", availableAt: availableAt(data, now) };
  return { kind: "failed", message: failureMessage(run.steps, run.error), availableAt: availableAt(data, now) };
}

export function failureMessage(steps: Record<string, string>, error: string | null): string {
  if (error?.startsWith("schema check failed")) return "The database needs a migration (python -m app.migrate).";
  const failed = Object.entries(steps)
    .filter(([, status]) => status === "failed")
    .map(([name]) => name);
  if (failed.length) return `${failed.join(", ")} failed. The board keeps the last good data.`;
  return "Refresh stopped. The board keeps the last good data.";
}

export function refreshLabel(view: RefreshView, now: number): string {
  switch (view.kind) {
    case "idle":
      return "Refresh";
    case "starting":
      return "Starting…";
    case "running":
      return view.step ? (STEP_COPY[view.step] ?? "Refreshing…") : "Starting…";
    case "done":
      return "Up to date";
    case "cooldown":
      return `Available in ${Math.max(1, Math.ceil((view.availableAt - now) / 60_000))} min`;
    case "failed":
      return "Refresh failed";
  }
}
