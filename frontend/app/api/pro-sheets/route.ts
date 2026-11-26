import { NextResponse, type NextRequest } from "next/server";
import { readModel } from "../../../lib/db";
import { ACTIVE, PRO_SHEETS_WORKFLOW, dispatchRefresh, latestWorkflowRun } from "../../../lib/github";
import { BEAT_KEY, WATCH_KEY, versionOf, type SheetRun } from "../../../lib/proSheets";
import { isSameOriginRequest } from "../../../lib/refresh";

// The Pro teamsheet watch (plans/pro-page.md, "Teamsheet watch"). GET: two small R2 blocks and GitHub's last run, asked by the Pro
// page at most every 5 minutes while its tab is visible inside a teamsheet window. POST: "Check now", the clock's job by hand.
export const dynamic = "force-dynamic";

const RECENT_MS = 2 * 60_000; // a run this young is still reading the elevens

type Watch = { builtAt: string | null; sheetsAt?: string | null };
type Beat = { checkedAt: string | null };
const reply = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function lastRun(token: string | undefined): Promise<SheetRun> {
  if (!token) return null;
  const run = await latestWorkflowRun(token, PRO_SHEETS_WORKFLOW).catch(() => null);
  return run ? { status: run.status, conclusion: run.conclusion, at: run.created_at } : null;
}

export async function GET(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return reply(403, { error: "Forbidden." });
  const [watch, beat, run] = await Promise.all([readModel<Watch>(WATCH_KEY), readModel<Beat>(BEAT_KEY), lastRun(process.env.GITHUB_TOKEN)]);
  return reply(200, { version: watch ? versionOf(watch.payload) : null, checkedAt: beat?.payload.checkedAt ?? null, run });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return reply(403, { error: "Forbidden." });
  const token = process.env.GITHUB_TOKEN;
  if (!token) return reply(503, { error: "Checking is not configured." });
  const run = await lastRun(token);
  if (run && (ACTIVE.has(run.status) || Date.now() - Date.parse(run.at) < RECENT_MS)) return reply(202, { run });
  try {
    return (await dispatchRefresh(token, PRO_SHEETS_WORKFLOW))
      ? reply(202, { run: { status: "queued", conclusion: null, at: new Date().toISOString() } })
      : reply(502, { error: "GitHub did not start the check." });
  } catch {
    return reply(503, { error: "GitHub is not reachable." });
  }
}
