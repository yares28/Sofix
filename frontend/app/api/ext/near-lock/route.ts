import { NextResponse, type NextRequest } from "next/server";
import { authorised } from "../../../../lib/extAuth";
import { ACTIVE, dispatchRefresh, latestWorkflowRun } from "../../../../lib/github";
import { fetchNextLock, shouldRefreshNearLock } from "../../../../lib/nearLock";

// The extension asks this when a sorare.com tab is open (roadmap 9.8, extension half): same rule as the app's
// /api/refresh?near=1, so a refresh starts in the last three hours before a lock without waiting for GitHub's cron.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  const token = process.env.GITHUB_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: "Refresh is not configured." }, { status: 503 });
  try {
    const now = Date.now();
    const [lock, run] = await Promise.all([fetchNextLock(now), latestWorkflowRun(token)]);
    const lastStart = run ? Date.parse(run.created_at) : null;
    const due = shouldRefreshNearLock(lock, now, lastStart) && !(run && ACTIVE.has(run.status));
    const started = due && (await dispatchRefresh(token));
    return NextResponse.json({ ok: true, started }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Not reachable." }, { status: 503 });
  }
}
