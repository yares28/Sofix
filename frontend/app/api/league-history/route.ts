import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE, LEAGUE_WORKFLOW, dispatchRefresh, latestWorkflowRun } from "../../../lib/github";
import { isSameOriginRequest } from "../../../lib/refresh";

// Control's "Read now": starts the League history workflow (every LaLiga player's past games) on GitHub, with the same
// server-side GITHUB_TOKEN as the Refresh button. One run at a time; the workflow itself also queues a second one.
export const dynamic = "force-dynamic";

const reply = (status: number, error: string | null) =>
  NextResponse.json({ success: error === null, data: null, error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return reply(403, "Forbidden.");
  const token = process.env.GITHUB_TOKEN;
  if (!token) return reply(503, "Not configured.");
  try {
    const last = await latestWorkflowRun(token, LEAGUE_WORKFLOW);
    if (last && ACTIVE.has(last.status)) return reply(409, "Already running.");
    return (await dispatchRefresh(token, LEAGUE_WORKFLOW)) ? reply(202, null) : reply(502, "GitHub did not start it.");
  } catch {
    return reply(503, "GitHub is not reachable.");
  }
}
